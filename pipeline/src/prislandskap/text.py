"""Svensk text: slugs, sortering och datum."""

MONTHS = (
    "januari", "februari", "mars", "april", "maj", "juni",
    "juli", "augusti", "september", "oktober", "november", "december",
)  # fmt: skip
MONTHS_SHORT = tuple(m[:3] for m in MONTHS)

_SWEDISH_ALPHABET = "abcdefghijklmnopqrstuvwxyzåäö"
_LETTER_RANK = {ch: 1000 + i for i, ch in enumerate(_SWEDISH_ALPHABET)}
_FOLD = str.maketrans({"é": "e", "è": "e", "ü": "y", "æ": "ä", "ø": "ö"})


def slugify(name: str) -> str:
    """'Upplands Väsby' -> 'upplands-vasby'. Samma regel som områdenas slugs i geometrin."""
    table = str.maketrans({"å": "a", "ä": "a", "ö": "o", "é": "e", " ": "-"})
    return name.strip().lower().translate(table)


def swedish_sort_key(name: str) -> tuple[int, ...]:
    """Sorteringsnyckel enligt svenska alfabetet (å, ä, ö efter z). Skiljetecken före bokstäver."""
    return tuple(_LETTER_RANK.get(ch, ord(ch)) for ch in name.lower().translate(_FOLD))


def month_number(name: str) -> int:
    """'oktober' -> 10."""
    try:
        return MONTHS.index(name.strip().lower()) + 1
    except ValueError as err:
        raise ValueError(f"Okänt månadsnamn: {name!r}") from err


def months_back(year: int, month: int, n: int) -> tuple[int, int]:
    """Året och månaden n månader före (year, month)."""
    index = year * 12 + (month - 1) - n
    return index // 12, index % 12 + 1


def period_labels(updated: str) -> dict[str, str]:
    """Läsbara periodnamn från publiceringsdatum (YYYY-MM-DD).

    Mäklarstatistik räknar på de 3 respektive 12 senaste hela månaderna före publiceringsmånaden:
    '2026-10-08' -> {'m3': 'jul–sep 2026', 'm12': 'okt 2025–sep 2026'}.
    """
    year, month = int(updated[:4]), int(updated[5:7])
    end_y, end_m = months_back(year, month, 1)
    m3_y, m3_m = months_back(year, month, 3)
    m12_y, m12_m = months_back(year, month, 12)
    end = f"{MONTHS_SHORT[end_m - 1]} {end_y}"
    m3_start = MONTHS_SHORT[m3_m - 1] if m3_y == end_y else f"{MONTHS_SHORT[m3_m - 1]} {m3_y}"
    return {"m3": f"{m3_start}–{end}", "m12": f"{MONTHS_SHORT[m12_m - 1]} {m12_y}–{end}"}
