import pytest

from prislandskap.errors import ParseError
from prislandskap.parse import parse_number, parse_row, parse_stat, parse_tables, parse_updated


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("64 714", 64714),
        ("5 443 000", 5443000),
        ("44 335", 44335),
        ("25084", 25084),
        ("+0.1", 0.1),
        ("-1.1", -1.1),
        ("−1,6", -1.6),
        ("±0.0", 0.0),
        ("0", 0),
        ("F", "F"),
        ("N", "N"),
        ("", "0"),
        (" – ", "0"),
    ],
)
def test_parse_number(text, expected):
    assert parse_number(text) == expected


def test_parse_number_rejects_garbage():
    with pytest.raises(ParseError, match="Kan inte tolka"):
        parse_number("12 kr")


def test_parse_stat_marks_missing_reasons():
    stat = parse_stat(["4", "76 057", "13 025 000", "F"])
    assert stat == {
        "sales": 4,
        "pricePerSqm": 76057,
        "meanPrice": 13025000,
        "change": None,
        "missing": {"change": "F"},
    }


def test_parse_stat_zero_price_means_no_data_but_zero_sales_is_a_count():
    stat = parse_stat(["0", "0", "0", "N"])
    assert stat["sales"] == 0
    assert stat["pricePerSqm"] is None and stat["meanPrice"] is None
    assert stat["missing"] == {"pricePerSqm": "0", "meanPrice": "0", "change": "N"}


def test_parse_stat_types():
    stat = parse_stat(["559", "64 714", "4 032 000", "+2.0"])
    assert stat == {"sales": 559, "pricePerSqm": 64714, "meanPrice": 4032000, "change": 2.0}
    assert isinstance(stat["sales"], int) and isinstance(stat["change"], float)
    assert "missing" not in stat


def test_parse_row_slug_and_periods():
    row = parse_row(
        ["Upplands  Väsby", "62", "44 335", "6 153 000", "+3.7", "254", "42 655", "5 815 000", "+10.8"]
    )
    assert (row.name, row.slug) == ("Upplands Väsby", "upplands-vasby")
    assert row.stats["m3"]["sales"] == 62
    assert row.stats["m12"]["change"] == 10.8


def test_parse_row_too_short():
    with pytest.raises(ParseError, match="celler"):
        parse_row(["Solna", "1", "2"])


def test_county_page_tables(fixture_html):
    tables = parse_tables(fixture_html("county.html"))
    assert len(tables) == 2, "sammanfattningstabellen utan områdeslänkar ska hoppas över"
    apartments, houses = tables
    assert list(apartments)[:3] == ["riket", "stockholms-lan", "botkyrka"]
    assert len(apartments) == len(houses) == 28
    assert apartments["riket"].stats["m3"]["change"] == 0.0
    assert apartments["stockholms-lan"].stats["m12"]["sales"] == 46042
    assert apartments["nykvarn"].stats["m12"]["missing"] == {"change": "F"}
    assert houses["solna"].stats["m3"]["missing"] == {"change": "F"}


def test_city_page_includes_aggregates_that_scraper_must_skip(fixture_html):
    (city,) = parse_tables(fixture_html("city.html"))
    assert "stockholm" in city and "centrala-stockholm" in city
    assert city["sodermalm"].stats["m3"]["pricePerSqm"] == 116680
    assert city["ostermalm"].name == "Östermalm"


def test_edge_cases(fixture_html):
    (table,) = parse_tables(fixture_html("edge.html"))
    assert set(table) == {"vaxholm", "upplands-vasby"}, "rader utan länk till /omrade/ ska ignoreras"
    vaxholm = table["vaxholm"].stats
    assert vaxholm["m3"]["missing"] == {"pricePerSqm": "0", "meanPrice": "0", "change": "N"}
    assert vaxholm["m12"]["missing"] == {"pricePerSqm": "N", "meanPrice": "N", "change": "F"}
    vasby = table["upplands-vasby"].stats
    assert vasby["m3"]["pricePerSqm"] == 44335
    assert vasby["m3"]["change"] == 0.0
    assert vasby["m12"]["change"] == -1.6


def test_parse_updated(fixture_html):
    assert parse_updated(fixture_html("county.html")) == "2026-10-08"
    assert parse_updated(fixture_html("edge.html")) == "2027-01-03"


def test_parse_updated_missing_or_unknown_month():
    with pytest.raises(ParseError, match="uppdateringsdatum"):
        parse_updated("<p>Inget datum</p>")
    with pytest.raises(ParseError, match="månadsnamn"):
        parse_updated("<p>Uppdaterat: 08 brumaire 2026</p>")
