"""Delningsbilder 1200×630 till web/public/og/: start, en per område och en per vy (pris, budget, förändring).

Ljus layout enligt docs/design.md: textkolumn till vänster, platt karta till höger. Ritas i dubbel
upplösning, skalas ner och kvantiseras till en liten palett så att filerna blir små.
"""

import io
import logging
import math
from collections.abc import Callable, Sequence
from dataclasses import dataclass, field
from functools import cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

from prislandskap import snapshot as snapshots
from prislandskap.config import CITY_SLUG, FONT_DIR, GEO_FILE, OG_DIR, SITE_NAME, SOURCE_NAME, display
from prislandskap.geojson import BBox, Feature, bbox, expand, intersects, load_features, polygons
from prislandskap.models import MissingReason, Period, Snapshot, Stat
from prislandskap.palette import (
    ACCENT,
    BUDGET_COLORS,
    INK,
    INK_2,
    INK_3,
    LINE,
    NODATA,
    PAGE,
    PRICE_BREAKS,
    PRICE_COLORS,
    SURFACE,
    Color,
    change_color,
    price_color,
)
from prislandskap.text import period_labels

log = logging.getLogger(__name__)

W, H, S = 1200, 630, 2  # S: översampling
TEXT_X = 64
TEXT_W = 500
MAP_X = 620  # kartpanelens vänsterkant
BORDER_PX = 1.5
OUTLINE_PX = 4
MIN_SPAN_DEG = 0.07  # ungefär 8 km: små områden som Essingen visas med sina grannar

BUDGET = 5_000_000  # samma standardvärden som web/src/lib/budget.ts
BUDGET_SQM = 60
BUDGET_NEAR = 0.1

MISSING_TEXT: dict[MissingReason, str] = {
    "F": "För få affärer för ett snittpris",
    "N": "Snittpriset är inte representativt",
    "0": "Inga affärer under perioden",
}


# ---------- formatering ----------

NBSP = " "


def fmt_int(v: float) -> str:
    """116680 -> '116 680' (hårt mellanslag)."""
    return f"{round(v):,}".replace(",", NBSP)


def fmt_change(v: float) -> str:
    """6.5 -> '+6,5 %', -1.6 -> '−1,6 %', 0 -> '±0,0 %'."""
    sign = "+" if v > 0 else "−" if v < 0 else "±"
    return f"{sign}{abs(v):.1f}".replace(".", ",") + f"{NBSP}%"


def fmt_relative(value: float, reference: float) -> tuple[str, str]:
    """(fet del, resten): ('65 % över', ' länets snitt') eller ('I nivå med', ' länets snitt')."""
    pct = round(abs(value / reference - 1) * 100)
    if pct == 0:
        return "I nivå med", " länets snitt"
    return f"{pct}{NBSP}% {'över' if value > reference else 'under'}", " länets snitt"


# ---------- kort ----------

Segment = tuple[str, int]  # (text, vikt)


@dataclass
class Legend:
    """Färgrutor med etiketter. Klassgränser står vid rutans högerkant, värden (centered) mitt under."""

    swatches: list[tuple[Color, str]]
    caption: str
    centered: bool = False


@dataclass
class Card:
    """Allt som skiljer bilderna åt. Ritas av render()."""

    eyebrow: str
    title: str
    big: str
    unit: str
    lines: list[list[Segment]]
    fills: dict[str, Color]
    box: BBox
    legend: Legend
    highlight: str | None = None
    labels: list[str] = field(default_factory=list)


# ---------- ritning ----------


@cache
def font(weight: int, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FONT_DIR / f"FamiljenGrotesk-{weight}.ttf"), size * S)


class Projection:
    """Ekvirektangulär projektion skalad med cos(lat), centrerad i en pixelruta (i 1x-enheter)."""

    def __init__(self, box: BBox, rect: tuple[float, float, float, float]) -> None:
        x0, y0, x1, y1 = box
        rx0, ry0, rx1, ry1 = rect
        self.k = math.cos(math.radians((y0 + y1) / 2))
        self.scale = min((rx1 - rx0) / ((x1 - x0) * self.k), (ry1 - ry0) / (y1 - y0))
        self.cx, self.cy = (x0 + x1) / 2, (y0 + y1) / 2
        self.px, self.py = (rx0 + rx1) / 2, (ry0 + ry1) / 2

    def __call__(self, lon: float, lat: float) -> tuple[float, float]:
        x = self.px + (lon - self.cx) * self.k * self.scale
        y = self.py - (lat - self.cy) * self.scale
        return x * S, y * S


