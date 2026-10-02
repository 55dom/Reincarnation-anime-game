// Player controller: camera-relative locomotion, sprint/jump/crouch/roll (i-frames), committed attacks
// with combo chains, charged heavies, roll attacks and class specials. Implements Combatant.
import * as THREE from 'three';
import { buildHumanoid, type Rig, type HumanoidOpts } from './rig';
import { ProcAnimator } from './animator';
import { CLASSES, type ClassDef, type ClassId } from '../combat/classes';
import { POSE_ROLL, POSE_BACKSTEP, POSE_STAGGER, POSE_DEAD_BIPED, POSE_KNEEL, total, keysFor, P as POSES, type Move } from '../combat/moves';
import { newId, type Combatant, type HitInfo, type HitResult, type Faction } from '../combat/combat';
import type { Input } from '../core/input';
import type { Collision } from '../world/collision';
import { clamp, damp, dampAngle, angleDelta } from '../core/util';

type State = 'move' | 'roll' | 'attack' | 'stagger' | 'dead' | 'busy';

export interface AttackCtx { move: Move; t: number; hitSet: Set<number>; kind: 'light' | 'heavy' | 'charged' | 'roll' | 'special' | 'critical'; flurryTick: number }

/** Critical strike on a staggered foe: a committed lunge-and-drive, shared by every path. */
const CRIT_TIMING = { windup: 0.28, active: 0.12, recovery: 0.7 };
export const CRIT_MOVE: Move = {
  id: 'critical', name: 'Critical Strike', stamina: 8, ...CRIT_TIMING, damage: 0, poise: 0, range: 2.8, arc: 0.9, lunge: 4,
  keys: keysFor(CRIT_TIMING, POSES.stab_down_wind, POSES.thrust_hit, POSES.stab_down_hit),
};

const DRIFTER_LOOK: HumanoidOpts = { cloth: 0x6a5040, cloth2: 0x9a8060, leather: 0x4a3424, build: 'light', hood: true, scarf: true, weapon: 'none', skin: 0xb88a68 };
const DRIFTER_MOVE: Move = { id: 'shove', name: 'Shove', stamina: 10, windup: 0.2, active: 0.1, recovery: 0.35, damage: 3, poise: 5, range: 1.6, arc: 0.8, lunge: 2, keys: [] };

export class Player implements Combatant {
  id = newId();
  name = 'You';
  faction: Faction = 'player';
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = Math.PI;
  radius = 0.38;
  height = 1.8;
  hp = 100; maxHp = 100;
  poise = 20; maxPoise = 20;
  stamina = 100; maxStamina = 100;
  hunger = 85; // 0 starving .. 100 full
  alive = true;
  marked = 0; bleed = 0; snared = 0; staggered = 0;
  lockable = false;
  rig!: Rig;
  anim!: ProcAnimator;
  tumble = new THREE.Group();
  cls: ClassDef | null = null;
  state: State = 'move';
  grounded = true;
  crouching = false;
  sprinting = false;
  private stateT = 0;
  private rollDir = new THREE.Vector3();
  private rollKind: 'roll' | 'back' = 'roll';
  private iframes = false;
  attack: AttackCtx | null = null;
  private comboIdx = 0;
  private comboChain: 'light' | 'heavy' | null = null;
  private comboReset = 0;
  private buffered: { a: 'light' | 'heavy' | 'dodge' | 'special'; t: number; charged?: boolean } | null = null;
  private heavyPending = false;
  private staminaDelay = 0;
  private lastYaw = Math.PI;
  turnRate = 0;
  lockTarget: Combatant | null = null;
  relicArmor = false;
  speedMul = 1;           // mud / terrain modifier set by weather
  onFootstep: (p: THREE.Vector3, yaw: number, side: number) => void = () => {};
  onAttackActive: (ctx: AttackCtx) => void = () => {};
  onSpecial: (ctx: AttackCtx) => void = () => {};
  onLand: (impact: number) => void = () => {};
  private lastPhaseSign = 0;
  busyPose: 'kneel' | null = null;
  damageReduction = 0;
  /** Returns a staggered foe in reach, turning the next light attack into a critical strike. */
  criticalCheck: () => Combatant | null = () => null;
  critTarget: Combatant | null = null;
  get dmgTakenMul() { return 1 - this.damageReduction; }

