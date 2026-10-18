/** Återkommande formuleringar i panelen, så att samma sak alltid sägs på samma sätt. */
import { dataset, THIN_SALES } from "../../../lib/data";
import { number } from "../../../lib/format";
import type { Housing, Period } from "../../../lib/types";

export const PERIOD_SHORT: Record<Period, string> = { m3: "Senaste 3 mån", m12: "Senaste 12 mån" };
export const PERIOD_PHRASE: Record<Period, string> = { m3: "de senaste 3 månaderna", m12: "de senaste 12 månaderna" };
/**
 * Mäklarstatistik räknar båda förändringarna på de senaste tre månaderna:
 * m3 mot de tre månaderna före, m12 mot samma tre månader året innan.
 */
export const CHANGE_LABEL: Record<Period, string> = {
  m3: "Förändring på tre månader",
  m12: "Förändring på ett år",
};
export const COMPARED_TO: Record<Period, string> = {
  m3: "jämfört med de tre månaderna före",
  m12: "de senaste tre månaderna jämfört med samma månader året innan",
};

/** "jul–sep 2026" -> "jul–sep 2025" */
export function sameMonthsLastYear(): string {
  return dataset.periods.m3.replace(/\d{4}/g, (y) => String(Number(y) - 1));
}

/** Mening om vad förändringen jämför, med månader: "jul–sep 2026 jämfört med apr–jun 2026" är okänt, så m3 anges i ord. */
export function changeBasis(period: Period): string {
  return period === "m12"
    ? `${dataset.periods.m3} jämfört med ${sameMonthsLastYear()}`
    : `${dataset.periods.m3} jämfört med de tre månaderna före`;
}
export const HOUSING_ONE: Record<Housing, string> = { apartment: "en bostadsrätt", house: "en villa" };
export const HOUSING_MANY: Record<Housing, string> = { apartment: "bostadsrätter", house: "villor" };
export const HOUSING_SHORT: Record<Housing, string> = { apartment: "Bostadsrätter", house: "Villor" };

export const CITY_HOUSE_NOTE = "Villor redovisas för hela Stockholms stad.";

/** "jul–sep 2026" */
export function months(period: Period): string {
  return dataset.periods[period];
}

/** "879 sålda", "38 sålda, få affärer", "antal saknas" */
export function salesText(sales: number | null, thin: boolean): string {
  if (sales == null) return "antal saknas";
  return thin ? `${number(sales)} sålda, få affärer` : `${number(sales)} sålda`;
}

export function thinExplainer(period: Period): string {
  return `Blekta rader bygger på färre än ${THIN_SALES[period]} affärer och är osäkrare.`;
}
