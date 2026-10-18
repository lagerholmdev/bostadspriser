/**
 * Kort sammanfattning av ett område för aktuell vy: används i kartans verktygstips och i
 * remsan under kartan på mobilen.
 */
import { affordableSize, budgetStatus } from "../../../lib/budget";
import { MISSING_TEXT } from "../../../lib/format";
import { getArea, isThin, shownStat } from "../../../lib/data";
import { change, sqm as fmtSqm } from "../../../lib/format";
import type { AppState } from "../../../lib/url";
import { html, type Html } from "../../../lib/html";
import { CHANGE_LABEL, salesText } from "./copy";

export interface Quick {
  name: string;
  value: string;
  meta: string;
}

export function quick(slug: string, s: AppState): Quick | null {
  const a = getArea(slug);
  if (!a) return null;
  const st = shownStat(a, s.housing, s.period);
  const cityHouse = s.housing === "house" && a.houseScope === "city";
  let thin = isThin(st, s.period);
  let sales = st?.sales ?? null;
  let value: string;
  if (s.view === "pris") {
    const why = st?.missing?.pricePerSqm;
    value =
      st?.pricePerSqm == null
        ? why
          ? `Pris saknas, ${MISSING_TEXT[why]}`
          : "Pris saknas"
        : fmtSqm(st.pricePerSqm);
  } else if (s.view === "budget") {
    const p = st?.pricePerSqm ?? null;
    const status = budgetStatus(s.budget, s.sqm, p);
    value =
      p == null || !status
        ? "Pris saknas"
        : `${status === "ok" ? "Räcker" : status === "near" ? "Nästan" : "Räcker inte"}, ca ${Math.floor(affordableSize(s.budget, p))} kvm`;
  } else {
    // Förändringen bygger på de senaste tre månaderna, så antalet affärer gör det också.
    const m3 = shownStat(a, s.housing, "m3");
    sales = m3?.sales ?? null;
    thin = isThin(m3, "m3");
    value =
      st?.change == null
        ? "Förändring saknas"
        : `${change(st.change)} ${CHANGE_LABEL[s.period].replace("Förändring ", "")}`;
  }
  const meta = cityHouse ? `Hela staden, ${salesText(sales, thin)}` : salesText(sales, thin);
  return { name: a.name, value, meta };
}

export function tooltipHtml(slug: string, s: AppState): Html {
  const q = quick(slug, s);
  if (!q) return html``;
  return html`<p class="tt-name">${q.name}</p>
    <p class="tt-value">${q.value}</p>
    <p class="tt-meta">${q.meta}</p>`;
}

/** Remsan överst i mobilens panel när ett område är valt. */
export function peekHtml(slug: string, s: AppState): Html {
  const q = quick(slug, s);
  if (!q) return html``;
  return html`<div class="peek-text">
      <p class="peek-name">${q.name}</p>
      <p class="peek-value">${q.value} <span class="peek-meta">${q.meta}</span></p>
    </div>
    <button type="button" class="btn peek-go" data-action="peek-go">
      Visa mer <span aria-hidden="true">↑</span>
    </button>`;
}