  constructor(private scene: THREE.Scene, private col: Collision) {
    this.buildRig(DRIFTER_LOOK);
  }

  buildRig(look: HumanoidOpts) {
    if (this.rig) { this.tumble.remove(this.rig.body); this.scene.remove(this.rig.root); }
    this.rig = buildHumanoid({ ...look, uniqueMats: true });
    // Insert a tumble pivot at roll height so rolls rotate around the body center, not the feet.
    this.rig.root.remove(this.rig.body);
    this.tumble = new THREE.Group();
    this.tumble.position.y = 0.55;
    this.rig.body.position.y = -0.55;
    this.tumble.add(this.rig.body);
    this.rig.root.add(this.tumble);
    this.scene.add(this.rig.root);
    const phase = this.anim?.phase ?? 0;
    this.anim = new ProcAnimator(this.rig);
    this.anim.phase = phase;
  }

  setClass(id: ClassId) {
    this.cls = CLASSES[id];
    this.applyLook();
    this.maxHp = this.cls.maxHp + (this.relicArmor ? 25 : 0);
    this.hp = this.maxHp;
    this.maxStamina = this.cls.maxStamina;
    this.stamina = this.maxStamina;
    this.maxPoise = this.cls.poise + (this.relicArmor ? 25 : 0);
    this.poise = this.maxPoise;
  }

  /** Socketing the Warden's Sand-Heart re-forges the armor: new silhouette, colors and stats. */
  socketRelic() {
    this.relicArmor = true;
    this.damageReduction = 0.12;
    if (this.cls) this.setClass(this.cls.id);
  }

  private applyLook() {
    if (!this.cls) return;
    const look: HumanoidOpts = { ...this.cls.look };
    if (this.relicArmor) {
      look.pauldrons = true;
      look.cloth2 = 0xc89a3a;
      look.metal = 0xc8a060;
      if (look.build === 'light') look.build = 'medium';
    }
    this.buildRig(look);
    if (this.relicArmor) {
      for (const m of this.rig.flashMats) if (m.metalness > 0.5) { m.emissive.setHex(0x3a1a04); }
    }
  }

  teleport(x: number, y: number, z: number, yaw = this.yaw) {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.lastYaw = yaw;
    this.rig.root.position.copy(this.pos);
  }

  isInvulnerable() { return this.iframes || this.state === 'dead' || this.attack?.kind === 'critical'; }
  hasHyperArmor() { return !!(this.attack && this.attack.move.hyperArmor && this.attack.t < this.attack.move.windup + this.attack.move.active); }

  onHit(h: HitInfo, res: HitResult) {
    if (res.killed || this.hp <= 0) { this.die(); return; }
    this.anim.hit();
    if (res.staggered && !this.hasHyperArmor()) {
      this.attack = null;
      this.state = 'stagger';
      this.stateT = 0;
      this.anim.play(POSE_STAGGER, 0.55);
      this.vel.copy(h.dir).multiplyScalar(3.5);
    }
  }

  die() {
    this.alive = false;
    this.state = 'dead';
    this.attack = null;
    this.anim.stopAction();
    this.anim.setOverlay(POSE_DEAD_BIPED, 1);
  }

  revive() {
    this.alive = true;
    this.state = 'move';
    this.hp = this.maxHp;
    this.stamina = this.maxStamina;
    this.anim.setOverlay(null);
  }

  get inAction() { return this.state !== 'move'; }

  private useStamina(n: number) {
    this.stamina = Math.max(0, this.stamina - n);
    this.staminaDelay = 0.7;
  }

  private startRoll(dir: THREE.Vector3) {
    if (!this.cls) {
      // Drifters can still roll, they just don't have a path's conditioning
    }
    const cost = this.cls?.rollCost ?? 18;
    if (this.stamina <= 0) return;
    this.useStamina(cost);
    this.state = 'roll';
    this.stateT = 0;
    this.attack = null;
    if (dir.lengthSq() < 0.01) {
      this.rollKind = 'back';
      this.rollDir.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      this.anim.play(POSE_BACKSTEP, this.cls?.backstep ? 0.36 : 0.42);
    } else {
      this.rollKind = 'roll';
      this.rollDir.copy(dir).normalize();
      this.yaw = Math.atan2(dir.x, dir.z);
      this.anim.play(POSE_ROLL, this.rollDuration());
    }
  }
  private rollDuration() {
    const heavy = this.cls?.id === 'oathbound';
    return heavy ? 0.78 : this.cls?.id === 'shadebound' ? 0.55 : 0.64;
  }

