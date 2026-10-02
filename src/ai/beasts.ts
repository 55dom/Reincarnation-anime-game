// Wolves (pack hunters that circle, feint and lunge) and rabbits (skittish prey).
import * as THREE from 'three';
import { Actor, type AICtx, type AttackSpec } from './actor';
import { buildQuadruped } from '../player/rig';
import { keysFor, type Move } from '../combat/moves';
import type { Pose } from '../player/animator';

const biteWind: Pose = { neck: [0.45, 0, 0], head: [-0.35, 0, 0], jaw: [0.6, 0, 0], upFL: [0.35, 0, 0], loFL: [0.3, 0, 0], upBL: [-0.6, 0, 0], loBL: [0.9, 0, 0], pawBL: [-0.4, 0, 0], hips: [0.1, 0, 0] };
const biteHit: Pose = { neck: [-0.35, 0, 0], head: [0.25, 0, 0], jaw: [0.05, 0, 0], upFL: [-1.1, 0, 0], upFR: [-1.0, 0, 0], loFL: [0.2, 0, 0], upBL: [0.6, 0, 0], upBR: [0.6, 0, 0], loBL: [0.0, 0, 0] };
const biteFollow: Pose = { neck: [-0.1, 0, 0], jaw: [0.2, 0, 0], upFL: [-0.4, 0, 0], upFR: [-0.3, 0, 0] };
const snapWind: Pose = { neck: [0.2, 0.3, 0], head: [-0.2, 0, 0], jaw: [0.5, 0, 0], chest: [0, 0.2, 0] };
const snapHit: Pose = { neck: [-0.15, -0.3, 0], head: [0.15, 0, 0], jaw: [0.0, 0, 0], chest: [0, -0.2, 0] };
const howl: Pose = { neck: [-0.9, 0, 0], head: [-0.5, 0, 0], jaw: [0.5, 0, 0], upBL: [0.2, 0, 0], loBL: [0.3, 0, 0] };

function wolfMoves(scale: number) {
  const lunge: Move = { id: 'w_lunge', name: 'Lunge', stamina: 0, windup: 0.62, active: 0.22, recovery: 0.85, damage: 16 * scale, poise: 18, range: 1.6 * scale, arc: 0.7, lunge: 10, keys: [] };
  lunge.keys = keysFor(lunge, biteWind, biteHit, biteFollow);
  const snap: Move = { id: 'w_snap', name: 'Snap', stamina: 0, windup: 0.38, active: 0.12, recovery: 0.55, damage: 9 * scale, poise: 8, range: 1.5 * scale, arc: 0.9, lunge: 2.5, keys: [] };
  snap.keys = keysFor(snap, snapWind, snapHit, biteFollow);
  const pounce: Move = { id: 'w_pounce', name: 'Pounce', stamina: 0, windup: 0.85, active: 0.3, recovery: 1.1, damage: 26 * scale, poise: 40, range: 1.9 * scale, arc: 0.8, lunge: 13, keys: [] };
  pounce.keys = keysFor(pounce, { ...biteWind, hips: [0.25, 0, 0], upBL: [-0.9, 0, 0], loBL: [1.3, 0, 0] }, biteHit, biteFollow);
  return { lunge, snap, pounce };
}

export class Wolf extends Actor {
  private mv: ReturnType<typeof wolfMoves>;
  private circleDir = Math.random() > 0.5 ? 1 : -1;
  private wanderT = 0;
  private wanderDir = new THREE.Vector3();
  private retreatT = 0;
  private howled = false;
  private alpha: boolean;

  constructor(name: string, alpha = false) {
    const scale = alpha ? 1.35 : 1;
    super(name, 'hostile', buildQuadruped({ scale, fur: alpha ? 0x4a3a32 : 0x7a6656, fur2: alpha ? 0x2a1e1a : 0x4a3a30 }), alpha ? 150 : 55, alpha ? 45 : 18, 0.5 * scale, 0.9 * scale);
    this.alpha = alpha;
    this.mv = wolfMoves(scale);
    this.harvest.harvestable = true;
  }

  private spec(m: Move): AttackSpec {
    return { move: m, tele: { shape: m.id === 'w_snap' ? 'cone' : 'rect', size: m.id === 'w_snap' ? 1.9 : m.id === 'w_pounce' ? 6.0 : 4.2, arc: 0.8, width: 1.2 * (this.alpha ? 1.3 : 1) } };
  }

