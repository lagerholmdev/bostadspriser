/**
 * Åtkomst till datasetet. Filerna i src/generated/ skrivs av pipelinen
 * (`python -m prislandskap export`) och checkas inte in.
 */
import raw from "../generated/areas.json";
import type { Area, Dataset, Housing, Period, Stat } from "./types";

export const dataset = raw as unknown as Dataset;
export const areas: Area[] = dataset.areas;
export const bySlug: ReadonlyMap<string, Area> = new Map(areas.map((a) => [a.slug, a]));

export const HOUSING_LABEL: Record<Housing, string> = { apartment: "Bostadsrätter", house: "Villor" };
export const PERIOD_LABEL: Record<Period, string> = { m3: "Senaste 3 månaderna", m12: "Senaste 12 månaderna" };

/** Vad för slags område, i klartext. */
export const KIND_LABEL: Record<Area["kind"], string> = {
  district: "Stadsdelsområde i Stockholms stad",
  municipality: "Kommun i Stockholms län",
};

/** Kort form av KIND_LABEL, för kort och tabellhuvuden. */
export const KIND_SHORT: Record<Area["kind"], string> = {
  district: "Stadsdelsområde",
  municipality: "Kommun",
};

/** Under så här många affärer räknas värdet som osäkert och visas blekt. */
export const THIN_SALES: Record<Period, number> = { m3: 60, m12: 200 };

export function getArea(slug: string): Area | undefined {
  return bySlug.get(slug);
}

/** Områden för en lista med slugs, i samma ordning. Okända slugs hoppas över. */
export function areasFor(slugs: readonly string[]): Area[] {
  return slugs.map((s) => bySlug.get(s)).filter((a): a is Area => a != null);
}

export function stat(area: Area, housing: Housing, period: Period): Stat | null {
  return area[housing]?.[period] ?? null;
}

export function countyStat(housing: Housing, period: Period): Stat {
  return dataset.county[housing][period];
}

export function isThin(s: Stat | null, period: Period): boolean {
  return !s || s.sales == null || s.sales < THIN_SALES[period];
}

/** Kvot mot länets snitt: 0.65 = 65 % över. */
export function countyRatio(value: number | null | undefined, housing: Housing = "apartment", period: Period = "m3"): number | null {
  const c = countyStat(housing, period).pricePerSqm;
  return value == null || !c ? null : value / c - 1;
}

/** Områden sorterade på kr/kvm, dyrast först. Villor i stadsdelarna räknas som en post (Stockholms stad). */
export function rankByPrice(housing: Housing, period: Period): Area[] {
  const seenCity = { done: false };
  const price = (a: Area) => stat(a, housing, period)?.pricePerSqm ?? 0;
  return areas
    .filter((a) => {
      if (housing === "house" && a.houseScope === "city") {
        if (seenCity.done) return false;
        seenCity.done = true;
      }
      return stat(a, housing, period)?.pricePerSqm != null;
    })
    .sort((a, b) => price(b) - price(a));
}

/** Områdets plats i prislistan (1 = dyrast) och antal områden med värde. */
export function priceRank(
  area: Area,
  housing: Housing = "apartment",
  period: Period = "m3",
): { rank: number; total: number } | null {
  const list = rankByPrice(housing, period);
  const i = list.findIndex((a) => a.slug === area.slug);
  return i === -1 ? null : { rank: i + 1, total: list.length };
}

/**
 * Vilka platser i en rangordning som ska visas runt ett område: första och sista,
 * området självt och `radius` grannar åt varje håll. `null` markerar ett hopp ("…").
 * rankWindow(37, 2) -> [0, 1, 2, 3, 4, 5, null, 36]
 */
export function rankWindow(total: number, index: number, radius = 3): (number | null)[] {
  if (total <= 0) return [];
  const keep = new Set<number>([0, total - 1]);
  for (let i = index - radius; i <= index + radius; i++) if (i >= 0 && i < total) keep.add(i);
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((i, k) => {
    const prev = sorted[k - 1];
    if (prev != null && i - prev > 1) {
      // Ett hopp över en enda rad visar raden i stället för "…".
      if (i - prev === 2) out.push(prev + 1);
      else out.push(null);
    }
    out.push(i);
  });
  return out;
}

/** Upp till n grannar med pris närmast området, i första hand direkta grannar. */
export function similarNeighbours(area: Area, n = 3, housing: Housing = "apartment", period: Period = "m3"): Area[] {
  const me = stat(area, housing, period)?.pricePerSqm ?? 0;
  const seen = new Set([area.slug]);
  let frontier = [area.slug];
  const candidates: Area[] = [];
  while (frontier.length && candidates.length < 6) {
    const next: string[] = [];
    for (const slug of frontier) {
      for (const g of bySlug.get(slug)?.neighbours ?? []) {
        if (seen.has(g)) continue;
        seen.add(g);
        next.push(g);
        const a = bySlug.get(g);
        if (a && stat(a, housing, period)?.pricePerSqm != null) candidates.push(a);
      }
    }
    frontier = next;
  }
  const price = (a: Area) => stat(a, housing, period)?.pricePerSqm ?? 0;
  return candidates.sort((a, b) => Math.abs(price(a) - me) - Math.abs(price(b) - me)).slice(0, n);
}

/** Läser områden att jämföra ur adressen: ?omraden=a,b,c, äldre ?jamfor=a,b och ?a=&b=&c=. */
export function parseCompareParams(params: URLSearchParams, max = 3, known: (slug: string) => boolean = (s) => bySlug.has(s)): string[] {
  const raw: string[] = [];
  for (const key of ["omraden", "jamfor"]) {
    for (const v of params.getAll(key)) raw.push(...v.split(","));
  }
  for (const key of ["a", "b", "c"]) {
    const v = params.get(key);
    if (v) raw.push(v);
  }
  const out: string[] = [];
  for (const s of raw.map((x) => x.trim().toLowerCase())) {
    if (s && known(s) && !out.includes(s)) out.push(s);
    if (out.length === max) break;
  }
  return out;
}

/* Tillägg för kartsidan. */

/** Villor med färre affärer än så under perioden visas utan pris ("för få affärer"). */
export const MIN_HOUSE_SALES = 10;

/**
 * Som stat(), men döljer pris, medelpris och förändring för villor med färre än
 * MIN_HOUSE_SALES affärer: ett snitt av ett par försäljningar säger inget om området.
 */
export function shownStat(area: Area, housing: Housing, period: Period): Stat | null {
  const s = stat(area, housing, period);
  if (!s || housing !== "house" || s.sales == null || s.sales >= MIN_HOUSE_SALES) return s;
  return {
    ...s,
    pricePerSqm: null,
    meanPrice: null,
    change: null,
    missing: { ...s.missing, pricePerSqm: "F", meanPrice: "F", change: "F" },
  };
}

/**
 * Områdets plats i prislistan (1 = dyrast) bland områden med visat pris. För villor delar
 * Stockholms stadsdelar stadens plats, eftersom villorna bara redovisas för hela staden.
 */
export function placeInCounty(area: Area, housing: Housing, period: Period): { rank: number; total: number } | null {
  const list = rankByPrice(housing, period).filter((a) => shownStat(a, housing, period)?.pricePerSqm != null);
  const key = housing === "house" && area.houseScope === "city" ? list.find((a) => a.houseScope === "city")?.slug : area.slug;
  const i = list.findIndex((a) => a.slug === key);
  return i === -1 ? null : { rank: i + 1, total: list.length };
}
