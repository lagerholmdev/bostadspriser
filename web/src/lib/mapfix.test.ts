import { describe, expect, it } from "vitest";
import { mkrSpoken } from "./format";
import { CHANGE_COLORS, changeClass, changeStepColor, changeStepLegend } from "./scales";
import { DEFAULT_STATE, parseAppState, serializeAppState, withHousing, withView } from "./url";

const known = (s: string) => ["sodermalm", "solna"].includes(s);

describe("mkrSpoken", () => {
  it("skriver ut miljoner kronor för skärmläsare", () => {
    expect(mkrSpoken(5_250_000)).toBe("5,25 miljoner kronor");
    expect(mkrSpoken(1_000_000)).toBe("1 miljon kronor");
    expect(mkrSpoken(15_000_000)).toBe("15 miljoner kronor");
  });
});

describe("förändring i fem steg", () => {
  it("har gränser som beror på perioden", () => {
    expect(changeClass(0.4, "m3")).toBe(0);
    expect(changeClass(0.5, "m3")).toBe(1);
    expect(changeClass(-1.9, "m3")).toBe(-1);
    expect(changeClass(2, "m3")).toBe(2);
    expect(changeClass(-4.9, "m3")).toBe(-2);
    expect(changeClass(0.9, "m12")).toBe(0);
    expect(changeClass(-0.04, "m12")).toBe(0);
    expect(changeClass(3.95, "m12")).toBe(2); // avrundas till 4,0 som det visas
    expect(changeClass(3.9, "m12")).toBe(1);
    expect(changeClass(10.5, "m12")).toBe(2);
    expect(changeClass(null, "m12")).toBeNull();
  });
  it("ger samma färger på kartan och i förklaringen", () => {
    const { colors, ticks } = changeStepLegend("m3");
    expect(ticks).toEqual([-2, -0.5, 0.5, 2]);
    expect(changeStepLegend("m12").ticks).toEqual([-4, -1, 1, 4]);
    expect(colors).toHaveLength(5);
    expect(colors[0]).toBe(CHANGE_COLORS.down);
    expect(colors[2]).toBe(CHANGE_COLORS.flat);
    expect(colors[4]).toBe(CHANGE_COLORS.up);
    expect(changeStepColor(1, "m3")).toBe(colors[3]);
    expect(changeStepColor(-3, "m3")).toBe(colors[0]);
    expect(new Set(colors).size).toBe(5);
  });
});

describe("standardval per vy och bostadstyp", () => {
  it("visar förändring på ett år när perioden inte står i adressen", () => {
    expect(parseAppState("vy=forandring", known).state.period).toBe("m12");
    expect(parseAppState("vy=forandring&period=3", known).state.period).toBe("m3");
    expect(parseAppState("", known).state.period).toBe("m3");
    expect(serializeAppState({ ...DEFAULT_STATE, view: "forandring", period: "m12" })).toBe(
      "vy=forandring",
    );
    expect(serializeAppState({ ...DEFAULT_STATE, view: "forandring", period: "m3" })).toBe(
      "vy=forandring&period=3",
    );
    expect(serializeAppState({ ...DEFAULT_STATE, period: "m12" })).toBe("period=12");
  });
  it("räknar villor på 120 kvm om inget annat står", () => {
    expect(parseAppState("vy=budget&bostad=villa", known).state.sqm).toBe(120);
    expect(parseAppState("vy=budget&bostad=villa&kvm=60", known).state.sqm).toBe(60);
    expect(serializeAppState({ ...DEFAULT_STATE, housing: "house", sqm: 120 })).toBe(
      "bostad=villa",
    );
    expect(serializeAppState({ ...DEFAULT_STATE, housing: "house", sqm: 60 })).toBe(
      "bostad=villa&kvm=60",
    );
  });
  it("låter standardval följa med vid byte, men behåller det användaren valt", () => {
    expect(withView(DEFAULT_STATE, "forandring").period).toBe("m12");
    expect(withView({ ...DEFAULT_STATE, period: "m12" }, "forandring").period).toBe("m12");
    expect(withView({ ...DEFAULT_STATE, view: "forandring", period: "m12" }, "pris").period).toBe(
      "m3",
    );
    expect(withView({ ...DEFAULT_STATE, view: "forandring", period: "m3" }, "pris").period).toBe(
      "m3",
    );
    expect(withHousing(DEFAULT_STATE, "house").sqm).toBe(120);
    expect(withHousing({ ...DEFAULT_STATE, sqm: 75 }, "house").sqm).toBe(75);
    expect(withHousing({ ...DEFAULT_STATE, housing: "house", sqm: 120 }, "apartment").sqm).toBe(60);
  });
  it("går fram och tillbaka utan förlust", () => {
    for (const s of [
      {
        ...DEFAULT_STATE,
        view: "forandring" as const,
        period: "m3" as const,
        housing: "house" as const,
        sqm: 60,
        area: "solna",
      },
      {
        ...DEFAULT_STATE,
        view: "budget" as const,
        housing: "house" as const,
        sqm: 120,
        budget: 7_250_000,
      },
    ]) {
      expect(parseAppState(serializeAppState(s), known).state).toEqual(s);
    }
  });
});
