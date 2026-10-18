"""Hämtar aktuell statistik från Svensk Mäklarstatistiks publika områdessidor.

Två sidor räcker:
- Stockholms län: en tabell per bostadstyp med alla 26 kommuner (bostadsrätter först, sedan villor)
- Stockholms stad: bostadsrättstabell med de 12 stadsdelsområdena

Statistiken får citeras med källhänvisning till Svensk Mäklarstatistik.
"""

import logging
import time
from pathlib import Path

import requests

from prislandskap import snapshot as snapshots
from prislandskap.config import (
    CITY_URL,
    COUNTY_NAME,
    COUNTY_SLUG,
    COUNTY_URL,
    NATION_SLUG,
    REQUEST_DELAY_S,
    REQUEST_TIMEOUT_S,
    SNAPSHOT_DIR,
    SNAPSHOT_SCHEMA,
    SOURCE_NAME,
    USER_AGENT,
)
from prislandskap.errors import ParseError, PipelineError
from prislandskap.mapping import DISTRICT_NAMES
from prislandskap.models import Snapshot, SnapshotArea
from prislandskap.parse import Row, parse_tables, parse_updated

log = logging.getLogger(__name__)


def fetch(url: str, session: requests.Session) -> str:
    log.info("Hämtar %s", url)
    try:
        response = session.get(url, headers={"User-Agent": USER_AGENT}, timeout=REQUEST_TIMEOUT_S)
        response.raise_for_status()
    except requests.RequestException as err:
        raise PipelineError(f"Kunde inte hämta {url}: {err}") from err
    return response.text


def _county_row(table: dict[str, Row], label: str) -> Row:
    if COUNTY_SLUG not in table:
        raise ParseError(f"Raden för {COUNTY_NAME} saknas i tabellen för {label}")
    return table[COUNTY_SLUG]


def build_snapshot(county_html: str, city_html: str) -> Snapshot:
    """Bygg och validera en ögonblicksbild från länets och stadens sidor."""
    county_tables, city_tables = parse_tables(county_html), parse_tables(city_html)
    if len(county_tables) < 2 or not city_tables:
        raise ParseError(
            f"Oväntad sidstruktur: {len(county_tables)} tabeller på länssidan (väntat minst 2), "
            f"{len(city_tables)} på stadens sida (väntat minst 1)"
        )
    apartments, houses, city = county_tables[0], county_tables[1], city_tables[0]

    areas: list[SnapshotArea] = [
        SnapshotArea(slug=slug, name=row.name, kind="district", apartment=row.stats, house=None)
        for slug, row in city.items()
        if slug in DISTRICT_NAMES
    ]
    areas += [
        SnapshotArea(
            slug=slug,
            name=row.name,
            kind="municipality",
            apartment=row.stats,
            house=houses[slug].stats if slug in houses else None,
        )
        for slug, row in apartments.items()
        if slug not in (NATION_SLUG, COUNTY_SLUG)
    ]
    snap = Snapshot(
        schema=SNAPSHOT_SCHEMA,
        updated=parse_updated(county_html),
        source={"name": SOURCE_NAME, "url": COUNTY_URL},
        county={
            "name": COUNTY_NAME,
            "apartment": _county_row(apartments, "bostadsrätter").stats,
            "house": _county_row(houses, "villor").stats,
        },
        areas=areas,
    )
    snapshots.validate(snap)
    return snap


def run(directory: Path = SNAPSHOT_DIR) -> Path:
    """Hämta båda sidorna, bygg ögonblicksbilden och skriv den. Skriver inget om något saknas."""
    with requests.Session() as session:
        county_html = fetch(COUNTY_URL, session)
        time.sleep(REQUEST_DELAY_S)
        city_html = fetch(CITY_URL, session)
    snap = build_snapshot(county_html, city_html)
    path, changed = snapshots.save(snap, directory)
    state = "skrev" if changed else "oförändrad"
    log.info("%s: %s (%d områden, uppdaterad %s)", path.name, state, len(snap["areas"]), snap["updated"])
    return path
