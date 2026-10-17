import * as THREE from 'three/webgpu';
import type { ScenePreset } from '../scenes/types';

/**
 * Lane layout. Floor / ceiling levels: 5 lanes side by side. Tunnels: 8 lanes around the wall
 * (lane 0 at the bottom), and the camera rolls so the player's lane is always "down".
 */
export const isTube = (p: ScenePreset) => p.layers[0]?.kind === 'tube';

export function laneCount(p: ScenePreset) {
  return isTube(p) ? 8 : 5;
}

/** offset from the path point for lane i */
export function laneOffset(p: ScenePreset, i: number, out = { x: 0, y: 0 }) {
  const n = laneCount(p);
  if (isTube(p)) {
    const a = laneAngle(p, i);
    const r = p.play.halfWidth * 0.9;
    out.x = Math.cos(a) * r;
    out.y = Math.sin(a) * r;
  } else {
    out.x = (i - (n - 1) / 2) * laneSpacing(p);
    out.y = 0;
  }
  return out;
}

export function laneAngle(p: ScenePreset, i: number) {
  const n = laneCount(p);
  return -Math.PI / 2 + (((i % n) + n) % n) * ((Math.PI * 2) / n);
}

/** distance between neighbouring lane centres */
export function laneSpacing(p: ScenePreset) {
  const n = laneCount(p);
  if (isTube(p)) return (Math.PI * 2 * p.play.halfWidth * 0.9) / n;
  return (p.play.halfWidth * 1.6) / (n - 1);
}

/** wrap (tunnels) or clamp (floors) a lane index */
export function normLane(p: ScenePreset, i: number) {
  const n = laneCount(p);
  return isTube(p) ? ((i % n) + n) % n : Math.max(0, Math.min(n - 1, i));
}

/**
 * Faint dotted guides along each lane, just below the glider (floors) or just outside the lane ring
 * (tunnels), so players can read where the lanes are at speed.
 */
export class LaneGuides {
  readonly mesh: THREE.InstancedMesh;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3(1, 1, 1);
  private readonly p = new THREE.Vector3();
  private readonly path = new THREE.Vector3();
  private static readonly ROWS = 34;
  private static readonly STEP = 4;

  constructor() {
    const dash = new THREE.PlaneGeometry(0.12, 1.4);
    dash.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicNodeMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.InstancedMesh(dash, mat, LaneGuides.ROWS * 8);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  update(p: ScenePreset, gliderZ: number, pathAt: (z: number, out: THREE.Vector3) => THREE.Vector3, visible: boolean) {
    this.mesh.visible = visible;
    if (!visible) return;
    const n = laneCount(p);
    const tube = isTube(p);
    // rows snap to a world grid so the dashes stream past instead of sliding with the glider
    const z0 = Math.floor(gliderZ / LaneGuides.STEP) * LaneGuides.STEP + LaneGuides.STEP;
    const off = { x: 0, y: 0 };
    let k = 0;
    for (let r = 0; r < LaneGuides.ROWS; r++) {
      const z = z0 - r * LaneGuides.STEP;
      pathAt(z, this.path);
      for (let i = 0; i < n; i++) {
        laneOffset(p, i, off);
        if (tube) {
          const a = laneAngle(p, i);
          // a little further out than the lane ring, lying flat against the wall
          this.p.set(this.path.x + off.x + Math.cos(a) * 1.4, this.path.y + off.y + Math.sin(a) * 1.4, z);
          this.q.setFromAxisAngle(Z, a + Math.PI / 2);
        } else {
          this.p.set(this.path.x + off.x, this.path.y - 1.6, z);
          this.q.identity();
        }
        this.m.compose(this.p, this.q, this.s);
        this.mesh.setMatrixAt(k++, this.m);
      }
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

const Z = new THREE.Vector3(0, 0, 1);
