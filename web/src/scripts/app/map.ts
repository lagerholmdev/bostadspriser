/**
 * Kartan (MapLibre GL). Laddas för sig efter panelen, så att listan går att använda direkt.
 * Kartan vet inget om sidans läge; main.ts säger vad som ska visas och får veta vad som klickas.
 */
import "maplibre-gl/dist/maplibre-gl.css";
import {
  AttributionControl,
  Map as MlMap,
  NavigationControl,
  setWorkerUrl,
  type IControl,
  type MapMouseEvent,
} from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import geojsonUrl from "../../generated/areas.geojson?url";
import type { StyleSpecification } from "@maplibre/maplibre-gl-style-spec";
import { areas as ALL_AREAS } from "../../lib/data";
import type { Html } from "./html";
import { AreaLabels } from "./labels";
import { composeStyle, heightExpression, LAYER, matchBySlug, slugFilter } from "./mapstyle";
import { unionBbox, type Paint } from "./model";
import { NODATA_COLOR } from "../../lib/scales";
import { Tooltip } from "./tooltip";

// Vite bygger om MapLibre, så arbetstråden måste pekas ut uttryckligen.
setWorkerUrl(workerUrl);

type Bbox = [number, number, number, number];

/** Länet med marginal; kartan går inte att dra längre bort än så. */
const MAX_BOUNDS: [[number, number], [number, number]] = [
  [17.2, 58.6],
  [19.6, 60.3],
];
const COUNTY_BBOX = unionBbox(ALL_AREAS);
const CITY_BBOX = unionBbox(ALL_AREAS.filter((a) => a.kind === "district"));
/** Staden och närförorterna (Solna, Sundbyberg, Nacka, Lidingö i kanten). */
const INNER_BBOX: Bbox = [17.79, 59.24, 18.22, 59.41];
const PITCH_3D = 50;
/** Närmare än så zoomar kartan inte själv när ett område väljs, så att grannarna syns. */
const AREA_MAX_ZOOM = 11.5;

const LOCALE = {
  "AttributionControl.ToggleAttribution": "Visa eller dölj källor",
  "AttributionControl.MapFeedback": "Rapportera kartfel",
  "Map.Title": "Karta",
  "NavigationControl.ZoomIn": "Zooma in",
  "NavigationControl.ZoomOut": "Zooma ut",
  "NavigationControl.ResetBearing": "Återställ riktning",
};

export interface AreaMapOptions {
  wrap: HTMLElement;
  canvas: HTMLElement;
  labels: HTMLElement;
  tooltip: HTMLElement;
  paint: Paint;
  selected: string | null;
  baseStyle: Promise<StyleSpecification | null>;
  onSelect: (slug: string | null) => void;
  tooltipContent: (slug: string) => Html;
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isWide = () => window.matchMedia("(min-width: 960px)").matches;
const canHover = () => window.matchMedia("(hover: hover) and (pointer: fine)").matches;

export class AreaMap {
  private is3d = false;
  private hovered: string | null = null;
  private selected: string | null;
  private labels: AreaLabels;
  private tooltip: Tooltip;
  private toggle3d!: HTMLButtonElement;

  private constructor(
    private readonly map: MlMap,
    private readonly opts: AreaMapOptions,
    readonly basemap: boolean,
  ) {
    this.selected = opts.selected;
    this.labels = new AreaLabels(map, opts.labels, ALL_AREAS);
    this.labels.setSelected(this.selected);
    this.tooltip = new Tooltip(opts.tooltip, opts.wrap);
    this.addControls();
    this.bindPointer();
    opts.wrap.classList.toggle("is-fallback", !basemap);
  }

  static async create(opts: AreaMapOptions): Promise<AreaMap> {
    const base = await opts.baseStyle;
    const { style, basemap } = composeStyle(base, geojsonUrl, opts.paint);
    const selectedArea = opts.selected ? ALL_AREAS.find((a) => a.slug === opts.selected) : undefined;
    const map = new MlMap({
      container: opts.canvas,
      style: style as never,
      bounds: selectedArea ? selectedArea.bbox : isWide() ? INNER_BBOX : CITY_BBOX,
      fitBoundsOptions: { padding: isWide() ? 48 : 16, maxZoom: isWide() ? AREA_MAX_ZOOM : AREA_MAX_ZOOM - 0.75 },
      maxBounds: MAX_BOUNDS,
      minZoom: 7.5,
      maxZoom: 14,
      maxPitch: 60,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: false,
      locale: LOCALE,
      fadeDuration: 0,
      cooperativeGestures: false,
    });
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.addControl(new AttributionControl({ compact: true }), "bottom-right");
    map.on("error", (e) => {
      // Saknade kartrutor och liknande ska inte fylla konsolen; kartan fungerar ändå.
      if (!AreaMap.warned) console.warn("Kartan:", e.error?.message ?? e);
      AreaMap.warned = true;
    });
    const instance = new AreaMap(map, opts, basemap);
    await new Promise<void>((resolve) => (map.loaded() ? resolve() : map.once("load", () => resolve())));
    instance.setSelected(opts.selected, false);
    return instance;
  }

  private static warned = false;

