// Dune Warden — sunken fort boss. Three phases with large, phone-readable ground telegraphs:
// P1 halberd sweeps/slams; P2 (≤60%) adds sand-burst rings and a charging run; P3 (≤25%) a
// sandstorm vortex, faster windups and chained combos.
import * as THREE from 'three';
import { Actor, type AICtx, type AttackSpec } from './actor';
import { buildHumanoid } from '../player/rig';
import { keysFor, P, POSE_GUARD, type Move } from '../combat/moves';
import { dampAngle } from '../core/util';

function mk(id: string, name: string, windup: number, active: number, recovery: number, damage: number, poise: number, range: number, arc: number, lunge: number, pose: [keyof typeof P, keyof typeof P, keyof typeof P], aoe = false): Move {
  const m: Move = { id, name, stamina: 0, windup, active, recovery, damage, poise, range, arc, lunge, keys: [], aoe, hyperArmor: true };
  m.keys = keysFor(m, P[pose[0]], P[pose[1]], P[pose[2]]);
  return m;
}

export class DuneWarden extends Actor {
  phase = 1;
  awake = false;
  private moves = {
    sweep: mk('b_sweep', 'Dune Sweep', 1.0, 0.25, 1.1, 34, 50, 5.2, 1.5, 2, ['slashR_wind', 'slashR_hit', 'slashR_follow']),
    slam: mk('b_slam', 'Warden Slam', 1.25, 0.2, 1.3, 48, 80, 6.8, 0.32, 3, ['over_wind', 'over_hit', 'over_follow']),
    spin: mk('b_spin', 'Wheel of Sand', 1.1, 0.4, 1.2, 36, 60, 5.4, Math.PI, 1, ['spin_wind', 'spin_hit', 'spin_follow'], true),
    burst: mk('b_burst', 'Sand Burst', 1.2, 0.2, 1.0, 40, 70, 3.6, Math.PI, 0, ['slam_wind', 'slam_hit', 'slam_follow'], true),
    charge: mk('b_charge', 'Warden\'s March', 0.95, 0.85, 1.4, 42, 90, 2.2, 0.9, 13, ['thrust_wind', 'thrust_hit', 'thrust_follow']),
    vortex: mk('b_vortex', 'Crimson Vortex', 1.6, 0.6, 1.6, 55, 100, 9.0, Math.PI, 0, ['slam_wind', 'slam_hit', 'slam_follow'], true),
  };
  private combo: Move[] = [];
  onPhase: (p: number) => void = () => {};
  arenaCenter = new THREE.Vector3();
  private burstTarget = new THREE.Vector3();

  constructor() {
    super('Dune Warden', 'hostile', buildHumanoid({ scale: 2.25, cloth: 0x5a3a24, cloth2: 0x9a6a30, leather: 0x2a1a10, metal: 0x8a7a5a, build: 'heavy', helmet: 'great', pauldrons: true, cloak: true, weapon: 'halberd' }), 1400, 160, 1.0, 4.2);
    this.contractTarget = true;
    this.anim.strideLen = 2.8;
  }

  private speed() { return this.phase === 3 ? 1.25 : this.phase === 2 ? 1.1 : 1; }

  private spec(m: Move): AttackSpec {
    const s = this.speed();
    const mm: Move = { ...m, windup: m.windup / s, recovery: m.recovery / s };
    mm.keys = m.keys;
    switch (m.id) {
      case 'b_sweep': return { move: mm, tele: { shape: 'cone', size: m.range, arc: m.arc } };
      case 'b_slam': return { move: mm, tele: { shape: 'rect', size: m.range, width: 2.2 } };
      case 'b_spin': return { move: mm, tele: { shape: 'circle', size: m.range } };
      case 'b_charge': return { move: mm, tele: { shape: 'rect', size: 12, width: 2.6 } };
      case 'b_burst': return {
        move: mm, tele: { shape: 'circle', size: m.range, atTarget: true },
        onActive: (a, ctx) => {
          // Burst lands where the player WAS at windup start: dodge out of the circle.
          const p = ctx.player;
          const d = Math.hypot(p.pos.x - this.burstTarget.x, p.pos.z - this.burstTarget.z);
          ctx.fx.ash(this.burstTarget.clone().setY(p.pos.y), m.range * 0.6, 26, 0xc0905a);
          ctx.onCamShake(0.35);
          if (d < m.range + p.radius) ctx.combat.resolve(p, { attacker: this, damage: m.damage, poise: m.poise, dir: new THREE.Vector3(p.pos.x - this.burstTarget.x, 0, p.pos.z - this.burstTarget.z).normalize(), kind: 'aoe' });
        },
      };
      case 'b_vortex': return {
        move: mm, tele: { shape: 'circle', size: m.range },
        onActive: (a, ctx) => {
          const p = ctx.player;
          ctx.fx.ash(this.pos.clone(), m.range * 0.5, 40, 0xa04a2a);
          ctx.onCamShake(0.6);
          if (this.distTo(p) < m.range + p.radius) ctx.combat.resolve(p, { attacker: this, damage: m.damage, poise: m.poise, dir: new THREE.Vector3(p.pos.x - this.pos.x, 0, p.pos.z - this.pos.z).normalize(), kind: 'aoe' });
        },
      };
    }
    return { move: mm };
  }

