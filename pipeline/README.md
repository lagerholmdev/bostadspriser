# prislandskap

Datapipelinen för Stockholms prislandskap. Den hämtar statistik från Svensk Mäklarstatistik och
skriver de filer som webben läser. Formatet beskrivs i [docs/data.md](../docs/data.md).

Kör från `pipeline/`:

```sh
python -m venv .venv && source .venv/bin/activate
pip install -c requirements.lock -e ".[dev]"   # ".[dev,geo]" för att bygga om geometrin

python -m prislandskap scrape       # hämta senaste månaden till data/snapshots/ (nätverk)
python -m prislandskap export       # skriv web/src/generated/areas.json och areas.geojson
python -m prislandskap og           # skriv delningsbilder till web/public/og/
python -m prislandskap all          # export + og
python -m prislandskap geometry     # bygg om data/geo/areas.geojson (kräver [geo], sällan)

ruff check . && ruff format --check .
pytest
```

Alla kommandon går att köra om. Filer som inte ändrats skrivs inte om. Ett fel ger ett meddelande
på svenska och slutkoden 1. Sökvägarna utgår från repots rot, som hittas genom att gå uppåt från
paketet och sedan från arbetskatalogen tills en katalog innehåller både `data/` och `web/`. Det
fungerar alltså även utan redigerbar installation, så länge kommandot körs inifrån repot. Sätt
`PRISLANDSKAP_ROOT` för att peka ut roten uttryckligen.

### Låsta versioner

`pyproject.toml` anger tillåtna intervall. `requirements.lock` låser exakta versioner (även
transitiva och dev-verktygen) så att månadskörningen i Actions blir reproducerbar; den används som
constraints-fil (`-c`), så paketet självt installeras fortfarande från `pyproject.toml`. Uppdatera
låsningen med [pip-tools](https://pip-tools.readthedocs.io) och kör testerna på 3.11 och 3.12:

```sh
pip install pip-tools
pip-compile --extra dev --strip-extras --output-file requirements.lock pyproject.toml
```

| Modul | Ansvar |
| --- | --- |
| `config.py` | Sökvägar, adresser och konstanter |
| `parse.py` | Tolkar Mäklarstatistiks HTML-tabeller. Rena funktioner. |
| `scrape.py` | Hämtar två sidor och bygger en validerad ögonblicksbild |
| `snapshot.py` | Läser, validerar och skriver `data/snapshots/` |
| `export.py` | Gör om ögonblicksbild och geometri till webbens kontrakt |
| `og.py`, `palette.py` | Delningsbilder. Färgskalorna läses från `design/scales.json`, samma fil som webben använder |
| `geometry.py`, `mapping.py` | Bygger områdesgeometrin, med stadsdel → stadsdelsområde |
| `models.py`, `text.py`, `geojson.py` | Typer, svensk text och GeoJSON utan geobibliotek |

Testerna kör mot HTML-fixturer i `tests/fixtures/`, eftersom de inte når Mäklarstatistik.
`county.html` och `city.html` innehåller samma siffror som `data/snapshots/2026-10.json`, så testet
`test_scraper_rebuilds_checked_in_snapshot_from_html` visar att skrapan återskapar den incheckade
filen exakt. Ändras sidstrukturen hos Mäklarstatistik är det fixturerna och `parse.py` som ska
uppdateras.
