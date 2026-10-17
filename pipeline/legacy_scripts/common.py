"""Gemensam normalisering av Mäklarstatistiks tabellrader."""
import re

STADSDELAR = {"bromma-vasterled", "brannkyrka-skarholmen", "enskede-skarpnack", "essingen", "farsta-vantor",
              "hagersten-liljeholmen", "hasselby-vallingby", "kungsholmen", "spanga-kista", "sodermalm",
              "vasastan-norrmalm", "ostermalm"}


def slugify(name: str) -> str:
    t = name.strip().lower()
    for a, b in (("å", "a"), ("ä", "a"), ("ö", "o"), (" ", "-")):
        t = t.replace(a, b)
    return t


def num(s: str):
    """'64 714' -> 64714, '+0.1' -> 0.1, 'F'/'N'/'0' -> None med flagga."""
    s = s.replace(" ", " ").strip()
    if s in ("F", "N", "", "-"):
        return None, s or None
    s = s.replace("±", "").replace(" ", "").replace(",", ".")
    v = float(s)
    return (int(v) if v.is_integer() and "." not in s else v), None


def period(cells):
    """Fyra celler: antal sålda, kr/kvm, medelpris, prisutveckling."""
    out, flags = {}, {}
    for key, c in zip(("antal", "kvm", "medelpris", "utv"), cells):
        v, f = num(c)
        if key in ("kvm", "medelpris") and v == 0:
            v, f = None, "0"
        out[key] = v
        if f:
            flags[key] = f
    if flags:
        out["flaggor"] = flags
    return out


def row_to_record(cells):
    """Nio celler: namn + 4 för 3 mån + 4 för 12 mån."""
    return {"namn": cells[0].strip(), "slug": slugify(cells[0]),
            "m3": period(cells[1:5]), "m12": period(cells[5:9])}
