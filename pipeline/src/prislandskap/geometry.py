"""Bygger om data/geo/areas.geojson: 12 stadsdelsområden i Stockholms stad och 25 kranskommuner.

Källor:
- Stadsdelar: Stockholms stads stadskarta via github.com/krasch/stockholm-stadsdelar (CC0),
  grupperade per mapping.STADSDELAR.
- Kommuner: SCB:s DeSO via github.com/stefur/swemaps-data, sammanslagna per kommun. Gränserna
  följer kommungränserna men inkluderar vatten.

Körs bara när indelningen ändras. Kräver extrat [geo] (geopandas, shapely, pyarrow).
"""

from __future__ import annotations

import json
import logging
import urllib.request
from pathlib import Path
from typing import TYPE_CHECKING, Any

from prislandskap.config import CACHE_DIR, CITY_SLUG, GEO_FILE, display
from prislandskap.errors import PipelineError
from prislandskap.geojson import round_coords
from prislandskap.mapping import DISTRICT_NAMES, stadsdel_lookup
from prislandskap.text import slugify

if TYPE_CHECKING:
    import geopandas as gpd
    from shapely.geometry.base import BaseGeometry

log = logging.getLogger(__name__)

STADSDELAR_URL = (
    "https://raw.githubusercontent.com/krasch/stockholm-stadsdelar/master/"
    "geojson/simplified/stadsdelar_utan_vatten.geo.json"
)
DESO_URL = "https://raw.githubusercontent.com/stefur/swemaps-data/main/files/deso.parquet"
COUNTY_CODE = "01"
CITY_CODE = "0180"
METRIC_CRS = 3006  # SWEREF 99 TM, meter
WGS84 = 4326

GAP_CLOSE_M = 10  # sluter glipor under ~20 m mellan grannstadsdelar
MIN_HOLE_M2 = 40_000  # mindre hål (dammar, glipor) tas bort
SIMPLIFY_M = 25
INSET_M = 15  # krymper varje yta så att grannarnas kanter inte sammanfaller (z-fighting i 3D)
LABEL_TOLERANCE_M = 20
NEIGHBOUR_DISTANCE_M = 1000


def fetch_cached(url: str, cache_dir: Path = CACHE_DIR) -> Path:
    """Ladda ner en gång till .cache/ och återanvänd."""
    path = cache_dir / url.rsplit("/", 1)[-1]
    if not path.exists():
        cache_dir.mkdir(parents=True, exist_ok=True)
        log.info("Laddar ner %s", url)
        tmp = path.with_suffix(path.suffix + ".part")
        urllib.request.urlretrieve(url, tmp)
        tmp.rename(path)
    return path


def assign_districts(names: list[str]) -> list[str]:
    """Stadsdelsnamn -> stadsdelsområdets slug. Kastar fel om någon stadsdel saknas i mappningen."""
    lookup = stadsdel_lookup()
    if unmapped := sorted(set(names) - lookup.keys()):
        raise PipelineError(f"Stadsdelar saknas i mapping.py: {', '.join(unmapped)}")
    return [lookup[n] for n in names]


def drop_small_holes(geom: BaseGeometry, min_area: float = MIN_HOLE_M2) -> BaseGeometry:
    """Behåll bara hål (sjöar, vikar) större än min_area m²."""
    from shapely.geometry import MultiPolygon, Polygon

    def fix(p: Polygon) -> Polygon:
        return Polygon(p.exterior, [r for r in p.interiors if Polygon(r).area >= min_area])

    if geom.geom_type == "Polygon":
        return fix(geom)
    return MultiPolygon([fix(p) for p in geom.geoms])


def label_point(geom: BaseGeometry, tolerance: float = LABEL_TOLERANCE_M) -> BaseGeometry:
    """Polylabel på största delytan: hamnar inuti ytan även för konstiga former."""
    from shapely.ops import polylabel

    parts = getattr(geom, "geoms", [geom])
    return polylabel(max(parts, key=lambda g: g.area), tolerance=tolerance)


