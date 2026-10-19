# Design

Stockholms prislandskap ska kännas som ett sakligt verktyg av människor som bor i stan, inte som en
dashboard. Ljust, lugnt och läsbart för någon som aldrig använt en karttjänst.

## Vem använder det, och vad vill de

Sidan svarar på tre frågor. Varje fråga är en egen vy, och vyerna heter som frågan.

| Vem | Fråga | Vy |
| --- | --- | --- |
| Köpare i sökfas | Var har jag råd med en trea för 5 mkr? | Var har jag råd? |
| Köpare och nyfikna | Vad kostar det i olika delar av Stockholm? | Pris per kvm |
| Ägare och media | Hur går det för mitt område? Var rör sig priserna? | Förändring, områdessidan |

Köparen kommer tillbaka under 3–6 månader och delar länkar med sin partner. Allt ska därför gå att
dela, och läget ska ligga i adressen.

## Principer

1. **En fråga åt gången.** Användaren väljer vad hen vill veta, inte vilken dimension som ska
   utforskas. Ingen vy har fler än två reglage.
2. **Kartan stöder, listan svarar.** Varje vy har en lista som ger svaret i text. Kartan visar var.
   Allt som går att göra på kartan går också att göra i listan, med tangentbord.
3. **Visa osäkerhet.** Antal affärer syns intill varje pris. Värden med få affärer är randiga, på
   kartan och i listorna, och säger det i klartext. Villapriser med under 10 affärer visas inte alls.
4. **Svenska och vardagsord.** "Pris per kvm", inte "kr/kvm-medel". "Senaste 3 månaderna", inte "m3".
   Siffror med mellanslag som tusentalsavgränsare och komma som decimaltecken.
5. **Mobilen först.** Allt fungerar på 360 px. På mobil fungerar sidan som en kartapp (Google Maps):
   kartan fyller skärmen och flyttas med ett finger, sökfältet och vyerna flyter överst och panelen
   dras upp nerifrån i tre lägen (kik, halv, hel). Kameran centrerar i den del av kartan som syns.
   Utan JavaScript ligger kartan överst och innehållet under, i vanligt sidflöde.
6. **Kikläget svarar på frågan.** Det man ser utan att dra är vyns svar, inte en rubrik: länets snitt
   och dyrast/billigast, båda budgetreglagen och hur många områden som räcker, länets förändring och
   antal upp och ner. Ett valt område visar namn, pris och läget mot länet. Halvläget börjar listan.
   Vyknapparna säger redan vad man tittar på, så panelens rubrik syns bara på skrivbordet, och Dela
   ligger bredvid sökfältet. Kikläget har fast höjd inom en vy: inget dyker upp ovanför svaret när
   ett filter ändras, och budgetrubriken har två rader reserverade så att reglagen inte hoppar.
7. **Platt som standard.** Kartan är 2D. 3D är ett val, inte startläget, eftersom vridbara kartor är
   svåra att navigera för de flesta. På mobilen finns det inte alls; det går inte att styra med tummen.
   Kartan har inga egna knappar på mobilen, och ingen "Hela länet" någonstans: startvyn är länet.

## Områdessidan

Ordningen följer köparens frågor: pris och läge mot länet (hero med minikarta), vilka som bor där
(SCB), vad pengarna räcker till, perioderna i tabell, plats i länet, liknande grannar. Varje siffra
står en gång; tabellen bär medelpris, antal och förändring. Villor får ett eget block bara där
Mäklarstatistik har villapriser för området. För stadsdelsområdena, där siffran gäller hela staden,
står den som en rad under "Om siffrorna".

## Visuellt språk

Ljust och sakligt, med färger hämtade från Stockholm. Prisskalan följer stadens fasader, från blek
sandsten via ockra och falurött till oxblod. Accentfärgen är irrgrön koppar som på stadens tak, och
används bara för det man kan klicka på eller har valt.

Undvik: mörkt läge, gradienter, glas och oskärpa, neonaccenter, emoji, ikoner för dekoration,
skuggor på allt, kräm med terrakotta, Inter.

### Färger

Alla färger finns som tokens i `web/src/styles/tokens.css`. Skalorna (pris, förändring, budget och
saknad data) och budgetens marginal har en enda källa, `design/scales.json`, som både
`web/src/lib/scales.ts` (kartan och SVG) och pipelinens `palette.py` (delningsbilderna) läser. CSS
kan inte importera JSON, så tokens.css har samma värden för hand och testet
`web/src/test/design.test.ts` fallerar om de skiljer sig. Ändra en skalfärg i `design/scales.json`
och i `tokens.css`, och kör `python -m prislandskap og`.

| Roll | Token | Värde |
| --- | --- | --- |
| Sidbakgrund | `--c-page` | `#f3f4f1` |
| Yta | `--c-surface` | `#ffffff` |
| Text | `--c-ink` | `#1a1f1c` |
| Sekundär text | `--c-ink-2` | `#4d5650` |
| Hjälptext | `--c-ink-3` | `#5f6762` |
| Accent | `--c-accent` | `#1f6f5c` |
| Pris, 6 steg | `--c-price-1` … `-6` | `#efdba6` → `#652a21` |
| Förändring | `--c-down`, `--c-flat`, `--c-up` | blå, grå, rost |
| Budget | `--c-ok`, `--c-near`, `--c-no` | grön, ockra, grå |

Prisskalan har fasta klassgränser (35, 50, 65, 85 och 110 tusen kr/kvm) så att färgerna betyder
samma sak varje månad. Förklaringen visar gränserna i text.

### Typ

Familjen Grotesk (svensk, öppen licens, självhostad via `@fontsource`) i 400–700. Inga andra
typsnitt. Siffror med `tabular-nums`. Skala: 12, 14, 16, 20, 28, 32–48, och stora nyckeltal 36–56.

### Former

Hörnradie 10 px på kort och knappar, 6 px på små element. Skugga bara på kartans flytande element.
Avdelare är 1 px linjer i `--c-line`. Knappar och klickytor är minst 40 px höga, 44 px på mobil.

## Komponenter

- **Sök område:** en kombinationsruta högst upp. Skriv "söd" och välj Södermalm. Finns på kartsidan
  och på områdeslistan.
- **Vyväljare:** tre flikar med frågorna som namn.
- **Filter:** bostadstyp (bostadsrätter, villor) och period (senaste 3 eller 12 månaderna).
- **Förklaring:** färgrutor med text. Står alltid intill kartan.
- **Områdesrad:** namn, värde och antal affärer. Hela raden är klickbar.
- **Nyckeltal:** stort tal, enhet och en mening som sätter det i sammanhang ("65 % över länets snitt").

## Text

- Rubriker är frågor eller påståenden: "Var har jag råd?", "5 mkr räcker i 31 av 37 områden".
- Knappar säger vad som händer: "Visa på kartan", "Jämför med grannarna", "Kopiera länk".
- Tomt läge förklarar vad som saknas och vad man kan göra.
- Källa och datum syns på varje sida.
