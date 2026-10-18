from PIL import Image

from prislandskap import og
from prislandskap.palette import NODATA, PRICE_COLORS, change_color, price_color


def test_price_color_matches_scales_ts():
    assert price_color(None) == NODATA
    assert price_color(34_999) == PRICE_COLORS[0]
    assert price_color(35_000) == PRICE_COLORS[1]
    assert price_color(109_999) == PRICE_COLORS[4]
    assert price_color(135_782) == PRICE_COLORS[5]


def test_change_color_saturates():
    assert change_color(10) == change_color(25)
    assert change_color(0) == (0xE7, 0xE8, 0xE3)


def test_formatting():
    assert og.fmt_int(116680) == "116 680"
    assert og.fmt_change(-1.6) == "−1,6 %"
    assert og.fmt_change(0) == "±0,0 %"
    assert og.fmt_relative(116680, 70849) == ("65 % över", " länets snitt")
    assert og.fmt_relative(70900, 70849)[0] == "I nivå med"


def test_renders_area_card(snapshot, features):
    feature = next(f for f in features if f["properties"]["slug"] == "hagersten-liljeholmen")
    card = og.area_card(snapshot, feature)
    assert card.big == "80 252"
    assert card.highlight == "hagersten-liljeholmen"
    img = og.render(card, features)
    assert img.size == (1200, 630) and img.mode == "P"


def test_run_writes_all_images(tmp_path, monkeypatch, snapshot):
    monkeypatch.setattr(og.snapshots, "load_latest", lambda: snapshot)
    paths = og.run(out_dir=tmp_path)
    names = {p.stem for p in paths}
    assert {"start", "pris", "budget", "forandring", "sodermalm", "norrtalje"} <= names
    assert len(names) == 4 + 37
    with Image.open(tmp_path / "start.png") as img:
        assert img.size == (1200, 630)
    assert all(p.stat().st_size < 120_000 for p in paths)
