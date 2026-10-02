// Finisher cinematics: critical strikes, contract kill-cams and the boss-defeat moment.
// Each one is a short, authored beat: slow-motion curve, a hard cut to a close side angle
// (collision-checked so it never sits inside a wall), slash-line flashes, and for bosses an
// orbiting camera with a last line of dialogue. Control returns with a quick camera blend.
import * as THREE from 'three';
import type { Combatant } from './combat';
import type { ThirdPersonCamera } from '../camera/camera';
import type { HUD } from '../ui/hud';
import type { Collision } from '../world/collision';

export type FinisherKind = 'critical' | 'kill' | 'boss';

interface Active {
  kind: FinisherKind;
  t: number;
  dur: number;
  target: Combatant;
  attacker: Combatant;
  side: number;
  scale: number;
  orbit: number;
  lastLine?: { who: string; text: string };
  onEnd?: () => void;
  letterbox: boolean;
  lineShown: boolean;
}

const SPEC: Record<FinisherKind, { dur: number; slowTo: number; holdUntil: number; rampUntil: number; dist: number; height: number }> = {
  critical: { dur: 1.0, slowTo: 0.2, holdUntil: 0.35, rampUntil: 0.8, dist: 2.9, height: 1.05 },
  kill: { dur: 1.15, slowTo: 0.15, holdUntil: 0.45, rampUntil: 0.95, dist: 3.4, height: 1.1 },
  boss: { dur: 4.4, slowTo: 0.1, holdUntil: 1.5, rampUntil: 2.8, dist: 9.5, height: 3.2 },
};

export class Finisher {
  active: Active | null = null;
  timeScale = 1;

  constructor(private cam: ThirdPersonCamera, private hud: HUD, private col: Collision) {}

  get busy() { return !!this.active; }

  play(kind: FinisherKind, attacker: Combatant, target: Combatant, opts: { lastLine?: { who: string; text: string }; onEnd?: () => void } = {}) {
    // A critical that kills a contract target grows into that target's kill-cam.
    const cur = this.active;
    if (cur && cur.kind === 'critical' && kind === 'kill') {
      cur.kind = 'kill';
      cur.dur = cur.t + SPEC.kill.dur * 0.85;
      cur.lastLine = opts.lastLine;
      cur.onEnd = opts.onEnd;
      cur.letterbox = true;
      this.hud.letterbox(true);
      return;
    }
    // A boss beat always wins; otherwise don't stack beats.
    if (cur && (cur.kind === 'boss' || kind !== 'boss')) return;
    const scale = Math.max(1, target.height / 1.8);
    const a: Active = { kind, t: 0, dur: SPEC[kind].dur, target, attacker, side: 1, scale, orbit: 0, lastLine: opts.lastLine, onEnd: opts.onEnd, letterbox: kind !== 'critical', lineShown: false };
    a.side = this.pickSide(a);
    this.active = a;
    this.cam.cinRate = 9;
    this.cam.cinFollow = kind === 'boss' ? 3 : 6;
    const shot = this.shot(a);
    this.cam.cut(shot.pos, shot.look);
    this.cam.addShake(kind === 'boss' ? 0.5 : 0.25);
    if (a.letterbox) this.hud.letterbox(true);
    this.hud.slash(kind === 'critical' ? 'single' : 'cross', kind === 'boss');
  }

  /** Midpoint between attacker and target, raised to chest height. */
  private mid(a: Active) {
    const p = a.attacker.pos, t = a.target.pos;
    const m = new THREE.Vector3((p.x + t.x) / 2, Math.max(p.y, t.y), (p.z + t.z) / 2);
    m.y += SPEC[a.kind].height * (a.kind === 'boss' ? 1 : Math.min(a.scale, 1.4));
    return m;
  }

  private shotFor(a: Active, side: number, orbit: number) {
    const p = a.attacker.pos, t = a.target.pos;
    const ax = new THREE.Vector3(t.x - p.x, 0, t.z - p.z);
    if (ax.lengthSq() < 1e-4) ax.set(0, 0, 1);
    ax.normalize();
    const perp = new THREE.Vector3(-ax.z, 0, ax.x).multiplyScalar(side);
    // Boss: orbit slowly around the fallen target; others: side-on, slightly behind the attacker.
    const dir = perp.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), orbit).addScaledVector(ax, a.kind === 'boss' ? 0 : -0.35).normalize();
    const look = a.kind === 'boss' ? a.target.pos.clone().setY(a.target.pos.y + a.target.height * 0.45) : this.mid(a);
    const spec = SPEC[a.kind];
    const dist = spec.dist * (a.kind === 'boss' ? 1 : Math.min(a.scale, 1.6));
    const want = look.clone().addScaledVector(dir, dist);
    want.y = look.y + (a.kind === 'boss' ? 0.4 : -0.15);
    const free = this.col.raycast(look, want, 0.3);
    return { pos: look.clone().lerp(want, Math.max(0.25, free)), look, free };
  }

  private pickSide(a: Active) {
    const l = this.shotFor(a, 1, 0).free, r = this.shotFor(a, -1, 0).free;
    return l >= r ? 1 : -1;
  }

  private shot(a: Active) { return this.shotFor(a, a.side, a.orbit); }

  update(realDt: number) {
    const a = this.active;
    if (!a) { this.timeScale = 1; return; }
    a.t += realDt;
    const s = SPEC[a.kind];
    // Slow-motion curve: snap down, hold, ease back to full speed.
    if (a.t < s.holdUntil) this.timeScale = s.slowTo;
    else if (a.t < s.rampUntil) { const k = (a.t - s.holdUntil) / (s.rampUntil - s.holdUntil); this.timeScale = s.slowTo + (1 - s.slowTo) * k * k; }
    else this.timeScale = 1;

    if (a.kind === 'boss') a.orbit += realDt * 0.32;
    if (a.lastLine && !a.lineShown && a.t > (a.kind === 'boss' ? 0.9 : 0.2)) { a.lineShown = true; this.hud.subtitle(a.lastLine.who, a.lastLine.text); }
    const shot = this.shot(a);
    // Slow push-in over the beat
    shot.pos.lerp(shot.look, Math.min(0.2, a.t * 0.08));
    this.cam.cinematic = { pos: shot.pos, look: shot.look, blend: 1 };

    if (a.t >= a.dur) {
      this.active = null;
      this.timeScale = 1;
      this.cam.cinematic = null;
      this.cam.cinRate = a.kind === 'boss' ? 2.5 : 5;
      setTimeout(() => { this.cam.cinRate = 2.2; this.cam.cinFollow = 2.5; }, 1500);
      if (a.letterbox) this.hud.letterbox(false);
      if (a.lastLine) this.hud.subtitle(null);
      a.onEnd?.();
    }
  }
}
