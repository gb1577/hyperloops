/**
 * Steering input, unified:
 * - keyboard (WASD / arrows) and gamepad left stick give a velocity direction in -1..1
 * - mouse gives an absolute target (screen position maps onto the play area)
 * - touch drags move the target relative to where the finger went down
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

  constructor(el: HTMLElement) {
    window.addEventListener('keydown', (e) => this.keys.add(e.code));
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    el.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      this.pointer = { x: (e.clientX / window.innerWidth) * 2 - 1, y: -((e.clientY / window.innerHeight) * 2 - 1) };
      this.pointerAt = performance.now();
    });

    el.addEventListener(
      'touchstart',
      (e) => {
        const t = e.changedTouches[0];
        this.touchStart = { x: t.clientX, y: t.clientY, tx: this.touchTarget.x, ty: this.touchTarget.y };
      },
      { passive: true },
    );
    el.addEventListener(
      'touchmove',
      (e) => {
        if (!this.touchStart) return;
        const t = e.changedTouches[0];
        const s = 2.5 / Math.min(window.innerWidth, window.innerHeight);
        this.touchTarget.x = clamp(this.touchStart.tx + (t.clientX - this.touchStart.x) * s, -1, 1);
        this.touchTarget.y = clamp(this.touchStart.ty - (t.clientY - this.touchStart.y) * s, -1, 1);
        this.pointerAt = performance.now();
      },
      { passive: true },
    );
    el.addEventListener('touchend', () => (this.touchStart = null));
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
