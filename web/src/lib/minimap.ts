/**
 * Statisk minikarta för områdessidorna. Rent och utan DOM: tar geometrin från
 * src/generated/areas.geojson och ger färdiga SVG-stigar och etiketter i bygget.
 *
 * Projektion: x = lon · cos(lat₀), y = −lat, där lat₀ är mitten av vyn. Det räcker
 * för ett så litet område som Stockholms län och håller formerna rätt proportionerade.
 */
import { escape } from "./html";

type Position = [number, number] | number[];
type Ring = Position[];

export interface MinimapGeometry {
  type: "Polygon" | "MultiPolygon";
  coordinates: Ring[] | Ring[][];
}

export interface MinimapFeature {
  properties: { slug: string } | null;
  geometry: MinimapGeometry | null;
}

export interface MinimapCollection {
  features: MinimapFeature[];
}

export interface MinimapInput {
  collection: MinimapCollection;
  /** Området som visas, med accentkant. */
  focus: string;
  /** Fyllnadsfärg per område (hex). */
  fill: (slug: string) => string;
  /** Områden med få affärer, som får ränder ovanpå färgen. */
  thin?: (slug: string) => boolean;
  /** Namn att skriva ut, eller undefined för att hoppa över. */
  name: (slug: string) => string | undefined;
  /** Etikettpunkt [lon, lat] per område. */
  labelPoint: (slug: string) => [number, number] | undefined;
  /** Grannar som får namnetikett, i prioritetsordning. */
  neighbours: readonly string[];
  width?: number;
  height?: number;
  /** Högst så här många grannetiketter. */
  maxLabels?: number;
  /** Vyns storlek i förhållande till fokusområdet (1 = tätt). */
  padding?: number;
  /** Minsta bredd på vyn i projicerade grader, så små områden får sammanhang. */
  minSpan?: number;
  /**
   * Teckenstorlek (i bildens enheter) som fokusetiketten ska få plats med i sidled.
   * Används när komponenten förstorar etiketten på smala skärmar.
   */
  focusReserveFont?: number;
}

export interface MinimapShape {
  slug: string;
  d: string;
  fill: string;
  focus: boolean;
  thin: boolean;
}

export interface MinimapLabel {
  slug: string;
  text: string;
  x: number;
  y: number;
  focus: boolean;
}

export interface Minimap {
  width: number;
  height: number;
  shapes: MinimapShape[];
  /** Stigen för fokusområdets kant, ritas överst. */
  outline: string;
  labels: MinimapLabel[];
}

type Box = [number, number, number, number]; // minX, minY, maxX, maxY

function polygonsOf(g: MinimapGeometry | null): Ring[][] {
  if (!g) return [];
  return g.type === "Polygon" ? [g.coordinates as Ring[]] : (g.coordinates as Ring[][]);
}

function lonLatBox(polys: Ring[][]): Box | null {
  let b: Box | null = null;
  for (const poly of polys) {
    for (const ring of poly) {
      for (const p of ring) {
        const [x, y] = p as [number, number];
        if (!b) b = [x, y, x, y];
        else {
          if (x < b[0]) b[0] = x;
          if (y < b[1]) b[1] = y;
          if (x > b[2]) b[2] = x;
          if (y > b[3]) b[3] = y;
        }
      }
    }
  }
  return b;
}

const intersects = (a: Box, b: Box) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Projicerar och förenklar en ring till en SVG-delstig. Tomt om ringen blir för liten. */
function ringPath(
  ring: Ring,
  project: (p: Position) => [number, number],
  tolerance: number,
): string {
  const pts: [number, number][] = [];
  for (const p of ring) {
    const q = project(p);
    const last = pts[pts.length - 1];
    if (!last || Math.abs(q[0] - last[0]) >= tolerance || Math.abs(q[1] - last[1]) >= tolerance)
      pts.push(q);
  }
  // Slutpunkten är samma som startpunkten i GeoJSON; Z stänger.
  if (pts.length > 1) {
    const [a, z] = [pts[0], pts[pts.length - 1]];
    if (Math.abs(a[0] - z[0]) < tolerance && Math.abs(a[1] - z[1]) < tolerance) pts.pop();
  }
  if (pts.length < 3) return "";
  return "M" + pts.map(([x, y]) => `${r1(x)} ${r1(y)}`).join("L") + "Z";
}

