"""SCB-kontexten: tolkning av json-stat2 och summering av antal till områden. Inget nätverk."""

import pytest

from prislandskap import scb
from prislandskap.errors import PipelineError
from prislandskap.mapping import DISTRICT_NAMES, MUNICIPALITY_CODES

FAMILIES = next(m for m in scb.METRICS if m.key == "families")
INCOME = next(m for m in scb.METRICS if m.key == "highIncome")
CONDOS = next(m for m in scb.METRICS if m.key == "condos")


def jsonstat(dims: dict[str, list[str]], values: list, status: dict | None = None) -> dict:
    """Minimalt json-stat2 i SCB:s form: index som {kod: position}."""
    doc = {
        "id": list(dims),
        "size": [len(v) for v in dims.values()],
        "dimension": {d: {"category": {"index": {c: i for i, c in enumerate(cs)}}} for d, cs in dims.items()},
        "value": values,
    }
    if status:
        doc["status"] = status
    return doc


def test_parse_jsonstat_orders_last_variable_fastest():
    doc = jsonstat(
        {"Region": ["01", "0114"], "Hushallstyp": ["SBMB", "TOTALT"], "Tid": ["2025"]}, [1, 2, 3, 4]
    )
    ids, cells = scb.parse_jsonstat(doc)
    assert ids == ["Region", "Hushallstyp", "Tid"]
    assert cells[("01", "TOTALT", "2025")] == 2
    assert cells[("0114", "SBMB", "2025")] == 3


def test_parse_jsonstat_dotted_values_are_missing():
    doc = jsonstat({"Region": ["01"], "ContentsCode": ["a", "b"], "Tid": ["2024"]}, [5, None], {"1": ".."})
    _, cells = scb.parse_jsonstat(doc)
    assert cells[("01", "b", "2024")] is None


def test_cells_by_region_strips_deso_suffix_and_year():
    doc = jsonstat(
        {"Region": ["0180C1010_DeSO2025"], "Hushallstyp": ["SBMB", "ESMB", "TOTALT"], "Tid": ["2025"]},
        [10, 5, 50],
    )
    regions = scb.cells_by_region(*scb.parse_jsonstat(doc))
    assert set(regions) == {"0180C1010"}
    assert FAMILIES.ratio(scb.getter(regions["0180C1010"])) == (15, 50)


def test_aggregate_sums_counts_not_shares():
    # Två DeSO med olika storlek: andelen ska vägas med antalet hushåll.
    regions = {
        "0180C1010": {"SBMB": 10.0, "ESMB": 0.0, "TOTALT": 100.0},
        "0180C1020": {"SBMB": 90.0, "ESMB": 0.0, "TOTALT": 300.0},
    }
    out = scb.aggregate(FAMILIES, regions, {"sodermalm": ["0180C1010", "0180C1020"]})
    assert out == {"sodermalm": 0.25}  # inte (0.1 + 0.3) / 2 = 0.2


def test_income_weights_quartile_share_by_persons():
    regions = {"a": {"0000089S": 50.0, "0000089O": 100.0}, "b": {"0000089S": 10.0, "0000089O": 300.0}}
    assert scb.aggregate(INCOME, regions, {"x": ["a", "b"]}) == {"x": 0.2}


def test_condos_are_a_count():
    regions = {"a": {"2": 120.0}, "b": {"2": 80.0}}
    assert scb.aggregate(CONDOS, regions, {"x": ["a", "b"]}) == {"x": 200}


def test_aggregate_missing_value_gives_none_and_absent_region_is_an_error():
    regions = {"a": {"SBMB": None, "ESMB": 1.0, "TOTALT": 10.0}}
    assert scb.aggregate(FAMILIES, regions, {"x": ["a"]}) == {"x": None}
    with pytest.raises(PipelineError, match="region b saknas"):
        scb.aggregate(FAMILIES, regions, {"x": ["b"]})


def test_region_sources_prefers_own_codes():
    mapping = {"0180C1010": "sodermalm", "0114C1010": "upplands-vasby", "0114C1020": "upplands-vasby"}
    with_own = scb.region_sources(mapping, {"01", "0114"})
    assert with_own["sodermalm"] == ["0180C1010"]
    assert with_own["upplands-vasby"] == ["0114"]
    assert with_own[scb.COUNTY_KEY] == ["01"]
    without = scb.region_sources(mapping, set())
    assert without["upplands-vasby"] == ["0114C1010", "0114C1020"]
    assert without[scb.COUNTY_KEY] == sorted(mapping)


def test_plan_picks_latest_year_and_checks_codes():
    mapping = {"0180C1010": "sodermalm"}
    meta = {
        "dimension": {
            "Region": {"category": {"index": {"0180C1010_DeSO2025": 0, "01": 1, "0114": 2}}},
            "Tid": {"category": {"index": {"2024": 0, "2025": 1}}},
            "Upplatelseform": {"category": {"index": {"1": 0, "2": 1}}},
            "ContentsCode": {"category": {"index": {"00000864": 0}}},
        }
    }
    selection, year, own = scb.plan(CONDOS, meta, mapping)
    assert year == "2025" and own == {"01", "0114"}
    assert selection["Region"] == ["0180C1010_DeSO2025", "01", "0114"]
    meta["dimension"]["Region"]["category"]["index"] = {"01": 0}
    with pytest.raises(PipelineError, match="saknar 1 DeSO"):
        scb.plan(CONDOS, meta, mapping)


def test_build_and_validate_context():
    slugs = [*DISTRICT_NAMES, *MUNICIPALITY_CODES.values()]
    values = {s: 0.5 for s in slugs} | {scb.COUNTY_KEY: 0.4}
    results = {m.key: ("2025", {s: (100 if m.count else v) for s, v in values.items()}) for m in scb.METRICS}
    context = scb.build_context(results, "2026-10-19")
    scb.validate(context)
    assert len(context["areas"]) == 37
    assert context["county"]["families"] == 0.4 and context["county"]["condos"] == 100
    context["areas"]["essingen"]["families"] = 1.5
    with pytest.raises(PipelineError, match="essingen: families"):
        scb.validate(context)
