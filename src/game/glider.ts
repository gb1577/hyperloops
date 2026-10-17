import * as THREE from 'three/webgpu';
import { vec3 } from 'three/tsl';
import type { ScenePreset } from '../scenes/types';
import type { Steer } from './input';

const MAX_SPEED = 24;
const TRAIL_SEGMENTS = 22;
const TRAIL_SECONDS = 0.22;

/** The player's light-shard: faceted body, hot core, ribbon trail, inertial steering. */
export class Glider {
  readonly group = new THREE.Group();
  /** offset from the path point (x sideways, y up) */
  readonly offset = new THREE.Vector2();
  readonly vel = new THREE.Vector2();
  readonly position = new THREE.Vector3();
  bank = 0;
  private readonly body: THREE.Group;
  private readonly trail: THREE.Mesh;
  private readonly trailPos: Float32Array;
  private readonly history: { t: number; p: THREE.Vector3 }[] = [];

  constructor() {
    this.body = new THREE.Group();
    // dark body so it reads against the bright skies; glowing edges + core so it reads in the dark ones
    const geo = shardGeometry();
    this.body.add(new THREE.Mesh(geo, new THREE.MeshStandardNodeMaterial({
      color: '#1d2230',
      emissive: '#3ab8e0',
      emissiveIntensity: 0.25,
      roughness: 0.3,
      metalness: 0.4,
      flatShading: true,
      side: THREE.DoubleSide,
    })));
    const edgeMat = new THREE.LineBasicNodeMaterial({ fog: false });
    edgeMat.colorNode = vec3(2.2, 4.2, 5);
    this.body.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 1), edgeMat));
    this.body.scale.setScalar(1.25);
    const coreMat = new THREE.MeshBasicNodeMaterial({ fog: false });
    coreMat.colorNode = vec3(5, 7, 8);
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), coreMat);
    core.position.set(0, 0.05, 0.55);
    this.body.add(core);
    this.group.add(this.body);

    // trail ribbon (world space, rebuilt every frame from position history)
    const g = new THREE.BufferGeometry();
    this.trailPos = new Float32Array((TRAIL_SEGMENTS + 1) * 2 * 3);
    const col = new Float32Array((TRAIL_SEGMENTS + 1) * 2 * 3);
    const idx: number[] = [];
    for (let i = 0; i <= TRAIL_SEGMENTS; i++) {
      const f = Math.pow(1 - i / TRAIL_SEGMENTS, 1.6);
      col.set([0.75 * f, 0.95 * f, f, 0.75 * f, 0.95 * f, f], i * 6);
      if (i < TRAIL_SEGMENTS) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    g.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    this.trail = new THREE.Mesh(
      g,
      new THREE.MeshBasicNodeMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      }),
    );
    this.trail.frustumCulled = false;
  }

  /** the trail lives in world space, so it is added to the scene separately */
  get trailMesh() {
    return this.trail;
  }

  reset() {
    this.offset.set(0, 0);
    this.vel.set(0, 0);
    this.bank = 0;
    this.history.length = 0;
  }

  update(dt: number, time: number, steer: Steer, preset: ScenePreset, path: THREE.Vector3) {
    const play = preset.play;
    const tube = preset.layers[0]?.kind === 'tube';

    // desired velocity: toward the pointer target, or straight from keys / stick
    let dvx: number;
    let dvy: number;
    if (steer.target) {
      const tx = steer.target.x * play.halfWidth;
      const ty = tube ? steer.target.y * play.halfWidth : steer.target.y * (steer.target.y > 0 ? play.up : play.down);
      dvx = (tx - this.offset.x) * 7;
      dvy = (ty - this.offset.y) * 7;
      const m = Math.hypot(dvx, dvy);
      if (m > MAX_SPEED) {
        dvx *= MAX_SPEED / m;
        dvy *= MAX_SPEED / m;
      }
    } else {
      dvx = steer.axis.x * MAX_SPEED;
      dvy = steer.axis.y * MAX_SPEED;
    }
    const k = Math.min(1, dt * 10);
    this.vel.x += (dvx - this.vel.x) * k;
    this.vel.y += (dvy - this.vel.y) * k;
    this.offset.x += this.vel.x * dt;
    this.offset.y += this.vel.y * dt;

    // keep inside the play area
    if (tube) {
      const r = this.offset.length();
      if (r > play.halfWidth) this.offset.multiplyScalar(play.halfWidth / r);
    } else {
      this.offset.x = THREE.MathUtils.clamp(this.offset.x, -play.halfWidth, play.halfWidth);
      this.offset.y = THREE.MathUtils.clamp(this.offset.y, -play.down, play.up);
    }

    this.bank += (-(this.vel.x / MAX_SPEED) * 0.75 - this.bank) * Math.min(1, dt * 8);
    this.position.set(path.x + this.offset.x, path.y + this.offset.y, path.z);
    this.group.position.copy(this.position);
    this.body.rotation.set((this.vel.y / MAX_SPEED) * 0.35, 0, this.bank);

    this.updateTrail(time);
  }

  /** blink while invulnerable */
  setVisible(v: boolean) {
    this.body.visible = v;
  }

  private updateTrail(time: number) {
    const h = this.history;
    h.unshift({ t: time, p: this.position.clone() });
    while (h.length > 2 && time - h[h.length - 1].t > TRAIL_SECONDS + 0.05) h.pop();
    if (h.length > 90) h.pop();

    let j = 0;
    const tmp = new THREE.Vector3();
    for (let i = 0; i <= TRAIL_SEGMENTS; i++) {
      const target = time - (i / TRAIL_SEGMENTS) * TRAIL_SECONDS;
      while (j < h.length - 1 && h[j + 1].t >= target) j++;
      const a = h[j];
      const b = h[Math.min(j + 1, h.length - 1)];
      const span = a.t - b.t;
      const f = span > 0 ? (a.t - target) / span : 0;
      tmp.copy(a.p).lerp(b.p, Math.min(1, Math.max(0, f)));
      const w = 0.55 * (1 - i / TRAIL_SEGMENTS) + 0.05;
      const cx = Math.cos(this.bank) * w;
      const cy = Math.sin(this.bank) * w;
      this.trailPos.set([tmp.x - cx, tmp.y - cy, tmp.z + 0.6, tmp.x + cx, tmp.y + cy, tmp.z + 0.6], i * 6);
    }
    this.trail.geometry.attributes.position.needsUpdate = true;
  }
}

/** a flat-shaded dart: nose forward (-z), swept wings, low dorsal ridge */
function shardGeometry() {
  const nose = [0, 0, -1.7];
  const tail = [0, 0.02, 0.8];
  const left = [-1.05, -0.05, 0.45];
  const right = [1.05, -0.05, 0.45];
  const top = [0, 0.38, 0.15];
  const bottom = [0, -0.22, 0.25];
  const tris = [
    nose, left, top, nose, top, right,
    nose, bottom, left, nose, right, bottom,
    top, left, tail, top, tail, right,
    bottom, tail, left, bottom, right, tail,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
  g.computeVertexNormals();
  return g;
}
