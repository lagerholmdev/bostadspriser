import { describe, expect, it } from "vitest";
import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import { DEFAULT_STATE } from "../../lib/url";
import { addTo, removeFrom } from "./compare-tray";
import { attr, html, raw } from "../../lib/html";
import {
  composeStyle,
  firstSymbolIndex,
  hatchImage,
  LAYER,
  matchBySlug,
  PLACE_LABEL_MINZOOM,
  waterIndex,
} from "./mapstyle";
import { FILL_OPACITY, mapPaint } from "./model";
import { search } from "./search-index";

describe("html", () => {
  it("escapar insatta värden men inte andra mallar", () => {
    const name = `<script>"&'`;
    expect(html`<p>${name}</p>`.value).toBe("<p>&lt;script&gt;&quot;&amp;&#39;</p>");
    expect(html`<div>${html`<b>${"x"}</b>`}</div>`.value).toBe("<div><b>x</b></div>");
    expect(html`${[1, 2].map((n) => html`<i>${n}</i>`)}`.value).toBe("<i>1</i><i>2</i>");
    expect(html`${null}${false}${undefined}`.value).toBe("");
    expect(raw("<svg/>").value).toBe("<svg/>");
    expect(attr("aria-pressed", "true").value).toBe(' aria-pressed="true"');
    expect(attr("x", null).value).toBe("");
  });
});

describe("search", () => {
  it("hittar områden utan å, ä och ö", () => {
    expect(search("sodermalm")[0].area.slug).toBe("sodermalm");
    expect(search("söd")[0].area.slug).toBe("sodermalm");
    expect(search("OSTERAKER")[0].area.slug).toBe("osteraker");
  });
  it("hittar via stadsdel eller ort och säger vilken", () => {
    const hit = search("aspudden")[0];
    expect(hit.area.slug).toBe("hagersten-liljeholmen");
    expect(hit.via).toBe("Aspudden");
    expect(search("åkersberga")[0].area.slug).toBe("osteraker");
    expect(search("gamla stan")[0].area.slug).toBe("vasastan-norrmalm");
  });
  it("låter områdets eget namn gå före en stadsdel", () => {
    const hits = search("sol");
    expect(
      hits
        .map((h) => h.area.slug)
        .slice(0, 2)
        .sort(),
    ).toEqual(["sollentuna", "solna"]);
    const firstAlias = hits.findIndex((h) => h.via);
    expect(firstAlias).toBeGreaterThan(1);
    expect(hits.slice(firstAlias).every((h) => h.via)).toBe(true);
  });
  it("matchar ord inne i namnet och ger inga dubbletter", () => {
    expect(search("liljeholmen")[0].area.slug).toBe("hagersten-liljeholmen");
    const slugs = search("s").map((h) => h.area.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs.length).toBeLessThanOrEqual(8);
  });
  it("ger tomt för tom sökning och okända ord", () => {
    expect(search("   ")).toEqual([]);
    expect(search("xyzzy")).toEqual([]);
  });
});