class Canvas:
    """Rityta i dubbel upplösning med koordinater i 1x-pixlar."""

    def __init__(self) -> None:
        self.img = Image.new("RGB", (W * S, H * S), PAGE)
        self.draw = ImageDraw.Draw(self.img)

    def text(
        self, xy: tuple[float, float], s: str, weight: int, size: int, fill: Color, anchor: str = "ls"
    ) -> float:
        """Rita text med baslinjen i y och returnera bredden i 1x-pixlar."""
        f = font(weight, size)
        self.draw.text((xy[0] * S, xy[1] * S), s, font=f, fill=fill, anchor=anchor)
        return self.draw.textlength(s, font=f) / S

    def width(self, s: str, weight: int, size: int) -> float:
        return self.draw.textlength(s, font=font(weight, size)) / S

    def segments(self, xy: tuple[float, float], parts: Sequence[Segment], size: int, fill: Color) -> None:
        x, y = xy
        for s, weight in parts:
            x += self.text((x, y), s, weight, size, fill)

    def fill_polygon(self, rings: list[list[tuple[float, float]]], color: Color) -> None:
        """Fyll en polygon med hål via en mask, så att hålen inte målar över annat."""
        xs = [p[0] for p in rings[0]]
        ys = [p[1] for p in rings[0]]
        x0, y0 = max(0, int(min(xs)) - 1), max(0, int(min(ys)) - 1)
        x1, y1 = min(W * S, int(max(xs)) + 2), min(H * S, int(max(ys)) + 2)
        if x1 <= x0 or y1 <= y0:
            return
        mask = Image.new("L", (x1 - x0, y1 - y0), 0)
        md = ImageDraw.Draw(mask)
        for i, ring in enumerate(rings):
            md.polygon([(x - x0, y - y0) for x, y in ring], fill=0 if i else 255)
        self.img.paste(color, (x0, y0, x1, y1), mask)

    def outline(self, ring: list[tuple[float, float]], color: Color, width_px: float) -> None:
        self.draw.line([*ring, ring[0]], fill=color, width=max(1, round(width_px * S)), joint="curve")

    def result(self, key_colors: Sequence[Color], colors: int = 96) -> Image.Image:
        """Skala ner och kvantisera. Nyckelfärgerna läggs först i paletten så att ytorna blir exakta."""
        small = self.img.resize((W, H), Image.Resampling.LANCZOS)
        keys = list(dict.fromkeys(key_colors))
        adaptive = small.quantize(colors=colors - len(keys), method=Image.Quantize.MEDIANCUT)
        extra = adaptive.getpalette()[: 3 * (colors - len(keys))]
        palette = Image.new("P", (1, 1))
        palette.putpalette([v for color in keys for v in color] + extra)
        return small.quantize(palette=palette, dither=Image.Dither.NONE)


def _project(feature: Feature, proj: Projection) -> list[list[list[tuple[float, float]]]]:
    return [[[proj(x, y) for x, y in ring] for ring in poly] for poly in polygons(feature["geometry"])]


def draw_map(c: Canvas, card: Card, features: list[Feature]) -> None:
    rect = (MAP_X, 0, W, H)
    c.draw.rectangle([MAP_X * S, 0, W * S, H * S], fill=SURFACE)
    proj = Projection(card.box, rect)
    visible = [f for f in features if intersects(bbox([f["geometry"]]), card.box)]
    shapes = {f["properties"]["slug"]: _project(f, proj) for f in visible}
    for slug, polys in shapes.items():
        for poly in polys:
            c.fill_polygon(poly, card.fills.get(slug, NODATA))
    for polys in shapes.values():
        for poly in polys:
            for ring in poly:
                c.outline(ring, SURFACE, BORDER_PX)
    if card.highlight in shapes:
        for poly in shapes[card.highlight]:
            c.outline(poly[0], SURFACE, OUTLINE_PX + 3)
        for poly in shapes[card.highlight]:
            c.outline(poly[0], ACCENT, OUTLINE_PX)
    draw_labels(c, card, visible, proj)
    # Textkolumnen täcker allt som ritats till vänster om panelen
    c.draw.rectangle([0, 0, MAP_X * S - 1, H * S], fill=PAGE)
    c.draw.line([(MAP_X * S, 0), (MAP_X * S, H * S)], fill=LINE, width=S)


