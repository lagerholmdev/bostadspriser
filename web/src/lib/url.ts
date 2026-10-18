/**
 * Kartsidans läge i adressen. Allt som syns ska gå att dela med en länk.
 *
 *   ?vy=budget&bostad=villa&period=12&budget=5.5&kvm=70&omrade=sodermalm
 *
 * Standardvärden skrivs inte ut, så startsidan har en ren adress. Äldre adresser från den
 * första versionen av sajten (vy=trend, typ=villa, per=m12, omr=…, jamfor=a,b) läses också.
 */
import { BUDGET_RANGE, SIZE_RANGE } from "./budget";
import type { Housing, Period } from "./types";

export type View = "pris" | "budget" | "forandring";
export const VIEWS: readonly View[] = ["pris", "budget", "forandring"];

export interface AppState {
  view: View;
  housing: Housing;
  period: Period;
  /** Budget i kronor. */
  budget: number;
  /** Boarea i kvm. */
  sqm: number;
  /** Valt område, eller null. */
  area: string | null;
}

export const DEFAULT_STATE: Readonly<AppState> = Object.freeze({
  view: "pris",
  housing: "apartment",
  period: "m3",
  budget: BUDGET_RANGE.default,
  sqm: SIZE_RANGE.default,
  area: null,
});

export interface ParseResult {
  state: AppState;
  /** Områden att jämföra från en äldre adress (?jamfor=a,b). Sidan skickar då vidare till /jamfor/. */
  compare: string[];
  /** Sant om adressen innehöll äldre parametrar och bör skrivas om. */
  legacy: boolean;
}

function snap(v: number, range: { min: number; max: number; step: number }): number {
  const clamped = Math.min(range.max, Math.max(range.min, v));
  return Math.round((clamped - range.min) / range.step) * range.step + range.min;
}

/** Budget i mkr från adressen ("5", "5.5", "5,25") till kronor, avrundat till reglagets steg. */
export function parseBudget(raw: string | null): number | null {
  if (raw == null || raw.trim() === "") return null;
  const v = Number(raw.replace(",", "."));
  if (!Number.isFinite(v) || v <= 0) return null;
  return snap(v * 1_000_000, BUDGET_RANGE);
}

export function parseSqm(raw: string | null): number | null {
  if (raw == null || raw.trim() === "") return null;
  const v = Number(raw);
  if (!Number.isFinite(v) || v <= 0) return null;
  return snap(v, SIZE_RANGE);
}

/** Kronor till mkr för adressen: 5250000 -> "5.25". */
export function formatBudgetParam(budget: number): string {
  return String(Math.round((budget / 1_000_000) * 100) / 100);
}

export function parseState(
  search: string | URLSearchParams,
  isKnown: (slug: string) => boolean,
): ParseResult {
  const q = typeof search === "string" ? new URLSearchParams(search) : search;
  const state: AppState = { ...DEFAULT_STATE };
  let legacy = false;

  const vy = q.get("vy");
  if (vy === "pris" || vy === "budget" || vy === "forandring") state.view = vy;
  else if (vy === "trend") {
    state.view = "forandring";
    legacy = true;
  } else if (vy != null) legacy = true; // t.ex. den borttagna vyn "volym"

  const bostad = q.get("bostad");
  const typ = q.get("typ");
  if (bostad === "villa") state.housing = "house";
  else if (bostad == null && typ != null) {
    legacy = true;
    if (typ === "villa") state.housing = "house";
  }

  const period = q.get("period");
  const per = q.get("per");
  if (period === "12") state.period = "m12";
  else if (period == null && per != null) {
    legacy = true;
    if (per === "m12") state.period = "m12";
  }

  const budget = parseBudget(q.get("budget"));
  if (budget != null) state.budget = budget;
  const sqm = parseSqm(q.get("kvm"));
  if (sqm != null) state.sqm = sqm;

  const omrade = q.get("omrade");
  const omr = q.get("omr");
  const slug = (omrade ?? omr)?.trim().toLowerCase();
  if (omrade == null && omr != null) legacy = true;
  if (slug && isKnown(slug)) state.area = slug;

  const compare: string[] = [];
  for (const s of (q.get("jamfor") ?? "").split(",")) {
    const t = s.trim().toLowerCase();
    if (t && isKnown(t) && !compare.includes(t) && compare.length < 3) compare.push(t);
  }
  if (q.has("jamfor") || q.has("via")) legacy = true;

  return { state, compare, legacy };
}

