/**
 * Kartsidans start. Panelen kopplas in direkt; kartan (MapLibre, det tunga) laddas för sig
 * och ansluts när den är klar. Går kartan inte att visa fungerar listan ändå.
 */
import { bySlug } from "../../lib/data";
import { compareUrl } from "../../lib/links";
import { appStateHref, parseAppState, type AppState } from "../../lib/url";
import { trackViewOnce } from "./analytics";
import { fetchBaseStyle } from "./mapstyle";
import { mapPaint } from "./model";
import { PanelController } from "./panel/controller";
import { tooltipHtml } from "./panel/quick";
import { initSearch } from "./search";
import { initShare } from "./share";
import { Store } from "./state";

const isKnown = (slug: string) => bySlug.has(slug);
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T | null;

function start(): void {
  const app = $("app");
  const panelEl = $("panel");
  if (!app || !panelEl) return;
  const base = app.dataset.base ?? "/";

  const parsed = parseAppState(location.search, isKnown);

  // Äldre länk till en jämförelse (?jamfor=a,b): jämförelsen har nu en egen sida.
  if (parsed.compare.length) {
    location.replace(compareUrl(parsed.compare));
    return;
  }

  const store = new Store(parsed.state, isKnown);
  if (parsed.legacy) {
    try {
      history.replaceState(
        history.state,
        "",
        appStateHref(parsed.state, location.pathname) + location.hash,
      );
    } catch {
      /* ok */
    }
  }

  const panel = new PanelController(panelEl, store, { base });
  panel.start();

  const input = $<HTMLInputElement>("area-search");
  const listbox = $<HTMLUListElement>("area-search-list");
  const searchStatus = $("area-search-status");
  if (input && listbox && searchStatus) {
    initSearch({ input, listbox, status: searchStatus }, (slug) =>
      panel.selectArea(slug, { focus: true }),
    );
  }

  const shareBtn = $<HTMLButtonElement>("share");
  const shareStatus = $("share-status");
  const shareFallback = $("share-fallback");
  const shareInput = $<HTMLInputElement>("share-url");
  if (shareBtn && shareStatus && shareFallback && shareInput) {
    const sharer = initShare(
      { button: shareBtn, status: shareStatus, fallback: shareFallback, fallbackInput: shareInput },
      () => store.flush(),
    );
    panel.copyLink = (status) => void sharer.copyLink(status);
  }

  trackViewOnce(store.state.view);
  store.subscribe((s, prev) => {
    if (s.view !== prev.view) trackViewOnce(s.view);
  });

  startMap(store, panel);
}

function paintKey(s: AppState): string {
  return [s.view, s.housing, s.period, s.view === "budget" ? `${s.budget}/${s.sqm}` : ""].join("|");
}

function startMap(store: Store, panel: PanelController): void {
  const wrap = $("map-wrap");
  const canvas = $("map");
  const labels = $("map-labels");
  const tooltip = $("map-tooltip");
  const message = $("map-message");
  if (!wrap || !canvas || !labels || !tooltip) return;

  const baseStyle = fetchBaseStyle();
  const initial = store.state;

  import("./map")
    .then(({ AreaMap }) =>
      AreaMap.create({
        wrap,
        canvas,
        labels,
        tooltip,
        paint: mapPaint(initial),
        selected: initial.area,
        baseStyle,
        tooltipContent: (slug) => tooltipHtml(slug, store.state),
        onSelect: (slug) => {
          if (slug) {
            panel.selectArea(slug, { focus: false });
            if (window.matchMedia("(min-width: 960px)").matches) panel.revealDetailQuietly();
          } else if (store.state.area) {
            panel.selectArea(null);
          }
        },
      }),
    )
    .then((map) => {
      wrap.classList.add("is-ready");
      let painted = paintKey(initial);
      let selected = initial.area;
      const sync = (s: AppState) => {
        const key = paintKey(s);
        if (key !== painted) {
          painted = key;
          map.setPaint(mapPaint(s));
        }
        if (s.area !== selected) {
          selected = s.area;
          map.setSelected(s.area, true);
        }
      };
      sync(store.state); // läget kan ha ändrats medan kartan laddades
      store.subscribe((s) => sync(s));
    })
    .catch((err: unknown) => {
      console.warn("Kartan kunde inte visas:", err);
      wrap.classList.add("is-failed");
      if (message) {
        message.hidden = false;
        message.textContent =
          "Kartan kunde inte visas i den här webbläsaren. Alla siffror finns i listan.";
      }
    });
}

start();
