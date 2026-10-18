"""Färger från docs/design.md och web/src/lib/scales.ts. Ändras de där ska de ändras här."""

Color = tuple[int, int, int]


def hex_rgb(value: str) -> Color:
    return int(value[1:3], 16), int(value[3:5], 16), int(value[5:7], 16)


PAGE = hex_rgb("#f3f4f1")
SURFACE = hex_rgb("#ffffff")
INK = hex_rgb("#1a1f1c")
INK_2 = hex_rgb("#4d5650")
INK_3 = hex_rgb("#737c76")
LINE = hex_rgb("#dfe2dc")
ACCENT = hex_rgb("#1f6f5c")
NODATA = hex_rgb("#e4e6e1")

PRICE_COLORS: tuple[Color, ...] = tuple(
    hex_rgb(c) for c in ("#f3e7c4", "#ecc884", "#dda052", "#c4713a", "#9c4a2b", "#652a21")
)
PRICE_BREAKS = (35_000, 50_000, 65_000, 85_000, 110_000)

CHANGE_DOWN = hex_rgb("#3d6a9e")
CHANGE_FLAT = hex_rgb("#e7e8e3")
CHANGE_UP = hex_rgb("#b0502a")
CHANGE_MAX = 10.0

BUDGET_COLORS: dict[str, Color] = {
    "ok": hex_rgb("#2f8a6c"),
    "near": hex_rgb("#e3a948"),
    "no": hex_rgb("#d4d7d1"),
}


def price_color(value: float | None) -> Color:
    """Samma klassning som priceColor() i scales.ts."""
    if value is None:
        return NODATA
    for color, limit in zip(PRICE_COLORS, PRICE_BREAKS, strict=False):
        if value < limit:
            return color
    return PRICE_COLORS[-1]


def mix(a: Color, b: Color, t: float) -> Color:
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b, strict=True))  # type: ignore[return-value]


def change_color(value: float | None) -> Color:
    """Samma skala som changeColor() i scales.ts."""
    if value is None:
        return NODATA
    t = min(1.0, abs(value) / CHANGE_MAX)
    return mix(CHANGE_FLAT, CHANGE_UP if value >= 0 else CHANGE_DOWN, t)
