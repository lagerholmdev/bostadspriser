"""Bygger data/scb/deso.csv: varje DeSO (2025) i länet och det område den räknas till.

Kommunerna följer av DeSO-koden, som börjar med kommunkoden. I Stockholms stad läggs DeSO-ytorna
över stadsdelsområdena (stadens stadsdelar grupperade som i geometry.py) och varje DeSO går helt till
det område den överlappar mest. Andelen räknas mot DeSO-ytans överlapp med land, eftersom
stadsdelarna saknar vatten och DeSO-ytorna inte gör det.

Körs när SCB reviderar DeSO, och i det årliga SCB-jobbet. Kräver extrat [geo].
"""

from __future__ import annotations

import csv
import io
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

from prislandskap.config import CACHE_DIR, DESO_FILE, display
from prislandskap.errors import PipelineError
from prislandskap.mapping import DISTRICT_NAMES, MUNICIPALITY_CODES

if TYPE_CHECKING:
    import geopandas as gpd

log = logging.getLogger(__name__)

CITY_CODE = "0180"
DESO_VERSION = "DeSO_2025"
DESO_WFS_URL = (
    "https://geodata.scb.se/geoserver/stat/wfs?service=WFS&version=1.1.0&request=GetFeature"
    f"&typeName=stat:{DESO_VERSION}&outputFormat=application/json&CQL_FILTER=lanskod=%2701%27"
)
DESO_CACHE_NAME = "deso2025_01.geojson"
# Så stor del av en DeSO:s landyta måste ligga i ett område för att räknas som ren. Lägre andelar är
# tillåtna men få: 2025 års indelning har 567 av 569 DeSO över gränsen.
CLEAN_SHARE = 0.9
MIN_CLEAN_RATIO = 0.98
FIELDS = ("deso", "slug", "andel")


@dataclass(frozen=True)
class Assignment:
    deso: str
    slug: str
    share: float  # andel av DeSO-ytans landyta som ligger i området; 1 för kommunerna


def municipality_slug(deso: str) -> str | None:
    """'0114C1010' -> 'upplands-vasby'. None för Stockholms stad och koder utanför länet."""
    return MUNICIPALITY_CODES.get(deso[:4])


def assign_city(deso: gpd.GeoDataFrame, districts: gpd.GeoDataFrame) -> list[Assignment]:
    """Varje DeSO i Stockholms stad till stadsdelsområdet med störst överlapp, i samma metriska CRS."""
    import geopandas as gpd

    parts = gpd.overlay(deso[["deso", "geometry"]], districts[["slug", "geometry"]], keep_geom_type=True)
    parts["area"] = parts.geometry.area
    land = parts.groupby("deso")["area"].sum()
    best = parts.sort_values(["area", "slug"]).groupby("deso").tail(1).set_index("deso")
    if missing := sorted(set(deso["deso"]) - set(best.index)):
        raise PipelineError(f"DeSO utan överlapp med något stadsdelsområde: {', '.join(missing)}")
    return [
        Assignment(code, best.at[code, "slug"], round(float(best.at[code, "area"] / land[code]), 3))
        for code in sorted(best.index)
    ]


def check(assignments: list[Assignment]) -> None:
    city = [a for a in assignments if a.deso.startswith(CITY_CODE)]
    slugs = {a.slug for a in assignments}
    expected = set(DISTRICT_NAMES) | set(MUNICIPALITY_CODES.values())
    if missing := expected - slugs:
        raise PipelineError(f"Områden utan någon DeSO: {', '.join(sorted(missing))}")
    if unknown := slugs - expected:
        raise PipelineError(f"Okända områden i DeSO-mappningen: {', '.join(sorted(unknown))}")
    clean = sum(a.share >= CLEAN_SHARE for a in city) / len(city)
    if clean < MIN_CLEAN_RATIO:
        raise PipelineError(
            f"Bara {clean * 100:.0f} % av stadens DeSO ligger till minst {CLEAN_SHARE * 100:.0f} % "
            "i ett område. Har SCB eller staden ändrat indelningen?"
        )


def dumps(assignments: list[Assignment]) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerow(FIELDS)
    for a in sorted(assignments, key=lambda a: a.deso):
        writer.writerow((a.deso, a.slug, f"{a.share:.3f}"))
    return buf.getvalue()


def load(path: Path = DESO_FILE) -> dict[str, str]:
    """DeSO-kod -> områdets slug."""
    if not path.exists():
        raise PipelineError(f"{display(path)} saknas. Kör: python -m prislandskap deso")
    with path.open(encoding="utf-8") as f:
        return {row["deso"]: row["slug"] for row in csv.DictReader(f)}


def load_deso(path: Path) -> gpd.GeoDataFrame:
    import geopandas as gpd

    from prislandskap.geometry import METRIC_CRS

    gdf = gpd.read_file(path)
    if gdf.crs is None:
        gdf = gdf.set_crs(METRIC_CRS)
    gdf = gdf.rename(columns={"desokod": "deso"}).to_crs(METRIC_CRS)
    gdf["geometry"] = gdf.geometry.make_valid()
    return gdf[gdf["deso"].str.startswith("01")][["deso", "geometry"]]


def build(deso_path: Path, stadsdelar_path: Path) -> list[Assignment]:
    from prislandskap.geometry import load_districts

    deso = load_deso(deso_path)
    city = deso[deso["deso"].str.startswith(CITY_CODE)]
    assignments = assign_city(city, load_districts(stadsdelar_path))
    for code in sorted(deso["deso"]):
        if slug := municipality_slug(code):
            assignments.append(Assignment(code, slug, 1.0))
    check(assignments)
    return assignments


def run(out: Path = DESO_FILE, cache_dir: Path = CACHE_DIR) -> Path:
    try:
        import geopandas  # noqa: F401
    except ImportError as err:
        raise PipelineError('DeSO-mappningen kräver geobiblioteken: pip install -e "pipeline[geo]"') from err
    from prislandskap.geometry import STADSDELAR_URL, fetch_cached

    deso_path = cache_dir / DESO_CACHE_NAME
    if not deso_path.exists():
        cache_dir.mkdir(parents=True, exist_ok=True)
        import urllib.request

        log.info("Laddar ner DeSO 2025 för Stockholms län från SCB")
        urllib.request.urlretrieve(DESO_WFS_URL, deso_path)
    assignments = build(deso_path, fetch_cached(STADSDELAR_URL, cache_dir))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(dumps(assignments), encoding="utf-8")
    city = [a for a in assignments if a.deso.startswith(CITY_CODE)]
    log.info(
        "Skrev %s: %d DeSO, varav %d i Stockholms stad (%d under %.0f %% i ett område)",
        display(out),
        len(assignments),
        len(city),
        sum(a.share < CLEAN_SHARE for a in city),
        CLEAN_SHARE * 100,
    )
    return out
