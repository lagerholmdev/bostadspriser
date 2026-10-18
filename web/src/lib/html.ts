/**
 * Liten mallhjälpare: html`<p>${text}</p>` escapar allt som stoppas in, utom andra html-mallar.
 * Samma renderfunktioner körs i Astro vid bygget (set:html) och i webbläsaren (innerHTML),
 * så panelen ser likadan ut före och efter att skriptet laddat.
 */

export class Html {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value;
  }
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c]);
}

type Part = Html | string | number | boolean | null | undefined | Part[];

function emit(v: Part): string {
  if (v == null || v === false || v === true) return "";
  if (v instanceof Html) return v.value;
  if (Array.isArray(v)) return v.map(emit).join("");
  return escape(String(v));
}

export function html(strings: TemplateStringsArray, ...values: Part[]): Html {
  let out = strings[0];
  for (let i = 0; i < values.length; i++) out += emit(values[i]) + strings[i + 1];
  return new Html(out);
}

/** Redan säker HTML (används sparsamt, t.ex. för statisk SVG). */
export function raw(s: string): Html {
  return new Html(s);
}

/** Attributvärde som utelämnas när det är null/false: attr("aria-current", cur && "true"). */
export function attr(name: string, value: string | number | null | undefined | false): Html {
  if (value == null || value === false) return new Html("");
  return new Html(` ${name}="${escape(String(value))}"`);
}
