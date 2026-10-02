// Minimal HUD: vitals, compass + objective, nameplates, lock reticle, boss bar, interact prompt,
// subtitles/letterbox, touch controls, and a generic modal panel host.
import * as THREE from 'three';
import type { Input, Action } from '../core/input';

export interface PlateInfo { id: number; name: string; pos: THREE.Vector3; h: number; hp: number; max: number; kind: 'red' | 'gold' | 'blue' | 'neutral'; tag?: string; bleed?: number; show: boolean }
export interface CompassMark { yawWorld: number; kind: 'obj' | 'camp' | 'track' }

const el = (tag: string, cls = '', html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (html) e.innerHTML = html; return e; };

export class HUD {
  root: HTMLElement;
  private hpI: HTMLElement; private hpB: HTMLElement; private stI: HTMLElement; private huI: HTMLElement;
  private vlabel: HTMLElement;
  private compass: HTMLElement;
  private objective: HTMLElement;
  private toastEl: HTMLElement;
  private toastT = 0;
  private promptEl: HTMLElement;
  private promptCircle: SVGCircleElement;
  private plates = new Map<number, HTMLElement>();
  private reticle: HTMLElement;
  private bossEl: HTMLElement;
  private letter: HTMLElement;
  private subEl: HTMLElement;
  private fadeEl: HTMLElement;
  panelHost: HTMLElement;
  private fpsEl: HTMLElement;
  private vig: HTMLElement;
  panelOpen = false;
  onPanelClose: (() => void) | null = null;
  menuHandlers: Partial<Record<'inv' | 'map' | 'ledger' | 'help', () => void>> = {};
  private stick: HTMLDivElement;

