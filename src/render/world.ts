import * as THREE from 'three/webgpu';
import { PRESETS } from '../scenes/presets';
import type { ScenePreset } from '../scenes/types';
import type { BeatInfo } from '../core/beatclock';
import { LOOP_LEN, SCENE_LENS } from '../core/timeline';
import { fbm } from '../core/noise';
import { TerrainLayer, tubeCenter } from './terrain';
import { Sky } from './sky';
import { LineFX } from './lines';
import { Post } from './post';
import { EndGlow } from './endglow';

/** Distance travelled at time t: speed changes per scene, but position stays a pure function of time (seek-safe). */
export function zAt(t: number): number {
  const loops = Math.floor(Math.max(0, t) / LOOP_LEN);
  const loopLen = PRESETS.reduce((s, p, i) => s + p.camera.speed * SCENE_LENS[i], 0);
  let tt = Math.max(0, t) - loops * LOOP_LEN;
  let z = loops * loopLen;
  for (let i = 0; i < PRESETS.length; i++) {
    const d = Math.min(tt, SCENE_LENS[i]);
    z += d * PRESETS[i].camera.speed;
    tt -= d;
    if (tt <= 0) break;
  }
  return -z;
}

/** how far ahead of the camera the glider flies */
export const GLIDER_AHEAD = 9;

/** player offset from the flight path, fed back so the camera can chase the glider */
export interface Focus {
  x: number;
  y: number;
  bank: number;
  /** tunnel lanes: roll the whole view so the glider's lane is at the bottom */
  spin: number;
}
const NO_FOCUS: Focus = { x: 0, y: 0, bank: 0, spin: 0 };

