import { describe, expect, it } from "vitest";
import { typicalRooms } from "./budget";
import { editDistance, findAreas, suggestArea } from "./aliases";
import { areas, countyRatio, getArea, parseCompareParams, placeInCounty, rankWindow } from "./data";
import { changeSentence, joinNames, rankPhrase } from "./text";
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
  it("placeInCounty räknar dyrast först", () => {
    const r = placeInCounty(getArea("vasastan-norrmalm")!, "apartment", "m3");
    expect(r).toEqual({ rank: 1, total: areas.length });
    expect(placeInCounty(getArea("sodermalm")!, "apartment", "m3")?.rank).toBe(3);
  });

  it("countyRatio jämför med länets snitt", () => {
    expect(countyRatio(70849)).toBeCloseTo(0, 5);
    expect(countyRatio(null)).toBeNull();
    expect(countyRatio(116680)! * 100).toBeCloseTo(64.7, 0);
  });

  it("parseCompareParams läser nya och gamla adressformat", () => {
    expect(parseCompareParams(new URLSearchParams("omraden=sodermalm,nacka"))).toEqual([
      "sodermalm",
      "nacka",
    ]);
    expect(parseCompareParams(new URLSearchParams("a=sodermalm&b=nacka&c=solna"))).toEqual([
      "sodermalm",
      "nacka",
      "solna",
    ]);
    expect(parseCompareParams(new URLSearchParams("jamfor=solna,solna,okänt"))).toEqual(["solna"]);
    expect(
      parseCompareParams(new URLSearchParams("omraden=a1,sodermalm,nacka,solna,taby")),
    ).toEqual(["sodermalm", "nacka", "solna"]);
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

describe("text", () => {
  it("changeSentence knyter ihop år och kvartal", () => {
    expect(changeSentence(6.6, -1.1)).toBe(
      "Priserna har gått upp 6,6\u00a0% på ett år, men ner 1,1\u00a0% de senaste tre månaderna.",
    );
    expect(changeSentence(10.5, 2)).toBe(
      "Priserna har gått upp 10,5\u00a0% på ett år och 2,0\u00a0% de senaste tre månaderna.",
    );
    expect(changeSentence(-6, -4.9)).toBe(
      "Priserna har gått ner 6,0\u00a0% på ett år och 4,9\u00a0% de senaste tre månaderna.",
    );
    expect(changeSentence(-0.9, 3.7)).toBe(
      "Priserna har gått ner 0,9\u00a0% på ett år, men upp 3,7\u00a0% de senaste tre månaderna.",
    );
    expect(changeSentence(0, 2)).toBe(
      "Priserna är oförändrade på ett år, men har gått upp 2,0\u00a0% de senaste tre månaderna.",
    );
    expect(changeSentence(5.1, 0.04)).toBe(
      "Priserna har gått upp 5,1\u00a0% på ett år, men stått still de senaste tre månaderna.",
    );
    expect(changeSentence(0, 0)).toBe(
      "Priserna är oförändrade, både på ett år och de senaste tre månaderna.",
    );
    expect(changeSentence(null, -1.4)).toBe(
      "Priserna har gått ner 1,4\u00a0% de senaste tre månaderna. Förändringen på ett år saknas.",
    );
    expect(changeSentence(2.1, undefined)).toBe("Priserna har gått upp 2,1\u00a0% på ett år.");
    expect(changeSentence(null, null)).toBeNull();
  });

  it("rankPhrase säger dyrast, billigast eller plats", () => {
    expect(rankPhrase(1, 37)).toBe("dyrast av 37 områden");
    expect(rankPhrase(37, 37)).toBe("billigast av 37 områden");
    expect(rankPhrase(3, 37)).toBe("3:e dyrast av 37 områden");
    expect(rankPhrase(19, 37)).toBe("19:e dyrast av 37 områden");
    expect(rankPhrase(35, 37)).toBe("3:e billigast av 37 områden");
  });

  it("joinNames binder ihop med komma och och", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["A"])).toBe("A");
    expect(joinNames(["A", "B", "C"])).toBe("A, B och C");
  });
});

describe("rankWindow", () => {
  it("visar topp, botten och grannar med hopp", () => {
    expect(rankWindow(37, 2)).toEqual([0, 1, 2, 3, 4, 5, null, 36]);
    expect(rankWindow(37, 18)).toEqual([0, null, 15, 16, 17, 18, 19, 20, 21, null, 36]);
    expect(rankWindow(37, 36)).toEqual([0, null, 33, 34, 35, 36]);
    // Ett hopp över en rad visar raden i stället.
    expect(rankWindow(37, 5)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, null, 36]);
    expect(rankWindow(5, 2)).toEqual([0, 1, 2, 3, 4]);
    expect(rankWindow(0, 0)).toEqual([]);
  });
});

describe("aliases", () => {
  it("findAreas hittar via stadsdelar och orter", () => {
    const [hit] = findAreas("aspudden", areas);
    expect(hit?.area.slug).toBe("hagersten-liljeholmen");
    expect(hit?.via).toBe("Aspudden");
    expect(findAreas("åkersberga", areas)[0]?.area.slug).toBe("osteraker");
    const sod = findAreas("söd", areas);
    expect(sod[0]?.area.slug).toBe("sodermalm");
    expect(sod[0]?.via).toBeNull();
    expect(findAreas("", areas)).toEqual([]);
  });

  it("suggestArea gissar på felstavade adresser", () => {
    expect(suggestArea("sodermalmm", areas)?.area.slug).toBe("sodermalm");
    expect(suggestArea("sodermalm-", areas)?.area.slug).toBe("sodermalm");
    expect(suggestArea("hagersten", areas)?.area.slug).toBe("hagersten-liljeholmen");
    expect(suggestArea("kungsholmn", areas)?.area.slug).toBe("kungsholmen");
    expect(suggestArea("aspuden", areas)?.area.slug).toBe("hagersten-liljeholmen");
    expect(suggestArea("S%C3%B6dermalm", areas)?.area.slug).toBe("sodermalm");
    expect(suggestArea("xyzzyq", areas)).toBeNull();
    expect(suggestArea("a", areas)).toBeNull();
  });

  it("editDistance räknar redigeringar", () => {
    expect(editDistance("kitten", "sitting")).toBe(3);
    expect(editDistance("", "abc")).toBe(3);
    expect(editDistance("abc", "abc")).toBe(0);
  });
});
