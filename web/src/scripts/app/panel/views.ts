/**
 * Innehållet i de tre vyerna. Rena renderfunktioner: samma kod ger HTML vid bygget och i webbläsaren.
 */
import { NEAR_MARGIN } from "../../../lib/budget";
import { change, changeWord, mkr, money, number, sqm as fmtSqm } from "../../../lib/format";
import { BUDGET_COLORS, changeColor, priceColor } from "../../../lib/scales";
import type { Housing, Period } from "../../../lib/types";
import { html, type Html } from "../html";
import {
  type BudgetEntry,
  type BudgetModel,
  type ChangeModel,
  type Entry,
  type PriceModel,
} from "../model";
import { CITY_HOUSE_NOTE, COMPARED_TO, HOUSING_MANY, months, PERIOD_PHRASE, salesText, thinExplainer } from "./text";

/** En klickbar rad. Raden för Stockholms stad (villor) har inget eget område och är inte klickbar. */
function row(e: Entry, inner: Html, extraClass = ""): Html {
  const cls = `row${extraClass ? ` ${extraClass}` : ""}${e.thin ? " is-thin" : ""}`;
  if (!e.slug) {
    return html`<li><div class="${`${cls} is-static`}">${inner}</div></li>`;
  }
  return html`<li><button type="button" class="${cls}" data-slug="${e.slug}">${inner}</button></li>`;
}

function strong(s: string): Html {
  return html`<strong>${s}</strong>`;
}

/* ---------- Pris per kvm ---------- */

export function priceSummary(m: PriceModel, housing: Housing, period: Period): Html {
  if (m.county == null || !m.dearest || !m.cheapest) {
    return html`<p class="summary">Det finns inga priser för ${HOUSING_MANY[housing]} ${PERIOD_PHRASE[period]}.</p>`;
  }
  return html`<p class="summary">
    ${housing === "house" ? "En villa" : "En bostadsrätt"} i Stockholms län kostade i snitt
    ${strong(fmtSqm(m.county))} ${PERIOD_PHRASE[period]} (${months(period)}). Dyrast är ${m.dearest.name}, billigast
    ${m.cheapest.name}.
  </p>`;
}

export function priceList(m: PriceModel, housing: Housing, period: Period): Html {
  const items = m.rows.map((e) => {
    const v = e.stat.pricePerSqm;
    const w = v == null ? 0 : Math.max(2, Math.round((v / m.max) * 100));
    return row(
      e,
      html`<span class="row-name">${e.name}</span>
        <span class="row-value">${v == null ? "saknas" : number(v)}${v == null ? "" : html` <small>kr/kvm</small>`}</span>
        <span class="row-bar" aria-hidden="true"><span style="${`--w:${w}%;--c:${priceColor(v)}`}"></span></span>
        <span class="row-meta">${e.slug ? salesText(e.stat.sales, e.thin) : `Hela staden, ${salesText(e.stat.sales, e.thin)}`}</span>`,
    );
  });
  return html`<ol class="rows" aria-label="${`Alla områden, pris per kvm för ${HOUSING_MANY[housing]}`}">${items}</ol>
    ${housing === "house" ? html`<p class="note">${CITY_HOUSE_NOTE} Därför står staden som en rad.</p>` : ""}
    <p class="note">${thinExplainer(period)}</p>`;
}

/* ---------- Var har jag råd? ---------- */

export function budgetMax(m: BudgetModel): Html {
  return html`Det motsvarar högst ${strong(fmtSqm(Math.floor(m.maxPerSqm / 100) * 100))}.`;
}

export function budgetHeadline(m: BudgetModel, budget: number, sqm: number): string {
  const n = m.ok.length;
  if (n === 0) return `${mkr(budget)} räcker inte till ${sqm} kvm i något område`;
  if (n === m.total) return `${mkr(budget)} räcker till ${sqm} kvm i alla ${m.total} områden`;
  return `${mkr(budget)} räcker till ${sqm} kvm i ${n} av ${m.total} områden`;
}

function budgetRow(e: BudgetEntry, sqm: number): Html {
  const size = Math.floor(e.size);
  const second =
    e.status === "ok"
      ? `${number(e.stat.pricePerSqm)} kr/kvm, ${salesText(e.stat.sales, e.thin)}`
      : `${sqm} kvm kostar runt ${money(e.cost)}, ${salesText(e.stat.sales, e.thin)}`;
  return row(
    e,
    html`<span class="row-name"><span class="swatch" style="${`--c:${BUDGET_COLORS[e.status]}`}" aria-hidden="true"></span>${e.name}</span>
      <span class="row-value">ca ${size} kvm</span>
      <span class="row-meta">${second}</span>
      <span class="row-meta row-meta-end">för pengarna</span>`,
    "row-budget",
  );
}

