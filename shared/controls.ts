// Touch controls for the 3D games (Llama-blox, Speed Run AM). Touch: a joystick wherever the left thumb lands,
// drag on the right half to look around, and a big jump button.
// Mac: WASD or arrow keys, space to jump, drag the mouse or Q/E to look, scroll to zoom.
// The game's CSS styles the joystick (`.stick-base`, `.stick-knob`, `.on`).

export class Controls {
  /** Wanted movement relative to the camera: x = right, y = forward, each -1..1. */
  stickX = 0;
  stickY = 0;
  /** Camera turn/tilt since the last read (radians), and zoom steps. */
  lookX = 0;
  lookY = 0;
  zoom = 0;
  enabled = false;
  private keys = new Set<string>();
  private jumpQueued = false;
  private stickId = -1;
  private stickOrigin = { x: 0, y: 0 };
  private lookId = -1;
  private lookLast = { x: 0, y: 0 };
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly R = 60; // joystick reach (px)

  constructor(surface: HTMLElement, jumpButton: HTMLElement) {
    this.base = document.createElement('div');
    this.base.className = 'stick-base';
    this.knob = document.createElement('div');
    this.knob.className = 'stick-knob';
    this.base.append(this.knob);
    document.body.append(this.base);

    surface.addEventListener('pointerdown', (e) => this.down(e));
    window.addEventListener('pointermove', (e) => this.move(e));
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('pointercancel', (e) => this.up(e));
    surface.addEventListener('wheel', (e) => (this.zoom += Math.sign(e.deltaY)), { passive: true });

    jumpButton.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.jumpQueued = true;
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.code === 'Space' && !e.repeat) this.jumpQueued = true;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private down(e: PointerEvent) {
    if (!this.enabled) return;
    const touch = e.pointerType !== 'mouse';
    if (touch && e.clientX < window.innerWidth * 0.45 && this.stickId < 0) {
      this.stickId = e.pointerId;
      this.stickOrigin = { x: e.clientX, y: e.clientY };
      this.base.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      this.knob.style.transform = '';
      this.base.classList.add('on');
    } else if (this.lookId < 0) {
      this.lookId = e.pointerId;
      this.lookLast = { x: e.clientX, y: e.clientY };
    }
  }

  private move(e: PointerEvent) {
    if (e.pointerId === this.stickId) {
      let dx = e.clientX - this.stickOrigin.x, dy = e.clientY - this.stickOrigin.y;
      const d = Math.hypot(dx, dy);
      if (d > this.R) {
        dx *= this.R / d;
        dy *= this.R / d;
      }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.stickX = dx / this.R;
      this.stickY = -dy / this.R;
    } else if (e.pointerId === this.lookId) {
      const k = e.pointerType === 'mouse' ? 0.006 : 0.009;
      this.lookX += (e.clientX - this.lookLast.x) * k;
      this.lookY += (e.clientY - this.lookLast.y) * k * 0.6;
      this.lookLast = { x: e.clientX, y: e.clientY };
    }
  }

  private up(e: PointerEvent) {
    if (e.pointerId === this.stickId) {
      this.stickId = -1;
      this.stickX = this.stickY = 0;
      this.base.classList.remove('on');
    }
    if (e.pointerId === this.lookId) this.lookId = -1;
  }

  /** Movement from the stick plus the keyboard. */
  moveInput() {
    const k = this.keys;
    const kx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const ky = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    return { x: this.stickX + kx, y: this.stickY + ky };
  }

  /** Camera turning from the keyboard: Q turns left, E turns right. */
  keyTurn() {
    return (this.keys.has('KeyE') ? 1 : 0) - (this.keys.has('KeyQ') ? 1 : 0);
  }

  /** True once per jump press. */
  takeJump() {
    const j = this.jumpQueued;
    this.jumpQueued = false;
    return j;
  }

  /** Forget everything (when a menu opens). */
  reset() {
    this.stickId = this.lookId = -1;
    this.stickX = this.stickY = this.lookX = this.lookY = this.zoom = 0;
    this.jumpQueued = false;
    this.base.classList.remove('on');
  }
}
