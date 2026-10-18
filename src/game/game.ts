import * as THREE from 'three/webgpu';
import type { BeatClock, BeatInfo } from '../core/beatclock';
import { sceneStart } from '../core/timeline';
import { PRESETS } from '../scenes/presets';
import { GLIDER_AHEAD, World, zAt, type Focus } from '../render/world';
import type { GameHud } from '../ui/gamehud';
import { Glider } from './glider';
import { Hazards } from './hazards';
import { SparkFX } from './fx';
import { Sfx } from './sfx';
import { LOCK_COST, Weapon, type Volley } from './weapon';
import { BEAT, BEAT_OFFSET } from '../core/beatclock';
import type { Input } from './input';
import { LaneGuides, laneSpacing } from './lanes';
import { DIFFICULTY, type Difficulty } from './difficulty';
import { FinishGate } from './gate';

/** the hyperloop is laid out this many seconds before the end of a level... */
const GATE_LEAD = 7;
/** ...and takes this long to fly through */
const HYPERLOOP_SECONDS = 2.4;
/** the hum starts this long before the glider reaches the mouth */
const HUM_LEAD = 1.2;
/** barrel roll + FOV kick after crossing the line */
const WARP_SECONDS = 1.3;
/**
 * Boost (hold Space / left mouse while firing is off) is feel only: the music and every spike are on the
 * beat, so the world speed never changes. The glider surges a little ahead of the camera, the view widens,
 * the trail stretches and light streaks past.
 */
const BOOST_SURGE = 2.2;
const BOOST_FOV = 10;
/** score multiplier while boosting */
const BOOST_SCORE = 2;
const GRAZE_RADIUS = 2.2;
const SHARD_RADIUS = 1.9;
/** below this terrain clearance you are "skimming": flux + score trickle */
const SKIM_HEIGHT = 2.4;
const DEATH_SECONDS = 0.75;

export type GameState = 'title' | 'play' | 'dead';

const LANE_HINTS: [number, string][] = [
  [2.5, 'SWITCH LANES · ← → · A D · MOUSE'],
  [8, 'PASS RIGHT NEXT TO A SPIKE TO GRAZE IT'],
  [14, 'COLLECT THE GOLD SHARDS'],
  [20, "DON'T TOUCH · 3 SHIELDS"],
];
const HINTS: [number, string][] = [
  [2.5, 'STEER · MOUSE · WASD · ARROWS'],
  [8, 'FLY CLOSE TO SPIKES TO GRAZE THEM'],
  [14, 'COLLECT THE GOLD SHARDS'],
  [20, "DON'T TOUCH · 3 SHIELDS"],
  [26, 'HOLD SPACE / CLICK TO BOOST · DOUBLE SCORE'],
];
const FIRE_HINTS: [number, string][] = [
  [2.5, 'STEER · MOUSE · WASD · ARROWS'],
  [8, 'FLY CLOSE TO SPIKES TO GRAZE THEM'],
  [14, 'HOLD SPACE / CLICK TO LOCK ON CRYSTALS'],
  [20, 'RELEASE ON THE BEAT TO SHATTER THEM'],
  [26, "DARK SPIKES CAN'T BE SHOT · DODGE THEM"],
  [32, 'GRAZE + SHARDS REFILL YOUR FLUX'],
];

/** M1 core loop: steer, graze, collect, get hit, restart the level instantly. */
export class Game {
  state: GameState = 'title';
  /** dev: ignore hits */
  god = false;
  /** alternative control scheme kept for comparison (L): snap between lanes instead of free flight */
  laneMode = false;

  score = 0;
  combo = 0;
  flux = 0;
  difficulty: Difficulty = 'hard';
  shields = DIFFICULTY.hard.shields;

  readonly glider = new Glider();
  readonly hazards = new Hazards();
  readonly fx = new SparkFX();
  readonly guides = new LaneGuides();
  readonly weapon = new Weapon();
  readonly gate = new FinishGate();
  private warpAt = -10;
  /** 0..1, eased toward whether boost is held */
  boost = 0;

