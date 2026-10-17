# Stockholms prislandskap

3D-karta över bostadspriser i Stockholms län: 12 stadsdelsområden i Stockholms stad och 25 kranskommuner, med kr/kvm, prisutveckling, budget och volym.

## Hur det fungerar

- `scripts/scrape.py` hämtar två publika sidor från Svensk Mäklarstatistik och skriver `data/snapshots/ÅÅÅÅ-MM.json`.
- `scripts/build_site.py` bäddar in geometri och senaste ögonblicksbild i `site/template.html` och skriver `site/index.html`.
- `.github/workflows/update.yml` kör båda den 10:e varje månad och publicerar till GitHub Pages.
- `scripts/build_geometry.py` bygger `site/omraden.geojson`. Körs bara om indelningen ändras.

Allt körs i webbläsaren med deck.gl. Ingen server, inga API-nycklar.

## Kom igång

1. Settings → Pages → Source: **GitHub Actions**.
2. Actions → "Uppdatera och publicera" → Run workflow.

Lokalt:

```sh
pip install -r requirements.txt
python scripts/scrape.py && python scripts/build_site.py
open site/index.html
```

## Data och begränsningar

- Statistik: [Svensk Mäklarstatistik](https://www.maklarstatistik.se/omrade/riket/stockholms-lan/). Får citeras med källhänvisning.
- Stadsdelsgränser: Stockholms stad via [krasch/stockholm-stadsdelar](https://github.com/krasch/stockholm-stadsdelar) (CC0). Stadens 117 stadsdelar är grupperade till Mäklarstatistiks 12 områden i `scripts/stadsdel_mapping.py`. Mäklarstatistik definierar sina områden med distriktskoder, så gränserna är en nära men inte exakt motsvarighet (Gamla stan är t.ex. lagd under Vasastan-Norrmalm).
- Kommungränser: SCB:s DeSO, sammanslagna per kommun. Gränserna inkluderar vatten, så skärgårdskommuner ser större ut än sin landyta.
- Villor redovisas bara per kommun; i villaläget får hela Stockholms stad samma värde.
- F = färre än 25 försäljningar, N = icke-representativt. Sådana värden visas grå.
