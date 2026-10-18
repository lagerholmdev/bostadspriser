/**
 * Kontraktstest: validerar den RIKTIGA exporten i src/generated/ mot kontraktet i types.ts och
 * docs/data.md. Övriga tester kör mot en fryst fixtur (se vitest.config.ts); det här testet läser
 * filen med node:fs så att fixtur-omdirigeringen inte når det. Det fångar alltså en ny månads
 * export som bryter formatet, medan värdena får ändras fritt.
 *
 * Saknas exporten hoppas testet över. Kör `python -m prislandskap export` först.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const GENERATED = fileURLToPath(new URL("../generated/", import.meta.url));
const JSON_FILE = `${GENERATED}areas.json`;
const GEO_FILE = `${GENERATED}areas.geojson`;

const STAT_FIELDS = ["sales", "pricePerSqm", "meanPrice", "change"] as const;
const INTEGER_FIELDS = new Set(["sales", "pricePerSqm", "meanPrice"]);
const MISSING_CODES = new Set(["F", "N", "0"]);
const PERIODS = ["m3", "m12"] as const;

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isNumTuple = (v: unknown, n: number): v is number[] =>
  Array.isArray(v) && v.length === n && v.every(isNum);

/** Samlar alla avvikelser i stället för att stanna vid den första. */
class Problems {
  list: string[] = [];
  check(ok: unknown, msg: string): void {
    if (!ok) this.list.push(msg);
  }
}

function checkKeys(p: Problems, where: string, obj: Json, required: string[], optional: string[] = []): void {
  for (const k of required) p.check(k in obj, `${where}: saknar nyckeln "${k}"`);
  const allowed = new Set([...required, ...optional]);
  for (const k of Object.keys(obj)) p.check(allowed.has(k), `${where}: okänd nyckel "${k}"`);
}

function checkStat(p: Problems, where: string, s: unknown): void {
  if (!isObj(s)) return p.check(false, `${where}: Stat ska vara ett objekt`);
  checkKeys(p, where, s, [...STAT_FIELDS], ["missing"]);
  for (const f of STAT_FIELDS) {
    const v = s[f];
    p.check(v === null || isNum(v), `${where}.${f}: ska vara tal eller null, är ${JSON.stringify(v)}`);
    if (isNum(v) && INTEGER_FIELDS.has(f)) p.check(Number.isInteger(v), `${where}.${f}: ska vara heltal`);
    if (isNum(v) && f === "change") {
      p.check(Math.round(v * 10) / 10 === v, `${where}.change: högst en decimal, är ${v}`);
    }
  }
  if ("missing" in s) {
    const m = s.missing;
    if (!isObj(m)) return p.check(false, `${where}.missing: ska vara ett objekt`);
    for (const [k, code] of Object.entries(m)) {
      p.check((STAT_FIELDS as readonly string[]).includes(k), `${where}.missing: okänt fält "${k}"`);
      p.check(MISSING_CODES.has(code as string), `${where}.missing.${k}: kod ${JSON.stringify(code)} ∉ {F,N,0}`);
      p.check(s[k] === null, `${where}.missing.${k}: fältet ska vara null när det saknas`);
    }
  }
}

function checkStatsByPeriod(p: Problems, where: string, v: unknown): void {
  if (!isObj(v)) return p.check(false, `${where}: ska vara { m3, m12 }`);
  checkKeys(p, where, v, [...PERIODS]);
  for (const period of PERIODS) checkStat(p, `${where}.${period}`, v[period]);
}

