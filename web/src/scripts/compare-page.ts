/**
 * Jämförelsesidan: väljer upp till tre områden och ritar tabellen från det
 * inbyggda datasetet. Läget ligger i adressen (?omraden=a,b,c) och uppdateras
 * med replaceState, så att länken alltid går att dela.
 */
import { affordableSize } from "../lib/budget";
import {
  areasFor,
  bySlug,
  countyRatio,
  dataset,
  isThin,
  KIND_SHORT,
  parseCompareParams,
  similarNeighbours,
  shownStat,
  stat,
} from "../lib/data";
import {
  change,
  changeDirection,
  changeWord,
  MISSING_TEXT,
  money,
  number,
  pricier,
  relative,
} from "../lib/format";
import { html, type Html } from "../lib/html";
import { areaUrl, compareUrl } from "../lib/links";
import { priceColor } from "../lib/scales";
import { joinNames } from "../lib/text";
import type { Area, MissingReason, Stat } from "../lib/types";

const MAX = 3;
const BUDGET = 5_000_000;
const SITE = "Stockholms prislandskap";

function missing(reason: MissingReason | undefined): Html {
  return html`<span class="chg chg-none"
    ><span aria-hidden="true">–</span
    ><span class="miss">${reason ? MISSING_TEXT[reason] : "saknas"}</span></span
  >`;
}

function changeHtml(s: Stat | null | undefined): Html {
  const v = s?.change;
  const dir = changeDirection(v);
  if (!dir) return missing(s?.missing?.change);
  return html`<span class="chg chg-${dir}"
    >${change(v)}<span class="chg-word">${changeWord(v)}</span></span
  >`;
}

/** "116 680 kr/kvm" med enheten i ett eget element, så att den kan brytas snyggt på mobil. */
function sqmHtml(v: number): Html {
  return html`${number(v)}<span class="unit">&nbsp;kr/kvm</span>`;
}

/** "Stadsdelsområde" med mjukt bindestreck, så att ordet bryts rätt i smala kolumner. */
const kindLabel = (a: Area) => KIND_SHORT[a.kind].replace("Stadsdels", "Stadsdels\u00ad");

const names = (list: readonly Area[]) => joinNames(list.map((a) => a.name));

interface Row {
  label: string;
  cell: (a: Area, i: number) => Html;
}

function rows(list: readonly Area[]): Row[] {
  const first = list[0];
  if (!first) return [];
  const p3 = (a: Area) => stat(a, "apartment", "m3");
  const firstPrice = p3(first)?.pricePerSqm ?? null;
  const thin = (a: Area) => isThin(p3(a), "m3");
  // Villor finns bara för hela Stockholms stad: visa siffran en gång, vid första stadsdelen.
  const firstCity = list.find((a) => a.houseScope === "city");
  return [
    {
      label: "Pris per kvm, 3 mån",
      cell: (a) => {
        const s = p3(a);
        if (s?.pricePerSqm == null) return missing(s?.missing?.pricePerSqm);
        return html`<span class="${thin(a) ? "val-main thin-value" : "val-main"}"
          ><span class="swatch" style="${`background:${priceColor(s.pricePerSqm)}`}"></span
          >${sqmHtml(s.pricePerSqm)}</span
        >`;
      },
    },
    {
      label: "Mot länets snitt",
      cell: (a) => {
        const r = countyRatio(p3(a)?.pricePerSqm);
        return r == null ? missing(undefined) : html`${relative(r)}`;
      },
    },
    {
      label: `Mot ${first.name}`,
      cell: (a, i) => {
        if (i === 0)
          return html`<span class="ref" aria-hidden="true">–</span
            ><span class="visually-hidden">jämförs med</span>`;
        const p = p3(a)?.pricePerSqm;
        return p == null || !firstPrice ? missing(undefined) : html`${pricier(p / firstPrice - 1)}`;
      },
    },
    { label: "Förändring, 3 mån", cell: (a) => changeHtml(p3(a)) },
    { label: "Förändring, 12 mån", cell: (a) => changeHtml(stat(a, "apartment", "m12")) },
    {
      label: "Sålda bostadsrätter, 3 mån",
      cell: (a) => {
        const s = p3(a);
        if (s?.sales == null) return missing(s?.missing?.sales);
        return html`${number(s.sales)}${thin(a) && html` <span class="thin-tag">få affärer</span>`}`;
      },
    },
    {
      label: "Medelpris, 3 mån",
      cell: (a) => {
        const s = p3(a);
        return s?.meanPrice == null ? missing(s?.missing?.meanPrice) : html`${money(s.meanPrice)}`;
      },
    },
    {
      label: "Villor, pris per kvm",
      cell: (a) => {
        if (a.houseScope === "city" && firstCity && firstCity.slug !== a.slug) {
          return html`<span class="ref">Samma som ${firstCity.name}</span>`;
        }
        const s = shownStat(a, "house", "m3");
        if (!s) return missing("0");
        if (s.pricePerSqm == null) return missing(s.missing?.pricePerSqm);
        return html`${sqmHtml(s.pricePerSqm)}${a.houseScope === "city" && html`<span class="cell-sub">Hela Stockholms stad</span>`}`;
      },
    },
    {
      label: "5 mkr räcker till",
      cell: (a) => {
        const p = p3(a)?.pricePerSqm;
        return p == null
          ? missing(undefined)
          : html`ca ${number(Math.round(affordableSize(BUDGET, p)))}&nbsp;kvm`;
      },
    },
  ];
}

