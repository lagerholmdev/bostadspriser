# prislandskap

Datapipelinen för Stockholms prislandskap. Den hämtar statistik från Svensk Mäklarstatistik och
skriver de filer som webben läser. Formatet beskrivs i [docs/data.md](../docs/data.md).

```sh
python -m venv .venv && . .venv/bin/activate
pip install -e "pipeline[dev]"      # lägg till ,geo för att bygga om geometrin

python -m prislandskap scrape       # hämta senaste månaden till data/snapshots/ (nätverk)
python -m prislandskap export       # skriv web/src/generated/areas.json och areas.geojson
python -m prislandskap og           # skriv delningsbilder till web/public/og/
python -m prislandskap all          # export + og
python -m prislandskap geometry     # bygg om data/geo/areas.geojson (kräver [geo], sällan)

ruff check pipeline && ruff format --check pipeline
pytest pipeline
```

Alla kommandon går att köra om. Filer som inte ändrats skrivs inte om. Ett fel ger ett meddelande
på svenska och slutkoden 1. Sökvägarna utgår från repots rot. Sätt `PRISLANDSKAP_ROOT` för att köra
mot en annan katalog.

| Modul | Ansvar |
| --- | --- |
| `config.py` | Sökvägar, adresser och konstanter |
| `parse.py` | Tolkar Mäklarstatistiks HTML-tabeller. Rena funktioner. |
| `scrape.py` | Hämtar två sidor och bygger en validerad ögonblicksbild |
| `snapshot.py` | Läser, validerar och skriver `data/snapshots/` |
| `export.py` | Gör om ögonblicksbild och geometri till webbens kontrakt |
| `og.py`, `palette.py` | Delningsbilder och färgerna från `web/src/lib/scales.ts` |
| `geometry.py`, `mapping.py` | Bygger områdesgeometrin, med stadsdel → stadsdelsområde |
| `models.py`, `text.py`, `geojson.py` | Typer, svensk text och GeoJSON utan geobibliotek |

Testerna kör mot HTML-fixturer i `tests/fixtures/`, eftersom de inte når Mäklarstatistik.
`county.html` och `city.html` innehåller samma siffror som `data/snapshots/2026-10.json`, så testet
`test_scraper_rebuilds_checked_in_snapshot_from_html` visar att skrapan återskapar den incheckade
filen exakt. Ändras sidstrukturen hos Mäklarstatistik är det fixturerna och `parse.py` som ska
uppdateras.