export class World {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1400);
  readonly post: Post;
  private readonly sky = new Sky();
  private readonly lines = new LineFX();
  private readonly endGlow = new EndGlow();
  private readonly sun = new THREE.DirectionalLight();
  private readonly hemi = new THREE.HemisphereLight();
  private readonly fogExp = new THREE.FogExp2('#ffffff', 0.01);
  private readonly fogLinear = new THREE.Fog('#ffffff', 50, 200);
  private layers: TerrainLayer[] = [];
  private current = -1;
  private punchFlash = 0;
  /**
   * 0 = the reference-video look (look-dev, title); 1 = gameplay: the centre glow, bloom and fog are
   * pulled back so spikes stay readable.
   */
  clarity = 0;
  /** extra field of view in degrees (the warp after a level clear) */
  fovKick = 0;
  preset: ScenePreset = PRESETS[0];

  constructor(renderer: THREE.WebGPURenderer) {
    this.scene.fog = this.fogExp;
    this.scene.add(this.sky.mesh, this.sun, this.sun.target, this.hemi, this.lines.group, this.endGlow.mesh);
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

  get terrain(): readonly TerrainLayer[] {
    return this.layers;
  }

  /** Centre of the flight path at depth z, at the scene's flight height. */
  pathPoint(z: number, out: THREE.Vector3): THREE.Vector3 {
    const p = this.preset;
    const first = p.layers[0];
    const baseY = first?.kind === 'floor' ? first.base + p.camera.height : p.camera.height;
    const c = first?.kind === 'tube' ? tubeCenter(first, z) : { x: 0, y: 0 };
    return out.set(c.x, c.y + baseY, z);
  }

  /** a short white flash on top of the scene transitions (hit feedback) */
  punch(amount: number) {
    this.punchFlash = Math.max(this.punchFlash, amount);
  }

  /** Smallest free space to any terrain surface at a world point (Infinity when there is none). */
  clearance(x: number, y: number, z: number): number {
    let m = Infinity;
    for (const l of this.layers) m = Math.min(m, l.clearance(x, y, z));
    return m;
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

  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();

  update(info: BeatInfo, bass: number, focus: Focus = NO_FOCUS) {
    const idx = info.sceneIndex % PRESETS.length;
    this.setScene(idx);
    const p = this.preset;
    const c = p.camera;
    const t = info.time;

    // chase camera: sits behind and above the glider, looks down the path past it
    const z = zAt(t);
    const swayX = (fbm(t * 0.12, 3.7, 3) - 0.5) * 2 * c.sway * 0.8;
    const swayY = (fbm(t * 0.1, 9.1, 3) - 0.5) * 2 * c.sway * 0.25;
    const lead = p.layers[0]?.kind === 'tube' ? p.layers[0] : undefined;
    const lift = lead ? 1.3 : 2.2;
    const look = 16;
    const pc = this.pathPoint(z, this.tmpA);
    const pg = this.pathPoint(z - GLIDER_AHEAD - look, this.tmpB);
    // "up" for the camera: world up, or toward the tunnel centre from the glider's lane
    const ux = -Math.sin(focus.spin);
    const uy = Math.cos(focus.spin);
    const follow = focus.spin ? 0.6 : 0.7;
    const rise = lift * 0.3 + Math.tan(c.pitch) * (GLIDER_AHEAD + look);
    this.camera.position.set(pc.x + focus.x * follow + swayX + ux * lift, pc.y + focus.y * follow + swayY + uy * lift, z);
    this.camera.up.set(ux, uy, 0);
    this.camera.lookAt(pg.x + focus.x * 0.85 + ux * rise, pg.y + focus.y * 0.85 + uy * rise, pg.z);
    const fov = c.fov + this.fovKick;
    if (this.camera.fov !== fov) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    const roll = c.roll + c.rollSwing * Math.sin((info.bar / c.rollPeriodBars) * Math.PI * 2);
    this.camera.rotateZ(roll + focus.bank * 0.35);
    this.camera.updateMatrixWorld();

    // in a meandering cave, keep the light at the far end of the tunnel
    if (lead?.wander) {
      const far = tubeCenter(lead, z - 300);
      this.sky.sunDir.value.set(far.x - this.camera.position.x, far.y - this.camera.position.y, -300).normalize();
    }

    if (p.endGlow) {
      const g = p.endGlow;
      this.endGlow.place(this.pathPoint(z - g.distance, this.tmpB), g.radius, g.intensity, this.camera);
    } else this.endGlow.hide();

    // sky + lights follow the camera
    this.sky.mesh.position.copy(this.camera.position);
    this.sun.target.position.copy(this.camera.position);
    this.sun.position.copy(this.camera.position).addScaledVector(new THREE.Vector3(...p.light.dir).normalize(), 100);

    for (const l of this.layers) l.update(z);
    this.lines.update(info, this.camera);

    // music reactivity
    const pump = Math.max(info.kick * 0.7, bass);
    const k = this.clarity;
    this.post.setPump(pump, p.post.pump * (1 - 0.6 * k), 1 - 0.45 * k);
    this.sky.sunIntensity.value = p.sky.sunIntensity * (1 - 0.4 * k) * (1 + pump * p.post.pump * 0.6 * (1 - 0.6 * k));
    if (this.scene.fog === this.fogExp) this.fogExp.density = p.fog.density * (1 - 0.4 * k);
    else if (p.fog.far !== undefined) this.fogLinear.far = p.fog.far * (1 + 0.4 * k);

    // transitions: white-out ramps into scenes that start with a flash, and a short punch after every cut
    const next = PRESETS[(idx + 1) % PRESETS.length];
    let flash = Math.exp(-info.sceneTime * 7) * (p.transition === 'flash' ? 1 : 0.35) * (1 - 0.5 * k);
    const toEnd = info.sceneLen - info.sceneTime;
    if (next.transition === 'flash' && toEnd < 1.5) flash = Math.max(flash, Math.pow(1 - toEnd / 1.5, 2));
    this.punchFlash *= 0.85;
    this.post.flash.value = Math.min(1, Math.max(flash, this.punchFlash));

    const fadeOut = p.fadeOut ?? 0;
    this.post.vignette.value = p.post.vignette + info.sceneProgress * 0.35 * fadeOut;
    // only the last scene fades to black (the loop seam)
    const last = idx === PRESETS.length - 1;
    this.post.fade.value = last ? Math.pow(Math.max(0, (info.sceneTime - (info.sceneLen - 3)) / 3), 2) * fadeOut : 0;
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
