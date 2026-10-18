/**
 * Färgskalor för kartor och förklaringar. Samma värden som i styles/tokens.css,
 * men som hex här eftersom MapLibre-uttryck och SVG inte läser CSS-variabler.
 */

export const PRICE_COLORS = ["#efdba6", "#ecc884", "#dda052", "#c4713a", "#9c4a2b", "#652a21"] as const;

/** Klassgränser i kr/kvm. Fasta, så kartan och förklaringen inte flyttar sig mellan månader. */
export const PRICE_BREAKS = [35_000, 50_000, 65_000, 85_000, 110_000] as const;

export const CHANGE_COLORS = { down: "#3d6a9e", flat: "#d9d6cf", up: "#b0502a" } as const;
/** Förändring i procent där färgen når full styrka. */
export const CHANGE_MAX = 10;

export const BUDGET_COLORS = { ok: "#2e7f86", near: "#e3a948", no: "#b9bdb6" } as const;
export const NODATA_COLOR = "#e4e6e1";

export function priceColor(v: number | null | undefined): string {
  if (v == null) return NODATA_COLOR;
  const i = PRICE_BREAKS.findIndex((b) => v < b);
  return PRICE_COLORS[i === -1 ? PRICE_COLORS.length - 1 : i];
}

function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return "#" + pa.map((x, i) => Math.round(x + (pb[i] - x) * t).toString(16).padStart(2, "0")).join("");
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
    if (i === PRICE_COLORS.length - 1) return { color, label: `över ${k(PRICE_BREAKS[i - 1])} 000` };
    return { color, label: `${k(PRICE_BREAKS[i - 1])}–${k(PRICE_BREAKS[i])} 000` };
  });
}
