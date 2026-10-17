import * as THREE from 'three/webgpu';
import { PRESETS } from '../scenes/presets';
import type { ScenePreset } from '../scenes/types';
import { SCENE_LEN, type BeatInfo } from '../core/beatclock';
import { fbm } from '../core/noise';
import { TerrainLayer, tubeCenter } from './terrain';
import { Sky } from './sky';
import { LineFX } from './lines';
import { Post } from './post';

/** Distance travelled at time t: speed changes per scene, but position stays a pure function of time (seek-safe). */
export function zAt(t: number): number {
  const loops = Math.floor(t / (SCENE_LEN * PRESETS.length));
  const loopLen = PRESETS.reduce((s, p) => s + p.camera.speed * SCENE_LEN, 0);
  let tt = t - loops * SCENE_LEN * PRESETS.length;
  let z = loops * loopLen;
  for (const p of PRESETS) {
    const d = Math.min(tt, SCENE_LEN);
    z += d * p.camera.speed;
    tt -= d;
    if (tt <= 0) break;
  }
  return -z;
}

export class World {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1400);
  readonly post: Post;
  private readonly sky = new Sky();
  private readonly lines = new LineFX();
  private readonly sun = new THREE.DirectionalLight();
  private readonly hemi = new THREE.HemisphereLight();
  private readonly fogExp = new THREE.FogExp2('#ffffff', 0.01);
  private readonly fogLinear = new THREE.Fog('#ffffff', 50, 200);
  private layers: TerrainLayer[] = [];
  private current = -1;
  preset: ScenePreset = PRESETS[0];

  constructor(renderer: THREE.WebGPURenderer) {
    this.scene.fog = this.fogExp;
    this.scene.add(this.sky.mesh, this.sun, this.sun.target, this.hemi, this.lines.group);
    this.post = new Post(renderer, this.scene, this.camera);
    this.setScene(0);
  }

  /** rebuild the current scene from its (possibly edited) preset */
  reapply() {
    const i = this.current;
    this.current = -1;
    this.setScene(i);
  }

  get sceneIndex() {
    return this.current;
  }

  setScene(i: number) {
    if (i === this.current) return;
    this.current = i;
    const p = (this.preset = PRESETS[i]);
    for (const l of this.layers) {
      this.scene.remove(l.group);
      l.dispose();
    }
    this.layers = p.layers.map((spec) => new TerrainLayer(spec));
    for (const l of this.layers) this.scene.add(l.group);

    this.sky.apply(p);
    this.post.apply(p);
    this.lines.apply(p);
    if (p.fog.near !== undefined && p.fog.far !== undefined) {
      this.fogLinear.color.set(p.fog.color);
      this.fogLinear.near = p.fog.near;
      this.fogLinear.far = p.fog.far;
      this.scene.fog = this.fogLinear;
    } else {
      this.fogExp.color.set(p.fog.color);
      this.fogExp.density = p.fog.density;
      this.scene.fog = this.fogExp;
    }
    this.sun.color.set(p.light.color);
    this.sun.intensity = p.light.intensity;
    this.hemi.color.set(p.light.hemiSky);
    this.hemi.groundColor.set(p.light.hemiGround);
    this.hemi.intensity = p.light.hemi;
    this.camera.fov = p.camera.fov;
    this.camera.updateProjectionMatrix();
  }

  update(info: BeatInfo, bass: number) {
    const idx = info.sceneIndex % PRESETS.length;
    this.setScene(idx);
    const p = this.preset;
    const c = p.camera;
    const t = info.time;

    // camera
    const z = zAt(t);
    const swayX = (fbm(t * 0.12, 3.7, 3) - 0.5) * 2 * c.sway * 2;
    const swayY = (fbm(t * 0.1, 9.1, 3) - 0.5) * 2 * c.sway * 0.6;
    const baseY = p.layers[0]?.kind === 'floor' ? p.layers[0].base + c.height : c.height;
    // follow a meandering cave and look down its path
    const lead = p.layers[0]?.kind === 'tube' ? p.layers[0] : undefined;
    const c0 = lead ? tubeCenter(lead, z) : { x: 0, y: 0 };
    const c1 = lead ? tubeCenter(lead, z - 40) : { x: 0, y: 0 };
    this.camera.position.set(c0.x + swayX, c0.y + baseY + swayY, z);
    const roll = c.roll + c.rollSwing * Math.sin((info.bar / c.rollPeriodBars) * Math.PI * 2);
    const yaw = -swayX * 0.004 - Math.atan2(c1.x - c0.x, 40);
    const pitch = c.pitch + Math.atan2(c1.y - c0.y, 40);
    this.camera.rotation.set(pitch, yaw, roll, 'YXZ');
    this.camera.updateMatrixWorld();

    // in a meandering cave, keep the light at the far end of the tunnel
    if (lead?.wander) {
      const far = tubeCenter(lead, z - 300);
      this.sky.sunDir.value.set(far.x - this.camera.position.x, far.y - this.camera.position.y, -300).normalize();
    }

    // sky + lights follow the camera
    this.sky.mesh.position.copy(this.camera.position);
    this.sun.target.position.copy(this.camera.position);
    this.sun.position.copy(this.camera.position).addScaledVector(new THREE.Vector3(...p.light.dir).normalize(), 100);

    for (const l of this.layers) l.update(z);
    this.lines.update(info, this.camera);

    // music reactivity
    const pump = Math.max(info.kick * 0.7, bass);
    this.post.setPump(pump, p.post.pump);
    this.sky.sunIntensity.value = p.sky.sunIntensity * (1 + pump * p.post.pump * 0.6);

    // transitions: white-out ramps into scenes that start with a flash, and a short punch after every cut
    const next = PRESETS[(idx + 1) % PRESETS.length];
    let flash = Math.exp(-info.sceneTime * 7) * (p.transition === 'flash' ? 1 : 0.35);
    const toEnd = SCENE_LEN - info.sceneTime;
    if (next.transition === 'flash' && toEnd < 1.5) flash = Math.max(flash, Math.pow(1 - toEnd / 1.5, 2));
    this.post.flash.value = Math.min(1, flash);

    const fadeOut = p.fadeOut ?? 0;
    this.post.vignette.value = p.post.vignette + info.sceneProgress * 0.35 * fadeOut;
    // only the last scene fades to black (the loop seam)
    const last = idx === PRESETS.length - 1;
    this.post.fade.value = last ? Math.pow(Math.max(0, (info.sceneProgress - 0.55) / 0.45), 2) * fadeOut : 0;
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
