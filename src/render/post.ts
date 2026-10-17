import * as THREE from 'three/webgpu';
import { float, fract, length, luminance, mix, pass, rand, screenUV, smoothstep, time, uniform, vec2, vec3, vec4 } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import type { ScenePreset } from '../scenes/types';

/** Bloom → exposure → tinted vignette → haze → desaturate → white flash → fade → grain. */
export class Post {
  readonly pipeline: THREE.RenderPipeline;
  readonly flash = uniform(0);
  readonly fade = uniform(0);
  readonly vignette = uniform(0.7);
  readonly exposure = uniform(1);
  /** 0..1 drains colour out of the frame (hit feedback) */
  readonly desat = uniform(0);
  private readonly vignetteColor = uniform(new THREE.Color());
  private readonly grain = uniform(0.08);
  private readonly hazeColor = uniform(new THREE.Color());
  private readonly hazeAmount = uniform(0);
  private readonly hazeHeight = uniform(0.4);
  private readonly bloomNode: ReturnType<typeof bloom>;
  private baseBloom = 1;

  constructor(renderer: THREE.WebGPURenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const scenePass = pass(scene, camera);
    const color = scenePass.getTextureNode('output');
    this.bloomNode = bloom(color, 1, 0.7, 0.5);

    let c = color.rgb.add(this.bloomNode.rgb).mul(this.exposure);
    const d = length(screenUV.sub(0.5).mul(vec2(1.0, 0.85)));
    const v = smoothstep(0.2, 0.78, d).mul(this.vignette);
    c = mix(c, this.vignetteColor, v);
    // screenUV.y runs top (0) → bottom (1)
    const haze = smoothstep(float(1).sub(this.hazeHeight), 1.0, screenUV.y).mul(this.hazeAmount);
    c = mix(c, this.hazeColor, haze);
    c = mix(c, vec3(luminance(c)).mul(0.85), this.desat);
    c = mix(c, vec3(6), this.flash);
    c = c.mul(float(1).sub(this.fade));
    c = c.add(rand(screenUV.add(fract(time))).sub(0.5).mul(this.grain));

    this.pipeline = new THREE.RenderPipeline(renderer);
    this.pipeline.outputNode = vec4(c, 1);
  }

  apply(p: ScenePreset) {
    this.baseBloom = p.post.bloom;
    this.bloomNode.radius.value = p.post.bloomRadius;
    this.bloomNode.threshold.value = p.post.threshold;
    this.vignetteColor.value.set(p.post.vignetteColor);
    this.vignette.value = p.post.vignette;
    this.exposure.value = p.post.exposure;
    this.grain.value = p.post.grain;
    this.hazeAmount.value = p.post.haze?.amount ?? 0;
    if (p.post.haze) {
      this.hazeColor.value.set(p.post.haze.color);
      this.hazeHeight.value = p.post.haze.height;
    }
  }

  /** pump 0..1 from the kick/bass */
  setPump(pump: number, amount: number) {
    this.bloomNode.strength.value = this.baseBloom * (1 + pump * amount);
  }

  render() {
    this.pipeline.render();
  }
}
