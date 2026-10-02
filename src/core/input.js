// Keyboard / mouse / gamepad input mapped to abstract actions, with input buffering.
import { Time } from './time.js';

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
  Space: 'jump', ShiftLeft: 'dodge', ShiftRight: 'dodge', KeyQ: 'block', KeyE: 'special', KeyR: 'ultimate',
  Tab: 'lock', KeyF: 'interact', KeyC: 'status', KeyJ: 'quests', KeyK: 'classes', KeyM: 'map', KeyI: 'status',
  Escape: 'pause', Enter: 'confirm', KeyL: 'light', KeyO: 'heavy',
  Digit1: 'w1', Digit2: 'w2', Digit3: 'w3', Digit4: 'w4', Digit5: 'w5', Digit6: 'w6',
};

const ACTIONS = ['up', 'down', 'left', 'right', 'jump', 'dodge', 'block', 'special', 'ultimate', 'lock', 'interact', 'status', 'quests',
  'classes', 'map', 'pause', 'confirm', 'light', 'heavy', 'w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'wnext', 'wprev', 'any'];

class InputSys {
  constructor() {
    this.held = {}; this.pressedAt = {}; this.releasedAt = {}; this.frameDown = {}; this.frameUp = {};
    for (const a of ACTIONS) { this.held[a] = false; this.pressedAt[a] = -99; this.releasedAt[a] = -99; }
    this.mouseDX = 0; this.mouseDY = 0; this.locked = false; this.enabled = true;
    this.gpPrev = {}; this.moveX = 0; this.moveY = 0; this.lookX = 0; this.lookY = 0; this.usingPad = false;
    this.listeners = [];
  }
  attach(canvas) {
    this.canvas = canvas;
    addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      if (e.repeat) return;
      const a = KEYMAP[e.code];
      this._down('any');
      if (a) this._down(a);
      for (const l of this.listeners) l(e.code);
    });
    addEventListener('keyup', (e) => { const a = KEYMAP[e.code]; if (a) this._up(a); this._up('any'); });
    canvas.addEventListener('mousedown', (e) => {
      this._down('any');
      if (!this.locked && this.wantLock) { canvas.requestPointerLock?.(); }
      if (e.button === 0) this._down('light');
      if (e.button === 2) this._down('heavy');
      if (e.button === 1) { e.preventDefault(); this._down('lock'); }
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this._up('light');
      if (e.button === 2) this._up('heavy');
      if (e.button === 1) this._up('lock');
      this._up('any');
    });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => { if (this.locked) { this.mouseDX += e.movementX; this.mouseDY += e.movementY; } });
    addEventListener('wheel', (e) => { if (e.deltaY > 0) this._tap('wnext'); else this._tap('wprev'); }, { passive: true });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; });
    addEventListener('blur', () => { for (const a of ACTIONS) this.held[a] = false; });
  }
  onKey(fn) { this.listeners.push(fn); }
  requestLock() { this.wantLock = true; if (!this.locked) this.canvas?.requestPointerLock?.(); }
  releaseLock() { this.wantLock = false; if (document.pointerLockElement) document.exitPointerLock(); }
  _down(a) { if (!this.held[a]) { this.held[a] = true; this.pressedAt[a] = Time.real; this.frameDown[a] = true; } }
  _up(a) { if (this.held[a]) { this.held[a] = false; this.releasedAt[a] = Time.real; this.frameUp[a] = true; } }
  _tap(a) { this.pressedAt[a] = Time.real; this.frameDown[a] = true; }

  /** True on the frame the action went down. */
  pressed(a) { return this.enabled && !!this.frameDown[a]; }
  released(a) { return this.enabled && !!this.frameUp[a]; }
  isHeld(a) { return this.enabled && this.held[a]; }
  /** True if action was pressed within `window` real seconds (input buffer). Consumes it. */
  buffered(a, window = 0.25) {
    if (!this.enabled) return false;
    if (Time.real - this.pressedAt[a] <= window) { this.pressedAt[a] = -99; return true; }
    return false;
  }
  peekBuffered(a, window = 0.25) { return this.enabled && Time.real - this.pressedAt[a] <= window; }
  consume(a) { this.pressedAt[a] = -99; this.frameDown[a] = false; }
  heldFor(a) { return this.held[a] ? Time.real - this.pressedAt[a] : 0; }

  poll() {
    // gamepad
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && [...pads].find((p) => p && p.connected);
    let px = 0, py = 0;
    this.lookX = 0; this.lookY = 0;
    if (gp) {
      const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
      px = dz(gp.axes[0] || 0); py = dz(gp.axes[1] || 0);
      this.lookX = dz(gp.axes[2] || 0); this.lookY = dz(gp.axes[3] || 0);
      const map = { 0: 'jump', 1: 'dodge', 2: 'light', 3: 'heavy', 4: 'block', 5: 'special', 6: 'lock', 7: 'ultimate', 9: 'pause', 8: 'status', 10: 'interact', 11: 'lock', 12: 'wprev', 13: 'wnext', 14: 'wprev', 15: 'wnext' };
      for (const k in map) {
        const v = !!gp.buttons[k]?.pressed; const a = map[k];
        if (v && !this.gpPrev[k]) { this._down(a); this._down('any'); this.usingPad = true; if (a === 'jump') this._down('confirm'); }
        if (!v && this.gpPrev[k]) { this._up(a); this._up('any'); if (a === 'jump') this._up('confirm'); }
        this.gpPrev[k] = v;
      }
      // Y button (3) doubles as interact for finishers when pressed with LB? keep simple: R3 interact.
      if (px || py || this.lookX || this.lookY) this.usingPad = true;
    }
    let kx = (this.held.right ? 1 : 0) - (this.held.left ? 1 : 0);
    let ky = (this.held.up ? 1 : 0) - (this.held.down ? 1 : 0);
    if (kx || ky) { this.usingPad = false; const l = Math.hypot(kx, ky); kx /= l; ky /= l; }
    this.moveX = this.enabled ? (kx || px) : 0;
    this.moveY = this.enabled ? (ky || -py) : 0;
  }
  endFrame() { this.frameDown = {}; this.frameUp = {}; this.mouseDX = 0; this.mouseDY = 0; }
}

export const Input = new InputSys();
