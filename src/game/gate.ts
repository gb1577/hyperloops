import * as THREE from 'three/webgpu';

/** rings in the hyperloop; the last one is the finish line */
export const RINGS = 16;
/** ring polygon: octagons read as engineered, not organic */
const SIDES = 8;
/** total spiral of the rails along the tunnel (radians) */
const TWIST = Math.PI / 2;

/**
 * The hyperloop at the end of every level: a run of octagonal rings following the flight path, joined by
 * spiralling rails, with light pulses racing toward the exit on the beat and a glowing portal disc on the
 * finish line. The glider flies through it exactly as the level hands over to the next one.
 */
export class FinishGate {
  readonly group = new THREE.Group();
  private readonly rings: THREE.InstancedMesh;
  private readonly rails: THREE.LineSegments;
  private readonly railPos: Float32Array;
  private readonly railCol: Float32Array;
  private readonly portal: THREE.Mesh;
  private readonly portalMat: THREE.MeshBasicNodeMaterial;
  private readonly railMat: THREE.LineBasicNodeMaterial;
  private readonly color = new THREE.Color();
  private readonly c = new THREE.Color();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly centers: THREE.Vector3[] = Array.from({ length: RINGS }, () => new THREE.Vector3());
  private radius = 1;
  /** z of the tunnel mouth and the finish line; NaN while no tunnel is placed */
  private zStart = NaN;
  private zEnd = NaN;

  constructor() {
    const additive = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false } as const;
    // a torus with SIDES tubular segments is a polygon ring; rotate so a flat side is at the bottom
    const ringGeo = new THREE.TorusGeometry(1, 0.03, 4, SIDES);
    ringGeo.rotateZ(Math.PI / SIDES);
    this.rings = new THREE.InstancedMesh(ringGeo, new THREE.MeshBasicNodeMaterial({ ...additive, side: THREE.DoubleSide }), RINGS);
    this.rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rings.setColorAt(0, new THREE.Color());
    this.rings.frustumCulled = false;

    // one rail per polygon corner, one segment between each pair of rings
    const segs = SIDES * (RINGS - 1);
    this.railPos = new Float32Array(segs * 2 * 3);
    this.railCol = new Float32Array(segs * 2 * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.railPos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.railCol, 3));
    this.railMat = new THREE.LineBasicNodeMaterial({ ...additive, vertexColors: true });
    this.rails = new THREE.LineSegments(g, this.railMat);
    this.rails.frustumCulled = false;

    this.portalMat = new THREE.MeshBasicNodeMaterial({ ...additive, side: THREE.DoubleSide, opacity: 0.2 });
    this.portal = new THREE.Mesh(new THREE.CircleGeometry(1, SIDES, Math.PI / SIDES), this.portalMat);
    this.portal.frustumCulled = false;

    this.group.add(this.rings, this.rails, this.portal);
    this.group.visible = false;
  }

  get placed() {
    return !Number.isNaN(this.zEnd);
  }

  /** has the camera flown in past the mouth? */
  inside(z: number) {
    return this.placed && z < this.zStart;
  }

  /**
   * Lay the tunnel along the path, ending at zEnd.
   * @param pathAt flight-path centre at a depth
   * @param length tunnel length in world units
   */
  place(pathAt: (z: number, out: THREE.Vector3) => THREE.Vector3, zEnd: number, length: number, radius: number, color: THREE.ColorRepresentation) {
    this.zEnd = zEnd;
    this.zStart = zEnd + length;
    this.radius = radius;
    this.color.set(color);
    for (let i = 0; i < RINGS; i++) pathAt(this.zStart - (length * i) / (RINGS - 1), this.centers[i]);

    // rails: corner k of ring i -> corner k of ring i+1, each ring turned a little more (the spiral)
    let o = 0;
    for (let i = 0; i < RINGS - 1; i++) {
      for (let k = 0; k < SIDES; k++) {
        for (const j of [i, i + 1]) {
          const a = (k / SIDES) * Math.PI * 2 + Math.PI / SIDES + this.twist(j);
          const p = this.centers[j];
          this.railPos.set([p.x + Math.cos(a) * radius, p.y + Math.sin(a) * radius, p.z], o);
          o += 3;
        }
      }
    }
    this.rails.geometry.attributes.position.needsUpdate = true;

    const end = this.centers[RINGS - 1];
    this.portal.position.copy(end);
    this.portal.scale.setScalar(radius);
    this.group.visible = true;
  }

  clear() {
    this.zEnd = NaN;
    this.zStart = NaN;
    this.group.visible = false;
  }

  private twist(i: number) {
    return (i / (RINGS - 1)) * TWIST;
  }

  /**
   * @param beat continuous beat count: a pulse runs from the mouth to the exit once per beat
   * @param kick 1 on the kick, decaying: the whole tunnel breathes with it
   */
  update(cameraZ: number, beat: number, kick: number) {
    if (!this.placed) return;
    if (cameraZ < this.zEnd - 2) {
      this.clear();
      return;
    }
    // fade in from far away, full brightness once close
    const near = THREE.MathUtils.clamp(1 - (cameraZ - this.zStart) / 260, 0.15, 1);
    const phase = beat % 1;

    for (let i = 0; i < RINGS; i++) {
      const u = i / (RINGS - 1);
      // a bright band travelling toward the exit each beat
      const d = Math.abs(u - phase);
      const pulse = Math.exp(-((Math.min(d, 1 - d) * 7) ** 2));
      const last = i === RINGS - 1;
      const k = near * (0.3 + 1.1 * pulse + kick * 0.3 + (last ? 1 : 0));
      const r = this.radius * (last ? 1.08 : 1) * (1 + kick * 0.03);
      this.q.setFromAxisAngle(Z_AXIS, this.twist(i));
      this.s.set(r, r, r * (last ? 2.5 : 1.4));
      this.m.compose(this.centers[i], this.q, this.s);
      this.rings.setMatrixAt(i, this.m);
      this.c.copy(this.color).lerp(WHITE, 0.25 + pulse * 0.4).multiplyScalar(k * 1.6);
      this.rings.setColorAt(i, this.c);

      // rails take the brightness of the ring they start from
      if (i < RINGS - 1) {
        this.c.copy(this.color).multiplyScalar(near * (0.5 + pulse * 1.2));
        for (let v = 0; v < SIDES * 2; v++) this.railCol.set([this.c.r, this.c.g, this.c.b], (i * SIDES * 2 + v) * 3);
      }
    }
    this.rings.count = RINGS;
    this.rings.instanceMatrix.needsUpdate = true;
    if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
    this.rails.geometry.attributes.color.needsUpdate = true;

    this.portalMat.color.copy(this.color).lerp(WHITE, 0.5);
    this.portalMat.opacity = near * (0.12 + kick * 0.12);
  }
}

const Z_AXIS = new THREE.Vector3(0, 0, 1);
const WHITE = new THREE.Color('#ffffff');
