import { describe, expect, it } from "vitest";
import { fitPadding, nextState, pickSnap, rubberBand, sheetHeights } from "./sheet-model";

const H = { peek: 160, half: 330, full: 660 };

describe("sheetHeights", () => {
  it("ger kikläget innehållets höjd och halvläget halva ytan", () => {
    expect(sheetHeights(660, 160)).toEqual(H);
  });

  it("låter aldrig kikläget ta mer än 45 % av ytan", () => {
    expect(sheetHeights(400, 300).peek).toBe(180);
  });

  it("håller halvläget tydligt över kikläget på en låg skärm", () => {
    const h = sheetHeights(400, 170);
    expect(h.half).toBe(290);
    expect(h.half).toBeLessThanOrEqual(h.full);
  });

  it("klarar en yta som är för liten för alla lägen", () => {
    const h = sheetHeights(150, 160);
    expect(h.peek).toBeLessThanOrEqual(h.half);
    expect(h.half).toBeLessThanOrEqual(h.full);
    expect(h.full).toBe(150);
  });
});

describe("pickSnap", () => {
  it("väljer närmaste läge när panelen släpps långsamt", () => {
    expect(pickSnap(H, 200, 0)).toBe("peek");
    expect(pickSnap(H, 300, 0)).toBe("half");
    expect(pickSnap(H, 520, 0)).toBe("full");
  });

  it("går till nästa läge vid en svepning uppåt, även nära det nuvarande", () => {
    expect(pickSnap(H, 170, 0.8)).toBe("half");
    expect(pickSnap(H, 340, 0.8)).toBe("full");
    expect(pickSnap(H, 660, 2)).toBe("full");
  });

  it("går till föregående läge vid en svepning nedåt", () => {
    expect(pickSnap(H, 640, -0.8)).toBe("half");
    expect(pickSnap(H, 320, -0.8)).toBe("peek");
    expect(pickSnap(H, 160, -2)).toBe("peek");
  });

  it("låter en måttlig fart flytta målet en bit", () => {
    // 250 + 0.4 * 180 = 322, närmast halvläget
    expect(pickSnap(H, 250, 0.4)).toBe("half");
  });
});

describe("rubberBand", () => {
  it("följer fingret mellan ändlägena och trögt utanför", () => {
    expect(rubberBand(300, 160, 660)).toBe(300);
    expect(rubberBand(700, 160, 660)).toBe(670);
    expect(rubberBand(120, 160, 660)).toBe(150);
  });
});

describe("nextState", () => {
  it("växlar kik, halv, hel och tillbaka", () => {
    expect(nextState("peek")).toBe("half");
    expect(nextState("half")).toBe("full");
    expect(nextState("full")).toBe("peek");
  });
});

describe("fitPadding", () => {
  const base = { top: 32, bottom: 48, left: 24, right: 24 };

  it("lämnar marginalen orörd utan panel", () => {
    expect(fitPadding(700, null, base)).toEqual(base);
  });

  it("räknar bort sökfältet och panelen", () => {
    expect(fitPadding(700, { top: 110, bottom: 160 }, base)).toEqual({
      ...base,
      top: 142,
      bottom: 208,
    });
  });

  it("lämnar alltid minst 120 px karta åt området", () => {
    const p = fitPadding(700, { top: 110, bottom: 600 }, base);
    expect(700 - p.top - p.bottom).toBe(120);
  });
});