  private startAttack(kind: AttackCtx['kind']) {
    let move: Move;
    const crit = kind === 'light' || kind === 'roll' ? this.criticalCheck() : null;
    if (crit) {
      kind = 'critical';
      move = CRIT_MOVE;
      this.critTarget = crit;
      this.comboChain = null;
    } else if (!this.cls) {
      move = DRIFTER_MOVE;
      move.keys = CLASSES.hunter.light[0].keys;
    } else if (kind === 'light') {
      if (this.comboChain !== 'light' || this.comboReset <= 0) this.comboIdx = 0;
      move = this.cls.light[this.comboIdx % this.cls.light.length];
      this.comboIdx++;
      this.comboChain = 'light';
    } else if (kind === 'heavy') {
      if (this.comboChain !== 'heavy' || this.comboReset <= 0) this.comboIdx = 0;
      move = this.cls.heavy[this.comboIdx % this.cls.heavy.length];
      this.comboIdx++;
      this.comboChain = 'heavy';
    } else if (kind === 'charged') {
      move = this.cls.charged; this.comboChain = null;
    } else if (kind === 'roll') {
      move = this.cls.rollAttack; this.comboChain = 'light'; this.comboIdx = 1;
    } else {
      move = this.cls.special; this.comboChain = null;
    }
    if (this.stamina <= 0) return;
    this.useStamina(move.stamina);
    this.state = 'attack';
    this.attack = { move, t: 0, hitSet: new Set(), kind, flurryTick: -1 };
    this.anim.play(move.keys, total(move));
    // Snap toward lock target so committed swings land where the player meant
    if (crit) this.yaw = Math.atan2(crit.pos.x - this.pos.x, crit.pos.z - this.pos.z);
    else if (this.lockTarget) this.yaw = Math.atan2(this.lockTarget.pos.x - this.pos.x, this.lockTarget.pos.z - this.pos.z);
  }