/** Frågesträng utan "?", med standardvärden utelämnade. Tom sträng för startläget. */
export function serializeState(s: AppState): string {
  const parts: string[] = [];
  if (s.view !== DEFAULT_STATE.view) parts.push(`vy=${s.view}`);
  if (s.housing !== DEFAULT_STATE.housing) parts.push("bostad=villa");
  if (s.period !== DEFAULT_STATE.period) parts.push("period=12");
  if (s.budget !== DEFAULT_STATE.budget) parts.push(`budget=${formatBudgetParam(s.budget)}`);
  if (s.sqm !== DEFAULT_STATE.sqm) parts.push(`kvm=${s.sqm}`);
  if (s.area) parts.push(`omrade=${encodeURIComponent(s.area)}`);
  return parts.join("&");
}

/** Full relativ adress för ett läge: "/bostadspriser/?vy=budget". */
export function stateHref(s: AppState, pathname: string): string {
  const q = serializeState(s);
  return q ? `${pathname}?${q}` : pathname;
}

export function sameState(a: AppState, b: AppState): boolean {
  return (
    a.view === b.view &&
    a.housing === b.housing &&
    a.period === b.period &&
    a.budget === b.budget &&
    a.sqm === b.sqm &&
    a.area === b.area
  );
}

/* ---------- Kartsidans standardval per vy och bostadstyp ---------- */

/** Förändring visas helst på ett år (jämnare än tre månader); övriga vyer på tre månader. */
export function defaultPeriod(view: View): Period {
  return view === "forandring" ? "m12" : "m3";
}

/** En villa är oftast större än en lägenhet, så "Var har jag råd?" börjar på 120 kvm för villor. */
export const HOUSE_DEFAULT_SQM = 120;
export function defaultSqm(housing: Housing): number {
  return housing === "house" ? HOUSE_DEFAULT_SQM : SIZE_RANGE.default;
}

/**
 * Som parseState, men med standardval som beror på vyn och bostadstypen: utan period i adressen
 * visar Förändring ett år, och utan kvm räknar villor på 120 kvm.
 */
export function parseAppState(search: string | URLSearchParams, isKnown: (slug: string) => boolean): ParseResult {
  const q = typeof search === "string" ? new URLSearchParams(search) : search;
  const r = parseState(q, isKnown);
  if (!q.has("period") && !q.has("per")) r.state.period = defaultPeriod(r.state.view);
  if (!q.has("kvm")) r.state.sqm = defaultSqm(r.state.housing);
  return r;
}

/** Frågesträng för parseAppState: standardval för vyn och bostadstypen skrivs inte ut. */
export function serializeAppState(s: AppState): string {
  const parts: string[] = [];
  if (s.view !== DEFAULT_STATE.view) parts.push(`vy=${s.view}`);
  if (s.housing !== DEFAULT_STATE.housing) parts.push("bostad=villa");
  if (s.period !== defaultPeriod(s.view)) parts.push(`period=${s.period === "m12" ? "12" : "3"}`);
  if (s.budget !== DEFAULT_STATE.budget) parts.push(`budget=${formatBudgetParam(s.budget)}`);
  if (s.sqm !== defaultSqm(s.housing)) parts.push(`kvm=${s.sqm}`);
  if (s.area) parts.push(`omrade=${encodeURIComponent(s.area)}`);
  return parts.join("&");
}

export function appStateHref(s: AppState, pathname: string): string {
  const q = serializeAppState(s);
  return q ? `${pathname}?${q}` : pathname;
}

/** Byt vy. Har perioden inte valts uttryckligen (den är vyns standard) följer den med till nästa vys standard. */
export function withView(s: AppState, view: View): AppState {
  const period = s.period === defaultPeriod(s.view) ? defaultPeriod(view) : s.period;
  return { ...s, view, period };
}

/** Byt bostadstyp. Boarean följer med till nästa standard om den inte ändrats. */
export function withHousing(s: AppState, housing: Housing): AppState {
  const sqm = s.sqm === defaultSqm(s.housing) ? defaultSqm(housing) : s.sqm;
  return { ...s, housing, sqm };
}
