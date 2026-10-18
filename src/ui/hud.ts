import type { BeatInfo } from '../core/beatclock';
import type { Difficulty } from '../game/difficulty';
import logoUrl from '../assets/logo.png';

export type RefMode = 'off' | 'pip' | 'wipe';

/** Debug HUD, start screen, and the reference-video compare overlay (dev only). */
export class Hud {
  readonly root = document.getElementById('app')!;
  readonly ref: HTMLVideoElement;
  private readonly hud: HTMLDivElement;
  private readonly start: HTMLDivElement;
  private refMode: RefMode = 'off';
  private fpsAcc = 0;
  private fpsFrames = 0;
  private fps = 0;

  constructor(backend: string) {
    this.ref = document.createElement('video');
    this.ref.id = 'ref';
    // the reference video lives only on the dev machine (ref/ is not in the repo): load it on first use
    this.ref.muted = true;
    this.ref.playsInline = true;
    this.ref.preload = 'auto';
    const wipeLine = document.createElement('div');
    wipeLine.id = 'wipe-line';

    this.hud = document.createElement('div');
    this.hud.id = 'hud';
    this.hud.className = 'hidden';
    this.hud.dataset.backend = backend;

    this.start = document.createElement('div');
    this.start.id = 'start';
    this.start.innerHTML = `
      <h1 class="logo" style="--logo: url(${logoUrl})"><img src="${logoUrl}" alt="HYPERLOOPS"></h1>
      <p>steer with mouse · WASD / arrows · gamepad · touch-drag</p>
      <p>graze the crystal spikes · skim the ground · don't touch · hold space / click to boost for ×2 score</p>
      <p style="color:#99a">renderer: ${backend}</p>
      <div class="modes">
        <button class="go" data-d="easy">EASY<small>more shields · fewer spikes</small></button>
        <button class="go" data-d="hard">HARD<small>the full pattern</small></button>
      </div>`;

    this.root.append(this.ref, wipeLine, this.hud, this.start);
  }

  /** start buttons; `preferred` is highlighted (Enter picks it) */
  onStart(preferred: Difficulty, fn: (d: Difficulty) => void) {
    const buttons = [...this.start.querySelectorAll<HTMLButtonElement>('button[data-d]')];
    let done = false;
    const go = (d: Difficulty) => {
      if (done) return;
      done = true;
      this.start.classList.add('hidden');
      window.removeEventListener('keydown', onKey);
      fn(d);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Enter') go(preferred);
    };
    for (const b of buttons) {
      b.classList.toggle('preferred', b.dataset.d === preferred);
      b.addEventListener('click', () => go(b.dataset.d as Difficulty));
    }
    window.addEventListener('keydown', onKey);
  }

  cycleRef(): RefMode {
    const order: RefMode[] = ['off', 'pip', 'wipe'];
    this.refMode = order[(order.indexOf(this.refMode) + 1) % order.length];
    if (this.refMode !== 'off' && !this.ref.src) this.ref.src = '/ref/hyperloops-01-game.mp4';
    this.ref.className = this.refMode === 'off' ? '' : this.refMode;
    return this.refMode;
  }

  toggle() {
    this.hud.classList.toggle('hidden');
  }

  /** keep the reference video locked to the master clock */
  syncRef(time: number, playing: boolean) {
    if (this.refMode === 'off' || !this.ref.duration) return;
    const t = time % this.ref.duration;
    if (Math.abs(this.ref.currentTime - t) > 0.12) this.ref.currentTime = t;
    if (playing && this.ref.paused) void this.ref.play().catch(() => {});
    if (!playing && !this.ref.paused) this.ref.pause();
  }

  update(info: BeatInfo, sceneName: string, sceneNo: number, total: number, dt: number) {
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc > 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsAcc);
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
    const mm = Math.floor(info.time / 60);
    const ss = (info.time % 60).toFixed(1).padStart(4, '0');
    const beatInBar = ((info.beatIndex % 4) + 4) % 4;
    const barInScene = Math.floor(info.sceneTime / (60 / 160) / 4);
    const barsInScene = Math.round(info.sceneLen / (60 / 160) / 4);
    let dots = '';
    for (let i = 0; i < 4; i++) dots += `<i class="${i === beatInBar ? 'on' : ''}"></i>`;
    this.hud.innerHTML = `
      <div class="scene">${sceneNo}/${total} · ${sceneName}</div>
      <div class="beats">${dots}</div>
      <div class="row"><span>time</span><span>${mm}:${ss}</span></div>
      <div class="row"><span>bar in scene</span><span>${barInScene + 1}/${barsInScene}</span></div>
      <div class="row"><span>fps · ${this.hud.dataset.backend}</span><span>${this.fps}</span></div>
      <div class="row"><span>ref video</span><span>${this.refMode}</span></div>
      <div class="keys">DEV · [ ] scene · 1-9,0 jump · I invincible · J lanes · F firing · V ref video · H hud · type loops to lock</div>`;
  }
}
