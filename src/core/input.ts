// Unified input: keyboard + mouse (pointer lock) + touch (floating virtual stick, camera drag, buttons).
import * as THREE from 'three';

export type Action = 'light' | 'heavy' | 'dodge' | 'jump' | 'interact' | 'lock' | 'special' | 'sprint' | 'crouch'
  | 'track' | 'map' | 'inv' | 'ledger' | 'eat' | 'help' | 'weather' | 'skip' | 'camp' | 'menuBack';

const KEYMAP: Record<string, Action> = {
  ShiftLeft: 'sprint', ShiftRight: 'sprint', Space: 'dodge', KeyF: 'jump', KeyE: 'interact', KeyR: 'lock', Tab: 'lock',
  KeyQ: 'special', KeyC: 'crouch', ControlLeft: 'crouch', KeyT: 'track', KeyM: 'map', KeyI: 'inv', KeyJ: 'ledger',
  Digit1: 'eat', KeyH: 'help', KeyK: 'weather', KeyN: 'skip', KeyB: 'camp', Escape: 'menuBack',
};

export class Input {
  move = new THREE.Vector2();
  look = new THREE.Vector2();
  private held = new Set<Action>();
  private down = new Set<Action>();
  private up = new Set<Action>();
  private keys = new Set<string>();
  private heldTime = new Map<Action, number>();
  touchMode = false;
  stickVec = new THREE.Vector2();
  private stickId: number | null = null;
  private stickOrigin = new THREE.Vector2();
  private lookId: number | null = null;
  private lookLast = new THREE.Vector2();
  stickEl!: HTMLDivElement;
  stickKnob!: HTMLDivElement;
  uiBlocking = false; // a menu is open: suppress gameplay input
  mouseSens = 0.0024;
  touchSens = 0.006;

  constructor(private canvas: HTMLCanvasElement) {
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) { this.touchMode = true; document.body.classList.add('touch'); }
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      const a = KEYMAP[e.code];
      if (a) this.press(a);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      const a = KEYMAP[e.code];
      if (a) this.release(a);
    });
    window.addEventListener('blur', () => { this.keys.clear(); for (const a of [...this.held]) this.release(a); });
    canvas.addEventListener('mousedown', (e) => {
      if (this.touchMode) {
        // Hybrid devices: a real (non-touch-emulated) mouse click switches back to mouse mode
        const fires = (e as MouseEvent & { sourceCapabilities?: { firesTouchEvents?: boolean } }).sourceCapabilities?.firesTouchEvents;
        if (fires !== false) return;
        this.touchMode = false; document.body.classList.remove('touch');
      }
      if (document.pointerLockElement !== canvas && !this.uiBlocking) { canvas.requestPointerLock?.(); }
      if (e.button === 0) this.press('light');
      if (e.button === 2) this.press('heavy');
      if (e.button === 1) { this.press('lock'); e.preventDefault(); }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.release('light');
      if (e.button === 2) this.release('heavy');
      if (e.button === 1) this.release('lock');
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === canvas) this.look.x += e.movementX * this.mouseSens, this.look.y += e.movementY * this.mouseSens;
    });

    // Touch: left 45% of the screen spawns a floating stick, the rest drags the camera.
    const opts: AddEventListenerOptions = { passive: false };
    canvas.addEventListener('touchstart', (e) => {
      this.touchMode = true;
      document.body.classList.add('touch');
      for (const t of Array.from(e.changedTouches)) {
        if (t.clientX < window.innerWidth * 0.45 && this.stickId === null) {
          this.stickId = t.identifier;
          this.stickOrigin.set(t.clientX, t.clientY);
          this.stickEl.style.left = t.clientX + 'px';
          this.stickEl.style.top = t.clientY + 'px';
          this.stickEl.classList.add('on');
        } else if (this.lookId === null) {
          this.lookId = t.identifier;
          this.lookLast.set(t.clientX, t.clientY);
        }
      }
      e.preventDefault();
    }, opts);
    canvas.addEventListener('touchmove', (e) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.stickId) {
          const dx = t.clientX - this.stickOrigin.x, dy = t.clientY - this.stickOrigin.y;
          const R = 56;
          const len = Math.hypot(dx, dy);
          const k = len > R ? R / len : 1;
          this.stickVec.set((dx * k) / R, (-dy * k) / R);
          this.stickKnob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
        } else if (t.identifier === this.lookId) {
          this.look.x += (t.clientX - this.lookLast.x) * this.touchSens;
          this.look.y += (t.clientY - this.lookLast.y) * this.touchSens;
          this.lookLast.set(t.clientX, t.clientY);
        }
      }
      e.preventDefault();
    }, opts);
    const end = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (t.identifier === this.stickId) {
          this.stickId = null;
          this.stickVec.set(0, 0);
          this.stickKnob.style.transform = '';
          this.stickEl.classList.remove('on');
        } else if (t.identifier === this.lookId) this.lookId = null;
      }
    };
    canvas.addEventListener('touchend', end);
    canvas.addEventListener('touchcancel', end);
  }

  /** Bind an on-screen button element to an action (touch + mouse). */
  bindButton(el: HTMLElement, a: Action) {
    const on = (e: Event) => { e.preventDefault(); e.stopPropagation(); this.press(a); el.classList.add('pressed'); };
    const off = (e: Event) => { e.preventDefault(); this.release(a); el.classList.remove('pressed'); };
    el.addEventListener('touchstart', on, { passive: false });
    el.addEventListener('touchend', off, { passive: false });
    el.addEventListener('touchcancel', off, { passive: false });
    el.addEventListener('mousedown', on);
    el.addEventListener('mouseup', off);
    el.addEventListener('mouseleave', (e) => { if (this.held.has(a)) off(e); });
  }

  press(a: Action) { if (!this.held.has(a)) { this.held.add(a); this.down.add(a); this.heldTime.set(a, 0); } }
  release(a: Action) { if (this.held.has(a)) { this.held.delete(a); this.up.add(a); } }
  isDown(a: Action) { return this.held.has(a); }
  pressed(a: Action) { return this.down.has(a); }
  released(a: Action) { return this.up.has(a); }
  holdTime(a: Action) { return this.heldTime.get(a) ?? 0; }
  consume(a: Action) { this.down.delete(a); }

  update(dt: number) {
    for (const a of this.held) this.heldTime.set(a, (this.heldTime.get(a) ?? 0) + dt);
    let x = 0, y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    this.move.set(x, y);
    if (this.move.lengthSq() > 1) this.move.normalize();
    if (this.stickVec.lengthSq() > 0.01) this.move.copy(this.stickVec);
    if (this.uiBlocking) this.move.set(0, 0);
  }

  /** Touch: a fully pushed stick means sprint. */
  get stickSprint() { return this.touchMode && this.stickVec.length() > 0.92; }

  endFrame() {
    this.down.clear();
    this.up.clear();
    this.look.set(0, 0);
  }
}
