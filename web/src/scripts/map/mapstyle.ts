/**
 * Kartans stil: OpenFreeMaps ljusa "Positron" med våra lager instoppade på rätt ställen,
 * eller en enkel reservstil om baskartan inte går att nå. Rena funktioner, så de går att testa.
 *
 * Lagerordning med baskarta:
 *   … mark/parker  →  [ytor, ränder, gränser]  →  vatten …  vägar  →  [3D, hovring, valt]  →  etiketter
 * Ytorna ligger under vattnet så att hav och sjöar målas över dem: kommungränser som går ut i
 * havet syns då inte som färgade block. Markering och 3D ligger över vägarna men under texten.
 */
import type {
  ExpressionSpecification,
  FilterSpecification,
  LayerSpecification,
  StyleSpecification,
} from "maplibre-gl";
import { NODATA_COLOR } from "../../lib/scales";
import type { Area } from "../../lib/types";
import { ghostLayer, LABEL_SOURCE, labelPoints, withoutNames } from "./basemap-labels";
import { FILL_OPACITY, type Paint } from "./model";

export const POSITRON_URL = "https://tiles.openfreemap.org/styles/positron";
export const SOURCE = "areas";
export const LAYER = {
  fill: "pl-fill",
  hatchThin: "pl-hatch-thin",
  hatchNodata: "pl-hatch-nodata",
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

/** Rändermönster (bilder som kartan lägger till själv, se hatchImage). */
export const HATCH = {
  thin: { id: "pl-hatch-dark", color: [26, 31, 28], alpha: 0.25 },
  nodata: { id: "pl-hatch-light", color: [95, 103, 98], alpha: 0.4 },
} as const;
export type HatchKind = keyof typeof HATCH;

/**
 * Diagonala ränder (/) i en ruta på 8 × 8 px, 1 px linjer, som RGBA-pixlar.
 * `ratio` är skärmens pixeltäthet, så att linjerna blir skarpa på högupplösta skärmar.
 */
export function hatchImage(
  kind: HatchKind,
  ratio = 1,
): { width: number; height: number; data: Uint8Array } {
  const r = Math.max(1, Math.round(ratio));
  const size = 8 * r;
  const { color, alpha } = HATCH[kind];
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if ((x + y) % size >= r) continue;
      const i = (y * size + x) * 4;
      data[i] = color[0];
      data[i + 1] = color[1];
      data[i + 2] = color[2];
      data[i + 3] = Math.round(alpha * 255);
    }
  }
  return { width: size, height: size, data };
}

/** Filter för en lista med områden. */
export function slugsFilter(slugs: readonly string[]): FilterSpecification {
  return ["in", ["get", "slug"], ["literal", [...slugs]]] as unknown as FilterSpecification;
}

type Matchable = Record<string, string | number>;

/** ["match", ["get","slug"], "a", v1, "b", v2, fallback] */
export function matchBySlug<T extends string | number>(
  values: Record<string, T>,
  fallback: T,
): ExpressionSpecification {
  const pairs = Object.entries(values as Matchable).flat();
  if (!pairs.length) return ["literal", fallback] as unknown as ExpressionSpecification;
  return ["match", ["get", "slug"], ...pairs, fallback] as unknown as ExpressionSpecification;
}

export function heightExpression(paint: Paint): ExpressionSpecification {
  const h: Record<string, number> = {};
  for (const [slug, p] of Object.entries(paint.price))
    h[slug] = Math.round(p * HEIGHT_PER_SQM_PRICE);
  return matchBySlug(h, 0);
}

export function slugFilter(slug: string | null): FilterSpecification {
  return ["==", ["get", "slug"], slug ?? "__ingen__"] as unknown as FilterSpecification;
}

