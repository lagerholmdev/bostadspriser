/**
 * Jämförelselistan (högst tre områden). Sparas i sessionStorage så att den finns kvar när man
 * tittar på en områdessida och går tillbaka. Den hör inte till kartans adress; delningen sker
 * via jämförelsesidans egen adress (/jamfor/?omraden=a,b).
 */
export const MAX_COMPARE = 3;
const KEY = "prislandskap:jamfor";

export interface AddResult {
  list: string[];
  /** Området som fick lämna plats, om listan var full. */
  dropped: string | null;
}

/** Lägg till sist. Är listan full försvinner den äldsta. */
export function addTo(list: readonly string[], slug: string, max = MAX_COMPARE): AddResult {
  if (list.includes(slug)) return { list: [...list], dropped: null };
  const next = [...list, slug];
  const dropped = next.length > max ? next.shift()! : null;
  return { list: next, dropped };
}

export function removeFrom(list: readonly string[], slug: string): string[] {
  return list.filter((s) => s !== slug);
}

export function compareHref(base: string, list: readonly string[]): string {
  return `${base}jamfor/?omraden=${list.map(encodeURIComponent).join(",")}`;
}

export function loadCompare(isKnown: (slug: string) => boolean): string[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s): s is string => typeof s === "string" && isKnown(s)).slice(0, MAX_COMPARE);
  } catch {
    return [];
  }
}

export function saveCompare(list: readonly string[]): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* privat läge e.d.: listan gäller bara den här sidvisningen */
  }
}
