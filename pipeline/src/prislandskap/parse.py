"""Tolkning av Mäklarstatistiks områdessidor. Rena funktioner utan nätverk.

En statistiktabell har en rad per område: namn (länk till /omrade/…) följt av fyra värden för
de senaste 3 månaderna och fyra för de senaste 12: antal sålda, kr/kvm, medelpris och
prisutveckling i procent.
"""

import re
from dataclasses import dataclass

from bs4 import BeautifulSoup, Tag

from prislandskap.errors import ParseError
from prislandskap.models import MissingReason, Stat, StatsByPeriod
from prislandskap.text import month_number, slugify

FIELDS = ("sales", "pricePerSqm", "meanPrice", "change")
CELLS_PER_ROW = 1 + 2 * len(FIELDS)
_AREA_LINK = re.compile(r"/omrade/")
_UPDATED = re.compile(r"Uppdaterat:\s*(\d{1,2})\s+([A-Za-zÅÄÖåäö]+)\s+(\d{4})")
_MISSING_MARKERS: dict[str, MissingReason] = {"F": "F", "N": "N", "": "0", "-": "0", "–": "0"}
_SPACES = re.compile(r"[\s   ]+")


@dataclass(frozen=True)
class Row:
    """En tabellrad: områdets namn och statistik för båda perioderna."""

    name: str
    slug: str
    stats: StatsByPeriod


def parse_number(text: str) -> float | MissingReason:
    """'64 714' -> 64714.0, '+0.1' -> 0.1, '±0.0' -> 0.0, '−1,6' -> -1.6. 'F'/'N' och tomt -> orsakskod."""
    s = _SPACES.sub("", text)
    if s in _MISSING_MARKERS:
        return _MISSING_MARKERS[s]
    s = s.replace("±", "").replace("−", "-").replace(",", ".")
    try:
        return float(s)
    except ValueError as err:
        raise ParseError(f"Kan inte tolka värdet {text!r} som ett tal") from err


def parse_stat(cells: list[str]) -> Stat:
    """Fyra celler -> Stat. Kr/kvm och medelpris 0 betyder att data saknas (orsak '0')."""
    if len(cells) != len(FIELDS):
        raise ParseError(f"Väntade {len(FIELDS)} värden per period, fick {len(cells)}")
    values: dict[str, float | None] = {}
    missing: dict[str, MissingReason] = {}
    for field, cell in zip(FIELDS, cells, strict=True):
        value = parse_number(cell)
        if isinstance(value, str):
            missing[field], values[field] = value, None
        elif field in ("pricePerSqm", "meanPrice") and value == 0:
            missing[field], values[field] = "0", None
        else:
            values[field] = value
    stat = Stat(
        sales=_as_int(values["sales"]),
        pricePerSqm=_as_int(values["pricePerSqm"]),
        meanPrice=_as_int(values["meanPrice"]),
        change=None if values["change"] is None else round(values["change"], 1),
    )
    if missing:
        stat["missing"] = missing
    return stat


def _as_int(value: float | None) -> int | None:
    return None if value is None else round(value)


def parse_row(cells: list[str]) -> Row:
    """Nio celler: namn, fyra värden för 3 månader, fyra för 12 månader."""
    if len(cells) < CELLS_PER_ROW:
        raise ParseError(f"Raden har {len(cells)} celler, väntade {CELLS_PER_ROW}: {cells!r}")
    name = _SPACES.sub(" ", cells[0]).strip()
    return Row(
        name=name,
        slug=slugify(name),
        stats={"m3": parse_stat(cells[1:5]), "m12": parse_stat(cells[5:9])},
    )


def _is_area_row(cells: list[Tag]) -> bool:
    return len(cells) >= CELLS_PER_ROW and cells[0].find("a", href=_AREA_LINK) is not None


def parse_tables(html: str) -> list[dict[str, Row]]:
    """Alla statistiktabeller i sidordning, som {slug: Row}. Tabeller utan områdesrader hoppas över."""
    soup = BeautifulSoup(html, "html.parser")
    tables: list[dict[str, Row]] = []
    for table in soup.find_all("table"):
        rows: dict[str, Row] = {}
        for tr in table.find_all("tr"):
            cells = tr.find_all(["td", "th"])
            if _is_area_row(cells):
                row = parse_row([c.get_text(" ", strip=True) for c in cells[:CELLS_PER_ROW]])
                rows[row.slug] = row
        if rows:
            tables.append(rows)
    return tables


def parse_updated(html: str) -> str:
    """'Uppdaterat: 08 oktober 2026' -> '2026-10-08'."""
    text = BeautifulSoup(html, "html.parser").get_text(" ")
    match = _UPDATED.search(text)
    if not match:
        raise ParseError("Hittade inget uppdateringsdatum ('Uppdaterat: …') på sidan")
    day, month, year = match.groups()
    try:
        return f"{year}-{month_number(month):02d}-{int(day):02d}"
    except ValueError as err:
        raise ParseError(str(err)) from err
