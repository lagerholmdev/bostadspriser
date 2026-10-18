"""Exporterar senaste ögonblicksbilden och geometrin till webbens datakontrakt (web/src/lib/types.ts).

Skriver web/src/generated/areas.json (Dataset) och web/src/generated/areas.geojson (bara `slug`).
"""

import json
import logging
from pathlib import Path
from typing import Any

from prislandskap import snapshot as snapshots
from prislandskap.config import CITY_SLUG, GENERATED_DIR, GEO_FILE, display
from prislandskap.errors import PipelineError
from prislandskap.geojson import Feature, bbox, load_features, round_coords
from prislandskap.models import Area, Dataset, Snapshot, SnapshotArea
from prislandskap.text import period_labels, swedish_sort_key

log = logging.getLogger(__name__)


def build_area(feature: Feature, record: SnapshotArea, city: SnapshotArea) -> Area:
    """Ett område i kontraktet. Stadsdelsområdena får Stockholms stads villastatistik (houseScope 'city')."""
    props = feature["properties"]
    if record["kind"] == "district":
        house, scope = city["house"], "city" if city["house"] else None
    else:
        house, scope = record["house"], "area" if record["house"] else None
    return Area(
        slug=props["slug"],
        name=props["name"],
        kind=props["kind"],
        label=round_coords(props["label"]),
        neighbours=list(props["neighbours"]),
        bbox=round_coords(list(bbox([feature["geometry"]]))),
        apartment=record["apartment"],
        house=house,
        houseScope=scope,
    )


def _check_coverage(features: list[Feature], records: dict[str, SnapshotArea]) -> None:
    geo_slugs = {f["properties"]["slug"] for f in features}
    if CITY_SLUG not in records:
        raise PipelineError("Stockholms stad saknas i ögonblicksbilden (behövs för stadsdelarnas villor)")
    if missing := geo_slugs - records.keys():
        raise PipelineError(f"Områden i geometrin saknar statistik: {', '.join(sorted(missing))}")
    if unmapped := records.keys() - geo_slugs - {CITY_SLUG}:
        raise PipelineError(f"Områden i statistiken saknar geometri: {', '.join(sorted(unmapped))}")
    for feature in features:
        props = feature["properties"]
        if props["kind"] != records[props["slug"]]["kind"]:
            raise PipelineError(f"{props['slug']}: områdestypen skiljer mellan geometri och statistik")


def build_dataset(snap: Snapshot, features: list[Feature]) -> Dataset:
    records = snapshots.area_by_slug(snap)
    _check_coverage(features, records)
    areas = [build_area(f, records[f["properties"]["slug"]], records[CITY_SLUG]) for f in features]
    areas.sort(key=lambda a: swedish_sort_key(a["name"]))
    return Dataset(
        updated=snap["updated"],
        periods=period_labels(snap["updated"]),
        source=snap["source"],
        county=snap["county"],
        areas=areas,
    )


def build_geometry(features: list[Feature]) -> dict[str, Any]:
    """Geometrin för webben: samma ytor, bara `slug` som egenskap."""
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"slug": f["properties"]["slug"]},
                "geometry": {
                    "type": f["geometry"]["type"],
                    "coordinates": round_coords(f["geometry"]["coordinates"]),
                },
            }
            for f in features
        ],
    }


def _write_if_changed(path: Path, text: str) -> bool:
    if path.exists() and path.read_text(encoding="utf-8") == text:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return True


def run(out_dir: Path = GENERATED_DIR, geo_file: Path = GEO_FILE) -> list[Path]:
    snap = snapshots.load_latest()
    features = load_features(geo_file)
    outputs = {
        out_dir / "areas.json": json.dumps(build_dataset(snap, features), ensure_ascii=False, indent=1)
        + "\n",
        out_dir / "areas.geojson": json.dumps(
            build_geometry(features), ensure_ascii=False, separators=(",", ":")
        ),
    }
    for path, text in outputs.items():
        changed = _write_if_changed(path, text)
        log.info("%s %s", "Skrev" if changed else "Oförändrad:", display(path))
    return list(outputs)
