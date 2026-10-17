import * as THREE from 'three/webgpu';
import type { TerrainLayerSpec } from '../scenes/types';
import { fbm, hash2, lerp, ridged, smoothstep } from '../core/noise';

const CHUNK_LEN = 48;

/** Meandering centre line of a tube layer at depth z (zero when the spec has no wander). */
export function tubeCenter(spec: TerrainLayerSpec, z: number, out = { x: 0, y: 0 }) {
  const w = spec.wander ?? 0;
  const s = spec.seed ?? 1;
  out.x = w ? (fbm(z * 0.006, 1.3, 3, s + 50) - 0.5) * 2 * w : 0;
  out.y = w ? (fbm(z * 0.005, 7.9, 3, s + 60) - 0.5) * 1.4 * w : 0;
  return out;
}
const VIEW_DIST = 420;

/**
 * Streaming low-poly terrain. The world is cut into fixed chunks along -Z; chunks behind the camera
 * are recycled to the front and regenerated. Geometry is non-indexed so every triangle gets its own
 * normal and colour: the faceted After Effects look.
 */
export class TerrainLayer {
  readonly group = new THREE.Group();
  private readonly spec: TerrainLayerSpec;
  private readonly cols: number;
  private readonly rows: number;
  private readonly cellZ: number;
  private readonly chunkLen: number;
  private readonly slots: { mesh: THREE.Mesh; k: number }[] = [];
  private readonly material: THREE.Material;
  private readonly cLow: THREE.Color;
  private readonly cHigh: THREE.Color;
  private readonly seed: number;

