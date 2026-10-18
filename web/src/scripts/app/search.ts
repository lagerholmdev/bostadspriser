/**
 * Sökrutan, enligt ARIA:s mönster för kombinationsruta med lista:
 * pil upp/ner flyttar, Enter väljer, Escape stänger (och tömmer vid andra tryck).
 */
import { html } from "./html";
import { KIND_LABEL } from "./panel/detail";
import { search, type SearchHit } from "./search-index";

export interface SearchElements {
  input: HTMLInputElement;
  listbox: HTMLUListElement;
  status: HTMLElement;
}

export function initSearch(el: SearchElements, onPick: (slug: string) => void): void {
  const { input, listbox, status } = el;
  let hits: SearchHit[] = [];
  let active = -1;

  const optionId = (i: number) => `${listbox.id}-opt-${i}`;

  function open(isOpen: boolean) {
    listbox.hidden = !isOpen;
    input.setAttribute("aria-expanded", String(isOpen));
    if (!isOpen) setActive(-1);
  }

  function setActive(i: number) {
    active = i;
    const opts = listbox.querySelectorAll<HTMLElement>("[role=option]");
    opts.forEach((o, j) => o.setAttribute("aria-selected", String(j === i)));
    if (i >= 0 && opts[i]) {
      input.setAttribute("aria-activedescendant", opts[i].id);
      opts[i].scrollIntoView({ block: "nearest" });
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }

  function render() {
    const q = input.value.trim();
    hits = search(q);
    if (!q) {
      listbox.innerHTML = "";
      status.textContent = "";
      open(false);
      return;
    }
    listbox.innerHTML = hits.length
      ? hits
          .map(
            (h, i) => html`<li role="option" id="${optionId(i)}" data-slug="${h.area.slug}" aria-selected="false">
              <span class="opt-name">${h.area.name}</span>
              <span class="opt-meta">${h.via ? `${h.via} ligger här` : KIND_LABEL[h.area.kind]}</span>
            </li>`.value,
          )
          .join("")
      : html`<li class="opt-empty" role="presentation">Inget område matchar ”${q}”. Prova en kommun eller stadsdel, till exempel Solna eller Aspudden.</li>`.value;
    status.textContent = hits.length ? `${hits.length} ${hits.length === 1 ? "träff" : "träffar"}` : "Inga träffar";
    open(true);
    setActive(hits.length ? 0 : -1);
  }

  function pick(i: number) {
    const hit = hits[i];
    if (!hit) return;
    input.value = "";
    listbox.innerHTML = "";
    open(false);
    status.textContent = `${hit.area.name} vald`;
    onPick(hit.area.slug);
  }

  input.addEventListener("input", render);
  input.addEventListener("focus", () => {
    if (input.value.trim()) render();
  });
  input.addEventListener("keydown", (e) => {
    const isOpen = !listbox.hidden;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!isOpen) render();
        else if (hits.length) setActive((active + 1) % hits.length);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (isOpen && hits.length) setActive(active <= 0 ? hits.length - 1 : active - 1);
        break;
      case "Enter":
        if (isOpen && active >= 0) {
          e.preventDefault();
          pick(active);
        }
        break;
      case "Escape":
        if (isOpen) {
          e.preventDefault();
          open(false);
        } else if (input.value) {
          e.preventDefault();
          input.value = "";
        }
        break;
      case "Tab":
        open(false);
        break;
    }
  });
  // Klick i listan: mousedown förhindras så att fältet behåller fokus tills valet är gjort.
  listbox.addEventListener("mousedown", (e) => e.preventDefault());
  listbox.addEventListener("click", (e) => {
    const li = (e.target as HTMLElement).closest<HTMLElement>("[role=option]");
    if (!li) return;
    const i = [...listbox.querySelectorAll("[role=option]")].indexOf(li);
    pick(i);
  });
  input.addEventListener("blur", () => window.setTimeout(() => open(false), 120));
}
