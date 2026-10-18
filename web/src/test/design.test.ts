/**
 * design/scales.json är den enda källan för skalornas färger. CSS kan inte importera JSON, så
 * styles/tokens.css har samma värden för hand. Det här testet ser till att de inte glider isär,
 * och att scales.ts verkligen exporterar värdena från filen.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import scales from "../../../design/scales.json";
import * as scalesModule from "../lib/scales";
import {
  BUDGET_COLORS,
  CHANGE_COLORS,
  CHANGE_MAX,
  NEAR_MARGIN,
  NODATA_COLOR,
  PRICE_BREAKS,
  PRICE_COLORS,
} from "../lib/scales";

const css = readFileSync(new URL("../styles/tokens.css", import.meta.url), "utf8");

function token(name: string): string | undefined {
  const m = css.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`));
  return m?.[1].trim().toLowerCase();
}

describe("design/scales.json", () => {
  it("har sex prisfärger och fem stigande klassgränser", () => {
    expect(scales.price.colors).toHaveLength(6);
    expect(scales.price.breaks).toHaveLength(5);
    expect([...scales.price.breaks].sort((a, b) => a - b)).toEqual(scales.price.breaks);
  });

  it("är det scales.ts exporterar", () => {
    expect(PRICE_COLORS).toEqual(scales.price.colors);
    expect(PRICE_BREAKS).toEqual(scales.price.breaks);
    expect(CHANGE_COLORS).toEqual({
      down: scales.change.down,
      flat: scales.change.flat,
      up: scales.change.up,
    });
    expect(CHANGE_MAX).toBe(scales.change.max);
    expect(BUDGET_COLORS).toEqual({
      ok: scales.budget.ok,
      near: scales.budget.near,
      no: scales.budget.no,
    });
    expect(NEAR_MARGIN).toBe(scales.budget.nearMargin);
    expect(NODATA_COLOR).toBe(scales.nodata);
  });

  // Förändring i fem steg: scales.ts har ännu egna konstanter. Tills de läses från filen
  // ser testet till att de är lika (delningsbilderna läser filen).
  const mod = scalesModule as Record<string, unknown>;
  it.skipIf(!("CHANGE_STEPS" in mod))("har samma fem förändringssteg som scales.ts", () => {
    expect(mod.CHANGE_STEPS).toEqual(scales.change.steps);
    expect(mod.CHANGE_FULL).toEqual(scales.change.full);
  });
});

describe("styles/tokens.css", () => {
  const expected: Record<string, string> = {
    ...Object.fromEntries(scales.price.colors.map((c, i) => [`c-price-${i + 1}`, c])),
    "c-down": scales.change.down,
    "c-flat": scales.change.flat,
    "c-up": scales.change.up,
    "c-ok": scales.budget.ok,
    "c-near": scales.budget.near,
    "c-no": scales.budget.no,
    "c-nodata": scales.nodata,
  };

  it.each(Object.entries(expected))("--%s är %s som i design/scales.json", (name, value) => {
    expect(token(name)).toBe(value.toLowerCase());
  });
});