  /* ---------- Läge från sidan ---------- */

  setPaint(paint: Paint): void {
    const color = matchBySlug(paint.color, NODATA_COLOR);
    this.map.setPaintProperty(LAYER.fill, "fill-color", color);
    this.map.setPaintProperty(LAYER.fill, "fill-opacity", matchBySlug(paint.opacity, 0.5));
    this.map.setPaintProperty(LAYER.extrude, "fill-extrusion-color", color);
    this.map.setPaintProperty(LAYER.extrude, "fill-extrusion-height", heightExpression(paint));
    this.tooltip.invalidate();
  }

  setSelected(slug: string | null, fly = true): void {
    this.selected = slug;
    this.map.setFilter(LAYER.selected, slugFilter(slug));
    this.map.setFilter(LAYER.selectedCasing, slugFilter(slug));
    this.labels.setSelected(slug);
    if (!slug || !fly) return;
    const area = ALL_AREAS.find((a) => a.slug === slug);
    if (area) this.fit(area.bbox, isWide() ? AREA_MAX_ZOOM : AREA_MAX_ZOOM - 0.75);
  }

  /** Hela länet. */
  showCounty(): void {
    this.fit(COUNTY_BBOX, 14);
  }

  private fit(bbox: Bbox, maxZoom: number): void {
    const wide = isWide();
    this.map.fitBounds(bbox, {
      padding: wide ? { top: 72, bottom: 96, left: 72, right: 72 } : { top: 32, bottom: 48, left: 24, right: 24 },
      maxZoom,
      bearing: this.map.getBearing(),
      pitch: this.map.getPitch(),
      duration: reducedMotion() ? 0 : 800,
      essential: false,
    });
  }

  /* ---------- Kontroller ---------- */

  private addControls(): void {
    this.map.addControl(new NavigationControl({ showCompass: false, visualizePitch: false }), "top-right");
    const self = this;
    const ctrl: IControl = {
      onAdd() {
        const box = document.createElement("div");
        box.className = "maplibregl-ctrl maplibregl-ctrl-group map-ctrl-text";
        const county = document.createElement("button");
        county.type = "button";
        county.textContent = "Hela länet";
        county.addEventListener("click", () => self.showCounty());
        const t3 = document.createElement("button");
        t3.type = "button";
        t3.textContent = "3D";
        t3.setAttribute("aria-pressed", "false");
        t3.title = "Visa priset som höjd";
        t3.addEventListener("click", () => self.set3d(!self.is3d));
        self.toggle3d = t3;
        box.append(county, t3);
        return box;
      },
      onRemove() {},
    };
    this.map.addControl(ctrl, "top-right");
  }

  set3d(on: boolean): void {
    this.is3d = on;
    const m = this.map;
    m.setLayoutProperty(LAYER.extrude, "visibility", on ? "visible" : "none");
    m.setLayoutProperty(LAYER.fill, "visibility", on ? "none" : "visible");
    m.setLayoutProperty(LAYER.outline, "visibility", on ? "none" : "visible");
    m.setLayoutProperty(LAYER.hover, "visibility", on ? "none" : "visible");
    this.toggle3d.setAttribute("aria-pressed", String(on));
    this.labels.setVisible(!on);
    this.opts.wrap.classList.toggle("is-3d", on);
    if (on) {
      m.dragRotate.enable();
      m.touchZoomRotate.enableRotation();
      m.touchPitch.enable();
      m.keyboard.enableRotation();
    } else {
      m.dragRotate.disable();
      m.touchZoomRotate.disableRotation();
      m.touchPitch.disable();
      m.keyboard.disableRotation();
    }
    m.easeTo({ pitch: on ? PITCH_3D : 0, bearing: on ? -12 : 0, duration: reducedMotion() ? 0 : 700 });
  }

  /* ---------- Mus och pek ---------- */

  private hitLayer(): string {
    return this.is3d ? LAYER.extrude : LAYER.fill;
  }

  private slugAt(e: MapMouseEvent): string | null {
    const f = this.map.queryRenderedFeatures(e.point, { layers: [this.hitLayer()] })[0];
    const slug = f?.properties?.slug;
    return typeof slug === "string" ? slug : null;
  }

  private bindPointer(): void {
    const m = this.map;
    m.on("mousemove", (e) => {
      if (!canHover()) return;
      const slug = this.slugAt(e);
      if (slug !== this.hovered) {
        this.hovered = slug;
        m.setFilter(LAYER.hover, slugFilter(slug));
        m.getCanvas().style.cursor = slug ? "pointer" : "";
      }
      if (slug) this.tooltip.show(slug, () => this.opts.tooltipContent(slug), e.point.x, e.point.y);
      else this.tooltip.hide();
    });
    const leave = () => {
      this.hovered = null;
      m.setFilter(LAYER.hover, slugFilter(null));
      m.getCanvas().style.cursor = "";
      this.tooltip.hide();
    };
    m.getCanvas().addEventListener("mouseleave", leave);
    m.on("movestart", () => this.tooltip.hide());
    m.on("click", (e) => {
      const slug = this.slugAt(e);
      this.opts.onSelect(slug);
    });
  }
}
