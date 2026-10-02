// Base NPC: rig + shared animator + steering + committed, telegraphed attacks.
// Windup = orange glow + ground telegraph fill, Active = red flash, Recovery = cool grey (punish window).
import * as THREE from 'three';
import type { Rig } from '../player/rig';
import { ProcAnimator, type PoseKey } from '../player/animator';
import { newId, type Combatant, type CombatWorld, type Faction, type HitInfo, type HitResult } from '../combat/combat';
import type { FX, Telegraph } from '../combat/fx';
import type { Collision } from '../world/collision';
import { total, type Move, POSE_STAGGER, POSE_DEAD_BIPED, POSE_DEAD_QUAD } from '../combat/moves';
import { angleDelta, damp, dampAngle } from '../core/util';

export interface AICtx {
  dt: number;
  time: number;
  player: Combatant & { vel: THREE.Vector3 };
  combat: CombatWorld;
  fx: FX;
  col: Collision;
  actors: Actor[];
  onCamShake: (a: number) => void;
}

export interface AttackSpec { move: Move; tele?: { shape: 'circle' | 'cone' | 'rect'; size: number; arc?: number; width?: number; offset?: number; atTarget?: boolean }; onActive?: (a: Actor, ctx: AICtx) => void }

export abstract class Actor implements Combatant {
  id = newId();
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  hp: number; maxHp: number;
  poise: number; maxPoise: number;
  alive = true;
  marked = 0; bleed = 0; snared = 0; staggered = 0;
  lockable = true;
  contractTarget = false;
  anim: ProcAnimator;
  attack: { spec: AttackSpec; t: number; hitSet: Set<number>; tele?: Telegraph; fired: boolean } | null = null;
  cooldown = 0;
  stateT = 0;
  deadT = 0;
  harvest = { skinned: false, butchered: false, harvestable: false };
  speedMul = 1;
  protected lastYaw = 0;
  hyper = false;
  flashCol = new THREE.Color();
  private flashBase: THREE.Color[] = [];
  hitFlash = 0;
  aggro = false;
  home = new THREE.Vector3();
  removed = false;

  constructor(public name: string, public faction: Faction, public rig: Rig, hp: number, poise: number, public radius: number, public height: number) {
    this.hp = this.maxHp = hp;
    this.poise = this.maxPoise = poise;
    this.anim = new ProcAnimator(rig);
    this.flashBase = rig.flashMats.map((m) => m.emissive.clone());
  }

  spawn(scene: THREE.Scene, x: number, y: number, z: number, yaw = 0) {
    this.pos.set(x, y, z);
    this.home.copy(this.pos);
    this.yaw = this.lastYaw = yaw;
    scene.add(this.rig.root);
    this.syncRig();
  }

  isInvulnerable() { return !this.alive; }
  hasHyperArmor() { return this.hyper || !!(this.attack && this.attack.spec.move.hyperArmor && this.attack.t < this.attack.spec.move.windup + this.attack.spec.move.active); }

  onHit(h: HitInfo, res: HitResult) {
    this.hitFlash = 1;
    this.aggro = true;
    if (res.killed) { this.die(); return; }
    this.anim.hit();
    if (res.staggered) {
      this.cancelAttack();
      this.staggered = 1.1;
      this.anim.play(this.rig.kind === 'biped' ? POSE_STAGGER : staggerQuad, 0.7);
      this.vel.addScaledVector(h.dir, 3);
    }
  }

  die() {
    this.alive = false;
    this.cancelAttack();
    this.anim.stopAction();
    this.anim.setOverlay(this.rig.kind === 'biped' ? POSE_DEAD_BIPED : POSE_DEAD_QUAD, 1);
    this.lockable = false;
    this.deadT = 0;
  }

  cancelAttack() {
    if (this.attack?.tele) this.attack.tele.done = true;
    this.attack = null;
  }

  distTo(c: { pos: THREE.Vector3 }) { return Math.hypot(c.pos.x - this.pos.x, c.pos.z - this.pos.z); }
  yawTo(c: { pos: THREE.Vector3 }) { return Math.atan2(c.pos.x - this.pos.x, c.pos.z - this.pos.z); }

  /** Begin a committed attack: telegraph + windup pose. */
  startAttack(spec: AttackSpec, ctx: AICtx, target?: Combatant) {
    this.attack = { spec, t: 0, hitSet: new Set(), fired: false };
    this.anim.play(spec.move.keys, total(spec.move));
    const m = spec.move;
    if (spec.tele) {
      const tl = spec.tele;
      if (tl.atTarget && target) {
        this.attack.tele = ctx.fx.telegraph(tl.shape, target.pos.x, target.pos.z, this.yaw, tl.size, m.windup, m.active, { arc: tl.arc, width: tl.width, y: target.pos.y });
      } else {
        const self = this;
        this.attack.tele = ctx.fx.telegraph(tl.shape, this.pos.x, this.pos.z, this.yaw, tl.size, m.windup, m.active, {
          arc: tl.arc, width: tl.width, y: this.pos.y,
          follow: () => (self.attack && self.attack.t < m.windup ? { x: self.pos.x + Math.sin(self.yaw) * (tl.offset ?? 0), z: self.pos.z + Math.cos(self.yaw) * (tl.offset ?? 0), yaw: self.yaw } : null),
        });
      }
    }
  }

