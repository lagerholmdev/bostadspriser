/**
 * "Var har jag råd?": jämför budget per kvadratmeter med områdets snittpris.
 * Rent och utan DOM, så det går att testa.
 */

export type BudgetStatus = "ok" | "near" | "no";

/** Inom så här mycket över budget räknas området som "nästan". */
export const NEAR_MARGIN = 0.1;

export const BUDGET_RANGE = { min: 1_000_000, max: 15_000_000, step: 250_000, default: 5_000_000 };
export const SIZE_RANGE = { min: 20, max: 150, step: 5, default: 60 };

/** Högsta kr/kvm som budgeten räcker till för en viss storlek. */
export function affordablePricePerSqm(budget: number, sqm: number): number {
  return budget / sqm;
}

/** Hur stor bostad budgeten räcker till i ett område. */
export function affordableSize(budget: number, pricePerSqm: number): number {
  return budget / pricePerSqm;
}

/** Vad bostaden kostar i området, avrundat till närmaste 100 000. */
export function estimatedCost(pricePerSqm: number, sqm: number): number {
  return Math.round((pricePerSqm * sqm) / 100_000) * 100_000;
}

export function budgetStatus(budget: number, sqm: number, pricePerSqm: number | null): BudgetStatus | null {
  if (pricePerSqm == null) return null;
  const max = affordablePricePerSqm(budget, sqm);
  if (pricePerSqm <= max) return "ok";
  if (pricePerSqm <= max * (1 + NEAR_MARGIN)) return "near";
  return "no";
}