  think(ctx: AICtx) {
    const p = ctx.player;
    const dt = ctx.dt;
    const d = this.distTo(p);
    if (!this.awake) {
      this.anim.setOverlay(POSE_GUARD, 0.4);
      this.steer(new THREE.Vector3(), 0, dt);
      if (p.alive && d < 21) { this.awake = true; this.aggro = true; this.onPhase(1); }
      this.animate(dt);
      return;
    }
    // Phase transitions
    const hpf = this.hp / this.maxHp;
    if (this.phase === 1 && hpf <= 0.6) { this.phase = 2; this.onPhase(2); this.cancelAttack(); this.cooldown = 1.2; ctx.fx.ash(this.pos.clone(), 3, 40, 0xc0905a); ctx.onCamShake(0.5); }
    if (this.phase === 2 && hpf <= 0.25) { this.phase = 3; this.onPhase(3); this.cancelAttack(); this.cooldown = 1.0; ctx.fx.ash(this.pos.clone(), 4, 50, 0xa03a20); ctx.onCamShake(0.7); }

    const wasAttacking = !!this.attack;
    if (this.tickAttack(ctx, p, this.attack?.spec.move.id === 'b_charge' ? 1.2 : 2.4)) {
      if (this.attack && this.attack.spec.move.id === 'b_slam' && this.attack.t >= this.attack.spec.move.windup && !this.attack.fired) {
        this.attack.fired = true;
        ctx.onCamShake(0.4);
        ctx.fx.ash(this.pos.clone().add(new THREE.Vector3(Math.sin(this.yaw) * 4, 0, Math.cos(this.yaw) * 4)), 1.5, 18, 0xc0905a);
      }
      this.animate(dt);
      return;
    }
    if (wasAttacking && this.combo.length) {
      const m = this.combo.shift()!;
      this.startBossAttack(m, ctx);
      this.animate(dt);
      return;
    }
    this.anim.setOverlay(POSE_GUARD, 0.5);

    if (!p.alive) { this.steer(new THREE.Vector3(), 0, dt); this.animate(dt); return; }

    // Leash to the arena so the fight stays in the readable space
    const fromC = this.pos.clone().sub(this.arenaCenter); fromC.y = 0;
    const to = new THREE.Vector3(p.pos.x - this.pos.x, 0, p.pos.z - this.pos.z).normalize();
    if (this.cooldown <= 0) {
      const r = Math.random();
      let m: Move;
      if (this.phase >= 3 && r < 0.18) m = this.moves.vortex;
      else if (this.phase >= 2 && d > 7 && r < 0.5) m = this.moves.charge;
      else if (this.phase >= 2 && r < 0.4) m = this.moves.burst;
      else if (d < 4.5) m = r < 0.5 ? this.moves.sweep : this.moves.spin;
      else if (d < 7) m = this.moves.slam;
      else m = this.phase >= 2 ? this.moves.burst : this.moves.slam;
      if (d > 9 && m !== this.moves.burst && m !== this.moves.charge && m !== this.moves.vortex) {
        this.steer(to, 3.4 * this.speed(), dt);
        this.animate(dt);
        return;
      }
      this.combo = [];
      if (this.phase >= 2 && m === this.moves.sweep) this.combo.push(this.moves.slam);
      if (this.phase >= 3 && m === this.moves.slam) this.combo.push(this.moves.spin);
      this.startBossAttack(m, ctx);
      this.cooldown = (this.phase === 3 ? 0.6 : this.phase === 2 ? 1.0 : 1.5) + Math.random() * 0.8;
    } else {
      if (fromC.length() > 22) this.steer(fromC.normalize().negate(), 2.5, dt);
      else if (d > 5) this.steer(to, 2.6 * this.speed(), dt);
      else this.steer(new THREE.Vector3(-to.z, 0, to.x), 1.2, dt, false);
      this.yaw = dampAngle(this.yaw, this.yawTo(p), 3, dt);
    }
    this.animate(dt);
  }

  private startBossAttack(m: Move, ctx: AICtx) {
    this.yaw = this.yawTo(ctx.player);
    this.burstTarget.copy(ctx.player.pos);
    this.startAttack(this.spec(m), ctx, ctx.player);
  }
}
