import { locate, SECTION_LEN } from './timeline';

/**
 * Master clock + music engine.
 *
 * The song is decoded into an AudioBuffer and played as back-to-back 8-bar sections scheduled on the
 * Web Audio clock, so a scene can repeat its section seamlessly and the run time is sample-accurate.
 *
 * Reference track analysis: 160 BPM, first beat at ~0.05s, kick on the half-time (80 BPM) grid,
 * each section = 32 beats = 8 bars = 12s.
 */
export const BPM = 160;
export const BEAT = 60 / BPM; // 0.375s
export const BEAT_OFFSET = 0.05;
export const BEATS_PER_BAR = 4;

const LOOKAHEAD = 1.5;

export interface BeatInfo {
  time: number;
  beat: number; // continuous beat count
  beatIndex: number;
  beatPhase: number; // 0..1 within beat
  bar: number; // continuous bar count
  barIndex: number;
  kick: number; // 1 on kick, decays to 0
  beatPulse: number; // 1 on every beat, decays fast
  loop: number;
  sceneIndex: number;
  sceneTime: number; // seconds since scene start
  sceneLen: number;
  sceneProgress: number; // 0..1
  songTime: number; // where we are in the reference song
}

export class BeatClock {
  private ctx: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private loading: Promise<void> | null = null;
  private filter: BiquadFilterNode | null = null;
  private analyser: AnalyserNode | null = null;
  private master: GainNode | null = null;
  private muted = false;
  private freq: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  private sources = new Set<AudioBufferSourceNode>();
  /** AudioContext time at which run time 0 happened */
  private origin = 0;
  private paused = true;
  private pausedAt = 0;
  private scheduledUntil = 0;
  /** smoothed low-band energy 0..1 from the analyser */
  bass = 0;
  /** smoothed overall energy 0..1 */
  energy = 0;

  constructor(private readonly url: string) {}

  /** Must be called from a user gesture. */
  async start() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.filter = this.ctx.createBiquadFilter();
      this.filter.type = 'lowpass';
      this.filter.frequency.value = 20000;
      this.filter.Q.value = 0.8;
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.6;
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.filter.connect(this.analyser);
      this.analyser.connect(this.master);
      this.master.connect(this.ctx.destination);
      this.freq = new Uint8Array(this.analyser.frequencyBinCount);
      this.loading = fetch(this.url)
        .then((r) => r.arrayBuffer())
        .then((b) => this.ctx!.decodeAudioData(b))
        .then((buf) => void (this.buffer = buf));
    }
    await this.ctx.resume();
    await this.loading;
    this.play();
  }

  /** the shared AudioContext (null until start) so sound effects can use the same clock */
  get context() {
    return this.ctx;
  }

  /** final output (music and sound effects both go through it) */
  get output(): AudioNode | null {
    return this.master;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 1;
  }

  get isMuted() {
    return this.muted;
  }

  get playing() {
    return !this.paused;
  }

  get time() {
    return this.paused || !this.ctx ? this.pausedAt : this.ctx.currentTime - this.origin;
  }

  toggle() {
    if (this.paused) this.play();
    else {
      this.pausedAt = this.time;
      this.paused = true;
      this.stopAll();
    }
  }

  seek(t: number) {
    this.stopAll();
    this.pausedAt = Math.max(0, t);
    if (!this.paused) this.play();
  }

  /** muffle the music (hit feedback): drops to a low-pass, then opens back up */
  muffle(seconds = 0.9) {
    if (!this.ctx || !this.filter) return;
    const f = this.filter.frequency;
    const now = this.ctx.currentTime;
    f.cancelScheduledValues(now);
    f.setValueAtTime(380, now);
    f.exponentialRampToValueAtTime(20000, now + seconds);
  }

  /** @param override fixed time (seconds) for stills / debugging */
  update(override?: number): BeatInfo {
    if (!this.paused) this.schedule();

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

    return beatInfoAt(override ?? this.time);
  }

  private play() {
    if (!this.ctx || !this.buffer) return;
    this.paused = false;
    this.origin = this.ctx.currentTime - this.pausedAt;
    this.scheduledUntil = this.pausedAt;
    this.schedule();
  }

  /** queue sections up to LOOKAHEAD seconds ahead */
  private schedule() {
    const ctx = this.ctx;
    const buf = this.buffer;
    const out = this.filter;
    if (!ctx || !buf || !out) return;
    const now = ctx.currentTime - this.origin;
    while (this.scheduledUntil < now + LOOKAHEAD) {
      const from = this.scheduledUntil;
      const place = locate(from);
      const to = from + (SECTION_LEN - (place.sceneTime % SECTION_LEN));
      let when = this.origin + from;
      let offset = place.songTime;
      let dur = to - from;
      if (when < ctx.currentTime) {
        const late = ctx.currentTime - when;
        when += late;
        offset += late;
        dur -= late;
      }
      if (dur > 0.01) {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(out);
        src.start(when, offset, dur);
        src.onended = () => this.sources.delete(src);
        this.sources.add(src);
      }
      this.scheduledUntil = to;
    }
  }

  private stopAll() {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        /* not started yet */
      }
    }
    this.sources.clear();
  }
}

export function beatInfoAt(t: number): BeatInfo {
  const beat = (t - BEAT_OFFSET) / BEAT;
  const beatIndex = Math.floor(beat);
  const beatPhase = beat - beatIndex;
  const kickPhase = ((((t - BEAT_OFFSET) / (2 * BEAT)) % 1) + 1) % 1;
  const place = locate(t);
  return {
    time: t,
    beat,
    beatIndex,
    beatPhase,
    bar: beat / BEATS_PER_BAR,
    barIndex: Math.floor(beat / BEATS_PER_BAR),
    kick: Math.exp(-kickPhase * 6),
    beatPulse: Math.exp(-beatPhase * 9),
    loop: place.loop,
    sceneIndex: place.scene,
    sceneTime: place.sceneTime,
    sceneLen: place.sceneLen,
    sceneProgress: place.sceneTime / place.sceneLen,
    songTime: place.songTime,
  };
}
