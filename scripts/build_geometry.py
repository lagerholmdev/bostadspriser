"""Bygger site/omraden.geojson: 12 stadsdelsområden i Stockholms stad + 25 kranskommuner.

Källor (båda CC0 / öppna):
- Stadsdelar: Stockholms stads "Stadskarta" via github.com/krasch/stockholm-stadsdelar (CC0)
- Kommuner: SCB:s DeSO-indelning (via github.com/stefur/swemaps-data), sammanslagen per kommun.
  Gränserna följer kommungränserna exakt men inkluderar vattenområden.
"""
import json
import sys
import urllib.request
from pathlib import Path

import geopandas as gpd
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
from stadsdel_mapping import MAPPING  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / ".cache"
STADSDELAR_URL = "https://raw.githubusercontent.com/krasch/stockholm-stadsdelar/master/geojson/simplified/stadsdelar_utan_vatten.geo.json"
DESO_URL = "https://raw.githubusercontent.com/stefur/swemaps-data/main/files/deso.parquet"

STADSDEL_NAMN = {
    "vasastan-norrmalm": "Vasastan-Norrmalm", "ostermalm": "Östermalm", "kungsholmen": "Kungsholmen",
    "essingen": "Essingen", "sodermalm": "Södermalm", "hagersten-liljeholmen": "Hägersten-Liljeholmen",
    "brannkyrka-skarholmen": "Brännkyrka-Skärholmen", "enskede-skarpnack": "Enskede-Skarpnäck",
    "farsta-vantor": "Farsta-Vantör", "spanga-kista": "Spånga-Kista", "hasselby-vallingby": "Hässelby-Vällingby",
    "bromma-vasterled": "Bromma-Västerled",
}


def slugify(name: str) -> str:
    t = name.lower().replace("å", "a").replace("ä", "a").replace("ö", "o").replace(" ", "-")
    return t


def drop_small_holes(geom, min_area=40_000):
    """Behåll bara hål (sjöar, vikar) större än min_area m²."""
    from shapely.geometry import MultiPolygon, Polygon
    def fix(p):
        return Polygon(p.exterior, [r for r in p.interiors if Polygon(r).area >= min_area])
    if geom.geom_type == "Polygon":
        return fix(geom)
    return MultiPolygon([fix(p) for p in geom.geoms])


def fetch(url: str) -> Path:
    CACHE.mkdir(exist_ok=True)
    p = CACHE / url.rsplit("/", 1)[-1]
    if not p.exists():
        urllib.request.urlretrieve(url, p)
    return p


def main() -> None:
    sd = gpd.read_file(fetch(STADSDELAR_URL)).to_crs(4326)
    lookup = {n: slug for slug, names in MAPPING.items() for n in names}
    missing = set(sd["name"]) - set(lookup)
    if missing:
        raise SystemExit(f"Omappade stadsdelar: {sorted(missing)}")
    sd["slug"] = sd["name"].map(lookup)
    sd = sd.dissolve(by="slug").reset_index()[["slug", "geometry"]]
    # Källan har små glipor mellan grannstadsdelar. Slut glipor under ~20 m och ta bort små hål,
    # annars blir de synliga sprickor när ytorna krymps nedan.
    sd = sd.to_crs(3006)
    sd["geometry"] = sd.geometry.buffer(10, join_style="mitre").buffer(-10, join_style="mitre").map(drop_small_holes)
    sd = sd.to_crs(4326)
    sd["namn"] = sd["slug"].map(STADSDEL_NAMN)
    sd["typ"] = "stadsdel"

    deso = gpd.read_parquet(fetch(DESO_URL))
    deso = deso[(deso["lan_kod"] == "01") & (deso["kommun_kod"] != "0180")].to_crs(3006)
    deso["geometry"] = deso.geometry.make_valid().buffer(0)
    km = deso.dissolve(by="kommun_kod", aggfunc="first").reset_index()
    km["geometry"] = km.geometry.buffer(1).buffer(-1)
    km = km.to_crs(4326)
    km["slug"] = km["kommun"].map(slugify)
    km["namn"] = km["kommun"]
    km["typ"] = "kommun"
    km = km[["slug", "namn", "typ", "geometry"]]

    allt = gpd.GeoDataFrame(pd.concat([sd, km], ignore_index=True), crs=4326)
    # Förenkla i meter (SWEREF99 TM) och tillbaka till WGS84
    allt = allt.to_crs(3006)
    allt["geometry"] = allt.geometry.simplify(25, preserve_topology=True).buffer(0)
    # Krymp varje yta 15 m så att grannarnas väggar inte sammanfaller i 3D (annars flimmer, z-fighting)
    allt["geometry"] = allt.geometry.buffer(-15, join_style="mitre").buffer(0)
    # Etikettpunkt: polylabel på största delytan (hamnar inne i ytan även för konstiga former)
    from shapely.ops import polylabel
    def lab(geom):
        parts = getattr(geom, "geoms", [geom])
        big = max(parts, key=lambda g: g.area)
        return polylabel(big, tolerance=20)
    allt["lab"] = gpd.GeoSeries(allt.geometry.map(lab), crs=3006).to_crs(4326).map(lambda p: [round(p.x, 5), round(p.y, 5)])
    allt = allt.to_crs(4326)

    gj = json.loads(allt.to_json(drop_id=True))
    def rnd(c):
        return [rnd(x) for x in c] if isinstance(c[0], list) else [round(c[0], 5), round(c[1], 5)]
    for f in gj["features"]:
        f["geometry"]["coordinates"] = rnd(f["geometry"]["coordinates"])
    out = ROOT / "site" / "omraden.geojson"
    out.write_text(json.dumps(gj, ensure_ascii=False, separators=(",", ":")))
    print(f"{len(gj['features'])} ytor, {out.stat().st_size / 1024:.0f} kB -> {out}")


if __name__ == "__main__":
    main()
