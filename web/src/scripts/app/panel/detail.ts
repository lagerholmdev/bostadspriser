/** Områdesdetaljen i panelen: nyckeltal, fakta och vägar vidare. */
import { budgetStatus, estimatedCost, affordableSize } from "../../../lib/budget";
import { countyStat, isThin, similarNeighbours, stat } from "../../../lib/data";
import { MISSING_TEXT, change, inArea, mkr, money, number, ordinal, relative } from "../../../lib/format";
import type { Area, MissingReason, Period, Stat } from "../../../lib/types";
import type { AppState } from "../../../lib/url";
import { html, attr, type Html } from "../html";
import { rankOf } from "../model";
import { CITY_HOUSE_NOTE, COMPARED_TO, HOUSING_MANY, months, PERIOD_SHORT } from "./text";

export const KIND_LABEL = {
  district: "Stadsdelsområde i Stockholms stad",
  municipality: "Kommun i Stockholms län",
} as const;

type Field = "sales" | "pricePerSqm" | "meanPrice" | "change";

function missingText(s: Stat | null, field: Field): string {
  const reason: MissingReason | undefined = s?.missing?.[field];
  return reason ? `Saknas, ${MISSING_TEXT[reason]}` : "Saknas";
}

function fact(label: string, value: Html | string, note?: Html | string): Html {
  return html`<div class="fact"><dt>${label}</dt><dd>${value}${note ? html`<span class="fact-note">${note}</span>` : ""}</dd></div>`;
}

export interface DetailOptions {
  base: string;
  inCompare: boolean;
  compareFull: boolean;
}

export function detail(area: Area, s: AppState, opts: DetailOptions): Html {
  const { housing, period } = s;
  const st = stat(area, housing, period);
  const value = st?.pricePerSqm ?? null;
  const thin = isThin(st, period);
  const county = countyStat(housing, period).pricePerSqm;
  const cityHouse = housing === "house" && area.houseScope === "city";
  const ratio = value != null && county ? value / county - 1 : null;
  const rank = rankOf(area, housing, period);
  const other: Period = period === "m3" ? "m12" : "m3";
  const changeNow = st?.change ?? null;
  const changeOther = stat(area, housing, other)?.change ?? null;
  const changeFact = (p: Period, v: number | null) =>
    fact(
      `Förändring, ${PERIOD_SHORT[p].toLowerCase()}`,
      v == null ? missingText(stat(area, housing, p), "change") : change(v),
      COMPARED_TO[p],
    );

  const neighbours = similarNeighbours(area, 3, housing, period);
  const href = `${opts.base}omrade/${area.slug}/`;

  return html`
    <button type="button" class="back" data-action="back"><span aria-hidden="true">←</span> Tillbaka till listan</button>
    <article class="detail" aria-labelledby="detail-title">
      <p class="eyebrow">${KIND_LABEL[area.kind]}</p>
      <h2 id="detail-title" tabindex="-1">${area.name}</h2>
      <p class="kpi-context">${capitalize(HOUSING_MANY[housing])}, ${PERIOD_SHORT[period].toLowerCase()} (${months(period)})</p>
      ${value == null
        ? html`<p class="kpi kpi-missing">Pris saknas</p><p class="kpi-sentence">${missingText(st, "pricePerSqm")}.</p>`
        : html`<p class="kpi${thin ? " is-thin" : ""}"><span class="kpi-num">${number(value)}</span> <span class="kpi-unit">kr/kvm</span></p>
            <p class="kpi-sentence">${capitalize(relative(ratio))} länets snitt på ${number(county)} kr/kvm.</p>`}
      ${thin && st?.sales != null
        ? html`<p class="thin-note">Bygger på bara ${number(st.sales)} affärer, så värdet är osäkert.</p>`
        : ""}
      ${cityHouse ? html`<p class="thin-note">${CITY_HOUSE_NOTE} Siffrorna gäller staden, inte ${area.name}.</p>` : ""}
      ${s.view === "budget" && value != null ? budgetBox(value, s) : ""}
      <dl class="facts">
        ${fact("Medelpris per bostad", st?.meanPrice == null ? missingText(st, "meanPrice") : money(st.meanPrice))}
        ${fact(
          "Antal sålda",
          st?.sales == null ? missingText(st, "sales") : number(st.sales),
          thin && st?.sales != null ? "få affärer" : undefined,
        )}
        ${changeFact(period, changeNow)}
        ${changeFact(other, changeOther)}
        ${fact(
          "Plats i länet",
          rank ? `${rank.rank === 1 ? "Dyrast" : `${ordinal(rank.rank)} dyrast`} av ${rank.total}` : "Saknas",
          cityHouse ? "för hela Stockholms stad" : undefined,
        )}
      </dl>
      <div class="actions">
        <a class="btn btn-primary" href="${href}">Läs mer om ${area.name}</a>
        <button type="button" class="btn" data-action="compare" data-slug="${area.slug}"${attr("aria-pressed", opts.inCompare ? "true" : "false")}>
          ${opts.inCompare ? "Ta bort ur jämförelsen" : "Lägg till i jämförelsen"}
        </button>
      </div>
      ${neighbours.length
        ? html`<div class="neighbours">
            <h3 class="group-title">Grannar med liknande pris</h3>
            <ul class="chips-plain">
              ${neighbours.map((n) => {
                const v = stat(n, housing, period)?.pricePerSqm;
                return html`<li><button type="button" class="link-btn" data-slug="${n.slug}">${n.name}</button> <span class="muted">${number(v)} kr/kvm</span></li>`;
              })}
            </ul>
          </div>`
        : ""}
      <p class="note">Läs mer om priserna ${inArea(area.slug, area.name)}, prisutvecklingen och grannområdena på områdessidan.</p>
    </article>`;
}

function budgetBox(value: number, s: AppState): Html {
  const status = budgetStatus(s.budget, s.sqm, value)!;
  const size = Math.floor(affordableSize(s.budget, value));
  const label = status === "ok" ? "Budgeten räcker" : status === "near" ? "Budgeten räcker nästan" : "Budgeten räcker inte";
  return html`<div class="${`budget-box is-${status}`}">
    <p class="budget-box-status">${label}</p>
    <p>Din budget på ${mkr(s.budget)} räcker till ca <strong>${size} kvm</strong> här.</p>
    <p>${s.sqm} kvm kostar runt <strong>${money(estimatedCost(value, s.sqm))}</strong>.</p>
  </div>`;
}

function capitalize(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}
