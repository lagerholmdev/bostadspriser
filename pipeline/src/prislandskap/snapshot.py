"""Ögonblicksbilder: en JSON per publiceringsmånad i data/snapshots/ (schema 2, se docs/data.md)."""

import json
from pathlib import Path

from prislandskap.config import (
    CITY_SLUG,
    EXPECTED_DISTRICTS,
    EXPECTED_MUNICIPALITIES,
    SNAPSHOT_DIR,
    SNAPSHOT_SCHEMA,
)
from prislandskap.errors import SnapshotError
from prislandskap.mapping import DISTRICT_NAMES
from prislandskap.models import Snapshot, SnapshotArea


def validate(snapshot: Snapshot) -> None:
    """Kasta SnapshotError om ögonblicksbilden är ofullständig. Skrapan skriver aldrig en sådan."""
    if snapshot.get("schema") != SNAPSHOT_SCHEMA:
        raise SnapshotError(f"Fel schemaversion: {snapshot.get('schema')!r} (väntat {SNAPSHOT_SCHEMA})")
    areas = snapshot["areas"]
    districts = {a["slug"] for a in areas if a["kind"] == "district"}
    municipalities = {a["slug"] for a in areas if a["kind"] == "municipality"}
    problems: list[str] = []
    if len(districts) != EXPECTED_DISTRICTS:
        problems.append(f"{len(districts)} stadsdelsområden (väntat {EXPECTED_DISTRICTS})")
    if unknown := districts - DISTRICT_NAMES.keys():
        problems.append(f"okända stadsdelsområden: {', '.join(sorted(unknown))}")
    if len(municipalities) != EXPECTED_MUNICIPALITIES:
        problems.append(f"{len(municipalities)} kommuner (väntat {EXPECTED_MUNICIPALITIES})")
    if CITY_SLUG not in municipalities:
        problems.append("Stockholms stad saknas bland kommunerna")
    if len(districts) + len(municipalities) != len(areas):
        problems.append("dubbletter eller okänd områdestyp")
    if problems:
        raise SnapshotError("Ögonblicksbilden är ofullständig: " + "; ".join(problems))


def path_for(updated: str, directory: Path = SNAPSHOT_DIR) -> Path:
    """'2026-10-08' -> data/snapshots/2026-10.json"""
    return directory / f"{updated[:7]}.json"


def list_snapshots(directory: Path = SNAPSHOT_DIR) -> list[Path]:
    """Alla ögonblicksbilder, äldst först."""
    return sorted(directory.glob("[0-9][0-9][0-9][0-9]-[0-9][0-9].json"))


def load(path: Path) -> Snapshot:
    snapshot: Snapshot = json.loads(path.read_text(encoding="utf-8"))
    try:
        validate(snapshot)
    except SnapshotError as err:
        raise SnapshotError(f"{path.name}: {err}") from err
    return snapshot


def load_latest(directory: Path = SNAPSHOT_DIR) -> Snapshot:
    paths = list_snapshots(directory)
    if not paths:
        raise SnapshotError(f"Ingen ögonblicksbild i {directory}. Kör 'python -m prislandskap scrape'.")
    return load(paths[-1])


def dumps(snapshot: Snapshot) -> str:
    return json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n"


def save(snapshot: Snapshot, directory: Path = SNAPSHOT_DIR) -> tuple[Path, bool]:
    """Validera och skriv. Returnerar (sökväg, om filen ändrades)."""
    validate(snapshot)
    path = path_for(snapshot["updated"], directory)
    text = dumps(snapshot)
    if path.exists() and path.read_text(encoding="utf-8") == text:
        return path, False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path, True


def area_by_slug(snapshot: Snapshot) -> dict[str, SnapshotArea]:
    return {a["slug"]: a for a in snapshot["areas"]}
