const rnd = (a: number, b: number) => a + Math.random() * (b - a);
/** B♭0: the hyperloop hum's root (heard mostly through its harmonics) */
const HUM_HZ = 29.135;
const SEMITONE = Math.pow(2, 1 / 12);

/** Small synthesized sound effects on the music's AudioContext (no assets). */
export class Sfx {
  private out: GainNode | null = null;
  /** pickups and rewards: louder, and sent into a long "space" reverb */
  private space: GainNode | null = null;
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
      // 2 s so looped noise (hum, sweeps) has no audible repeat
      const len = Math.floor(ctx.sampleRate * 2);
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

      // space reverb: a synthetic stereo impulse, decaying noise that darkens as it fades
      const irLen = Math.floor(ctx.sampleRate * 2.2);
      const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const ch = ir.getChannelData(c);
        let lp = 0;
        for (let i = 0; i < irLen; i++) {
          const k = i / irLen;
          lp += (Math.random() * 2 - 1 - lp) * (0.9 - 0.75 * k);
          ch[i] = lp * Math.pow(1 - k, 3.2);
        }
      }
      const verb = ctx.createConvolver();
      verb.buffer = ir;
      const wet = ctx.createGain();
      wet.gain.value = 0.7;
      verb.connect(wet).connect(this.out);
      this.space = ctx.createGain();
      this.space.gain.value = 1.6;
      this.space.connect(this.out);
      this.space.connect(verb);
    }
    return ctx;
  }

  /**
   * shard pickup ("big glitter"): a soft whoosh, a crisp tick and a wide spray of high glints.
   * No musical pitch, so it never clashes with the track; a longer chain makes the spray denser.
   */
  chime(step: number) {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.sweep(t, 2500, 9000, 0.18, 0.28, 2.5);
    this.grain(t, 'highpass', 7500, 0.7, 0.22, 0.035);
    const count = 18 + Math.min(step, 10);
    for (let i = 0; i < count; i++) {
      const k = i / count;
      this.glint(t + Math.pow(k, 1.5) * 0.26, rnd(4200, 12000), 0.075 * (1 - k) + 0.02, rnd(0.04, 0.13), rnd(-1, 1));
    }
  }

  /**
   * the hyperloop hum: a low electrical drone (detuned saws + a square an octave up, low-passed, with a
   * slight throb) that swells and brightens until the line. It sits on B♭, the fifth of E♭ that most of the
   * music is in (and a scale note of the F minor / G minor sections too), so it reads as a dominant pedal:
   * tension that resolves when the next level lands. It slides up into the note from a semitone below.
   * @param seconds time until the finish line
   */
  loopEnter(seconds: number) {
    const ctx = this.ready();
    if (!ctx || !this.out) return;
    const t = ctx.currentTime;
    const end = t + seconds;
    const vol = 0.55;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 3;
    lp.frequency.setValueAtTime(200, t);
    lp.frequency.exponentialRampToValueAtTime(850, end);
    const trem = ctx.createGain();
    trem.gain.value = 0.75;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 9;
    const depth = ctx.createGain();
    depth.gain.value = 0.25;
    lfo.connect(depth).connect(trem.gain);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    // audible quickly, then keeps growing to the line
    g.gain.exponentialRampToValueAtTime(vol * 0.5, t + Math.min(0.8, seconds * 0.3));
    g.gain.exponentialRampToValueAtTime(vol, end);
    g.gain.linearRampToValueAtTime(0, end + 0.06);
    lp.connect(trem).connect(g).connect(this.out);
    const parts: [OscillatorType, number, number][] = [['sawtooth', HUM_HZ, -7], ['sawtooth', HUM_HZ, 8], ['square', HUM_HZ * 2, 0]];
    for (const [type, f, det] of parts) {
      const o = ctx.createOscillator();
      o.type = type;
      o.detune.value = det;
      o.frequency.setValueAtTime(f / SEMITONE, t);
      o.frequency.exponentialRampToValueAtTime(f, t + Math.min(1.2, seconds * 0.5));
      o.connect(lp);
      o.start(t);
      o.stop(end + 0.1);
    }
    lfo.start(t);
    lfo.stop(end + 0.1);
  }

  /** crossing the line: a soft electric discharge (sub boom + crackle band) and a glitter shower */
  clear() {
    const ctx = this.ready();
    if (!ctx || !this.out) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(32, t + 0.6);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.45 * 1.6, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.85);
    this.grain(t, 'bandpass', 1600, 0.9, 0.35, 0.3);
    for (let i = 0; i < 40; i++) {
      const k = i / 40;
      this.glint(t + 0.05 + Math.pow(k, 1.3) * 0.9, rnd(3800, 12500), 0.07 * (1 - k) + 0.015, rnd(0.05, 0.16), rnd(-1, 1));
    }
  }

  /** a tiny sine ping: this high and this short it reads as a glint, not a note */
  private glint(t: number, freq: number, vol: number, decay: number, pan: number) {
    const ctx = this.getCtx();
    if (!ctx || !this.space) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const p = ctx.createStereoPanner();
    o.frequency.value = freq;
    p.pan.value = pan;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g).connect(p).connect(this.space);
    o.start(t);
    o.stop(t + decay + 0.02);
  }

  /** a noise grain into the space bus */
  private grain(t: number, type: BiquadFilterType, freq: number, q: number, vol: number, decay: number) {
    const ctx = this.getCtx();
    if (!ctx || !this.space || !this.noise) return;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    s.connect(f).connect(g).connect(this.space);
    s.start(t, Math.random() * 0.3);
    s.stop(t + decay + 0.02);
  }

  /** a band of noise sweeping between two frequencies, into the space bus */
  private sweep(t: number, from: number, to: number, dur: number, vol: number, q: number, pan = 0) {
    const ctx = this.getCtx();
    if (!ctx || !this.space || !this.noise) return;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(from, t);
    f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    s.connect(f).connect(g).connect(p).connect(this.space);
    s.start(t, Math.random() * 0.3);
    s.stop(t + dur + 0.02);
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
