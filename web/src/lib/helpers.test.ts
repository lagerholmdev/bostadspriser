import { describe, expect, it } from "vitest";
import { typicalRooms } from "./budget";
import { areas, countyRatio, getArea, parseCompareParams, priceRank } from "./data";
import { changeDirection, changeWord, pricier, searchKey } from "./format";

describe("format-tillägg", () => {
  it("searchKey tar bort diakritiska tecken och bindestreck", () => {
    expect(searchKey("Hägersten-Liljeholmen")).toBe("hagersten liljeholmen");
    expect(searchKey("  ÖSTERÅKER ")).toBe("osteraker");
    expect(searchKey("Upplands Väsby")).toBe("upplands vasby");
  });

  it("changeDirection följer den avrundade siffran", () => {
    expect(changeDirection(2)).toBe("up");
    expect(changeDirection(-0.4)).toBe("down");
    expect(changeDirection(0.04)).toBe("flat");
    expect(changeDirection(-0.04)).toBe("flat");
    expect(changeDirection(null)).toBeNull();
    expect(changeWord(1.2)).toBe("upp");
    expect(changeWord(-1.2)).toBe("ner");
    expect(changeWord(0)).toBe("oförändrat");
    expect(changeWord(undefined)).toBe("");
  });

  it("pricier beskriver skillnad i ord", () => {
    expect(pricier(0.123)).toBe("12 % dyrare");
    expect(pricier(-0.3)).toBe("30 % billigare");
    expect(pricier(0.001)).toBe("samma pris");
    expect(pricier(null)).toBe("–");
  });
});

describe("data-tillägg", () => {
  it("priceRank räknar dyrast först", () => {
    const r = priceRank(getArea("vasastan-norrmalm")!);
    expect(r).toEqual({ rank: 1, total: areas.length });
    expect(priceRank(getArea("sodermalm")!)?.rank).toBe(3);
  });

  it("countyRatio jämför med länets snitt", () => {
    expect(countyRatio(70849)).toBeCloseTo(0, 5);
    expect(countyRatio(null)).toBeNull();
    expect(countyRatio(116680)! * 100).toBeCloseTo(64.7, 0);
  });

  it("parseCompareParams läser nya och gamla adressformat", () => {
    expect(parseCompareParams(new URLSearchParams("omraden=sodermalm,nacka"))).toEqual(["sodermalm", "nacka"]);
    expect(parseCompareParams(new URLSearchParams("a=sodermalm&b=nacka&c=solna"))).toEqual(["sodermalm", "nacka", "solna"]);
    expect(parseCompareParams(new URLSearchParams("jamfor=solna,solna,okänt"))).toEqual(["solna"]);
    expect(parseCompareParams(new URLSearchParams("omraden=a1,sodermalm,nacka,solna,taby"))).toEqual([
      "sodermalm",
      "nacka",
      "solna",
    ]);
    expect(parseCompareParams(new URLSearchParams(""))).toEqual([]);
  });
});

describe("budget-tillägg", () => {
  it("typicalRooms översätter kvm till rum", () => {
    expect(typicalRooms(30)).toBe("en etta");
    expect(typicalRooms(45)).toBe("en tvåa");
    expect(typicalRooms(70)).toBe("en trea");
    expect(typicalRooms(120)).toBe("en femma eller större");
  });
});
