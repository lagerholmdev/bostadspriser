/** Förklaringar (färgrutor med text) för panelen och kartans hörn. */
import { BUDGET_COLORS, CHANGE_MAX, PRICE_BREAKS, PRICE_COLORS, changeColor, priceLegend } from "../../../lib/scales";
import { NEAR_MARGIN } from "../../../lib/budget";
import type { View } from "../../../lib/url";
import { html, type Html } from "../../../lib/html";

const sw = (color: string) => html`<span class="swatch" style="${`--c:${color}`}" aria-hidden="true"></span>`;

/** Panelens förklaring: alla klasser med text. */
export function legend(view: View): Html {
  if (view === "pris") {
    return html`<ul class="legend legend-price" aria-label="Färgernas betydelse, kr per kvm">
      ${priceLegend().map((c) => html`<li>${sw(c.color)}<span>${c.label}</span></li>`)}
    </ul>`;
  }
  if (view === "budget") {
    return html`<ul class="legend legend-budget" aria-label="Färgernas betydelse">
      <li>${sw(BUDGET_COLORS.ok)}<span>Räcker</span></li>
      <li>${sw(BUDGET_COLORS.near)}<span>Nästan, högst ${Math.round(NEAR_MARGIN * 100)} % över</span></li>
      <li>${sw(BUDGET_COLORS.no)}<span>Räcker inte</span></li>
    </ul>`;
  }
  const steps = [-CHANGE_MAX, -CHANGE_MAX / 2, 0, CHANGE_MAX / 2, CHANGE_MAX];
  return html`<div class="legend legend-change" role="img" aria-label="${`Färgskala från minus ${CHANGE_MAX} procent (blå) via oförändrat (grå) till plus ${CHANGE_MAX} procent (rost)`}">
    <span class="legend-steps" aria-hidden="true">${steps.map((v) => sw(changeColor(v)))}</span>
    <span class="legend-ticks" aria-hidden="true"><span>−${CHANGE_MAX} %</span><span>0</span><span>+${CHANGE_MAX} %</span></span>
  </div>`;
}

/** Kartans kompakta förklaring i hörnet. */
export function mapLegend(view: View): Html {
  if (view === "pris") {
    return html`<p class="ml-title">Pris per kvm, tusen kr</p>
      <div class="ml-scale" aria-hidden="true">${PRICE_COLORS.map((c) => sw(c))}</div>
      <div class="ml-ticks" aria-hidden="true">${PRICE_BREAKS.map((b) => html`<span>${b / 1000}</span>`)}</div>`;
  }
  if (view === "budget") {
    return html`<p class="ml-title">Räcker budgeten?</p>
      <ul class="ml-items">
        <li>${sw(BUDGET_COLORS.ok)}Ja</li>
        <li>${sw(BUDGET_COLORS.near)}Nästan</li>
        <li>${sw(BUDGET_COLORS.no)}Nej</li>
      </ul>`;
  }
  const steps = [-CHANGE_MAX, -CHANGE_MAX / 2, 0, CHANGE_MAX / 2, CHANGE_MAX];
  return html`<p class="ml-title">Förändring</p>
    <div class="ml-scale" aria-hidden="true">${steps.map((v) => sw(changeColor(v)))}</div>
    <div class="ml-ticks ml-ticks-ends" aria-hidden="true"><span>−${CHANGE_MAX} %</span><span>0</span><span>+${CHANGE_MAX} %</span></div>`;
}
