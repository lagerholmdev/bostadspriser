/**
 * Vad panelen och kartan ska visa, räknat ur datasetet. Rena funktioner utan DOM, så de
 * går att testa och kan köras både i Astro vid bygget och i webbläsaren.
 */
import {
  affordablePricePerSqm,
  affordableSize,
  budgetStatus,
  estimatedCost,
  type BudgetStatus,
} from "../../lib/budget";
import { areas as ALL_AREAS, countyStat, dataset, isThin, shownStat } from "../../lib/data";
import { BUDGET_COLORS, NODATA_COLOR, changeStepColor, priceColor } from "../../lib/scales";
import type { Area, Dataset, Housing, Period, Stat } from "../../lib/types";
import type { AppState, View } from "../../lib/url";

/**
 * En rad i en lista. För villor slås Stockholms stadsdelar ihop till en rad ("Stockholms stad"),
 * eftersom Mäklarstatistik bara redovisar villor för hela staden. Den raden har inget eget område.
 */
export interface Entry {
  /** Områdets slug, eller null för den sammanslagna raden för Stockholms stad. */
  slug: string | null;
  name: string;
  stat: Stat;
  thin: boolean;
}

export const CITY_NAME = "Stockholms stad";

export type SortOrder = "desc" | "asc" | "name";
export const SORT_LABEL: Record<SortOrder, string> = {
  desc: "Dyrast först",
  asc: "Billigast först",
  name: "A–Ö",
};

const collator = new Intl.Collator("sv");

/** Alla rader för en bostadstyp och period, med villor i staden som en rad. */
export function entries(
  housing: Housing,
  period: Period,
  list: readonly Area[] = ALL_AREAS,
): Entry[] {
  const out: Entry[] = [];
  let cityDone = false;
  for (const a of list) {
    const s = shownStat(a, housing, period);
    if (!s) continue;
    if (housing === "house" && a.houseScope === "city") {
      if (cityDone) continue;
      cityDone = true;
      out.push({ slug: null, name: CITY_NAME, stat: s, thin: isThin(s, period) });
      continue;
    }
    out.push({ slug: a.slug, name: a.name, stat: s, thin: isThin(s, period) });
  }
  return out;
}

export function sortEntries(list: Entry[], order: SortOrder): Entry[] {
  const copy = [...list];
  if (order === "name") return copy.sort((a, b) => collator.compare(a.name, b.name));
  const dir = order === "desc" ? -1 : 1;
  return copy.sort((a, b) => {
    const av = a.stat.pricePerSqm;
    const bv = b.stat.pricePerSqm;
    if (av == null && bv == null) return collator.compare(a.name, b.name);
    if (av == null) return 1;
    if (bv == null) return -1;
    return (av - bv) * dir;
  });
}

/* ---------- Pris per kvm ---------- */

export interface PriceModel {
  county: number | null;
  dearest: Entry | null;
  cheapest: Entry | null;
  rows: Entry[];
  /** Högsta värdet, för staplarnas längd. */
  max: number;
}

export function priceModel(
  housing: Housing,
  period: Period,
  order: SortOrder = "desc",
): PriceModel {
  const all = entries(housing, period);
  const priced = sortEntries(
    all.filter((e) => e.stat.pricePerSqm != null),
    "desc",
  );
  return {
    county: countyStat(housing, period).pricePerSqm,
    dearest: priced[0] ?? null,
    cheapest: priced[priced.length - 1] ?? null,
    rows: sortEntries(all, order),
    max: priced[0]?.stat.pricePerSqm ?? 1,
  };
}

/* ---------- Var har jag råd? ---------- */

export interface BudgetEntry extends Entry {
  status: BudgetStatus;
  /** Så många kvm budgeten räcker till. */
  size: number;
  /** Vad den valda storleken kostar, avrundat. */
  cost: number;
}

