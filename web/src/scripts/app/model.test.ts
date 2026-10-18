import { describe, expect, it } from "vitest";
import { areas, getArea } from "../../lib/data";
import { BUDGET_COLORS, NODATA_COLOR, priceColor } from "../../lib/scales";
import { DEFAULT_STATE } from "../../lib/url";
import {
  CITY_NAME,
  budgetModel,
  changeModel,
  entries,
  mapPaint,
  priceModel,
  rankOf,
  sortEntries,
  THIN_OPACITY,
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
    const fake = [...list.slice(0, 2), { ...list[2], stat: { ...list[2].stat, pricePerSqm: null } }];
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
    // Störst bostad för pengarna först.
    expect(m.ok[0].size).toBeGreaterThanOrEqual(m.ok[m.ok.length - 1].size);
    expect(m.cheapest?.slug).toBe("sigtuna");
  });
  it("räknar Stockholms stad som ett område för villor", () => {
    const m = budgetModel("house", "m3", 5_000_000, 60);
    expect(m.total).toBe(entries("house", "m3").length);
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
  it("listar områden där förändringen saknas", () => {
    const m = changeModel("apartment", "m12");
    expect(m.missing.map((e) => e.slug)).toContain("nykvarn");
  });
});

describe("rankOf", () => {
  it("ger plats 1 till dyraste och delar stadens plats för villor", () => {
    expect(rankOf(getArea("vasastan-norrmalm")!, "apartment", "m3")).toEqual({ rank: 1, total: areas.length });
    const a = rankOf(getArea("sodermalm")!, "house", "m3");
    const b = rankOf(getArea("spanga-kista")!, "house", "m3");
    expect(a).toEqual(b);
    expect(a).not.toBeNull();
  });
});

describe("mapPaint", () => {
  it("färgar efter pris i prisvyn och bleker osäkra områden", () => {
    const p = mapPaint(DEFAULT_STATE);
    expect(p.color.sodermalm).toBe(priceColor(116680));
    expect(p.opacity.ekero).toBe(THIN_OPACITY); // 38 affärer
    expect(p.price.sodermalm).toBe(116680);
  });
  it("färgar efter budgetstatus", () => {
    const p = mapPaint({ ...DEFAULT_STATE, view: "budget" });
    expect(p.color.sigtuna).toBe(BUDGET_COLORS.ok);
    expect(p.color.sodermalm).toBe(BUDGET_COLORS.no);
  });
  it("visar saknad förändring som saknad data", () => {
    const p = mapPaint({ ...DEFAULT_STATE, view: "forandring", period: "m12" });
    expect(p.color.nykvarn).toBe(NODATA_COLOR);
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
