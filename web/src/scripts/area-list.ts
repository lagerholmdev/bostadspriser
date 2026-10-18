/**
 * Områdeslistan: sök på namn, stadsdel eller ort (utan hänsyn till å, ä, ö och accenter)
 * och sortering på pris eller namn. Sidan fungerar utan skriptet; då visas listorna
 * sorterade på pris.
 */
import { findAreas } from "../lib/aliases";

type Sort = "pris" | "namn";

interface RowInfo {
  slug: string;
  name: string;
  row: HTMLTableRowElement;
}

function init(): void {
  const tools = document.querySelector<HTMLElement>("[data-list-tools]");
  const input = document.querySelector<HTMLInputElement>("#area-search");
  const status = document.querySelector<HTMLElement>("#search-status");
  const groups = Array.from(document.querySelectorAll<HTMLElement>("[data-group]"));
  if (!tools || !input || !status || !groups.length) return;
  tools.hidden = false;

  const rows: RowInfo[] = Array.from(
    document.querySelectorAll<HTMLTableRowElement>("tr.area-row"),
  ).map((row) => ({
    slug: row.dataset.slug ?? "",
    name: row.dataset.name ?? "",
    row,
  }));

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
    const text = input?.value.trim() ?? "";
    const searching = text !== "";
    const hits = new Map(findAreas(text, rows).map((m) => [m.area.slug, m.via]));
    let shown = 0;
    for (const g of groups) {
      const tbody = g.querySelector("tbody");
      if (!tbody) continue;
      const list = Array.from(tbody.querySelectorAll<HTMLTableRowElement>("tr.area-row"));
      list.sort((a, b) =>
        sort === "namn"
          ? collator.compare(a.dataset.name ?? "", b.dataset.name ?? "")
          : Number(b.dataset.price) - Number(a.dataset.price),
      );
      let inGroup = 0;
      for (const r of list) {
        const slug = r.dataset.slug ?? "";
        const hit = !searching || hits.has(slug);
        r.hidden = !hit;
        const via = r.querySelector<HTMLElement>("[data-via]");
        const viaName = searching ? hits.get(slug) : null;
        if (via) {
          via.hidden = !viaName;
          via.textContent = viaName ? `${viaName} ligger här` : "";
        }
        if (hit) inGroup++;
        tbody.appendChild(r);
      }
      g.hidden = inGroup === 0;
      shown += inGroup;
      const cap = g.querySelector<HTMLElement>("[data-sort-caption]");
      if (cap) cap.textContent = sort === "namn" ? "i bokstavsordning" : "dyrast först";
    }
    if (!status) return;
    status.textContent = !searching
      ? ""
      : shown === 0
        ? `Inget område matchar ”${text}”. Prova en kommun eller stadsdel, till exempel Solna eller Aspudden.`
        : `${shown} ${shown === 1 ? "område matchar" : "områden matchar"} ”${text}”.`;

    const url = new URL(location.href);
    if (searching) url.searchParams.set("q", text);
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
    const t = e.target;
    if (t instanceof HTMLInputElement && t.name === "sort") {
      sort = t.value === "namn" ? "namn" : "pris";
      apply();
    }
  });
  apply();
}

init();
