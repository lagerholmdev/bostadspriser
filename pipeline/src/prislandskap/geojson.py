"""Små hjälpfunktioner för GeoJSON utan geobibliotek, så exporten och bilderna klarar sig med standardbiblioteket."""

import json
from collections.abc import Iterable, Iterator
from pathlib import Path
from typing import Any

from prislandskap.config import COORD_DECIMALS
from prislandskap.errors import PipelineError

Feature = dict[str, Any]
Ring = list[list[float]]
BBox = tuple[float, float, float, float]


def load_features(path: Path) -> list[Feature]:
    if not path.exists():
        raise PipelineError(f"Geometrifilen saknas: {path}. Kör 'python -m prislandskap geometry'.")
    return json.loads(path.read_text(encoding="utf-8"))["features"]


def polygons(geometry: dict[str, Any]) -> list[list[Ring]]:
    """Polygon eller MultiPolygon som en lista av polygoner (yttre ring först, sedan hål)."""
    if geometry["type"] == "Polygon":
        return [geometry["coordinates"]]
    if geometry["type"] == "MultiPolygon":
        return geometry["coordinates"]
    raise ValueError(f"Geometritypen {geometry['type']} stöds inte")


def rings(geometry: dict[str, Any]) -> Iterator[Ring]:
    for polygon in polygons(geometry):
        yield from polygon


def bbox(geometries: Iterable[dict[str, Any]]) -> BBox:
    """[väst, syd, öst, nord] för en eller flera geometrier."""
    xs: list[float] = []
    ys: list[float] = []
    for geometry in geometries:
        for ring in rings(geometry):
            xs.extend(p[0] for p in ring)
            ys.extend(p[1] for p in ring)
    if not xs:
        raise ValueError("Tom geometri")
    return min(xs), min(ys), max(xs), max(ys)


def round_coords(coords: Any, decimals: int = COORD_DECIMALS) -> Any:
    """Avrunda nästlade koordinatlistor."""
    if coords and isinstance(coords[0], (int, float)):
        return [round(c, decimals) for c in coords]
    return [round_coords(c, decimals) for c in coords]


def expand(box: BBox, factor: float) -> BBox:
    """Förstora en ruta kring sin mittpunkt."""
    x0, y0, x1, y1 = box
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    w, h = (x1 - x0) * factor / 2, (y1 - y0) * factor / 2
    return cx - w, cy - h, cx + w, cy + h


def intersects(a: BBox, b: BBox) -> bool:
    return a[0] <= b[2] and b[0] <= a[2] and a[1] <= b[3] and b[1] <= a[3]
