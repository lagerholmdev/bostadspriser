/**
 * Panelen i webbläsaren: kopplar flikar, filter, reglage och rader till läget, och ritar om
 * de delar som beror på läget. Själva HTML:en kommer från samma renderfunktioner som bygget använder.
 */
import { BUDGET_RANGE, SIZE_RANGE, typicalRooms } from "../../../lib/budget";
import { getArea } from "../../../lib/data";
import { areaUrl } from "../../../lib/links";
import { mkr, mkrSpoken } from "../../../lib/format";
import type { Html } from "../../../lib/html";
import { VIEWS, withHousing, withView, type AppState, type View } from "../../../lib/url";
import { addTo, loadCompare, MAX_COMPARE, removeFrom, saveCompare } from "../compare-tray";
import { budgetModel, changeModel, mapPaint, priceModel, type SortOrder } from "../model";
import type { HistoryMode, Store } from "../state";
import { detail } from "./detail";
import { legend, mapLegend } from "./legend";
import { peekHtml } from "./quick";
import { tray } from "./tray";
import {
  budgetBest,
  budgetHeadline,
  budgetMax,
  budgetResults,
  changeLists,
  changeSummary,
  priceList,
  priceSummary,
} from "./views";

const SORT_KEY = "prislandskap:sortering";
const SITE_TITLE = "Stockholms prislandskap";
const VIEW_TITLE: Partial<Record<View, string>> = {
  budget: `Var har jag råd? | ${SITE_TITLE}`,
  forandring: `Förändring i bostadspriser | ${SITE_TITLE}`,
};
/** Så länge efter sista ändringen av ett reglage läses resultatet upp. */
const ANNOUNCE_DELAY = 600;

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const isWide = () => window.matchMedia("(min-width: 960px)").matches;

