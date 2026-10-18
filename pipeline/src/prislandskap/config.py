"""Sökvägar, adresser och konstanter. Sökvägarna utgår från repots rot."""

import os
from pathlib import Path


def _repo_root() -> Path:
    """Repots rot: PRISLANDSKAP_ROOT om den är satt, annars tre nivåer upp från paketet (src-layout)."""
    if env := os.environ.get("PRISLANDSKAP_ROOT"):
        return Path(env).resolve()
    return Path(__file__).resolve().parents[3]


ROOT = _repo_root()
SNAPSHOT_DIR = ROOT / "data" / "snapshots"
GEO_FILE = ROOT / "data" / "geo" / "areas.geojson"
GENERATED_DIR = ROOT / "web" / "src" / "generated"
OG_DIR = ROOT / "web" / "public" / "og"
CACHE_DIR = ROOT / ".cache"
FONT_DIR = Path(__file__).parent / "assets" / "fonts"

SITE_NAME = "Stockholms prislandskap"

SOURCE_NAME = "Svensk Mäklarstatistik"
COUNTY_URL = "https://www.maklarstatistik.se/omrade/riket/stockholms-lan/"
CITY_URL = COUNTY_URL + "stockholm/"
USER_AGENT = "prislandskap/2 (+https://github.com/lagerholmdev/bostadspriser)"
REQUEST_DELAY_S = 1.0
REQUEST_TIMEOUT_S = 30

COUNTY_SLUG = "stockholms-lan"
COUNTY_NAME = "Stockholms län"
NATION_SLUG = "riket"
CITY_SLUG = "stockholm"
EXPECTED_DISTRICTS = 12
EXPECTED_MUNICIPALITIES = 26  # inklusive Stockholms stad

SNAPSHOT_SCHEMA = 2
COORD_DECIMALS = 5


def display(path: Path) -> str:
    """Sökväg relativt repots rot för loggar, annars absolut."""
    try:
        return str(path.resolve().relative_to(ROOT))
    except ValueError:
        return str(path)
