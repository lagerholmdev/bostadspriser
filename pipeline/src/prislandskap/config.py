"""Sökvägar, adresser och konstanter. Sökvägarna utgår från repots rot."""

import os
from collections.abc import Iterable
from pathlib import Path

from prislandskap.errors import PipelineError

ROOT_ENV = "PRISLANDSKAP_ROOT"


def is_repo_root(path: Path) -> bool:
    """Repots rot känns igen på att både data/ och web/ finns där."""
    return (path / "data").is_dir() and (path / "web").is_dir()


def find_repo_root(starts: Iterable[Path], env: str | None = None) -> Path:
    """Repots rot: PRISLANDSKAP_ROOT om den är satt, annars första katalog uppåt från någon av
    startpunkterna som innehåller både data/ och web/.

    Fungerar både med redigerbar installation (paketet ligger i repot) och vanlig installation
    (då letar den uppåt från arbetskatalogen).
    """
    if env:
        root = Path(env).expanduser().resolve()
        if not root.is_dir():
            raise PipelineError(f"{ROOT_ENV}={env} är ingen katalog. Sätt den till repots rot.")
        return root
    tried: list[Path] = []
    for start in starts:
        start = start.resolve()
        for candidate in (start, *start.parents):
            if is_repo_root(candidate):
                return candidate
        tried.append(start)
    raise PipelineError(
        "Hittar inte repots rot (en katalog med både data/ och web/). Leta från: "
        + ", ".join(str(t) for t in tried)
        + f". Kör kommandot inifrån repot eller sätt {ROOT_ENV} till repots sökväg."
    )


def _repo_root() -> Path:
    return find_repo_root([Path(__file__).parent, Path.cwd()], os.environ.get(ROOT_ENV))


ROOT = _repo_root()
SNAPSHOT_DIR = ROOT / "data" / "snapshots"
GEO_FILE = ROOT / "data" / "geo" / "areas.geojson"
GENERATED_DIR = ROOT / "web" / "src" / "generated"
OG_DIR = ROOT / "web" / "public" / "og"
CACHE_DIR = ROOT / ".cache"
FONT_DIR = Path(__file__).parent / "assets" / "fonts"
SCALES_FILE = ROOT / "design" / "scales.json"  # färgskalor, delas med web/src/lib/scales.ts

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
