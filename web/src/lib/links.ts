/**
 * Adresser inom sajten. Bygger alltid på import.meta.env.BASE_URL, så att
 * sajten fungerar under /bostadspriser/ och på en egen domän.
 * Används både i Astro-komponenter och i klientskript.
 */

export function base(): string {
  const b = import.meta.env.BASE_URL;
  return b.endsWith("/") ? b : `${b}/`;
}

export function areaUrl(slug: string): string {
  return `${base()}omrade/${slug}/`;
}

export function areasUrl(): string {
  return `${base()}omrade/`;
}

export function compareUrl(slugs: readonly string[] = []): string {
  return `${base()}jamfor/${slugs.length ? `?omraden=${slugs.join(",")}` : ""}`;
}

/** Kartsidan: ?omrade=<slug>, ?vy=budget&omrade=<slug>, ?vy=forandring. */
export function mapUrl(opts: { omrade?: string; vy?: "budget" | "forandring" } = {}): string {
  const p = new URLSearchParams();
  if (opts.vy) p.set("vy", opts.vy);
  if (opts.omrade) p.set("omrade", opts.omrade);
  const q = p.toString();
  return `${base()}${q ? `?${q}` : ""}`;
}

export function aboutUrl(hash = ""): string {
  return `${base()}om/${hash}`;
}
