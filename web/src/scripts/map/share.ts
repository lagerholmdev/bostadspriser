/**
 * "Dela": systemets delningsmeny på mobilen, annars kopiera länken. Går ingetdera visas
 * länken i ett markerat textfält som man kan kopiera själv. "Kopiera länk" i områdesdetaljen
 * använder samma kopiering (copyLink) för områdessidans adress, utan delningsmenyn.
 */
import { track } from "./analytics";

export interface ShareElements {
  button: HTMLButtonElement;
  status: HTMLElement;
  fallback: HTMLElement;
  fallbackInput: HTMLInputElement;
}

export interface Sharer {
  /** Kopiera `url` och skriv resultatet i `status` (eller i delningsknappens statusrad). */
  copyLink(url: string, status?: HTMLElement | null): Promise<void>;
}

export function initShare(el: ShareElements, beforeShare: () => void): Sharer {
  const timers = new WeakMap<HTMLElement, number>();
  const say = (target: HTMLElement, msg: string) => {
    window.clearTimeout(timers.get(target));
    target.textContent = msg;
    timers.set(
      target,
      window.setTimeout(() => (target.textContent = ""), 4000),
    );
  };
  const coarse = window.matchMedia("(pointer: coarse)").matches;

  async function copy(url: string, status: HTMLElement): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      say(status, "Länken är kopierad");
    } catch {
      el.fallbackInput.value = url;
      el.fallback.hidden = false;
      el.fallbackInput.focus();
      el.fallbackInput.select();
      say(status, "Kopiera länken i fältet");
    }
    track("delning");
  }

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
    await copy(url, el.status);
  });

  el.fallback
    .querySelector<HTMLButtonElement>("[data-action=close-share]")
    ?.addEventListener("click", () => {
      el.fallback.hidden = true;
      el.button.focus();
    });

  return {
    async copyLink(url, status) {
      el.fallback.hidden = true;
      await copy(url, status ?? el.status);
    },
  };
}