  /** boost is far enough in to pay out */
  get boosted() {
    return this.boost > 0.6;
  }
  /** the glider has flown into the current hyperloop */
  private inLoop = false;
  private humming = false;
  /** lock-on firing (off: playtest found it didn't add enough; F toggles it for experiments) */
  firing = false;
  /** consecutive perfect releases */
  perfectStreak = 0;
  private lastDry = 0;
  readonly sfx: Sfx;

  private invulnUntil = 0;
  private deadUntil = 0;
  private desat = 0;
  private shake = 0;
  private lastTime = 0;
  private lastScene = -1;
  private shardChain = 0;
  private lastShardAt = 0;
  private hintIndex = 0;
  private readonly path = new THREE.Vector3();
  private readonly screen = new THREE.Vector3();
  private readonly focus: Focus = { x: 0, y: 0, bank: 0, spin: 0 };

  constructor(
    private readonly world: World,
    private readonly clock: BeatClock,
    private readonly hud: GameHud,
    private readonly input: Input,
  ) {
    world.scene.add(this.glider.group, this.glider.trailMesh, this.hazards.group, this.fx.group, this.guides.mesh, this.weapon.beamMesh, this.gate.group);
    this.sfx = new Sfx(() => clock.context, () => clock.output);
  }

  get multiplier() {
    return Math.min(8, 1 + Math.floor(this.combo / 6));
  }

  get settings() {
    return DIFFICULTY[this.difficulty];
  }

  start(difficulty: Difficulty) {
    this.difficulty = difficulty;
    this.hazards.diff = this.settings;
    this.hud.setMaxShields(this.settings.shields);
    this.state = 'play';
    this.restart(0);
  }

  setLaneMode(on: boolean, t: number) {
    this.laneMode = on;
    this.hazards.laneMode = on;
    this.onSeek(t);
    this.hud.banner(on ? 'LANES' : 'FREE FLIGHT', 1200, 'hint');
  }

  /** the clock was moved externally (debug scene jump) */
  onSeek(t: number) {
    this.weapon.reset();
    this.hazards.reset(t);
    this.glider.reset();
    this.gate.clear();
    this.lastTime = t;
    // a jump is not a level clear
    this.lastScene = -1;
  }

