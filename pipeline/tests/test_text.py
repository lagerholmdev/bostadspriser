import pytest

from prislandskap.text import months_back, period_labels, slugify, swedish_sort_key


@pytest.mark.parametrize(
    ("updated", "m3", "m12"),
    [
        ("2026-10-08", "jul–sep 2026", "okt 2025–sep 2026"),
        ("2027-01-08", "okt–dec 2026", "jan 2026–dec 2026"),
        ("2027-02-09", "nov 2026–jan 2027", "feb 2026–jan 2027"),
        ("2027-03-10", "dec 2026–feb 2027", "mar 2026–feb 2027"),
        ("2027-04-08", "jan–mar 2027", "apr 2026–mar 2027"),
    ],
)
def test_period_labels(updated, m3, m12):
    assert period_labels(updated) == {"m3": m3, "m12": m12}


def test_months_back_across_years():
    assert months_back(2027, 1, 1) == (2026, 12)
    assert months_back(2027, 1, 12) == (2026, 1)
    assert months_back(2027, 1, 13) == (2025, 12)


@pytest.mark.parametrize(
    ("name", "slug"),
    [("Upplands Väsby", "upplands-vasby"), ("Upplands-Bro", "upplands-bro"), ("Österåker", "osteraker")],
)
def test_slugify(name, slug):
    assert slugify(name) == slug


def test_swedish_sort_order():
    names = ["Östermalm", "Ekerö", "Älvsjö", "Åkersberga", "Södermalm", "Sigtuna", "Huddinge", "Hägersten"]
    assert sorted(names, key=swedish_sort_key) == [
        "Ekerö", "Huddinge", "Hägersten", "Sigtuna", "Södermalm", "Åkersberga", "Älvsjö", "Östermalm",
    ]  # fmt: skip
