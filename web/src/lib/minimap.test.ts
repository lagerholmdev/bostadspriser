import { describe, expect, it } from "vitest";
import geo from "../generated/areas.geojson?raw";
import { areas, bySlug } from "./data";
import { buildMinimap, minimapSvg, type MinimapCollection } from "./minimap";
import { priceColor } from "./scales";

const collection = JSON.parse(geo) as MinimapCollection;

const square = (slug: string, x: number, y: number, s = 0.01): MinimapCollection["features"][number] => ({
  properties: { slug },
  geometry: {
    type: "Polygon",
    coordinates: [[[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]]],
  },
});

const toy: MinimapCollection = {
  features: [square("a", 18, 59.3), square("b", 18.01, 59.3), square("far", 20, 61)],
};
const toyInput = {
  collection: toy,
  focus: "a",
  fill: () => "#cccccc",
  name: (s: string) => s.toUpperCase(),
  labelPoint: (s: string): [number, number] | undefined =>
    s === "a" ? [18.005, 59.305] : s === "b" ? [18.015, 59.305] : [20.005, 61.005],
  neighbours: ["b", "far"],
};

describe("buildMinimap", () => {
  it("centrerar fokusområdet och tar bort det som ligger långt bort", () => {
    const m = buildMinimap(toyInput);
    expect(m.shapes.map((s) => s.slug).sort()).toEqual(["a", "b"]);
    // Fokus ritas sist, alltså överst.
    expect(m.shapes.at(-1)?.slug).toBe("a");
    expect(m.outline).toBe(m.shapes.at(-1)?.d);
    const nums = m.outline.match(/-?\d+(\.\d+)?/g)!.map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0);
    const ys = nums.filter((_, i) => i % 2 === 1);
    const midX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
    expect(Math.abs(midX - m.width / 2)).toBeLessThan(2);
    expect(Math.abs(midY - m.height / 2)).toBeLessThan(2);
  });

  it("håller formerna proportionerliga med lon · cos(lat)", () => {
    const m = buildMinimap({ ...toyInput, minSpan: 0 });
    const nums = m.outline.match(/-?\d+(\.\d+)?/g)!.map(Number);
    const xs = nums.filter((_, i) => i % 2 === 0);
    const ys = nums.filter((_, i) => i % 2 === 1);
    const w = Math.max(...xs) - Math.min(...xs);
    const h = Math.max(...ys) - Math.min(...ys);
    expect(w / h).toBeCloseTo(Math.cos((59.305 * Math.PI) / 180), 1);
  });

  it("sätter fokusetiketten och grannar som får plats", () => {
    const m = buildMinimap(toyInput);
    expect(m.labels[0]).toMatchObject({ slug: "a", text: "A", focus: true });
    expect(m.labels.map((l) => l.slug)).not.toContain("far");
  });

  it("kastar ett tydligt fel för okänt område", () => {
    expect(() => buildMinimap({ ...toyInput, focus: "x" })).toThrow(/x/);
  });

  it("fungerar för alla områden i datasetet", () => {
    for (const a of areas) {
      const m = buildMinimap({
        collection,
        focus: a.slug,
        fill: (s) => priceColor(bySlug.get(s)?.apartment?.m3.pricePerSqm),
        name: (s) => bySlug.get(s)?.name,
        labelPoint: (s) => bySlug.get(s)?.label,
        neighbours: a.neighbours,
      });
      expect(m.outline.length, a.slug).toBeGreaterThan(20);
      expect(m.shapes.length, a.slug).toBeGreaterThan(1);
      expect(m.labels[0]?.slug, a.slug).toBe(a.slug);
      // Etiketterna ska ligga inom bilden och inte krocka på samma punkt.
      for (const l of m.labels) {
        expect(l.x).toBeGreaterThan(0);
        expect(l.x).toBeLessThan(m.width);
        expect(l.y).toBeGreaterThan(0);
        expect(l.y).toBeLessThan(m.height);
      }
    }
  });
});

describe("minimapSvg", () => {
  it("ger en tillgänglig SVG med escapade texter", () => {
    const m = buildMinimap({ ...toyInput, name: (s) => (s === "a" ? "A & <B>" : undefined) });
    const svg = minimapSvg(m, { label: 'Karta "test"' });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('role="img"');
    expect(svg).toContain('aria-label="Karta &quot;test&quot;"');
    expect(svg).toContain("A &amp; &lt;B&gt;");
    expect(svg).toContain('class="mm-focus"');
    expect(svg).toContain('fill-opacity="0.55"');
    expect(svg.match(/<path/g)!.length).toBe(3);
  });
});
