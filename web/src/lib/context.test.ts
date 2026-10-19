import { describe, expect, it } from "vitest";
import { bySlug, dataset } from "./data";
import {
  areaTurnover,
  contextValues,
  contextYears,
  countyTurnover,
  scaleMax,
  share,
  shareOneDecimal,
  turnover,
} from "./context";
import type { Area } from "./types";

const sodermalm = bySlug.get("sodermalm") as Area;

describe("SCB-kontexten", () => {
  it("formaterar andelar på svenska", () => {
    expect(share(0.3118)).toBe("31 %");
    expect(shareOneDecimal(0.0904)).toBe("9,0 %");
    expect(share(null)).toBe("–");
  });

  it("har fyra rader per område med länet som jämförelse", () => {
    const rows = contextValues(sodermalm);
    expect(rows.map((r) => r.key)).toEqual([
      "families",
      "highIncome",
      "higherEducation",
      "age25to44",
    ]);
    for (const r of rows) {
      expect(r.at).toBeGreaterThan(0);
      expect(r.at).toBeLessThanOrEqual(1);
      expect(r.county).not.toBeNull();
    }
    const income = rows.find((r) => r.key === "highIncome");
    expect(income?.value).toBe(0.4249);
    expect(income?.county).toBe(0.34);
  });

  it("ger samma skala på alla sidor, avrundad uppåt till tiotal", () => {
    // Högsta andelen höginkomsttagare är 50,06 % (Vasastan-Norrmalm), alltså tak 60 %.
    expect(scaleMax("highIncome")).toBe(0.6);
    expect(scaleMax("families")).toBe(0.5);
  });

  it("visar inget utan kontext", () => {
    expect(contextValues({ ...sodermalm, context: null })).toEqual([]);
    expect(contextValues(sodermalm, { ...dataset, context: null })).toEqual([]);
  });

  it("anger året och avvikande år per mått", () => {
    expect(contextYears()).toBe("SCB 2025, hög inkomst 2024");
  });

  it("räknar omsättningen som sålda delat med beståndet", () => {
    expect(turnover(90, 1000)).toBe(0.09);
    expect(turnover(null, 1000)).toBeNull();
    expect(turnover(5, 0)).toBeNull();
    const s = areaTurnover(sodermalm, "m12");
    expect(s).toBeCloseTo(3874 / 42916, 6);
    expect(countyTurnover("m12")).toBeGreaterThan(0.05);
  });
});