  update(info: BeatInfo, dt: number): Focus {
    const now = performance.now() / 1000;
    const t = info.time;
    const idx = info.sceneIndex % PRESETS.length;
    this.world.setScene(idx);
    const preset = this.world.preset;

    // the song looped: reschedule hazards from the top
    if (t < this.lastTime - 1) this.hazards.reset(t);
    this.lastTime = t;

    if (this.state === 'play' && idx !== this.lastScene) {
      if (this.lastScene >= 0) this.levelClear(this.lastScene, idx, now);
      else this.hud.banner(`${idx + 1} · ${preset.name.toUpperCase()}`, 1600, 'scene');
    }
    this.lastScene = idx;

    // first-run how-to-play, during the opening level
    const hints = this.laneMode ? LANE_HINTS : this.firing ? FIRE_HINTS : HINTS;
    if (this.state === 'play' && info.loop === 0 && idx === 0 && this.hintIndex < hints.length) {
      const [at, text] = hints[this.hintIndex];
      if (info.sceneTime >= at) {
        this.hud.banner(text, 3200, 'hint');
        this.hintIndex++;
      }
    }

    // boost: quick to kick in, a little slower to settle
    const boosting = this.state === 'play' && !this.firing && this.input.fireHeld();
    this.boost += ((boosting ? 1 : 0) - this.boost) * (1 - Math.exp(-dt * (boosting ? 7 : 3.5)));
    this.glider.boost = this.boost;

    // glider
    const gz = zAt(t) - GLIDER_AHEAD - this.boost * BOOST_SURGE;
    this.world.pathPoint(gz, this.path);
    if (this.laneMode) {
      const steps = this.input.takeLaneSteps();
      const px = this.input.pointerX();
      const live = this.state === 'play';
      this.glider.updateLanes(dt, t, live ? steps : 0, live ? px : null, preset, this.path);
    } else {
      const steer = this.input.read();
      if (this.state !== 'play') steer.axis = { x: 0, y: 0 };
      if (this.state !== 'play') steer.target = null;
      this.glider.update(dt, t, steer, preset, this.path);
    }
    const p = this.glider.position;

    this.hazards.update(t, dt, this.world, this.glider.position, this.glider.offset, this.glider.lane);
    this.guides.update(preset, gz, (z, out) => this.world.pathPoint(z, out), this.laneMode);

    // the hyperloop: laid along the path so it ends where the glider will be when the level ends
    const toEnd = info.sceneLen - info.sceneTime;
    if (this.state === 'play' && !this.gate.placed && toEnd < GATE_LEAD && toEnd > HYPERLOOP_SECONDS + 0.2) {
      const zEnd = zAt(t + toEnd) - GLIDER_AHEAD;
      this.gate.place(
        (z, out) => this.world.pathPoint(z, out),
        zEnd,
        preset.camera.speed * HYPERLOOP_SECONDS,
        // in tunnels the rock walls reach in, so the hyperloop hugs the flyable area
        preset.play.halfWidth * (preset.layers[0]?.kind === 'tube' ? 0.95 : 1.15),
        preset.hazards?.color ?? '#fff3c4',
      );
      this.inLoop = false;
      this.humming = false;
    }
    // the hum and the music's filter build start a little before the mouth, so you fly in on them;
    // the glider reaches the line exactly when the level ends
    if (this.state === 'play' && this.gate.placed && !this.humming && toEnd < HYPERLOOP_SECONDS + HUM_LEAD) {
      this.humming = true;
      this.sfx.loopEnter(toEnd);
      this.clock.filterBuild(toEnd);
    }
    if (this.state === 'play' && !this.inLoop && this.gate.inside(p.z)) {
      this.inLoop = true;
      this.hud.loopCard(`HYPERLOOP ${String(idx + 1).padStart(2, '0')}`, 'ENGAGED');
    }
    this.gate.update(this.world.camera.position.z, info.beat, info.kick);
    const warpKick = this.warp(now, p);
    this.world.fovKick = Math.max(warpKick, this.boost * BOOST_FOV);
    if (Math.random() < this.boost * 1.6) this.streaks(p, now, 1 + Math.round(this.boost));

    if (this.state === 'play') this.play(t, now, dt, p);
    else if (this.state === 'dead' && now >= this.deadUntil) this.restart(sceneStart(idx, info.loop));

    // feedback decay
    this.desat = Math.max(0, this.desat - dt * 1.1);
    this.world.post.desat.value = this.desat;
    this.shake = Math.max(0, this.shake - dt * 3);
    const invuln = now < this.invulnUntil;
    this.glider.setVisible(this.state !== 'dead' && (!invuln || Math.floor(now * 16) % 2 === 0));
    this.fx.update(now, dt, this.world.camera);
    this.hud.set(this.score, this.multiplier, this.combo, this.flux, this.shields);
    this.hud.setBoost(this.state === 'play' && this.boosted ? BOOST_SCORE : 0);

    this.focus.x = this.glider.offset.x + (Math.random() - 0.5) * this.shake;
    this.focus.y = this.glider.offset.y + (Math.random() - 0.5) * this.shake;
    // lock reticles + timing ring
    const locks = this.weapon.locks.map((s) => this.toScreen(this.hazards.tipOf(s, this.screen)));
    this.hud.setLocks(locks);
    if (this.state === 'play' && this.weapon.holding) {
      const audible = info.time - this.clock.latency;
      const phase = ((((audible - BEAT_OFFSET) / BEAT) % 1) + 1) % 1;
      this.hud.beatRing(this.toScreen(p), 1 - phase);
    } else this.hud.beatRing(null, 0);

    this.focus.bank = this.glider.bank;
    this.focus.spin = this.glider.spin;
    return this.focus;
  }

