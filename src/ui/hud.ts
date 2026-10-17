import type { BeatInfo } from '../core/beatclock';

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
    this.ref.src = '/ref/hyperloops-01-game.mp4';
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
      <h1>HYPER<b>LOOPS</b></h1>
      <p>steer with mouse · WASD / arrows · gamepad · touch-drag</p>
      <p>graze the crystal spikes · skim the ground · don't touch</p>
      <p style="color:#99a">renderer: ${backend}</p>
      <div class="go">CLICK TO FLY</div>`;

    this.root.append(this.ref, wipeLine, this.hud, this.start);
  }

  onStart(fn: () => void) {
    const go = () => {
      this.start.classList.add('hidden');
      fn();
    };
    this.start.addEventListener('click', go, { once: true });
  }

  cycleRef(): RefMode {
    const order: RefMode[] = ['off', 'pip', 'wipe'];
    this.refMode = order[(order.indexOf(this.refMode) + 1) % order.length];
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
      <div class="keys">esc pause · M mute · [ ] scene · 1-9,0 jump · I invincible · V ref video · H hud</div>`;
  }
}