def draw_labels(c: Canvas, card: Card, features: list[Feature], proj: Projection) -> None:
    """Namn på grannområden, med vit kant. Hoppar över etiketter som krockar eller hamnar utanför."""
    taken: list[tuple[float, float, float, float]] = []
    f = font(600, 15)
    by_slug = {feat["properties"]["slug"]: feat for feat in features}
    for slug in card.labels:
        if slug not in by_slug:
            continue
        props = by_slug[slug]["properties"]
        x, y = proj(*props["label"])
        box = c.draw.textbbox((x, y), props["name"], font=f, anchor="mm", stroke_width=3 * S)
        inside = (
            box[0] > (MAP_X + 12) * S and box[2] < (W - 12) * S and box[1] > 12 * S and box[3] < (H - 70) * S
        )
        if not inside or any(_overlaps(box, t) for t in taken):
            continue
        taken.append(box)
        c.draw.text(
            (x, y), props["name"], font=f, fill=INK, anchor="mm", stroke_width=3 * S, stroke_fill=SURFACE
        )


def _overlaps(a: tuple[float, ...], b: tuple[float, ...]) -> bool:
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


def draw_legend(c: Canvas, legend: Legend) -> None:
    """Färgrutor med text längst ner i kartpanelen, på vit platta."""
    sw, gap, pad = 34, 2, 14
    n = len(legend.swatches)
    inner = max(n * sw + (n - 1) * gap, c.width(legend.caption, 400, 14))
    x0, y1 = W - 24 - inner - 2 * pad, H - 24
    y0 = y1 - 66
    c.draw.rounded_rectangle(
        [x0 * S, y0 * S, (W - 24) * S, y1 * S], radius=8 * S, fill=SURFACE, outline=LINE, width=S
    )
    x, y = x0 + pad, y0 + pad
    c.text((x, y + 12), legend.caption, 400, 14, INK_2)
    for color, label in legend.swatches:
        c.draw.rectangle([x * S, (y + 22) * S, (x + sw) * S, (y + 32) * S], fill=color)
        if label:
            c.text((x + (sw / 2 if legend.centered else sw), y + 48), label, 400, 13, INK_2, anchor="ms")
        x += sw + gap


def split_points(title: str) -> list[tuple[str, str]]:
    """Möjliga radbrytningar: efter bindestreck (som behålls) eller vid mellanslag."""
    out = []
    for i, ch in enumerate(title):
        if ch == "-":
            out.append((title[: i + 1], title[i + 1 :]))
        elif ch == " ":
            out.append((title[:i], title[i + 1 :]))
    return out


def fit_title(c: Canvas, title: str) -> tuple[list[str], int]:
    """En rad om den får plats, annars två så jämna rader som möjligt, annars mindre text."""
    for size in (64, 58):
        if c.width(title, 700, size) <= TEXT_W:
            return [title], size
    candidates = split_points(title)
    for size in (60, 52, 46):
        fitting = [
            [a, b] for a, b in candidates if max(c.width(a, 700, size), c.width(b, 700, size)) <= TEXT_W
        ]
        if fitting:
            return min(fitting, key=lambda ls: max(c.width(x, 700, size) for x in ls)), size
    size = 44
    while size > 28 and c.width(title, 700, size) > TEXT_W:
        size -= 4
    return [title], size


def draw_text(c: Canvas, card: Card) -> None:
    """Sajtnamn överst, källa nederst och huvudblocket centrerat däremellan."""
    x = TEXT_X
    c.draw.rounded_rectangle([x * S, 47 * S, (x + 12) * S, 59 * S], radius=3 * S, fill=ACCENT)
    c.text((x + 22, 60), SITE_NAME, 600, 20, INK_2)
    c.text((x, H - 48), f"Källa: {SOURCE_NAME}", 400, 17, INK_3)

    lines, size = fit_title(c, card.title)
    leading = round(size * 1.04)
    # Baslinjer relativt blockets överkant: rubrikrad, stort tal, nyckelrader
    eyebrow_y = 15
    title_ys = [eyebrow_y + 22 + round(size * 0.74) + i * leading for i in range(len(lines))]
    big_y = title_ys[-1] + 40 + 70
    line_ys = [big_y + 58, big_y + 96][: len(card.lines)]
    top = 96 + (H - 96 - 84 - line_ys[-1]) / 2

    c.text((x, top + eyebrow_y), card.eyebrow, 400, 20, INK_3)
    for line, y in zip(lines, title_ys, strict=True):
        c.text((x, top + y), line, 700, size, INK)
    big_w = c.text((x, top + big_y), card.big, 700, 96, INK)
    c.text((x + big_w + 12, top + big_y), card.unit, 400, 28, INK_2)
    for i, (parts, y) in enumerate(zip(card.lines, line_ys, strict=False)):
        c.segments((x, top + y), parts, 24 if i == 0 else 21, INK if i == 0 else INK_2)


