"""Exporten ska följa kontraktet i web/src/lib/types.ts fält för fält."""

import json
import re

import pytest

from prislandskap import export
from prislandskap.errors import PipelineError
from prislandskap.text import swedish_sort_key

AREA_KEYS = {
    "slug", "name", "kind", "label", "neighbours", "bbox", "apartment", "house", "houseScope", "context",
}  # fmt: skip
CONTEXT_KEYS = {"families", "highIncome", "higherEducation", "age25to44", "condos"}
STAT_KEYS = {"sales", "pricePerSqm", "meanPrice", "change"}


def assert_stat(stat: dict) -> None:
    assert STAT_KEYS <= stat.keys() <= STAT_KEYS | {"missing"}
    for key in ("sales", "pricePerSqm", "meanPrice"):
        assert stat[key] is None or type(stat[key]) is int, key
    assert stat["change"] is None or isinstance(stat["change"], (int, float))
    missing = stat.get("missing", {})
    assert set(missing) <= STAT_KEYS
    assert set(missing.values()) <= {"F", "N", "0"}
    for key in STAT_KEYS:
        if key in missing:
            assert stat[key] is None, f"{key} saknas ({missing[key]}) men har ett värde"


def assert_stats_by_period(value: dict) -> None:
    assert set(value) == {"m3", "m12"}
    for stat in value.values():
        assert_stat(stat)


def assert_lon_lat(point: list) -> None:
    assert len(point) == 2 and all(isinstance(v, float) for v in point)
    assert 17 < point[0] < 20 and 58.5 < point[1] < 60.5
    assert all(round(v, 5) == v for v in point)


@pytest.fixture
def dataset(snapshot, features):
    # JSON-rundtur så att typerna är exakt det webben läser
    return json.loads(json.dumps(export.build_dataset(snapshot, features)))


def test_dataset_top_level(dataset):
    assert set(dataset) == {"updated", "periods", "source", "county", "context", "areas"}
    assert dataset["context"] is None  # utan data/scb/kontext.json
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", dataset["updated"])
    assert dataset["periods"] == {"m3": "jul–sep 2026", "m12": "okt 2025–sep 2026"}
    assert set(dataset["source"]) == {"name", "url"} and dataset["source"]["url"].startswith("https://")
    county = dataset["county"]
    assert set(county) == {"name", "apartment", "house"}
    assert_stats_by_period(county["apartment"])
    assert_stats_by_period(county["house"])


def test_every_area_matches_contract(dataset):
    areas = dataset["areas"]
    assert len(areas) == 37
    slugs = {a["slug"] for a in areas}
    assert len(slugs) == 37 and "stockholm" not in slugs
    for area in areas:
        assert set(area) == AREA_KEYS, area["slug"]
        assert isinstance(area["name"], str) and area["name"]
        assert area["kind"] in ("district", "municipality")
        assert_lon_lat(area["label"])
        assert area["neighbours"] and set(area["neighbours"]) <= slugs - {area["slug"]}
        west, south, east, north = area["bbox"]
        assert west < area["label"][0] < east and south < area["label"][1] < north
        assert_lon_lat([west, south])
        assert_lon_lat([east, north])
        assert_stats_by_period(area["apartment"])
        if area["house"] is not None:
            assert_stats_by_period(area["house"])
        assert area["houseScope"] in ("area", "city", None)
        assert (area["house"] is None) == (area["houseScope"] is None)


def test_district_houses_come_from_the_city(dataset, snapshot):
    city_house = next(a for a in snapshot["areas"] if a["slug"] == "stockholm")["house"]
    for area in dataset["areas"]:
        if area["kind"] == "district":
            assert area["houseScope"] == "city"
            assert area["house"] == city_house
        else:
            assert area["houseScope"] == "area"


def test_counts_and_sorting(dataset):
    kinds = [a["kind"] for a in dataset["areas"]]
    assert kinds.count("district") == 12 and kinds.count("municipality") == 25
    names = [a["name"] for a in dataset["areas"]]
    assert names == sorted(names, key=swedish_sort_key)
    assert names[-2:] == ["Östermalm", "Österåker"]


def test_missing_flags_survive(dataset):
    solna = next(a for a in dataset["areas"] if a["slug"] == "solna")
    assert solna["house"]["m3"]["missing"] == {"change": "F"}
    assert solna["house"]["m3"]["pricePerSqm"] == 76057


def test_geometry_file_properties(features):
    for feature in features:
        props = feature["properties"]
        assert set(props) == {"slug", "name", "kind", "label", "neighbours"}
        assert props["kind"] in ("district", "municipality")


def fake_context(features) -> dict:
    values = {"families": 0.3, "highIncome": 0.4, "higherEducation": 0.5, "age25to44": 0.25, "condos": 1000}
    return {
        "schema": 1,
        "fetched": "2026-10-19",
        "source": {"name": "SCB", "url": "https://www.statistikdatabasen.scb.se/"},
        "years": {key: "2025" for key in values},
        "county": values,
        "areas": {f["properties"]["slug"]: dict(values) for f in features},
    }


def test_context_is_carried_per_area(snapshot, features):
    dataset = json.loads(json.dumps(export.build_dataset(snapshot, features, fake_context(features))))
    assert set(dataset["context"]) == {"source", "years", "county"}
    assert set(dataset["context"]["county"]) == CONTEXT_KEYS
    for area in dataset["areas"]:
        assert set(area["context"]) == CONTEXT_KEYS
        assert type(area["context"]["condos"]) is int


def test_context_missing_an_area_is_an_error(snapshot, features):
    context = fake_context(features)
    del context["areas"]["essingen"]
    with pytest.raises(PipelineError, match="SCB-kontexten saknar essingen"):
        export.build_dataset(snapshot, features, context)


def test_geometry_carries_only_slug(features):
    geo = export.build_geometry(features)
    assert geo["type"] == "FeatureCollection"
    for feature in geo["features"]:
        assert feature["properties"].keys() == {"slug"}
        assert feature["geometry"]["type"] in ("Polygon", "MultiPolygon")


def test_coverage_mismatch_is_an_error(snapshot, features):
    with pytest.raises(PipelineError, match="saknar statistik: essingen"):
        snapshot["areas"] = [a for a in snapshot["areas"] if a["slug"] != "essingen"]
        export.build_dataset(snapshot, features)


def test_run_writes_files_idempotently(tmp_path, monkeypatch, snapshot):
    monkeypatch.setattr(export.snapshots, "load_latest", lambda: snapshot)
    monkeypatch.setattr(export, "load_context", lambda: None)
    paths = export.run(out_dir=tmp_path)
    assert sorted(p.name for p in paths) == ["areas.geojson", "areas.json"]
    before = {p: p.stat().st_mtime_ns for p in paths}
    export.run(out_dir=tmp_path)
    assert {p: p.stat().st_mtime_ns for p in paths} == before
