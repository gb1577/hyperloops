/** In-game HUD: score, multiplier, combo, flux, shields, banners and floating popups. */
export class GameHud {
  private readonly root: HTMLDivElement;
  private readonly scoreEl: HTMLSpanElement;
  private readonly multEl: HTMLSpanElement;
  private readonly comboEl: HTMLDivElement;
  private readonly fluxEl: HTMLElement;
  private readonly shieldEls: HTMLElement[];
  private readonly bannerEl: HTMLDivElement;
  private readonly modeEl: HTMLDivElement;
  private readonly lockEls: HTMLDivElement[] = [];
  private readonly ringEl: HTMLDivElement;
  private readonly fluxBox: HTMLElement;
  private bannerTimer = 0;
  private last = { score: -1, mult: -1, combo: -1, flux: -1, shields: -1 };

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.id = 'ghud';
    this.root.innerHTML = `
      <div class="score"><span class="val">0</span><span class="mult">×1</span></div>
      <div class="combo"></div>
      <div class="flux"><span>FLUX</span><i></i></div>
      <div class="shields"><b></b><b></b><b></b></div>
      <div class="banner"></div>
      <div class="mode"></div>
      <div class="beatring"></div>`;
    parent.append(this.root);
    this.scoreEl = this.root.querySelector('.val')!;
    this.multEl = this.root.querySelector('.mult')!;
    this.comboEl = this.root.querySelector('.combo')!;
    this.fluxEl = this.root.querySelector('.flux i')!;
    this.shieldEls = [...this.root.querySelectorAll<HTMLElement>('.shields b')];
    this.bannerEl = this.root.querySelector('.banner')!;
    this.modeEl = this.root.querySelector('.mode')!;
    this.ringEl = this.root.querySelector('.beatring')!;
    this.fluxBox = this.root.querySelector('.flux')!;
    for (let i = 0; i < 4; i++) {
      const el = document.createElement('div');
      el.className = 'lock';
      this.root.append(el);
      this.lockEls.push(el);
    }
  }

  show(v: boolean) {
    this.root.style.display = v ? '' : 'none';
  }

  set(score: number, mult: number, combo: number, flux: number, shields: number) {
    const l = this.last;
    const s = Math.floor(score);
    if (s !== l.score) this.scoreEl.textContent = s.toLocaleString('en-US');
    if (mult !== l.mult) {
      this.multEl.textContent = `×${mult}`;
      this.multEl.classList.remove('bump');
      void this.multEl.offsetWidth;
      if (mult > l.mult && l.mult > 0) this.multEl.classList.add('bump');
    }
    if (combo !== l.combo) this.comboEl.textContent = combo > 1 ? `${combo} CHAIN` : '';
    const f = Math.round(flux * 100);
    if (f !== l.flux) this.fluxEl.style.width = `${f}%`;
    if (shields !== l.shields) this.shieldEls.forEach((el, i) => el.classList.toggle('off', i >= shields));
    this.last = { score: s, mult, combo, flux: f, shields };
  }

  /** lock reticles at screen positions (pixels) */
  setLocks(points: { x: number; y: number }[]) {
    this.lockEls.forEach((el, i) => {
      const p = points[i];
      el.style.display = p ? 'block' : 'none';
      if (p) el.style.transform = `translate(${p.x}px, ${p.y}px) rotate(45deg)`;
    });
  }

  /** timing ring around the glider while fire is held: closes onto the glider exactly on the beat */
  beatRing(at: { x: number; y: number } | null, toBeat: number) {
    if (!at) {
      this.ringEl.style.display = 'none';
      return;
    }
    const scale = 1 + toBeat * 1.6;
    this.ringEl.style.display = 'block';
    this.ringEl.style.transform = `translate(${at.x}px, ${at.y}px) scale(${scale})`;
    this.ringEl.style.opacity = String(0.35 + 0.65 * (1 - toBeat));
  }

  showFlux(v: boolean) {
    this.fluxBox.style.display = v ? '' : 'none';
  }

  fluxEmpty() {
    this.fluxBox.classList.remove('dry');
    void this.fluxBox.offsetWidth;
    this.fluxBox.classList.add('dry');
  }

  banner(text: string, ms = 1400, cls = '') {
    this.bannerEl.textContent = text;
    this.bannerEl.className = `banner on ${cls}`;
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => (this.bannerEl.className = 'banner'), ms);
  }

  mode(text: string) {
    this.modeEl.textContent = text;
  }

  /** floating text at a screen position (pixels) */
  popup(text: string, x: number, y: number, cls = '') {
    const el = document.createElement('div');
    el.className = `pop ${cls}`;
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.root.append(el);
    setTimeout(() => el.remove(), 800);
  }
}