  update(dt: number, input: Input, camBasis: { fwd: THREE.Vector3; right: THREE.Vector3 }, controlsEnabled: boolean) {
    this.stateT += dt;
    this.comboReset -= dt;
    const mv = controlsEnabled ? input.move : new THREE.Vector2();
    const wish = new THREE.Vector3().addScaledVector(camBasis.fwd, mv.y).addScaledVector(camBasis.right, mv.x);
    const wishLen = Math.min(1, wish.length());
    if (wishLen > 0.001) wish.normalize();

    // Buffer combat inputs so presses during recovery chain cleanly
    if (controlsEnabled && this.alive) {
      if (input.pressed('light')) this.buffered = { a: 'light', t: 0.3 };
      if (input.pressed('dodge')) this.buffered = { a: 'dodge', t: 0.25 };
      if (input.pressed('special')) this.buffered = { a: 'special', t: 0.25 };
      if (input.pressed('heavy')) this.heavyPending = true;
      if (this.heavyPending) {
        if (input.holdTime('heavy') >= 0.32 && input.isDown('heavy') && this.cls) { this.heavyPending = false; this.buffered = { a: 'heavy', t: 0.3, charged: true }; }
        else if (!input.isDown('heavy')) { this.heavyPending = false; this.buffered = { a: 'heavy', t: 0.3 }; }
      }
      if (input.pressed('crouch')) this.crouching = !this.crouching;
    }
    if (this.buffered) { this.buffered.t -= dt; if (this.buffered.t <= 0) this.buffered = null; }

    const canAct = () => {
      if (this.state === 'move') return true;
      if (this.state === 'attack' && this.attack) {
        const m = this.attack.move;
        const rec = this.attack.t - m.windup - m.active;
        return rec > m.recovery * (m.cancelAt ?? 0.85);
      }
      if (this.state === 'roll') return this.stateT > this.rollDuration() * 0.7;
      return false;
    };

    if (this.buffered && this.alive && canAct()) {
      const b = this.buffered;
      const fromRoll = this.state === 'roll';
      if (b.a === 'dodge') { this.buffered = null; this.startRoll(this.lockTarget && wishLen < 0.1 && this.cls?.backstep ? new THREE.Vector3() : wishLen > 0.1 ? wish : new THREE.Vector3()); }
      else if (b.a === 'light' && this.grounded) { this.buffered = null; this.startAttack(fromRoll && this.cls ? 'roll' : 'light'); }
      else if (b.a === 'heavy' && this.grounded) { this.buffered = null; this.startAttack(b.charged ? 'charged' : 'heavy'); }
      else if (b.a === 'special' && this.grounded && this.cls) { this.buffered = null; this.startAttack('special'); }
    }

    // Sprint / stamina
    const wantsSprint = controlsEnabled && (input.isDown('sprint') || input.stickSprint) && wishLen > 0.5 && this.state === 'move' && !this.crouching;
    this.sprinting = wantsSprint && this.stamina > 1;
    if (this.sprinting) { this.stamina -= 16 * dt; this.staminaDelay = 0.5; this.crouching = false; }
    this.staminaDelay -= dt;
    const hungerMul = this.hunger < 15 ? 0.45 : this.hunger < 35 ? 0.75 : 1;
    if (this.staminaDelay <= 0 && this.state !== 'attack' && this.state !== 'roll') {
      const regen = (this.cls?.staminaRegen ?? 30) * hungerMul * (this.lockTarget ? 0.85 : 1);
      this.stamina = Math.min(this.maxStamina, this.stamina + regen * dt);
    }

    const g = 16;
    let targetVel = new THREE.Vector3();
    switch (this.state) {
      case 'move': {
        const base = this.cls?.speed ?? 5.0;
        const walkish = input.touchMode ? wishLen < 0.55 : false;
        let speed = this.crouching ? 1.7 : walkish ? 2.0 : base;
        if (this.sprinting) speed = base * 1.5;
        if (this.lockTarget && !this.sprinting) speed *= 0.72;
        speed *= this.speedMul;
        targetVel.copy(wish).multiplyScalar(speed * (input.touchMode ? Math.max(wishLen, 0.35) : wishLen));
        // Facing
        if (this.lockTarget && !this.sprinting) {
          const ty = Math.atan2(this.lockTarget.pos.x - this.pos.x, this.lockTarget.pos.z - this.pos.z);
          this.yaw = dampAngle(this.yaw, ty, 12, dt);
        } else if (wishLen > 0.05) {
          this.yaw = dampAngle(this.yaw, Math.atan2(wish.x, wish.z), this.sprinting ? 7 : 11, dt);
        }
        if (controlsEnabled && input.pressed('jump') && this.grounded && this.stamina > 0) {
          this.vel.y = 5.6;
          this.grounded = false;
          this.useStamina(8);
          this.crouching = false;
        }
        const lam = this.grounded ? 11 : 2;
        this.vel.x = damp(this.vel.x, targetVel.x, lam, dt);
        this.vel.z = damp(this.vel.z, targetVel.z, lam, dt);
        break;
      }
      case 'roll': {
        const d = this.rollDuration();
        const t = this.stateT / (this.rollKind === 'back' ? (this.cls?.backstep ? 0.36 : 0.42) : d);
        const spd = this.rollKind === 'back' ? (this.cls?.backstep ? 7.5 : 5.5) * (1 - t) : 7.2 * (t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3) * this.speedMul;
        this.vel.x = this.rollDir.x * spd;
        this.vel.z = this.rollDir.z * spd;
        const iStart = 0.06, iEnd = this.rollKind === 'back' ? (this.cls?.backstep ? 0.65 : 0.45) : 0.6;
        this.iframes = t > iStart && t < iEnd;
        this.tumble.rotation.x = this.rollKind === 'roll' ? clamp((t - 0.1) / 0.65, 0, 1) * Math.PI * 2 : 0;
        if (t >= 1) { this.state = 'move'; this.iframes = false; this.tumble.rotation.x = 0; }
        break;
      }
      case 'attack': {
        const a = this.attack!;
        const m = a.move;
        a.t += dt;
        // Tracking during windup only: commitment after that
        if (a.t < m.windup) {
          if (this.lockTarget) this.yaw = dampAngle(this.yaw, Math.atan2(this.lockTarget.pos.x - this.pos.x, this.lockTarget.pos.z - this.pos.z), 10, dt);
          else if (wishLen > 0.2) this.yaw = dampAngle(this.yaw, Math.atan2(wish.x, wish.z), 6, dt);
        }
        const inLunge = a.t > m.windup * 0.7 && a.t < m.windup + m.active;
        let lunge = inLunge ? m.lunge : 0;
        const lungeT = a.kind === 'critical' ? this.critTarget : this.lockTarget;
        if (lungeT && inLunge) {
          const d = Math.hypot(lungeT.pos.x - this.pos.x, lungeT.pos.z - this.pos.z) - lungeT.radius - this.radius;
          if (d < 0.6) lunge = 0; // don't push through the target
        }
        this.vel.x = damp(this.vel.x, Math.sin(this.yaw) * lunge, 14, dt);
        this.vel.z = damp(this.vel.z, Math.cos(this.yaw) * lunge, 14, dt);
        if (a.t >= m.windup && a.t <= m.windup + m.active) {
          if (a.kind === 'special') this.onSpecial(a); else this.onAttackActive(a);
        }
        if (a.t >= total(m)) {
          this.state = 'move';
          this.attack = null;
          this.comboReset = 0.35;
        }
        break;
      }
      case 'stagger':
        this.vel.x = damp(this.vel.x, 0, 6, dt);
        this.vel.z = damp(this.vel.z, 0, 6, dt);
        if (this.stateT > 0.55) this.state = 'move';
        break;
      case 'dead':
      case 'busy':
        this.vel.x = damp(this.vel.x, 0, 10, dt);
        this.vel.z = damp(this.vel.z, 0, 10, dt);
        break;
    }

    // Integrate + collide
    this.vel.y -= g * dt;
    const prevY = this.pos.y;
    this.pos.addScaledVector(this.vel, dt);
    this.col.resolve(this.pos, this.radius, this.height);
    const ground = this.col.groundAt(this.pos.x, this.pos.z, prevY);
    if (this.pos.y <= ground + 0.001) {
      if (!this.grounded) {
        const impact = -this.vel.y;
        if (impact > 3) { this.anim.land_(impact); this.onLand(impact); }
      }
      this.pos.y = ground;
      this.vel.y = Math.max(0, this.vel.y);
      this.grounded = true;
    } else if (this.pos.y > ground + 0.25) {
      this.grounded = false;
    } else if (this.vel.y <= 0) {
      // Snap down small steps/slopes when walking downhill
      this.pos.y = ground;
      this.vel.y = 0;
      this.grounded = true;
    }

    // Animation
    this.turnRate = angleDelta(this.lastYaw, this.yaw) / Math.max(dt, 1e-3);
    this.lastYaw = this.yaw;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.anim.setOverlay(this.state === 'dead' ? POSE_DEAD_BIPED : this.busyPose === 'kneel' ? POSE_KNEEL : null, 1);
    this.anim.update(dt, {
      speed: this.state === 'roll' || this.state === 'attack' ? 0 : hs,
      grounded: this.grounded, vy: this.vel.y, turnRate: this.turnRate,
      crouch: this.crouching && this.state === 'move', sprint: this.sprinting,
      guard: !!this.lockTarget && this.state === 'move',
    });
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.yaw;
    // Lying dead: lower the body so it rests on the ground instead of floating at hip height
    const bodyY = this.state === 'dead' ? -0.55 - (this.rig.hipHeight - 0.22) : -0.55;
    this.rig.body.position.y += (bodyY - this.rig.body.position.y) * Math.min(1, dt * 7);

    // Footstep events from gait phase zero crossings
    const s = Math.sin(this.anim.phase);
    const sign = s > 0 ? 1 : -1;
    if (this.grounded && hs > 0.6 && this.state === 'move' && sign !== this.lastPhaseSign) {
      const side = sign > 0 ? 1 : -1;
      const off = new THREE.Vector3(Math.cos(this.yaw) * 0.12 * side, 0, -Math.sin(this.yaw) * 0.12 * side);
      this.onFootstep(this.pos.clone().add(off), this.yaw, side);
    }
    this.lastPhaseSign = sign;
  }
}
