/**
 * Knapparna "Kopiera länk" (components/common/CopyLink.astro). Kopierar adressen som den
 * är när man klickar, så att jämförelsens val följer med.
 */
export function initCopyLinks(): void {
  for (const box of Array.from(document.querySelectorAll<HTMLElement>("[data-copy-link]"))) {
    if (box.dataset.ready) continue;
    const btn = box.querySelector<HTMLButtonElement>("[data-copy-btn]");
    const status = box.querySelector<HTMLElement>("[data-copy-status]");
    const fallback = box.querySelector<HTMLElement>("[data-copy-fallback]");
    const input = box.querySelector<HTMLInputElement>("[data-copy-input]");
    if (!btn || !status || !fallback || !input) continue;
    box.dataset.ready = "1";
    box.hidden = false;

    let timer = 0;
    btn.addEventListener("click", async () => {
      const href = location.href;
      window.clearTimeout(timer);
      try {
        if (!navigator.clipboard) throw new Error("Urklipp saknas");
        await navigator.clipboard.writeText(href);
        fallback.hidden = true;
        status.textContent = "Länken är kopierad";
        timer = window.setTimeout(() => (status.textContent = ""), 6000);
      } catch {
        input.value = href;
        fallback.hidden = false;
        status.textContent = "Kopiera länken från fältet";
        input.focus();
        input.select();
      }
    });
  }
}