export interface BudgetModel {
  maxPerSqm: number;
  /** Räcker: dyrast först, alltså närmast budgeten. */
  ok: BudgetEntry[];
  /** Nästan: billigast först, alltså närmast budgeten. */
  near: BudgetEntry[];
  /** Räcker inte: billigast först. */
  no: BudgetEntry[];
  /** Områden utan pris. */
  missing: Entry[];
  /** Antal områden med pris (nämnaren i rubriken). */
  total: number;
  /** Billigaste området, för tipset när inget räcker. */
  cheapest: BudgetEntry | null;
}

export function budgetModel(
  housing: Housing,
  period: Period,
  budget: number,
  sqm: number,
): BudgetModel {
  const ok: BudgetEntry[] = [];
  const near: BudgetEntry[] = [];
  const no: BudgetEntry[] = [];
  const missing: Entry[] = [];
  for (const e of entries(housing, period)) {
    const p = e.stat.pricePerSqm;
    const status = budgetStatus(budget, sqm, p);
    if (p == null || status == null) {
      missing.push(e);
      continue;
    }
    const be: BudgetEntry = {
      ...e,
      status,
      size: affordableSize(budget, p),
      cost: estimatedCost(p, sqm),
    };
    (status === "ok" ? ok : status === "near" ? near : no).push(be);
  }
  // Dyrast du har råd med först: det är det område som ligger närmast det köparen letar efter.
  // Över budget gäller det omvända, så där står det billigaste (närmast budgeten) först.
  const dearest = (a: BudgetEntry, b: BudgetEntry) =>
    b.size === a.size ? collator.compare(a.name, b.name) : a.size - b.size;
  const cheapest = (a: BudgetEntry, b: BudgetEntry) =>
    b.size === a.size ? collator.compare(a.name, b.name) : b.size - a.size;
  ok.sort(dearest);
  near.sort(cheapest);
  no.sort(cheapest);
  const all = [...ok, ...near, ...no].sort(cheapest);
  return {
    maxPerSqm: affordablePricePerSqm(budget, sqm),
    ok,
    near,
    no,
    missing,
    total: all.length,
    cheapest: all[0] ?? null,
  };
}

/* ---------- Förändring ---------- */

export interface ChangeModel {
  county: number | null;
  up: Entry[];
  down: Entry[];
  /** Alla med värde, störst ökning först. */
  all: Entry[];
  countUp: number;
  countDown: number;
  countFlat: number;
  missing: Entry[];
  /** Placeringsflytt sedan förra månaden per rad (rowKey), bara flyttar på minst SHIFT_MIN platser. */
  shift: Map<string, number>;
}

/** Mindre flyttar än så visas inte: två av tre månader är desamma mellan två publiceringar. */
export const SHIFT_MIN = 2;

/** Nyckel för en rad: områdets slug, eller "stockholm" för den sammanslagna villaraden. */
export function rowKey(e: Entry): string {
  return e.slug ?? "stockholm";
}

function rankByChange(list: Entry[]): Entry[] {
  const changeOf = (e: Entry) => e.stat.change ?? 0;
  return list
    .filter((e) => e.stat.change != null)
    .sort((a, b) => changeOf(b) - changeOf(a) || collator.compare(a.name, b.name));
}

/** Områdena med förra månadens statistik, i samma form som datasetet. null utan förra månad. */
export function previousAreas(
  ds: Dataset = dataset,
  list: readonly Area[] = ALL_AREAS,
): Area[] | null {
  const prev = ds.previous;
  if (!prev) return null;
  return list
    .filter((a) => a.slug in prev.areas)
    .map((a) => ({
      ...a,
      apartment: prev.areas[a.slug].apartment,
      house: prev.areas[a.slug].house,
    }));
}

/**
 * Hur många platser varje rad har flyttat i förändringslistan sedan förra månaden: positivt =
 * uppåt (större ökning relativt de andra). Bara rader som finns båda månaderna och flyttat minst
 * SHIFT_MIN platser.
 */
export function rankShifts(current: Entry[], previous: Entry[]): Map<string, number> {
  const before = new Map(rankByChange(previous).map((e, i) => [rowKey(e), i]));
  const out = new Map<string, number>();
  rankByChange(current).forEach((e, i) => {
    const was = before.get(rowKey(e));
    if (was != null && Math.abs(was - i) >= SHIFT_MIN) out.set(rowKey(e), was - i);
  });
  return out;
}

