// Humanoid NPCs: the deserter (duelist), the party ally (follows, assists, can never be hurt by you),
// training dummies, and non-combat townsfolk.
import * as THREE from 'three';
import { Actor, type AICtx, type AttackSpec } from './actor';
import { buildHumanoid, type HumanoidOpts } from '../player/rig';
import { keysFor, P, POSE_GUARD, POSE_BACKSTEP, type Move } from '../combat/moves';
import type { Combatant } from '../combat/combat';
import { dampAngle } from '../core/util';

function mk(id: string, windup: number, active: number, recovery: number, damage: number, poise: number, range: number, arc: number, lunge: number, pose: [keyof typeof P, keyof typeof P, keyof typeof P]): Move {
  const m: Move = { id, name: id, stamina: 0, windup, active, recovery, damage, poise, range, arc, lunge, keys: [] };
  m.keys = keysFor(m, P[pose[0]], P[pose[1]], P[pose[2]]);
  return m;
}

export class Deserter extends Actor {
  private moves = {
    slash: mk('d_slash', 0.55, 0.14, 0.7, 18, 16, 2.3, 1.0, 3, ['slashR_wind', 'slashR_hit', 'slashR_follow']),
    back: mk('d_back', 0.32, 0.14, 0.75, 16, 14, 2.3, 1.0, 3, ['slashL_wind', 'slashL_hit', 'slashL_follow']),
    thrust: mk('d_thrust', 0.75, 0.14, 0.9, 26, 24, 3.0, 0.4, 7, ['thrust_wind', 'thrust_hit', 'thrust_follow']),
    over: mk('d_over', 0.9, 0.16, 1.0, 32, 34, 2.6, 0.5, 3, ['over_wind', 'over_hit', 'over_follow']),
  };
  private comboNext: Move | null = null;
  private strafe = 1;
  private backT = 0;

  constructor(name = 'Deserter of the Ninth', look: HumanoidOpts = {}) {
    super(name, 'hostile', buildHumanoid({ cloth: 0x4a3a2a, cloth2: 0x6a2a20, leather: 0x2a1e14, metal: 0x7a746a, helmet: 'open', weapon: 'shortsword', shield: true, beard: true, hair: 0x2a1810, ...look }), 140, 40, 0.42, 1.8);
  }

  private spec(m: Move): AttackSpec {
    const shape = m.id === 'd_thrust' ? 'rect' : 'cone';
    return { move: m, tele: { shape, size: m.range + 0.6, arc: m.arc, width: 1.0 } };
  }

  think(ctx: AICtx) {
    const p = ctx.player;
    const d = this.distTo(p);
    const dt = ctx.dt;
    if (!this.aggro && p.alive && d < 14) this.aggro = true;
    if (this.aggro && (!p.alive || d > 40)) this.aggro = false;

    const wasAttacking = !!this.attack;
    if (this.tickAttack(ctx, p, 3.5)) { this.animate(dt); return; }
    if (wasAttacking && this.comboNext && d < 3.2) {
      const m = this.comboNext; this.comboNext = null;
      this.startAttack(this.spec(m), ctx, p);
      this.animate(dt); return;
    }
    this.comboNext = null;

    if (!this.aggro) {
      // Pace near the tower, idle
      this.steer(new THREE.Vector3(Math.sin(ctx.time * 0.2 + this.id), 0, Math.cos(ctx.time * 0.2 + this.id)), 0.6, dt);
      this.anim.setOverlay(null);
      this.animate(dt);
      return;
    }
    this.anim.setOverlay(POSE_GUARD, 0.7);
    const to = new THREE.Vector3(p.pos.x - this.pos.x, 0, p.pos.z - this.pos.z).normalize();
    const side = new THREE.Vector3(-to.z, 0, to.x).multiplyScalar(this.strafe);
    this.backT -= dt;
    if (this.backT > 0) {
      this.steer(to.clone().multiplyScalar(-1), 4, dt, false, 10);
    } else if (this.cooldown <= 0 && d < 3.4) {
      const r = Math.random();
      if (r < 0.45) { this.startAttack(this.spec(this.moves.slash), ctx, p); this.comboNext = Math.random() < 0.6 ? this.moves.back : null; }
      else if (r < 0.7) this.startAttack(this.spec(this.moves.over), ctx, p);
      else this.startAttack(this.spec(this.moves.thrust), ctx, p);
      this.cooldown = 1.2 + Math.random() * 1.2;
    } else if (this.cooldown <= 0 && d < 6 && Math.random() < dt * 1.5) {
      this.startAttack(this.spec(this.moves.thrust), ctx, p);
      this.cooldown = 1.6;
    } else if (d > 3.2) {
      this.steer(to.clone().add(side.clone().multiplyScalar(0.25)).normalize(), d > 8 ? 4.5 : 2.4, dt, false);
    } else {
      this.steer(side, 1.4, dt, false);
      if (Math.random() < dt * 0.5) this.strafe *= -1;
    }
    this.yaw = dampAngle(this.yaw, this.yawTo(p), 6, dt);
    this.animate(dt, { guard: true });
  }

  onHit(h: Parameters<Actor['onHit']>[0], res: Parameters<Actor['onHit']>[1]) {
    super.onHit(h, res);
    if (this.alive && !res.staggered && !this.attack && Math.random() < 0.3) {
      this.backT = 0.4;
      this.anim.play(POSE_BACKSTEP, 0.4);
    }
  }
}

/** Your contract party member. Blue nameplate. Your blows pass through: friendly fire is hard-blocked. */
export class PartyAlly extends Actor {
  private thrust = mk('a_thrust', 0.4, 0.12, 0.6, 9, 10, 3.0, 0.5, 4, ['thrust_wind', 'thrust_hit', 'thrust_follow']);
  following = false;
  target: Combatant | null = null;