def neighbours_within(geoms: list[BaseGeometry], slugs: list[str], distance: float) -> list[list[str]]:
    """Slugs för ytor inom distance meter, i indataordning."""
    return [
        [slugs[j] for j, other in enumerate(geoms) if j != i and geom.distance(other) < distance]
        for i, geom in enumerate(geoms)
    ]


def load_districts(path: Path) -> gpd.GeoDataFrame:
    import geopandas as gpd

    sd = gpd.read_file(path).to_crs(WGS84)
    sd["slug"] = assign_districts(sd["name"].tolist())
    sd = sd.dissolve(by="slug").reset_index()[["slug", "geometry"]].to_crs(METRIC_CRS)
    closed = sd.geometry.buffer(GAP_CLOSE_M, join_style="mitre").buffer(-GAP_CLOSE_M, join_style="mitre")
    sd["geometry"] = closed.map(drop_small_holes)
    sd["name"] = sd["slug"].map(DISTRICT_NAMES)
    sd["kind"] = "district"
    return sd


def load_municipalities(path: Path) -> gpd.GeoDataFrame:
    import geopandas as gpd

    deso = gpd.read_parquet(path)
    deso = deso[(deso["lan_kod"] == COUNTY_CODE) & (deso["kommun_kod"] != CITY_CODE)].to_crs(METRIC_CRS)
    deso["geometry"] = deso.geometry.make_valid().buffer(0)
    km = deso.dissolve(by="kommun_kod", aggfunc="first").reset_index()
    km["geometry"] = km.geometry.buffer(1).buffer(-1)
    km["slug"] = km["kommun"].map(slugify)
    km["name"] = km["kommun"]
    km["kind"] = "municipality"
    return km[["slug", "name", "kind", "geometry"]]


def build(stadsdelar_path: Path, deso_path: Path) -> dict[str, Any]:
    """Hela FeatureCollection med egenskaperna slug, name, kind, label och neighbours."""
    import geopandas as gpd
    import pandas as pd

    areas = gpd.GeoDataFrame(
        pd.concat([load_districts(stadsdelar_path), load_municipalities(deso_path)], ignore_index=True),
        crs=METRIC_CRS,
    )
    if CITY_SLUG in set(areas["slug"]):
        raise PipelineError("Stockholms stad ska inte finnas som egen yta (den består av stadsdelsområdena)")
    areas["geometry"] = areas.geometry.simplify(SIMPLIFY_M, preserve_topology=True).buffer(0)
    areas["geometry"] = areas.geometry.buffer(-INSET_M, join_style="mitre").buffer(0)
    labels = gpd.GeoSeries(areas.geometry.map(label_point), crs=METRIC_CRS).to_crs(WGS84)
    neighbours = neighbours_within(list(areas.geometry), list(areas["slug"]), NEIGHBOUR_DISTANCE_M)
    shapes = areas.to_crs(WGS84).geometry

    features = [
        {
            "type": "Feature",
            "properties": {
                "slug": row.slug,
                "name": row.name,
                "kind": row.kind,
                "label": round_coords([label.x, label.y]),
                "neighbours": near,
            },
            "geometry": _rounded_geometry(shape),
        }
        for row, label, near, shape in zip(areas.itertuples(), labels, neighbours, shapes, strict=True)
    ]
    return {"type": "FeatureCollection", "features": features}


def _rounded_geometry(shape: BaseGeometry) -> dict[str, Any]:
    from shapely.geometry import mapping

    geo = mapping(shape)
    return {"type": geo["type"], "coordinates": round_coords(json.loads(json.dumps(geo["coordinates"])))}


def run(out: Path = GEO_FILE) -> Path:
    try:
        import geopandas  # noqa: F401
    except ImportError as err:
        raise PipelineError('Geometrin kräver geobiblioteken: pip install -e "pipeline[geo]"') from err
    collection = build(fetch_cached(STADSDELAR_URL), fetch_cached(DESO_URL))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(collection, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    log.info(
        "Skrev %s (%d ytor, %.0f kB)", display(out), len(collection["features"]), out.stat().st_size / 1024
    )
    return out
