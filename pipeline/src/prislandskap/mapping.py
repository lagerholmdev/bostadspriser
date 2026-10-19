"""Stockholms stads 117 stadsdelar grupperade till Mäklarstatistiks 12 stadsdelsområden.

Mäklarstatistik definierar sina områden som grupper av distrikt (se docs/data.md). Det här är den
närmaste motsvarigheten i stadens stadsdelsindelning. Gränsfall: Gamla stan, Riddarholmen och
Skeppsholmen ligger under Vasastan-Norrmalm, och Orhem under Farsta-Vantör.
"""

DISTRICT_NAMES: dict[str, str] = {
    "bromma-vasterled": "Bromma-Västerled",
    "brannkyrka-skarholmen": "Brännkyrka-Skärholmen",
    "enskede-skarpnack": "Enskede-Skarpnäck",
    "essingen": "Essingen",
    "farsta-vantor": "Farsta-Vantör",
    "hagersten-liljeholmen": "Hägersten-Liljeholmen",
    "hasselby-vallingby": "Hässelby-Vällingby",
    "kungsholmen": "Kungsholmen",
    "spanga-kista": "Spånga-Kista",
    "sodermalm": "Södermalm",
    "vasastan-norrmalm": "Vasastan-Norrmalm",
    "ostermalm": "Östermalm",
}

STADSDELAR: dict[str, tuple[str, ...]] = {
    "vasastan-norrmalm": ("NORRMALM", "VASASTADEN", "GAMLA STAN", "RIDDARHOLMEN", "SKEPPSHOLMEN"),
    "ostermalm": ("ÖSTERMALM", "DJURGÅRDEN", "NORRA DJURGÅRDEN", "LADUGÅRDSGÄRDET", "HJORTHAGEN"),
    "kungsholmen": ("KUNGSHOLMEN", "FREDHÄLL", "KRISTINEBERG", "MARIEBERG", "STADSHAGEN"),
    "essingen": ("LILLA ESSINGEN", "STORA ESSINGEN"),
    "sodermalm": ("SÖDERMALM", "LÅNGHOLMEN", "REIMERSHOLME", "SÖDRA HAMMARBYHAMNEN"),
    "hagersten-liljeholmen": (
        "ASPUDDEN", "FRUÄNGEN", "GRÖNDAL", "HÄGERSTEN", "HÄGERSTENSÅSEN", "LILJEHOLMEN",
        "MIDSOMMARKRANSEN", "MÄLARHÖJDEN", "VÄSTBERGA", "VÄSTERTORP",
    ),
    "brannkyrka-skarholmen": (
        "HERRÄNGEN", "LISEBERG", "LÅNGBRO", "LÅNGSJÖ", "SOLBERGA", "ÄLVSJÖ", "ÖRBY SLOTT",
        "BREDÄNG", "SÄTRA", "SKÄRHOLMEN", "VÅRBERG",
    ),
    "enskede-skarpnack": (
        "ENSKEDE GÅRD", "ENSKEDEFÄLTET", "ENSKEDEDALEN", "GAMLA ENSKEDE", "JOHANNESHOV", "ÅRSTA",
        "ÖSTBERGA", "BAGARMOSSEN", "BJÖRKHAGEN", "HAMMARBYHÖJDEN", "KÄRRTORP", "SKARPNÄCKS GÅRD", "FLATEN",
    ),
    "farsta-vantor": (
        "BANDHAGEN", "HAGSÄTRA", "HÖGDALEN", "RÅGSVED", "ÖRBY", "STUREBY", "SVEDMYRA",
        "FARSTA", "FARSTA STRAND", "FARSTANÄSET", "FAGERSJÖ", "GUBBÄNGEN", "HÖKARÄNGEN",
        "LARSBODA", "SKÖNDAL", "SKRUBBA", "TALLKROGEN", "ORHEM",
    ),
    "spanga-kista": (
        "AKALLA", "BROMSTEN", "FLYSTA", "HANSTA", "HUSBY", "KISTA", "LUNDA", "RINKEBY", "SOLHEM",
        "SUNDBY", "TENSTA",
    ),
    "hasselby-vallingby": (
        "BLACKEBERG", "GRIMSTA", "HÄSSELBY GÅRD", "HÄSSELBY STRAND", "HÄSSELBY VILLASTAD",
        "KÄLVESTA", "NÄLSTA", "RÅCKSTA", "VINSTA", "VÄLLINGBY",
    ),
    "bromma-vasterled": (
        "ABRAHAMSBERG", "ALVIK", "BECKOMBERGA", "BROMMA KYRKA", "BÄLLSTA", "ENEBY", "HÖGLANDET",
        "MARIEHÄLL", "NOCKEBY", "NOCKEBYHOV", "NORRA ÄNGBY", "OLOVSLUND", "RIKSBY", "SMEDSLÄTTEN",
        "STORA MOSSEN", "SÖDRA ÄNGBY", "TRANEBERG", "ULVSUNDA", "ULVSUNDA INDUSTRIOMR", "ÅKESHOV",
        "ÅKESLUND", "ÅLSTEN", "ÄPPELVIKEN",
    ),
}  # fmt: skip


# Länets kommuner utom Stockholms stad: SCB:s kommunkod -> slug i geometrin. DeSO-koden börjar med
# kommunkoden, så SCB-statistiken kan föras till rätt kommun utan geometri.
MUNICIPALITY_CODES: dict[str, str] = {
    "0114": "upplands-vasby", "0115": "vallentuna", "0117": "osteraker", "0120": "varmdo",
    "0123": "jarfalla", "0125": "ekero", "0126": "huddinge", "0127": "botkyrka", "0128": "salem",
    "0136": "haninge", "0138": "tyreso", "0139": "upplands-bro", "0140": "nykvarn", "0160": "taby",
    "0162": "danderyd", "0163": "sollentuna", "0181": "sodertalje", "0182": "nacka",
    "0183": "sundbyberg", "0184": "solna", "0186": "lidingo", "0187": "vaxholm", "0188": "norrtalje",
    "0191": "sigtuna", "0192": "nynashamn",
}  # fmt: skip


def stadsdel_lookup() -> dict[str, str]:
    """Stadsdelsnamn (versaler, som i stadens data) -> stadsdelsområdets slug."""
    return {name: district for district, names in STADSDELAR.items() for name in names}
