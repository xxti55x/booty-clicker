/** Transient notification toasts (spec §5 M4 — achievement unlocks). */
export class Toasts {
  private readonly container: HTMLElement;

  constructor() {
    const existing = document.getElementById('toasts');
    if (existing) {
      this.container = existing;
    } else {
      const el = document.createElement('div');
      el.id = 'toasts';
      el.className = 'toasts';
      document.body.appendChild(el);
      this.container = el;
    }
  }

  show(icon: string, title: string, sub = ''): void {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = `<span class="ti">${icon}</span><div class="tt"><div class="tn"></div><div class="ts"></div></div>`;
    // textContent (not innerHTML) for the dynamic parts — never inject unescaped text.
    t.querySelector('.tn')!.textContent = title;
    t.querySelector('.ts')!.textContent = sub;
    this.container.appendChild(t);
    window.setTimeout(() => t.classList.add('out'), 3200);
    window.setTimeout(() => t.remove(), 3700);
  }
}
