"""Gemensamma hjälpfunktioner för att bygga sajten: data, formatering, minikartor och delningsbilder.

Bara standardbiblioteket och Pillow, så månadsjobbet behöver inga geobibliotek.
"""
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FONTS = Path(__file__).parent / "fonts"

# Samma färgskala som kartan: djupt indigo -> havsgrönt -> halm -> bärnsten
RAMP = [(38, 52, 102), (52, 98, 138), (84, 150, 150), (196, 190, 120), (240, 170, 88), (250, 120, 78)]
NIGHT = (11, 17, 27)
LAND = (22, 32, 48)
INK = (236, 230, 216)
MUTED = (142, 152, 169)
BRASS = (232, 180, 92)
PRIS_LO = 25000

# Prepositioner: öar och stadsdelar man är "på"
PA = {"sodermalm", "ostermalm", "kungsholmen", "essingen", "lidingo", "varmdo"}


def load():
    config = json.loads((ROOT / "site" / "config.json").read_text())
    snaps = sorted((ROOT / "data" / "snapshots").glob("*.json"))
    if not snaps:
        raise SystemExit("Ingen ögonblicksbild i data/snapshots")
    snap = json.loads(snaps[-1].read_text())
    geo = json.loads((ROOT / "site" / "omraden.geojson").read_text())
    return config, snap, geo


def prep(slug: str, namn: str) -> str:
    return f"{'på' if slug in PA else 'i'} {namn}"


# ---------- formatering (svensk) ----------
NBSP = " "


def kr(v) -> str:
    if v is None:
        return "–"
    return f"{round(v):,}".replace(",", NBSP)


def pct(v, signed=True) -> str:
    if v is None:
        return "–"
    s = f"{abs(v):.1f}".replace(".", ",")
    if not signed:
        return s + NBSP + "%"
    sign = "+" if v > 0 else "−" if v < 0 else "±"
    return f"{sign}{s}{NBSP}%"


def mkr(v) -> str:
    return f"{v / 1e6:.1f}".replace(".", ",").replace(",0", "") + NBSP + "Mkr"


