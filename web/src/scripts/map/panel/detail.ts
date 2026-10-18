/** Områdesdetaljen i panelen: nyckeltal, fakta och vägar vidare. */
import { budgetStatus, estimatedCost, affordableSize } from "../../../lib/budget";
import {
  KIND_LABEL,
  countyStat,
  isThin,
  placeInCounty,
  shownStat,
  similarNeighbours,
} from "../../../lib/data";
import { MISSING_TEXT, change, mkr, money, number, relative } from "../../../lib/format";
import { changeSentence, rankPhrase } from "../../../lib/text";
import type { Area, MissingReason, Period, Stat } from "../../../lib/types";
import type { AppState } from "../../../lib/url";
import { html, type Html } from "../../../lib/html";
import {
  CHANGE_LABEL,
  CITY_HOUSE_NOTE,
  COMPARED_TO,
  HOUSING_MANY,
  months,
  PERIOD_SHORT,
} from "./text";

type Field = "sales" | "pricePerSqm" | "meanPrice" | "change";

function missingText(s: Stat | null, field: Field): string {
  const reason: MissingReason | undefined = s?.missing?.[field];
  return reason ? `Saknas, ${MISSING_TEXT[reason]}` : "Saknas";
}

function fact(label: string, value: Html | string, note?: Html | string): Html {
  return html`<div class="fact">
    <dt>${label}</dt>
    <dd>${value}${note ? html`<span class="fact-note">${note}</span>` : ""}</dd>
  </div>`;
}

export interface DetailOptions {
  base: string;
  inCompare: boolean;
  compareFull: boolean;
}

export function detail(area: Area, s: AppState, opts: DetailOptions): Html {
  const { housing, period } = s;
  const st = shownStat(area, housing, period);
  const value = st?.pricePerSqm ?? null;
  const thin = isThin(st, period);
  const county = countyStat(housing, period).pricePerSqm;
  const cityHouse = housing === "house" && area.houseScope === "city";
  const ratio = value != null && county ? value / county - 1 : null;
  const rank = placeInCounty(area, housing, period);
  const stOf = (p: Period) => (p === period ? st : shownStat(area, housing, p));
  const changeOf = (p: Period) => stOf(p)?.change ?? null;
  const changeFact = (p: Period) => {
    const v = changeOf(p);
    return fact(
      CHANGE_LABEL[p],
      v == null ? missingText(stOf(p), "change") : change(v),
      COMPARED_TO[p],
    );
  };
  const sentence = changeSentence(changeOf("m12"), changeOf("m3"));

  const neighbours = similarNeighbours(area, 4, housing, period)
    .filter((n) => shownStat(n, housing, period)?.pricePerSqm != null)
    .slice(0, 3);
  const href = `${opts.base}omrade/${area.slug}/`;

  return html` <button type="button" class="back" data-action="back">
      <span aria-hidden="true">←</span> Tillbaka till listan
    </button>
    <article class="detail" aria-labelledby="detail-title">
      <p class="eyebrow">${KIND_LABEL[area.kind]}</p>
      <h2 id="detail-title" tabindex="-1">${area.name}</h2>
      <p class="kpi-context">
        ${capitalize(HOUSING_MANY[housing])}, ${PERIOD_SHORT[period].toLowerCase()}
        (${months(period)})
      </p>
      ${
        value == null
          ? html`<p class="kpi kpi-missing">Pris saknas</p>
              <p class="kpi-sentence">${missingText(st, "pricePerSqm")}.</p>`
          : html`<p class="kpi${thin ? " is-thin" : ""}">
                <span class="kpi-num">${number(value)}</span> <span class="kpi-unit">kr/kvm</span>
              </p>
              <p class="kpi-sentence">
                ${capitalize(relative(ratio))} länets snitt på ${number(county)} kr/kvm.
              </p>`
      }
      ${
        thin && st?.sales != null && value != null
          ? html`<p class="thin-note">
              Bygger på bara ${number(st.sales)} affärer, så värdet är osäkert.
            </p>`
          : ""
      }
      ${sentence ? html`<p class="change-sentence">${sentence}</p>` : ""}
      ${cityHouse ? html`<p class="thin-note">${CITY_HOUSE_NOTE} Siffrorna gäller staden, inte ${area.name}.</p>` : ""}
      ${s.view === "budget" && value != null ? budgetBox(value, s) : ""}
      <dl class="facts">
        ${fact("Medelpris per bostad", st?.meanPrice == null ? missingText(st, "meanPrice") : money(st.meanPrice))}
        ${fact(
          "Antal sålda",
          st?.sales == null ? missingText(st, "sales") : number(st.sales),
          thin && st?.sales != null ? "få affärer" : undefined,
        )}
        ${changeFact("m12")} ${changeFact("m3")}
        ${fact(
          "Plats i länet",
          rank ? capitalize(rankPhrase(rank.rank, rank.total)) : "Saknas",
          cityHouse ? "för hela Stockholms stad" : undefined,
        )}
      </dl>
      <div class="actions">
        <a class="btn btn-primary" href="${href}">Läs mer om ${area.name}</a>
        <button
          type="button"
          class="${`btn${opts.inCompare ? " is-on" : ""}`}"
          data-action="compare"
          data-slug="${area.slug}"
        >
          ${opts.inCompare ? "Ta bort ur jämförelsen" : "Lägg till i jämförelsen"}
        </button>
        <button type="button" class="btn btn-quiet-plain" data-action="copy-link">
          Kopiera länk
        </button>
      </div>
      <p class="copy-status" id="copy-status" role="status" aria-live="polite"></p>
      ${
        neighbours.length
          ? html`<div class="neighbours">
              <h3 class="group-title">Grannar med liknande pris</h3>
              <ul class="chips-plain">
                ${neighbours.map((n) => {
                  const v = shownStat(n, housing, period)?.pricePerSqm;
                  return html`<li>
                    <button type="button" class="link-btn" data-slug="${n.slug}">${n.name}</button>
                    <span class="muted">${number(v)} kr/kvm</span>
                  </li>`;
                })}
              </ul>
            </div>`
          : ""
      }
    </article>`;
}

function budgetBox(value: number, s: AppState): Html {
  const status = budgetStatus(s.budget, s.sqm, value) ?? "no";
  const size = Math.floor(affordableSize(s.budget, value));
  const label =
    status === "ok"
      ? "Budgeten räcker"
      : status === "near"
        ? "Budgeten räcker nästan"
        : "Budgeten räcker inte";
  return html`<div class="${`budget-box is-${status}`}">
    <p class="budget-box-status">${label}</p>
    <p>Din budget på ${mkr(s.budget)} räcker till ca <strong>${size} kvm</strong> här.</p>
    <p>${s.sqm} kvm kostar runt <strong>${money(estimatedCost(value, s.sqm))}</strong>.</p>
  </div>`;
}

function capitalize(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}
