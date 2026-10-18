/**
 * Jämförelsesidan: väljer upp till tre områden och ritar tabellen från det
 * inbyggda datasetet. Läget ligger i adressen (?omraden=a,b,c) och uppdateras
 * med replaceState, så att länken alltid går att dela.
 */
import { affordableSize } from "../lib/budget";
import { bySlug, countyRatio, dataset, isThin, parseCompareParams, similarNeighbours, stat } from "../lib/data";
import { change, changeDirection, changeWord, MISSING_TEXT, money, number, pricier, relative, sqm } from "../lib/format";
import { priceColor } from "../lib/scales";
import type { Area, MissingReason, Stat } from "../lib/types";
import { areaUrl, compareUrl } from "../components/common/links";

const MAX = 3;
const BUDGET = 5_000_000;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function missing(reason: MissingReason | undefined): string {
  return `<span class="chg chg-none"><span aria-hidden="true">–</span><span class="miss">${reason ? MISSING_TEXT[reason] : "saknas"}</span></span>`;
}

function changeHtml(s: Stat | null | undefined): string {
  const v = s?.change;
  const dir = changeDirection(v);
  if (!dir) return missing(s?.missing?.change);
  return `<span class="chg chg-${dir}">${esc(change(v))}<span class="chg-word">${changeWord(v)}</span></span>`;
}

function names(list: Area[]): string {
  const n = list.map((a) => a.name);
  return n.length > 1 ? `${n.slice(0, -1).join(", ")} och ${n.at(-1)}` : (n[0] ?? "");
}

interface Row {
  label: string;
  cell: (a: Area, i: number) => string;
}

function rows(list: Area[]): Row[] {
  const first = list[0]!;
  const p3 = (a: Area) => stat(a, "apartment", "m3");
  const firstPrice = p3(first)?.pricePerSqm ?? null;
  const thin = (a: Area) => isThin(p3(a), "m3");
  return [
    {
      label: "Pris per kvm, 3 mån",
      cell: (a) => {
        const s = p3(a);
        if (s?.pricePerSqm == null) return missing(s?.missing?.pricePerSqm);
        return `<span class="val-main${thin(a) ? " thin-value" : ""}"><span class="swatch" style="background:${priceColor(s.pricePerSqm)}"></span>${esc(sqm(s.pricePerSqm))}</span>`;
      },
    },
    {
      label: "Mot länets snitt",
      cell: (a) => {
        const r = countyRatio(p3(a)?.pricePerSqm);
        return r == null ? missing(undefined) : esc(relative(r));
      },
    },
    {
      label: `Mot ${first.name}`,
      cell: (a, i) => {
        if (i === 0) return `<span class="ref">jämförs med</span>`;
        const p = p3(a)?.pricePerSqm;
        return p == null || !firstPrice ? missing(undefined) : esc(pricier(p / firstPrice - 1));
      },
    },
    { label: "Förändring, 3 mån", cell: (a) => changeHtml(p3(a)) },
    { label: "Förändring, 12 mån", cell: (a) => changeHtml(stat(a, "apartment", "m12")) },
    {
      label: "Sålda bostadsrätter, 3 mån",
      cell: (a) => {
        const s = p3(a);
        if (s?.sales == null) return missing(s?.missing?.sales);
        return `${esc(number(s.sales))}${thin(a) ? ' <span class="thin-tag">få affärer</span>' : ""}`;
      },
    },
    {
      label: "Medelpris, 3 mån",
      cell: (a) => {
        const s = p3(a);
        return s?.meanPrice == null ? missing(s?.missing?.meanPrice) : esc(money(s.meanPrice));
      },
    },
    {
      label: "Villor, pris per kvm",
      cell: (a) => {
        const s = stat(a, "house", "m3");
        if (!s) return missing("0");
        if (s.pricePerSqm == null) return missing(s.missing?.pricePerSqm);
        const note = a.houseScope === "city" ? '<span class="cell-sub">hela Stockholms stad</span>' : "";
        return `${esc(sqm(s.pricePerSqm))}${note}`;
      },
    },
    {
      label: "5 mkr räcker till",
      cell: (a) => {
        const p = p3(a)?.pricePerSqm;
        return p == null ? missing(undefined) : `ca ${esc(number(Math.round(affordableSize(BUDGET, p))))}&nbsp;kvm`;
      },
    },
  ];
}

function tableHtml(list: Area[]): string {
  const head = list
    .map(
      (a) =>
        `<th scope="col" class="col-head"><a href="${areaUrl(a.slug)}">${esc(a.name)}</a><span class="col-kind">${a.kind === "district" ? "Stadsdelsområde" : "Kommun"}</span></th>`,
    )
    .join("");
  const body = rows(list)
    .map(
      (r) =>
        `<tr><th scope="row">${esc(r.label)}</th>${list.map((a, i) => `<td>${r.cell(a, i)}</td>`).join("")}</tr>`,
    )
    .join("");
  return `<div class="table-clip"><table class="data-table" style="--n:${list.length}">
<caption class="visually-hidden">Jämförelse av ${esc(names(list))}. Bostadsrätter om inget annat anges.</caption>
<thead><tr><td class="label-col"></td>${head}</tr></thead>
<tbody>${body}</tbody></table></div>`;
}

