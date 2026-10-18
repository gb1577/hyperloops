import * as THREE from 'three/webgpu';
import { BEAT, BEAT_OFFSET } from '../core/beatclock';
import { locate } from '../core/timeline';
import { hash2, lerp } from '../core/noise';
import { PRESETS } from '../scenes/presets';
import type { ScenePreset } from '../scenes/types';
import { GLIDER_AHEAD, World, zAt } from '../render/world';
import type { TerrainLayer } from '../render/terrain';
import { isTube, laneAngle, laneCount, laneOffset, laneSpacing, normLane } from './lanes';
import { DIFFICULTY, type DifficultySettings } from './difficulty';

const MAX_SPIKES = 128;
const MAX_SHARDS = 96;
/** the ground ring glows this many beats before the spike erupts */
const TELEGRAPH_BEATS = 1;
/** spikes erupt this many beats before the glider reaches them */
const ERUPT_LEAD = 2;
const RISE_BEATS = 0.25;
const SEED = 9137;

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const beatTime = (b: number) => BEAT_OFFSET + b * BEAT;

export interface Spike {
  passBeat: number;
  base: THREE.Vector3;
  dir: THREE.Vector3;
  quat: THREE.Quaternion;
  radius: number;
  height: number;
  /** current eruption 0..1 */
  rise: number;
  grazedAt: number;
  hitAt: number;
  /** shot by the player: shrinks away and stops colliding */
  shatteredAt: number;
  /** dark spikes can't be shot */
  obsidian: boolean;
  locked: boolean;
  color: THREE.Color;
}

interface Shard {
  pos: THREE.Vector3;
  takenAt: number;
  /** dropped by a shattered spike: drifts toward the glider */
  magnet: boolean;
}

export interface HazardContact {
  hit: boolean;
  /** spikes grazed for the first time this frame (graze points) */
  grazes: THREE.Vector3[];
  /** shards collected this frame */
  shards: THREE.Vector3[];
  /** 0..1 how close the glider is to the nearest spike surface (inside the graze zone) */
  near: number;
}

/**
 * Beat-scheduled crystal spikes and light shards, laid out in musical patterns:
 *   scatter — loose spikes, some tall, some low enough to skim over
 *   wall    — on the downbeat a row of tall spikes with one gap (in tunnels: half the tube blocked)
 *   slalom  — one tall spike per beat, alternating sides
 *   aimed   — tall spikes on beats 1 and 3 placed where the player is flying
 * Placement depends only on the beat number (except "aimed"), so a song plays the same every time.
 */
export class Hazards {
  readonly group = new THREE.Group();
  private readonly spikeMesh: THREE.InstancedMesh;
  private readonly ringMesh: THREE.InstancedMesh;
  private readonly shardMesh: THREE.InstancedMesh;
  private readonly spikeMat: THREE.MeshLambertNodeMaterial;
  private readonly obsidianMesh: THREE.InstancedMesh;
  private readonly wireCoreMesh: THREE.InstancedMesh;
  private readonly wireMesh: THREE.InstancedMesh;
  private wireStyle = false;
  private readonly glider = new THREE.Vector3();
  private spikes: Spike[] = [];
  private shards: Shard[] = [];
  private nextBeat = 0;
  private scene = -1;
  private readonly m = new THREE.Matrix4();
  private readonly s = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly c = new THREE.Color();
  private readonly tmpPos = new THREE.Vector3();
  private readonly tmpDir = new THREE.Vector3();
  private readonly path = new THREE.Vector3();
  private readonly player = new THREE.Vector2();
  private playerLane = 2;
  /** easy / hard tuning of the patterns */
  diff: DifficultySettings = DIFFICULTY.hard;
  /** dark unshootable spikes only make sense while firing is enabled */
  obsidianEnabled = false;
  /** lane prototype: spikes and shards snap to lanes */
  laneMode = false;

