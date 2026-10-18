import json

from PIL import Image

from prislandskap import og, palette
from prislandskap.config import SCALES_FILE
from prislandskap.palette import change_color, hex_rgb, price_color

# Samma fil som web/src/lib/scales.ts importerar
SCALES = json.loads(SCALES_FILE.read_text(encoding="utf-8"))


def test_palette_is_read_from_design_scales_json():
    assert [hex_rgb(c) for c in SCALES["price"]["colors"]] == list(palette.PRICE_COLORS)
    assert list(palette.PRICE_BREAKS) == SCALES["price"]["breaks"]
    assert hex_rgb(SCALES["nodata"]) == palette.NODATA
    assert {k: hex_rgb(SCALES["budget"][k]) for k in ("ok", "near", "no")} == palette.BUDGET_COLORS
    assert SCALES["budget"]["nearMargin"] == og.BUDGET_NEAR
    assert SCALES["change"]["max"] == palette.CHANGE_MAX


def test_price_color_matches_scales_ts():
    """Samma klassning som priceColor(): värdet under gränsen hamnar i klassen under."""
    colors = [hex_rgb(c) for c in SCALES["price"]["colors"]]
    breaks = SCALES["price"]["breaks"]
    assert price_color(None) == hex_rgb(SCALES["nodata"])
    assert price_color(0) == colors[0]
    for i, limit in enumerate(breaks):
        assert price_color(limit - 1) == colors[i]
        assert price_color(limit) == colors[i + 1]
    assert price_color(10**7) == colors[-1]


def test_change_color_matches_scales_ts():
    change = SCALES["change"]
    assert change_color(None) == hex_rgb(SCALES["nodata"])
    assert change_color(0) == hex_rgb(change["flat"])
    assert change_color(change["max"]) == hex_rgb(change["up"])
    assert change_color(-change["max"]) == hex_rgb(change["down"])
    assert change_color(10) == change_color(25)
    # Halvor avrundas uppåt som Math.round i scales.ts
    assert palette.mix((0, 0, 0), (1, 3, 5), 0.5) == (1, 2, 3)


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


def _feature(features, slug):
    return next(f for f in features if f["properties"]["slug"] == slug)


def test_thin_areas_get_a_note(snapshot, features):
    nykvarn = og.area_card(snapshot, _feature(features, "nykvarn"), features)
    assert nykvarn.note == "Få affärer, osäkert värde"  # 26 sålda bostadsrätter
    assert og.area_card(snapshot, _feature(features, "sodermalm"), features).note is None


def test_remote_areas_get_a_wider_map_with_context(snapshot, features):
    feature = _feature(features, "nykvarn")
    card = og.area_card(snapshot, feature, features)
    narrow = og.area_box(feature)
    assert card.box[3] - card.box[1] >= og.REMOTE_SPAN_DEG
    assert card.box[3] - card.box[1] > narrow[3] - narrow[1]
    assert len(card.labels) >= og.CONTEXT_AREAS
    for slug in card.labels:
        lon, lat = _feature(features, slug)["properties"]["label"]
        assert card.box[0] <= lon <= card.box[2] and card.box[1] <= lat <= card.box[3]
    # Områden med många grannar behåller det vanliga utsnittet
    vaxholm = _feature(features, "vaxholm")
    assert og.area_card(snapshot, vaxholm, features).box == og.area_box(vaxholm)


def test_logo_uses_price_colours_and_accent():
    assert [color for _, color in og.LOGO_GABLES] == [palette.PRICE_COLORS[i] for i in (2, 4, 5)]
    assert hex_rgb("#1f6f5c") == palette.ACCENT


def test_all_text_uses_bundled_familjen_grotesk():
    for weight in (400, 600, 700):
        f = og.font(weight, 14)
        assert f.getname()[0] == "Familjen Grotesk"
        assert str(og.FONT_DIR) in f.path


def test_forandring_uses_five_steps_like_the_map(snapshot, features):
    card = og.overview_cards(snapshot, features)["forandring"]
    assert [label for _, label in card.legend.swatches] == ["−4", "−1", "+1", "+4", ""]
    assert len(set(card.fills.values()) - {palette.NODATA}) <= 5
