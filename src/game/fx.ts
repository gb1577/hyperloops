import * as THREE from 'three/webgpu';

const MAX = 160;

interface Spark {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  born: number;
  life: number;
  size: number;
  color: THREE.Color;
}

/** Tiny additive shards for graze sparks and hit bursts. */
export class SparkFX {
  readonly mesh: THREE.InstancedMesh;
  private sparks: Spark[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly e = new THREE.Euler();

  constructor() {
    const geo = new THREE.TetrahedronGeometry(1, 0);
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color());
  }

  emit(at: THREE.Vector3, count: number, color: THREE.ColorRepresentation, speed: number, time: number, drift = new THREE.Vector3()) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      if (this.sparks.length >= MAX) this.sparks.shift();
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      this.sparks.push({
        pos: at.clone(),
        vel: dir.multiplyScalar(speed * (0.4 + Math.random() * 0.8)).add(drift),
        born: time,
        life: 0.35 + Math.random() * 0.4,
        size: 0.08 + Math.random() * 0.14,
        color: c,
      });
    }
  }

  clear() {
    this.sparks.length = 0;
    this.mesh.count = 0;
  }

  update(time: number, dt: number) {
    this.sparks = this.sparks.filter((s) => time - s.born < s.life);
    const tmp = new THREE.Color();
    this.sparks.forEach((s, i) => {
      const age = (time - s.born) / s.life;
      s.pos.addScaledVector(s.vel, dt);
      s.vel.multiplyScalar(1 - dt * 2.5);
      this.e.set(time * 7 + i, time * 5 + i * 0.7, 0);
      this.q.setFromEuler(this.e);
      const k = s.size * (1 - age);
      this.s.set(k, k, k * 2.5);
      this.m.compose(s.pos, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
      this.mesh.setColorAt(i, tmp.copy(s.color).multiplyScalar(3 * (1 - age)));
    });
    this.mesh.count = this.sparks.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
