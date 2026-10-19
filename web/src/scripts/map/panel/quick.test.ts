import { describe, expect, it } from "vitest";
import { countyRatio, getArea, shownStat } from "../../../lib/data";
import { relative } from "../../../lib/format";
import { DEFAULT_STATE } from "../../../lib/url";
import { changeModel, priceModel } from "../model";
import { peekHtml, quick } from "./quick";
import { changeSummary, priceSummary } from "./views";

const SLUG = "sodermalm";

describe("quick", () => {
  it("visar läget mot länet i prisvyn", () => {
    const a = getArea(SLUG)!;
    const p = shownStat(a, "apartment", "m3")!.pricePerSqm;
    const q = quick(SLUG, { ...DEFAULT_STATE })!;
    expect(q.county).toBe(`${relative(countyRatio(p))} länet`);
    expect(peekHtml(SLUG, { ...DEFAULT_STATE }).value).toContain(q.county);
  });

  it("jämför inte med länet i de andra vyerna", () => {
    expect(quick(SLUG, { ...DEFAULT_STATE, view: "budget" })!.county).toBe("");
    expect(quick(SLUG, { ...DEFAULT_STATE, view: "forandring" })!.county).toBe("");
  });

  it("jämför inte stadens villapris med länet som om det gällde stadsdelen", () => {
    expect(quick(SLUG, { ...DEFAULT_STATE, housing: "house" })!.county).toBe("");
  });
});

describe("vyernas svar", () => {
  it("börjar prisvyn med länets snitt som stor siffra", () => {
    const m = priceModel("apartment", "m3", "desc");
    const out = priceSummary(m, "apartment", "m3").value;
    expect(out).toContain('class="lead"');
    expect(out).toContain(`Dyrast är ${m.dearest!.name}, billigast ${m.cheapest!.name}.`);
  });

  it("räknar upp och ner i förändringsvyn", () => {
    const m = changeModel("apartment", "m12");
    const out = changeSummary(m, "apartment", "m12").value;
    expect(out).toContain("i länet på ett år");
    expect(out).toContain(`${m.countUp} områden har gått upp och ${m.countDown} ner`);
  });
});
