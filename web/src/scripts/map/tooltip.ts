/** Liten etikett som följer muspekaren över kartan (bara med mus, inte på pekskärm). */
import type { Html } from "../../lib/html";

export class Tooltip {
  private current: string | null = null;

  constructor(
    private readonly el: HTMLElement,
    private readonly bounds: HTMLElement,
  ) {}

  show(key: string, content: () => Html, x: number, y: number): void {
    if (this.current !== key) {
      this.el.innerHTML = content().value;
      this.current = key;
    }
    this.el.hidden = false;
    const W = this.bounds.clientWidth;
    const H = this.bounds.clientHeight;
    const w = this.el.offsetWidth;
    const h = this.el.offsetHeight;
    const OFF = 14;
    let left = x + OFF;
    let top = y + OFF;
    if (left + w > W - 8) left = x - w - OFF;
    if (top + h > H - 8) top = y - h - OFF;
    this.el.style.transform = `translate(${Math.max(8, Math.round(left))}px, ${Math.max(8, Math.round(top))}px)`;
  }

  /** Rita om innehållet nästa gång (t.ex. när vyn eller filtret ändrats). */
  invalidate(): void {
    this.current = null;
  }

  hide(): void {
    this.el.hidden = true;
    this.current = null;
  }
}
