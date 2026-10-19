import { describe, expect, it } from "vitest";
import { areas, getArea, placeInCounty } from "../../lib/data";
import { BUDGET_COLORS, NODATA_COLOR, changeStepColor, priceColor } from "../../lib/scales";
import { DEFAULT_STATE } from "../../lib/url";
import {
  CITY_NAME,
  budgetModel,
  changeModel,
  rowKey,
  entries,
  mapPaint,
  priceModel,
  sortEntries,
  unionBbox,
} from "./model";

describe("entries", () => {
  it("har en rad per område för bostadsrätter", () => {
    const list = entries("apartment", "m3");
    expect(list).toHaveLength(areas.length);
    expect(list.every((e) => e.slug)).toBe(true);
  });

  it("slår ihop stadsdelarna till Stockholms stad för villor", () => {
    const list = entries("house", "m3");
    const city = list.filter((e) => e.slug === null);
    expect(city).toHaveLength(1);
    expect(city[0].name).toBe(CITY_NAME);
    const districts = areas.filter((a) => a.houseScope === "city").length;
    expect(list).toHaveLength(areas.length - districts + 1);
  });
});

describe("sortEntries", () => {
  const list = entries("apartment", "m3");
  it("sorterar dyrast och billigast först", () => {
    const desc = sortEntries(list, "desc");
    const asc = sortEntries(list, "asc");
    expect(desc[0].stat.pricePerSqm).toBeGreaterThanOrEqual(desc[1].stat.pricePerSqm!);
    expect(asc[0].slug).toBe(desc[desc.length - 1].slug);
  });
  it("sorterar A–Ö med svensk ordning (å, ä, ö sist)", () => {
    const names = sortEntries(list, "name").map((e) => e.name);
    expect(names.indexOf("Österåker")).toBeGreaterThan(names.indexOf("Värmdö"));
    expect(names.indexOf("Täby")).toBeGreaterThan(names.indexOf("Södertälje"));
  });
  it("lägger områden utan pris sist", () => {
    const fake = [
      ...list.slice(0, 2),
      { ...list[2], stat: { ...list[2].stat, pricePerSqm: null } },
    ];
    expect(sortEntries(fake, "desc")[2].stat.pricePerSqm).toBeNull();
    expect(sortEntries(fake, "asc")[2].stat.pricePerSqm).toBeNull();
  });
});

describe("priceModel", () => {
  it("hittar dyraste och billigaste", () => {
    const m = priceModel("apartment", "m3");
    expect(m.dearest?.slug).toBe("vasastan-norrmalm");
    expect(m.cheapest?.slug).toBe("sigtuna");
    expect(m.max).toBe(m.dearest?.stat.pricePerSqm);
    expect(m.county).toBe(70849);
  });
});

describe("budgetModel", () => {
  it("delar upp i räcker, nästan och räcker inte", () => {
    const m = budgetModel("apartment", "m3", 5_000_000, 60);
    expect(m.ok.length + m.near.length + m.no.length).toBe(m.total);
    expect(m.total).toBe(areas.length);
    expect(m.maxPerSqm).toBeCloseTo(83333.33, 1);
    expect(m.ok.every((e) => e.stat.pricePerSqm! <= m.maxPerSqm)).toBe(true);
    expect(m.near.every((e) => e.stat.pricePerSqm! <= m.maxPerSqm * 1.1)).toBe(true);
    // Dyrast du har råd med först, närmast budgeten.
    expect(m.ok[0].slug).toBe("hagersten-liljeholmen");
    expect(Math.floor(m.ok[0].size)).toBe(62);
    expect(m.ok[0].stat.pricePerSqm).toBeGreaterThanOrEqual(
      m.ok[m.ok.length - 1].stat.pricePerSqm!,
    );
    // Över budget: billigast (närmast budgeten) först.
    expect(
      m.near.every((e, i, a) => i === 0 || e.stat.pricePerSqm! >= a[i - 1].stat.pricePerSqm!),
    ).toBe(true);
    expect(m.cheapest?.slug).toBe("sigtuna");
  });
  it("räknar Stockholms stad som ett område för villor", () => {
    const m = budgetModel("house", "m3", 5_000_000, 60);
    // Alla rader utom Solna (4 villor sålda, visas utan pris).
    expect(m.total).toBe(entries("house", "m3").length - 1);
    expect(m.missing.map((e) => e.slug)).toEqual(["solna"]);
  });
  it("räcker ingenstans med liten budget och stor bostad", () => {
    const m = budgetModel("apartment", "m3", 1_000_000, 150);
    expect(m.ok).toHaveLength(0);
  });
});

