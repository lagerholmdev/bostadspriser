"""Hämtar SCB:s områdesstatistik och skriver data/scb/kontext.json.

Fem tabeller ur Statistikdatabasen (PxWebApi 2.0, CC0), alla på DeSO 2025. Varje mått byggs av
antal, aldrig av andelar eller medianer, så att det går att summera exakt till områdena:

- Hushåll med barn: sammanboende och ensamstående med barn delat med alla hushåll (TAB6568)
- Hög inkomst: andel 20 år och äldre i rikets översta fjärdedel för sammanräknad förvärvsinkomst,
  vägd med antalet personer (TAB6679)
- Eftergymnasial utbildning 3 år eller mer, andel av 25–65 år (TAB6534)
- Andel 25–44 år av hela befolkningen (TAB6574)
- Antal bostadsrätter, nämnaren i omsättningsgraden (TAB6638)

Kommunerna och länet hämtas med sina egna regionkoder där tabellen har dem; stadsdelsområdena är
summan av sina DeSO enligt data/scb/deso.csv. SCB lägger sedan 2025 in ett litet slumpbrus, så
delar summerar inte alltid exakt till totalen.

Körs årsvis i GitHub Actions (.github/workflows/scb.yml). Månadsjobbet anropar aldrig SCB.
"""

from __future__ import annotations

import json
import logging
import time
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

import requests

from prislandskap import deso
from prislandskap.config import CONTEXT_FILE, DESO_FILE, REQUEST_TIMEOUT_S, USER_AGENT, display
from prislandskap.errors import PipelineError
from prislandskap.mapping import DISTRICT_NAMES, MUNICIPALITY_CODES

log = logging.getLogger(__name__)

API = "https://statistikdatabasen.scb.se/api/v2"
SOURCE = {"name": "SCB", "url": "https://www.statistikdatabasen.scb.se/"}
COUNTY_CODE = "01"
COUNTY_KEY = "_lan"  # länet bland områdena under summeringen
DESO_SUFFIX = "_DeSO2025"
CONTEXT_SCHEMA = 1
REQUEST_DELAY_S = 0.5  # SCB tillåter 30 anrop per 10 sekunder
MAX_CELLS = 150_000

Selection = dict[str, list[str]]
Cells = dict[tuple[str, ...], float | None]
# Täljare och nämnare för ett mått i en region, ur tabellens celler för den regionen.
Ratio = Callable[[Callable[..., float | None]], tuple[float, float] | None]


@dataclass(frozen=True)
class Metric:
    key: str
    table: str
    label: str
    select: Selection  # alla variabler utom Region och Tid
    ratio: Ratio
    count: bool = False  # True: summan av täljaren är måttet (ett antal), inte en andel


def _sum(get: Callable[..., float | None], *keys: str) -> float | None:
    values = [get(k) for k in keys]
    return None if any(v is None for v in values) else float(sum(values))  # type: ignore[arg-type]


def _families(get: Callable[..., float | None]) -> tuple[float, float] | None:
    num, den = _sum(get, "SBMB", "ESMB"), get("TOTALT")
    return None if num is None or not den else (num, den)


def _high_income(get: Callable[..., float | None]) -> tuple[float, float] | None:
    share, persons = get("0000089S"), get("0000089O")
    return None if share is None or not persons else (share / 100 * persons, persons)


EDUCATION_LEVELS = ("21", "3+4", "5", "6", "US")


def _education(get: Callable[..., float | None]) -> tuple[float, float] | None:
    num, den = get("6"), _sum(get, *EDUCATION_LEVELS)
    return None if num is None or not den else (num, den)


AGES_25_44 = ("25-29", "30-34", "35-39", "40-44")


def _age(get: Callable[..., float | None]) -> tuple[float, float] | None:
    num, den = _sum(get, *AGES_25_44), get("totalt")
    return None if num is None or not den else (num, den)


def _condos(get: Callable[..., float | None]) -> tuple[float, float] | None:
    n = get("2")
    return None if n is None else (n, 1.0)


METRICS: tuple[Metric, ...] = (
    Metric(
        "families",
        "TAB6568",
        "Hushåll med barn",
        {"Hushallstyp": ["SBMB", "ESMB", "TOTALT"], "ContentsCode": ["000007Y1"]},
        _families,
    ),
    Metric(
        "highIncome",
        "TAB6679",
        "Rikets översta inkomstfjärdedel",
        {
            "InkomstTyp": ["SaFörInk"],
            "Kon": ["1+2"],
            "ContentsCode": ["0000089S", "0000089O"],
        },
        _high_income,
    ),
    Metric(
        "higherEducation",
        "TAB6534",
        "Eftergymnasial utbildning 3 år+",
        {"UtbildningsNiva": list(EDUCATION_LEVELS), "ContentsCode": ["000007Z6"]},
        _education,
    ),
    Metric(
        "age25to44",
        "TAB6574",
        "25–44 år",
        {"Alder": ["totalt", *AGES_25_44], "Kon": ["1+2"], "ContentsCode": ["000007Y7"]},
        _age,
    ),
    Metric(
        "condos",
        "TAB6638",
        "Bostadsrätter",
        {"Upplatelseform": ["2"], "ContentsCode": ["00000864"]},
        _condos,
        count=True,
    ),
)


