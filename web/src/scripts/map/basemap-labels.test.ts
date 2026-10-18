import { describe, expect, it } from "vitest";
import type { LayerSpecification, StyleSpecification, SymbolLayerSpecification } from "maplibre-gl";
import {
  ghostIcons,
  ghostImageId,
  GHOST_LAYER,
  isExpressionFilter,
  LABEL_SOURCE,
  legacyToExpression,
  parseGhostImageId,
  withoutNames,
} from "./basemap-labels";
import { composeStyle } from "./mapstyle";
import { mapPaint } from "./model";
import { DEFAULT_STATE } from "../../lib/url";

const symbol = (filter?: unknown) =>
  ({
    id: "place_town",
    type: "symbol",
    source: "openmaptiles",
    "source-layer": "place",
    ...(filter === undefined ? {} : { filter }),
  }) as unknown as SymbolLayerSpecification;

describe("osynliga platshållare för våra namn", () => {
  it("kodar storleken i ikonens id", () => {
    expect(ghostImageId(61.4, 22)).toBe("pl-ghost-61x22");
    expect(parseGhostImageId("pl-ghost-61x22")).toEqual({ width: 61, height: 22 });
    expect(parseGhostImageId("pl-hatch-dark")).toBeNull();
  });

  it("ger bara synliga namn en ikon", () => {
    expect(ghostIcons([])).toBe("");
    expect(ghostIcons([{ slug: "solna", w: 40, h: 20 }])).toEqual([
      "match",
      ["get", "slug"],
      "solna",
      "pl-ghost-40x20",
      "",
    ]);
  });
});

describe("ortnamn som heter som våra områden", () => {
  const notNamed = [
    "!",
    ["in", ["coalesce", ["get", "name"], ["get", "name:latin"], ""], ["literal", ["Solna"]]],
  ];

  it("känner igen uttryck och det gamla formatet", () => {
    expect(isExpressionFilter(["==", ["get", "class"], "town"])).toBe(true);
    expect(isExpressionFilter(["==", "class", "town"])).toBe(false);
    expect(isExpressionFilter(["all", ["==", "$type", "Point"], ["!in", "class", "a"]])).toBe(
      false,
    );
  });

  it("översätter det gamla formatet till uttryck", () => {
    expect(
      legacyToExpression([
        "all",
        ["==", "$type", "Point"],
        ["in", "class", "town", "village"],
        ["!has", "capital"],
      ]),
    ).toEqual([
      "all",
      ["==", ["geometry-type"], "Point"],
      ["in", ["get", "class"], ["literal", ["town", "village"]]],
      ["!", ["has", "capital"]],
    ]);
    expect(legacyToExpression(["okänt", "x"])).toBeNull();
  });

  it("lägger namnvillkoret till befintliga filter", () => {
    expect(withoutNames(symbol(), ["Solna"]).filter).toEqual(notNamed);
    expect(withoutNames(symbol(["==", "class", "town"]), ["Solna"]).filter).toEqual([
      "all",
      ["==", ["get", "class"], "town"],
      notNamed,
    ]);
    expect(withoutNames(symbol(["==", ["get", "class"], "town"]), ["Solna"]).filter).toEqual([
      "all",
      ["==", ["get", "class"], "town"],
      notNamed,
    ]);
    // Ett filter som inte går att tolka lämnas som det är.
    const odd = symbol(["none", ["okänt", "x"]]);
    expect(withoutNames(odd, ["Solna"])).toBe(odd);
  });

  it("composeStyle tar bort namnen och lägger platshållarna överst", () => {
    const base = {
      version: 8,
      sources: { openmaptiles: { type: "vector", url: "x" } },
      layers: [
        { id: "water", type: "fill", source: "openmaptiles" },
        symbol(["==", "class", "town"]),
        { id: "road_label", type: "symbol", source: "openmaptiles" },
      ],
    } as unknown as StyleSpecification;
    const paint = mapPaint(DEFAULT_STATE);
    const { style } = composeStyle(base, "areas.geojson", paint, {
      areas: [{ slug: "solna", label: [18, 59.36] }],
      hideNames: ["Solna"],
    });
    expect(style.layers.at(-1)!.id).toBe(GHOST_LAYER);
    expect(style.sources[LABEL_SOURCE]).toBeDefined();
    const place = style.layers.find((l) => l.id === "place_town") as SymbolLayerSpecification;
    expect(JSON.stringify(place.filter)).toContain("Solna");
    // Utan namnlista blir stilen som förut.
    const plain = composeStyle(base, "areas.geojson", paint).style;
    expect(plain.layers.some((l) => l.id === GHOST_LAYER)).toBe(false);
  });
});
