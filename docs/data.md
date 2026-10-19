# Data

Hur siffrorna kommer till: källor, formatet på disk, kontraktet mot webben och vad som händer när
ett värde saknas. Koden finns i `pipeline/src/prislandskap/`.

## Källor och licenser

| Vad | Källa | Licens |
| --- | --- | --- |
| Bostadspriser | [Svensk Mäklarstatistik](https://www.maklarstatistik.se/omrade/riket/stockholms-lan/), två publika sidor: Stockholms län och Stockholms stad | Får citeras med källhänvisning. Källan anges på varje sida och delningsbild. |
| Stadsdelsgränser | Stockholms stads stadskarta via [krasch/stockholm-stadsdelar](https://github.com/krasch/stockholm-stadsdelar) | CC0 |
| Kommungränser | SCB:s DeSO via [stefur/swemaps-data](https://github.com/stefur/swemaps-data), sammanslagna per kommun | Öppna data från SCB |
| Områdesstatistik | SCB:s [Statistikdatabas](https://www.statistikdatabasen.scb.se/) (PxWebApi 2.0), DeSO 2025, och DeSO-gränserna från [SCB:s öppna geodata](https://www.scb.se/hitta-statistik/regional-statistik-och-kartor/geodata/oppna-geodata/deso--demografiska-statistikomraden/) | CC0 |
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

## SCB-statistik: `data/scb/`

Hämtas årsvis av `.github/workflows/scb.yml` (och manuellt), aldrig av månadsjobbet. Två filer,
båda incheckade:

- `deso.csv`, från `python -m prislandskap deso`: varje DeSO (2025) i länet och området den räknas
  till. Kommunerna följer av DeSO-koden. I Stockholms stad går varje DeSO helt till det
  stadsdelsområde den överlappar mest, räknat på landytan. Kolumnen `andel` visar hur ren
  tilldelningen är: 567 av 569 DeSO ligger till minst 90 % i ett område. Kommandot avbryter om
  under 98 % gör det.
- `kontext.json`, från `python -m prislandskap scb`: fyra andelar och ett antal per område och
  för länet, med år per mått.

| Mått | Nyckel | SCB-tabell | Beräkning |
| --- | --- | --- | --- |
| Hushåll med barn | `families` | TAB6568 | (sammanboende + ensamstående med barn) / alla hushåll |
| Hög inkomst | `highIncome` | TAB6679 | andel 20+ år i rikets översta fjärdedel, sammanräknad förvärvsinkomst |
| Lång eftergymnasial utbildning | `higherEducation` | TAB6534 | 3 år eller mer / alla 25–65 år |
| 25–44 år | `age25to44` | TAB6574 | 25–44 år / hela befolkningen |
| Bostadsrätter | `condos` | TAB6638 | antal; nämnaren i omsättningsgraden |

Allt summeras som antal, aldrig som andelar eller medianer, så stadsdelsområdena blir exakta
summor av sina DeSO. Därför finns ingen medianinkomst: medianer går inte att slå ihop. Kommuner och
länet hämtas med egna regionkoder där tabellen har dem (bostadsrättstabellen har bara DeSO). SCB
lägger sedan 2025 in ett litet slumpbrus för att skydda enskilda, så delar summerar inte alltid
exakt till totalen.

```jsonc
{
  "schema": 1,
  "fetched": "2026-10-19",
  "source": { "name": "SCB", "url": "https://www.statistikdatabasen.scb.se/" },
  "years": { "families": "2025", "highIncome": "2024", "higherEducation": "2025", "age25to44": "2025", "condos": "2025" },
  "county": { "families": 0.3118, "highIncome": 0.34, "higherEducation": 0.398, "age25to44": 0.2931, "condos": 494577 },
  "areas": { "sodermalm": { … }, … }   // 37 områden
}
```

## Geometri: `data/geo/areas.geojson`

Byggs av `python -m prislandskap geometry` (kräver `pip install -c requirements.lock -e ".[dev,geo]"` i `pipeline/`) och checkas in.
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
  context: { source: { name: string; url: string }; years: Record<ContextKey, string>; county: AreaContext } | null;
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
  context: AreaContext | null;              // SCB, null om data/scb/kontext.json saknas
}

interface AreaContext {                     // andelar 0–1, condos ett antal
  families: number | null;
  highIncome: number | null;
  higherEducation: number | null;
  age25to44: number | null;
  condos: number | null;
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

Alla bilder har märket (tre gavlar, som `Logo.astro`) bredvid sajtnamnet. Färgerna, prisklasserna,
förändringens fem steg och budgetens marginal läses från `design/scales.json`, samma fil som
`web/src/lib/scales.ts` importerar, så bilderna och kartan visar samma färger.

- **Få affärer:** färre än 60 sålda bostadsrätter på tre månader (samma gräns som `THIN_SALES.m3` i
  `web/src/lib/data.ts`) ger raden "Få affärer, osäkert värde".
- **Avlägsna kommuner:** har kommunen högst två grannar (som Nykvarn) visas ett vidare utsnitt med de
  närmaste områdena utmärkta, så att man ser var den ligger.
- **Förändring** visas i fem steg som på kartan (gränser ±1 och ±4 % på ett år).
