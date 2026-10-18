/**
 * Stadsdelar och orter som folk söker på, och sökningen som använder dem. Delas av
 * kartsidans sökruta, områdeslistan och 404-sidan, så att "aspudden" hittar
 * Hägersten-Liljeholmen och "åkersberga" Österåker överallt.
 *
 * Stadsdelarna följer Mäklarstatistiks indelning (pipeline/legacy_scripts/stadsdel_mapping.py);
 * orterna är de största i varje kommun.
 */
import { searchKey } from "./format";

export const ALIASES: Record<string, string[]> = {
  "vasastan-norrmalm": ["Norrmalm", "Vasastaden", "Vasastan", "Gamla stan", "Riddarholmen", "Skeppsholmen", "City", "Sankt Eriksplan", "Odenplan"],
  ostermalm: ["Djurgården", "Norra Djurgården", "Gärdet", "Ladugårdsgärdet", "Hjorthagen", "Lärkstaden"],
  kungsholmen: ["Fredhäll", "Kristineberg", "Marieberg", "Stadshagen", "Fridhemsplan", "Hornsberg"],
  essingen: ["Lilla Essingen", "Stora Essingen"],
  sodermalm: ["Långholmen", "Reimersholme", "Hammarby sjöstad", "Södra Hammarbyhamnen", "SoFo", "Hornstull", "Slussen"],
  "hagersten-liljeholmen": ["Aspudden", "Fruängen", "Gröndal", "Hägersten", "Hägerstensåsen", "Liljeholmen", "Midsommarkransen", "Mälarhöjden", "Västberga", "Västertorp"],
  "brannkyrka-skarholmen": ["Herrängen", "Liseberg", "Långbro", "Långsjö", "Solberga", "Älvsjö", "Örby slott", "Bredäng", "Sätra", "Skärholmen", "Vårberg"],
  "enskede-skarpnack": ["Enskede", "Enskede gård", "Enskedefältet", "Enskededalen", "Gamla Enskede", "Johanneshov", "Årsta", "Östberga", "Bagarmossen", "Björkhagen", "Hammarbyhöjden", "Kärrtorp", "Skarpnäck", "Flaten"],
  "farsta-vantor": ["Bandhagen", "Hagsätra", "Högdalen", "Rågsved", "Örby", "Stureby", "Svedmyra", "Farsta", "Farsta strand", "Fagersjö", "Gubbängen", "Hökarängen", "Larsboda", "Sköndal", "Tallkrogen"],
  "spanga-kista": ["Akalla", "Bromsten", "Flysta", "Hansta", "Husby", "Kista", "Lunda", "Rinkeby", "Solhem", "Sundby", "Tensta", "Spånga"],
  "hasselby-vallingby": ["Blackeberg", "Grimsta", "Hässelby gård", "Hässelby strand", "Hässelby villastad", "Kälvesta", "Nälsta", "Råcksta", "Vinsta", "Vällingby", "Hässelby"],
  "bromma-vasterled": ["Bromma", "Abrahamsberg", "Alvik", "Beckomberga", "Bällsta", "Eneby", "Höglandet", "Mariehäll", "Nockeby", "Norra Ängby", "Olovslund", "Riksby", "Smedslätten", "Stora mossen", "Södra Ängby", "Traneberg", "Ulvsunda", "Åkeshov", "Åkeslund", "Ålsten", "Äppelviken"],
  botkyrka: ["Tumba", "Tullinge", "Hallunda", "Alby", "Fittja", "Norsborg", "Vårsta"],
  danderyd: ["Djursholm", "Stocksund", "Enebyberg", "Mörby"],
  ekero: ["Stenhamra", "Färentuna", "Munsö", "Adelsö"],
  haninge: ["Handen", "Jordbro", "Vendelsö", "Brandbergen", "Tungelsta", "Västerhaninge", "Dalarö"],
  huddinge: ["Flemingsberg", "Skogås", "Trångsund", "Stuvsta", "Segeltorp", "Vårby", "Sjödalen"],
  jarfalla: ["Jakobsberg", "Kallhäll", "Viksjö", "Barkarby"],
  lidingo: ["Torsvik", "Käppala", "Bodal"],
  nacka: ["Saltsjöbaden", "Fisksätra", "Saltsjö-Boo", "Orminge", "Sickla", "Älta", "Finntorp", "Henriksdal"],
  norrtalje: ["Rimbo", "Hallstavik", "Grisslehamn"],
  nykvarn: ["Turinge"],
  nynashamn: ["Ösmo", "Sorunda"],
  salem: ["Rönninge"],
  sigtuna: ["Märsta", "Arlandastad", "Rosersberg", "Steninge"],
  sollentuna: ["Rotebro", "Häggvik", "Edsberg", "Tureberg", "Helenelund", "Norrviken"],
  solna: ["Hagalund", "Råsunda", "Bergshamra", "Frösunda", "Huvudsta", "Hagastaden", "Arenastaden"],
  sundbyberg: ["Rissne", "Hallonbergen", "Duvbo", "Ursvik"],
  sodertalje: ["Järna", "Hölö", "Mölnbo"],
  tyreso: ["Bollmora", "Trollbäcken", "Tyresö strand"],
  taby: ["Näsby park", "Roslags Näsby", "Arninge", "Gribbylund", "Viggbyholm"],
  "upplands-vasby": ["Väsby", "Runby"],
  "upplands-bro": ["Kungsängen", "Bro"],
  vallentuna: ["Lindholmen", "Kårsta"],
  vaxholm: ["Resarö", "Rindö"],
  varmdo: ["Gustavsberg", "Hemmesta", "Ingarö", "Djurö"],
  osteraker: ["Åkersberga", "Ljusterö"],
};