export function budgetResults(m: BudgetModel, budget: number, sqm: number, housing: Housing): Html {
  const pct = Math.round(NEAR_MARGIN * 100);
  const empty =
    m.ok.length === 0 && m.cheapest
      ? html`<div class="callout">
          <p>Inget område har så låga snittpriser. Prova en mindre bostad eller en högre budget.</p>
          <p>Billigast är ${m.cheapest.name}, där ${mkr(budget)} räcker till ca ${Math.floor(m.cheapest.size)} kvm.</p>
        </div>`
      : "";
  return html`
    ${empty}
    ${m.ok.length
      ? html`<section class="group" aria-labelledby="g-ok">
          <h3 class="group-title" id="g-ok"><span class="swatch" style="${`--c:${BUDGET_COLORS.ok}`}" aria-hidden="true"></span>Räcker <span class="count">${m.ok.length}</span></h3>
          <ul class="rows">${m.ok.map((e) => budgetRow(e, sqm))}</ul>
        </section>`
      : ""}
    ${m.near.length
      ? html`<section class="group" aria-labelledby="g-near">
          <h3 class="group-title" id="g-near"><span class="swatch" style="${`--c:${BUDGET_COLORS.near}`}" aria-hidden="true"></span>Nästan <span class="group-sub">(högst ${pct} % över)</span> <span class="count">${m.near.length}</span></h3>
          <ul class="rows">${m.near.map((e) => budgetRow(e, sqm))}</ul>
        </section>`
      : ""}
    ${m.no.length
      ? html`<details class="group group-more">
          <summary class="group-title"><span class="swatch" style="${`--c:${BUDGET_COLORS.no}`}" aria-hidden="true"></span>Räcker inte <span class="count">${m.no.length}</span><span class="summary-hint">Visa</span></summary>
          <ul class="rows">${m.no.map((e) => budgetRow(e, sqm))}</ul>
        </details>`
      : ""}
    ${m.missing.length ? html`<p class="note">Pris saknas för ${m.missing.map((e) => e.name).join(", ")}.</p>` : ""}
    ${housing === "house" ? html`<p class="note">${CITY_HOUSE_NOTE} Staden räknas därför som ett område.</p>` : ""}
    <p class="note">Räknat på snittpriser. Enskilda bostäder varierar, och avgift, skick och läge påverkar priset.</p>`;
}

/* ---------- Förändring ---------- */

export function changeSummary(m: ChangeModel, housing: Housing, period: Period): Html {
  if (m.county == null) {
    return html`<p class="summary">Förändringen för länet saknas ${PERIOD_PHRASE[period]}.</p>`;
  }
  const dir = changeWord(m.county);
  const what = HOUSING_MANY[housing];
  const lead =
    dir === "oförändrat"
      ? html`Priset på ${what} i länet är i stort sett ${strong("oförändrat")} ${COMPARED_TO[period]}.`
      : html`Priset på ${what} i länet har gått ${dir} ${strong(change(m.county))} ${COMPARED_TO[period]}.`;
  return html`<p class="summary">${lead} ${m.countUp} områden har gått upp och ${m.countDown} ner.</p>`;
}

function changeRow(e: Entry): Html {
  const v = e.stat.change;
  const dir = changeWord(v);
  return row(
    e,
    html`<span class="row-name"><span class="swatch" style="${`--c:${changeColor(v)}`}" aria-hidden="true"></span>${e.name}</span>
      <span class="${`row-value is-${dir === "upp" ? "up" : dir === "ner" ? "down" : "flat"}`}">${change(v)}</span>
      <span class="row-meta">${e.slug ? salesText(e.stat.sales, e.thin) : `Hela staden, ${salesText(e.stat.sales, e.thin)}`}</span>`,
    "row-change",
  );
}

export function changeLists(m: ChangeModel, housing: Housing, period: Period): Html {
  return html`
    <section class="group" aria-labelledby="g-up">
      <h3 class="group-title" id="g-up">Ökat mest</h3>
      ${m.up.length ? html`<ol class="rows">${m.up.map(changeRow)}</ol>` : html`<p class="note">Inget område har gått upp.</p>`}
    </section>
    <section class="group" aria-labelledby="g-down">
      <h3 class="group-title" id="g-down">Minskat mest</h3>
      ${m.down.length ? html`<ol class="rows">${m.down.map(changeRow)}</ol>` : html`<p class="note">Inget område har gått ner.</p>`}
    </section>
    <details class="group group-more">
      <summary class="group-title">Alla områden <span class="count">${m.all.length}</span><span class="summary-hint">Visa</span></summary>
      <ol class="rows">${m.all.map(changeRow)}</ol>
    </details>
    ${m.missing.length
      ? html`<p class="note">Förändring saknas för ${m.missing.map((e) => e.name).join(", ")}, för få affärer.</p>`
      : ""}
    ${housing === "house" ? html`<p class="note">${CITY_HOUSE_NOTE}</p>` : ""}
    <p class="note">Små områden svänger mer av en slump, eftersom några få affärer kan flytta snittet. ${thinExplainer(period)}</p>`;
}

