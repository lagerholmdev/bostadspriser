"""Hämtar aktuell statistik från Svensk Mäklarstatistiks publika områdessidor.

Två sidor räcker för hela kartan:
- Stockholms län: en tabell per bostadstyp med alla 26 kommuner (bostadsrätter först, sedan villor)
- Stockholms stad: bostadsrättstabell med de 12 stadsdelsområdena

Skriver data/snapshots/ÅÅÅÅ-MM.json. Avbryter utan att skriva om något område saknas.
Källa: Svensk Mäklarstatistik. Statistiken får citeras med källhänvisning.
"""
import json
import re
import sys
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup

sys.path.insert(0, str(Path(__file__).parent))
from common import STADSDELAR, row_to_record  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://www.maklarstatistik.se/omrade/riket/stockholms-lan/"
URL_LAN = BASE
URL_STAD = BASE + "stockholm/"
HEADERS = {"User-Agent": "bostadspriser-karta (github.com/lagerholmdev/bostadspriser)"}
MANADER = ["januari", "februari", "mars", "april", "maj", "juni", "juli", "augusti",
           "september", "oktober", "november", "december"]


def fetch(url: str) -> BeautifulSoup:
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    return BeautifulSoup(r.text, "html.parser")


def tables(soup: BeautifulSoup) -> list[dict]:
    """Varje statistiktabell som {slug: post}. Rader känns igen på en länk till /omrade/ i första cellen."""
    out = []
    for t in soup.find_all("table"):
        rows = {}
        for tr in t.find_all("tr"):
            cells = tr.find_all(["td", "th"])
            if len(cells) < 9 or not cells[0].find("a", href=re.compile(r"/omrade/")):
                continue
            rec = row_to_record([c.get_text(" ", strip=True) for c in cells[:9]])
            rows[rec["slug"]] = rec
        if rows:
            out.append(rows)
    return out


def updated(soup: BeautifulSoup) -> str:
    m = re.search(r"Uppdaterat:\s*(\d{1,2})\s+(\w+)\s+(\d{4})", soup.get_text(" "))
    if not m:
        raise SystemExit("Hittade inget uppdateringsdatum")
    d, mon, y = m.groups()
    return f"{y}-{MANADER.index(mon.lower()) + 1:02d}-{int(d):02d}"


def main() -> None:
    lan = fetch(URL_LAN)
    time.sleep(1)
    stad = fetch(URL_STAD)

    lan_tabs, stad_tabs = tables(lan), tables(stad)
    if len(lan_tabs) < 2 or not stad_tabs:
        raise SystemExit(f"Oväntad sidstruktur: {len(lan_tabs)} länstabeller, {len(stad_tabs)} stadstabeller")
    br_kommun, villa_kommun, br_stad = lan_tabs[0], lan_tabs[1], stad_tabs[0]

    omraden = []
    for slug, r in br_stad.items():
        if slug in STADSDELAR:
            omraden.append({"slug": slug, "namn": r["namn"], "typ": "stadsdel", "br": {"m3": r["m3"], "m12": r["m12"]}})
    for slug, r in br_kommun.items():
        if slug in ("riket", "stockholms-lan"):
            continue
        rec = {"slug": slug, "namn": r["namn"], "typ": "kommun", "br": {"m3": r["m3"], "m12": r["m12"]}}
        if slug in villa_kommun:
            rec["villa"] = {"m3": villa_kommun[slug]["m3"], "m12": villa_kommun[slug]["m12"]}
        omraden.append(rec)

    n_sd = sum(o["typ"] == "stadsdel" for o in omraden)
    n_km = sum(o["typ"] == "kommun" for o in omraden)
    if n_sd != 12 or n_km != 26:
        raise SystemExit(f"Fel antal områden: {n_sd} stadsdelar (väntat 12), {n_km} kommuner (väntat 26)")

    lan_rad = lambda tab: {"m3": tab["stockholms-lan"]["m3"], "m12": tab["stockholms-lan"]["m12"]}
    datum = updated(lan)
    snap = {
        "uppdaterad": datum,
        "period": period_labels(datum),
        "kalla": "Svensk Mäklarstatistik",
        "omraden": omraden,
        "lan": {"namn": "Stockholms län", "br": lan_rad(br_kommun), "villa": lan_rad(villa_kommun)},
    }
    out = ROOT / "data" / "snapshots" / f"{datum[:7]}.json"
    out.write_text(json.dumps(snap, ensure_ascii=False, indent=1))
    print(f"Skrev {out} ({len(omraden)} områden, uppdaterad {datum})")


def period_labels(datum: str) -> dict:
    """Mäklarstatistik räknar på de tre (tolv) senaste hela månaderna före publiceringsmånaden."""
    y, m = int(datum[:4]), int(datum[5:7])
    def back(n):
        mm = m - n
        yy = y + (mm - 1) // 12
        return yy, (mm - 1) % 12 + 1
    kort = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"]
    y1, m1 = back(1)
    y3, m3 = back(3)
    y12, m12 = back(12)
    return {"m3": f"{kort[m3 - 1]}–{kort[m1 - 1]} {y1}",
            "m12": f"{kort[m12 - 1]} {y12}–{kort[m1 - 1]} {y1}"}


if __name__ == "__main__":
    main()
