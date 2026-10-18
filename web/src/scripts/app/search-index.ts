/**
 * Sökning bland områdena. Matchar utan hänsyn till å/ä/ö och versaler, och känner till
 * stadsdelar och orter, så att "aspudden" hittar Hägersten-Liljeholmen och "åkersberga" Österåker.
 */
import { areas as ALL_AREAS } from "../../lib/data";
import { searchKey } from "../../lib/format";
import type { Area } from "../../lib/types";

/**
 * Stadsdelar och orter som folk söker på, per område. Stadsdelarna följer Mäklarstatistiks
 * indelning (pipeline/legacy_scripts/stadsdel_mapping.py); orterna är de största i varje kommun.
 */
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

export interface SearchHit {
  area: Area;
  /** Stadsdel eller ort som matchade, om det inte var områdets eget namn. */
  via: string | null;
  score: number;
}

interface IndexEntry {
  area: Area;
  label: string;
  key: string;
  alias: boolean;
}

function buildIndex(list: readonly Area[]): IndexEntry[] {
  const out: IndexEntry[] = [];
  for (const a of list) {
    out.push({ area: a, label: a.name, key: searchKey(a.name), alias: false });
    for (const alias of ALIASES[a.slug] ?? []) out.push({ area: a, label: alias, key: searchKey(alias), alias: true });
  }
  return out;
}

const DEFAULT_INDEX = buildIndex(ALL_AREAS);

/** Lägre poäng = bättre träff. */
function score(key: string, q: string): number {
  if (key === q) return 0;
  if (key.startsWith(q)) return 1;
  if (key.split(" ").some((w) => w.startsWith(q))) return 2;
  if (key.includes(q)) return 3;
  return -1;
}

export function search(query: string, limit = 8, index: IndexEntry[] = DEFAULT_INDEX): SearchHit[] {
  const q = searchKey(query);
  if (!q) return [];
  const best = new Map<string, SearchHit>();
  for (const e of index) {
    const s = score(e.key, q);
    if (s < 0) continue;
    // Områdets eget namn går före en stadsdel med samma träffgrad.
    const total = s * 2 + (e.alias ? 1 : 0);
    const prev = best.get(e.area.slug);
    if (!prev || total < prev.score) best.set(e.area.slug, { area: e.area, via: e.alias ? e.label : null, score: total });
  }
  return [...best.values()]
    .sort((a, b) => a.score - b.score || a.area.name.localeCompare(b.area.name, "sv"))
    .slice(0, limit);
}

export { buildIndex as _buildIndex };
