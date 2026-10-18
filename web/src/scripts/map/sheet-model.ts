/**
 * Panelen som drar upp nerifrån på mobilen (som i Google Maps): tre lägen och regler för var den
 * stannar. Rena funktioner; sheet.ts sköter DOM och gester.
 */

export const SHEET_STATES = ["peek", "half", "full"] as const;
export type SheetState = (typeof SHEET_STATES)[number];

/** Synlig höjd i px för varje läge. */
export type SheetHeights = Record<SheetState, number>;

/** Kikläget får aldrig ta mer än så här av ytan, så att kartan alltid syns. */
const PEEK_MAX_SHARE = 0.45;
const PEEK_MIN = 72;
/** Halvläget ligger minst så här högt över kikläget, annars går de inte att skilja åt. */
const HALF_GAP = 120;

/**
 * Höjderna för en yta som är `avail` px hög (från skärmens nederkant upp till sökfältet), där
 * kikläget behöver `peekContent` px för att visa sitt innehåll.
 */
export function sheetHeights(avail: number, peekContent: number): SheetHeights {
  const full = Math.max(0, Math.round(avail));
  const peek = Math.round(Math.min(Math.max(peekContent, PEEK_MIN), full * PEEK_MAX_SHARE));
  const half = Math.round(Math.min(Math.max(full * 0.5, peek + HALF_GAP), full));
  return { peek, half, full };
}

/** Utanför ändlägena följer panelen fingret allt trögare, i stället för att stanna tvärt. */
export function rubberBand(h: number, min: number, max: number): number {
  if (h < min) return min - (min - h) * 0.25;
  if (h > max) return max + (h - max) * 0.25;
  return h;
}

/** Så långt (ms) panelen tänks fortsätta efter släppet när läget väljs. */
const PROJECTION_MS = 180;
/** Över den farten (px/ms) räknas en svepning: panelen går minst ett steg åt det hållet. */
const FLICK = 0.45;

/**
 * Läget panelen ska stanna i efter en dragning. `velocity` är px/ms, positiv uppåt (växande höjd).
 */
export function pickSnap(heights: SheetHeights, h: number, velocity: number): SheetState {
  // En snabb svepning går till nästa läge åt det hållet och studsar aldrig tillbaka.
  if (velocity >= FLICK) return SHEET_STATES.find((s) => heights[s] > h + 1) ?? "full";
  if (velocity <= -FLICK)
    return [...SHEET_STATES].reverse().find((s) => heights[s] < h - 1) ?? "peek";
  const projected = h + velocity * PROJECTION_MS;
  let best: SheetState = "peek";
  for (const s of SHEET_STATES) {
    if (Math.abs(heights[s] - projected) < Math.abs(heights[best] - projected)) best = s;
  }
  return best;
}

/** Handtaget: kik → halv → hel → kik. */
export function nextState(s: SheetState): SheetState {
  return s === "peek" ? "half" : s === "half" ? "full" : "peek";
}

export type Padding = { top: number; bottom: number; left: number; right: number };

/**
 * Marginal för kameran på mobilen. Med panelen över kartan räknas det som täcks bort, så att
 * området hamnar mitt i den del av kartan som syns. Blir det för trångt krymper marginalen nertill.
 */
export function fitPadding(
  height: number,
  insets: { top: number; bottom: number } | null,
  base: Padding,
): Padding {
  if (!insets) return base;
  const top = insets.top + base.top;
  const room = height - top - 120;
  const bottom = Math.max(base.bottom, Math.min(insets.bottom + base.bottom, room));
  return { ...base, top, bottom };
}
