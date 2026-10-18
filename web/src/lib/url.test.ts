import { describe, expect, it } from "vitest";
import { DEFAULT_STATE, parseBudget, parseSqm, parseState, sameState, serializeState, stateHref } from "./url";

const known = (s: string) => ["sodermalm", "kungsholmen", "solna", "nacka"].includes(s);

describe("parseState", () => {
  it("ger standardläget för en tom adress", () => {
    const r = parseState("", known);
    expect(r.state).toEqual(DEFAULT_STATE);
    expect(r.legacy).toBe(false);
    expect(r.compare).toEqual([]);
  });

  it("läser alla parametrar", () => {
    const r = parseState("?vy=budget&bostad=villa&period=12&budget=5.5&kvm=70&omrade=sodermalm", known);
    expect(r.state).toEqual({
      view: "budget",
      housing: "house",
      period: "m12",
      budget: 5_500_000,
      sqm: 70,
      area: "sodermalm",
    });
    expect(r.legacy).toBe(false);
  });

  it("avrundar budget och kvm till reglagens steg och gränser", () => {
    expect(parseState("budget=5.3", known).state.budget).toBe(5_250_000);
    expect(parseState("budget=5,5", known).state.budget).toBe(5_500_000);
    expect(parseState("budget=99", known).state.budget).toBe(15_000_000);
    expect(parseState("budget=0.2", known).state.budget).toBe(1_000_000);
    expect(parseState("kvm=63", known).state.sqm).toBe(65);
    expect(parseState("kvm=500", known).state.sqm).toBe(150);
    expect(parseState("kvm=abc", known).state.sqm).toBe(60);
    expect(parseBudget("")).toBeNull();
    expect(parseBudget("-3")).toBeNull();
    expect(parseSqm(null)).toBeNull();
  });

  it("ignorerar okända värden och områden", () => {
    const r = parseState("vy=volym&bostad=slott&period=7&omrade=atlantis", known);
    expect(r.state.view).toBe("pris");
    expect(r.state.housing).toBe("apartment");
    expect(r.state.period).toBe("m3");
    expect(r.state.area).toBeNull();
  });

  it("översätter äldre adresser", () => {
    const r = parseState("vy=trend&typ=villa&per=m12&omr=kungsholmen", known);
    expect(r.state.view).toBe("forandring");
    expect(r.state.housing).toBe("house");
    expect(r.state.period).toBe("m12");
    expect(r.state.area).toBe("kungsholmen");
    expect(r.legacy).toBe(true);
    expect(parseState("typ=br&per=m3", known).state.housing).toBe("apartment");
    expect(parseState("typ=br&per=m3", known).legacy).toBe(true);
  });

  it("plockar ut äldre jämförelser, högst tre och bara kända områden", () => {
    const r = parseState("jamfor=sodermalm,okänd,solna,sodermalm,nacka,kungsholmen", known);
    expect(r.compare).toEqual(["sodermalm", "solna", "nacka"]);
    expect(r.legacy).toBe(true);
  });

  it("tar emot URLSearchParams", () => {
    expect(parseState(new URLSearchParams({ vy: "forandring" }), known).state.view).toBe("forandring");
  });
});

describe("serializeState", () => {
  it("utelämnar standardvärden", () => {
    expect(serializeState(DEFAULT_STATE)).toBe("");
    expect(stateHref(DEFAULT_STATE, "/bostadspriser/")).toBe("/bostadspriser/");
  });

  it("skriver bara det som avviker, i fast ordning", () => {
    const s = { ...DEFAULT_STATE, view: "budget" as const, budget: 5_250_000, area: "solna" };
    expect(serializeState(s)).toBe("vy=budget&budget=5.25&omrade=solna");
    expect(stateHref(s, "/bostadspriser/")).toBe("/bostadspriser/?vy=budget&budget=5.25&omrade=solna");
    expect(serializeState({ ...DEFAULT_STATE, housing: "house", period: "m12", sqm: 85 })).toBe(
      "bostad=villa&period=12&kvm=85",
    );
  });

  it("går fram och tillbaka utan förlust", () => {
    const s = { view: "forandring" as const, housing: "house" as const, period: "m12" as const, budget: 12_750_000, sqm: 145, area: "nacka" };
    const back = parseState(serializeState(s), known).state;
    expect(sameState(back, s)).toBe(true);
    expect(sameState(back, { ...s, sqm: 140 })).toBe(false);
  });
});
