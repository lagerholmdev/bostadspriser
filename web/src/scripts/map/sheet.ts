/**
 * Mobilen: panelen ligger över kartan och dras upp nerifrån, som i Google Maps. Tre lägen
 * (kik, halv, hel); reglerna för var den stannar finns i sheet-model.ts.
 *
 * Panelens höjd ändras (inte transform), så att jämförelsebrickan ligger kvar längst ner och
 * innehållet klipps av på naturligt sätt. Bara i helläget scrollar innehållet; drar man nedåt
 * när det redan är högst upp följer panelen med i stället.
 */
import {
  nextState,
  pickSnap,
  rubberBand,
  sheetHeights,
  type SheetHeights,
  type SheetState,
} from "./sheet-model";

export interface SheetOptions {
  app: HTMLElement;
  panel: HTMLElement;
  scroller: HTMLElement;
  handle: HTMLButtonElement;
  topbar: HTMLElement;
  /** Höjden kikläget behöver, mätt från panelens överkant (utan brickan och säkerhetsmarginalen). */
  peekContent: () => number;
  /** Var innehållet ska stå när panelen inte är helt utfälld (0, eller områdets början). */
  restingScroll: () => number;
  initial: SheetState;
}

/** Så långt (px) fingret får röra sig innan det räknas som en dragning och inte ett tryck. */
const SLOP = 6;

