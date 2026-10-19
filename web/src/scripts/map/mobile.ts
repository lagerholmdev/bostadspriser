/**
 * Mobilens kartlayout, som i Google Maps: kartan fyller skärmen, sökfältet och vyerna flyter
 * överst och panelen dras upp nerifrån. Slås på och av när skärmen passerar brytpunkten.
 */
import type { AppState } from "../../lib/url";
import type { PanelController } from "./panel/controller";
import { BottomSheet } from "./sheet";
import type { SheetState } from "./sheet-model";
import type { Store } from "./state";

export const MOBILE_QUERY = "(max-width: 959px)";

/**
 * Sök, Dela och flikar: i toppremsan över kartan på mobilen, annars i panelen. Samma flytt görs
 * redan i sidan (index.astro) innan något ritas, så att det inte hoppar.
 */
export function placeTopbar(mobile: boolean): void {
  const topbar = document.getElementById("topbar");
  const filters = document.getElementById("filters");
  const head = document.querySelector<HTMLElement>(".app .panel-head");
  const search = document.querySelector<HTMLElement>(".app .search");
  const tabs = document.querySelector<HTMLElement>(".app .tabs");
  const share = document.getElementById("share");
  const status = document.getElementById("share-status");
  if (!topbar || !filters || !head || !search || !tabs || !share || !status) return;
  if (mobile && search.parentElement !== topbar) topbar.append(search, share, tabs, status);
  else if (!mobile && search.parentElement === topbar) {
    head.append(share);
    head.after(status);
    filters.before(search, tabs);
  }
}

/**
 * Höjden kikläget behöver, mätt från panelens överkant: allt fram till och med elementet med
 * data-peek-end i vyn som syns (vyns svar), annars filtren.
 */
function peekEnd(scroller: HTMLElement, fallback: HTMLElement): number {
  const ends = [...scroller.querySelectorAll<HTMLElement>("[data-peek-end]")];
  const el = ends.find((e) => e.getClientRects().length > 0) ?? fallback;
  const top = scroller.getBoundingClientRect().top - scroller.scrollTop;
  return scroller.offsetTop + el.getBoundingClientRect().bottom - top + 12;
}

export interface Insets {
  top: number;
  bottom: number;
}

export class MobileLayout {
  private sheet: BottomSheet | null = null;
  /** Nästa områdesval kom från kartan (då räcker kikläget). */
  private fromMap = false;
  /** Läget innan ett område öppnades, att gå tillbaka till. */
  private beforeArea: SheetState = "half";
  private readonly mq = window.matchMedia(MOBILE_QUERY);
  private listeners: ((active: boolean) => void)[] = [];

  constructor(
    private readonly app: HTMLElement,
    private readonly panelEl: HTMLElement,
    private readonly store: Store,
    private readonly panel: PanelController,
  ) {
    store.subscribe((s, prev) => this.onState(s, prev));
    this.mq.addEventListener("change", () => this.sync());
    document.getElementById("area-search")?.addEventListener("focus", () => {
      if (this.sheet && this.sheet.state !== "peek") this.sheet.set("peek");
    });
    this.sync();
  }

  get active(): boolean {
    return !!this.sheet;
  }

  onToggle(fn: (active: boolean) => void): void {
    this.listeners.push(fn);
  }

  /** Delen av kartan som täcks av sökfältet och panelen, för kamerans centrering. */
  insets(): Insets | null {
    return this.sheet ? { top: this.sheet.top, bottom: this.sheet.height() } : null;
  }

  /** Anropas av kartan just innan den väljer ett område. */
  markFromMap(): void {
    this.fromMap = true;
    // Valet sker direkt efteråt; blev det inget (samma område) ska flaggan inte hänga kvar.
    queueMicrotask(() => (this.fromMap = false));
  }

  private sync(): void {
    const mobile = this.mq.matches;
    if (mobile === this.active) return;
    if (mobile) this.enable();
    else this.disable();
    for (const fn of this.listeners) fn(mobile);
  }

  private enable(): void {
    placeTopbar(true);
    const scroller = this.panelEl.querySelector<HTMLElement>("#panel-scroll");
    const handle = this.panelEl.querySelector<HTMLButtonElement>("#sheet-handle");
    const topbar = document.getElementById("topbar");
    const peek = this.panelEl.querySelector<HTMLElement>("#peek");
    const filters = this.panelEl.querySelector<HTMLElement>("#filters");
    const detail = this.panelEl.querySelector<HTMLElement>("#detail");
    if (!scroller || !handle || !topbar || !peek || !filters || !detail) return;

    this.sheet = new BottomSheet({
      app: this.app,
      panel: this.panelEl,
      scroller,
      handle,
      topbar,
      // Kikläget visar remsan med det valda området, annars rubriken och filtren.
      peekContent: () => {
        if (peek.hidden) return peekEnd(scroller, filters);
        // Remsan är dold när panelen är utfälld; visa den ett ögonblick för att mäta.
        this.panelEl.classList.add("is-measuring");
        const h = scroller.offsetTop;
        this.panelEl.classList.remove("is-measuring");
        return h;
      },
      restingScroll: () => (this.store.state.area && !detail.hidden ? detail.offsetTop : 0),
      initial: this.store.state.area ? "half" : "peek",
    });
    this.panel.sheet = this.sheet;
    // Tryck på remsan med det valda området fäller ut panelen, som knappen "Visa mer".
    peek.addEventListener("click", this.onPeekClick);
  }

  private readonly onPeekClick = (e: MouseEvent): void => {
    if (this.sheet?.state !== "peek" || (e.target as Element).closest("button")) return;
    this.sheet.set("half");
  };

  private disable(): void {
    this.panelEl
      .querySelector<HTMLElement>("#peek")
      ?.removeEventListener("click", this.onPeekClick);
    this.sheet?.destroy();
    this.sheet = null;
    this.panel.sheet = null;
    placeTopbar(false);
  }

  private onState(s: AppState, prev: AppState): void {
    const sheet = this.sheet;
    const fromMap = this.fromMap;
    this.fromMap = false;
    if (!sheet) return;
    if (s.area !== prev.area) {
      if (s.area) {
        if (!prev.area) this.beforeArea = sheet.state;
        // Tryck på kartan: kort remsa, kartan syns. Från listan eller sökningen: mer av området.
        sheet.set(fromMap ? "peek" : "half");
      } else {
        sheet.set(this.beforeArea === "full" ? "full" : "half");
      }
    } else if (s.view !== prev.view) {
      // Kikläget visar vyns svar, så panelen stannar där den är och mäts om.
      sheet.set(sheet.state);
      this.panelEl.querySelector("#panel-scroll")?.scrollTo({ top: 0 });
    }
  }
}
