import json

import pytest

from prislandskap import snapshot as snapshots
from prislandskap.errors import SnapshotError
from prislandskap.scrape import build_snapshot


def test_checked_in_snapshot_is_valid(snapshot):
    snapshots.validate(snapshot)
    assert snapshot["schema"] == 2


def test_rejects_missing_district(snapshot):
    snapshot["areas"] = [a for a in snapshot["areas"] if a["slug"] != "essingen"]
    with pytest.raises(SnapshotError, match="11 stadsdelsområden"):
        snapshots.validate(snapshot)


def test_rejects_missing_city(snapshot):
    snapshot["areas"] = [a for a in snapshot["areas"] if a["slug"] != "stockholm"]
    with pytest.raises(SnapshotError, match="25 kommuner.*Stockholms stad saknas"):
        snapshots.validate(snapshot)


def test_rejects_extra_municipality(snapshot):
    extra = dict(snapshot["areas"][-1], slug="uppsala", name="Uppsala")
    snapshot["areas"].append(extra)
    with pytest.raises(SnapshotError, match="27 kommuner"):
        snapshots.validate(snapshot)


def test_rejects_unknown_district(snapshot):
    for area in snapshot["areas"]:
        if area["slug"] == "essingen":
            area["slug"] = "centrala-stockholm"
    with pytest.raises(SnapshotError, match="okända stadsdelsområden: centrala-stockholm"):
        snapshots.validate(snapshot)


def test_rejects_old_schema(snapshot):
    snapshot["schema"] = 1
    with pytest.raises(SnapshotError, match="schemaversion"):
        snapshots.validate(snapshot)


def test_scraper_rebuilds_checked_in_snapshot_from_html(fixture_html, snapshot):
    """Skrapan ska ge exakt samma ögonblicksbild som den incheckade från samma siffror."""
    built = build_snapshot(fixture_html("county.html"), fixture_html("city.html"))
    assert built == snapshot
    assert snapshots.dumps(built) == snapshots.dumps(snapshot)


def test_scraper_refuses_incomplete_page(fixture_html):
    city = (
        fixture_html("city.html")
        .replace("/stockholm/essingen/", "/stockholm/okand/")
        .replace(">Essingen<", ">Okänd<")
    )
    with pytest.raises(SnapshotError, match="11 stadsdelsområden"):
        build_snapshot(fixture_html("county.html"), city)


def test_save_is_idempotent_and_load_latest(tmp_path, snapshot):
    path, changed = snapshots.save(snapshot, tmp_path)
    assert (path.name, changed) == ("2026-10.json", True)
    assert snapshots.save(snapshot, tmp_path) == (path, False)
    (tmp_path / "2026-09.json").write_text(json.dumps(snapshot))
    (tmp_path / "notes.json").write_text("{}")
    assert [p.name for p in snapshots.list_snapshots(tmp_path)] == ["2026-09.json", "2026-10.json"]
    assert snapshots.load_latest(tmp_path) == snapshot


def test_save_refuses_invalid(tmp_path, snapshot):
    snapshot["areas"] = snapshot["areas"][:5]
    with pytest.raises(SnapshotError):
        snapshots.save(snapshot, tmp_path)
    assert not list(tmp_path.iterdir())


def test_load_latest_without_snapshots(tmp_path):
    with pytest.raises(SnapshotError, match="Ingen ögonblicksbild"):
        snapshots.load_latest(tmp_path)
