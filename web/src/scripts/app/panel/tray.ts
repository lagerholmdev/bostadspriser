/** Jämförelsebrickan längst ner i panelen. */
import { getArea } from "../../../lib/data";
import { html, type Html } from "../html";
import { compareHref, MAX_COMPARE } from "../compare";

export function tray(list: readonly string[], base: string): Html {
  const chips = list.map((slug) => {
    const name = getArea(slug)?.name ?? slug;
    return html`<li class="chip">
      <span>${name}</span>
      <button type="button" class="chip-x" data-action="remove-compare" data-slug="${slug}" aria-label="${`Ta bort ${name} ur jämförelsen`}">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
      </button>
    </li>`;
  });
  return html`<div class="tray-inner">
    <ul class="chips" aria-label="Områden att jämföra">${chips}</ul>
    ${list.length >= 2
      ? html`<a class="btn btn-primary tray-go" href="${compareHref(base, list)}">Jämför (${list.length}) <span aria-hidden="true">→</span></a>`
      : html`<p class="tray-hint">Välj ett område till för att jämföra (högst ${MAX_COMPARE}).</p>`}
  </div>`;
}
