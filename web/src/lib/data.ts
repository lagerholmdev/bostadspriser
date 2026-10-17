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

/** Under så här många affärer räknas värdet som osäkert och visas blekt. */
export const THIN_SALES: Record<Period, number> = { m3: 60, m12: 200 };

export function getArea(slug: string): Area | undefined {
  return bySlug.get(slug);
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

/** Områden sorterade på kr/kvm, dyrast först. Villor i stadsdelarna räknas som en post (Stockholms stad). */
export function rankByPrice(housing: Housing, period: Period): Area[] {
  const seenCity = { done: false };
  return areas
    .filter((a) => {
      if (housing === "house" && a.houseScope === "city") {
        if (seenCity.done) return false;
        seenCity.done = true;
      }
      return stat(a, housing, period)?.pricePerSqm != null;
    })
    .sort((a, b) => (stat(b, housing, period)!.pricePerSqm ?? 0) - (stat(a, housing, period)!.pricePerSqm ?? 0));
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
