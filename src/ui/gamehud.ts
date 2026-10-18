/** In-game HUD: score, multiplier, combo, flux, shields, banners and floating popups. */
export class GameHud {
  private readonly root: HTMLDivElement;
  private readonly scoreEl: HTMLSpanElement;
  private readonly multEl: HTMLSpanElement;
  private readonly comboEl: HTMLDivElement;
  private readonly fluxEl: HTMLElement;
  private shieldEls: HTMLElement[];
  private readonly shieldBox: HTMLElement;
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
      <div class="score"><span class="val">0</span><span class="mult">×1</span><span class="boost"></span></div>
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
    this.shieldBox = this.root.querySelector('.shields')!;
    this.shieldEls = [...this.shieldBox.querySelectorAll<HTMLElement>('b')];
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

  private boostShown = 0;

  /** the "BOOST ×2" tag next to the multiplier; 0 hides it */
  setBoost(factor: number) {
    if (factor === this.boostShown) return;
    this.boostShown = factor;
    const el = this.root.querySelector<HTMLElement>('.score .boost')!;
    el.textContent = factor ? `BOOST ×${factor}` : '';
    el.classList.toggle('on', factor > 0);
  }

  /** number of shield diamonds (depends on difficulty) */
  setMaxShields(n: number) {
    this.shieldBox.innerHTML = '<b></b>'.repeat(n);
    this.shieldEls = [...this.shieldBox.querySelectorAll<HTMLElement>('b')];
    this.last.shields = -1;
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

  /** shown while flying into a hyperloop: a big code-like title and a small status word */
  loopCard(title: string, status: string) {
    const el = document.createElement('div');
    el.className = 'loopcard';
    el.innerHTML = '<div class="t"></div><div class="s"></div>';
    el.querySelector('.t')!.textContent = title;
    el.querySelector('.s')!.textContent = status;
    this.root.append(el);
    setTimeout(() => el.remove(), 2400);
  }

  /** the level-clear card: title, bonus, and where you are heading next */
  levelClear(title: string, bonus: string, next: string) {
    const el = document.createElement('div');
    el.className = 'clearcard';
    for (const [cls, text] of [['t', title], ['b', bonus], ['n', next]]) {
      const line = document.createElement('div');
      line.className = cls;
      line.textContent = text;
      el.append(line);
    }
    this.root.append(el);
    setTimeout(() => el.remove(), 2600);
  }

  /** a gold gem flies from a screen position into the score, which pulses when it lands */
  collect(x: number, y: number) {
    const gem = document.createElement('div');
    gem.className = 'gem';
    this.root.append(gem);
    const to = this.scoreEl.getBoundingClientRect();
    const tx = to.left + to.width / 2;
    const ty = to.top + to.height / 2;
    const mx = (x + tx) / 2 + (Math.random() - 0.5) * 120;
    const my = Math.min(y, ty) - 40;
    const anim = gem.animate(
      [
        { transform: `translate(${x}px, ${y}px) rotate(45deg) scale(1.4)`, opacity: 1 },
        { transform: `translate(${mx}px, ${my}px) rotate(225deg) scale(1)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${tx}px, ${ty}px) rotate(405deg) scale(0.5)`, opacity: 0.9 },
      ],
      { duration: 520, easing: 'cubic-bezier(.5,0,.9,.6)' },
    );
    anim.onfinish = () => {
      gem.remove();
      this.scoreEl.classList.remove('gain');
      void this.scoreEl.offsetWidth;
      this.scoreEl.classList.add('gain');
    };
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