  constructor(private input: Input) {
    this.root = document.getElementById('ui')!;
    const v = el('div', 'vitals');
    this.vlabel = el('div', 'vlabel', 'Unsigned drifter');
    const hp = el('div', 'bar hp'); this.hpB = el('b'); this.hpI = el('i'); hp.append(this.hpB, this.hpI);
    const st = el('div', 'bar st'); this.stI = el('i'); st.append(this.stI);
    const hu = el('div', 'bar hu'); this.huI = el('i'); hu.append(this.huI);
    v.append(this.vlabel, hp, st, hu);
    this.compass = el('div', 'compass');
    this.objective = el('div', 'objective');
    this.toastEl = el('div', 'toast');
    this.promptEl = el('div', 'prompt hidden', `<div class="key"><span>E</span><svg viewBox="0 0 38 38"><circle cx="19" cy="19" r="17" stroke-dasharray="106.8" stroke-dashoffset="106.8"/></svg></div><div class="txt"></div>`);
    this.promptCircle = this.promptEl.querySelector('circle')!;
    this.reticle = el('div', 'reticle hidden');
    this.bossEl = el('div', 'boss hidden', `<div class="nm"></div><div class="bar"><b></b><i></i></div><div class="ph"></div>`);
    this.vig = el('div', 'dmgvig');
    this.letter = el('div', 'letterbox');
    this.subEl = el('div', 'subtitle');
    this.panelHost = el('div', '');
    this.fadeEl = el('div', 'fade');
    this.fpsEl = el('div', 'fps');
    const menu = el('div', 'menu-btns');
    for (const [k, label] of [['inv', 'Pack'], ['map', 'Map'], ['ledger', 'Ledger'], ['help', '?']] as const) {
      const b = el('button', '', label) as HTMLButtonElement;
      b.addEventListener('click', (e) => { e.stopPropagation(); this.menuHandlers[k]?.(); });
      b.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); this.menuHandlers[k]?.(); });
      menu.append(b);
    }
    // Touch controls
    this.stick = el('div', 'stick touch-only idle') as HTMLDivElement;
    const knob = el('div', 'knob') as HTMLDivElement;
    this.stick.append(knob);
    input.stickEl = this.stick; input.stickKnob = knob;
    const tb = el('div', 'tbtns touch-only');
    const buttons: [string, string, Action][] = [['atk', 'Strike', 'light'], ['hvy', 'Heavy', 'heavy'], ['dge', 'Roll', 'dodge'], ['spc', 'Art', 'special'], ['jmp', 'Jump', 'jump'], ['lck', 'Lock', 'lock'], ['itr', 'Use', 'interact'], ['crh', 'Crouch', 'crouch']];
    for (const [cls, label, a] of buttons) {
      const b = el('div', 'tb ' + cls, label);
      input.bindButton(b, a);
      tb.append(b);
    }
    this.root.append(this.vig, v, this.compass, this.objective, this.toastEl, this.promptEl, this.reticle, this.bossEl, this.stick, tb, menu, this.letter, this.subEl, this.panelHost, this.fadeEl, this.fpsEl);
    const ticks = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    ticks.forEach((t) => { const s = el('div', 'tick', t); s.dataset.tick = t; this.compass.append(s); });
  }

  setClassLabel(s: string) { this.vlabel.innerHTML = s; }

  vitals(hp: number, max: number, st: number, stMax: number, hunger: number) {
    this.hpI.style.width = (100 * hp / max).toFixed(1) + '%';
    this.hpB.style.width = (100 * hp / max).toFixed(1) + '%';
    this.stI.style.width = (100 * Math.max(0, st) / stMax).toFixed(1) + '%';
    this.huI.style.width = hunger.toFixed(0) + '%';
  }

  hurt() { this.vig.classList.add('on'); setTimeout(() => this.vig.classList.remove('on'), 260); }

  /** camYaw: heading the camera faces (world radians, 0 = +Z). North is −Z. */
  updateCompass(camYawFacing: number, marks: CompassMark[]) {
    const W = this.compass.clientWidth || 300;
    const fov = Math.PI * 0.9;
    const place = (worldYaw: number) => {
      let d = worldYaw - camYawFacing;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      return { x: W / 2 - (d / fov) * W, vis: Math.abs(d) < fov / 2 };
    };
    // N (−Z) = yaw PI, E (+X) = PI/2, S = 0, W = −PI/2
    const dirs: Record<string, number> = { N: Math.PI, NE: Math.PI * 0.75, E: Math.PI / 2, SE: Math.PI / 4, S: 0, SW: -Math.PI / 4, W: -Math.PI / 2, NW: -Math.PI * 0.75 };
    this.compass.querySelectorAll<HTMLElement>('.tick').forEach((t) => {
      const p = place(dirs[t.dataset.tick!]);
      t.style.left = p.x + 'px';
      t.style.display = p.vis ? '' : 'none';
    });
    this.compass.querySelectorAll('.mk').forEach((m) => m.remove());
    for (const m of marks) {
      const p = place(m.yawWorld);
      const e = el('div', 'mk ' + (m.kind === 'obj' ? '' : m.kind));
      e.style.left = Math.max(4, Math.min(W - 4, p.x)) + 'px';
      if (!p.vis) e.style.opacity = '0.45';
      this.compass.append(e);
    }
  }

  setObjective(text: string, dist?: number) {
    this.objective.innerHTML = text ? `${text}${dist !== undefined ? `<span class="dist">${Math.round(dist)}m</span>` : ''}` : '';
  }

  toast(text: string, kind: '' | 'big' | 'party' = '', time = 2.6) {
    this.toastEl.className = 'toast on ' + kind;
    this.toastEl.innerHTML = text;
    this.toastT = time;
  }

  prompt(text: string | null, progress = 0, key = 'E') {
    if (!text) { this.promptEl.classList.add('hidden'); return; }
    this.promptEl.classList.remove('hidden');
    (this.promptEl.querySelector('.txt') as HTMLElement).textContent = text;
    (this.promptEl.querySelector('.key span') as HTMLElement).textContent = this.input.touchMode ? 'Use' : key;
    this.promptCircle.style.strokeDashoffset = String(106.8 * (1 - progress));
  }

  plates_(cam: THREE.Camera, list: PlateInfo[], w: number, h: number) {
    const seen = new Set<number>();
    const v = new THREE.Vector3();
    for (const p of list) {
      if (!p.show) continue;
      v.set(p.pos.x, p.pos.y + p.h + 0.25, p.pos.z).project(cam);
      if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) continue;
      seen.add(p.id);
      let e = this.plates.get(p.id);
      if (!e) {
        e = el('div', 'plate', `<div class="tag"></div><div class="nm"></div><div class="hp"><i></i></div><div class="bl"><i></i></div>`);
        this.root.insertBefore(e, this.toastEl);
        this.plates.set(p.id, e);
      }
      e.className = 'plate ' + (p.kind === 'red' ? '' : p.kind);
      (e.querySelector('.nm') as HTMLElement).textContent = p.name;
      (e.querySelector('.tag') as HTMLElement).textContent = p.tag ?? '';
      (e.querySelector('.hp > i') as HTMLElement).style.width = (100 * p.hp / p.max).toFixed(0) + '%';
      (e.querySelector('.hp') as HTMLElement).style.display = p.kind === 'neutral' ? 'none' : '';
      (e.querySelector('.bl > i') as HTMLElement).style.width = Math.min(100, p.bleed ?? 0).toFixed(0) + '%';
      e.style.left = ((v.x * 0.5 + 0.5) * w).toFixed(0) + 'px';
      e.style.top = ((-v.y * 0.5 + 0.5) * h).toFixed(0) + 'px';
    }
    for (const [id, e] of this.plates) if (!seen.has(id)) { e.remove(); this.plates.delete(id); }
  }

  reticle_(cam: THREE.Camera, pos: THREE.Vector3 | null, gold: boolean, w: number, h: number) {
    if (!pos) { this.reticle.classList.add('hidden'); return; }
    const v = pos.clone().project(cam);
    this.reticle.classList.toggle('hidden', v.z > 1);
    this.reticle.classList.toggle('gold', gold);
    this.reticle.style.left = ((v.x * 0.5 + 0.5) * w) + 'px';
    this.reticle.style.top = ((-v.y * 0.5 + 0.5) * h) + 'px';
  }

  boss(name: string | null, hp = 0, max = 1, phase = '') {
    if (!name) { this.bossEl.classList.add('hidden'); return; }
    this.bossEl.classList.remove('hidden');
    (this.bossEl.querySelector('.nm') as HTMLElement).textContent = name;
    const pct = (100 * hp / max).toFixed(1) + '%';
    (this.bossEl.querySelector('i') as HTMLElement).style.width = pct;
    (this.bossEl.querySelector('b') as HTMLElement).style.width = pct;
    (this.bossEl.querySelector('.ph') as HTMLElement).textContent = phase;
  }

  letterbox(on: boolean) { this.letter.classList.toggle('on', on); }

  /** Finisher overlay: one diagonal slash or a crossing pair, plus a short white impact flash. */
  slash(kind: 'single' | 'cross', big = false) {
    const fx = el('div', 'slashfx', '<div class="flash"></div>');
    const angles = kind === 'single' ? [-18 - Math.random() * 10] : [-24, 22];
    angles.forEach((deg, i) => {
      const line = el('i', big ? 'big' : '');
      const rot = `rotate(${deg}deg)`;
      line.style.transform = rot;
      line.style.setProperty('--rot', rot);
      line.style.animationDelay = `${i * 0.12}s, ${0.5 + i * 0.12}s`;
      fx.append(line);
    });
    this.root.insertBefore(fx, this.letter);
    setTimeout(() => fx.remove(), 1400);
  }
  subtitle(who: string | null, text = '') {
    if (!who && !text) { this.subEl.classList.remove('on'); return; }
    this.subEl.innerHTML = (who ? `<span class="who">${who}</span>` : '') + text;
    this.subEl.classList.add('on');
  }
  fade(on: boolean) { this.fadeEl.classList.toggle('on', on); }
  fps(t: string) { this.fpsEl.textContent = t; }

  openPanel(html: string, mount?: (root: HTMLElement) => void, onClose?: () => void, closable = true) {
    this.closePanel(true);
    const p = el('div', 'panel', (closable ? '<button class="close">×</button>' : '') + html);
    this.panelHost.append(p);
    this.panelOpen = true;
    this.input.uiBlocking = true;
    if (document.pointerLockElement) document.exitPointerLock();
    this.onPanelClose = onClose ?? null;
    p.querySelector('.close')?.addEventListener('click', () => this.closePanel());
    mount?.(p);
    return p;
  }
  closePanel(silent = false) {
    if (!this.panelOpen) return;
    this.panelHost.innerHTML = '';
    this.panelOpen = false;
    this.input.uiBlocking = false;
    const cb = this.onPanelClose;
    this.onPanelClose = null;
    if (!silent) cb?.();
  }

  showTitle(onGo: () => void) {
    const t = el('div', 'title', `<div><h1>ASHVEIL<span>CRIMSON MARCH</span></h1><p>The dunes coughed up the war. The guild sells what they find.</p><div class="go">${this.input.touchMode || ('ontouchstart' in window) ? 'TAP TO BEGIN' : 'CLICK TO BEGIN'}</div><div class="load">Headphones recommended — there is no music, only wind.</div></div>`);
    const go = (e: Event) => { e.preventDefault(); t.remove(); onGo(); };
    t.addEventListener('click', go);
    t.addEventListener('touchend', go);
    this.root.append(t);
  }

  death(on: boolean) {
    let d = this.root.querySelector('.death');
    if (on && !d) { d = el('div', 'death', '<h1>FALLEN</h1>'); this.root.append(d); }
    if (!on && d) d.remove();
  }

  tick(dt: number) {
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toastEl.classList.remove('on'); }
  }
}
