import * as THREE from 'three/webgpu';
import type { ScenePreset } from '../scenes/types';
import { mulberry32 } from '../core/noise';

const MIST_COUNT = 140;
const MIST_DEPTH = 380;

/** a soft round puff, white with a feathered edge, drawn once */
function puffTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.45, 'rgba(255,255,255,0.55)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Puff {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  drift: number;
  alpha: number;
}

/** Low atmosphere for the painterly levels (opt-in per preset): big soft mist cards in the valleys, drifting slowly. */
export class Atmosphere {
  readonly group = new THREE.Group();
  private readonly mist: THREE.InstancedMesh;
  private readonly mistMat: THREE.MeshBasicNodeMaterial;
  private puffs: Puff[] = [];
  private preset: ScenePreset | null = null;
  private readonly m = new THREE.Matrix4();
  private readonly s = new THREE.Vector3();
  private readonly v = new THREE.Vector3();
  private readonly c = new THREE.Color();
  private readonly rng = mulberry32(7);

  constructor() {
    // additive: the mist reads as glowing haze over the darker mountains, and fades out cleanly via colour
    this.mistMat = new THREE.MeshBasicNodeMaterial({
      map: puffTexture(),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.mist = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), this.mistMat, MIST_COUNT);
    this.mist.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mist.setColorAt(0, new THREE.Color());
    this.mist.frustumCulled = false;
    this.mist.renderOrder = 2;

    this.group.add(this.mist);
    this.group.visible = false;
  }

  apply(p: ScenePreset) {
    this.preset = p;
    const a = p.atmosphere;
    this.group.visible = !!a;
    this.mist.visible = !!a?.mist;
    this.puffs = [];
    if (a?.mist) {
      this.mistMat.color.set(a.mist.color);
      const r = this.rng;
      for (let i = 0; i < MIST_COUNT; i++) this.puffs.push(this.newPuff(r, NaN));
    }
  }

  /** z = NaN: not placed yet, put it somewhere along the view on the next update */
  private newPuff(r: () => number, z: number): Puff {
    const a = this.preset!.atmosphere!.mist!;
    return {
      x: 0,
      y: a.height[0] + r() * (a.height[1] - a.height[0]),
      z,
      w: 40 + r() * 60,
      h: 7 + r() * 8,
      drift: (r() - 0.5) * 1.5,
      alpha: 0.45 + r() * 0.55,
    };
  }

  /**
   * @param ground terrain height at (x, z) on the first floor layer
   * @param pathX centre of the flight path at depth z
   */
  update(camera: THREE.Camera, dt: number, ground: (x: number, z: number) => number, pathX: (z: number) => number, time: number) {
    const a = this.preset?.atmosphere;
    if (!a) return;
    const camZ = camera.position.z;

    if (a.mist) {
      let n = 0;
      for (let i = 0; i < this.puffs.length; i++) {
        let p = this.puffs[i];
        if (Number.isNaN(p.z) || p.z > camZ + 10) {
          const first = Number.isNaN(p.z);
          p = this.puffs[i] = this.newPuff(this.rng, first ? camZ - 30 - this.rng() * (MIST_DEPTH - 30) : camZ - MIST_DEPTH + this.rng() * 40);
          // across: inside what the camera sees at that distance, a few drifting over the flight line
          const dist = camZ - p.z;
          const spread = 10 + dist * 0.75;
          p.x = pathX(p.z) + (this.rng() < 0.2 ? (this.rng() - 0.5) * 16 : (this.rng() * 2 - 1) * spread);
        }
        p.x += p.drift * dt;
        const dist = camZ - p.z;
        // fade in from the far end, fade out right before the camera so nothing pops
        const fade = Math.min(1, Math.max(0, dist - 8) / 40) * Math.min(1, (MIST_DEPTH - dist) / 60);
        // valleys only: over high ground the puff stays hidden, so the peaks stay crisp above the mist
        const g = ground(p.x, p.z);
        const valley = 1 - Math.min(1, Math.max(0, (g - a.mist.height[1]) / 3));
        const y = Math.max(p.y, g + p.h * 0.2);
        // stretched cards facing the camera
        this.v.set(p.x, y, p.z);
        this.s.set(p.w, p.h, 1);
        this.m.compose(this.v, camera.quaternion, this.s);
        this.mist.setMatrixAt(n, this.m);
        this.mist.setColorAt(n, this.c.setScalar(Math.max(0, fade) * valley * p.alpha * a.mist.opacity));
        n++;
      }
      this.mist.count = n;
      this.mist.instanceMatrix.needsUpdate = true;
      if (this.mist.instanceColor) this.mist.instanceColor.needsUpdate = true;
    }

  }
}
