/**
 * Master clock. The audio element is the source of truth; between its (coarse) currentTime
 * updates we extrapolate with performance.now() so visuals stay smooth.
 *
 * Reference track analysis: 160 BPM, first beat at ~0.05s, kick on the half-time (80 BPM) grid,
 * each scene = 32 beats = 8 bars = 12s.
 */
export const BPM = 160;
export const BEAT = 60 / BPM; // 0.375s
export const BEAT_OFFSET = 0.05;
export const BEATS_PER_BAR = 4;
export const SCENE_BEATS = 32;
export const SCENE_LEN = SCENE_BEATS * BEAT; // 12s

export interface BeatInfo {
  time: number;
  beat: number; // continuous beat count
  beatIndex: number;
  beatPhase: number; // 0..1 within beat
  bar: number; // continuous bar count
  barIndex: number;
  kick: number; // 1 on kick, decays to 0
  beatPulse: number; // 1 on every beat, decays fast
  sceneIndex: number;
  sceneTime: number; // seconds since scene start
  sceneProgress: number; // 0..1
}

export class BeatClock {
  readonly audio: HTMLAudioElement;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private freq: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  private lastAudioTime = -1;
  private lastPerf = 0;
  private smoothTime = 0;
  /** smoothed low-band energy 0..1 from the analyser */
  bass = 0;
  /** smoothed overall energy 0..1 */
  energy = 0;

  constructor(src: string) {
    this.audio = new Audio(src);
    this.audio.preload = 'auto';
    this.audio.loop = true;
  }

  /** Must be called from a user gesture. */
  async start() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      const srcNode = this.ctx.createMediaElementSource(this.audio);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.6;
      srcNode.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
      this.freq = new Uint8Array(this.analyser.frequencyBinCount);
    }
    await this.ctx.resume();
    await this.audio.play();
  }

  get playing() {
    return !this.audio.paused;
  }

  toggle() {
    if (this.audio.paused) void this.audio.play();
    else this.audio.pause();
  }

  seek(t: number) {
    const dur = this.audio.duration || 120;
    this.audio.currentTime = ((t % dur) + dur) % dur;
    this.lastAudioTime = -1;
  }

  get duration() {
    return this.audio.duration || 120;
  }

  /** @param override fixed time (seconds) for stills / debugging */
  update(override?: number): BeatInfo {
    const now = performance.now();
    const at = this.audio.currentTime;
    if (at !== this.lastAudioTime) {
      this.lastAudioTime = at;
      this.lastPerf = now;
      // snap if far off (seek / loop), otherwise ease toward the real time
      if (Math.abs(at - this.smoothTime) > 0.1) this.smoothTime = at;
    }
    if (!this.audio.paused) {
      const predicted = this.lastAudioTime + (now - this.lastPerf) / 1000;
      this.smoothTime += (predicted - this.smoothTime) * 0.5;
    }
    const t = override ?? this.smoothTime;

    if (this.analyser) {
      this.analyser.getByteFrequencyData(this.freq);
      // bins are ~47Hz wide at 48kHz/1024
      let low = 0;
      for (let i = 1; i < 4; i++) low += this.freq[i];
      low /= 3 * 255;
      let all = 0;
      for (let i = 1; i < 200; i++) all += this.freq[i];
      all /= 199 * 255;
      this.bass += (low - this.bass) * 0.35;
      this.energy += (all - this.energy) * 0.1;
    }

    return beatInfoAt(t);
  }
}

export function beatInfoAt(t: number): BeatInfo {
  const beat = (t - BEAT_OFFSET) / BEAT;
  const beatIndex = Math.floor(beat);
  const beatPhase = beat - beatIndex;
  const kickPhase = ((((t - BEAT_OFFSET) / (2 * BEAT)) % 1) + 1) % 1;
  const sceneIndex = Math.max(0, Math.floor(t / SCENE_LEN));
  const sceneTime = t - sceneIndex * SCENE_LEN;
  return {
    time: t,
    beat,
    beatIndex,
    beatPhase,
    bar: beat / BEATS_PER_BAR,
    barIndex: Math.floor(beat / BEATS_PER_BAR),
    kick: Math.exp(-kickPhase * 6),
    beatPulse: Math.exp(-beatPhase * 9),
    sceneIndex,
    sceneTime,
    sceneProgress: sceneTime / SCENE_LEN,
  };
}