/** Jämn-udda-regeln: ligger punkten inuti ringarna (hål räknas bort)? */
function insideRings(x: number, y: number, rings: [number, number][][]): boolean {
  let inside = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i];
      const [xj, yj] = r[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/**
 * Syns ytan i bilden? Provar ett rutnät av punkter; ett område som bara snuddar vid
 * marginalen utanför bilden räknas inte.
 */
function coversFrame(
  rings: [number, number][][],
  width: number,
  height: number,
  step = 16,
  min = 3,
): boolean {
  let hits = 0;
  for (let y = step / 2; y < height; y += step) {
    for (let x = step / 2; x < width; x += step) {
      if (insideRings(x, y, rings) && ++hits >= min) return true;
    }
  }
  return false;
}

/** Ungefärlig textbredd i px för etikettkrockar. */
export function textWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.56;
}

export const LABEL_FONT = 12;
export const FOCUS_LABEL_FONT = 14;

export function buildMinimap(input: MinimapInput): Minimap {
  const width = input.width ?? 480;
  const height = input.height ?? 360;
  const padding = input.padding ?? 2.2;
  const minSpan = input.minSpan ?? 0.07;
  const maxLabels = input.maxLabels ?? 4;
  const focusReserve = Math.max(FOCUS_LABEL_FONT, input.focusReserveFont ?? FOCUS_LABEL_FONT);

  const feats = input.collection.features
    .filter((f) => f.properties?.slug && f.geometry)
    .map((f) => {
      const polys = polygonsOf(f.geometry);
      return { slug: f.properties?.slug ?? "", polys, box: lonLatBox(polys) };
    })
    .filter((f): f is { slug: string; polys: Ring[][]; box: Box } => f.box != null);

  const focus = feats.find((f) => f.slug === input.focus);
  if (!focus) throw new Error(`Minikarta: hittar inte området ${input.focus}`);

  // Vyn: fokusområdets ruta, förstorad och anpassad till bildens proportioner.
  const lat0 = (focus.box[1] + focus.box[3]) / 2;
  const k = Math.cos((lat0 * Math.PI) / 180);
  const cx = ((focus.box[0] + focus.box[2]) / 2) * k;
  const cy = -lat0;
  const fw = (focus.box[2] - focus.box[0]) * k;
  const fh = focus.box[3] - focus.box[1];
  const aspect = width / height;
  let spanX = Math.max(fw * padding, fh * padding * aspect, minSpan);
  let spanY = spanX / aspect;
  if (spanY < fh * padding) {
    spanY = fh * padding;
    spanX = spanY * aspect;
  }
  const scale = width / spanX;
  const x0 = cx - spanX / 2;
  const y0 = cy - spanY / 2;
  const project = (p: Position): [number, number] => [
    (p[0] * k - x0) * scale,
    (-p[1] - y0) * scale,
  ];

  // Ruta i lon/lat för att sortera bort det som ligger utanför, med lite marginal.
  const m = 0.05;
  const view: Box = [
    (x0 - spanX * m) / k,
    -(y0 + spanY * (1 + m)),
    (x0 + spanX * (1 + m)) / k,
    -(y0 - spanY * m),
  ];

  const tolerance = 0.9;
  const shapes: MinimapShape[] = [];
  let outline = "";
  for (const f of feats) {
    if (!intersects(f.box, view)) continue;
    let d = "";
    const wantHatch = input.thin?.(f.slug) ?? false;
    const projected: [number, number][][] = [];
    for (const poly of f.polys) {
      const pb = lonLatBox([poly]);
      if (!pb || !intersects(pb, view)) continue;
      for (const ring of poly) {
        d += ringPath(ring, project, tolerance);
        if (wantHatch) projected.push(ring.map(project));
      }
    }
    if (!d) continue;
    const isFocus = f.slug === input.focus;
    if (isFocus) outline = d;
    shapes.push({
      slug: f.slug,
      d,
      fill: input.fill(f.slug),
      focus: isFocus,
      // Ränder bara där de syns, så att förklaringen inte nämner något som ligger utanför bilden.
      thin: wantHatch && coversFrame(projected, width, height),
    });
  }
  // Fokusområdet sist, så att det hamnar överst.
  shapes.sort((a, b) => Number(a.focus) - Number(b.focus));

  // Etiketter: fokus först, sedan grannar vars etikettpunkt syns och inte krockar.
  const labels: MinimapLabel[] = [];
  const taken: Box[] = [];
  const inset = 6;
  const tryPlace = (slug: string, isFocus: boolean): boolean => {
    const text = input.name(slug);
    const lp = input.labelPoint(slug);
    if (!text || !lp) return false;
    const [x, y] = project(lp);
    const fs = isFocus ? FOCUS_LABEL_FONT : LABEL_FONT;
    const w = textWidth(text, fs);
    const h = fs * 1.3;
    // Fokusetiketten hålls inom bilden även i den förstorade storleken.
    const reserveW = isFocus ? textWidth(text, focusReserve) : w;
    let lx = x;
    // Skjut in etiketten om den sticker ut på sidorna, men bara en bit.
    if (lx - reserveW / 2 < inset) lx = inset + reserveW / 2;
    if (lx + reserveW / 2 > width - inset) lx = width - inset - reserveW / 2;
    if (!isFocus && (Math.abs(lx - x) > w / 2 || y - h / 2 < inset || y + h / 2 > height - inset))
      return false;
    const box: Box = [lx - w / 2 - 4, y - h / 2 - 2, lx + w / 2 + 4, y + h / 2 + 2];
    if (taken.some((t) => intersects(t, box))) return false;
    taken.push(box);
    labels.push({ slug, text, x: r1(lx), y: r1(y), focus: isFocus });
    return true;
  };
  tryPlace(input.focus, true);
  let placed = 0;
  for (const slug of input.neighbours) {
    if (placed >= maxLabels) break;
    if (slug === input.focus) continue;
    if (tryPlace(slug, false)) placed++;
  }

  return { width, height, shapes, outline, labels };
}