function validateDataset(data: unknown): string[] {
  const p = new Problems();
  if (!isObj(data)) return ["Dataset: ska vara ett objekt"];
  checkKeys(p, "Dataset", data, ["updated", "periods", "source", "county", "areas"]);
  p.check(
    typeof data.updated === "string" && /^\d{4}-\d{2}-\d{2}$/.test(data.updated),
    `Dataset.updated: ska vara YYYY-MM-DD, är ${JSON.stringify(data.updated)}`,
  );
  const periods = data.periods;
  p.check(
    isObj(periods) && PERIODS.every((k) => typeof periods[k] === "string" && periods[k] !== ""),
    "Dataset.periods: ska ha text för m3 och m12",
  );
  const source = data.source;
  p.check(
    isObj(source) && typeof source.name === "string" && typeof source.url === "string" && source.url.startsWith("https://"),
    "Dataset.source: ska ha name och en https-url",
  );
  const county = data.county;
  if (isObj(county)) {
    checkKeys(p, "county", county, ["name", "apartment", "house"]);
    p.check(typeof county.name === "string", "county.name: ska vara text");
    checkStatsByPeriod(p, "county.apartment", county.apartment);
    checkStatsByPeriod(p, "county.house", county.house);
  } else p.check(false, "Dataset.county: ska vara ett objekt");

  if (!Array.isArray(data.areas)) return [...p.list, "Dataset.areas: ska vara en lista"];
  const areas = data.areas as unknown[];
  const slugs = new Set(areas.map((a) => (isObj(a) ? a.slug : undefined)));
  p.check(slugs.size === areas.length, "Dataset.areas: slugs ska vara unika");

  for (const [i, a] of areas.entries()) {
    if (!isObj(a)) {
      p.check(false, `areas[${i}]: ska vara ett objekt`);
      continue;
    }
    const w = `areas[${typeof a.slug === "string" ? a.slug : i}]`;
    checkKeys(p, w, a, ["slug", "name", "kind", "label", "neighbours", "bbox", "apartment", "house", "houseScope"]);
    p.check(typeof a.slug === "string" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(a.slug), `${w}.slug: ogiltig`);
    p.check(typeof a.name === "string" && a.name !== "", `${w}.name: ska vara text`);
    p.check(a.kind === "district" || a.kind === "municipality", `${w}.kind: ${JSON.stringify(a.kind)}`);
    p.check(isNumTuple(a.label, 2), `${w}.label: ska vara [lon, lat]`);
    p.check(isNumTuple(a.bbox, 4), `${w}.bbox: ska vara [väst, syd, öst, nord]`);
    if (isNumTuple(a.label, 2) && isNumTuple(a.bbox, 4)) {
      const [lon, lat] = a.label;
      const [w0, s0, e0, n0] = a.bbox;
      p.check(w0 < e0 && s0 < n0, `${w}.bbox: väst < öst och syd < nord`);
      p.check(lon >= w0 && lon <= e0 && lat >= s0 && lat <= n0, `${w}.label: ligger utanför bbox`);
    }
    if (Array.isArray(a.neighbours)) {
      for (const n of a.neighbours) {
        p.check(typeof n === "string" && slugs.has(n), `${w}.neighbours: okänd slug ${JSON.stringify(n)}`);
        p.check(n !== a.slug, `${w}.neighbours: innehåller sig själv`);
      }
    } else p.check(false, `${w}.neighbours: ska vara en lista`);
    if (a.apartment !== null) checkStatsByPeriod(p, `${w}.apartment`, a.apartment);
    if (a.house !== null) checkStatsByPeriod(p, `${w}.house`, a.house);
    p.check([null, "area", "city"].includes(a.houseScope as string | null), `${w}.houseScope: ${JSON.stringify(a.houseScope)}`);
    p.check((a.house === null) === (a.houseScope === null), `${w}: houseScope ska vara null om och endast om house är null`);
    if (a.kind === "district" && a.house !== null) p.check(a.houseScope === "city", `${w}: stadsdelsområden har houseScope "city"`);
    if (a.kind === "municipality" && a.house !== null) p.check(a.houseScope === "area", `${w}: kommuner har houseScope "area"`);
  }
  const count = (kind: string) => areas.filter((a) => isObj(a) && a.kind === kind).length;
  p.check(count("district") === 12, `Dataset.areas: ${count("district")} stadsdelsområden, väntade 12`);
  p.check(count("municipality") === 25, `Dataset.areas: ${count("municipality")} kommuner, väntade 25`);
  return p.list;
}

const exists = existsSync(JSON_FILE);

if (!exists) {
  it.skip("kontraktet: src/generated/areas.json saknas, kör `python -m prislandskap export` först", () => {});
} else {
  describe("kontraktet: src/generated/areas.json", () => {
    const data: unknown = JSON.parse(readFileSync(JSON_FILE, "utf8"));

    it("följer Dataset/Area/Stat i types.ts", () => {
      expect(validateDataset(data)).toEqual([]);
    });

    it("är sorterad på namn i svensk ordning", () => {
      const names = (data as { areas: { name: string }[] }).areas.map((a) => a.name);
      expect(names).toEqual([...names].sort(new Intl.Collator("sv").compare));
    });

    it.skipIf(!existsSync(GEO_FILE))("har samma ytor som areas.geojson", () => {
      const geo = JSON.parse(readFileSync(GEO_FILE, "utf8")) as { features: { properties: { slug: string } }[] };
      const geoSlugs = geo.features.map((f) => f.properties.slug).sort();
      const slugs = (data as { areas: { slug: string }[] }).areas.map((a) => a.slug).sort();
      expect(geoSlugs).toEqual(slugs);
    });
  });
}

describe("kontraktsvalideringen själv", () => {
  it("hittar fel i ett trasigt dataset", () => {
    const broken = {
      updated: "8 okt",
      periods: { m3: "jul–sep 2026" },
      source: { name: "x", url: "http://x" },
      county: { name: "Län", apartment: {}, house: {} },
      areas: [
        {
          slug: "a",
          name: "A",
          kind: "stad",
          label: [20, 60],
          neighbours: ["b"],
          bbox: [18, 59, 19, 59.5],
          apartment: { m3: { sales: 1.5, pricePerSqm: null, meanPrice: 1, change: 1, missing: { pricePerSqm: "X" } }, m12: {} },
          house: null,
          houseScope: "city",
        },
      ],
    };
    const problems = validateDataset(broken).join("\n");
    for (const needle of ["updated", "periods", "https", "kind", "utanför bbox", "okänd slug", "heltal", "∉ {F,N,0}", "houseScope ska vara null", "väntade 12", "väntade 25"]) {
      expect(problems).toContain(needle);
    }
  });
});
