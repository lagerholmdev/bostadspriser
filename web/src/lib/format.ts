/** Svensk formatering av tal, pengar och procent. Ett mellanslag (U+00A0) mellan tusental. */

const NBSP = " ";
const int = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });
const oneDec = new Intl.NumberFormat("sv-SE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** 116680 -> "116 680" */
export function number(v: number | null | undefined): string {
  return v == null ? "–" : int.format(Math.round(v)).replace(/\s/g, NBSP);
}

/** 116680 -> "116 680 kr/kvm" */
export function sqm(v: number | null | undefined): string {
  return v == null ? "–" : `${number(v)}${NBSP}kr/kvm`;
}

/** 6703000 -> "6,7 mkr", 950000 -> "950 000 kr" */
export function money(v: number | null | undefined): string {
  if (v == null) return "–";
  if (Math.abs(v) >= 1_000_000) {
    const m = v / 1_000_000;
    const s = m.toLocaleString("sv-SE", { maximumFractionDigits: m < 10 ? 1 : 0 });
    return `${s}${NBSP}mkr`;
  }
  return `${number(v)}${NBSP}kr`;
}

/** 5000000 -> "5 mkr", 5250000 -> "5,25 mkr" (för budgetreglaget, upp till två decimaler). */
export function mkr(v: number): string {
  const m = Math.round((v / 1_000_000) * 100) / 100;
  return `${m.toLocaleString("sv-SE", { maximumFractionDigits: 2 })}${NBSP}mkr`;
}

/** 10.5 -> "+10,5 %", -1.6 -> "−1,6 %", 0 -> "±0,0 %" */
export function change(v: number | null | undefined): string {
  if (v == null) return "–";
  const sign = v > 0 ? "+" : v < 0 ? "−" : "±";
  return `${sign}${oneDec.format(Math.abs(v))}${NBSP}%`;
}

/** Riktning för en förändring i procent, avrundad till en decimal som den visas. */
export function changeDirection(v: number | null | undefined): "up" | "down" | "flat" | null {
  if (v == null) return null;
  const r = Math.round(v * 10) / 10;
  return r > 0 ? "up" : r < 0 ? "down" : "flat";
}

/** Ord som beskriver förändringen, så att färgen inte är enda signalen. */
export function changeWord(v: number | null | undefined): string {
  const d = changeDirection(v);
  return d === "up" ? "upp" : d === "down" ? "ner" : d === "flat" ? "oförändrat" : "";
}

/** 0.65 -> "65 % över", -0.12 -> "12 % under" (andel, inte procent) */
export function relative(ratio: number | null | undefined): string {
  if (ratio == null) return "–";
  const p = Math.round(Math.abs(ratio) * 100);
  if (p === 0) return "i nivå med";
  return `${p}${NBSP}% ${ratio > 0 ? "över" : "under"}`;
}

/** 0.12 -> "12 % dyrare", -0.3 -> "30 % billigare", 0 -> "samma pris" */
export function pricier(ratio: number | null | undefined): string {
  if (ratio == null) return "–";
  const p = Math.round(Math.abs(ratio) * 100);
  if (p === 0) return "samma pris";
  return `${p}${NBSP}% ${ratio > 0 ? "dyrare" : "billigare"}`;
}

/** 1 -> "1:a", 3 -> "3:e", 22 -> "22:a" */
export function ordinal(n: number): string {
  const last = n % 10;
  const lastTwo = n % 100;
  return `${n}:${(last === 1 || last === 2) && lastTwo !== 11 && lastTwo !== 12 ? "a" : "e"}`;
}

/** "2026-10-08" -> "8 oktober 2026" */
export function date(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("sv-SE", { day: "numeric", month: "long", year: "numeric" });
}

/** "på" för öar och stadsdelar man är på, annars "i". */
const PA = new Set(["sodermalm", "ostermalm", "kungsholmen", "essingen", "lidingo", "varmdo"]);
export function inArea(slug: string, name: string): string {
  return `${PA.has(slug) ? "på" : "i"} ${name}`;
}

/** Sökbar form utan diakritiska tecken: "Hägersten-Liljeholmen" -> "hagersten liljeholmen". */
export function searchKey(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[-–\s]+/g, " ")
    .trim();
}

/** Varför ett värde saknas, i klartext. Se MissingReason i types.ts. */
export const MISSING_TEXT = {
  F: "för få affärer",
  N: "inte representativt",
  "0": "inga affärer",
} as const;

/** För skärmläsare: 5250000 -> "5,25 miljoner kronor", 1000000 -> "1 miljon kronor". */
export function mkrSpoken(v: number): string {
  const m = Math.round((v / 1_000_000) * 100) / 100;
  return `${m.toLocaleString("sv-SE", { maximumFractionDigits: 2 })} ${m === 1 ? "miljon" : "miljoner"} kronor`;
}
