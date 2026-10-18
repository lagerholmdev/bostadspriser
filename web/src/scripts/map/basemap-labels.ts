/**
 * Baskartans etiketter mot våra områdesnamn. Våra namn är HTML ovanpå kartan (se labels.ts), så
 * MapLibre vet inte var de står och skulle rita ortnamn rakt igenom dem. Två saker löser det:
 *
 * 1. Baskartans ortnamn som heter som ett av våra områden ("Solna", "Sundbyberg") tas bort, så att
 *    samma namn inte står två gånger.
 * 2. Ett osynligt symbollager överst i stilen har en genomskinlig ikon, lika stor som namnet, på
 *    varje område vars namn syns. MapLibre placerar översta lagret först, så baskartans etiketter
 *    som skulle krocka med en sådan ikon döljs, precis som när två ortnamn krockar.
 */
import type { ExpressionSpecification, FilterSpecification, LayerSpecification } from "maplibre-gl";
import type { Area } from "../../lib/types";

export const LABEL_SOURCE = "area-labels";
export const GHOST_LAYER = "pl-label-ghost";
const GHOST_PREFIX = "pl-ghost-";

export interface LabelBox {
  slug: string;
  /** Namnets bredd och höjd i CSS-pixlar, med marginal. */
  w: number;
  h: number;
}

/** Etikettpunkterna som GeoJSON, en punkt per område. */
export function labelPoints(areas: readonly Pick<Area, "slug" | "label">[]) {
  return {
    type: "FeatureCollection" as const,
    features: areas.map((a) => ({
      type: "Feature" as const,
      properties: { slug: a.slug },
      geometry: { type: "Point" as const, coordinates: a.label },
    })),
  };
}

export function ghostImageId(w: number, h: number): string {
  return `${GHOST_PREFIX}${Math.max(1, Math.round(w))}x${Math.max(1, Math.round(h))}`;
}

/** Storleken ur en ikon-id från ghostImageId, annars null. */
export function parseGhostImageId(id: string): { width: number; height: number } | null {
  const m = new RegExp(`^${GHOST_PREFIX}(\\d+)x(\\d+)$`).exec(id);
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
}

/** Helt genomskinlig bild i given storlek. */
export function ghostImage(width: number, height: number) {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

/** Vilken ikon varje område får; områden vars namn inte syns får ingen ("" ritar inget). */
export function ghostIcons(boxes: readonly LabelBox[]): ExpressionSpecification | string {
  if (!boxes.length) return "";
  const pairs = boxes.flatMap((b) => [b.slug, ghostImageId(b.w, b.h)]);
  return ["match", ["get", "slug"], ...pairs, ""] as unknown as ExpressionSpecification;
}

export function ghostLayer(): LayerSpecification {
  return {
    id: GHOST_LAYER,
    type: "symbol",
    source: LABEL_SOURCE,
    layout: {
      "icon-image": "",
      "icon-allow-overlap": true, // står alltid, eftersom labels.ts redan bestämt vilka som syns
      "icon-ignore-placement": false, // men upptar platsen, så att baskartans etiketter viker
      "icon-padding": 0,
    },
    paint: { "icon-opacity": 0 },
  };
}

/* ---------- Ortnamn som heter som våra områden ---------- */

/** Samma regler som MapLibres egen kontroll av om ett filter är ett uttryck. */
export function isExpressionFilter(filter: unknown): boolean {
  if (filter === true || filter === false) return true;
  if (!Array.isArray(filter) || filter.length === 0) return false;
  switch (filter[0]) {
    case "has":
      return filter.length >= 2 && filter[1] !== "$id" && filter[1] !== "$type";
    case "in":
      return filter.length >= 3 && (typeof filter[1] !== "string" || Array.isArray(filter[2]));
    case "!in":
    case "!has":
    case "none":
      return false;
    case "==":
    case "!=":
    case ">":
    case ">=":
    case "<":
    case "<=":
      return filter.length !== 3 || Array.isArray(filter[1]) || Array.isArray(filter[2]);
    case "any":
    case "all":
      return filter.slice(1).every((f) => typeof f === "boolean" || isExpressionFilter(f));
    default:
      return true;
  }
}

type Expr = unknown[];

/** Ett filter i det gamla formatet som uttryck, eller null om det innehåller något okänt. */
export function legacyToExpression(filter: unknown): Expr | boolean | null {
  if (typeof filter === "boolean") return filter;
  if (!Array.isArray(filter) || !filter.length) return null;
  const [op, key, ...rest] = filter as [string, string, ...unknown[]];
  const get = (k: string): Expr =>
    k === "$type" ? ["geometry-type"] : k === "$id" ? ["id"] : ["get", k];
  const children = (list: unknown[]) => {
    const out = list.map(legacyToExpression);
    return out.some((c) => c === null) ? null : out;
  };
  switch (op) {
    case "==":
    case "!=":
    case "<":
    case "<=":
    case ">":
    case ">=":
      return typeof key === "string" && rest.length === 1 ? [op, get(key), rest[0]] : null;
    case "in":
      return typeof key === "string" ? ["in", get(key), ["literal", rest]] : null;
    case "!in":
      return typeof key === "string" ? ["!", ["in", get(key), ["literal", rest]]] : null;
    case "has":
      return typeof key === "string" ? ["has", key] : null;
    case "!has":
      return typeof key === "string" ? ["!", ["has", key]] : null;
    case "all":
    case "any": {
      const c = children(filter.slice(1));
      return c ? [op, ...c] : null;
    }
    case "none": {
      const c = children(filter.slice(1));
      return c ? ["!", ["any", ...c]] : null;
    }
    default:
      return null;
  }
}

/**
 * Lägg till "heter inte något av `names`" i ett symbollagers filter. Lagret lämnas orört om dess
 * filter inte går att tolka.
 */
export function withoutNames<L extends LayerSpecification>(layer: L, names: readonly string[]): L {
  if (!names.length || layer.type !== "symbol") return layer;
  const notNamed = [
    "!",
    ["in", ["coalesce", ["get", "name"], ["get", "name:latin"], ""], ["literal", [...names]]],
  ];
  const existing = layer.filter as unknown;
  let filter: unknown;
  if (existing === undefined) filter = notNamed;
  else {
    const expr = isExpressionFilter(existing) ? existing : legacyToExpression(existing);
    if (expr === null) return layer;
    filter = ["all", expr, notNamed];
  }
  return { ...layer, filter: filter as FilterSpecification };
}
