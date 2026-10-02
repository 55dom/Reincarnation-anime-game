// Touch controls for phones & tablets: floating joystick (left), swipe-to-look (right),
// on-screen action buttons. Feeds the same abstract actions as keyboard / gamepad.
import { Input } from '../core/input.js';

export const isTouchDevice = () => new URLSearchParams(location.search).has('touch') ||
  (matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0);

const BUTTONS = [
  // [action, label, css class]
  ['light', 'ATK', 'b-atk'], ['heavy', 'HVY', 'b-hvy'], ['dodge', 'DASH', 'b-dodge'], ['jump', 'JUMP', 'b-jump'],
  ['special', 'SKILL', 'b-skill'], ['ultimate', 'ULT', 'b-ult'], ['block', 'GUARD', 'b-block'],
  ['interact', 'F', 'b-int'], ['lock', '◎', 'b-lock'], ['confirm', '✚', 'b-pot'], ['wnext', '⇄', 'b-wpn'],
];

export class TouchControls {
  constructor(G) {
    this.G = G;
    Input.touch = true;
    const root = this.root = document.createElement('div'); root.id = 'touch'; document.body.appendChild(root);
    this.look = document.createElement('div'); this.look.id = 'touchLook'; root.appendChild(this.look);
    this.stick = document.createElement('div'); this.stick.id = 'stick'; this.stick.innerHTML = '<div class="knob"></div>'; root.appendChild(this.stick);
    this.knob = this.stick.firstChild;
    const pad = document.createElement('div'); pad.id = 'touchBtns'; root.appendChild(pad);
    this.btn = {};
    for (const [act, label, cls] of BUTTONS) {
      const b = document.createElement('div'); b.className = 'tbtn ' + cls; b.textContent = label; b.dataset.act = act; pad.appendChild(b); this.btn[act] = b;
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); b.setPointerCapture?.(e.pointerId); b.classList.add('on'); Input._down(act); Input._down('any'); if (navigator.vibrate && (act === 'light' || act === 'heavy')) navigator.vibrate(8); });
      const up = (e) => { e.preventDefault(); b.classList.remove('on'); Input._up(act); Input._up('any'); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    }
    const menu = document.createElement('div'); menu.className = 'tbtn b-menu'; menu.textContent = '☰'; root.appendChild(menu);
    if (canFullscreen()) {
      const fs = document.createElement('div'); fs.className = 'tbtn b-fs'; fs.textContent = '⛶'; root.appendChild(fs);
      fs.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); });
      fs.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); toggleFullscreen(); });
    }
    menu.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (G.ui.menuOpen) G.ui.closeMenu(); else if (!G.cutscene && !G.ui.dialogueOpen) G.ui.openMenu('system'); });
    // joystick + camera drag on the background layer (multi-touch via pointer ids)
    this.stickId = null; this.lookId = null; this.lookLast = null;
    this.look.addEventListener('pointerdown', (e) => {
      e.preventDefault(); this.look.setPointerCapture?.(e.pointerId);
      if (e.clientX < innerWidth * 0.42 && this.stickId === null) {
        this.stickId = e.pointerId; this.origin = { x: e.clientX, y: e.clientY };
        this.stick.style.left = e.clientX + 'px'; this.stick.style.top = e.clientY + 'px'; this.stick.classList.add('on'); this.moveKnob(0, 0);
      } else if (this.lookId === null) { this.lookId = e.pointerId; this.lookLast = { x: e.clientX, y: e.clientY }; }
    });
    this.look.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stickId) {
        let dx = e.clientX - this.origin.x, dy = e.clientY - this.origin.y; const R = 55; const l = Math.hypot(dx, dy);
        if (l > R) { dx *= R / l; dy *= R / l; }
        this.moveKnob(dx, dy);
        Input.touchMove = { x: dx / R, y: -dy / R };
      } else if (e.pointerId === this.lookId) {
        Input.mouseDX += (e.clientX - this.lookLast.x) * 1.7; Input.mouseDY += (e.clientY - this.lookLast.y) * 1.4;
        this.lookLast = { x: e.clientX, y: e.clientY };
      }
    });
    const end = (e) => {
      if (e.pointerId === this.stickId) { this.stickId = null; Input.touchMove = null; this.stick.classList.remove('on'); }
      if (e.pointerId === this.lookId) this.lookId = null;
    };
    this.look.addEventListener('pointerup', end); this.look.addEventListener('pointercancel', end);
    // tap the dialogue box to advance
    document.getElementById('dialogue').addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') || G.ui.dlg?.choices) return;
      Input._down('confirm'); setTimeout(() => Input._up('confirm'), 60);
    });
    this.rotate = document.createElement('div'); this.rotate.id = 'rotateHint'; this.rotate.innerHTML = '<div>⟳</div>Rotate your phone to landscape'; document.body.appendChild(this.rotate);
    this.show(false);
  }
  moveKnob(x, y) { this.knob.style.transform = `translate(${x}px, ${y}px)`; }
  show(v) { this.root.classList.toggle('hidden', !v); }
  update() {
    const G = this.G;
    const playing = G.state === 'play' && !G.cutscene && !G.ui.menuOpen && !G.ui.dialogueOpen && G.player.alive;
    this.show(playing);
    this.rotate.classList.toggle('on', innerHeight > innerWidth);
    if (!playing) { this.stickId = null; this.lookId = null; Input.touchMove = null; this.stick.classList.remove('on'); }
    // context highlights
    const P = G.player;
    this.btn.interact.classList.toggle('ready', !!G.nearInteract || !!P.finisherCandidate());
    this.btn.interact.textContent = P.finisherCandidate() ? 'FIN' : 'F';
    this.btn.ultimate.classList.toggle('ready', P.limit >= 100 && P.hasSkill('ultimate'));
    this.btn.ultimate.classList.toggle('locked', !P.hasSkill('ultimate'));
    this.btn.special.classList.toggle('locked', !P.hasSkill('skill'));
    this.btn.lock.classList.toggle('ready', !!P.lock);
  }
}

const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement;
export const canFullscreen = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);

/** Keep the page told whether it is fullscreen / embedded so the layout can keep buttons out of
 *  the strip a host app overlays at the top of an embedded page. */
export function watchFullscreen() {
  let embedded = false;
  try { embedded = window.self !== window.top; } catch (e) { embedded = true; }
  document.body.classList.toggle('embedded', embedded);
  const sync = () => document.body.classList.toggle('fs', !!fsElement());
  document.addEventListener('fullscreenchange', sync); document.addEventListener('webkitfullscreenchange', sync);
  sync();
}

export async function goFullscreenLandscape() {
  const el = document.documentElement;
  try {
    if (!fsElement()) {
      if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    }
  } catch (e) { /* not allowed here */ }
  try { await screen.orientation?.lock?.('landscape'); } catch (e) { /* not supported (iOS) */ }
  return !!fsElement();
}

export function toggleFullscreen() {
  if (!fsElement()) return goFullscreenLandscape();
  try { (document.exitFullscreen || document.webkitExitFullscreen)?.call(document); } catch (e) { /* ignore */ }
}