# ---------- json-stat2 ----------


def parse_jsonstat(doc: dict[str, Any]) -> tuple[list[str], Cells]:
    """json-stat2 -> (variabelordning, {(kod, kod, …): värde}). Prickade värden ('..') blir None."""
    ids: list[str] = doc["id"]
    sizes: list[int] = doc["size"]
    codes: list[list[str]] = []
    for dim in ids:
        index = doc["dimension"][dim]["category"]["index"]
        ordered = sorted(index, key=index.get) if isinstance(index, dict) else list(index)
        codes.append(ordered)
    if [len(c) for c in codes] != sizes:
        raise PipelineError("SCB-svaret har fel storlek på sina variabler")
    values = doc["value"]
    if isinstance(values, dict):  # glest format
        values = [values.get(str(i)) for i in range(_product(sizes))]
    status = doc.get("status") or {}
    if isinstance(status, list):
        status = {str(i): s for i, s in enumerate(status) if s}
    cells: Cells = {}
    for flat, value in enumerate(values):
        key, rest = [], flat
        for dim_codes, size in zip(reversed(codes), reversed(sizes), strict=True):
            key.append(dim_codes[rest % size])
            rest //= size
        missing = value is None or (str(flat) in status and status[str(flat)] in ("..", "."))
        cells[tuple(reversed(key))] = None if missing else float(value)
    return ids, cells


def _product(sizes: Iterable[int]) -> int:
    n = 1
    for s in sizes:
        n *= s
    return n


def cells_by_region(ids: list[str], cells: Cells) -> dict[str, dict[str, float | None]]:
    """Per region: {'kod1|kod2…' för övriga variabler (utom Tid) -> värde}. Tid ska vara ett enda år."""
    region_at, time_at = ids.index("Region"), ids.index("Tid")
    out: dict[str, dict[str, float | None]] = {}
    for key, value in cells.items():
        rest = "|".join(k for i, k in enumerate(key) if i not in (region_at, time_at))
        out.setdefault(key[region_at].removesuffix(DESO_SUFFIX), {})[rest] = value
    return out


def getter(values: dict[str, float | None]) -> Callable[..., float | None]:
    """get('SBMB') hittar cellen vars nyckel innehåller koden (övriga variabler har ett värde var)."""

    def get(code: str) -> float | None:
        hits = [v for k, v in values.items() if code in k.split("|")]
        if len(hits) != 1:
            raise PipelineError(f"Koden {code} ger {len(hits)} celler, väntade en")
        return hits[0]

    return get


# ---------- summering till områden ----------


def region_sources(mapping: dict[str, str], has_own: set[str]) -> dict[str, list[str]]:
    """Område (och länet) -> regionkoder att summera. Kommuner och län med egen kod i tabellen
    hämtas direkt, annars summeras deras DeSO."""
    by_slug: dict[str, list[str]] = {}
    for code, slug in mapping.items():
        by_slug.setdefault(slug, []).append(code)
    sources: dict[str, list[str]] = {slug: sorted(codes) for slug, codes in by_slug.items()}
    for code, slug in MUNICIPALITY_CODES.items():
        if code in has_own:
            sources[slug] = [code]
    sources[COUNTY_KEY] = [COUNTY_CODE] if COUNTY_CODE in has_own else sorted(mapping)
    return sources


def aggregate(
    metric: Metric, regions: dict[str, dict[str, float | None]], sources: dict[str, list[str]]
) -> dict[str, float | int | None]:
    """Område -> måttets värde (andel 0–1 med fyra decimaler, eller heltal för antal). None om någon
    region saknar värde."""
    out: dict[str, float | int | None] = {}
    for slug, codes in sources.items():
        num = den = 0.0
        for code in codes:
            if code not in regions:
                raise PipelineError(f"{metric.table}: region {code} saknas i svaret")
            pair = metric.ratio(getter(regions[code]))
            if pair is None:
                num = den = float("nan")
                break
            num, den = num + pair[0], den + pair[1]
        if num != num or not den:  # nan
            out[slug] = None
        elif metric.count:
            out[slug] = round(num)
        else:
            out[slug] = round(num / den, 4)
    return out


