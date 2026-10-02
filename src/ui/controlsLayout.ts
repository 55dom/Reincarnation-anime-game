// Custom layout for the on-screen (touch) controls only: drag each button / the stick, resize,
// change opacity and stick mode. Positions are stored as % of the viewport so they survive
// rotation and different phones. Vitals, compass and menus are not part of the layout.
import type { Input } from '../core/input';
import type { Settings, ControlPos } from '../core/settings';

// Default centres, in px from the bottom-right corner (buttons) — matches the original cluster.
const DEFAULTS: Record<string, { r: number; b: number }> = {
  atk: { r: 59, b: 63 }, hvy: { r: 134, b: 52 }, dge: { r: 56, b: 138 }, spc: { r: 121, b: 117 },
  jmp: { r: 193, b: 51 }, lck: { r: 57, b: 201 }, itr: { r: 191, b: 119 }, crh: { r: 202, b: 178 },
};
const LABELS: Record<string, string> = { atk: 'Strike', hvy: 'Heavy', dge: 'Roll', spc: 'Art', jmp: 'Jump', lck: 'Lock', itr: 'Use', crh: 'Crouch', stick: 'Stick' };

export class ControlsLayout {
  items = new Map<string, HTMLElement>();
  private toolbar: HTMLElement | null = null;
  private selected: string | null = null;
  editing = false;
  onSave: () => void = () => {};

  constructor(private input: Input, private s: Settings) {}

  register(key: string, el: HTMLElement) {
    this.items.set(key, el);
    el.dataset.ctl = key;
    el.addEventListener('pointerdown', (e) => this.dragStart(e, key));
  }

  private defaultPos(key: string): ControlPos {
    const W = window.innerWidth, H = window.innerHeight;
    if (key === 'stick') return { x: 18, y: 72, s: 1 };
    const d = DEFAULTS[key];
    return { x: ((W - d.r) / W) * 100, y: ((H - d.b) / H) * 100, s: 1 };
  }

  pos(key: string): ControlPos { return this.s.layout[key] ?? this.defaultPos(key); }

  /** Stick centre in px when the stick is fixed (null when floating). */
  stickCenter(): { x: number; y: number } | null {
    if (this.s.stickMode !== 'fixed') return null;
    const p = this.pos('stick');
    return { x: (p.x / 100) * window.innerWidth, y: (p.y / 100) * window.innerHeight };
  }

  apply() {
    document.body.style.setProperty('--ctl-opacity', String(this.s.controlsOpacity));
    for (const [key, el] of this.items) {
      const p = this.pos(key);
      const sc = p.s * this.s.controlsScale;
      if (key === 'stick') {
        el.classList.toggle('fixed', this.s.stickMode === 'fixed');
        if (this.s.stickMode !== 'fixed' && !this.editing) { el.style.transform = `scale(${sc})`; continue; }
        el.style.left = p.x + '%';
        el.style.top = p.y + '%';
        el.style.transform = `scale(${sc})`;
        continue;
      }
      el.style.left = p.x + '%';
      el.style.top = p.y + '%';
      el.style.transform = `translate(-50%, -50%) scale(${sc})`;
    }
  }

  // ---------------- Editor ----------------
  enter() {
    this.editing = true;
    this.input.editing = true;
    document.body.classList.add('editing');
    const tb = document.createElement('div');
    tb.className = 'layout-toolbar';
    tb.innerHTML = `
      <div class="lt-title">Controls layout <span class="lt-sel">Drag a control to move it · tap to select</span></div>
      <div class="lt-row">
        <button data-a="smaller">Size −</button><button data-a="bigger">Size +</button>
        <label>Opacity <input type="range" min="0.2" max="1" step="0.05" value="${this.s.controlsOpacity}" data-a="opacity"></label>
        <button data-a="stick">Stick: ${this.s.stickMode}</button>
        <button data-a="reset">Reset</button><button data-a="done" class="primary">Done</button>
      </div>`;
    document.getElementById('ui')!.append(tb);
    this.toolbar = tb;
    const sel = () => tb.querySelector('.lt-sel')!;
    tb.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).dataset.a;
      if (!a) return;
      if (a === 'done') { this.exit(); return; }
      if (a === 'reset') { this.s.layout = {}; this.s.controlsScale = 1; this.s.stickMode = 'floating'; this.apply(); (tb.querySelector('[data-a=stick]') as HTMLElement).textContent = 'Stick: floating'; return; }
      if (a === 'stick') {
        this.s.stickMode = this.s.stickMode === 'fixed' ? 'floating' : 'fixed';
        (e.target as HTMLElement).textContent = `Stick: ${this.s.stickMode}`;
        this.apply();
        return;
      }
      if ((a === 'smaller' || a === 'bigger') && this.selected) {
        const p = { ...this.pos(this.selected) };
        p.s = Math.max(0.6, Math.min(1.8, p.s + (a === 'bigger' ? 0.1 : -0.1)));
        this.s.layout[this.selected] = p;
        this.apply();
        sel().textContent = `${LABELS[this.selected]} · size ${p.s.toFixed(1)}×`;
      } else if (a === 'smaller' || a === 'bigger') sel().textContent = 'Select a control first';
    });
    tb.querySelector('[data-a=opacity]')!.addEventListener('input', (e) => { this.s.controlsOpacity = +(e.target as HTMLInputElement).value; this.apply(); });
    this.apply();
  }

  exit() {
    this.editing = false;
    this.input.editing = false;
    document.body.classList.remove('editing');
    this.toolbar?.remove();
    this.toolbar = null;
    for (const el of this.items.values()) el.classList.remove('sel');
    this.selected = null;
    this.apply();
    this.onSave();
  }

  private dragStart(e: PointerEvent, key: string) {
    if (!this.editing) return;
    e.preventDefault();
    e.stopPropagation();
    this.selected = key;
    for (const [k, el] of this.items) el.classList.toggle('sel', k === key);
    const label = this.toolbar?.querySelector('.lt-sel');
    if (label) label.textContent = `${LABELS[key]} · size ${this.pos(key).s.toFixed(1)}×`;
    const el = this.items.get(key)!;
    try { el.setPointerCapture(e.pointerId); } catch { /* synthetic or already-released pointer */ }
    const start = { x: e.clientX, y: e.clientY };
    const p0 = { ...this.pos(key) };
    const move = (ev: PointerEvent) => {
      const W = window.innerWidth, H = window.innerHeight;
      const x = Math.max(3, Math.min(97, p0.x + ((ev.clientX - start.x) / W) * 100));
      const y = Math.max(8, Math.min(96, p0.y + ((ev.clientY - start.y) / H) * 100));
      this.s.layout[key] = { x, y, s: p0.s };
      if (key === 'stick' && this.s.stickMode !== 'fixed') {
        this.s.stickMode = 'fixed';
        const b = this.toolbar?.querySelector('[data-a=stick]');
        if (b) b.textContent = 'Stick: fixed';
      }
      this.apply();
    };
    const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }
}