export class PanelController {
  private sort: SortOrder = "desc";
  private compare: string[];
  /** Mobilen: är brickans valda områden utfällda? */
  private trayOpen = false;
  private trayTimer: number | undefined;
  private announceTimer: number | undefined;
  /** Senast ritade HTML per yta, så att oförändrade delar inte ritas om (och fokus inte tappas). */
  private rendered = new Map<string, string>();
  private readonly baseTitle = document.title;
  private q = <T extends Element = HTMLElement>(sel: string) => this.root.querySelector<T>(sel);
  /** Kopierar en adress (områdessidans); sätts av main.ts när delningen kopplats in. */
  copyLink: ((url: string, status: HTMLElement | null) => void) | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly store: Store,
  ) {
    try {
      const s = sessionStorage.getItem(SORT_KEY);
      if (s === "asc" || s === "name" || s === "desc") this.sort = s;
    } catch {
      /* standard */
    }
    this.compare = loadCompare((s) => !!getArea(s));
    this.bind();
    store.subscribe((s, prev, mode) => this.render(s, prev, mode));
  }

  /** Första ritningen efter att sidan laddats (adressen kan skilja sig från byggets standardläge). */
  start(): void {
    this.render(this.store.state, null, "none");
    this.renderTray();
    this.root.closest(".app")?.removeAttribute("data-pending");
  }

  selectArea(slug: string | null, opts: { focus?: boolean } = {}): void {
    const prev = this.store.state.area;
    if (slug === prev) {
      if (slug && opts.focus) this.revealDetail({ focus: true });
      return;
    }
    this.store.set({ area: slug }, "push");
    if (slug && opts.focus) this.revealDetail({ focus: true });
    if (!slug && prev && opts.focus) this.focusRow(prev);
  }

  /* ---------- Händelser ---------- */

  private bind(): void {
    // Flikar: klick och piltangenter (automatisk aktivering).
    const tabs = [...this.root.querySelectorAll<HTMLButtonElement>("[role=tab]")];
    for (const tab of tabs) {
      tab.addEventListener("click", () => this.setView(tab.dataset.view));
      tab.addEventListener("keydown", (e) => {
        const i = tabs.indexOf(tab);
        let j = -1;
        if (e.key === "ArrowRight") j = (i + 1) % tabs.length;
        else if (e.key === "ArrowLeft") j = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === "Home") j = 0;
        else if (e.key === "End") j = tabs.length - 1;
        const next = tabs[j];
        if (!next) return;
        e.preventDefault();
        next.focus();
        this.setView(next.dataset.view);
      });
    }

    this.root.addEventListener("change", (e) => {
      const t = e.target as HTMLInputElement;
      if (t.name === "bostad") {
        this.store.replace(
          withHousing(this.store.state, t.value === "house" ? "house" : "apartment"),
        );
      } else if (t.name === "period") this.store.set({ period: t.value === "m12" ? "m12" : "m3" });
      else if (t.name === "sortering") {
        this.sort = t.value as SortOrder;
        try {
          sessionStorage.setItem(SORT_KEY, this.sort);
        } catch {
          /* ok */
        }
        this.renderActiveView(this.store.state);
      }
    });

    const budget = this.q<HTMLInputElement>("#budget-range");
    const size = this.q<HTMLInputElement>("#size-range");
    budget?.addEventListener("input", () =>
      this.store.set({ budget: Math.round(Number(budget.value) * 1_000_000) }),
    );
    size?.addEventListener("input", () => this.store.set({ sqm: Number(size.value) }));

    this.root.addEventListener("click", (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>("button, a");
      if (!t || !this.root.contains(t)) return;
      const { action, slug } = t.dataset;
      if (action === "step") {
        this.step(t.dataset.control, Number(t.dataset.dir), t);
      } else if (action === "peek-go") {
        this.revealDetail({ focus: true, force: true });
      } else if (action === "back") {
        this.selectArea(null, { focus: true });
      } else if (action === "compare" && slug) {
        this.toggleCompare(slug);
      } else if (action === "remove-compare" && slug) {
        this.removeCompare(slug);
      } else if (action === "toggle-tray") {
        // Växla på plats, så att knappen behåller fokus.
        this.trayOpen = !this.trayOpen;
        t.setAttribute("aria-expanded", String(this.trayOpen));
        t.closest(".tray-inner")?.classList.toggle("is-open", this.trayOpen);
      } else if (action === "copy-link" && slug) {
        // Områdessidans adress, så att länkförhandsvisningen får områdets delningsbild.
        this.copyLink?.(new URL(areaUrl(slug), location.origin).href, this.q("#copy-status"));
      } else if (action === "to-filters") {
        e.preventDefault();
        const radio = this.q<HTMLInputElement>("#filters input:checked");
        radio?.focus();
        radio?.scrollIntoView({ block: "center", behavior: reduced() ? "auto" : "smooth" });
      } else if (!action && slug && t.tagName === "BUTTON") {
        this.selectArea(slug, { focus: true });
      }
    });
  }

  private setView(view: string | undefined): void {
    const v = VIEWS.find((x) => x === view);
    if (!v || v === this.store.state.view) return;
    this.store.replace(withView(this.store.state, v), "push");
    this.scrollTabsIntoView();
  }

  /** På mobilen: lägg flikraden precis under sidhuvudet, så att den nya vyns innehåll syns. */
  private scrollTabsIntoView(): void {
    if (isWide()) return;
    const tabs = this.q<HTMLElement>(".tabs");
    if (!tabs) return;
    requestAnimationFrame(() => {
      const headerBottom =
        document.querySelector(".site-header")?.getBoundingClientRect().bottom ?? 0;
      const delta = tabs.getBoundingClientRect().top - headerBottom - 4;
      if (Math.abs(delta) > 2)
        window.scrollBy({ top: delta, behavior: reduced() ? "auto" : "smooth" });
    });
  }

  private step(control: string | undefined, dir: number, btn: HTMLElement): void {
    if (btn.getAttribute("aria-disabled") === "true") return;
    const s = this.store.state;
    if (control === "budget") {
      const v = Math.min(
        BUDGET_RANGE.max,
        Math.max(BUDGET_RANGE.min, s.budget + dir * BUDGET_RANGE.step),
      );
      if (v !== s.budget) this.store.set({ budget: v });
    } else if (control === "size") {
      const v = Math.min(SIZE_RANGE.max, Math.max(SIZE_RANGE.min, s.sqm + dir * SIZE_RANGE.step));
      if (v !== s.sqm) this.store.set({ sqm: v });
    }
  }

  /* ---------- Jämförelse ---------- */

  private toggleCompare(slug: string): void {
    if (this.compare.includes(slug)) return this.removeCompare(slug);
    const { list, dropped } = addTo(this.compare, slug);
    this.compare = list;
    saveCompare(list);
    const name = getArea(slug)?.name ?? slug;
    const droppedName = dropped ? (getArea(dropped)?.name ?? dropped) : null;
    this.renderTray(
      droppedName
        ? `Du kan jämföra högst ${MAX_COMPARE} områden, så ${droppedName} togs bort.`
        : `${name} är tillagd i jämförelsen.`,
      !!droppedName,
    );
    this.renderDetail(this.store.state);
    this.q<HTMLButtonElement>("[data-action=compare]")?.focus();
  }

  private removeCompare(slug: string): void {
    const wasFocusedInTray = this.q("#tray")?.contains(document.activeElement);
    const wasFocusedInDetail =
      (document.activeElement as HTMLElement | null)?.dataset.action === "compare";
    this.compare = removeFrom(this.compare, slug);
    saveCompare(this.compare);
    this.renderTray(`${getArea(slug)?.name ?? slug} är borttagen ur jämförelsen.`);
    this.renderDetail(this.store.state);
    if (wasFocusedInDetail) this.q<HTMLButtonElement>("[data-action=compare]")?.focus();
    else if (wasFocusedInTray) {
      const next = this.q<HTMLElement>("#tray .chip-x, #tray .tray-go");
      (next ?? this.q<HTMLElement>("#detail-title, [role=tab][aria-selected=true]"))?.focus();
    }
  }

  private renderTray(message?: string, visible = false): void {
    const el = this.q("#tray");
    const status = this.q("#tray-status");
    if (!el) return;
    el.hidden = this.compare.length === 0;
    if (!this.compare.length) this.trayOpen = false;
    const body = this.q("#tray-body");
    if (body) body.innerHTML = tray(this.compare, this.trayOpen).value;
    const note = this.q("#tray-note");
    if (status && message) status.textContent = message;
    if (note) {
      window.clearTimeout(this.trayTimer);
      note.textContent = visible && message ? message : "";
      note.hidden = !(visible && message);
      if (visible) this.trayTimer = window.setTimeout(() => (note.hidden = true), 6000);
    }
  }

  /* ---------- Ritning ---------- */

  private render(s: AppState, prev: AppState | null, mode: HistoryMode): void {
    const app = this.root.closest<HTMLElement>(".app");
    if (app) app.dataset.view = s.view;

    for (const tab of this.root.querySelectorAll<HTMLButtonElement>("[role=tab]")) {
      const on = tab.dataset.view === s.view;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
    }
    for (const p of this.root.querySelectorAll<HTMLElement>("[data-view-panel]")) {
      p.hidden = p.dataset.viewPanel !== s.view;
    }

    this.check("bostad", s.housing);
    this.check("period", s.period);
    this.check("sortering", this.sort);
    // I Förändring betyder perioden "på tre månader" eller "på ett år" (se Panel.astro, data-change-label).
    for (const span of this.root.querySelectorAll<HTMLElement>("[data-change-label]")) {
      const t = (s.view === "forandring" ? span.dataset.changeLabel : span.dataset.label) ?? "";
      if (t && span.textContent !== t) span.textContent = t;
    }
    const houseNote = this.q("#house-note");
    if (houseNote) houseNote.hidden = s.housing !== "house";

    this.syncControls(s);

    const views = this.q("#views");
    const det = this.q("#detail");
    if (views) views.hidden = !!s.area;
    if (det) det.hidden = !s.area;

    if (s.area) this.renderDetail(s);
    else this.renderActiveView(s);

    // Remsan under kartan (bara på mobilen) visar vad som valts på kartan.
    const peek = this.q("#peek");
    if (peek) {
      peek.hidden = !s.area;
      if (s.area) this.slot("peek", peekHtml(s.area, s));
    }

    // Kartans förklaring följer vyn, bostadstypen och perioden.
    const ml = document.querySelector<HTMLElement>("[data-slot=map-legend]");
    if (ml) this.paintInto("map-legend", ml, mapLegend(s, mapPaint(s).nodata.length > 0));

    const area = s.area ? getArea(s.area) : null;
    document.title = area
      ? `${area.name}: bostadspriser | ${SITE_TITLE}`
      : (VIEW_TITLE[s.view] ?? this.baseTitle);

    if (!prev) return;
    const opened = !!s.area && prev.area !== s.area;
    if (mode === "none") {
      // Bakåt/Framåt: lägg fokus där innehållet ändrades.
      if (opened) this.revealDetail({ focus: true });
      else if (!s.area && prev.area) this.focusRow(prev.area);
      else if (s.view !== prev.view) this.keepFocusOnViewChange();
    } else if (opened) {
      // Nytt område (t.ex. från kartan): visa detaljens början, med "Tillbaka till listan".
      this.revealDetail({ focus: false });
    }

    // Läs upp resultatet i "Var har jag råd?" en stund efter sista ändringen.
    if (
      s.view === "budget" &&
      !s.area &&
      prev.view === "budget" &&
      (s.budget !== prev.budget ||
        s.sqm !== prev.sqm ||
        s.housing !== prev.housing ||
        s.period !== prev.period)
    ) {
      this.scheduleAnnounce();
    }
  }

  private scheduleAnnounce(): void {
    window.clearTimeout(this.announceTimer);
    this.announceTimer = window.setTimeout(() => {
      const status = this.q("#budget-status");
      if (!status) return;
      const head = this.q("[data-slot=budget-headline]")?.textContent?.trim() ?? "";
      const best = this.q("[data-slot=budget-best]")?.textContent?.trim() ?? "";
      status.textContent = [head ? `${head}.` : "", best].filter(Boolean).join(" ");
    }, ANNOUNCE_DELAY);
  }

  private check(name: string, value: string): void {
    for (const r of this.root.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)) {
      r.checked = r.value === value;
    }
  }

  private syncControls(s: AppState): void {
    const b = this.q<HTMLInputElement>("#budget-range");
    const z = this.q<HTMLInputElement>("#size-range");
    const bv = String(s.budget / 1_000_000);
    if (b && b.value !== bv) b.value = bv;
    if (z && z.value !== String(s.sqm)) z.value = String(s.sqm);
    const pct = (v: number, r: { min: number; max: number }) =>
      `${((v - r.min) / (r.max - r.min)) * 100}%`;
    b?.style.setProperty("--p", pct(s.budget, BUDGET_RANGE));
    z?.style.setProperty("--p", pct(s.sqm, SIZE_RANGE));
    b?.setAttribute("aria-valuetext", mkrSpoken(s.budget));
    z?.setAttribute("aria-valuetext", `${s.sqm} kvadratmeter`);
    this.text("#budget-out", mkr(s.budget));
    this.text("#size-out", `${s.sqm} kvm`);
    // Rumsantalet säger något om lägenheter, men inte om villor.
    this.text(
      "#size-hint",
      s.housing === "house" ? "Villans boarea" : `ungefär ${typicalRooms(s.sqm)}`,
    );
    for (const btn of this.root.querySelectorAll<HTMLButtonElement>("[data-action=step]")) {
      const isBudget = btn.dataset.control === "budget";
      const v = isBudget ? s.budget : s.sqm;
      const r = isBudget ? BUDGET_RANGE : SIZE_RANGE;
      const atEnd = Number(btn.dataset.dir) < 0 ? v <= r.min : v >= r.max;
      // aria-disabled i stället för disabled: knappen behåller fokus när gränsen nås.
      if (atEnd) btn.setAttribute("aria-disabled", "true");
      else btn.removeAttribute("aria-disabled");
    }
  }

  private text(sel: string, t: string): void {
    const el = this.q(sel);
    if (el && el.textContent !== t) el.textContent = t;
  }

  private paintInto(key: string, el: HTMLElement, h: Html): void {
    if (this.rendered.get(key) === h.value) return;
    this.rendered.set(key, h.value);
    el.innerHTML = h.value;
  }

  private slot(name: string, h: Html): void {
    const el = this.root.querySelector<HTMLElement>(`[data-slot="${name}"]`);
    if (el) this.paintInto(name, el, h);
  }

  /** Rita om och behåll en öppnad <details> öppen. */
  private slotKeepOpen(name: string, h: Html): void {
    const sel = `[data-slot="${name}"] details`;
    const wasOpen = this.root.querySelector<HTMLDetailsElement>(sel)?.open;
    this.slot(name, h);
    const d = this.root.querySelector<HTMLDetailsElement>(sel);
    if (d && wasOpen) d.open = true;
  }

  private renderActiveView(s: AppState): void {
    const hasMissing = mapPaint(s).nodata.length > 0;
    if (s.view === "pris") {
      const m = priceModel(s.housing, s.period, this.sort);
      this.slot("price-summary", priceSummary(m, s.housing, s.period));
      this.slot("price-legend", legend(s, hasMissing));
      this.slot("price-list", priceList(m, s.housing, s.period));
    } else if (s.view === "budget") {
      const m = budgetModel(s.housing, s.period, s.budget, s.sqm);
      this.slot("budget-max", budgetMax(m));
      this.text("[data-slot=budget-headline]", budgetHeadline(m, s.budget, s.sqm));
      this.slot("budget-best", budgetBest(m));
      this.slot("budget-legend", legend(s, hasMissing));
      this.slotKeepOpen("budget-results", budgetResults(m, s.budget, s.sqm, s.housing));
    } else {
      const m = changeModel(s.housing, s.period);
      this.slot("change-summary", changeSummary(m, s.housing, s.period));
      this.slot("change-legend", legend(s, hasMissing));
      this.slotKeepOpen("change-lists", changeLists(m, s.housing, s.period));
    }
  }

  private renderDetail(s: AppState): void {
    const area = s.area ? getArea(s.area) : null;
    if (!area) return;
    this.slot(
      "detail",
      detail(area, s, {
        inCompare: this.compare.includes(area.slug),
        compareFull: this.compare.length >= MAX_COMPARE,
      }),
    );
  }

  /* ---------- Fokus och scroll ---------- */

  /**
   * Visa områdesdetaljen med "Tillbaka till listan" synlig. På datorn scrollar panelen för sig;
   * på mobilen scrollar sidan och bara om detaljen inte redan syns (eller om `force`).
   */
  private revealDetail(o: { focus: boolean; force?: boolean }): void {
    requestAnimationFrame(() => {
      const wrap = this.q<HTMLElement>("#detail");
      if (!wrap) return;
      const smooth = !!o.force && !reduced();
      if (isWide()) {
        const sc = this.q<HTMLElement>("#panel-scroll");
        if (sc) {
          const box = sc.getBoundingClientRect();
          const top = wrap.getBoundingClientRect().top;
          if (top < box.top + 4 || top > box.top + box.height * 0.4) {
            sc.scrollTo({
              top: sc.scrollTop + top - box.top - 12,
              behavior: smooth ? "smooth" : "auto",
            });
          }
        }
      } else {
        const headerBottom =
          document.querySelector(".site-header")?.getBoundingClientRect().bottom ?? 0;
        const top = wrap.getBoundingClientRect().top;
        const visible = top >= headerBottom && top < window.innerHeight * 0.6;
        if (!visible || o.force)
          wrap.scrollIntoView({ block: "start", behavior: smooth ? "smooth" : "auto" });
      }
      if (o.focus) this.q<HTMLElement>("#detail-title")?.focus({ preventScroll: true });
    });
  }

  /**
   * Ny vy via Bakåt/Framåt: låg fokus i en vy som nu är dold (eller på en flik som inte längre
   * är vald), flytta det till den valda fliken.
   */
  private keepFocusOnViewChange(): void {
    const a = document.activeElement as HTMLElement | null;
    const lost =
      !a ||
      a === document.body ||
      !!a.closest("[hidden]") ||
      (a.getAttribute("role") === "tab" && a.getAttribute("aria-selected") !== "true");
    if (!lost) return;
    this.q<HTMLElement>("[role=tab][aria-selected=true]")?.focus();
  }

  private focusRow(slug: string): void {
    requestAnimationFrame(() => {
      const row = this.root.querySelector<HTMLElement>(
        `#views [data-view-panel]:not([hidden]) .row[data-slug="${slug}"]`,
      );
      if (row) {
        const details = row.closest("details");
        if (details && !details.open) details.open = true;
        row.focus();
      } else {
        this.q<HTMLElement>("[role=tab][aria-selected=true]")?.focus();
      }
    });
  }

  /** Visa områdets detalj utan att flytta fokus (t.ex. efter klick på kartan). */
  revealDetailQuietly(): void {
    this.revealDetail({ focus: false });
  }
}
