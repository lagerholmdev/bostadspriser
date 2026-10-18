/**
 * Förklaringar för kartans hörn och panelen. Pris och förändring visas som samma
 * färgramp överallt på sidan: en rad färgrutor med gränserna under.
 */
import {
  BUDGET_COLORS,
  NEAR_MARGIN,
  PRICE_BREAKS,
  PRICE_COLORS,
  changeStepLegend,
} from "../../../lib/scales";
import type { Housing, Period } from "../../../lib/types";
import type { View } from "../../../lib/url";
import { html, type Html } from "../../../lib/html";
import { CHANGE_LABEL, CITY_HOUSE_NOTE } from "./copy";

export interface LegendState {
  view: View;
  housing: Housing;
  period: Period;
}

const sw = (color: string) =>
  html`<span class="swatch" style="${`--c:${color}`}" aria-hidden="true"></span>`;

/** "−0,5" med svenskt minustecken och decimalkomma. */
function tick(v: number): string {
  const s = Math.abs(v).toLocaleString("sv-SE", { maximumFractionDigits: 1 });
  return v < 0 ? `−${s}` : v > 0 ? `+${s}` : "0";
}

/** Färgramp med gränser mellan rutorna. */
function ramp(
  title: string,
  colors: readonly string[],
  ticks: readonly string[],
  label: string,
): Html {
  return html`<div class="ramp" role="img" aria-label="${label}">
    <p class="ml-title" aria-hidden="true">${title}</p>
    <div class="ml-scale" aria-hidden="true">${colors.map((c) => sw(c))}</div>
    <div class="ml-ticks" aria-hidden="true">${ticks.map((t) => html`<span>${t}</span>`)}</div>
  </div>`;
}

function priceRamp(): Html {
  const ticks = PRICE_BREAKS.map((b) => String(b / 1000));
  return ramp(
    "Pris per kvm, tusen kr",
    PRICE_COLORS,
    ticks,
    `Färgskala för pris per kvadratmeter i sex steg, från ljus sand under ${ticks[0]} 000 kronor till mörkt rött över ${ticks[ticks.length - 1]} 000 kronor.`,
  );
}

function changeRamp(period: Period): Html {
  const { colors, ticks } = changeStepLegend(period);
  const strong = ticks[ticks.length - 1];
  const flat = ticks[2];
  const n = (v: number) => v.toLocaleString("sv-SE", { maximumFractionDigits: 1 });
  return ramp(
    `${CHANGE_LABEL[period]}, %`,
    colors,
    ticks.map(tick),
    `${CHANGE_LABEL[period]} i fem steg: blått är ner ${n(strong)} procent eller mer, grått är inom ${n(flat)} procent åt något håll, rost är upp ${n(strong)} procent eller mer.`,
  );
}

/** Hatch- och 3D-raderna. I 3D syns inte ränderna, så deras rad döljs där (styrs med CSS). */
function notes(cls: string, hasMissing: boolean, extra: Html | "" = ""): Html {
  return html`<ul class="${cls}">
    <li class="note-hatch">
      <span class="hatch" aria-hidden="true"></span>Randigt = få affärer, osäkert värde
    </li>
    ${hasMissing ? html`<li class="note-hatch"><span class="hatch hatch-nodata" aria-hidden="true"></span>Ljusgrått = uppgift saknas</li>` : ""}
    ${extra}
    <li class="note-3d">Höjden visar pris per kvm</li>
  </ul>`;
}

/**
 * Panelens förklaring. Pris och förändring visas bara på mobilen (på datorn står kartans
 * förklaring alltid bredvid). Raderna om ränder och 3D syns bara på små skärmar, där kartans
 * förklaring är dold (se map-page.css).
 */
export function legend(s: LegendState, hasMissing = false): Html {
  const main =
    s.view === "budget"
      ? html`<ul class="legend legend-budget" aria-label="Färgernas betydelse">
          <li>${sw(BUDGET_COLORS.ok)}<span>Räcker</span></li>
          <li>
            ${sw(BUDGET_COLORS.near)}<span
              >Nästan, högst ${Math.round(NEAR_MARGIN * 100)} % över</span
            >
          </li>
          <li>${sw(BUDGET_COLORS.no)}<span>Räcker inte</span></li>
        </ul>`
      : html`<div class="legend legend-ramp">
          ${s.view === "pris" ? priceRamp() : changeRamp(s.period)}
        </div>`;
  return html`${main}${notes("legend-notes", hasMissing)}`;
}

/**
 * Kartans förklaring i hörnet. `hasMissing`: visa raden för områden utan värde.
 * Raden om 3D-höjden syns bara när kartan är i 3D (styrs med CSS).
 */
export function mapLegend(s: LegendState, hasMissing = false): Html {
  const main =
    s.view === "pris"
      ? priceRamp()
      : s.view === "forandring"
        ? changeRamp(s.period)
        : html`<p class="ml-title">Räcker budgeten?</p>
            <ul class="ml-items">
              <li>${sw(BUDGET_COLORS.ok)}Räcker</li>
              <li>${sw(BUDGET_COLORS.near)}Nästan</li>
              <li>${sw(BUDGET_COLORS.no)}Räcker inte</li>
            </ul>`;
  const house =
    s.housing === "house"
      ? html`<li class="ml-note-text">${CITY_HOUSE_NOTE.replace(/\.$/, "")}</li>`
      : "";
  return html`${main}${notes("ml-notes", hasMissing, house)}`;
}