  constructor() {
    const cone = new THREE.ConeGeometry(1, 1, 5, 1).toNonIndexed();
    cone.translate(0, 0.5, 0);
    cone.computeVertexNormals();
    this.spikeMat = new THREE.MeshLambertNodeMaterial({ flatShading: true, side: THREE.DoubleSide });
    this.spikeMesh = instanced(cone, this.spikeMat, MAX_SPIKES);
    const obsidianMat = new THREE.MeshStandardNodeMaterial({
      color: '#17151f',
      roughness: 0.22,
      metalness: 0.7,
      flatShading: true,
      side: THREE.DoubleSide,
    });
    this.obsidianMesh = instanced(cone, obsidianMat, MAX_SPIKES);
    // wire style: a near-black core pushed back in depth so the glowing edges always win over it
    const coreMat = new THREE.MeshBasicNodeMaterial({
      color: '#010404',
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    this.wireCoreMesh = instanced(cone, coreMat, MAX_SPIKES);
    this.wireMesh = instanced(cone, new THREE.MeshBasicNodeMaterial({ wireframe: true }), MAX_SPIKES);

    const ring = new THREE.RingGeometry(0.75, 1, 24, 1);
    ring.rotateX(-Math.PI / 2);
    this.ringMesh = instanced(ring, additive(), MAX_SPIKES);

    const shard = new THREE.OctahedronGeometry(0.55, 0);
    shard.scale(0.75, 1.3, 0.75);
    this.shardMesh = instanced(shard, additive(), MAX_SHARDS);

    this.group.add(this.spikeMesh, this.obsidianMesh, this.wireCoreMesh, this.wireMesh, this.ringMesh, this.shardMesh);
  }

  /** forget everything and start scheduling from time t (after a seek / restart) */
  reset(t: number) {
    this.spikes = [];
    this.shards = [];
    this.nextBeat = Math.floor((t - BEAT_OFFSET) / BEAT) + ERUPT_LEAD + 1;
    this.scene = -1;
  }

  /** @param playerOffset glider offset from the path (and lane), used by "aimed" bars */
  update(t: number, dt: number, world: World, gliderPos: THREE.Vector3, playerOffset: THREE.Vector2, playerLane: number) {
    this.glider.copy(gliderPos);
    this.player.copy(playerOffset);
    this.playerLane = playerLane;
    if (world.sceneIndex !== this.scene) {
      // terrain was rebuilt: anything placed on the old geometry no longer fits
      this.scene = world.sceneIndex;
      this.spikes = [];
      this.shards = [];
      const col = new THREE.Color(PRESETS[this.scene].hazards?.color ?? '#ffffff');
      this.spikeMat.emissive.copy(col).multiplyScalar(0.55);
      this.wireStyle = PRESETS[this.scene].hazards?.style === 'wire';
    }

    const window = (ERUPT_LEAD + TELEGRAPH_BEATS + 0.5) * BEAT;
    while (beatTime(this.nextBeat) - window <= t) {
      this.spawnBeat(this.nextBeat, world);
      this.nextBeat++;
    }

    const camZ = world.camera.position.z;
    this.spikes = this.spikes.filter((s) => s.base.z < camZ + 6);
    this.shards = this.shards.filter((s) => s.pos.z < camZ + 4 && (s.takenAt === 0 || t - s.takenAt < 0.25));

    let n = 0;
    let o = 0;
    let w = 0;
    let ri = 0;
    for (const s of this.spikes) {
      const tE = beatTime(s.passBeat - ERUPT_LEAD);
      const tel = THREE.MathUtils.clamp((t - (tE - TELEGRAPH_BEATS * BEAT)) / (TELEGRAPH_BEATS * BEAT), 0, 1);
      let rise = t < tE ? 0 : easeOutBack(Math.min(1, (t - tE) / (RISE_BEATS * BEAT)));
      if (s.hitAt > 0) rise *= Math.max(0, 1 - (t - s.hitAt) / 0.2);
      if (s.shatteredAt > 0) rise *= Math.max(0, 1 - (t - s.shatteredAt) / 0.12);
      s.rise = rise;

      // ring: builds up during the telegraph, fades after eruption
      const ringGlow = t < tE ? tel * (0.55 + 0.45 * Math.sin(tel * Math.PI * 4) ** 2) : Math.max(0, 1 - (t - tE) / BEAT);
      this.s.setScalar(s.radius * (2 - tel * 0.6));
      this.tmpPos.copy(s.base).addScaledVector(s.dir, 0.9);
      this.m.compose(this.tmpPos, s.quat, this.s);
      this.ringMesh.setMatrixAt(ri, this.m);
      this.ringMesh.setColorAt(ri, this.c.copy(s.obsidian ? OBSIDIAN_RING : s.color).multiplyScalar(ringGlow * 2));
      ri++;

      this.s.set(s.radius, Math.max(0.001, s.height * rise), s.radius);
      this.m.compose(s.base, s.quat, this.s);
      const glow = s.grazedAt > 0 ? Math.max(0, 1 - (t - s.grazedAt) / 0.35) : 0;
      if (s.obsidian) {
        this.obsidianMesh.setMatrixAt(o, this.m);
        this.obsidianMesh.setColorAt(o, this.c.setScalar(1 + glow * 2));
        o++;
      } else {
        const lock = s.locked ? 0.5 + 0.5 * Math.sin(t * 30) : 0;
        this.c.copy(s.color).lerp(WHITE, glow * 0.8 + lock * 0.4).multiplyScalar(1 + glow * 1.5 + lock);
        if (this.wireStyle) {
          this.wireCoreMesh.setMatrixAt(w, this.m);
          this.wireMesh.setMatrixAt(w, this.m);
          this.wireMesh.setColorAt(w, this.c.multiplyScalar(1.4));
          w++;
        } else {
          this.spikeMesh.setMatrixAt(n, this.m);
          this.spikeMesh.setColorAt(n, this.c);
          n++;
        }
      }
    }
    finish(this.spikeMesh, n);
    finish(this.wireCoreMesh, w);
    finish(this.wireMesh, w);
    finish(this.obsidianMesh, o);
    finish(this.ringMesh, ri);

    let k = 0;
    for (const sh of this.shards) {
      if (sh.magnet && sh.takenAt === 0) {
        const d = sh.pos.distanceTo(this.glider);
        if (d < 26) sh.pos.lerp(this.glider, Math.min(1, dt * (5 + 60 / Math.max(d, 1))));
      }
      // taken: pops to white and swells, then implodes while spinning fast
      const taken = sh.takenAt > 0 ? (t - sh.takenAt) / 0.25 : 0;
      const scale = taken > 0 ? (taken < 0.3 ? 1 + taken * 3 : 1.9 * (1 - (taken - 0.3) / 0.7) ** 2) : 1 + 0.15 * Math.sin(t * 9 + sh.pos.z);
      this.q.setFromAxisAngle(Y_AXIS, t * 3 + sh.pos.x + taken * 9);
      this.s.setScalar(scale);
      this.m.compose(sh.pos, this.q, this.s);
      this.shardMesh.setMatrixAt(k, this.m);
      this.c.set('#ffd84a');
      if (taken > 0) this.c.lerp(WHITE, 1 - taken * 0.6).multiplyScalar(4 * (1 - taken * 0.5));
      else this.c.multiplyScalar(1.9);
      this.shardMesh.setColorAt(k, this.c);
      k++;
    }
    finish(this.shardMesh, k);
  }

  /** collide the glider (a sphere) against erupted spikes (cones) and shards */
  test(p: THREE.Vector3, t: number, radius: number, grazeRadius: number, shardRadius: number): HazardContact {
    const out: HazardContact = { hit: false, grazes: [], shards: [], near: 0 };
    const ab = this.tmpDir;
    for (const s of this.spikes) {
      if (s.rise < 0.15 || s.hitAt > 0 || s.shatteredAt > 0) continue;
      const h = s.height * s.rise;
      if (Math.abs(s.base.z - p.z) > h + s.radius + grazeRadius) continue;
      ab.copy(s.dir).multiplyScalar(h);
      const u = THREE.MathUtils.clamp(this.tmpPos.copy(p).sub(s.base).dot(ab) / (h * h), 0, 1);
      const axisPoint = this.tmpPos.copy(s.base).addScaledVector(ab, u);
      const gap = axisPoint.distanceTo(p) - s.radius * (1 - u);
      if (gap < radius) {
        out.hit = true;
        s.hitAt = t;
      } else if (gap < grazeRadius) {
        out.near = Math.max(out.near, 1 - (gap - radius) / (grazeRadius - radius));
        if (s.grazedAt === 0) {
          s.grazedAt = t;
          out.grazes.push(axisPoint.clone());
        }
      }
    }
    for (const sh of this.shards) {
      if (sh.takenAt === 0 && sh.pos.distanceTo(p) < shardRadius) {
        sh.takenAt = t;
        out.shards.push(sh.pos.clone());
      }
    }
    return out;
  }

  /** crystal spikes ahead that can be locked onto, nearest to the glider's line first */
  targets(p: THREE.Vector3, t: number, maxAhead = 80): Spike[] {
    const list: { s: Spike; score: number }[] = [];
    for (const s of this.spikes) {
      if (s.obsidian || s.locked || s.shatteredAt > 0 || s.hitAt > 0) continue;
      const ahead = p.z - s.base.z;
      if (ahead < 6 || ahead > maxAhead) continue;
      // only spikes that are erupting or about to (their ring is glowing)
      if (t < beatTime(s.passBeat - ERUPT_LEAD) - TELEGRAPH_BEATS * BEAT) continue;
      const tip = this.tipOf(s, this.tmpPos);
      const side = Math.hypot(tip.x - p.x, tip.y - p.y);
      list.push({ s, score: side + ahead * 0.15 });
    }
    return list.sort((a, b) => a.score - b.score).map((e) => e.s);
  }

  /** the spike's full-height tip (where lock markers and beams aim) */
  tipOf(s: Spike, out: THREE.Vector3) {
    return out.copy(s.base).addScaledVector(s.dir, s.height * 0.75);
  }

  /** shoot a spike: it shrinks away and drops a shard that flies to the glider */
  shatter(s: Spike, t: number) {
    s.shatteredAt = t;
    s.locked = false;
    const pos = this.tipOf(s, new THREE.Vector3());
    this.shards.push({ pos, takenAt: 0, magnet: true });
    if (this.shards.length > MAX_SHARDS) this.shards.shift();
  }

  // ---------------------------------------------------------------- placement

  private spawnBeat(beat: number, world: World) {
    const tp = beatTime(beat);
    const tEarly = tp - (ERUPT_LEAD + TELEGRAPH_BEATS) * BEAT;
    const idx = world.sceneIndex;
    const here = locate(tp);
    if (here.scene !== idx || locate(tEarly).scene !== idx) return;
    const p = PRESETS[idx];
    const hz = p.hazards;
    if (!hz) return;

    // structure: one pattern per bar; the last bar of a scene is left clear for the transition
    const barInScene = Math.floor(here.sceneTime / (BEAT * 4));
    const barsInScene = Math.round(here.sceneLen / (BEAT * 4));
    if (barInScene >= barsInScene - 1) return;
    const beatInBar = ((beat % 4) + 4) % 4;
    const pattern = hz.patterns.length ? hz.patterns[barInScene % hz.patterns.length] : null;
    // density ramps up through the scene
    const ramp = 0.75 + (0.5 * here.sceneTime) / here.sceneLen;
    const z = zAt(tp) - GLIDER_AHEAD;
    const h = (salt: number) => hash2(beat, salt, SEED);
    const tube = hz.place === 'wall';
    const hw = p.play.halfWidth;

    if (this.laneMode) {
      this.spawnLaneBeat(world, p, beat, beatInBar, pattern, ramp, z, h, idx === 0);
      return;
    }

    if (pattern === 'wall' && beatInBar === 0) {
      if (tube) {
        // block the side of the tunnel opposite the gap; the tips cross the centre
        const open = h(1) * Math.PI * 2;
        const reach = this.diff.tubeWallReach;
        for (let i = -reach; i <= reach; i++) this.spikeTube(world, p, open + Math.PI + i * 0.62, z, beat, 'cross', h(10 + i));
        this.addShard(world, z, Math.cos(open) * hw * 0.7, Math.sin(open) * hw * 0.7);
      } else {
        const r = hz.radius[1];
        const gapX = (h(1) * 2 - 1) * hw * 0.65;
        const gapHalf = 2.6 * this.diff.wallGap;
        let i = 0;
        for (let x = -hw - 2; x <= hw + 2; x += r * 1.7, i++) {
          if (Math.abs(x - gapX) < gapHalf + r * 0.6) continue;
          this.spikeFlat(world, p, x, z, beat, 'tall', r, h(20 + i));
        }
        this.addShard(world, z, gapX, 0);
      }
    } else if (pattern === 'slalom') {
      const side = beatInBar % 2 === 0 ? -1 : 1;
      if (tube) {
        const a = h(1) * 0.3 + beatInBar * (Math.PI / 2);
        this.spikeTube(world, p, a, z, beat, 'cross', h(2));
        this.addShard(world, z, Math.cos(a + Math.PI) * hw * 0.6, Math.sin(a + Math.PI) * hw * 0.6);
      } else {
        this.spikeFlat(world, p, side * hw * 0.45, z, beat, 'tall', lerp(hz.radius[0], hz.radius[1], h(2)), h(3));
        this.addShard(world, z, -side * hw * 0.2, 0);
      }
    } else if (pattern === 'aimed' && beatInBar % 2 === 0 && this.diff.aimed) {
      const px = this.player.x + (h(1) - 0.5) * 1.5;
      const py = this.player.y + (h(2) - 0.5) * 1.5;
      if (tube) {
        const a = Math.hypot(px, py) > 1 ? Math.atan2(py, px) : h(3) * Math.PI * 2;
        this.spikeTube(world, p, a, z, beat, 'cross', h(4));
      } else {
        this.spikeFlat(world, p, px, z, beat, 'tall', lerp(hz.radius[0], hz.radius[1], h(4)), h(5));
      }
    } else if (pattern) {
      // scatter bars, and the remaining beats of aimed / wall bars
      // tunnels pack spikes into a small circle, so they get fewer per beat
      const density = (pattern === 'scatter' ? hz.perBeat : hz.perBeat * 0.4) * ramp * (tube ? 0.75 : 1) * this.diff.density;
      const count = Math.min(tube ? 2 : 4, Math.floor(density) + (h(1) < density % 1 ? 1 : 0));
      for (let k = 0; k < count; k++) {
        const hk = (salt: number) => h(30 + k * 7 + salt);
        if (tube) {
          this.spikeTube(world, p, hk(1) * Math.PI * 2, z, beat, hk(2) < 0.35 ? 'cross' : 'low', hk(3));
        } else {
          const x = (hk(1) * 2 - 1) * (hz.spread ?? 0.9) * hw * 1.15;
          this.spikeFlat(world, p, x, z, beat, hk(2) < 0.55 ? 'tall' : 'low', lerp(hz.radius[0], hz.radius[1], hk(3)), hk(4));
        }
      }
    }

    // free-floating shards (skim rewards) — and the whole content of shard-only scenes
    const shardsPerBar = hz.shards ?? 1;
    if (h(90) < shardsPerBar / 4) {
      const a = h(91) * Math.PI * 2;
      const rr = hw * (0.3 + h(92) * 0.6);
      if (tube) this.addShard(world, z, Math.cos(a) * rr, Math.sin(a) * rr);
      else this.addShard(world, z, (h(91) * 2 - 1) * hw * 0.8, -p.play.down * 0.75);
    }
  }

  /** lane mode: every spike sits on a lane; the neighbouring lane is a graze */
  private spawnLaneBeat(
    world: World,
    p: ScenePreset,
    beat: number,
    beatInBar: number,
    pattern: string | null,
    ramp: number,
    z: number,
    h: (salt: number) => number,
    firstLevel: boolean,
  ) {
    const hz = p.hazards!;
    const n = laneCount(p);
    const tube = isTube(p);
    const block = (lane: number, salt: number) => this.spikeLane(world, p, normLane(p, lane), z, beat, h(salt));
    const shard = (lane: number) => {
      const o = laneOffset(p, normLane(p, lane));
      this.addShard(world, z, o.x, o.y);
    };

    if (pattern === 'wall' && beatInBar === 0) {
      const gap = Math.floor(h(1) * n);
      const open = tube || firstLevel ? 2 : 1;
      for (let i = 0; i < n; i++) if ((((i - gap) % n) + n) % n >= open) block(i, 10 + i);
      shard(gap);
    } else if (pattern === 'slalom' && beatInBar % 2 === 0) {
      // block alternating halves every half bar: swing across
      const half = beatInBar === 0 ? 0 : 1;
      if (tube) {
        const start = Math.floor(h(1) * n) + half * (n / 2);
        for (let i = 0; i < n / 2; i++) block(start + i, 10 + i);
        shard(start + n / 2 + 1);
      } else {
        const lanes = half === 0 ? [0, 1, 2] : [2, 3, 4];
        for (const l of lanes) block(l, 10 + l);
        shard(half === 0 ? 4 : 0);
      }
    } else if (pattern === 'aimed' && beatInBar % 2 === 0) {
      block(this.playerLane, 3);
      shard(this.playerLane + (h(4) < 0.5 ? -1 : 1));
    } else if (pattern) {
      const density = (pattern === 'scatter' ? hz.perBeat : hz.perBeat * 0.4) * ramp;
      const count = Math.min(n - 2, Math.floor(density) + (h(1) < density % 1 ? 1 : 0));
      const used = new Set<number>();
      for (let k = 0; k < count; k++) {
        const lane = Math.floor(h(30 + k) * n);
        if (used.has(lane)) continue;
        used.add(lane);
        block(lane, 40 + k);
      }
    }

    const shardsPerBar = hz.shards ?? 1;
    if (h(90) < shardsPerBar / 4) shard(Math.floor(h(91) * n));
  }

  private spikeLane(world: World, p: ScenePreset, lane: number, z: number, beat: number, rnd: number) {
    const radius = laneSpacing(p) * 0.42;
    if (isTube(p)) this.spikeTube(world, p, laneAngle(p, lane), z, beat, 'lane', rnd, radius);
    else this.spikeFlat(world, p, laneOffset(p, lane).x, z, beat, 'tall', radius, rnd);
  }

  /** a spike on a floor or ceiling; "tall" reaches past the whole flight corridor, "low" can be skimmed over */
  private spikeFlat(world: World, p: ScenePreset, x: number, z: number, beat: number, kind: 'tall' | 'low', radius: number, rnd: number) {
    const hz = p.hazards!;
    const ceiling = hz.place === 'ceiling' || (hz.place === 'both' && rnd > 0.5);
    const layer = world.terrain.find((l) => l.kind === (ceiling ? 'ceiling' : 'floor'));
    if (!layer) return;
    const base = new THREE.Vector3();
    const dir = new THREE.Vector3();
    layer.surfacePoint(x, z, base, dir);
    world.pathPoint(z, this.path);
    const lo = this.path.y - p.play.down;
    const hi = this.path.y + p.play.up;
    let tipY: number;
    if (kind === 'tall') tipY = ceiling ? lo - 3 : hi + 3;
    else tipY = ceiling ? hi - (hi - lo) * (0.2 + rnd * 0.3) : lo + (hi - lo) * (0.2 + rnd * 0.3);
    const height = Math.max(2, Math.abs(tipY - base.y));
    this.addSpike(base, dir, radius, height, beat, rnd, p);
  }

  /**
   * a spike from a tunnel wall: "cross" reaches just past the centre line, "low" stops short of it,
   * "lane" reaches just past the lane ring the glider rides on
   */
  private spikeTube(world: World, p: ScenePreset, angle: number, z: number, beat: number, kind: 'cross' | 'low' | 'lane', rnd: number, radius?: number) {
    const layer: TerrainLayer | undefined = world.terrain.find((l) => l.kind === 'tube');
    if (!layer) return;
    const base = new THREE.Vector3();
    const dir = new THREE.Vector3();
    layer.surfacePoint(angle, z, base, dir);
    world.pathPoint(z, this.path);
    const dist = Math.hypot(base.x - this.path.x, base.y - this.path.y);
    const height =
      kind === 'cross' ? dist + 1.2 : kind === 'lane' ? dist - p.play.halfWidth * 0.9 + 2.2 : dist - p.play.halfWidth * (0.35 + rnd * 0.3);
    const hz = p.hazards!;
    this.addSpike(base, dir, radius ?? lerp(hz.radius[0], hz.radius[1], rnd), Math.max(2, height), beat, rnd, p);
  }

  private addSpike(base: THREE.Vector3, dir: THREE.Vector3, radius: number, height: number, beat: number, rnd: number, p: ScenePreset) {
    // sink the base into the ground a little so it never floats
    base.addScaledVector(dir, -0.8);
    const quat = new THREE.Quaternion().setFromUnitVectors(Y_AXIS, dir);
    quat.multiply(new THREE.Quaternion().setFromAxisAngle(Y_AXIS, rnd * Math.PI * 2));
    this.spikes.push({
      passBeat: beat,
      base,
      dir,
      quat,
      radius,
      height: height + 0.8,
      rise: 0,
      grazedAt: 0,
      hitAt: 0,
      shatteredAt: 0,
      obsidian: this.obsidianEnabled && hash2(beat, Math.floor(rnd * 9973), SEED + 5) < (p.hazards!.obsidian ?? 0.25),
      locked: false,
      color: new THREE.Color(p.hazards!.color).multiplyScalar(0.9 + rnd * 0.2),
    });
    if (this.spikes.length > MAX_SPIKES) this.spikes.shift();
  }

  /** a shard at an offset from the path; it is nudged out of any terrain */
  private addShard(world: World, z: number, ox: number, oy: number) {
    world.pathPoint(z, this.path);
    const pos = new THREE.Vector3(this.path.x + ox, this.path.y + oy, z);
    for (let i = 0; i < 8 && world.clearance(pos.x, pos.y, pos.z) < 1.2; i++) {
      pos.x += (this.path.x - pos.x) * 0.3;
      pos.y += (this.path.y - pos.y) * 0.3;
    }
    this.shards.push({ pos, takenAt: 0, magnet: false });
    if (this.shards.length > MAX_SHARDS) this.shards.shift();
  }
}

const WHITE = new THREE.Color(1, 1, 1);
/** obsidian spikes telegraph with a red ring: dodge, don't shoot */
const OBSIDIAN_RING = new THREE.Color('#ff4d6d');

function easeOutBack(x: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
}

function additive() {
  return new THREE.MeshBasicNodeMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, max: number) {
  const m = new THREE.InstancedMesh(geo, mat, max);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.setColorAt(0, new THREE.Color());
  m.frustumCulled = false;
  m.count = 0;
  return m;
}

function finish(m: THREE.InstancedMesh, n: number) {
  m.count = n;
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
}
