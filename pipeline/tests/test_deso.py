"""DeSO-mappningen: data/scb/deso.csv och de rena kontrollerna."""

import pytest

from prislandskap import deso
from prislandskap.config import DESO_FILE
from prislandskap.errors import PipelineError
from prislandskap.mapping import DISTRICT_NAMES, MUNICIPALITY_CODES


def test_municipality_slug_from_code():
    assert deso.municipality_slug("0114C1010") == "upplands-vasby"
    assert deso.municipality_slug("0180C1010") is None
    assert deso.municipality_slug("1280C1070") is None


def test_municipality_codes_match_geometry(features):
    geo = {f["properties"]["slug"] for f in features if f["properties"]["kind"] == "municipality"}
    assert set(MUNICIPALITY_CODES.values()) == geo


def test_checked_in_mapping_covers_every_area():
    mapping = deso.load(DESO_FILE)
    assert set(mapping.values()) == set(DISTRICT_NAMES) | set(MUNICIPALITY_CODES.values())
    assert all(code.startswith("01") for code in mapping)
    for code, slug in mapping.items():
        if not code.startswith("0180"):
            assert deso.municipality_slug(code) == slug


def test_check_rejects_messy_city_split():
    clean = [deso.Assignment(f"0180C{i:04}", "sodermalm", 1.0) for i in range(50)]
    others = [deso.Assignment(f"X{s}", s, 1.0) for s in [*DISTRICT_NAMES, *MUNICIPALITY_CODES.values()]]
    deso.check(clean + others)
    messy = [deso.Assignment(f"0180C{i:04}", "sodermalm", 0.6) for i in range(5)]
    with pytest.raises(PipelineError, match="Bara 91 %"):
        deso.check(clean + messy + others)


def test_dumps_is_sorted_csv():
    text = deso.dumps(
        [deso.Assignment("0180C2", "sodermalm", 0.5), deso.Assignment("0114A1", "upplands-vasby", 1)]
    )
    assert text.splitlines() == ["deso,slug,andel", "0114A1,upplands-vasby,1.000", "0180C2,sodermalm,0.500"]