function init(): void {
  const form = document.querySelector<HTMLFormElement>("#compare-form");
  const result = document.querySelector<HTMLElement>("#compare-result");
  const table = document.querySelector<HTMLElement>("#compare-table");
  const notes = document.querySelector<HTMLElement>("#compare-notes");
  const empty = document.querySelector<HTMLElement>("#compare-empty");
  const suggest = document.querySelector<HTMLElement>("#compare-suggest");
  const share = document.querySelector<HTMLElement>("[data-share]");
  const copyBtn = document.querySelector<HTMLButtonElement>("#copy-link");
  const copyStatus = document.querySelector<HTMLElement>("#copy-status");
  if (!form || !result || !table || !notes || !empty || !suggest || !share || !copyBtn || !copyStatus) return;

  const selects = Array.from(form.querySelectorAll<HTMLSelectElement>("select"));
  const removes = Array.from(form.querySelectorAll<HTMLButtonElement>("[data-remove]"));
  const staticSuggest = suggest.innerHTML;
  form.addEventListener("submit", (e) => e.preventDefault());

  let chosen = parseCompareParams(new URLSearchParams(location.search), MAX);

  function render(): void {
    // Väljarna
    selects.forEach((sel, i) => {
      sel.value = chosen[i] ?? "";
      sel.classList.toggle("empty-select", !chosen[i]);
      for (const opt of Array.from(sel.options)) {
        if (!opt.value) continue;
        opt.disabled = chosen.includes(opt.value) && chosen[i] !== opt.value;
      }
      const rm = removes[i];
      if (rm) {
        rm.hidden = !chosen[i];
        const nameEl = rm.querySelector("[data-remove-name]");
        if (nameEl) nameEl.textContent = chosen[i] ? ` ${bySlug.get(chosen[i]!)?.name ?? ""}` : "";
      }
    });

    const list = chosen.map((s) => bySlug.get(s)!).filter(Boolean);
    const enough = list.length >= 2;
    result!.hidden = !enough;
    empty!.hidden = enough;
    share!.hidden = !enough;
    copyStatus!.textContent = "";

    if (enough) {
      table!.innerHTML = tableHtml(list);
      const parts: string[] = [
        `Siffrorna gäller bostadsrätter sålda ${dataset.periods.m3} om inget annat anges.`,
        "Förändringen jämför med perioden innan: tre månader mot de tre månaderna före, tolv månader mot de tolv före.",
      ];
      if (list.some((a) => a.houseScope === "city"))
        parts.push("Villor redovisas bara för hela Stockholms stad, inte per stadsdelsområde.");
      if (list.some((a) => isThin(stat(a, "apartment", "m3"), "m3")))
        parts.push("Värden med få affärer visas blekare, eftersom snittet där kan svänga mycket.");
      notes!.textContent = parts.join(" ");
    } else {
      table!.innerHTML = "";
      const h = empty!.querySelector("h2");
      if (list.length === 1) {
        const a = list[0]!;
        const sim = similarNeighbours(a, 2);
        if (h) h.textContent = `Välj ett område till att jämföra med ${a.name}`;
        const own = sim.length
          ? `<li><a class="btn" href="${compareUrl([a.slug, ...sim.map((s) => s.slug)])}" data-suggest="${[a.slug, ...sim.map((s) => s.slug)].join(",")}">${esc(names([a, ...sim]))}</a></li>`
          : "";
        suggest!.innerHTML = own + staticSuggest;
      } else {
        if (h) h.textContent = "Välj minst två områden";
        suggest!.innerHTML = staticSuggest;
      }
    }

    const url = new URL(location.href);
    for (const k of ["omraden", "jamfor", "a", "b", "c"]) url.searchParams.delete(k);
    if (chosen.length) url.searchParams.set("omraden", chosen.join(","));
    history.replaceState(null, "", url.pathname + (url.search ? url.search.replace(/%2C/g, ",") : "") + url.hash);
  }

  form.addEventListener("change", (e) => {
    const sel = e.target as HTMLSelectElement;
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
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[data-suggest]");
    if (!a) return;
    e.preventDefault();
    chosen = parseCompareParams(new URLSearchParams({ omraden: a.dataset.suggest ?? "" }), MAX);
    render();
    result.querySelector<HTMLElement>("h2")?.scrollIntoView({ block: "nearest" });
    selects[0]?.focus({ preventScroll: true });
  });

  copyBtn.addEventListener("click", async () => {
    const href = location.href;
    try {
      await navigator.clipboard.writeText(href);
      copyStatus.textContent = "Länken är kopierad.";
    } catch {
      copyStatus.textContent = `Kopiera länken: ${href}`;
    }
  });

  render();
}

init();
