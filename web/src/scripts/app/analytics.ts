/**
 * Valfri, cookiefri statistik via GoatCounter. Finns inte window.goatcounter händer ingenting.
 */
interface GoatCounter {
  count?: (vars: { path: string; title?: string; event?: boolean }) => void;
}

declare global {
  interface Window {
    goatcounter?: GoatCounter;
  }
}

export function track(path: string): void {
  const send = () => {
    try {
      window.goatcounter?.count?.({ path, title: path, event: true });
    } catch {
      /* statistik får aldrig störa sidan */
    }
  };
  // count.js laddas asynkront; vänta in sidans load-händelse om den inte hunnit.
  if (window.goatcounter?.count || document.readyState === "complete") send();
  else window.addEventListener("load", send, { once: true });
}

const seen = new Set<string>();

/** Räkna första visningen av en vy per session. */
export function trackViewOnce(view: string): void {
  const key = `prislandskap:vy:${view}`;
  if (seen.has(key)) return;
  seen.add(key);
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
  } catch {
    /* utan sessionStorage räknas det en gång per sidvisning */
  }
  track(`vy/${view}`);
}