def render(card: Card, features: list[Feature]) -> Image.Image:
    c = Canvas()
    draw_map(c, card, features)
    draw_legend(c, card.legend)
    draw_text(c, card)
    keys = [PAGE, SURFACE, INK, INK_2, INK_3, ACCENT, LINE, NODATA, *card.fills.values()]
    keys += [color for color, _ in card.legend.swatches]
    return c.result(keys)


# ---------- innehåll ----------


def price_legend() -> Legend:
    """Sex rutor; varje klassgräns står vid högerkanten av rutan under den."""
    labels = [f"{b // 1000}" for b in PRICE_BREAKS] + [""]
    return Legend(list(zip(PRICE_COLORS, labels, strict=True)), "Pris per kvm, tusen kr")


def area_box(feature: Feature) -> BBox:
    """Kartutsnitt: området i mitten med gott om omgivning, minst MIN_SPAN_DEG högt."""
    factor = 2.6 if feature["properties"]["kind"] == "district" else 2.0
    x0, y0, x1, y1 = expand(bbox([feature["geometry"]]), factor)
    grow = max(1.0, MIN_SPAN_DEG / (y1 - y0))
    return expand((x0, y0, x1, y1), grow)


def city_box(features: list[Feature]) -> BBox:
    districts = [f["geometry"] for f in features if f["properties"]["kind"] == "district"]
    return expand(bbox(districts), 1.15)


def apartment(snap: Snapshot, slug: str) -> Stat | None:
    record = snapshots.area_by_slug(snap).get(slug)
    return record["apartment"]["m3"] if record else None


def price_fills(snap: Snapshot) -> dict[str, Color]:
    return {a["slug"]: price_color(a["apartment"]["m3"]["pricePerSqm"]) for a in snap["areas"]}


def area_card(snap: Snapshot, feature: Feature) -> Card:
    props = feature["properties"]
    stat = apartment(snap, props["slug"])
    county = snap["county"]["apartment"]["m3"]["pricePerSqm"]
    period = period_labels(snap["updated"])["m3"]
    price = stat["pricePerSqm"] if stat else None
    if price is not None and county:
        bold, rest = fmt_relative(price, county)
        first: list[Segment] = [(bold, 600), (rest, 400)]
    else:
        reason = (stat or {}).get("missing", {}).get("pricePerSqm", "0")
        first = [(MISSING_TEXT[reason], 400)]
    sales = stat["sales"] if stat else None
    second: list[Segment] = [(f"{fmt_int(sales)} sålda bostadsrätter, {period}" if sales else period, 400)]
    eyebrow = (
        "Stadsdelsområde i Stockholms stad" if props["kind"] == "district" else "Kommun i Stockholms län"
    )
    return Card(
        eyebrow=eyebrow,
        title=props["name"],
        big=fmt_int(price) if price is not None else "–",
        unit="kr/kvm",
        lines=[first, second],
        fills=price_fills(snap),
        box=area_box(feature),
        legend=price_legend(),
        highlight=props["slug"],
        labels=list(props["neighbours"]),
    )


def _ranked(snap: Snapshot, key: Callable[[Stat], float | None], period: Period) -> list[tuple[str, float]]:
    values = [(a["name"], key(a["apartment"][period])) for a in snap["areas"] if a["slug"] != CITY_SLUG]
    return sorted(((n, v) for n, v in values if v is not None), key=lambda nv: -nv[1])