  constructor(spec: TerrainLayerSpec) {
    this.spec = spec;
    this.seed = spec.seed ?? 1;
    this.cellZ = spec.cellZ ?? spec.cell;
    this.rows = Math.max(2, Math.round(CHUNK_LEN / this.cellZ));
    this.chunkLen = this.rows * this.cellZ;
    this.cols =
      spec.kind === 'tube' ? Math.max(8, Math.round((Math.PI * 2 * spec.size) / spec.cell)) : Math.ceil((spec.size * 2) / spec.cell);
    this.cLow = new THREE.Color(spec.colorLow);
    this.cHigh = new THREE.Color(spec.colorHigh);

    if (spec.wireframe) {
      const opacity = spec.opacity ?? 1;
      this.material = new THREE.MeshBasicNodeMaterial({
        vertexColors: true,
        wireframe: true,
        side: THREE.DoubleSide,
        transparent: opacity < 1,
        opacity,
        depthWrite: opacity >= 1,
      });
    } else {
      this.material = new THREE.MeshLambertNodeMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
    }

    const n = Math.ceil(VIEW_DIST / this.chunkLen) + 2;
    for (let s = 0; s < n; s++) {
      const g = new THREE.BufferGeometry();
      const size = this.cols * this.rows * 2 * 9;
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(size), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(size), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(size), 3));
      const mesh = new THREE.Mesh(g, this.material);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.slots.push({ mesh, k: -9999 });
    }
  }

  /** Make sure chunks cover [camZ + chunkLen, camZ - VIEW_DIST]. */
  update(camZ: number) {
    const n = this.slots.length;
    const k0 = Math.floor(-camZ / this.chunkLen) - 1;
    for (let k = k0; k < k0 + n; k++) {
      const slot = this.slots[((k % n) + n) % n];
      if (slot.k !== k) {
        this.build(slot.mesh, k);
        slot.k = k;
      }
    }
  }

  dispose() {
    for (const s of this.slots) s.mesh.geometry.dispose();
    this.material.dispose();
  }

  get kind() {
    return this.spec.kind;
  }

  /**
   * Signed free space at a world point: > 0 is open air, < 0 is inside rock.
   * Uses the same deterministic displacement as the mesh (minus vertex jitter), so it is a close fit.
   */
  clearance(x: number, y: number, z: number): number {
    const s = this.spec;
    if (s.kind === 'floor') return y - (s.base + this.dispAt(x, z));
    if (s.kind === 'ceiling') return s.base - this.dispAt(x, z) - y;
    const c = tubeCenter(s, z);
    const dx = x - c.x;
    const dy = y - c.y;
    const wall = Math.max(s.size - this.dispAt(Math.atan2(dy, dx), z), s.minRadius ?? 0);
    return wall - Math.hypot(dx, dy);
  }

  /** Surface point and the direction pointing into open air. u = x for floor/ceiling, angle for tubes. */
  surfacePoint(u: number, z: number, outPos: THREE.Vector3, outDir: THREE.Vector3) {
    const s = this.spec;
    const d = this.dispAt(u, z);
    if (s.kind === 'floor') {
      outPos.set(u, s.base + d, z);
      outDir.set(0, 1, 0);
    } else if (s.kind === 'ceiling') {
      outPos.set(u, s.base - d, z);
      outDir.set(0, -1, 0);
    } else {
      const c = tubeCenter(s, z);
      const wall = Math.max(s.size - d, s.minRadius ?? 0);
      outPos.set(c.x + Math.cos(u) * wall, c.y + Math.sin(u) * wall, z);
      outDir.set(-Math.cos(u), -Math.sin(u), 0);
    }
  }

  /** bilinear displacement over the un-jittered grid */
  private dispAt(u: number, z: number): number {
    const s = this.spec;
    const rf = -z / this.cellZ;
    const r0 = Math.floor(rf);
    const fz = rf - r0;
    let d00: number, d10: number, d01: number, d11: number, fx: number;
    if (s.kind === 'tube') {
      const TAU = Math.PI * 2;
      const af = ((((u % TAU) + TAU) % TAU) / TAU) * this.cols;
      const i0 = Math.floor(af) % this.cols;
      const i1 = (i0 + 1) % this.cols;
      fx = af - Math.floor(af);
      const at = (i: number, r: number) => {
        const a0 = (i / this.cols) * TAU;
        return this.displacement(i, r, a0 * s.size, -r * this.cellZ, a0);
      };
      d00 = at(i0, r0); d10 = at(i1, r0); d01 = at(i0, r0 + 1); d11 = at(i1, r0 + 1);
    } else {
      const gf = u / s.cell;
      const g0 = Math.floor(gf);
      fx = gf - g0;
      const at = (g: number, r: number) => this.displacement(g, r, g * s.cell, -r * this.cellZ, 0);
      d00 = at(g0, r0); d10 = at(g0 + 1, r0); d01 = at(g0, r0 + 1); d11 = at(g0 + 1, r0 + 1);
    }
    return lerp(lerp(d00, d10, fx), lerp(d01, d11, fx), fz);
  }

  private displacement(i: number, r: number, across: number, z: number, angle: number): number {
    const s = this.spec;
    const nx = across * s.freq[0];
    const nz = z * s.freq[1];
    const n = s.ridged ? ridged(nx, nz, 4, this.seed) : fbm(nx, nz, 4, this.seed);
    let d = s.amp * Math.pow(n, s.sharp);
    if (hash2(i, r, this.seed + 3) < s.spikeChance) d += s.spikeHeight * (0.3 + 0.7 * hash2(i, r, this.seed + 4));
    if (s.kind === 'tube') {
      const w = lerp(1, Math.pow(Math.abs(Math.cos(angle)), 1.5), s.sideWeight ?? 0);
      d = Math.min(d * w, s.size * 0.72);
    } else if (s.clearance) {
      const [c0, c1, minF] = s.clearance;
      d *= lerp(minF, 1, smoothstep(c0, c1, Math.abs(across)));
    }
    return d;
  }

  private build(mesh: THREE.Mesh, k: number) {
    const s = this.spec;
    const cols = this.cols;
    const rows = this.rows;
    const W = cols + 1;
    const vx = new Float32Array(W * (rows + 1));
    const vy = new Float32Array(W * (rows + 1));
    const vz = new Float32Array(W * (rows + 1));
    const vh = new Float32Array(W * (rows + 1));
    const hNorm = 1 / Math.max(0.001, s.amp + s.spikeHeight * 0.6);
    const center = { x: 0, y: 0 };

    for (let j = 0; j <= rows; j++) {
      const r = k * rows + j; // global row
      for (let ii = 0; ii <= cols; ii++) {
        const i = s.kind === 'tube' ? ii % cols : ii;
        const gi = i - (s.kind === 'tube' ? 0 : cols >> 1); // centre the grid on x = 0
        const jx = (hash2(gi, r, this.seed + 1) - 0.5) * s.jitter * s.cell;
        const jz = (hash2(gi, r, this.seed + 2) - 0.5) * s.jitter * this.cellZ;
        const z = -r * this.cellZ + jz;
        const idx = j * W + ii;
        if (s.kind === 'tube') {
          const a0 = (i / cols) * Math.PI * 2;
          const a = a0 + jx / s.size;
          const d = this.displacement(gi, r, a0 * s.size, z, a);
          const rr = Math.max(s.size - d, s.minRadius ?? 0);
          const c = tubeCenter(s, z, center);
          vx[idx] = Math.cos(a) * rr + c.x;
          vy[idx] = Math.sin(a) * rr + c.y;
          vz[idx] = z;
          vh[idx] = d * hNorm;
        } else {
          const x = gi * s.cell + jx;
          const d = this.displacement(gi, r, x, z, 0);
          vx[idx] = x;
          vy[idx] = s.kind === 'floor' ? s.base + d : s.base - d;
          vz[idx] = z;
          vh[idx] = d * hNorm;
        }
      }
    }

    const g = mesh.geometry;
    const pos = g.attributes.position.array as Float32Array;
    const nor = g.attributes.normal.array as Float32Array;
    const col = g.attributes.color.array as Float32Array;
    const tmp = new THREE.Color();
    const shade = s.shadeJitter ?? 0.12;
    let p = 0;

    const pushTri = (a: number, b: number, c: number, faceHash: number) => {
      const ax = vx[a], ay = vy[a], az = vz[a];
      const bx = vx[b], by = vy[b], bz = vz[b];
      const cx = vx[c], cy = vy[c], cz = vz[c];
      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const wx = cx - ax, wy = cy - ay, wz = cz - az;
      let nx = uy * wz - uz * wy;
      let ny = uz * wx - ux * wz;
      let nz = ux * wy - uy * wx;
      // face the normal toward the flight path
      let want: number;
      if (s.kind === 'floor') want = ny;
      else if (s.kind === 'ceiling') want = -ny;
      else want = -(nx * (ax + bx + cx) + ny * (ay + by + cy));
      const len = Math.hypot(nx, ny, nz) || 1;
      const flip = want < 0;
      const sgn = (flip ? -1 : 1) / len;
      nx *= sgn; ny *= sgn; nz *= sgn;
      const order = flip ? [a, c, b] : [a, b, c];

      const h = Math.min(1, (vh[a] + vh[b] + vh[c]) / 3);
      tmp.copy(this.cLow).lerp(this.cHigh, Math.pow(h, 0.7));
      tmp.multiplyScalar(1 + (faceHash - 0.5) * 2 * shade);

      for (const v of order) {
        pos[p] = vx[v]; pos[p + 1] = vy[v]; pos[p + 2] = vz[v];
        nor[p] = nx; nor[p + 1] = ny; nor[p + 2] = nz;
        col[p] = tmp.r; col[p + 1] = tmp.g; col[p + 2] = tmp.b;
        p += 3;
      }
    };

    for (let j = 0; j < rows; j++) {
      const r = k * rows + j;
      for (let i = 0; i < cols; i++) {
        const v00 = j * W + i;
        const v10 = v00 + 1;
        const v01 = v00 + W;
        const v11 = v01 + 1;
        const h1 = hash2(i, r, this.seed + 9);
        const h2 = hash2(i, r, this.seed + 10);
        if (hash2(i, r, this.seed + 5) < 0.5) {
          pushTri(v00, v10, v11, h1);
          pushTri(v00, v11, v01, h2);
        } else {
          pushTri(v00, v10, v01, h1);
          pushTri(v10, v11, v01, h2);
        }
      }
    }

    g.attributes.position.needsUpdate = true;
    g.attributes.normal.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.computeBoundingSphere();
  }
}
