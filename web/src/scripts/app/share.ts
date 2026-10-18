/**
 * "Dela": systemets delningsmeny på mobilen, annars kopiera länken. Går ingetdera visas
 * länken i ett markerat textfält som man kan kopiera själv.
 */
import { track } from "./analytics";

export interface ShareElements {
  button: HTMLButtonElement;
  status: HTMLElement;
  fallback: HTMLElement;
  fallbackInput: HTMLInputElement;
}

export function initShare(el: ShareElements, beforeShare: () => void): void {
  let timer: number | undefined;
  const say = (msg: string) => {
    window.clearTimeout(timer);
    el.status.textContent = msg;
    timer = window.setTimeout(() => (el.status.textContent = ""), 4000);
  };
  const coarse = window.matchMedia("(pointer: coarse)").matches;

  el.button.addEventListener("click", async () => {
    beforeShare();
    const url = location.href;
    el.fallback.hidden = true;
    if (coarse && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: document.title, url });
        track("delning");
        return;
      } catch (err) {
        if ((err as DOMException)?.name === "AbortError") return; // användaren ångrade sig
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      say("Länken är kopierad");
      track("delning");
    } catch {
      el.fallbackInput.value = url;
      el.fallback.hidden = false;
      el.fallbackInput.focus();
      el.fallbackInput.select();
      say("Kopiera länken i fältet");
      track("delning");
    }
  });

  el.fallback.querySelector<HTMLButtonElement>("[data-action=close-share]")?.addEventListener("click", () => {
    el.fallback.hidden = true;
    el.button.focus();
  });
}
