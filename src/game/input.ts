/**
 * Steering input, unified:
 * - keyboard (WASD / arrows) and gamepad left stick give a velocity direction in -1..1
 * - mouse gives an absolute target (screen position maps onto the play area)
 * - touch drags move the target relative to where the finger went down
 * Fire (hold to lock on, release to shoot): Space, left mouse button, gamepad A / RB / RT,
 * or a touch that starts on the right third of the screen.
 */
export interface Steer {
  /** -1..1 velocity input from keys/stick */
  axis: { x: number; y: number };
  /** -1..1 absolute target from pointer/touch, or null */
  target: { x: number; y: number } | null;
}

export class Input {
  private keys = new Set<string>();
  private pointer: { x: number; y: number } | null = null;
  private pointerAt = 0;
  private touchStart: { x: number; y: number; tx: number; ty: number } | null = null;
  private touchTarget = { x: 0, y: 0 };
  /** lane mode: discrete left/right steps since the last read */
  private laneSteps = 0;
  private padPrev = { axis: 0, left: false, right: false };
  private swipe: { x: number; y: number } | null = null;
  private steerTouch: number | null = null;
  private fireTouch: number | null = null;
  private mouseFire = false;

  constructor(el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') e.preventDefault();
      this.keys.add(e.code);
      if (e.repeat) return;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.laneSteps--;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') this.laneSteps++;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseFire = false;
    });

    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button === 0) this.mouseFire = true;
    });
    window.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'mouse' && e.button === 0) this.mouseFire = false;
    });

    el.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      this.pointer = { x: (e.clientX / window.innerWidth) * 2 - 1, y: -((e.clientY / window.innerHeight) * 2 - 1) };
      this.pointerAt = performance.now();
    });

    el.addEventListener(
      'touchstart',
      (e) => {
        for (const t of e.changedTouches) {
          if (t.clientX > window.innerWidth * 0.65 && this.fireTouch === null) {
            this.fireTouch = t.identifier;
          } else if (this.steerTouch === null) {
            this.steerTouch = t.identifier;
            this.touchStart = { x: t.clientX, y: t.clientY, tx: this.touchTarget.x, ty: this.touchTarget.y };
            this.swipe = { x: t.clientX, y: t.clientY };
          }
        }
      },
      { passive: true },
    );
    el.addEventListener(
      'touchmove',
      (e) => {
        if (!this.touchStart) return;
        const t = [...e.changedTouches].find((x) => x.identifier === this.steerTouch);
        if (!t) return;
        // a horizontal swipe of 40px is one lane step; keep stepping while the finger keeps going
        if (this.swipe && Math.abs(t.clientX - this.swipe.x) > 40) {
          this.laneSteps += Math.sign(t.clientX - this.swipe.x);
          this.swipe = { x: t.clientX, y: t.clientY };
        }
        const s = 2.5 / Math.min(window.innerWidth, window.innerHeight);
        this.touchTarget.x = clamp(this.touchStart.tx + (t.clientX - this.touchStart.x) * s, -1, 1);
        this.touchTarget.y = clamp(this.touchStart.ty - (t.clientY - this.touchStart.y) * s, -1, 1);
        this.pointerAt = performance.now();
      },
      { passive: true },
    );
    const end = (e: TouchEvent) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.fireTouch) this.fireTouch = null;
        if (t.identifier === this.steerTouch) {
          this.steerTouch = null;
          this.touchStart = null;
          this.swipe = null;
        }
      }
    };
    el.addEventListener('touchend', end);
    el.addEventListener('touchcancel', end);
  }

  /** is fire being held (any device)? */
  fireHeld(): boolean {
    if (this.keys.has('Space') || this.mouseFire || this.fireTouch !== null) return true;
    for (const pad of navigator.getGamepads?.() ?? []) {
      if (pad && (pad.buttons[0]?.pressed || pad.buttons[5]?.pressed || (pad.buttons[7]?.value ?? 0) > 0.4)) return true;
    }
    return false;
  }

  /** lane mode: number of lane steps (−left / +right) since the last call, including gamepad flicks */
  takeLaneSteps(): number {
    for (const pad of navigator.getGamepads?.() ?? []) {
      if (!pad) continue;
      const ax = pad.axes[0] ?? 0;
      const axis = ax < -0.5 ? -1 : ax > 0.5 ? 1 : 0;
      if (axis !== 0 && axis !== this.padPrev.axis) this.laneSteps += axis;
      const left = !!pad.buttons[14]?.pressed;
      const right = !!pad.buttons[15]?.pressed;
      if (left && !this.padPrev.left) this.laneSteps--;
      if (right && !this.padPrev.right) this.laneSteps++;
      this.padPrev = { axis, left, right };
      break;
    }
    const n = this.laneSteps;
    this.laneSteps = 0;
    if (n !== 0) this.pointerAt = 0; // keys take over until the mouse moves again
    return n;
  }

  /** the pointer's horizontal position (-1..1) if it moved recently, for absolute lane picking */
  pointerX(): number | null {
    return this.pointer && performance.now() - this.pointerAt < 3000 ? this.pointer.x : null;
  }

  read(): Steer {
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;

    for (const pad of navigator.getGamepads?.() ?? []) {
      if (!pad) continue;
      const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : v);
      x += dz(pad.axes[0] ?? 0);
      y -= dz(pad.axes[1] ?? 0);
      if (pad.buttons[14]?.pressed) x -= 1;
      if (pad.buttons[15]?.pressed) x += 1;
      if (pad.buttons[12]?.pressed) y += 1;
      if (pad.buttons[13]?.pressed) y -= 1;
    }

    const usingAxis = x !== 0 || y !== 0;
    if (usingAxis) this.pointerAt = 0; // keys take over until the pointer moves again
    const pointerFresh = performance.now() - this.pointerAt < 3000;
    let target: Steer['target'] = null;
    if (!usingAxis && pointerFresh) target = this.touchStart || !this.pointer ? { ...this.touchTarget } : { ...this.pointer };

    return { axis: { x: clamp(x, -1, 1), y: clamp(y, -1, 1) }, target };
  }
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