export interface SvgOptions {
  /** Tillgänglig beskrivning (aria-label). */
  label: string;
  /** Opacitet för grannområden. */
  neighbourOpacity?: number;
}

/**
 * Ränder för områden med få affärer: mörka diagonala linjer (/) med 25 % täckning,
 * samma utseende som kartans (scripts/map/mapstyle HATCH.thin) och CSS-variabeln --hatch.
 */
const HATCH_PATTERN =
  '<defs><pattern id="mm-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
  '<rect width="1.2" height="5" fill="#1a1f1c" fill-opacity="0.25"/></pattern></defs>';

/**
 * Hela minikartan som en SVG-sträng. Prisfärgerna sätts direkt (från lib/scales);
 * bakgrund, kanter, accent och text styrs med klasserna mm-bg, mm-area, mm-focus och
 * mm-label, så att komponenten kan använda designsystemets tokens. Områden med få
 * affärer får ett randigt lager (mm-hatch) ovanpå färgen.
 */
export function minimapSvg(map: Minimap, o: SvgOptions): string {
  const op = o.neighbourOpacity ?? 0.55;
  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${map.width} ${map.height}" role="img" aria-label="${escape(o.label)}" preserveAspectRatio="xMidYMid slice">`,
  );
  if (map.shapes.some((s) => s.thin)) parts.push(HATCH_PATTERN);
  parts.push(`<rect class="mm-bg" width="${map.width}" height="${map.height}"/>`);
  for (const s of map.shapes) {
    parts.push(
      `<path class="mm-area${s.focus ? " mm-area-focus" : ""}" d="${s.d}" fill="${s.fill}"${s.focus ? "" : ` fill-opacity="${op}"`} fill-rule="evenodd"/>`,
    );
    if (s.thin)
      parts.push(`<path class="mm-hatch" d="${s.d}" fill="url(#mm-hatch)" fill-rule="evenodd"/>`);
  }
  if (map.outline) parts.push(`<path class="mm-focus" d="${map.outline}" fill="none"/>`);
  for (const l of map.labels) {
    parts.push(
      `<text class="mm-label${l.focus ? " mm-label-focus" : ""}" x="${l.x}" y="${l.y}" text-anchor="middle" dominant-baseline="central">${escape(l.text)}</text>`,
    );
  }
  parts.push("</svg>");
  return parts.join("");
}