interface Drag {
  startY: number;
  startH: number;
  lastY: number;
  lastT: number;
  velocity: number;
  inScroller: boolean;
  mode: "pending" | "sheet";
}

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export class BottomSheet {
  state: SheetState;
  private heights: SheetHeights = { peek: 0, half: 0, full: 0 };
  private topbarBottom = 0;
  private h = 0;
  private drag: Drag | null = null;
  private suppressClickUntil = 0;
  private settleTimer: number | undefined;
  private off: (() => void)[] = [];
  private listeners: ((s: SheetState) => void)[] = [];

  constructor(private readonly o: SheetOptions) {
    this.state = o.initial;
    o.app.classList.add("has-sheet");
    o.handle.hidden = false;
    this.bind();
    this.set(o.initial, { animate: false });
  }

  /** Synlig höjd i ett läge (nu om inget anges). Kameran använder den för att centrera rätt. */
  height(s: SheetState = this.state): number {
    return this.heights[s];
  }

  /** Avståndet från ytans överkant till sökfältets nederkant. */
  get top(): number {
    return this.topbarBottom;
  }

  onChange(fn: (s: SheetState) => void): void {
    this.listeners.push(fn);
  }

  set(state: SheetState, opts: { animate?: boolean; keepScroll?: boolean } = {}): void {
    const changed = state !== this.state;
    this.state = state;
    this.o.panel.dataset.sheet = state;
    this.o.handle.setAttribute("aria-expanded", String(state === "full"));
    this.o.handle.setAttribute(
      "aria-label",
      state === "full" ? "Fäll ihop panelen" : "Fäll ut panelen",
    );
    this.measure();
    if (state !== "full" && !opts.keepScroll) this.o.scroller.scrollTop = this.o.restingScroll();
    this.apply(this.heights[state], opts.animate ?? !reduced());
    if (changed) for (const fn of this.listeners) fn(state);
  }

  /** Mät om (ny skärmstorlek, brickan dök upp, ett område valdes) och behåll läget. */
  refresh(): void {
    if (this.drag?.mode === "sheet") return;
    this.measure();
    this.apply(this.heights[this.state], false);
  }

  /** Visa områdets början: från kikläget fälls panelen ut till halvläget. */
  revealDetail(force: boolean): void {
    if (force && this.state === "peek") this.set("half");
    else this.o.scroller.scrollTop = this.o.restingScroll();
  }

  destroy(): void {
    for (const f of this.off) f();
    this.off = [];
    window.clearTimeout(this.settleTimer);
    const { app, panel, handle } = this.o;
    app.classList.remove("has-sheet", "sheet-settling");
    app.style.removeProperty("--sheet-h");
    app.style.removeProperty("--topbar-h");
    panel.style.removeProperty("height");
    panel.classList.remove("is-settling", "is-dragging");
    delete panel.dataset.sheet;
    handle.hidden = true;
  }

  /* ---------- Mått ---------- */

  private measure(): void {
    const { app, panel, topbar } = this.o;
    this.topbarBottom = topbar.offsetTop + topbar.offsetHeight;
    app.style.setProperty("--topbar-h", `${this.topbarBottom}px`);
    const tray = panel.querySelector<HTMLElement>(".tray");
    const trayH = tray && !tray.hidden ? tray.offsetHeight : 0;
    const safe = parseFloat(getComputedStyle(panel).paddingBottom) || 0;
    const avail = app.clientHeight - this.topbarBottom - 4;
    this.heights = sheetHeights(avail, this.o.peekContent() + trayH + safe);
  }

  private apply(h: number, animate: boolean): void {
    const { app, panel } = this.o;
    this.h = h;
    window.clearTimeout(this.settleTimer);
    panel.classList.toggle("is-settling", animate);
    app.classList.toggle("sheet-settling", animate);
    if (animate) {
      this.settleTimer = window.setTimeout(() => {
        panel.classList.remove("is-settling");
        app.classList.remove("sheet-settling");
      }, 360);
    }
    panel.style.height = `${Math.round(h)}px`;
    app.style.setProperty("--sheet-h", `${Math.round(Math.min(h, this.heights.full))}px`);
  }

  /* ---------- Gester ---------- */

  private listen<K extends keyof HTMLElementEventMap>(
    el: HTMLElement | Window,
    type: K,
    fn: (e: HTMLElementEventMap[K]) => void,
    opts?: AddEventListenerOptions,
  ): void {
    el.addEventListener(type, fn as EventListener, opts);
    this.off.push(() => el.removeEventListener(type, fn as EventListener, opts));
  }

  private bind(): void {
    const { panel, handle, scroller, app } = this.o;

    this.listen(handle, "click", () => this.set(nextState(this.state)));

    this.listen(
      panel,
      "touchstart",
      (e) => {
        const t = e.touches[0];
        if (e.touches.length !== 1 || !t) {
          this.cancel();
          return;
        }
        this.begin(t.clientY, e.target as Element, e.timeStamp);
      },
      { passive: true },
    );
    this.listen(
      panel,
      "touchmove",
      (e) => {
        const t = e.touches[0];
        if (!this.drag || !t) return;
        if (this.move(t.clientY, e.timeStamp) && e.cancelable) e.preventDefault();
      },
      { passive: false },
    );
    this.listen(panel, "touchend", () => this.end());
    this.listen(panel, "touchcancel", () => this.end());

    // Mus (smalt fönster på datorn): dra i handtaget eller remsan med det valda området.
    this.listen(panel, "pointerdown", (e) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      const target = e.target as Element;
      if (!target.closest(".sheet-handle, .peek") || target.closest("button:not(.sheet-handle)"))
        return;
      this.begin(e.clientY, target, e.timeStamp);
      const move = (ev: PointerEvent) => {
        if (this.move(ev.clientY, ev.timeStamp)) ev.preventDefault();
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        this.end();
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });

    // En dragning ska inte också räknas som ett tryck på raden den började på.
    this.listen(
      panel,
      "click",
      (e) => {
        if (performance.now() < this.suppressClickUntil) {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      { capture: true },
    );

    // Tangentbord: fokus på något som panelen fick scrolla fram fäller ut den helt.
    this.listen(scroller, "focusin", (e) => {
      if (this.state === "full") return;
      const el = e.target as HTMLElement;
      // Rubriker som skriptet lägger fokus på (tabindex="-1") räknas inte.
      if (!el.matches(":focus-visible") || el.getAttribute("tabindex") === "-1") return;
      const r = el.getBoundingClientRect();
      const hidden =
        r.bottom > panel.getBoundingClientRect().bottom ||
        r.top < panel.getBoundingClientRect().top;
      if (hidden || Math.abs(scroller.scrollTop - this.o.restingScroll()) > 1)
        this.set("full", { keepScroll: true });
    });

    const ro = new ResizeObserver(() => this.refresh());
    for (const el of [app, panel.querySelector(".tray"), panel.querySelector(".peek")]) {
      if (el) ro.observe(el);
    }
    this.off.push(() => ro.disconnect());
  }

  private begin(y: number, target: Element, t: number): void {
    // Reglage och sökfält sköter sina egna dragningar.
    if (target.closest('input[type="range"], textarea, select, .search')) {
      this.drag = null;
      return;
    }
    this.drag = {
      startY: y,
      startH: this.h,
      lastY: y,
      lastT: t,
      velocity: 0,
      inScroller: this.o.scroller.contains(target),
      mode: "pending",
    };
  }

  /** Returnerar true när rörelsen tillhör panelen (och sidan inte ska scrolla). */
  private move(y: number, t: number): boolean {
    const d = this.drag;
    if (!d) return false;
    const up = d.startY - y;
    const scrollsContent = this.state === "full" && d.inScroller;
    if (d.mode === "pending") {
      // I helläget scrollar innehållet, utom när det redan står högst upp och fingret går nedåt.
      if (scrollsContent && (up > 0 || this.o.scroller.scrollTop > 0)) {
        if (Math.abs(up) >= SLOP) this.drag = null;
        return false;
      }
      if (Math.abs(up) < SLOP) return true;
      d.mode = "sheet";
      d.startY = y;
      d.startH = this.h;
      d.lastY = y;
      d.lastT = t;
      this.o.panel.classList.add("is-dragging");
      this.o.panel.classList.remove("is-settling");
      this.o.app.classList.remove("sheet-settling");
      return true;
    }
    const dt = Math.max(1, t - d.lastT);
    const v = (d.lastY - y) / dt;
    d.velocity = d.velocity * 0.3 + v * 0.7;
    d.lastY = y;
    d.lastT = t;
    const h = rubberBand(d.startH + (d.startY - y), this.heights.peek, this.heights.full);
    this.apply(h, false);
    return true;
  }

  private end(): void {
    const d = this.drag;
    this.drag = null;
    if (!d || d.mode !== "sheet") return;
    this.o.panel.classList.remove("is-dragging");
    this.suppressClickUntil = performance.now() + 350;
    // Fingret stod stilla en stund före släppet: ingen svepning.
    const v = performance.now() - d.lastT > 80 ? 0 : d.velocity;
    this.set(pickSnap(this.heights, this.h, v));
  }

  private cancel(): void {
    if (this.drag?.mode === "sheet") this.end();
    this.drag = null;
  }
}