  constructor() {
    super('Iven Ashcourt', 'party', buildHumanoid({ cloth: 0x2a3a5a, cloth2: 0x8a7a5a, leather: 0x3a2a1a, weapon: 'spear', hair: 0x6a4a2a, scarf: true, build: 'light', skin: 0xc8a080 }), 200, 40, 0.4, 1.8);
    this.lockable = false;
  }
  isInvulnerable() { return true; } // story-wise the ally retreats rather than dies in this slice

  think(ctx: AICtx) {
    const p = ctx.player;
    const dt = ctx.dt;
    if (this.tickAttack(ctx, this.target, 5)) { this.animate(dt); return; }
    if (!this.following) {
      this.steer(new THREE.Vector3(), 0, dt);
      this.yaw = dampAngle(this.yaw, this.yawTo(p), 2, dt);
      this.animate(dt);
      return;
    }
    // Pick a hostile near the player to assist on
    if (!this.target || !this.target.alive || this.distTo(this.target) > 16) {
      this.target = null;
      let best = 12;
      for (const a of ctx.actors) {
        if (a.faction !== 'hostile' || !a.alive || !a.aggro) continue;
        const dd = Math.hypot(a.pos.x - p.pos.x, a.pos.z - p.pos.z);
        if (dd < best) { best = dd; this.target = a; }
      }
    }
    if (this.target) {
      const d = this.distTo(this.target);
      const to = new THREE.Vector3(this.target.pos.x - this.pos.x, 0, this.target.pos.z - this.pos.z).normalize();
      if (d > 3.2) this.steer(to, 4.8, dt);
      else if (this.cooldown <= 0) {
        this.yaw = this.yawTo(this.target);
        this.startAttack({ move: this.thrust }, ctx, this.target);
        this.cooldown = 2.2 + Math.random() * 1.5;
      } else {
        const side = new THREE.Vector3(-to.z, 0, to.x);
        this.steer(d < 2.4 ? to.clone().negate() : side, 1.6, dt, false);
        this.yaw = dampAngle(this.yaw, this.yawTo(this.target), 6, dt);
      }
    } else {
      // Follow off the player's left shoulder
      const behind = new THREE.Vector3(p.pos.x - Math.sin(p.yaw) * 2.2 + Math.cos(p.yaw) * 1.6, 0, p.pos.z - Math.cos(p.yaw) * 2.2 - Math.sin(p.yaw) * 1.6);
      const to = new THREE.Vector3(behind.x - this.pos.x, 0, behind.z - this.pos.z);
      const d = to.length();
      if (d > 40) { this.pos.set(behind.x, p.pos.y, behind.z); }
      if (d > 0.8) this.steer(to.normalize(), d > 6 ? 7.5 : d > 2.5 ? 5 : 2, dt);
      else { this.steer(new THREE.Vector3(), 0, dt); this.yaw = dampAngle(this.yaw, p.yaw, 3, dt); }
    }
    this.animate(dt, { sprint: Math.hypot(this.vel.x, this.vel.z) > 6 });
  }
}

/** Static training targets. The red post takes damage; the blue ward is a party member. */
export class Dummy extends Actor {
  constructor(name: string, party: boolean) {
    super(name, party ? 'party' : 'hostile', buildHumanoid({ cloth: party ? 0x2a3a6a : 0x7a5a3a, cloth2: party ? 0x4a5a8a : 0x9a7a4a, leather: 0x5a4030, weapon: 'none', helmet: party ? 'open' : 'none', build: 'medium' }), party ? 9999 : 200, 30, 0.4, 1.8);
    this.lockable = true;
  }
  think(ctx: AICtx) {
    this.steer(new THREE.Vector3(), 0, ctx.dt);
    this.animate(ctx.dt, { guard: true });
    // Training post self-repairs
    if (this.faction === 'hostile' && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + ctx.dt * 10);
  }
  die() { this.hp = this.maxHp; this.alive = true; }
  onHit(h: Parameters<Actor['onHit']>[0], res: Parameters<Actor['onHit']>[1]) {
    if (res.killed) { this.alive = true; this.hp = this.maxHp; }
    super.onHit(h, { ...res, killed: false });
  }
}

/** Non-combat townsfolk (clerk, quartermaster, citizens). They watch you when you come close. */
export class TownNPC extends Actor {
  private faceYaw: number;
  constructor(name: string, look: HumanoidOpts, yaw: number, private wander = false) {
    super(name, 'neutral', buildHumanoid(look), 999, 999, 0.4, 1.8);
    this.lockable = false;
    this.faceYaw = yaw;
    this.yaw = yaw;
  }
  isInvulnerable() { return true; }
  think(ctx: AICtx) {
    const p = ctx.player;
    const d = this.distTo(p);
    if (this.wander) {
      const t = ctx.time * 0.08 + this.id;
      const target = this.home.clone().add(new THREE.Vector3(Math.sin(t) * 6, 0, Math.cos(t * 0.7) * 6));
      const to = target.sub(this.pos); to.y = 0;
      if (to.length() > 0.5 && d > 2) this.steer(to.normalize(), 1.2, ctx.dt); else this.steer(new THREE.Vector3(), 0, ctx.dt);
    } else {
      this.steer(new THREE.Vector3(), 0, ctx.dt);
      this.yaw = dampAngle(this.yaw, d < 5 ? this.yawTo(p) : this.faceYaw, 3, ctx.dt);
    }
    this.animate(ctx.dt);
  }
}
