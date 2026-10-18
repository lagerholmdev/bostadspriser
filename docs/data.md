# Data

Hur siffrorna kommer till: källor, formatet på disk, kontraktet mot webben och vad som händer när
ett värde saknas. Koden finns i `pipeline/src/prislandskap/`.

## Källor och licenser

| Vad | Källa | Licens |
| --- | --- | --- |
| Bostadspriser | [Svensk Mäklarstatistik](https://www.maklarstatistik.se/omrade/riket/stockholms-lan/), två publika sidor: Stockholms län och Stockholms stad | Får citeras med källhänvisning. Källan anges på varje sida och delningsbild. |
| Stadsdelsgränser | Stockholms stads stadskarta via [krasch/stockholm-stadsdelar](https://github.com/krasch/stockholm-stadsdelar) | CC0 |
| Kommungränser | SCB:s DeSO via [stefur/swemaps-data](https://github.com/stefur/swemaps-data), sammanslagna per kommun | Öppna data från SCB |
| Typsnitt i delningsbilderna | Familjen Grotesk, `pipeline/src/prislandskap/assets/fonts/` | SIL OFL 1.1 (`OFL.txt`) |

Mäklarstatistik publicerar runt den 8:e varje månad. `deploy.yml` hämtar den 10:e.

## Områden

37 ytor: Stockholms stads 12 stadsdelsområden och länets 25 övriga kommuner. Stockholms stad finns
också som kommun i statistiken (alltså 26 kommuner i ögonblicksbilden) men har ingen egen yta,
eftersom den täcks av stadsdelsområdena. Dess villastatistik används för stadsdelsområdena.

### Stadsdelsområdena och Mäklarstatistiks distrikt

Mäklarstatistik bygger sina stadsdelsområden av distrikt (tidigare församlingar), enligt
[Geografisk indelning](https://www.maklarstatistik.se/geografisk-indelning/):

| Område | Distriktskoder |
| --- | --- |
| Vasastan-Norrmalm | 215020, 215021, 215022, 215023, 215025 |
| Östermalm | 215026, 215027, 215028 |
| Kungsholmen | 215018, 215019 |
| Essingen | 215003 |
| Södermalm | 212099, 212100, 212101, 212102 |
| Hägersten-Liljeholmen | 212098 |
| Brännkyrka-Skärholmen | 212092, 212096 |
| Enskede-Skarpnäck | 212095, 212097 |
| Farsta-Vantör | 212093, 212094 |
| Spånga-Kista | 215014, 215017 |
| Hässelby-Vällingby | 215009, 215011 |
| Bromma-Västerled | 215012, 215013 |

Distriktsgränserna finns inte som öppna data i en form vi kan använda, så kartan bygger områdena av
stadens 117 stadsdelar i stället. Grupperingen står i `mapping.py` och testas mot källans namnlista.
Den är en nära men inte exakt motsvarighet. Kända gränsfall: Gamla stan, Riddarholmen och
Skeppsholmen ligger under Vasastan-Norrmalm, och Orhem under Farsta-Vantör.

Stadens sida har också raderna "Stockholm" och "Centrala Stockholm" (summan av de fem centrala
områdena). Skrapan hoppar över dem.

## Saknade värden

Mäklarstatistik visar en kod i stället för ett tal när ett värde saknas. Pipelinen sätter då
värdet till `null` och lägger koden i `missing`:

| Kod | Betyder | Exempel |
| --- | --- | --- |
| `F` | För få affärer, under 25 på tre månader | Villor i Solna: prisutveckling saknas |
| `N` | Icke-representativt | Förekommer främst för fritidshus |
| `0` | Ingen data. Används för kr/kvm och medelpris 0, och för tomma celler | |

Ett antal sålda på 0 är ett riktigt värde och sparas som `0`. Prisutvecklingen `±0.0` är också ett
riktigt värde och sparas som `0.0`.

```json
{ "sales": 4, "pricePerSqm": 76057, "meanPrice": 13025000, "change": null, "missing": { "change": "F" } }
```

## Ögonblicksbild: `data/snapshots/ÅÅÅÅ-MM.json`

En fil per publiceringsmånad, skriven av `python -m prislandskap scrape` och incheckad. Filnamnet
kommer från publiceringsdatumet. Skrapan validerar filen innan den skrivs: exakt 12 kända
stadsdelsområden och 26 kommuner, inklusive Stockholms stad. Annars avbryter den utan att skriva.
Att köra den igen samma månad ändrar inget.

```jsonc
{
  "schema": 2,
  "updated": "2026-10-08",              // Mäklarstatistiks "Uppdaterat:"-datum
  "source": { "name": "Svensk Mäklarstatistik", "url": "https://www.maklarstatistik.se/omrade/riket/stockholms-lan/" },
  "county": {                           // raden "Stockholms län"
    "name": "Stockholms län",
    "apartment": { "m3": Stat, "m12": Stat },
    "house":     { "m3": Stat, "m12": Stat }
  },
  "areas": [
    {
      "slug": "sodermalm",              // samma slug som i geometrin
      "name": "Södermalm",
      "kind": "district",               // "district" | "municipality"
      "apartment": { "m3": Stat, "m12": Stat },
      "house": null                     // stadsdelsområden har ingen egen villastatistik
    }
  ]
}
```

`Stat` har samma form som i kontraktet nedan. `m3` och `m12` är de 3 respektive 12 senaste hela
månaderna före publiceringsmånaden. Prisutvecklingen (`change`) räknas i båda fallen på de senaste tre
månaderna: `m3.change` mot de tre månaderna innan, `m12.change` mot samma tre månader året innan
(Mäklarstatistiks metod, glidande tremånadersmedel).

Schema 1 (svenska nycklar, före oktober 2026) finns inte kvar. Den enda filen migrerades med
oförändrade siffror.

## Geometri: `data/geo/areas.geojson`

Byggs av `python -m prislandskap geometry` (kräver `pip install -e "pipeline[geo]"`) och checkas in.
Körs bara när indelningen ändras. Varje feature har egenskaperna:

| Fält | Typ | Innehåll |
| --- | --- | --- |
| `slug` | string | t.ex. `"upplands-vasby"` |
| `name` | string | t.ex. `"Upplands Väsby"` |
| `kind` | `"district"` \| `"municipality"` | |
| `label` | [lon, lat] | Etikettpunkt, polylabel på den största delytan. Ligger alltid inuti ytan. |
| `neighbours` | string[] | Slugs för ytor inom 1 km |

Så byggs den: stadsdelarna slås ihop per stadsdelsområde och glipor under 20 m sluts. Hål under
4 ha tas bort. Kommunerna slås ihop från DeSO. Allt förenklas med 25 m tolerans, och varje yta
krymps 15 m så att grannarnas kanter inte sammanfaller. Koordinaterna avrundas till 5 decimaler,
ungefär 1 m. Kommungränserna inkluderar vatten, så skärgårdskommuner ser större ut än sin landyta.

## Export: kontraktet mot webben

`python -m prislandskap export` läser den senaste ögonblicksbilden och geometrin och skriver två
filer till `web/src/generated/`. Den mappen checkas inte in. Typerna finns i
`web/src/lib/types.ts`. Ändras formatet ändras typerna, `export.py` och den här filen i samma commit.

### `areas.json`: `Dataset`

```ts
interface Dataset {
  updated: string;                          // "2026-10-08"
  periods: { m3: string; m12: string };     // { m3: "jul–sep 2026", m12: "okt 2025–sep 2026" }
  source: { name: string; url: string };
  county: { name: string; apartment: StatsByPeriod; house: StatsByPeriod };
  areas: Area[];                            // 37 st, sorterade på namn i svensk ordning (Å, Ä, Ö sist)
}

interface Area {
  slug: string;
  name: string;
  kind: "district" | "municipality";
  label: [number, number];                  // [lon, lat], från geometrin
  neighbours: string[];                     // från geometrin
  bbox: [number, number, number, number];   // [väst, syd, öst, nord], beräknad från ytan
  apartment: StatsByPeriod | null;
  house: StatsByPeriod | null;
  houseScope: "area" | "city" | null;
}

type StatsByPeriod = { m3: Stat; m12: Stat };

interface Stat {
  sales: number | null;                     // heltal
  pricePerSqm: number | null;               // heltal, kr
  meanPrice: number | null;                 // heltal, kr
  change: number | null;                    // procent, en decimal
  missing?: Partial<Record<"sales" | "pricePerSqm" | "meanPrice" | "change", "F" | "N" | "0">>;
}
```

Regler för villastatistiken:

- **Stadsdelsområden:** `house` är Stockholms stads villastatistik och `houseScope` är `"city"`.
  Mäklarstatistik redovisar inte villor per stadsdel.
- **Kommuner:** `house` är kommunens egen statistik och `houseScope` är `"area"`. Saknas
  villastatistik blir båda `null`.

Perioderna räknas fram från `updated`, med årsskifte (`2027-01-08` ger `okt–dec 2026` och
`jan 2026–dec 2026`). Startmånaden får årtal bara när perioden går över ett årsskifte.

### `areas.geojson`

Samma ytor som `data/geo/areas.geojson`, med bara `slug` som egenskap. Koordinaterna är avrundade
till 5 decimaler. Allt annat om ytan finns i `areas.json`.

## Delningsbilder: `web/public/og/`

`python -m prislandskap og` ritar 41 PNG-bilder i 1200×630, omkring 30–65 kB styck. Mappen
checkas inte in.

| Fil | Innehåll |
| --- | --- |
| `start.png` | Länets snittpris, karta över Stockholms stad |
| `pris.png`, `budget.png`, `forandring.png` | En bild per vy: dyrast område, hur många områden 5 mkr räcker i för 60 kvm, största prisökningen |
| `<slug>.png` | Ett område: kr/kvm, jämfört med länets snitt, antal affärer och karta med grannarna |

Färgerna och prisklasserna är desamma som i `web/src/lib/scales.ts` och finns i `palette.py`.
