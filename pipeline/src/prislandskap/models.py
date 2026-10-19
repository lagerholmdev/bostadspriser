"""Typer för ögonblicksbilden (schema 2) och exportkontraktet (web/src/lib/types.ts).

Statistikposterna har samma form i båda, så exporten kan föra över dem oförändrade.
"""

from typing import Literal, NotRequired, TypedDict

Period = Literal["m3", "m12"]
Housing = Literal["apartment", "house"]
AreaKind = Literal["district", "municipality"]
MissingReason = Literal["F", "N", "0"]
HouseScope = Literal["area", "city"]

PERIODS: tuple[Period, ...] = ("m3", "m12")
HOUSING: tuple[Housing, ...] = ("apartment", "house")


class Stat(TypedDict):
    sales: int | None
    pricePerSqm: int | None
    meanPrice: int | None
    change: float | None
    missing: NotRequired[dict[str, MissingReason]]


class StatsByPeriod(TypedDict):
    m3: Stat
    m12: Stat


class Source(TypedDict):
    name: str
    url: str


# ---------- ögonblicksbild (data/snapshots/ÅÅÅÅ-MM.json) ----------


class SnapshotArea(TypedDict):
    slug: str
    name: str
    kind: AreaKind
    apartment: StatsByPeriod
    house: StatsByPeriod | None


class County(TypedDict):
    name: str
    apartment: StatsByPeriod
    house: StatsByPeriod


class Snapshot(TypedDict):
    schema: int
    updated: str
    source: Source
    county: County
    areas: list[SnapshotArea]


# ---------- export (web/src/generated/areas.json) ----------


class AreaContext(TypedDict):
    """SCB-statistik per område (data/scb/kontext.json). Andelar 0–1, condos ett antal."""

    families: float | None
    highIncome: float | None
    higherEducation: float | None
    age25to44: float | None
    condos: int | None


class DatasetContext(TypedDict):
    source: Source
    years: dict[str, str]
    county: AreaContext


class Area(TypedDict):
    slug: str
    name: str
    kind: AreaKind
    label: list[float]
    neighbours: list[str]
    bbox: list[float]
    apartment: StatsByPeriod | None
    house: StatsByPeriod | None
    houseScope: HouseScope | None
    context: AreaContext | None


class Dataset(TypedDict):
    updated: str
    periods: dict[Period, str]
    source: Source
    county: County
    context: DatasetContext | None
    areas: list[Area]