/** Våra lager. `below` ska under vattnet, `above` över vägarna men under etiketterna. */
export function areaLayers(paint: Paint): {
  below: LayerSpecification[];
  above: LayerSpecification[];
} {
  const below: LayerSpecification[] = [
    {
      id: LAYER.fill,
      type: "fill",
      source: SOURCE,
      paint: {
        "fill-color": matchBySlug(paint.color, NODATA_COLOR),
        "fill-opacity": FILL_OPACITY,
        "fill-antialias": true,
      },
    },
    // Ränder ovanpå färgen: få affärer (mörka) och saknat värde (ljusgrå).
    {
      id: LAYER.hatchThin,
      type: "fill",
      source: SOURCE,
      filter: slugsFilter(paint.thin),
      paint: { "fill-pattern": HATCH.thin.id },
    },
    {
      id: LAYER.hatchNodata,
      type: "fill",
      source: SOURCE,
      filter: slugsFilter(paint.nodata),
      paint: { "fill-pattern": HATCH.nodata.id },
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
      paint: { "line-color": "#1a1f1c", "line-width": 2, "line-opacity": 0.9 },
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

/** Källager med ytor på land: bostadsområden, skog, parker, byggnader och flygfält. */
const LAND_SOURCE_LAYERS = new Set(["landuse", "landcover", "park", "building", "aeroway"]);

/**
 * Flytta baskartans landytor som ligger ovanför vattnet till strax under det. Våra områden läggs in
 * precis före vattnet, så annars skulle bostadsområden och skog ritas ovanpå färgerna som ljusa
 * fläckar. Ändrar listan på plats.
 */
export function moveLandBelowWater(layers: LayerSpecification[]): void {
  const w = waterIndex(layers);
  if (w === -1) return;
  const land = layers
    .slice(w + 1)
    .filter(
      (l) =>
        l.type === "fill" && "source-layer" in l && LAND_SOURCE_LAYERS.has(l["source-layer"] ?? ""),
    );
  if (!land.length) return;
  const rest = layers.filter((l) => !land.includes(l));
  const at = waterIndex(rest);
  rest.splice(at, 0, ...land);
  layers.splice(0, layers.length, ...rest);
}

export function firstSymbolIndex(layers: readonly LayerSpecification[]): number {
  return layers.findIndex((l) => l.type === "symbol");
}

export interface LabelOptions {
  /** Områden vars namn kartan visar; ger ett osynligt lager som baskartans etiketter viker för. */
  areas: readonly Pick<Area, "slug" | "label">[];
  /** Baskartans ortnamn med de här namnen tas bort. */
  hideNames: readonly string[];
}

export interface ComposedStyle {
  style: StyleSpecification;
  basemap: boolean;
}

/**
 * Bygg den slutliga stilen. `base` är Positron-stilen (eller null för reservstilen),
 * `data` adressen till geometrin.
 */
export function composeStyle(
  base: StyleSpecification | null,
  data: string,
  paint: Paint,
  labels?: LabelOptions,
): ComposedStyle {
  const { below, above } = areaLayers(paint);
  const source = { type: "geojson" as const, data, attribution: "" };

  if (!base) {
    return {
      basemap: false,
      style: {
        version: 8,
        name: "Stockholms prislandskap (reserv)",
        sources: { [SOURCE]: source },
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": FALLBACK_BACKGROUND },
          },
          ...below,
          ...above,
        ],
      },
    };
  }

  const layers: LayerSpecification[] = base.layers.map((l) => {
    // Baskartans ortnamn (källager "place") visas först när man zoomat in, och inte alls när de
    // heter som ett av våra områden.
    if (l.type === "symbol" && "source-layer" in l && l["source-layer"] === "place") {
      const later = { ...l, minzoom: Math.max(l.minzoom ?? 0, PLACE_LABEL_MINZOOM) };
      return labels ? withoutNames(later, labels.hideNames) : later;
    }
    return l;
  });
  moveLandBelowWater(layers);
  let w = waterIndex(layers);
  const sym = firstSymbolIndex(layers);
  if (w === -1) w = sym === -1 ? layers.length : sym;
  layers.splice(w, 0, ...below);
  const s2 = firstSymbolIndex(layers);
  layers.splice(s2 === -1 ? layers.length : s2, 0, ...above);

  const sources: StyleSpecification["sources"] = { ...base.sources, [SOURCE]: source };
  if (labels) {
    // Överst, så att MapLibre placerar det först och baskartans etiketter viker undan.
    sources[LABEL_SOURCE] = { type: "geojson", data: labelPoints(labels.areas) };
    layers.push(ghostLayer());
  }
  return { basemap: true, style: { ...base, sources, layers } };
}

/** Hämta Positron, eller null om den inte svarar i tid (offline, blockerad, fel). */
export async function fetchBaseStyle(
  timeoutMs = 4000,
  url = POSITRON_URL,
): Promise<StyleSpecification | null> {
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
