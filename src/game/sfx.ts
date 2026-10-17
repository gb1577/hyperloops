/** Small synthesized sound effects on the music's AudioContext (no assets). */
export class Sfx {
  private out: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  constructor(
    private readonly getCtx: () => AudioContext | null,
    private readonly getOut: () => AudioNode | null,
  ) {}

  private ready(): AudioContext | null {
    const ctx = this.getCtx();
    if (!ctx) return null;
    if (!this.out) {
      this.out = ctx.createGain();
      this.out.gain.value = 0.5;
      this.out.connect(this.getOut() ?? ctx.destination);
      const len = Math.floor(ctx.sampleRate * 0.5);
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return ctx;
  }

  /** shard pickup: a glassy pluck climbing a minor-pentatonic ladder with the chain */
  chime(step: number) {
    const ctx = this.ready();
    if (!ctx || !this.out) return;
    const scale = [0, 3, 5, 7, 10];
    const n = Math.min(step, 14);
    const semis = scale[n % 5] + 12 * Math.floor(n / 5);
    const f = 880 * Math.pow(2, semis / 12);
    const t = ctx.currentTime;
    for (const [mult, type, vol] of [[1, 'triangle', 0.22], [2, 'sine', 0.08]] as const) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = f * mult;
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g).connect(this.out);
      o.start(t);
      o.stop(t + 0.4);
    }
  }

  /** lock-on tick, rising with each lock */
  lock(n: number) {
    this.tone(1320 * Math.pow(2, (n * 3) / 12), 'square', 0.05, 0.06);
  }

  /** out of flux */
  dry() {
    this.tone(180, 'sawtooth', 0.08, 0.06);
  }

  /** the volley: a chord in key on perfect, a single note on good, a dull knock off-beat */
  volley(judgement: 'perfect' | 'good' | 'off', count: number) {
    if (judgement === 'perfect') {
      for (const semis of [0, 7, 12, 15].slice(0, Math.max(2, count))) this.tone(440 * Math.pow(2, semis / 12), 'triangle', 0.5, 0.14);
      this.noiseBurst(6000, 'highpass', 0.35, 0.12);
    } else if (judgement === 'good') {
      this.tone(440, 'triangle', 0.3, 0.14);
      this.noiseBurst(5000, 'highpass', 0.25, 0.1);
    } else {
      this.tone(110, 'sine', 0.2, 0.25);
    }
    this.noiseBurst(2400, 'bandpass', 0.22, 0.18);
  }

  private tone(freq: number, type: OscillatorType, dur: number, vol: number) {
    const ctx = this.ready();
    if (!ctx || !this.out) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** graze: a short bright swish */
  graze() {
    this.noiseBurst(5500, 'highpass', 0.13, 0.12);
  }

  /** hit: low thud + crunch */
  hit() {
    const ctx = this.ready();
    if (!ctx || !this.out) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.3);
    g.gain.setValueAtTime(0.6, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.4);
    this.noiseBurst(1800, 'bandpass', 0.25, 0.3);
  }

  /** death: long glassy shatter */
  shatter() {
    this.noiseBurst(3000, 'highpass', 0.5, 0.35);
    this.hit();
  }

  private noiseBurst(freq: number, type: BiquadFilterType, dur: number, vol: number) {
    const ctx = this.ready();
    if (!ctx || !this.out || !this.noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.out);
    src.start(t);
    src.stop(t + dur + 0.05);
  }
}
