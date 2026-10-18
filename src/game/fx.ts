import * as THREE from 'three/webgpu';

const MAX = 160;
const MAX_RINGS = 12;

interface Spark {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  born: number;
  life: number;
  size: number;
  color: THREE.Color;
}

interface Ring {
  pos: THREE.Vector3;
  born: number;
  life: number;
  size: number;
  color: THREE.Color;
}

/** Tiny additive shards for graze sparks and hit bursts, plus camera-facing shockwave rings. */
export class SparkFX {
  readonly group = new THREE.Group();
  private readonly mesh: THREE.InstancedMesh;
  private readonly ringMesh: THREE.InstancedMesh;
  private sparks: Spark[] = [];
  private rings: Ring[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly e = new THREE.Euler();

  constructor() {
    const geo = new THREE.TetrahedronGeometry(1, 0);
    const mat = () => new THREE.MeshBasicNodeMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(geo, mat(), MAX);
    this.ringMesh = new THREE.InstancedMesh(new THREE.RingGeometry(0.86, 1, 40, 1), mat(), MAX_RINGS);
    for (const m of [this.mesh, this.ringMesh]) {
      m.frustumCulled = false;
      m.count = 0;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, new THREE.Color());
    }
    this.group.add(this.mesh, this.ringMesh);
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

  /** an expanding ring of light facing the camera */
  ring(at: THREE.Vector3, color: THREE.ColorRepresentation, size: number, time: number, life = 0.35) {
    if (this.rings.length >= MAX_RINGS) this.rings.shift();
    this.rings.push({ pos: at.clone(), born: time, life, size, color: new THREE.Color(color) });
  }

  clear() {
    this.sparks.length = 0;
    this.rings.length = 0;
    this.mesh.count = 0;
    this.ringMesh.count = 0;
  }

  update(time: number, dt: number, camera: THREE.Camera) {
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
    finish(this.mesh, this.sparks.length);

    this.rings = this.rings.filter((r) => time - r.born < r.life);
    this.rings.forEach((r, i) => {
      const age = (time - r.born) / r.life;
      const k = r.size * (0.2 + 0.8 * (1 - (1 - age) ** 3));
      this.s.setScalar(k);
      this.m.compose(r.pos, camera.quaternion, this.s);
      this.ringMesh.setMatrixAt(i, this.m);
      this.ringMesh.setColorAt(i, tmp.copy(r.color).multiplyScalar(2.5 * (1 - age) ** 2));
    });
    finish(this.ringMesh, this.rings.length);
  }
}

function finish(m: THREE.InstancedMesh, n: number) {
  m.count = n;
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
}
