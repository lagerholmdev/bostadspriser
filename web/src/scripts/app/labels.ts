/**
 * Områdesnamn på kartan som HTML ovanpå kartbilden. Det fungerar utan kartans typsnittsfiler
 * (även i reservstilen) och använder sajtens eget typsnitt. Ett namn visas bara när området är
 * stort nog på skärmen och inte krockar med ett viktigare namn; det valda området går först.
 */
import type { Map as MlMap } from "maplibre-gl";
import type { Area } from "../../lib/types";

interface Label {
  area: Area;
  el: HTMLSpanElement;
  w: number;
  h: number;
}

const PAD = 4;

export class AreaLabels {
  private labels: Label[];
  private selected: string | null = null;
  private visible = true;
  private frame = 0;

  constructor(
    private readonly map: MlMap,
    private readonly layer: HTMLElement,
    list: readonly Area[],
  ) {
    this.labels = list.map((area) => {
      const el = document.createElement("span");
      el.className = "map-label";
      el.textContent = area.name;
      el.setAttribute("aria-hidden", "true");
      layer.appendChild(el);
      return { area, el, w: 0, h: 0 };
    });
    this.measure();
    // Mät om när typsnittet laddats, annars blir bredderna fel.
    document.fonts?.ready.then(() => {
      this.measure();
      this.schedule();
    });
    map.on("move", () => this.schedule());
    map.on("resize", () => this.schedule());
    this.schedule();
  }

  setSelected(slug: string | null): void {
    this.selected = slug;
    for (const l of this.labels) l.el.classList.toggle("is-selected", l.area.slug === slug);
    this.measure();
    this.schedule();
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.layer.hidden = !v;
    if (v) this.schedule();
  }

  private measure(): void {
    for (const l of this.labels) {
      l.w = l.el.offsetWidth;
      l.h = l.el.offsetHeight;
    }
  }

  private schedule(): void {
    if (this.frame || !this.visible) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.place();
    });
  }

  private place(): void {
    const { map } = this;
    const canvas = map.getCanvas();
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    const items = this.labels.map((l) => {
      const p = map.project(l.area.label);
      const sw = map.project([l.area.bbox[0], l.area.bbox[1]]);
      const ne = map.project([l.area.bbox[2], l.area.bbox[3]]);
      const size = Math.abs(ne.x - sw.x) * Math.abs(sw.y - ne.y);
      const width = Math.abs(ne.x - sw.x);
      return { l, p, size, width };
    });
    items.sort((a, b) => {
      if (a.l.area.slug === this.selected) return -1;
      if (b.l.area.slug === this.selected) return 1;
      return b.size - a.size;
    });
    const placed: [number, number, number, number][] = [];
    for (const { l, p, width } of items) {
      const isSel = l.area.slug === this.selected;
      const x0 = p.x - l.w / 2 - PAD;
      const y0 = p.y - l.h / 2 - PAD;
      const x1 = p.x + l.w / 2 + PAD;
      const y1 = p.y + l.h / 2 + PAD;
      const inView = x0 > 0 && y0 > 0 && x1 < W && y1 < H;
      const bigEnough = isSel || width > l.w * 0.9;
      const free = !placed.some((b) => x0 < b[2] && x1 > b[0] && y0 < b[3] && y1 > b[1]);
      const show = inView && bigEnough && free;
      if (show) {
        placed.push([x0, y0, x1, y1]);
        l.el.style.transform = `translate(${Math.round(p.x - l.w / 2)}px, ${Math.round(p.y - l.h / 2)}px)`;
      }
      l.el.classList.toggle("is-shown", show);
    }
  }
}