  think(ctx: AICtx) {
    const p = ctx.player;
    const d = this.distTo(p);
    const dt = ctx.dt;
    if (!this.aggro && p.alive && d < (this.alpha ? 16 : 13)) this.aggro = true;
    if (this.aggro && (!p.alive || d > 45)) { this.aggro = false; this.howled = false; }

    if (this.tickAttack(ctx, p, 5)) { this.animate(dt); return; }

    if (!this.aggro) {
      // Wander near home
      this.wanderT -= dt;
      if (this.wanderT <= 0) {
        this.wanderT = 2 + Math.random() * 4;
        const toHome = this.home.clone().sub(this.pos);
        if (toHome.length() > 14) this.wanderDir.copy(toHome.normalize());
        else if (Math.random() < 0.4) this.wanderDir.set(0, 0, 0);
        else { const a = Math.random() * Math.PI * 2; this.wanderDir.set(Math.cos(a), 0, Math.sin(a)); }
      }
      this.steer(this.wanderDir, 1.4, dt);
      this.animate(dt);
      return;
    }

    if (this.alpha && !this.howled) {
      this.howled = true;
      this.anim.play([{ t: 0, pose: {} }, { t: 0.25, pose: howl }, { t: 0.8, pose: howl }, { t: 1, pose: {} }], 1.4);
      this.cooldown = 1.4;
      ctx.onCamShake(0.15);
    }
    if (this.cooldown > 0 && this.anim.action) { this.steer(new THREE.Vector3(), 0, dt); this.animate(dt); return; }

    const to = new THREE.Vector3(p.pos.x - this.pos.x, 0, p.pos.z - this.pos.z).normalize();
    const side = new THREE.Vector3(-to.z, 0, to.x).multiplyScalar(this.circleDir);
    this.retreatT -= dt;
    if (this.retreatT > 0) {
      this.steer(to.clone().multiplyScalar(-0.8).add(side.clone().multiplyScalar(0.6)).normalize(), 4.5, dt, false);
      this.yaw = this.yawTo(p);
      this.animate(dt);
      return;
    }
    // Pack spacing: don't all attack at once — only the closest wolf engages, others circle wider
    const attackers = ctx.actors.filter((a) => a instanceof Wolf && a.alive && a.attack).length;
    const ring = this.alpha ? 4.5 : 5.5 + (attackers > 0 ? 2 : 0);
    if (this.cooldown <= 0 && attackers === 0 && d < ring + 1.5 && this.snared <= 2) {
      this.yaw = this.yawTo(p);
      const r = Math.random();
      const m = this.alpha && r < 0.3 && d > 3 ? this.mv.pounce : d < 2.2 ? this.mv.snap : this.mv.lunge;
      this.startAttack(this.spec(m), ctx, p);
      this.cooldown = this.alpha ? 1.2 + Math.random() : 1.8 + Math.random() * 1.5;
      this.retreatT = 0;
      this.animate(dt);
      return;
    }
    if (d > ring + 0.5) this.steer(to.clone().multiplyScalar(1).add(side.clone().multiplyScalar(0.3)).normalize(), d > 12 ? 7.5 : 4.5, dt);
    else if (d < ring - 1) this.steer(to.clone().multiplyScalar(-1).add(side).normalize(), 3, dt, false);
    else this.steer(side, 2.6, dt, false);
    if (Math.random() < dt * 0.3) this.circleDir *= -1;
    // Face the player while circling
    const want = this.yawTo(p);
    this.yaw = this.yaw + Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw)) * Math.min(1, dt * 5);
    this.animate(dt);
  }

  update(ctx: AICtx) {
    const wasAttacking = !!this.attack;
    super.update(ctx);
    // After a committed lunge, peel away (gives the player a readable chase/punish window)
    if (wasAttacking && !this.attack && this.alive) this.retreatT = 0.9 + Math.random() * 0.6;
  }
}

export class Rabbit extends Actor {
  private wanderT = 0;
  private dir = new THREE.Vector3();
  constructor() {
    super('Dune Hare', 'neutral', buildQuadruped({ kind: 'rabbit', scale: 1, fur: 0xb89a7a, fur2: 0x8a6a50 }), 6, 1, 0.22, 0.35);
    this.harvest.harvestable = true;
    this.lockable = true;
    this.anim.strideLen = 0.7;
  }
  think(ctx: AICtx) {
    const p = ctx.player;
    const d = this.distTo(p);
    const dt = ctx.dt;
    const sneaky = (p as any).crouching ? 3.5 : 8;
    if (d < sneaky) {
      const away = new THREE.Vector3(this.pos.x - p.pos.x, 0, this.pos.z - p.pos.z).normalize();
      // zig-zag
      away.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.sin(ctx.time * 6 + this.id) * 0.6);
      this.steer(away, 6.5, dt, true, 10);
    } else {
      this.wanderT -= dt;
      if (this.wanderT <= 0) {
        this.wanderT = 1 + Math.random() * 3;
        const toHome = this.home.clone().sub(this.pos);
        if (toHome.length() > 18) this.dir.copy(toHome.normalize());
        else if (Math.random() < 0.6) this.dir.set(0, 0, 0);
        else { const a = Math.random() * Math.PI * 2; this.dir.set(Math.cos(a), 0, Math.sin(a)); }
      }
      this.steer(this.dir, 1.2, dt);
    }
    this.animate(dt, { crouch: Math.hypot(this.vel.x, this.vel.z) < 0.3 });
  }
}