  /** Advance the current attack. Returns true while attacking. */
  protected tickAttack(ctx: AICtx, target: Combatant | null, trackRate = 4): boolean {
    const a = this.attack;
    if (!a) return false;
    const m = a.spec.move;
    a.t += ctx.dt;
    if (a.t < m.windup * 0.85 && target) this.yaw = dampAngle(this.yaw, this.yawTo(target), trackRate, ctx.dt);
    const inLunge = a.t > m.windup * 0.8 && a.t < m.windup + m.active;
    let lunge = inLunge ? m.lunge : 0;
    if (target && inLunge && this.distTo(target) < this.radius + target.radius + 0.3) lunge = 0;
    this.vel.x = damp(this.vel.x, Math.sin(this.yaw) * lunge, 12, ctx.dt);
    this.vel.z = damp(this.vel.z, Math.cos(this.yaw) * lunge, 12, ctx.dt);
    if (a.t >= m.windup && a.t <= m.windup + m.active) {
      if (a.spec.onActive && !a.fired) { a.fired = true; a.spec.onActive(this, ctx); }
      else if (!a.spec.onActive) ctx.combat.sweep(this, m, a.hitSet);
    }
    if (a.t >= total(m)) { this.attack = null; return false; }
    return true;
  }

  /** Telegraph glow on body materials, keyed to attack phase. */
  protected updateGlow(dt: number) {
    this.hitFlash = Math.max(0, this.hitFlash - dt * 6);
    let r = 0, g = 0, b = 0;
    const a = this.attack;
    if (a) {
      const m = a.spec.move;
      if (a.t < m.windup) {
        const k = a.t / m.windup;
        const pulse = 0.5 + 0.5 * Math.sin(a.t * (10 + k * 20));
        r = 0.3 * k * (0.6 + 0.4 * pulse); g = 0.12 * k * (0.6 + 0.4 * pulse);
      } else if (a.t < m.windup + m.active) { r = 0.5; g = 0.04; }
      else { r = 0.006; g = 0.014; b = 0.03; } // recovery: faint cool punish-window tint
    }
    if (this.hitFlash > 0) { r += this.hitFlash * 0.22; g += this.hitFlash * 0.2; b += this.hitFlash * 0.17; }
    this.rig.flashMats.forEach((m, i) => {
      const base = this.flashBase[i];
      m.emissive.setRGB(base.r + r, base.g + g, base.b + b);
    });
  }

  protected steer(dir: THREE.Vector3, speed: number, dt: number, face = true, lam = 6) {
    const s = speed * this.speedMul * (this.snared > 0 ? 0 : 1);
    this.vel.x = damp(this.vel.x, dir.x * s, lam, dt);
    this.vel.z = damp(this.vel.z, dir.z * s, lam, dt);
    if (face && dir.lengthSq() > 0.01) this.yaw = dampAngle(this.yaw, Math.atan2(dir.x, dir.z), 6, dt);
  }

  protected integrate(ctx: AICtx) {
    const dt = ctx.dt;
    if (!this.alive || this.staggered > 0) { this.vel.x = damp(this.vel.x, 0, 5, dt); this.vel.z = damp(this.vel.z, 0, 5, dt); }
    if (this.snared > 0) { this.vel.x = 0; this.vel.z = 0; }
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    ctx.col.resolve(this.pos, this.radius, this.height);
    const gy = ctx.col.groundAt(this.pos.x, this.pos.z, this.pos.y);
    this.pos.y = damp(this.pos.y, gy, 20, dt);
  }

  protected animate(dt: number, extra: { crouch?: boolean; sprint?: boolean; guard?: boolean } = {}) {
    const turn = angleDelta(this.lastYaw, this.yaw) / Math.max(dt, 1e-3);
    this.lastYaw = this.yaw;
    const hs = this.attack ? 0 : Math.hypot(this.vel.x, this.vel.z);
    this.anim.update(dt, { speed: hs, grounded: true, vy: 0, turnRate: turn, ...extra });
    this.updateGlow(dt);
    this.syncRig();
  }

  syncRig() {
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.yaw;
  }

  abstract think(ctx: AICtx): void;

  update(ctx: AICtx) {
    this.stateT += ctx.dt;
    this.cooldown -= ctx.dt;
    if (!this.alive) {
      this.deadT += ctx.dt;
      this.integrate(ctx);
      this.anim.update(ctx.dt, { speed: 0, grounded: true, vy: 0, turnRate: 0 });
      this.updateGlow(ctx.dt);
      this.syncRig();
      return;
    }
    if (this.staggered > 0) {
      this.integrate(ctx);
      this.animate(ctx.dt);
      return;
    }
    this.think(ctx);
    this.integrate(ctx);
  }
}

export const staggerQuad: PoseKey[] = [
  { t: 0, pose: {} },
  { t: 0.15, pose: { hips: [0, 0, 0.3], neck: [-0.5, 0.4, 0], head: [-0.3, 0, 0], upFL: [0.6, 0, 0.2], upFR: [0.4, 0, 0] }, ease: 'snap' },
  { t: 1, pose: {} },
];
