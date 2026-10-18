/**
 * Kartans stil: OpenFreeMaps ljusa "Positron" med våra lager instoppade på rätt ställen,
 * eller en enkel reservstil om baskartan inte går att nå. Rena funktioner, så de går att testa.
 *
 * Lagerordning med baskarta:
 *   … mark/parker  →  [ytor, gränser]  →  vatten …  vägar  →  [3D, hovring, valt]  →  etiketter
 * Ytorna ligger under vattnet så att hav och sjöar målas över dem: kommungränser som går ut i
 * havet syns då inte som färgade block. Markering och 3D ligger över vägarna men under texten.
 */
import type {
  ExpressionSpecification,
  LayerSpecification,
  StyleSpecification,
} from "@maplibre/maplibre-gl-style-spec";
import { NODATA_COLOR } from "../../lib/scales";
import type { Paint } from "./model";

export const POSITRON_URL = "https://tiles.openfreemap.org/styles/positron";
export const SOURCE = "areas";
export const LAYER = {
  fill: "pl-fill",
  outline: "pl-outline",
  extrude: "pl-extrude",
  hover: "pl-hover",
  selectedCasing: "pl-selected-casing",
  selected: "pl-selected",
} as const;

export const ACCENT = "#1f6f5c";
export const FALLBACK_BACKGROUND = "#eef0ec";
/** Meter höjd per kr/kvm i 3D-läget (135 000 kr/kvm blir ungefär 2 km högt på kartan). */
export const HEIGHT_PER_SQM_PRICE = 0.015;
/** Under den här zoomnivån döljs baskartans ortnamn, så att våra områdesnamn inte krockar med dem. */
export const PLACE_LABEL_MINZOOM = 10.5;

type Matchable = Record<string, string | number>;

/** ["match", ["get","slug"], "a", v1, "b", v2, fallback] */
export function matchBySlug<T extends string | number>(values: Record<string, T>, fallback: T): ExpressionSpecification {
  const pairs = Object.entries(values as Matchable).flat();
  if (!pairs.length) return ["literal", fallback] as unknown as ExpressionSpecification;
  return ["match", ["get", "slug"], ...pairs, fallback] as unknown as ExpressionSpecification;
}

export function heightExpression(paint: Paint): ExpressionSpecification {
  const h: Record<string, number> = {};
  for (const [slug, p] of Object.entries(paint.price)) h[slug] = Math.round(p * HEIGHT_PER_SQM_PRICE);
  return matchBySlug(h, 0);
}

export function slugFilter(slug: string | null): ExpressionSpecification {
  return ["==", ["get", "slug"], slug ?? "__ingen__"] as unknown as ExpressionSpecification;
}

/** Våra lager. `below` ska under vattnet, `above` över vägarna men under etiketterna. */
export function areaLayers(paint: Paint): { below: LayerSpecification[]; above: LayerSpecification[] } {
  const below: LayerSpecification[] = [
    {
      id: LAYER.fill,
      type: "fill",
      source: SOURCE,
      paint: {
        "fill-color": matchBySlug(paint.color, NODATA_COLOR),
        "fill-opacity": matchBySlug(paint.opacity, 0.5),
        "fill-antialias": true,
      },
    },
    {
      id: LAYER.outline,
      type: "line",
      source: SOURCE,
      layout: { "line-join": "round" },
      paint: {
        "line-color": "#ffffff",
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.8, 12, 1.6],
        "line-opacity": 0.95,
      },
    },
  ];
  const above: LayerSpecification[] = [
    {
      id: LAYER.extrude,
      type: "fill-extrusion",
      source: SOURCE,
      layout: { visibility: "none" },
      paint: {
        "fill-extrusion-color": matchBySlug(paint.color, NODATA_COLOR),
        "fill-extrusion-height": heightExpression(paint),
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": 0.88,
        "fill-extrusion-vertical-gradient": false,
      },
    },
    {
      id: LAYER.hover,
      type: "line",
      source: SOURCE,
      filter: slugFilter(null),
      layout: { "line-join": "round" },
      paint: { "line-color": "#1a1f1c", "line-width": 1.5, "line-opacity": 0.55 },
    },
    {
      id: LAYER.selectedCasing,
      type: "line",
      source: SOURCE,
      filter: slugFilter(null),
      layout: { "line-join": "round" },
      paint: { "line-color": "#ffffff", "line-width": 6, "line-opacity": 0.9 },
    },
    {
      id: LAYER.selected,
      type: "line",
      source: SOURCE,
      filter: slugFilter(null),
      layout: { "line-join": "round" },
      paint: { "line-color": ACCENT, "line-width": 3 },
    },
  ];
  return { below, above };
}

/** Index för baskartans vattenlager ("water"), annars första fyllnadslager med vatten i namnet. */
export function waterIndex(layers: readonly LayerSpecification[]): number {
  const exact = layers.findIndex((l) => l.id === "water");
  if (exact !== -1) return exact;
  return layers.findIndex((l) => l.type === "fill" && /water/i.test(l.id));
}

export function firstSymbolIndex(layers: readonly LayerSpecification[]): number {
  return layers.findIndex((l) => l.type === "symbol");
}

export interface ComposedStyle {
  style: StyleSpecification;
  basemap: boolean;
}

/**
 * Bygg den slutliga stilen. `base` är Positron-stilen (eller null för reservstilen),
 * `data` adressen till geometrin.
 */
export function composeStyle(base: StyleSpecification | null, data: string, paint: Paint): ComposedStyle {
  const { below, above } = areaLayers(paint);
  const source = { type: "geojson" as const, data, attribution: "" };

  if (!base) {
    return {
      basemap: false,
      style: {
        version: 8,
        name: "Stockholms prislandskap (reserv)",
        sources: { [SOURCE]: source },
        layers: [{ id: "background", type: "background", paint: { "background-color": FALLBACK_BACKGROUND } }, ...below, ...above],
      },
    };
  }

  const layers: LayerSpecification[] = base.layers.map((l) => {
    // Baskartans ortnamn (källager "place") visas först när man zoomat in.
    if (l.type === "symbol" && "source-layer" in l && l["source-layer"] === "place") {
      return { ...l, minzoom: Math.max(l.minzoom ?? 0, PLACE_LABEL_MINZOOM) };
    }
    return l;
  });
  let w = waterIndex(layers);
  const sym = firstSymbolIndex(layers);
  if (w === -1) w = sym === -1 ? layers.length : sym;
  layers.splice(w, 0, ...below);
  const s2 = firstSymbolIndex(layers);
  layers.splice(s2 === -1 ? layers.length : s2, 0, ...above);

  return {
    basemap: true,
    style: { ...base, sources: { ...base.sources, [SOURCE]: source }, layers },
  };
}

/** Hämta Positron, eller null om den inte svarar i tid (offline, blockerad, fel). */
export async function fetchBaseStyle(timeoutMs = 4000, url = POSITRON_URL): Promise<StyleSpecification | null> {
  if (typeof fetch !== "function") return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) return null;
    const json = (await res.json()) as StyleSpecification;
    return json && Array.isArray(json.layers) && json.sources ? json : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
