/**
 * Sidans läge. En enda källa (AppState) som speglas i adressen:
 * - val av område och byte av vy läggs till i historiken (pushState), så att Bakåt går tillbaka,
 * - reglage och filter skriver över nuvarande adress (replaceState, lite fördröjt),
 * - Bakåt/Framåt (popstate) läser in adressen igen.
 */
import { appStateHref, parseAppState, sameState, type AppState } from "../../lib/url";

export type HistoryMode = "push" | "replace" | "none";
export type Listener = (state: AppState, prev: AppState, mode: HistoryMode) => void;

const REPLACE_DELAY = 250;

export class Store {
  private current: AppState;
  private listeners: Listener[] = [];
  private pending: number | undefined;

  constructor(
    initial: AppState,
    private readonly isKnown: (slug: string) => boolean,
  ) {
    this.current = initial;
    window.addEventListener("popstate", () => {
      const next = parseAppState(location.search, this.isKnown).state;
      this.commit(next, "none");
    });
  }

  get state(): AppState {
    return this.current;
  }

  subscribe(fn: Listener): void {
    this.listeners.push(fn);
  }

  set(patch: Partial<AppState>, mode: HistoryMode = "replace"): void {
    this.commit({ ...this.current, ...patch }, mode);
  }

  /** Ersätt hela läget (t.ex. efter withView/withHousing i lib/url). */
  replace(next: AppState, mode: HistoryMode = "replace"): void {
    this.commit(next, mode);
  }

  private commit(next: AppState, mode: HistoryMode): void {
    const prev = this.current;
    if (sameState(prev, next)) return;
    this.current = next;
    this.writeUrl(mode);
    for (const fn of this.listeners) fn(next, prev, mode);
  }

  private writeUrl(mode: HistoryMode): void {
    if (mode === "none") return;
    const href = () => appStateHref(this.current, location.pathname) + location.hash;
    window.clearTimeout(this.pending);
    this.pending = undefined;
    try {
      if (mode === "push") {
        history.pushState({ prislandskap: true }, "", href());
      } else {
        // Safari stryper täta replaceState-anrop; reglagen kan ge många per sekund.
        this.pending = window.setTimeout(() => {
          this.pending = undefined;
          history.replaceState(history.state, "", href());
        }, REPLACE_DELAY);
      }
    } catch {
      /* t.ex. sandlådad iframe: sidan fungerar ändå, bara adressen följer inte med */
    }
  }

  /** Skriv ut en väntande adressändring direkt (före delning). */
  flush(): void {
    if (this.pending === undefined) return;
    window.clearTimeout(this.pending);
    this.pending = undefined;
    try {
      history.replaceState(history.state, "", appStateHref(this.current, location.pathname) + location.hash);
    } catch {
      /* se ovan */
    }
  }
}