describe("compare", () => {
  it("lägger till sist och byter ut den äldsta när listan är full", () => {
    expect(addTo([], "a")).toEqual({ list: ["a"], dropped: null });
    expect(addTo(["a", "b"], "a")).toEqual({ list: ["a", "b"], dropped: null });
    expect(addTo(["a", "b", "c"], "d")).toEqual({ list: ["b", "c", "d"], dropped: "a" });
    expect(removeFrom(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("mapstyle", () => {
  const paint = mapPaint(DEFAULT_STATE);
  const layer = (id: string, type: string, extra: object = {}) =>
    ({ id, type, ...extra }) as unknown as LayerSpecification;
  const base = {
    version: 8,
    sources: { openmaptiles: { type: "vector", url: "x" } },
    layers: [
      layer("background", "background"),
      layer("park", "fill"),
      layer("water", "fill"),
      layer("highway_major", "line"),
      layer("waterway_line_label", "symbol", { "source-layer": "waterway" }),
      layer("place_suburb", "symbol", { "source-layer": "place", minzoom: 9 }),
    ],
  } as unknown as StyleSpecification;

  it("lägger ytorna före vattnet och markeringen före första etiketten", () => {
    const { style, basemap } = composeStyle(base, "areas.geojson", paint);
    expect(basemap).toBe(true);
    const ids = style.layers.map((l) => l.id);
    expect(ids.indexOf(LAYER.fill)).toBeLessThan(ids.indexOf("water"));
    expect(ids.indexOf(LAYER.outline)).toBeLessThan(ids.indexOf("water"));
    expect(ids.indexOf(LAYER.selected)).toBeGreaterThan(ids.indexOf("highway_major"));
    expect(ids.indexOf(LAYER.selected)).toBeLessThan(ids.indexOf("waterway_line_label"));
    expect(ids.indexOf(LAYER.extrude)).toBeLessThan(ids.indexOf("waterway_line_label"));
    expect(style.sources.areas).toBeDefined();
    const place = style.layers.find((l) => l.id === "place_suburb")!;
    expect(place.minzoom).toBe(PLACE_LABEL_MINZOOM);
  });

  it("ger en egen reservstil utan baskarta", () => {
    const { style, basemap } = composeStyle(null, "areas.geojson", paint);
    expect(basemap).toBe(false);
    expect(style.layers[0].type).toBe("background");
    expect(style.layers.some((l) => l.type === "symbol")).toBe(false);
    expect(style.glyphs).toBeUndefined();
  });

  it("hittar vatten och etiketter robust", () => {
    expect(waterIndex(base.layers)).toBe(2);
    expect(waterIndex([layer("ocean_water", "fill"), layer("x", "symbol")])).toBe(0);
    expect(waterIndex([layer("x", "fill")])).toBe(-1);
    expect(firstSymbolIndex(base.layers)).toBe(4);
  });

  it("bygger match-uttryck per område", () => {
    expect(matchBySlug({ a: "#fff", b: "#000" }, "#ccc")).toEqual([
      "match",
      ["get", "slug"],
      "a",
      "#fff",
      "b",
      "#000",
      "#ccc",
    ]);
  });
});

describe("search, rangordning", () => {
  it("går inte efter stadsdelar när områdets eget namn matchar", () => {
    const hits = search("sö");
    expect(hits[0].area.slug).toBe("sodermalm");
    expect(hits[1].area.slug).toBe("sodertalje");
  });
  it("väljer exakta å/ä/ö och sedan flest affärer vid lika träff", () => {
    expect(
      search("söd")
        .map((h) => h.area.slug)
        .slice(0, 2),
    ).toEqual(["sodermalm", "sodertalje"]);
    expect(
      search("sod")
        .map((h) => h.area.slug)
        .slice(0, 2),
    ).toEqual(["sodermalm", "sodertalje"]);
    // "so" utan prickar: Solna (641 sålda) före Sollentuna (277) och Södermalm före Södertälje.
    const so = search("so").map((h) => h.area.slug);
    expect(so.indexOf("sodermalm")).toBeLessThan(so.indexOf("sodertalje"));
    expect(so.indexOf("solna")).toBeLessThan(so.indexOf("sollentuna"));
  });
  it("lägger områdesnamn före stadsdelar även när stadsdelen matchar bättre", () => {
    const hits = search("kista");
    expect(hits[0].area.slug).toBe("spanga-kista");
    expect(hits[0].via).toBeNull();
  });
});

describe("hatchImage", () => {
  it("ritar 1 px diagonala linjer på 8 × 8 px, skalade efter pixeltäthet", () => {
    const img = hatchImage("thin");
    expect(img.width).toBe(8);
    expect(img.data.length).toBe(8 * 8 * 4);
    const alpha = (x: number, y: number) => img.data[(y * 8 + x) * 4 + 3];
    expect(alpha(0, 0)).toBe(Math.round(0.25 * 255));
    expect(alpha(1, 0)).toBe(0);
    const hi = hatchImage("nodata", 2);
    expect(hi.width).toBe(16);
  });
  it("lägger ränderna direkt efter ytorna, under vattnet", () => {
    const paint = mapPaint(DEFAULT_STATE);
    const { style } = composeStyle(null, "areas.geojson", paint);
    const ids = style.layers.map((l) => l.id);
    expect(ids.indexOf(LAYER.hatchThin)).toBe(ids.indexOf(LAYER.fill) + 1);
    const fill = style.layers.find((l) => l.id === LAYER.fill) as {
      paint: Record<string, unknown>;
    };
    expect(fill.paint["fill-opacity"]).toBe(FILL_OPACITY);
  });
});
