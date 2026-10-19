/**
 * SCB-kontexten: vilka som bor i ett område, och hur stor del av bostadsrätterna som säljs.
 * Rena funktioner; Astro-komponenterna och jämförelsen läser härifrån.
 */
import { areas, dataset } from "./data";
import type { Area, AreaContext, Dataset, Period } from "./types";

const NBSP = " ";

/** Andelarna i blocket "Vilka bor här?", i visningsordning. */
export type ShareKey = Exclude<keyof AreaContext, "condos">;

export interface ContextRow {
  key: ShareKey;
  label: string;
  /** Vad andelen räknas av. */
  note: string;
}

export const CONTEXT_ROWS: readonly ContextRow[] = [
  { key: "families", label: "Hushåll med barn", note: "andel av alla hushåll" },
  {
    key: "highIncome",
    label: "Hög inkomst",
    note: "vuxna i rikets översta inkomstfjärdedel",
  },
  {
    key: "higherEducation",
    label: "Lång utbildning",
    note: "25–65 år med minst 3 år på högskola",
  },
  { key: "age25to44", label: "25–44 år", note: "andel av invånarna" },
];

/** 0.3118 -> "31 %" */
export function share(v: number | null | undefined): string {
  return v == null ? "–" : `${Math.round(v * 100)}${NBSP}%`;
}

/** 0.0904 -> "9,0 %" (omsättningen, där en decimal behövs) */
export function shareOneDecimal(v: number | null | undefined): string {
  if (v == null) return "–";
  const s = (v * 100).toLocaleString("sv-SE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  return `${s}${NBSP}%`;
}

/**
 * Skalans tak för ett mått: högsta värdet bland områdena och länet, uppåt till närmaste tiotal
 * procent. Samma tak på alla områdessidor, så att staplarna går att jämföra mellan sidor.
 */
export function scaleMax(
  key: ShareKey,
  list: readonly Area[] = areas,
  ds: Dataset = dataset,
): number {
  const values = [ds.context?.county[key], ...list.map((a) => a.context?.[key])].filter(
    (v): v is number => v != null,
  );
  const top = values.length ? Math.max(...values) : 1;
  return Math.min(1, Math.ceil(top * 10 + 1e-9) / 10);
}

export interface ContextValue extends ContextRow {
  value: number;
  county: number | null;
  /** Läge på skalan 0–1 för området och länet. */
  at: number;
  countyAt: number | null;
}

/** Raderna för ett område, utan de mått som saknas. Tom lista om SCB-kontexten saknas. */
export function contextValues(area: Area, ds: Dataset = dataset): ContextValue[] {
  const ctx = area.context;
  if (!ctx || !ds.context) return [];
  return CONTEXT_ROWS.flatMap((row) => {
    const value = ctx[row.key];
    if (value == null) return [];
    const max = scaleMax(row.key, ds.areas, ds);
    const county = ds.context?.county[row.key] ?? null;
    return [
      {
        ...row,
        value,
        county,
        at: Math.min(1, value / max),
        countyAt: county == null ? null : Math.min(1, county / max),
      },
    ];
  });
}

/** "SCB 2025" eller "SCB 2025, inkomst 2024" när måtten gäller olika år. */
export function contextYears(ds: Dataset = dataset): string {
  if (!ds.context) return "";
  const years = ds.context.years;
  const counts = new Map<string, number>();
  for (const y of Object.values(years)) counts.set(y, (counts.get(y) ?? 0) + 1);
  const main = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || b[0].localeCompare(a[0]),
  )[0]?.[0];
  const others = CONTEXT_ROWS.filter((r) => years[r.key] !== main).map(
    (r) => `${r.label.toLowerCase()} ${years[r.key]}`,
  );
  return [`${ds.context.source.name} ${main}`, ...others].join(", ");
}

/**
 * Andel av bostadsrätterna som sålts under perioden: Mäklarstatistiks antal sålda delat med SCB:s
 * antal bostadsrätter. null om något saknas.
 */
export function turnover(
  sales: number | null | undefined,
  condos: number | null | undefined,
): number | null {
  return sales == null || !condos ? null : sales / condos;
}

export function areaTurnover(area: Area, period: Period): number | null {
  return turnover(area.apartment?.[period].sales, area.context?.condos);
}

export function countyTurnover(period: Period, ds: Dataset = dataset): number | null {
  return turnover(ds.county.apartment[period].sales, ds.context?.county.condos);
}