def build_context(
    results: dict[str, tuple[str, dict[str, float | int | None]]], fetched: str
) -> dict[str, Any]:
    """results: måttets nyckel -> (år, {slug|län: värde})."""
    slugs = sorted(set(DISTRICT_NAMES) | set(MUNICIPALITY_CODES.values()))
    areas = {slug: {key: values.get(slug) for key, (_, values) in results.items()} for slug in slugs}
    return {
        "schema": CONTEXT_SCHEMA,
        "fetched": fetched,
        "source": SOURCE,
        "years": {key: year for key, (year, _) in results.items()},
        "county": {key: values[COUNTY_KEY] for key, (_, values) in results.items()},
        "areas": areas,
    }


def validate(context: dict[str, Any]) -> None:
    for slug, values in [("länet", context["county"]), *context["areas"].items()]:
        for key, value in values.items():
            if value is None:
                raise PipelineError(f"{slug}: {key} saknas")
            if key != "condos" and not 0 <= value <= 1:
                raise PipelineError(f"{slug}: {key} = {value} är ingen andel")
    if len(context["areas"]) != len(DISTRICT_NAMES) + len(MUNICIPALITY_CODES):
        raise PipelineError("SCB-kontexten ska ha 37 områden")


# ---------- nätverk ----------


class Client:
    def __init__(self, session: requests.Session | None = None) -> None:
        self.session = session or requests.Session()
        self.session.headers["User-Agent"] = USER_AGENT

    def _call(self, method: str, url: str, **kw: Any) -> dict[str, Any]:
        for attempt in range(4):
            time.sleep(REQUEST_DELAY_S)
            resp = self.session.request(method, url, timeout=REQUEST_TIMEOUT_S * 4, **kw)
            if resp.status_code == 429 and attempt < 3:
                time.sleep(10)
                continue
            if not resp.ok:
                raise PipelineError(f"SCB svarade {resp.status_code} på {url}: {resp.text[:300]}")
            return resp.json()
        raise PipelineError(f"SCB svarar 429 (för många anrop) på {url}")

    def metadata(self, table: str) -> dict[str, Any]:
        log.info("Hämtar metadata för %s", table)
        return self._call(
            "GET", f"{API}/tables/{table}/metadata", params={"lang": "sv", "outputFormat": "json-stat2"}
        )

    def data(self, table: str, selection: Selection) -> dict[str, Any]:
        body = {"selection": [{"variableCode": k, "valueCodes": v} for k, v in selection.items()]}
        log.info("Hämtar %s", table)
        return self._call(
            "POST",
            f"{API}/tables/{table}/data",
            params={"lang": "sv", "outputFormat": "json-stat2"},
            json=body,
        )


def plan(metric: Metric, meta: dict[str, Any], mapping: dict[str, str]) -> tuple[Selection, str, set[str]]:
    """Urvalet för ett mått: senaste året, länets DeSO och de kommun- och länskoder tabellen har."""
    dims = meta["dimension"]
    available = set(dims["Region"]["category"]["index"])
    years = sorted(dims["Tid"]["category"]["index"])
    year = years[-1]
    wanted_own = {COUNTY_CODE, *MUNICIPALITY_CODES}
    own = wanted_own & available
    deso_codes = sorted(code + DESO_SUFFIX for code in mapping)
    if missing := [c for c in deso_codes if c not in available]:
        raise PipelineError(f"{metric.table} saknar {len(missing)} DeSO, t.ex. {missing[0]}")
    for var, codes in metric.select.items():
        index = dims[var]["category"]["index"]
        if absent := [c for c in codes if c not in index]:
            raise PipelineError(f"{metric.table}: {var} saknar {', '.join(absent)}")
    selection: Selection = {"Region": deso_codes + sorted(own), "Tid": [year], **metric.select}
    cells = _product(len(v) for v in selection.values())
    if cells > MAX_CELLS:
        raise PipelineError(f"{metric.table}: {cells} celler är fler än SCB:s gräns {MAX_CELLS}")
    return selection, year, own


def fetch(client: Client, mapping: dict[str, str]) -> dict[str, tuple[str, dict[str, float | int | None]]]:
    results = {}
    for metric in METRICS:
        selection, year, own = plan(metric, client.metadata(metric.table), mapping)
        ids, cells = parse_jsonstat(client.data(metric.table, selection))
        values = aggregate(metric, cells_by_region(ids, cells), region_sources(mapping, own))
        results[metric.key] = (year, values)
        log.info("%s %s: länet %s", metric.label, year, values[COUNTY_KEY])
    return results


def run(out: Path = CONTEXT_FILE, mapping_file: Path = DESO_FILE) -> Path:
    mapping = deso.load(mapping_file)
    context = build_context(fetch(Client(), mapping), date.today().isoformat())
    validate(context)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(context, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    log.info("Skrev %s", display(out))
    return out