describe("changeModel", () => {
  it("ger högst fem upp och fem ner, med rätt tecken", () => {
    const m = changeModel("apartment", "m3");
    expect(m.up.length).toBeLessThanOrEqual(5);
    expect(m.down.length).toBeLessThanOrEqual(5);
    expect(m.up.every((e) => e.stat.change! > 0)).toBe(true);
    expect(m.down.every((e) => e.stat.change! < 0)).toBe(true);
    expect(m.up[0].slug).toBe("lidingo");
    expect(m.down[0].slug).toBe("sigtuna");
    expect(m.countUp + m.countDown + m.countFlat).toBe(m.all.length);
  });
  it("tar antal affärer från tremånadersperioden även för förändring på ett år", () => {
    const m = changeModel("apartment", "m12");
    const solna = m.all.find((e) => e.slug === "solna")!;
    expect(solna.stat.sales).toBe(getArea("solna")!.apartment!.m3.sales);
  });
  it("visar ingen placeringsflytt när bara en månad finns", () => {
    expect(changeModel("apartment", "m12").shift.size).toBe(0);
  });
  it("räknar placeringsflytt mot förra månaden, bara för flyttar på minst två platser", () => {
    // Förra månaden: Sigtuna (störst nedgång nu) hade i stället den största ökningen.
    const prev = areas.map((a) =>
      a.slug === "sigtuna" && a.apartment
        ? { ...a, apartment: { ...a.apartment, m12: { ...a.apartment.m12, change: 50 } } }
        : a,
    );
    const m = changeModel("apartment", "m12", 5, prev);
    const last = m.all.length - 1;
    expect(m.all[last].slug).toBe("sigtuna");
    expect(m.shift.get("sigtuna")).toBe(-last);
    // De som låg under Sigtuna förra månaden har flyttat upp en plats: för lite för att visas.
    expect([...m.shift.keys()]).toEqual(["sigtuna"]);
  });
  it("matchar villornas stadsrad mot förra månadens stadsrad", () => {
    const m = changeModel("house", "m12", 5, areas);
    expect(m.shift.size).toBe(0);
    expect(m.all.some((e) => rowKey(e) === "stockholm")).toBe(true);
  });
  it("listar områden där förändringen saknas", () => {
    const m = changeModel("apartment", "m12");
    expect(m.missing.map((e) => e.slug)).toContain("nykvarn");
  });
});

describe("placeInCounty", () => {
  it("ger plats 1 till dyraste och delar stadens plats för villor", () => {
    expect(placeInCounty(getArea("vasastan-norrmalm")!, "apartment", "m3")).toEqual({
      rank: 1,
      total: areas.length,
    });
    const a = placeInCounty(getArea("sodermalm")!, "house", "m3");
    const b = placeInCounty(getArea("spanga-kista")!, "house", "m3");
    expect(a).toEqual(b);
    expect(a).not.toBeNull();
  });
  it("räknar inte villor med för få affärer (Solna, 4 sålda)", () => {
    expect(placeInCounty(getArea("solna")!, "house", "m3")).toBeNull();
    const total = entries("house", "m3").filter((e) => e.stat.pricePerSqm != null).length;
    expect(placeInCounty(getArea("danderyd")!, "house", "m3")?.total).toBe(total);
  });
});

describe("villor med få affärer", () => {
  it("visas utan pris och med orsak", () => {
    const solna = entries("house", "m3").find((e) => e.slug === "solna")!;
    expect(solna.stat.pricePerSqm).toBeNull();
    expect(solna.stat.missing?.pricePerSqm).toBe("F");
    // Med tolv månader finns 37 affärer, så priset visas.
    expect(entries("house", "m12").find((e) => e.slug === "solna")!.stat.pricePerSqm).toBe(76476);
  });
});

describe("mapPaint", () => {
  it("färgar efter pris i prisvyn och gör osäkra områden randiga", () => {
    const p = mapPaint(DEFAULT_STATE);
    expect(p.color.sodermalm).toBe(priceColor(116680));
    expect(p.color.ekero).toBe(priceColor(47297)); // full färg trots få affärer
    expect(p.thin).toContain("ekero"); // 38 affärer
    expect(p.thin).not.toContain("sodermalm");
    expect(p.nodata).toEqual([]);
    expect(p.price.sodermalm).toBe(116680);
  });
  it("ritar stadsdelarna randiga med stadens färg för villor", () => {
    const p = mapPaint({ ...DEFAULT_STATE, housing: "house" });
    expect(p.color.sodermalm).toBe(priceColor(75494));
    expect(p.color.kungsholmen).toBe(p.color.sodermalm);
    expect(p.thin).toContain("sodermalm");
    expect(p.nodata).toContain("solna"); // 4 villor sålda
  });
  it("färgar efter budgetstatus", () => {
    const p = mapPaint({ ...DEFAULT_STATE, view: "budget" });
    expect(p.color.sigtuna).toBe(BUDGET_COLORS.ok);
    expect(p.color.sodermalm).toBe(BUDGET_COLORS.no);
  });
  it("visar saknad förändring som saknad data", () => {
    const p = mapPaint({ ...DEFAULT_STATE, view: "forandring", period: "m12" });
    expect(p.color.nykvarn).toBe(NODATA_COLOR);
    expect(p.nodata).toContain("nykvarn");
  });
  it("färgar förändringen i steg som beror på perioden", () => {
    const year = mapPaint({ ...DEFAULT_STATE, view: "forandring", period: "m12" });
    expect(year.color.sodermalm).toBe(changeStepColor(10.5, "m12"));
    // +2,0 % är ett tydligt steg på tre månader men bara ett svagt på ett år.
    const q = mapPaint({ ...DEFAULT_STATE, view: "forandring", period: "m3" });
    expect(q.color.sodermalm).toBe(changeStepColor(5, "m3"));
    expect(changeStepColor(2, "m12")).not.toBe(changeStepColor(2, "m3"));
  });
});

describe("unionBbox", () => {
  it("omsluter alla områden", () => {
    const b = unionBbox(areas);
    for (const a of areas) {
      expect(a.bbox[0]).toBeGreaterThanOrEqual(b[0]);
      expect(a.bbox[3]).toBeLessThanOrEqual(b[3]);
    }
  });
});
