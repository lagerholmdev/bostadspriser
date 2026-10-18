/**
 * Färgskalor för kartor och förklaringar. Värdena kommer från design/scales.json, som också
 * pipelinen läser (delningsbilderna). styles/tokens.css har samma värden som CSS-variabler och
 * testas mot filen. Hex här eftersom MapLibre-uttryck och SVG inte läser CSS-variabler.
 */
import scales from "../../../design/scales.json";

type Six<T> = readonly [T, T, T, T, T, T];
type Five<T> = readonly [T, T, T, T, T];

export const PRICE_COLORS = scales.price.colors as unknown as Six<string>;

/** Klassgränser i kr/kvm. Fasta, så kartan och förklaringen inte flyttar sig mellan månader. */
export const PRICE_BREAKS = scales.price.breaks as unknown as Five<number>;

export const CHANGE_COLORS = {
  down: scales.change.down,
  flat: scales.change.flat,
  up: scales.change.up,
} as const;
/** Förändring i procent där färgen når full styrka. */
export const CHANGE_MAX: number = scales.change.max;

export const BUDGET_COLORS = {
  ok: scales.budget.ok,
  near: scales.budget.near,
  no: scales.budget.no,
} as const;
/** Inom så här mycket över budget räknas området som "nästan". */
export const NEAR_MARGIN: number = scales.budget.nearMargin;
export const NODATA_COLOR: string = scales.nodata;

export function priceColor(v: number | null | undefined): string {
  if (v == null) return NODATA_COLOR;
  const i = PRICE_BREAKS.findIndex((b) => v < b);
  return PRICE_COLORS[i === -1 ? PRICE_COLORS.length - 1 : i];
}

function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return (
    "#" +
    pa
      .map((x, i) =>
        Math.round(x + (pb[i] - x) * t)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

export function changeColor(v: number | null | undefined): string {
  if (v == null) return NODATA_COLOR;
  const t = Math.min(1, Math.abs(v) / CHANGE_MAX);
  return mix(CHANGE_COLORS.flat, v >= 0 ? CHANGE_COLORS.up : CHANGE_COLORS.down, t);
}

/** Läsbara klassnamn för förklaringen: "under 35 000", "35–50 000", … */
export function priceLegend(): { color: string; label: string }[] {
  const k = (n: number) => `${n / 1000}`;
  return PRICE_COLORS.map((color, i) => {
    if (i === 0) return { color, label: `under ${k(PRICE_BREAKS[0])} 000` };
    if (i === PRICE_COLORS.length - 1)
      return { color, label: `över ${k(PRICE_BREAKS[i - 1])} 000` };
    return { color, label: `${k(PRICE_BREAKS[i - 1])}–${k(PRICE_BREAKS[i])} 000` };
  });
}

/* ---------- Förändring i fem steg (kartsidan) ---------- */

/** −2 = tydligt ner, −1 = lite ner, 0 = i stort sett oförändrat, 1 = lite upp, 2 = tydligt upp. */
export type ChangeClass = -2 | -1 | 0 | 1 | 2;

/**
 * Stegens gränser i procent per period: [i stort sett oförändrat under, tydlig förändring från].
 * Tre månader svänger mindre än ett år, så gränserna är hälften så stora.
 */
export const CHANGE_STEPS = scales.change.steps as unknown as Record<
  "m3" | "m12",
  readonly [number, number]
>;
/** Förändring där färgen når full styrka: ±5 % på tre månader, ±10 % på ett år. */
export const CHANGE_FULL: Record<"m3" | "m12", number> = scales.change.full;

/** Vilket steg en förändring hamnar i, räknat på värdet som det visas (en decimal). */
export function changeClass(
  v: number | null | undefined,
  period: "m3" | "m12",
): ChangeClass | null {
  if (v == null) return null;
  const r = Math.round(v * 10) / 10;
  const [flat, strong] = CHANGE_STEPS[period];
  const a = Math.abs(r);
  const mag = a < flat ? 0 : a < strong ? 1 : 2;
  return (mag === 0 ? 0 : r < 0 ? -mag : mag) as ChangeClass;
}

/**
 * Färg för ett steg. Det svaga steget färgas som förändringen vid sin övre gräns
 * (2 av 5 % eller 4 av 10 %, alltså 40 % styrka), det tydliga med full färg.
 */
export function changeClassColor(c: ChangeClass, period: "m3" | "m12"): string {
  if (c === 0) return CHANGE_COLORS.flat;
  const t = Math.abs(c) === 2 ? 1 : CHANGE_STEPS[period][1] / CHANGE_FULL[period];
  return mix(CHANGE_COLORS.flat, c > 0 ? CHANGE_COLORS.up : CHANGE_COLORS.down, t);
}

/** Färg för en förändring i fem steg. Samma färger på kartan, i listan och i förklaringen. */
export function changeStepColor(v: number | null | undefined, period: "m3" | "m12"): string {
  const c = changeClass(v, period);
  return c == null ? NODATA_COLOR : changeClassColor(c, period);
}

/** De fem stegen från tydligt ner till tydligt upp, och gränserna mellan dem (fyra tal). */
export function changeStepLegend(period: "m3" | "m12"): { colors: string[]; ticks: number[] } {
  const [flat, strong] = CHANGE_STEPS[period];
  const classes: ChangeClass[] = [-2, -1, 0, 1, 2];
  return {
    colors: classes.map((c) => changeClassColor(c, period)),
    ticks: [-strong, -flat, flat, strong],
  };
}