  /** crossed the finish line into the next level */
  private levelClear(prev: number, next: number, now: number) {
    const p = this.glider.position;
    const level = prev + 1;
    const bonus = 500 * level + 250 * this.shields;
    this.score += bonus;
    this.sfx.clear();
    this.world.punch(0.45);
    this.fx.ring(p, '#fff3c4', 10, now, 0.7);
    this.fx.emit(p, 40, '#fff3c4', 22, now);
    this.hud.levelClear(
      next === 0 ? `ALL ${PRESETS.length} CLEARED` : `LEVEL ${level} CLEAR`,
      `+${bonus.toLocaleString('en-US')}`,
      `ARRIVING AT ${next + 1} · ${PRESETS[next].name.toUpperCase()}`,
    );
    this.warpAt = now;
  }

  /** after a level clear: barrel roll, a wider FOV that settles back, light streaking past */
  /** @returns the warp's FOV kick in degrees */
  private warp(now: number, p: THREE.Vector3): number {
    const w = (now - this.warpAt) / WARP_SECONDS;
    if (w < 0 || w >= 1) {
      this.glider.roll = 0;
      return 0;
    }
    const r = Math.min(1, w / 0.65);
    this.glider.roll = (r < 0.5 ? 4 * r * r * r : 1 - (-2 * r + 2) ** 3 / 2) * Math.PI * 2;
    if (w < 0.7) this.streaks(p, now, 3);
    return 18 * (1 - w) ** 2;
  }

