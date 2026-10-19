import { describe, expect, it } from "vitest";
import { areas } from "../../../lib/data";
import { changeModel } from "../model";
import { changeLists, shiftText } from "./views";

describe("placeringsflytt i Förändring", () => {
  it("skrivs i klartext", () => {
    expect(shiftText(3)).toBe("3 platser upp sedan förra månaden");
    expect(shiftText(-2)).toBe("2 platser ner sedan förra månaden");
    expect(shiftText(undefined)).toBe("");
  });

  it("syns på raden och förklaras under listan när förra månaden finns", () => {
    const prev = areas.map((a) =>
      a.slug === "sigtuna" && a.apartment
        ? { ...a, apartment: { ...a.apartment, m12: { ...a.apartment.m12, change: 50 } } }
        : a,
    );
    const withPrev = changeLists(
      changeModel("apartment", "m12", 5, prev),
      "apartment",
      "m12",
    ).value;
    expect(withPrev).toMatch(/platser ner sedan förra månaden/);
    expect(withPrev).toContain("jämför placeringen i listan med förra månadens siffror");
    const without = changeLists(changeModel("apartment", "m12", 5, null), "apartment", "m12").value;
    expect(without).not.toContain("sedan förra månaden");
  });
});