def lerp(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def ramp(t: float):
    t = max(0.0, min(1.0, t))
    s = t * (len(RAMP) - 1)
    i = min(len(RAMP) - 2, int(s))
    return lerp(RAMP[i], RAMP[i + 1], s - i)


def price_color(kvm, kvm_max):
    if kvm is None:
        return (70, 78, 92)
    return ramp((kvm - PRIS_LO) / (kvm_max - PRIS_LO))


# ---------- geometri ----------
def rings(geom):
    """Alla yttre och inre ringar som listor av (lon, lat)."""
    polys = geom["coordinates"] if geom["type"] == "MultiPolygon" else [geom["coordinates"]]
    for poly in polys:
        for ring in poly:
            yield ring


def bbox(features):
    xs, ys = [], []
    for f in features:
        for r in rings(f["geometry"]):
            for x, y in r:
                xs.append(x)
                ys.append(y)
    return min(xs), min(ys), max(xs), max(ys)


class Projection:
    """Ekvirektangulär projektion skalad med cos(lat), anpassad till en ruta i pixlar."""

    def __init__(self, box, width, height, pad=0.08):
        x0, y0, x1, y1 = box
        self.k = math.cos(math.radians((y0 + y1) / 2))
        w, h = (x1 - x0) * self.k, (y1 - y0)
        dx, dy = w * pad, h * pad
        w, h = w + 2 * dx, h + 2 * dy
        self.scale = min(width / w, height / h)
        self.ox = (width - w * self.scale) / 2 - (x0 * self.k - dx) * self.scale
        self.oy = (height - h * self.scale) / 2 + (y1 + dy) * self.scale

    def __call__(self, lon, lat):
        return lon * self.k * self.scale + self.ox, -lat * self.scale + self.oy


def expand(box, factor):
    x0, y0, x1, y1 = box
    cx, cy, w, h = (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) * factor, (y1 - y0) * factor
    return cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2


def svg_path(geom, proj) -> str:
    parts = []
    for r in rings(geom):
        pts = [proj(x, y) for x, y in r]
        parts.append("M" + "L".join(f"{x:.1f} {y:.1f}" for x, y in pts) + "Z")
    return "".join(parts)


def minimap_svg(target, features, kvm_of, kvm_max, width=640, height=420) -> str:
    """Minikarta: valt område i mässing, omgivningen färgad efter pris."""
    box = expand(bbox([target]), 2.6)
    proj = Projection(box, width, height, pad=0.02)
    x0, y0, x1, y1 = box
    out = [f'<svg viewBox="0 0 {width} {height}" role="img" aria-label="Karta över {target["properties"]["namn"]} och grannområdena" class="minimap">']
    for f in features:
        fx0, fy0, fx1, fy1 = bbox([f])
        if fx1 < x0 or fx0 > x1 or fy1 < y0 or fy0 > y1:
            continue
        is_t = f is target
        c = BRASS if is_t else price_color(kvm_of(f["properties"]["slug"]), kvm_max)
        op = 1 if is_t else 0.55
        stroke = 'stroke="#0b111b" stroke-width="1.2"' if not is_t else 'stroke="#f6dca8" stroke-width="2"'
        out.append(f'<path d="{svg_path(f["geometry"], proj)}" fill="rgb{c}" fill-opacity="{op}" {stroke} fill-rule="evenodd"/>')
    for f in features:
        if f is target:
            continue
        lx, ly = f["properties"]["lab"]
        if x0 < lx < x1 and y0 < ly < y1:
            px, py = proj(lx, ly)
            if 30 < px < width - 30 and 14 < py < height - 8:
                out.append(f'<text x="{px:.0f}" y="{py:.0f}" text-anchor="middle" class="mm-lab">{f["properties"]["namn"]}</text>')
    lx, ly = target["properties"]["lab"]
    px, py = proj(lx, ly)
    out.append(f'<text x="{px:.0f}" y="{py:.0f}" text-anchor="middle" class="mm-lab mm-target">{target["properties"]["namn"]}</text>')
    out.append("</svg>")
    return "".join(out)


# ---------- delningsbilder ----------
def _font(weight, size):
    from PIL import ImageFont
    return ImageFont.truetype(str(FONTS / f"FamiljenGrotesk-{weight}.ttf"), size)


def og_image(path: Path, title: str, big: str, unit: str, lines: list[str], features, fill_of, highlight=None,
             box=None):
    """1200×630: text till vänster, karta till höger. fill_of(slug) -> (r,g,b) eller None."""
    from PIL import Image, ImageDraw

    W, H, S = 1200, 630, 2  # rita i dubbel upplösning och skala ner för mjuka kanter
    img = Image.new("RGB", (W * S, H * S), NIGHT)
    d = ImageDraw.Draw(img)

    # Karta i högra delen
    mx0, mw = 600 * S, 600 * S
    box = box or bbox(features)
    proj = Projection(box, mw, H * S, pad=0.04)
    def draw(f, col, outline, width):
        for r in rings(f["geometry"]):
            pts = [(proj(x, y)[0] + mx0, proj(x, y)[1]) for x, y in r]
            if len(pts) > 2:
                d.polygon(pts, fill=col, outline=outline, width=width)

    hi_feat = None
    for f in features:
        slug = f["properties"]["slug"]
        if slug == highlight:
            hi_feat = f
            continue
        col = fill_of(slug) or (60, 68, 82)
        if highlight:
            col = lerp(col, NIGHT, 0.55)  # tona ner omgivningen så det valda området syns
        draw(f, col, NIGHT, 2 * S)
    if hi_feat:
        draw(hi_feat, BRASS, (250, 232, 196), 4 * S)
    # Mjuk övergång: texten får en mörk yta som tonar ut över kartans vänsterkant
    fade = Image.new("L", (160 * S, H * S))
    fd = ImageDraw.Draw(fade)
    for i in range(160 * S):
        fd.line([(i, 0), (i, H * S)], fill=int(255 * (1 - i / (160 * S))))
    img.paste(Image.new("RGB", fade.size, NIGHT), (mx0 - 40 * S, 0), fade)
    d.rectangle([0, 0, mx0 - 40 * S, H * S], fill=NIGHT)

    x = 64 * S
    d.text((x, 64 * S), "STOCKHOLMS PRISLANDSKAP", font=_font(600, 20 * S), fill=MUTED, spacing=4)
    tsize = 64 if len(title) <= 14 else 52 if len(title) <= 20 else 42
    d.text((x, 104 * S), title, font=_font(700, tsize * S), fill=INK)
    y = 104 * S + int(tsize * 1.35) * S + 28 * S
    d.text((x, y), big, font=_font(700, 92 * S), fill=BRASS)
    bw = d.textlength(big, font=_font(700, 92 * S))
    d.text((x + bw + 14 * S, y + 52 * S), unit, font=_font(400, 28 * S), fill=MUTED)
    y += 130 * S
    for line in lines:
        d.text((x, y), line, font=_font(400, 26 * S), fill=INK)
        y += 40 * S
    d.text((x, H * S - 64 * S), "Källa: Svensk Mäklarstatistik", font=_font(400, 20 * S), fill=MUTED)

    img = img.resize((W, H), Image.LANCZOS).quantize(colors=96, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, optimize=True)