/** Det som behövs av ett område för att söka: slug och namn. */
export interface Searchable {
  slug: string;
  name: string;
}

export interface AreaMatch<T extends Searchable> {
  area: T;
  /** Stadsdel eller ort som matchade, om det inte var områdets eget namn. */
  via: string | null;
  /** Lägre = bättre träff. */
  score: number;
}

/** Lägre poäng = bättre träff, −1 = ingen träff. */
function matchScore(key: string, q: string): number {
  if (key === q) return 0;
  if (key.startsWith(q)) return 1;
  if (key.split(" ").some((w) => w.startsWith(q))) return 2;
  if (key.includes(q)) return 3;
  return -1;
}

/**
 * Områden som matchar en sökning på namn, stadsdel eller ort, bästa träff först.
 * Områdets eget namn går före en stadsdel med samma träffgrad.
 */
export function findAreas<T extends Searchable>(query: string, list: readonly T[]): AreaMatch<T>[] {
  const q = searchKey(query);
  if (!q) return [];
  const best = new Map<string, AreaMatch<T>>();
  for (const area of list) {
    const terms: [string, string | null][] = [[area.name, null], ...(ALIASES[area.slug] ?? []).map((a): [string, string] => [a, a])];
    for (const [label, via] of terms) {
      const s = matchScore(searchKey(label), q);
      if (s < 0) continue;
      const score = s * 2 + (via ? 1 : 0);
      const prev = best.get(area.slug);
      if (!prev || score < prev.score) best.set(area.slug, { area, via, score });
    }
  }
  return [...best.values()].sort((a, b) => a.score - b.score || a.area.name.localeCompare(b.area.name, "sv"));
}

/** Antal redigeringar (Levenshtein) mellan två strängar. */
export function editDistance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Bästa gissning på vilket område en felstavad adress eller sökning menar, för
 * "Menade du …?" på 404-sidan. Tar t.ex. "sodermalmm", "hagersten" eller "aspudden".
 * Returnerar null när inget ligger tillräckligt nära.
 */
export function suggestArea<T extends Searchable>(segment: string, list: readonly T[]): AreaMatch<T> | null {
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    /* Trasig procentkodning: använd som den är. */
  }
  const q = searchKey(decoded.replace(/[-_+.]+/g, " "));
  if (q.length < 2) return null;

  const direct = findAreas(q, list)[0];
  if (direct && direct.score <= 3) return direct;

  // Stavfel: närmaste namn, slug eller stadsdel, med en gräns som växer med längden.
  let best: AreaMatch<T> | null = null;
  let bestDist = Infinity;
  for (const area of list) {
    const terms: [string, string | null][] = [
      [area.name, null],
      [area.slug, null],
      ...(ALIASES[area.slug] ?? []).map((a): [string, string] => [a, a]),
    ];
    for (const [label, via] of terms) {
      const key = searchKey(label.replace(/-/g, " "));
      const d = key.startsWith(q) || q.startsWith(key) ? Math.abs(key.length - q.length) * 0.5 : editDistance(key, q);
      if (d < bestDist || (d === bestDist && best?.via && !via)) {
        bestDist = d;
        best = { area, via, score: d };
      }
    }
  }
  const limit = Math.max(1, Math.floor(q.length / 4));
  return best && bestDist <= limit ? best : (direct ?? null);
}