  /** light streaking past the glider toward the camera */
  private streaks(p: THREE.Vector3, now: number, count: number) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 2.5 + Math.random() * 6;
      this.streak.set(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, p.z - 25);
      this.fx.emit(this.streak, 1, i ? '#bff6ff' : '#ffffff', 1, now, this.streakDrift);
    }
  }
  private readonly streak = new THREE.Vector3();
  private readonly streakDrift = new THREE.Vector3(0, 0, 75);

  setFiring(on: boolean) {
    this.firing = on;
    this.hazards.obsidianEnabled = on;
    this.weapon.reset();
    this.hud.showFlux(on);
    this.hud.banner(on ? 'FIRING ON' : 'FIRING OFF', 1200, 'hint');
  }

  private play(t: number, now: number, dt: number, p: THREE.Vector3) {
    if (this.firing) this.fire(t, now, p);
    // boosting doubles everything you earn: the view is wider and the glider further ahead, so it's riskier
    const mult = this.multiplier * (this.boosted ? BOOST_SCORE : 1);
    this.score += dt * 10 * mult;

    // in lane mode the neighbouring lane counts as a graze
    const grazeR = this.laneMode ? Math.max(GRAZE_RADIUS, laneSpacing(this.world.preset) * 0.95) : GRAZE_RADIUS;
    const contact = this.hazards.test(p, t, this.settings.radius, grazeR, SHARD_RADIUS);
    for (const at of contact.grazes) {
      this.combo++;
      this.score += 100 * mult;
      this.flux = Math.min(1, this.flux + 0.06);
      this.fx.emit(at.lerp(p, 0.6), 16, '#ffffff', 11, now, new THREE.Vector3(0, 0, 14));
      this.popupAt(p, `GRAZE +${100 * mult}`, 'graze');
      this.sfx.graze();
    }
    if (now - this.lastShardAt > 1.5) this.shardChain = 0;
    for (const at of contact.shards) {
      this.combo++;
      this.score += 50 * mult;
      this.flux = Math.min(1, this.flux + 0.035);
      const drift = new THREE.Vector3(0, 0, 12);
      this.fx.emit(at, 18, '#ffd84a', 9, now, drift);
      this.fx.emit(at, 8, '#ffffff', 14, now, drift);
      this.fx.ring(at, '#ffe9a0', 2.6, now);
      const chain = ++this.shardChain;
      this.popupAt(p, chain > 1 ? `+${50 * mult}  ×${chain}` : `+${50 * mult}`, 'shard');
      const s = this.toScreen(at);
      this.hud.collect(s.x, s.y);
      this.sfx.chime(chain - 1);
      this.lastShardAt = now;
    }
    this.flux = Math.min(1, this.flux + contact.near * dt * 0.1);

    // terrain: skimming low pays, touching it hurts
    const clear = this.world.clearance(p.x, p.y, p.z);
    if (clear > 0 && clear < SKIM_HEIGHT) {
      const k = 1 - clear / SKIM_HEIGHT;
      this.flux = Math.min(1, this.flux + dt * 0.05 * k);
      this.score += dt * 60 * mult * k;
      if (Math.random() < dt * 30 * k) this.fx.emit(p, 1, '#bff6ff', 5, now, new THREE.Vector3(0, 0, 16));
    }

    if ((contact.hit || clear < -0.25) && now >= this.invulnUntil && !this.god) this.hit(now, p);
  }

  private fire(t: number, now: number, p: THREE.Vector3) {
    const ev = this.weapon.update(now, t, t - this.clock.latency, this.input.fireHeld(), p, this.hazards, this.flux);
    for (let i = 0; i < ev.locked.length; i++) {
      this.flux = Math.max(0, this.flux - LOCK_COST);
      this.sfx.lock(this.weapon.locks.length);
    }
    if (ev.dry && now - this.lastDry > 0.5) {
      this.lastDry = now;
      this.hud.fluxEmpty();
      this.sfx.dry();
    }
    if (ev.volley) this.scoreVolley(ev.volley, now, p);
  }

  private scoreVolley(v: Volley, now: number, p: THREE.Vector3) {
    const perfect = v.judgement === 'perfect';
    this.perfectStreak = perfect ? this.perfectStreak + 1 : 0;
    for (const s of v.hits) {
      this.combo++;
      this.score += 150 * this.multiplier * (perfect ? 2 : 1);
      const tip = this.hazards.tipOf(s, new THREE.Vector3());
      this.fx.emit(tip, 26, s.color, 18, now);
      this.fx.emit(tip, 8, '#ffffff', 26, now);
    }
    this.sfx.volley(v.judgement, v.hits.length);
    const label =
      v.judgement === 'perfect'
        ? `PERFECT ×2${this.perfectStreak > 1 ? ` · ${this.perfectStreak} IN A ROW` : ''}`
        : v.judgement === 'good'
          ? 'GOOD'
          : `OFF BEAT · ${v.error < 0 ? 'EARLY' : 'LATE'}`;
    this.popupAt(p, label, `judge ${v.judgement}`);
    if (perfect) this.world.punch(0.18);
  }

  private hit(now: number, p: THREE.Vector3) {
    this.shields--;
    this.combo = 0;
    this.shardChain = 0;
    this.invulnUntil = now + this.settings.invuln;
    this.desat = 0.9;
    this.shake = 1.4;
    this.clock.muffle();
    if (!this.laneMode) {
      this.glider.offset.multiplyScalar(0.4);
      this.glider.vel.set(0, 0);
    }
    this.fx.emit(p, 26, '#ffffff', 16, now);
    this.world.punch(0.5);

    if (this.shields <= 0) {
      this.state = 'dead';
      this.deadUntil = now + DEATH_SECONDS;
      this.fx.emit(p, 60, '#bff6ff', 26, now);
      this.hud.banner('SHATTERED', DEATH_SECONDS * 1000, 'dead');
      this.sfx.shatter();
    } else {
      this.popupAt(p, 'CRACK', 'hit');
      this.sfx.hit();
    }
  }

  private restart(at: number) {
    this.clock.seek(at);
    this.hazards.reset(at);
    this.glider.reset();
    this.fx.clear();
    this.gate.clear();
    this.warpAt = -10;
    this.boost = 0;
    this.score = 0;
    this.combo = 0;
    this.flux = this.firing ? 0.4 : 0;
    this.perfectStreak = 0;
    this.weapon.reset();
    this.shields = this.settings.shields;
    this.state = 'play';
    this.lastTime = at;
    this.lastScene = -1;
    this.invulnUntil = performance.now() / 1000 + 1.0;
  }

  private popupAt(p: THREE.Vector3, text: string, cls: string) {
    const s = this.toScreen(p);
    this.hud.popup(text, s.x, s.y - 40, cls);
  }

  private toScreen(p: THREE.Vector3) {
    this.screen.copy(p).project(this.world.camera);
    return { x: (this.screen.x * 0.5 + 0.5) * window.innerWidth, y: (-this.screen.y * 0.5 + 0.5) * window.innerHeight };
  }
}
