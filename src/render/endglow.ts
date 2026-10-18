import * as THREE from 'three/webgpu';
import { float, length, smoothstep, uniform, uv, vec3 } from 'three/tsl';

/**
 * A bright glow at the far end of a tunnel: a small solid core that fades out slowly and widely,
 * drawn over the terrain so it hides where the tunnel geometry stops.
 */
export class EndGlow {
  readonly mesh: THREE.Mesh;
  private readonly intensity = uniform(2);

  constructor() {
    const d = length(uv().sub(0.5)).mul(2); // 0 centre → 1 edge
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false });
    mat.colorNode = vec3(this.intensity);
    // tiny solid core, then a long soft falloff
    mat.opacityNode = float(1).sub(smoothstep(0.04, 1.0, d)).pow(2.6);
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    this.mesh.renderOrder = 5;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** place it at a world point, sized `radius`, facing the camera */
  place(at: THREE.Vector3, radius: number, intensity: number, camera: THREE.Camera) {
    this.mesh.visible = true;
    this.mesh.position.copy(at);
    this.mesh.scale.setScalar(radius * 2);
    this.mesh.quaternion.copy(camera.quaternion);
    this.intensity.value = intensity;
  }

  hide() {
    this.mesh.visible = false;
  }
}
