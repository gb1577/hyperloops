import * as THREE from 'three/webgpu';
import type { ScenePreset } from '../scenes/types';
import type { BeatInfo } from '../core/beatclock';
import { mulberry32 } from '../core/noise';

const Z_AXIS = new THREE.Vector3(0, 0, 1);

interface Laser {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicNodeMaterial;
  born: number;
  life: number;
}

/**
 * The video's line work:
 * - scanlines: horizontal white bars across the sky (Jade Spires)
 * - lasers: thin beams radiating from / crossing the vanishing point (tunnels, wire cave)
 */
export class LineFX {
  readonly group = new THREE.Group();
  private readonly scanGroup = new THREE.Group();
  private scans: THREE.Mesh[] = [];
  private lasers: Laser[] = [];
  private preset: ScenePreset | null = null;
  private lastBeat = -1;
  private rng = mulberry32(42);
  private readonly unitBox = new THREE.BoxGeometry(1, 1, 1);
  private readonly unitPlane = new THREE.PlaneGeometry(1, 1);

  constructor() {
    this.group.add(this.scanGroup);
  }

  apply(p: ScenePreset) {
    this.clear();
    this.preset = p;
    const L = p.lines;
    if (!L) return;

    if (L.scan) {
      for (let i = 0; i < L.scan.count; i++) {
        const mat = new THREE.MeshBasicNodeMaterial({ color: L.scan.color, transparent: true, opacity: L.scan.opacity, fog: false });
        const m = new THREE.Mesh(this.unitPlane, mat);
        m.visible = false;
        this.scanGroup.add(m);
        this.scans.push(m);
      }
    }

    if (L.lasers) {
      for (let i = 0; i < L.lasers.count; i++) {
        const mat = new THREE.MeshBasicNodeMaterial({ color: L.lasers.color, transparent: true, opacity: 0, fog: false, depthWrite: false });
        const mesh = new THREE.Mesh(this.unitBox, mat);
        mesh.visible = false;
        mesh.frustumCulled = false;
        this.group.add(mesh);
        this.lasers.push({ mesh, mat, born: -99, life: 1 });
      }
    }
  }

  update(info: BeatInfo, camera: THREE.PerspectiveCamera) {
    const p = this.preset;
    if (!p?.lines) return;
    const newBeat = info.beatIndex !== this.lastBeat;
    this.lastBeat = info.beatIndex;

    // scanlines live in camera space, far enough that spikes occlude them
    if (this.scans.length) {
      this.scanGroup.position.copy(camera.position);
      this.scanGroup.quaternion.copy(camera.quaternion);
      if (newBeat) {
        for (const m of this.scans) {
          m.visible = this.rng() < 0.55;
          const thick = this.rng() < 0.2 ? 2.5 + this.rng() * 3 : 0.25 + this.rng() * 0.9;
          m.scale.set(900, thick, 1);
          m.position.set(0, 8 + this.rng() * 70, -200);
        }
      }
    }

    if (this.lasers.length && p.lines.lasers) {
      const cfg = p.lines.lasers;
      if (newBeat) {
        const n = cfg.mode === 'cross' ? 2 + Math.floor(this.rng() * 3) : 1 + Math.floor(this.rng() * 2);
        for (let i = 0; i < n; i++) this.spawnLaser(info.time, camera, cfg.mode, cfg.thickness);
      }
      for (const l of this.lasers) {
        const age = (info.time - l.born) / l.life;
        if (age < 0 || age > 1) {
          l.mesh.visible = false;
          continue;
        }
        l.mesh.visible = true;
        l.mat.opacity = cfg.opacity * Math.min(1, age * 8) * (1 - age);
      }
    }
  }

  private spawnLaser(t: number, camera: THREE.PerspectiveCamera, mode: 'radial' | 'cross', thickness: number) {
    const l = this.lasers.find((x) => t - x.born > x.life) ?? this.lasers[Math.floor(this.rng() * this.lasers.length)];
    const c = camera.position;
    const a = this.rng() * Math.PI * 2;
    const p0 = new THREE.Vector3();
    const p1 = new THREE.Vector3();
    if (mode === 'radial') {
      // from near the vanishing point outward past the camera
      p0.set(Math.cos(a) * 1.5, Math.sin(a) * 1.5 + c.y, c.z - 260);
      const r = 6 + this.rng() * 14;
      p1.set(Math.cos(a) * r + c.x, Math.sin(a) * r + c.y, c.z - 4 - this.rng() * 20);
    } else {
      // a long line across the view that always misses the camera axis by a clear margin
      const z = c.z - 20 - this.rng() * 50;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      const off = (8 + this.rng() * 18) * (this.rng() < 0.5 ? -1 : 1);
      const ox = c.x - dy * off;
      const oy = c.y + dx * off;
      const half = 45;
      p0.set(ox - dx * half, oy - dy * half, z - this.rng() * 25);
      p1.set(ox + dx * half, oy + dy * half, z + this.rng() * 10);
    }
    const dir = p1.clone().sub(p0);
    const len = dir.length();
    l.mesh.position.copy(p0).addScaledVector(dir, 0.5);
    l.mesh.quaternion.setFromUnitVectors(Z_AXIS, dir.normalize());
    const th = thickness * (0.5 + this.rng() * 1.5);
    l.mesh.scale.set(th, th, len);
    l.born = t;
    l.life = 0.375 * (1 + this.rng() * 2);
  }

  private clear() {
    for (const m of this.scans) (m.material as THREE.Material).dispose();
    this.scanGroup.clear();
    this.scans = [];
    for (const l of this.lasers) {
      l.mat.dispose();
      this.group.remove(l.mesh);
    }
    this.lasers = [];
    this.lastBeat = -1;
  }
}
