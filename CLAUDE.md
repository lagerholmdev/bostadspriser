# Stockholms prislandskap

Python-pipeline som skrapar Mäklarstatistik och en statisk Astro/TypeScript-sajt med MapLibre-karta.
Läs bara det dokument uppgiften kräver:

- `docs/architecture.md` – mappstruktur, dataflöde, kommandon, tester, publicering
- `docs/data.md` – källor, områden, saknade värden, formatet på disk
- `docs/design.md` – färger, skalor, typografi

Kontraktet mellan pipeline och webb är `web/src/lib/types.ts`. Ändras det ena ändras det andra i samma commit.

## Kommandon

```sh
(cd pipeline && ruff check . && ruff format --check . && pytest)
(cd web && npm run format:check && npm run check && npm test && npm run build)
(cd pipeline && python -m prislandskap export)   # krävs för contract.test.ts
```

Kör bara den del som berörs av ändringen. Hela kedjan körs först innan commit.

## Läs aldrig hela dessa filer

De är stora och ofta en enda rad, så en sökträff dumpar hela filen:

- alla `*.geojson` (en rad på över 100 KB), allt under `web/src/generated/`
- `web/package-lock.json`, `pipeline/tests/fixtures/*.html`

Ändra dem med pipelinen, npm eller ett skript, aldrig för hand.

`web/src/test/fixtures/areas.json` och `data/snapshots/*.json` är formaterade och går att läsa när
testernas förväntade värden ska uppdateras. Annars räcker `jq`.

Behöver du något ur filerna: använd `jq` eller `head -c`, t.ex.
`jq '.features[].properties.slug' data/geo/areas.geojson` eller `jq '.areas[0]' web/src/generated/areas.json`.
Sök i kod med Grep-verktyget (respekterar .gitignore), aldrig `grep -r` från roten (träffar `node_modules`).

## Kartan

Etikett-, kamera- och färglogik ligger i `web/src/scripts/map/` och `web/src/lib/`. Lägg logiken i
rena funktioner och verifiera med vitest. Ta skärmdump i webbläsaren först när testerna går igenom,
och då en gång, inte efter varje ändring.

## Stil

Svenska i UI, docs och commit-meddelanden. Prettier för webben, ruff för Python.
