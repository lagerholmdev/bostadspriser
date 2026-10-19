# Arkitektur

Två delar med ett tydligt kontrakt emellan: en Python-pipeline som hämtar och förädlar data, och en
statisk webbplats i Astro och TypeScript. Ingen server. Allt byggs i GitHub Actions och publiceras
på GitHub Pages.

```
.
├── pipeline/                 Python: hämta, bearbeta, exportera
│   ├── src/prislandskap/     paketet (cli, scrape, export, og, geometry …)
│   ├── tests/                pytest, med HTML-fixturer
│   └── requirements.lock     låsta versioner för Actions (pip-compile)
├── data/
│   ├── snapshots/            en JSON per månad från Mäklarstatistik (källan, checkas in)
│   ├── scb/                  SCB:s områdesstatistik och DeSO-mappningen (årsvis, checkas in)
│   └── geo/areas.geojson     områdesgeometri (byggs sällan, checkas in)
├── web/                      Astro + TypeScript
│   ├── src/pages/            kartan, områdessidor, jämförelse, om
│   ├── src/components/       Astro-komponenter
│   ├── src/scripts/          klientkod (kartan och interaktion)
│   ├── src/lib/              delad logik utan DOM: data, format, skalor, budget, url
│   ├── src/generated/        skrivs av pipelinen, checkas inte in
│   ├── src/test/             delade tester och fixtures/ (fryst export, oktober 2026)
│   └── public/og/            delningsbilder, skrivs av pipelinen, checkas inte in
├── design/scales.json        färgskalor och budgetmarginal, delas av webben och pipelinen
├── docs/                     arkitektur, design, data
└── .github/
    ├── workflows/            ci.yml och deploy.yml
    └── actions/              gemensamma steg: pipeline-setup, web-build
```

## Dataflöde

```
Mäklarstatistik ──scrape──▶ data/snapshots/ÅÅÅÅ-MM.json
                                     │
data/geo/areas.geojson ──────────────┤
SCB ──deso, scb (årsvis)──▶ data/scb/ ┤
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

Från repots rot, i samma terminal:

```sh
# Pipeline
cd pipeline
pip install -c requirements.lock -e ".[dev]"   # ".[dev,geo]" för att bygga om geometrin
python -m prislandskap scrape      # hämta ny månad
python -m prislandskap export      # skriv web/src/generated/
python -m prislandskap og          # skriv web/public/og/
python -m prislandskap deso && python -m prislandskap scb  # SCB, årsvis i scb.yml
ruff check . && ruff format --check . && pytest

# Webb
cd ../web
npm ci
npm run dev                        # http://localhost:4321/bostadspriser/
npm run format:check && npm run check && npm test && npm run build
```

## Tester

- **Pipeline:** pytest mot HTML-fixturer och den incheckade ögonblicksbilden. Körs på Python 3.11
  och 3.12.
- **Webb, fryst fixtur:** vitest kör mot `web/src/test/fixtures/areas.json` och `areas.geojson`, en
  exakt kopia av exporten från oktober 2026. `web/vitest.config.ts` styr om alla importer av
  `src/generated/areas.json` och `areas.geojson` (även `?raw`/`?url`) dit, bara i testerna. Därför kan
  testerna innehålla exakta siffror utan att nästa månads data får dem att fallera. Bygget och
  dev-servern läser alltid de riktiga filerna. Fixturen byts bara medvetet: kopiera en ny export dit och
  uppdatera testernas förväntade värden i samma commit.
- **Webb, kontraktet:** `web/src/lib/contract.test.ts` läser den riktiga `src/generated/areas.json`
  med `node:fs` (förbi omstyrningen) och kontrollerar den mot `types.ts`: nycklar och typer för
  Dataset, Area och Stat, `kind`, att `houseScope` är `null` om och endast om `house` är det, att
  saknade värden har koden F, N eller 0, att etikettpunkten ligger i bbox, att grannarna finns, och 12
  stadsdelsområden och 25 kommuner. Saknas exporten hoppas testet över med ett meddelande.
- **Webb, designsystemet:** `web/src/test/design.test.ts` kontrollerar att `scales.ts` och
  `styles/tokens.css` har samma skalfärger som `design/scales.json`.

## Publicering

`ci.yml` körs på pull requests. `deploy.yml` anropar den (workflow_call)
som första jobb, så kontrollerna inte kan glida isär. Stegen för att installera pipelinen och
kontrollera och bygga webben ligger i `.github/actions/` och används av båda.

`deploy.yml` i ordning: CI → hämta ny månad (schemalagt och manuellt) → export och delningsbilder →
format, typkontroll, tester och bygge med den nya datan → checka in ögonblicksbilden (bara om allt
gick igenom) → ladda upp och publicera på Pages. Ett fel i den nya datan stoppar alltså publiceringen
utan att något checkas in, och sajten ligger kvar på förra månaden.

`scb.yml` körs den 4 maj och manuellt. Den bygger DeSO-mappningen, hämtar SCB-statistiken, kör
samma kontroller som månadsjobbet och checkar in `data/scb/` om något ändrats. Sedan startar den
`deploy.yml`, eftersom en push från Actions inte startar andra arbetsflöden av sig själv.

## Beslut

- **Astro**: statiska sidor per område för sök och delning, och lite klientkod bara där den behövs
  (kartan, jämförelsen). Ingen ramverksruntime på sidor som inte behöver det.
- **MapLibre GL** för kartan, med OpenFreeMaps ljusa stil "Positron" som bakgrund (gratis, ingen
  nyckel). Områdesfärgerna ritas under baskartans vattenlager, så hav och sjöar täcker dem och
  kustlinjen blir rätt även där kommungränserna går ut i vattnet. Går baskartan inte att nå används
  en enkel reservstil.
- **Python för data**: skrapan, geometrin och delningsbilderna. Pillow ritar bilderna; inga
  webbläsare i bygget.
- **SCB i ett eget årsjobb**: SCB:s tabeller uppdateras en gång om året. Att hålla dem utanför
  månadsjobbet gör att ett fel hos SCB aldrig stoppar en prisuppdatering.
- **Data i git**: varje månads ögonblicksbild checkas in. Det ger historik gratis och gör varje
  bygge reproducerbart.