function tableHtml(list: readonly Area[]): Html {
  return html`<div class="table-clip">
    <table class="data-table" style="${`--n:${list.length}`}">
      <caption class="visually-hidden">
        Jämförelse av ${names(list)}. Bostadsrätter om inget annat anges.
      </caption>
      <thead>
        <tr>
          <td class="label-col"></td>
          ${list.map(
            (a) =>
              html`<th scope="col" class="col-head">
                <a href="${areaUrl(a.slug)}">${a.name}</a
                ><span class="col-kind">${kindLabel(a)}</span>
              </th>`,
          )}
        </tr>
      </thead>
      <tbody>
        ${rows(list).map(
          (r) =>
            html`<tr>
              <th scope="row">${r.label}</th>
              ${list.map((a, i) => html`<td>${r.cell(a, i)}</td>`)}
            </tr>`,
        )}
      </tbody>
    </table>
  </div>`;
}

function suggestionHtml(list: readonly Area[]): Html {
  const slugs = list.map((a) => a.slug);
  return html`<li>
    <a class="btn" href="${compareUrl(slugs)}" data-suggest="${slugs.join(",")}">${names(list)}</a>
  </li>`;
}

function init(): void {
  const form = document.querySelector<HTMLFormElement>("#compare-form");
  const result = document.querySelector<HTMLElement>("#compare-result");
  const table = document.querySelector<HTMLElement>("#compare-table");
  const notes = document.querySelector<HTMLElement>("#compare-notes");
  const empty = document.querySelector<HTMLElement>("#compare-empty");
  const suggest = document.querySelector<HTMLElement>("#compare-suggest");
  const resultTitle = document.querySelector<HTMLElement>("#result-title");
  if (!form || !result || !table || !notes || !empty || !suggest || !resultTitle) return;

  const selects = Array.from(form.querySelectorAll<HTMLSelectElement>("select"));
  const removes = Array.from(form.querySelectorAll<HTMLButtonElement>("[data-remove]"));
  const emptyTitle = empty.querySelector("h2");
  const staticSuggest = suggest.innerHTML;
  const baseTitle = document.title;
  form.addEventListener("submit", (e) => e.preventDefault());

  let chosen = parseCompareParams(new URLSearchParams(location.search), MAX);

  // Pilfunktion (inte function-deklaration), så att TypeScript behåller kontrollen ovan.
  const render = (): void => {
    // Väljarna
    selects.forEach((sel, i) => {
      const slug = chosen[i];
      sel.value = slug ?? "";
      sel.classList.toggle("empty-select", !slug);
      for (const opt of Array.from(sel.options)) {
        if (!opt.value) continue;
        opt.disabled = chosen.includes(opt.value) && slug !== opt.value;
      }
      const rm = removes[i];
      if (rm) {
        rm.hidden = !slug;
        rm.setAttribute("aria-label", slug ? `Ta bort ${bySlug.get(slug)?.name ?? ""}` : "Ta bort");
      }
    });

    const list = areasFor(chosen);
    const enough = list.length >= 2;
    result.hidden = !enough;
    empty.hidden = enough;
    document.title = enough ? `${names(list)} jämförda | ${SITE}` : baseTitle;

    if (enough) {
      resultTitle.textContent = names(list);
      table.innerHTML = tableHtml(list).value;
      const parts: string[] = [
        `Siffrorna gäller bostadsrätter sålda ${dataset.periods.m3} om inget annat anges.`,
        "Förändringen gäller de senaste tre månaderna: 3 mån mot de tre månaderna före, 12 mån mot samma månader året innan.",
      ];
      if (list.some((a) => a.houseScope === "city"))
        parts.push("Villor redovisas bara för hela Stockholms stad, inte per stadsdelsområde.");
      if (list.some((a) => isThin(stat(a, "apartment", "m3"), "m3")))
        parts.push("Värden med få affärer är märkta, eftersom snittet där kan svänga mycket.");
      notes.textContent = parts.join(" ");
    } else {
      table.innerHTML = "";
      const only = list[0];
      if (only) {
        const sim = similarNeighbours(only, 2);
        if (emptyTitle)
          emptyTitle.textContent = `Välj ett område till att jämföra med ${only.name}`;
        suggest.innerHTML =
          (sim.length ? suggestionHtml([only, ...sim]).value : "") + staticSuggest;
      } else {
        if (emptyTitle) emptyTitle.textContent = "Välj minst två områden";
        suggest.innerHTML = staticSuggest;
      }
    }

    const url = new URL(location.href);
    for (const k of ["omraden", "jamfor", "a", "b", "c"]) url.searchParams.delete(k);
    if (chosen.length) url.searchParams.set("omraden", chosen.join(","));
    history.replaceState(null, "", url.pathname + url.search.replace(/%2C/g, ",") + url.hash);
  };

  form.addEventListener("change", (e) => {
    const sel = e.target;
    if (!(sel instanceof HTMLSelectElement)) return;
    const i = selects.indexOf(sel);
    if (i === -1) return;
    const next = [...chosen];
    if (sel.value) next[i] = sel.value;
    else next.splice(i, 1);
    chosen = next.filter((s, j) => s && next.indexOf(s) === j).slice(0, MAX);
    render();
  });

  removes.forEach((btn) =>
    btn.addEventListener("click", () => {
      const i = Number(btn.dataset.remove);
      chosen = chosen.filter((_, j) => j !== i);
      render();
      // Fokus till första tomma eller sista ifyllda väljaren.
      selects[Math.min(i, chosen.length)]?.focus();
    }),
  );

  suggest.addEventListener("click", (e) => {
    const target = e.target instanceof Element ? e.target : null;
    const a = target?.closest<HTMLAnchorElement>("a[data-suggest]");
    if (!a) return;
    e.preventDefault();
    chosen = parseCompareParams(new URLSearchParams({ omraden: a.dataset.suggest ?? "" }), MAX);
    render();
    resultTitle.scrollIntoView({ block: "nearest" });
    selects[0]?.focus({ preventScroll: true });
  });

  render();
}

init();
