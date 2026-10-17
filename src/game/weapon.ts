import * as THREE from 'three/webgpu';
import { BEAT, BEAT_OFFSET } from '../core/beatclock';
import type { Hazards, Spike } from './hazards';

export const MAX_LOCKS = 4;
export const LOCK_COST = 0.14;
const LOCK_INTERVAL = 0.09;
const PERFECT_WINDOW = 0.075;
const GOOD_WINDOW = 0.14;
const BEAM_LIFE = 0.16;

export type Judgement = 'perfect' | 'good' | 'off';

export interface Volley {
  judgement: Judgement;
  /** spikes that shattered */
  hits: Spike[];
  /** seconds from the nearest (audible) beat, signed: − early, + late */
  error: number;
}

export interface WeaponEvents {
  /** spikes locked this frame */
  locked: Spike[];
  /** wanted to lock but out of flux */
  dry: boolean;
  volley: Volley | null;
}

interface Beam {
  from: THREE.Vector3;
  to: THREE.Vector3;
  born: number;
  color: THREE.Color;
}

/**
 * Lock-on pulse: hold fire to sweep locks onto crystal spikes ahead (Flux per lock), release on the
 * beat to shatter them. Off-beat releases only hit half the locks.
 */
export class Weapon {
  readonly locks: Spike[] = [];
  readonly beamMesh: THREE.InstancedMesh;
  private beams: Beam[] = [];
  private held = false;
  private lastLockAt = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly mid = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();

  constructor() {
    this.beamMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicNodeMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
      MAX_LOCKS * 4,
    );
    this.beamMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.beamMesh.setColorAt(0, new THREE.Color());
    this.beamMesh.frustumCulled = false;
    this.beamMesh.count = 0;
  }

  get holding() {
    return this.held;
  }

  reset() {
    for (const s of this.locks) s.locked = false;
    this.locks.length = 0;
    this.beams = [];
    this.held = false;
  }

  /**
   * @param audibleTime music time the player is hearing now (clock time minus output latency)
   * @param flux available ammo; the caller subtracts LOCK_COST per locked spike
   */
  update(now: number, t: number, audibleTime: number, held: boolean, glider: THREE.Vector3, hazards: Hazards, flux: number): WeaponEvents {
    const ev: WeaponEvents = { locked: [], dry: false, volley: null };

    // drop locks on spikes that went past, got shattered or hit us
    for (let i = this.locks.length - 1; i >= 0; i--) {
      const s = this.locks[i];
      if (s.shatteredAt > 0 || s.hitAt > 0 || s.base.z > glider.z - 1) {
        s.locked = false;
        this.locks.splice(i, 1);
      }
    }

    if (held) {
      if (this.locks.length < MAX_LOCKS && now - this.lastLockAt > LOCK_INTERVAL) {
        const target = hazards.targets(glider, t)[0];
        if (target) {
          if (flux - ev.locked.length * LOCK_COST >= LOCK_COST) {
            target.locked = true;
            this.locks.push(target);
            ev.locked.push(target);
            this.lastLockAt = now;
          } else ev.dry = true;
        }
      }
    } else if (this.held && this.locks.length) {
      ev.volley = this.release(t, audibleTime, glider, hazards);
    }
    this.held = held;

    this.drawBeams(t);
    return ev;
  }

  private release(t: number, audibleTime: number, glider: THREE.Vector3, hazards: Hazards): Volley {
    const beat = (audibleTime - BEAT_OFFSET) / BEAT;
    const error = (beat - Math.round(beat)) * BEAT;
    const judgement: Judgement = Math.abs(error) <= PERFECT_WINDOW ? 'perfect' : Math.abs(error) <= GOOD_WINDOW ? 'good' : 'off';
    const count = judgement === 'off' ? Math.ceil(this.locks.length / 2) : this.locks.length;
    const hits = this.locks.slice(0, count);
    const color = new THREE.Color(judgement === 'perfect' ? '#ffe066' : judgement === 'good' ? '#ffffff' : '#9aa0b0');
    for (const s of hits) {
      this.beams.push({ from: glider.clone(), to: hazards.tipOf(s, new THREE.Vector3()), born: t, color });
      hazards.shatter(s, t);
    }
    for (const s of this.locks) s.locked = false;
    this.locks.length = 0;
    return { judgement, hits, error };
  }

  private drawBeams(t: number) {
    this.beams = this.beams.filter((b) => t - b.born < BEAM_LIFE && t >= b.born);
    let i = 0;
    for (const b of this.beams) {
      const age = (t - b.born) / BEAM_LIFE;
      this.dir.copy(b.to).sub(b.from);
      const len = this.dir.length();
      this.mid.copy(b.from).addScaledVector(this.dir, 0.5);
      this.q.setFromUnitVectors(Z, this.dir.normalize());
      const w = 0.22 * (1 - age);
      this.s.set(w, w, len);
      this.m.compose(this.mid, this.q, this.s);
      this.beamMesh.setMatrixAt(i, this.m);
      this.beamMesh.setColorAt(i, b.color.clone().multiplyScalar(4 * (1 - age)));
      i++;
    }
    this.beamMesh.count = i;
    this.beamMesh.instanceMatrix.needsUpdate = true;
    if (this.beamMesh.instanceColor) this.beamMesh.instanceColor.needsUpdate = true;
  }
}

const Z = new THREE.Vector3(0, 0, 1);
