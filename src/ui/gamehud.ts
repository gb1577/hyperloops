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
      <div class="mode"></div>`;
    parent.append(this.root);
    this.scoreEl = this.root.querySelector('.val')!;
    this.multEl = this.root.querySelector('.mult')!;
    this.comboEl = this.root.querySelector('.combo')!;
    this.fluxEl = this.root.querySelector('.flux i')!;
    this.shieldEls = [...this.root.querySelectorAll<HTMLElement>('.shields b')];
    this.bannerEl = this.root.querySelector('.banner')!;
    this.modeEl = this.root.querySelector('.mode')!;
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
    if (combo !== l.combo) this.comboEl.textContent = combo > 1 ? `${combo} GRAZE CHAIN` : '';
    const f = Math.round(flux * 100);
    if (f !== l.flux) this.fluxEl.style.width = `${f}%`;
    if (shields !== l.shields) this.shieldEls.forEach((el, i) => el.classList.toggle('off', i >= shields));
    this.last = { score: s, mult, combo, flux: f, shields };
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
