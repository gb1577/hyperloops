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
import type { Input } from './input';

const SHIELDS = 3;
const GLIDER_RADIUS = 0.5;
const GRAZE_RADIUS = 2.2;
const SHARD_RADIUS = 1.9;
/** below this terrain clearance you are "skimming": flux + score trickle */
const SKIM_HEIGHT = 2.4;
const INVULN_SECONDS = 1.4;
const DEATH_SECONDS = 0.75;

export type GameState = 'title' | 'play' | 'dead';

const HINTS: [number, string][] = [
  [2.5, 'STEER · MOUSE · WASD · ARROWS'],
  [8, 'FLY CLOSE TO SPIKES TO GRAZE THEM'],
  [14, 'COLLECT THE GOLD SHARDS'],
  [20, "DON'T TOUCH · 3 SHIELDS"],
];

/** M1 core loop: steer, graze, collect, get hit, restart the level instantly. */
export class Game {
  state: GameState = 'title';
  /** dev: ignore hits */
  god = false;

  score = 0;
  combo = 0;
  flux = 0;
  shields = SHIELDS;

  readonly glider = new Glider();
  readonly hazards = new Hazards();
  readonly fx = new SparkFX();
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
  private readonly focus: Focus = { x: 0, y: 0, bank: 0 };

  constructor(
    private readonly world: World,
    private readonly clock: BeatClock,
    private readonly hud: GameHud,
    private readonly input: Input,
  ) {
    world.scene.add(this.glider.group, this.glider.trailMesh, this.hazards.group, this.fx.mesh);
    this.sfx = new Sfx(() => clock.context, () => clock.output);
  }

  get multiplier() {
    return Math.min(8, 1 + Math.floor(this.combo / 6));
  }

  start() {
    this.state = 'play';
    this.restart(0);
  }

  /** the clock was moved externally (debug scene jump) */
  onSeek(t: number) {
    this.hazards.reset(t);
    this.glider.reset();
    this.lastTime = t;
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
      this.hud.banner(`${idx + 1} · ${preset.name.toUpperCase()}`, 1600, 'scene');
    }
    this.lastScene = idx;

    // first-run how-to-play, during the opening level
    if (this.state === 'play' && info.loop === 0 && idx === 0 && this.hintIndex < HINTS.length) {
      const [at, text] = HINTS[this.hintIndex];
      if (info.sceneTime >= at) {
        this.hud.banner(text, 3200, 'hint');
        this.hintIndex++;
      }
    }

    // glider
    const gz = zAt(t) - GLIDER_AHEAD;
    this.world.pathPoint(gz, this.path);
    const steer = this.input.read();
    if (this.state !== 'play') steer.axis = { x: 0, y: 0 };
    if (this.state !== 'play') steer.target = null;
    this.glider.update(dt, t, steer, preset, this.path);
    const p = this.glider.position;

    this.hazards.update(t, this.world, this.glider.offset);

    if (this.state === 'play') this.play(t, now, dt, p);
    else if (this.state === 'dead' && now >= this.deadUntil) this.restart(sceneStart(idx, info.loop));

    // feedback decay
    this.desat = Math.max(0, this.desat - dt * 1.1);
    this.world.post.desat.value = this.desat;
    this.shake = Math.max(0, this.shake - dt * 3);
    const invuln = now < this.invulnUntil;
    this.glider.setVisible(this.state !== 'dead' && (!invuln || Math.floor(now * 16) % 2 === 0));
    this.fx.update(now, dt);
    this.hud.set(this.score, this.multiplier, this.combo, this.flux, this.shields);

    this.focus.x = this.glider.offset.x + (Math.random() - 0.5) * this.shake;
    this.focus.y = this.glider.offset.y + (Math.random() - 0.5) * this.shake;
    this.focus.bank = this.glider.bank;
    return this.focus;
  }

  private play(t: number, now: number, dt: number, p: THREE.Vector3) {
    const mult = this.multiplier;
    this.score += dt * 10 * mult;

    const contact = this.hazards.test(p, t, GLIDER_RADIUS, GRAZE_RADIUS, SHARD_RADIUS);
    for (const at of contact.grazes) {
      this.combo++;
      this.score += 100 * this.multiplier;
      this.flux = Math.min(1, this.flux + 0.08);
      this.fx.emit(at.lerp(p, 0.6), 16, '#ffffff', 11, now, new THREE.Vector3(0, 0, 14));
      this.popupAt(p, `GRAZE +${100 * this.multiplier}`, 'graze');
      this.sfx.graze();
    }
    if (now - this.lastShardAt > 1.5) this.shardChain = 0;
    for (const at of contact.shards) {
      this.combo++;
      this.score += 50 * this.multiplier;
      this.flux = Math.min(1, this.flux + 0.05);
      this.fx.emit(at, 12, '#ffd84a', 8, now, new THREE.Vector3(0, 0, 12));
      this.popupAt(p, `+${50 * this.multiplier}`, 'shard');
      this.sfx.chime(this.shardChain++);
      this.lastShardAt = now;
    }
    this.flux = Math.min(1, this.flux + contact.near * dt * 0.35);

    // terrain: skimming low pays, touching it hurts
    const clear = this.world.clearance(p.x, p.y, p.z);
    if (clear > 0 && clear < SKIM_HEIGHT) {
      const k = 1 - clear / SKIM_HEIGHT;
      this.flux = Math.min(1, this.flux + dt * 0.2 * k);
      this.score += dt * 60 * mult * k;
      if (Math.random() < dt * 30 * k) this.fx.emit(p, 1, '#bff6ff', 5, now, new THREE.Vector3(0, 0, 16));
    }

    if ((contact.hit || clear < -0.25) && now >= this.invulnUntil && !this.god) this.hit(now, p);
  }

  private hit(now: number, p: THREE.Vector3) {
    this.shields--;
    this.combo = 0;
    this.shardChain = 0;
    this.invulnUntil = now + INVULN_SECONDS;
    this.desat = 0.9;
    this.shake = 1.4;
    this.clock.muffle();
    this.glider.offset.multiplyScalar(0.4);
    this.glider.vel.set(0, 0);
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
    this.score = 0;
    this.combo = 0;
    this.flux = 0;
    this.shields = SHIELDS;
    this.state = 'play';
    this.lastTime = at;
    this.lastScene = -1;
    this.invulnUntil = performance.now() / 1000 + 1.0;
  }

  private popupAt(p: THREE.Vector3, text: string, cls: string) {
    this.screen.copy(p).project(this.world.camera);
    const x = (this.screen.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-this.screen.y * 0.5 + 0.5) * window.innerHeight - 40;
    this.hud.popup(text, x, y, cls);
  }
}
