"""Färger för delningsbilderna.

Skalorna (pris, förändring, budget, saknad data) läses från design/scales.json, samma fil som
web/src/lib/scales.ts importerar. Övriga färger är desamma som i web/src/styles/tokens.css.
"""

import json
import math
from functools import cache
from pathlib import Path
from typing import Any

from prislandskap.config import SCALES_FILE, display
from prislandskap.errors import PipelineError

Color = tuple[int, int, int]


def hex_rgb(value: str) -> Color:
    return int(value[1:3], 16), int(value[3:5], 16), int(value[5:7], 16)


@cache
def load_scales(path: Path = SCALES_FILE) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as err:
        raise PipelineError(f"Kan inte läsa färgskalorna i {display(path)}: {err}") from err


_SCALES = load_scales()

PAGE = hex_rgb("#f3f4f1")
SURFACE = hex_rgb("#ffffff")
INK = hex_rgb("#1a1f1c")
INK_2 = hex_rgb("#4d5650")
INK_3 = hex_rgb("#5f6762")
LINE = hex_rgb("#dde0da")
ACCENT = hex_rgb("#1f6f5c")
NODATA = hex_rgb(_SCALES["nodata"])

PRICE_COLORS: tuple[Color, ...] = tuple(hex_rgb(c) for c in _SCALES["price"]["colors"])
PRICE_BREAKS: tuple[int, ...] = tuple(_SCALES["price"]["breaks"])

CHANGE_DOWN = hex_rgb(_SCALES["change"]["down"])
CHANGE_FLAT = hex_rgb(_SCALES["change"]["flat"])
CHANGE_UP = hex_rgb(_SCALES["change"]["up"])
CHANGE_MAX = float(_SCALES["change"]["max"])

BUDGET_COLORS: dict[str, Color] = {k: hex_rgb(_SCALES["budget"][k]) for k in ("ok", "near", "no")}
BUDGET_NEAR_MARGIN = float(_SCALES["budget"]["nearMargin"])


def price_color(value: float | None) -> Color:
    """Samma klassning som priceColor() i scales.ts."""
    if value is None:
        return NODATA
    for color, limit in zip(PRICE_COLORS, PRICE_BREAKS, strict=False):
        if value < limit:
            return color
    return PRICE_COLORS[-1]


def mix(a: Color, b: Color, t: float) -> Color:
    """Som mix() i scales.ts. Avrundar halvor uppåt som Math.round, inte till jämnt som round()."""
    return tuple(math.floor(x + (y - x) * t + 0.5) for x, y in zip(a, b, strict=True))  # type: ignore[return-value]


def change_color(value: float | None) -> Color:
    """Samma skala som changeColor() i scales.ts."""
    if value is None:
        return NODATA
    t = min(1.0, abs(value) / CHANGE_MAX)
    return mix(CHANGE_FLAT, CHANGE_UP if value >= 0 else CHANGE_DOWN, t)
