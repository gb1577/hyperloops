import * as THREE from 'three/webgpu';
import { dot, max, mix, normalize, positionLocal, pow, select, smoothstep, uniform } from 'three/tsl';
import type { ScenePreset } from '../scenes/types';

/** Camera-centred sky dome: 3-stop gradient + a huge sun halo (the video's signature light). */
export class Sky {
  readonly mesh: THREE.Mesh;
  private readonly top = uniform(new THREE.Color());
  private readonly horizon = uniform(new THREE.Color());
  private readonly ground = uniform(new THREE.Color());
  private readonly sun = uniform(new THREE.Color());
  readonly sunDir = uniform(new THREE.Vector3(0, 0.1, -1));
  readonly sunIntensity = uniform(1);
  private readonly halo = uniform(0.5);

  constructor() {
    const dir = normalize(positionLocal);
    const y = dir.y;
    const up = mix(this.horizon, this.top, smoothstep(0.0, 0.4, y));
    const down = mix(this.horizon, this.ground, smoothstep(0.02, 0.5, y.negate()));
    const base = select(y.greaterThan(0), up, down);
    const s = max(dot(dir, normalize(this.sunDir)), 0);
    const glow = pow(s, 6).mul(this.halo).mul(0.6).add(pow(s, 40).mul(0.8)).add(pow(s, 400).mul(2.5));
    const color = base.add(this.sun.mul(glow).mul(this.sunIntensity));

    const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false });
    mat.colorNode = color;
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), mat);
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;
  }

  apply(p: ScenePreset) {
    this.top.value.set(p.sky.top);
    this.horizon.value.set(p.sky.horizon);
    this.ground.value.set(p.sky.ground);
    this.sun.value.set(p.sky.sun);
    this.sunDir.value.set(...p.sky.sunDir).normalize();
    this.halo.value = p.sky.halo;
  }
}
