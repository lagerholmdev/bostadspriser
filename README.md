# Stockholms prislandskap

Bostadspriser i Stockholms län på en karta: vad det kostar per kvadratmeter, var en viss budget
räcker och var priserna rör sig. 12 stadsdelsområden i Stockholms stad och länets 25 övriga kommuner,
uppdaterat varje månad från Svensk Mäklarstatistik.

**Live:** https://lagerholmdev.github.io/bostadspriser/

## Vad sajten gör

- **Kartan** svarar på tre frågor: pris per kvm, "Var har jag råd?" (budget och boarea) och
  förändring. Hela läget ligger i adressen, så varje vy går att dela.
- **Områdessidor** (`/omrade/<slug>/`) med nyckeltal, jämförelse mot länet, grannområden och en
  egen delningsbild. Det är dem folk hittar via sök.
- **Jämförelse** (`/jamfor/?omraden=sodermalm,nacka`) av upp till tre områden.

## Så hänger det ihop

```
Mäklarstatistik ──▶ pipeline (Python) ──▶ data/snapshots/   (checkas in, en fil per månad)
                                   └────▶ web/src/generated/ (export enligt kontraktet)
                                   └────▶ web/public/og/     (delningsbilder)
                     web (Astro + TS) ──▶ web/dist ──▶ GitHub Pages
```

| Mapp | Innehåll |
| --- | --- |
| [`pipeline/`](pipeline) | Python-paketet `prislandskap`: skrapa, exportera, rita delningsbilder, bygga geometri |
| [`data/`](data) | Månadsvisa ögonblicksbilder och områdesgeometri |
| [`web/`](web) | Astro-sajten: kartan, områdessidor, jämförelse |
| [`docs/`](docs) | [Arkitektur](docs/architecture.md), [design](docs/design.md), [dataformat](docs/data.md) |

## Kom igång

Kräver Python 3.11+ och Node 22 (`.nvmrc`). Kör från repots rot, i samma terminal:

```sh
# 1. Data
cd pipeline
python -m venv .venv && source .venv/bin/activate
pip install -c requirements.lock -e ".[dev]"   # låsta versioner, samma som i Actions
python -m prislandskap all        # skriver web/src/generated/ och web/public/og/

# 2. Webb
cd ../web
npm ci
npm run dev                       # http://localhost:4321/bostadspriser/
```

Tester och kontroller, från repots rot:

```sh
(cd pipeline && ruff check . && ruff format --check . && pytest)
(cd web && npm run format:check && npm run check && npm test && npm run build)
```

Webbens tester kör mot en fryst kopia av datasetet (`web/src/test/fixtures/`), så de går igenom
oavsett månad. Kontraktstestet `web/src/lib/contract.test.ts` kontrollerar den riktiga exporten och
kräver att `python -m prislandskap export` har körts. Se [docs/architecture.md](docs/architecture.md#tester).

## Uppdatering och publicering

GitHub Actions sköter allt (`.github/workflows/`):

- **ci.yml** kör tester och bygger sajten på varje push och pull request (Python 3.11 och 3.12).
- **deploy.yml** körs vid push till `main`, den 10:e varje månad och manuellt. Den kör först samma
  kontroller som ci.yml, hämtar sedan ny data (vid schemalagd och manuell körning), exporterar,
  kontrollerar och bygger webben med den nya datan, och checkar in ögonblicksbilden först när bygget
  har gått igenom. Sist publiceras sajten till Pages.

Engångsinställning: Settings → Pages → Source: **GitHub Actions**.

Besöksstatistik är frivillig och cookiefri: skapa ett konto på [GoatCounter](https://www.goatcounter.com)
och lägg kodnamnet som repovariabeln `PUBLIC_GOATCOUNTER`.

## Data och licenser

- Statistik: [Svensk Mäklarstatistik](https://www.maklarstatistik.se), citeras med källhänvisning.
- Stadsdelsgränser: Stockholms stad via [krasch/stockholm-stadsdelar](https://github.com/krasch/stockholm-stadsdelar) (CC0).
- Kommungränser: SCB:s DeSO-indelning via [stefur/swemaps-data](https://github.com/stefur/swemaps-data).
- Baskarta: [OpenFreeMap](https://openfreemap.org), © OpenMapTiles, © OpenStreetMaps bidragsgivare.
- Typsnitt: Familjen Grotesk (SIL Open Font License).
- Koden: MIT, se [LICENSE](LICENSE). Data, kartbilder och typsnitt följer källornas villkor.

Se [docs/data.md](docs/data.md) för hur områdena är definierade och vad som saknas.
