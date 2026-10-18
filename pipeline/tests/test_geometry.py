"""Geometrins rena hjälpfunktioner. Själva ombyggnaden kräver källfilerna och testas inte här."""

import pytest

shapely = pytest.importorskip("shapely")
from shapely.geometry import MultiPolygon, Point, Polygon  # noqa: E402

from prislandskap.geometry import drop_small_holes, label_point, neighbours_within  # noqa: E402


def square(x: float, y: float, size: float) -> Polygon:
    return Polygon([(x, y), (x + size, y), (x + size, y + size), (x, y + size)])


def test_drop_small_holes_keeps_lakes():
    outer = square(0, 0, 2000).exterior
    small, big = square(100, 100, 50).exterior, square(1000, 1000, 500).exterior
    result = drop_small_holes(Polygon(outer, [small, big]))
    assert len(result.interiors) == 1
    assert Polygon(result.interiors[0]).area == 250_000


def test_label_point_lies_in_largest_part():
    u_shape = Polygon(
        [(0, 0), (3000, 0), (3000, 3000), (2000, 3000), (2000, 1000), (1000, 1000), (1000, 3000), (0, 3000)]
    )
    geom = MultiPolygon([square(10_000, 0, 100), u_shape])
    point = label_point(geom)
    assert u_shape.contains(point)
    assert not Point(1500, 2000).equals(point)


def test_neighbours_within_distance():
    geoms = [square(0, 0, 100), square(600, 0, 100), square(5000, 0, 100)]
    assert neighbours_within(geoms, ["a", "b", "c"], 1000) == [["b"], ["a"], []]
