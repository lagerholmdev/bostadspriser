/**
 * Områdeslistan: sök (utan hänsyn till å, ä, ö och accenter) och sortering på pris
 * eller namn. Sidan fungerar utan skriptet; då visas listorna sorterade på pris.
 */
import { searchKey } from "../lib/format";

type Sort = "pris" | "namn";

function init(): void {
  const tools = document.querySelector<HTMLElement>("[data-list-tools]");
  const input = document.querySelector<HTMLInputElement>("#area-search");
  const status = document.querySelector<HTMLElement>("#search-status");
  const groups = Array.from(document.querySelectorAll<HTMLElement>("[data-group]"));
  if (!tools || !input || !status || !groups.length) return;
  tools.hidden = false;

  const collator = new Intl.Collator("sv");
  let sort: Sort = "pris";

  const params = new URLSearchParams(location.search);
  const q0 = params.get("q");
  if (q0) input.value = q0;
  if (params.get("sortera") === "namn") {
    sort = "namn";
    const r = tools.querySelector<HTMLInputElement>('input[name="sort"][value="namn"]');
    if (r) r.checked = true;
  }

  function apply(): void {
    const q = searchKey(input!.value);
    let shown = 0;
    for (const g of groups) {
      const tbody = g.querySelector("tbody");
      if (!tbody) continue;
      const rows = Array.from(tbody.querySelectorAll<HTMLTableRowElement>("tr.area-row"));
      rows.sort((a, b) =>
        sort === "namn"
          ? collator.compare(a.dataset.name ?? "", b.dataset.name ?? "")
          : Number(b.dataset.price) - Number(a.dataset.price),
      );
      let inGroup = 0;
      for (const r of rows) {
        const hit = !q || (r.dataset.key ?? "").includes(q);
        r.hidden = !hit;
        if (hit) inGroup++;
        tbody.appendChild(r);
      }
      g.hidden = inGroup === 0;
      shown += inGroup;
      const cap = g.querySelector<HTMLElement>("[data-sort-caption]");
      if (cap) cap.textContent = sort === "namn" ? "i bokstavsordning" : "dyrast först";
    }
    status!.textContent = !q
      ? ""
      : shown === 0
        ? `Inget område matchar "${input!.value.trim()}". Prova en del av namnet, till exempel "söder" eller "täby".`
        : `${shown} ${shown === 1 ? "område matchar" : "områden matchar"} "${input!.value.trim()}".`;

    const url = new URL(location.href);
    if (q) url.searchParams.set("q", input!.value.trim());
    else url.searchParams.delete("q");
    if (sort === "namn") url.searchParams.set("sortera", "namn");
    else url.searchParams.delete("sortera");
    history.replaceState(null, "", url);
  }

  input.addEventListener("input", apply);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && input.value.trim()) {
      const first = document.querySelector<HTMLAnchorElement>("tr.area-row:not([hidden]) th a");
      if (first) first.click();
    }
  });
  tools.addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === "sort") {
      sort = t.value === "namn" ? "namn" : "pris";
      apply();
    }
  });
  apply();
}

init();
