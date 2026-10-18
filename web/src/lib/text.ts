/**
 * Meningar som sätter siffrorna i sammanhang. Rena funktioner utan DOM, så att
 * samma text kan skrivas ut i bygget och i webbläsaren, och testas.
 */
import { changeDirection, ordinal } from "./format";

const NBSP = "\u00a0";
const oneDec = new Intl.NumberFormat("sv-SE", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** 6.6 -> "6,6 %" (utan tecken; riktningen står i ord). */
function amount(v: number): string {
  return `${oneDec.format(Math.abs(v))}${NBSP}%`;
}

/**
 * En mening som knyter ihop förändringen på ett år och de senaste tre månaderna:
 * "Priserna har gått upp 6,6 % på ett år, men ner 1,1 % de senaste tre månaderna."
 * `year` är "Förändring 12 mån", `quarter` är "Förändring 3 mån". Null när båda saknas.
 */
export function changeSentence(
  year: number | null | undefined,
  quarter: number | null | undefined,
): string | null {
  const y = changeDirection(year);
  const q = changeDirection(quarter);
  const Q = "de senaste tre månaderna";
  const Y = "på ett år";

  if (!y && !q) return null;
  if (y && !q) {
    return y === "flat"
      ? `Priserna är oförändrade ${Y}.`
      : `Priserna har gått ${y === "up" ? "upp" : "ner"} ${amount(year as number)} ${Y}.`;
  }
  if (!y && q) {
    const head =
      q === "flat"
        ? `Priserna är oförändrade ${Q}`
        : `Priserna har gått ${q === "up" ? "upp" : "ner"} ${amount(quarter as number)} ${Q}`;
    return `${head}. Förändringen ${Y} saknas.`;
  }

  const yv = year as number;
  const qv = quarter as number;
  if (y === "flat" && q === "flat") return `Priserna är oförändrade, både ${Y} och ${Q}.`;
  if (y === "flat")
    return `Priserna är oförändrade ${Y}, men har gått ${q === "up" ? "upp" : "ner"} ${amount(qv)} ${Q}.`;
  const yWord = y === "up" ? "upp" : "ner";
  if (q === "flat") return `Priserna har gått ${yWord} ${amount(yv)} ${Y}, men stått still ${Q}.`;
  if (y === q) return `Priserna har gått ${yWord} ${amount(yv)} ${Y} och ${amount(qv)} ${Q}.`;
  return `Priserna har gått ${yWord} ${amount(yv)} ${Y}, men ${q === "up" ? "upp" : "ner"} ${amount(qv)} ${Q}.`;
}

/**
 * Plats i prislistan i ord: 1 -> "dyrast av 37 områden", sist -> "billigast av 37 områden",
 * 3 -> "3:e dyrast av 37 områden". I nedre halvan räknas från botten: 35 av 37 -> "3:e billigast".
 */
export function rankPhrase(rank: number, total: number): string {
  const of = `av ${total} områden`;
  if (rank === 1) return `dyrast ${of}`;
  if (rank === total) return `billigast ${of}`;
  if (rank > (total + 1) / 2) return `${ordinal(total - rank + 1)} billigast ${of}`;
  return `${ordinal(rank)} dyrast ${of}`;
}

/** "Södermalm", "Södermalm och Nacka", "Södermalm, Kungsholmen och Nacka". */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} och ${names[names.length - 1]}`;
}
