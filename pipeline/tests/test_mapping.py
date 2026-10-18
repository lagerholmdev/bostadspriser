from pathlib import Path

import pytest

from prislandskap.errors import PipelineError
from prislandskap.geometry import assign_districts
from prislandskap.mapping import DISTRICT_NAMES, STADSDELAR, stadsdel_lookup
from prislandskap.text import slugify

# Namnen i källan (krasch/stockholm-stadsdelar), uttagna så att testet går utan nätverk
SOURCE_NAMES = Path(__file__).parent / "fixtures" / "stadsdelar.txt"


def test_twelve_districts_with_names():
    assert len(STADSDELAR) == 12
    assert STADSDELAR.keys() == DISTRICT_NAMES.keys()
    for slug, name in DISTRICT_NAMES.items():
        assert slugify(name) == slug


def test_no_stadsdel_in_two_districts():
    names = [n for group in STADSDELAR.values() for n in group]
    assert len(names) == len(set(names)) == 117
    assert len(stadsdel_lookup()) == 117


def test_orhem_belongs_to_farsta_vantor():
    assert stadsdel_lookup()["ORHEM"] == "farsta-vantor"


def test_unmapped_stadsdel_is_an_error():
    with pytest.raises(PipelineError, match="NYA STADEN"):
        assign_districts(["SÖDERMALM", "NYA STADEN"])


def test_mapping_covers_every_stadsdel_in_source():
    lines = SOURCE_NAMES.read_text(encoding="utf-8").splitlines()
    names = {line for line in lines if line and not line.startswith("#")}
    assert len(names) == 117
    assert names == set(stadsdel_lookup())
