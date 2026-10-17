# Arkitektur

Två delar med ett tydligt kontrakt emellan: en Python-pipeline som hämtar och förädlar data, och en
statisk webbplats i Astro och TypeScript. Ingen server. Allt byggs i GitHub Actions och publiceras
på GitHub Pages.

```
.
├── pipeline/                 Python: hämta, bearbeta, exportera
│   ├── src/prislandskap/     paketet (cli, scrape, export, og, geometry …)
│   └── tests/                pytest, med HTML-fixturer
├── data/
│   ├── snapshots/            en JSON per månad från Mäklarstatistik (källan, checkas in)
│   └── geo/areas.geojson     områdesgeometri (byggs sällan, checkas in)
├── web/                      Astro + TypeScript
│   ├── src/pages/            kartan, områdessidor, jämförelse, om
│   ├── src/components/       Astro-komponenter
│   ├── src/scripts/          klientkod (kartan och interaktion)
│   ├── src/lib/              delad logik utan DOM: data, format, skalor, budget, url
│   ├── src/generated/        skrivs av pipelinen, checkas inte in
│   └── public/og/            delningsbilder, skrivs av pipelinen, checkas inte in
├── docs/                     arkitektur, design, data
└── .github/workflows/        ci.yml och deploy.yml
```

## Dataflöde

```
Mäklarstatistik ──scrape──▶ data/snapshots/ÅÅÅÅ-MM.json
                                     │
data/geo/areas.geojson ──────────────┤
                                     ▼
                        export ──▶ web/src/generated/areas.json      (Dataset, se docs/data.md)
                                   web/src/generated/areas.geojson   (geometri)
                        og     ──▶ web/public/og/*.png               (delningsbilder)
                                     │
                                     ▼
                        astro build ──▶ web/dist ──▶ GitHub Pages
```

Kontraktet är typerna i `web/src/lib/types.ts`. Pipelinen äger formatet på disk, webben läser det.
Ändras det ena ändras det andra i samma commit.

## Kommandon

```sh
# Pipeline
cd pipeline
pip install -e ".[dev]"            # lägg till [geo] för att bygga om geometrin
python -m prislandskap scrape      # hämta ny månad
python -m prislandskap export      # skriv web/src/generated/
python -m prislandskap og          # skriv web/public/og/
pytest

# Webb
cd web
npm ci
npm run dev                        # http://localhost:4321/bostadspriser/
npm run check && npm test && npm run build
```

## Beslut

- **Astro**: statiska sidor per område för sök och delning, och lite klientkod bara där den behövs
  (kartan, jämförelsen). Ingen ramverksruntime på sidor som inte behöver det.
- **MapLibre GL** för kartan, med OpenFreeMaps ljusa stil "Positron" som bakgrund (gratis, ingen
  nyckel). Områdesfärgerna ritas under baskartans vattenlager, så hav och sjöar täcker dem och
  kustlinjen blir rätt även där kommungränserna går ut i vattnet. Går baskartan inte att nå används
  en enkel reservstil.
- **Python för data**: skrapan, geometrin och delningsbilderna. Pillow ritar bilderna; inga
  webbläsare i bygget.
- **Data i git**: varje månads ögonblicksbild checkas in. Det ger historik gratis och gör varje
  bygge reproducerbart.