/**
 * Båda förändringarna räknas av Mäklarstatistik på de senaste tre månaderna (m12 = mot samma
 * månader året innan). Antal affärer och osäkerhet tas därför alltid från tremånadersperioden.
 */
export function changeModel(
  housing: Housing,
  period: Period,
  top = 5,
  previous: Area[] | null = previousAreas(),
): ChangeModel {
  const base = new Map(entries(housing, "m3").map((e) => [e.slug, e]));
  const list = entries(housing, period).map((e) => {
    const b = base.get(e.slug);
    return b ? { ...e, stat: { ...e.stat, sales: b.stat.sales }, thin: b.thin } : e;
  });
  const changeOf = (e: Entry) => e.stat.change ?? 0;
  const all = rankByChange(list);
  const rounded = (e: Entry) => Math.round(changeOf(e) * 10) / 10;
  const ups = all.filter((e) => rounded(e) > 0);
  const downs = all.filter((e) => rounded(e) < 0).reverse();
  return {
    county: countyStat(housing, period).change,
    up: ups.slice(0, top),
    down: downs.slice(0, top),
    all,
    countUp: ups.length,
    countDown: downs.length,
    countFlat: all.length - ups.length - downs.length,
    missing: list.filter((e) => e.stat.change == null),
    shift: previous ? rankShifts(all, entries(housing, period, previous)) : new Map(),
  };
}

/* ---------- Kartan ---------- */

export interface Paint {
  color: Record<string, string>;
  /** Pris per kvm för 3D-höjden (0 om värde saknas). */
  price: Record<string, number>;
  /** Områden som ritas randiga: få affärer, eller villor som bara redovisas för hela staden. */
  thin: string[];
  /** Områden utan värde i vyn (ljusgrå och randiga). */
  nodata: string[];
}

/** Samma täckning för alla områden; osäkerhet visas med ränder, inte med blekare färg. */
export const FILL_OPACITY = 0.88;

/** Färg, höjd och ränder per område för kartans aktuella vy. */
export function mapPaint(
  s: Pick<AppState, "view" | "housing" | "period" | "budget" | "sqm">,
): Paint {
  const color: Record<string, string> = {};
  const price: Record<string, number> = {};
  const thin: string[] = [];
  const nodata: string[] = [];
  for (const a of ALL_AREAS) {
    const st = shownStat(a, s.housing, s.period);
    color[a.slug] = areaColor(s.view, st, s.budget, s.sqm, s.period);
    const hasValue = s.view === "forandring" ? st?.change != null : st?.pricePerSqm != null;
    // Förändringen bygger alltid på de senaste tre månaderna, så osäkerheten gör det också.
    const few =
      s.view === "forandring" ? isThin(shownStat(a, s.housing, "m3"), "m3") : isThin(st, s.period);
    const cityHouse = s.housing === "house" && a.houseScope === "city";
    if (!hasValue) nodata.push(a.slug);
    else if (few || cityHouse) thin.push(a.slug);
    price[a.slug] = st?.pricePerSqm ?? 0;
  }
  return { color, price, thin, nodata };
}

export function areaColor(
  view: View,
  st: Stat | null,
  budget: number,
  sqm: number,
  period: Period = "m3",
): string {
  if (!st) return NODATA_COLOR;
  if (view === "pris") return priceColor(st.pricePerSqm);
  if (view === "forandring") return changeStepColor(st.change, period);
  const status = budgetStatus(budget, sqm, st.pricePerSqm);
  return status ? BUDGET_COLORS[status] : NODATA_COLOR;
}

/** Sammanslagen [väst, syd, öst, nord] för en mängd områden. */
export function unionBbox(list: readonly Area[]): [number, number, number, number] {
  return list.reduce<[number, number, number, number]>(
    (b, a) => [
      Math.min(b[0], a.bbox[0]),
      Math.min(b[1], a.bbox[1]),
      Math.max(b[2], a.bbox[2]),
      Math.max(b[3], a.bbox[3]),
    ],
    [180, 90, -180, -90],
  );
}