def overview_cards(snap: Snapshot, features: list[Feature]) -> dict[str, Card]:
    """Startbilden och en bild per vy. Alla visar Stockholms stad med närmaste kommuner."""
    periods = period_labels(snap["updated"])
    county = snap["county"]["apartment"]
    box = city_box(features)
    districts = [f["properties"]["slug"] for f in features if f["properties"]["kind"] == "district"]
    by_price = _ranked(snap, lambda s: s["pricePerSqm"], "m3")
    by_change = _ranked(snap, lambda s: s["change"], "m12")
    common = {"box": box, "labels": districts}
    max_sqm = BUDGET / BUDGET_SQM
    budget_fills = {
        a["slug"]: _budget_color(a["apartment"]["m3"]["pricePerSqm"], max_sqm) for a in snap["areas"]
    }
    ok = sum(
        1 for a in snap["areas"] if a["slug"] != CITY_SLUG and budget_fills[a["slug"]] == BUDGET_COLORS["ok"]
    )
    total = sum(1 for a in snap["areas"] if a["slug"] != CITY_SLUG)
    top_name, top_price = by_price[0]
    rise_name, rise = by_change[0]
    return {
        "start": Card(
            eyebrow="Bostadsrätter i Stockholms län",
            title="Vad kostar det att bo här?",
            big=fmt_int(county["m3"]["pricePerSqm"]),
            unit="kr/kvm",
            lines=[
                [("Länets snitt", 600), (f", {periods['m3']}", 400)],
                [(f"Pris, budget och förändring i {total} områden", 400)],
            ],
            fills=price_fills(snap),
            legend=price_legend(),
            **common,
        ),
        "pris": Card(
            eyebrow=f"Bostadsrätter, {periods['m3']}",
            title="Pris per kvm",
            big=fmt_int(top_price),
            unit="kr/kvm",
            lines=[
                [("Dyrast: ", 400), (top_name, 600)],
                [(f"Länets snitt är {fmt_int(county['m3']['pricePerSqm'])} kr/kvm", 400)],
            ],
            fills=price_fills(snap),
            legend=price_legend(),
            **common,
        ),
        "budget": Card(
            eyebrow=f"Bostadsrätter, {periods['m3']}",
            title="Var har jag råd?",
            big=f"{ok} av {total}",
            unit="områden",
            lines=[
                [("5 mkr", 600), (f" räcker till {BUDGET_SQM} kvm", 400)],
                [("Prova med din egen budget och storlek", 400)],
            ],
            fills=budget_fills,
            legend=Legend(
                [(BUDGET_COLORS["ok"], ""), (BUDGET_COLORS["near"], ""), (BUDGET_COLORS["no"], "")],
                "Räcker · nästan · räcker inte",
            ),
            **common,
        ),
        "forandring": Card(
            eyebrow=f"Bostadsrätter, {periods['m12']}",
            title="Förändring",
            big=fmt_change(county["m12"]["change"]),
            unit="på ett år",
            lines=[
                [("Mest: ", 400), (f"{rise_name}, {fmt_change(rise)}", 600)],
                [("Länets snitt jämfört med året innan", 400)],
            ],
            fills={a["slug"]: change_color(a["apartment"]["m12"]["change"]) for a in snap["areas"]},
            legend=Legend(
                [
                    (change_color(v), lbl)
                    for v, lbl in ((-10, "−10"), (-5, ""), (0, "0"), (5, ""), (10, "+10"))
                ],
                "Förändring, procent",
                centered=True,
            ),
            **common,
        ),
    }


def _budget_color(price: int | None, max_sqm: float) -> Color:
    if price is None:
        return NODATA
    if price <= max_sqm:
        return BUDGET_COLORS["ok"]
    return BUDGET_COLORS["near"] if price <= max_sqm * (1 + BUDGET_NEAR) else BUDGET_COLORS["no"]


def _save(img: Image.Image, path: Path) -> bool:
    """Skriv bara om bilden ändrats. Returnerar om filen skrevs."""
    buffer = io.BytesIO()
    img.save(buffer, format="PNG", optimize=True)
    data = buffer.getvalue()
    if path.exists() and path.read_bytes() == data:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return True


def run(out_dir: Path = OG_DIR, geo_file: Path = GEO_FILE) -> list[Path]:
    snap = snapshots.load_latest()
    features = load_features(geo_file)
    cards = overview_cards(snap, features)
    cards |= {f["properties"]["slug"]: area_card(snap, f) for f in features}
    paths = [out_dir / f"{name}.png" for name in cards]
    written = sum(
        _save(render(card, features), path) for card, path in zip(cards.values(), paths, strict=True)
    )
    total_kb = sum(p.stat().st_size for p in paths) / 1024
    log.info(
        "%d delningsbilder i %s (%d ändrade, %.0f kB totalt)", len(paths), display(out_dir), written, total_kb
    )
    return paths
