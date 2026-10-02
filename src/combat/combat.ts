// Combat rules shared by every fighter: factions (hard friendly-fire block), hit resolution,
// poise/stagger, marks, bleed and snares.
import * as THREE from 'three';
import type { Rig } from '../player/rig';
import type { Move } from './moves';

export type Faction = 'player' | 'party' | 'hostile' | 'neutral';

export interface HitInfo {
  attacker: Combatant;
  damage: number;
  poise: number;
  dir: THREE.Vector3;
  kind: 'melee' | 'aoe' | 'special' | 'execute' | 'bleed';
  bleed?: number;
}

export interface Combatant {
  id: number;
  name: string;
  faction: Faction;
  pos: THREE.Vector3;
  yaw: number;
  radius: number;
  height: number;
  hp: number;
  maxHp: number;
  poise: number;
  maxPoise: number;
  alive: boolean;
  rig: Rig;
  marked: number;
  bleed: number;
  snared: number;
  staggered: number;
  contractTarget?: boolean;
  lockable: boolean;
  dmgTakenMul?: number;
  isInvulnerable(): boolean;
  hasHyperArmor(): boolean;
  onHit(h: HitInfo, result: HitResult): void;
}

export type HitResult = { landed: boolean; reason?: 'party' | 'iframes' | 'dead' | 'same-side'; staggered?: boolean; killed?: boolean; bleedBurst?: boolean };

const friendly = (f: Faction) => f === 'player' || f === 'party';

/** Hard rule: members of the player's contract party can never damage one another. */
export function canDamage(a: Faction, b: Faction): HitResult['reason'] | null {
  if (friendly(a) && friendly(b)) return 'party';
  if (a === 'hostile' && b === 'hostile') return 'same-side';
  return null;
}

let nextId = 1;
export const newId = () => nextId++;

export class CombatWorld {
  fighters: Combatant[] = [];
  listeners: ((ev: { type: string; a?: Combatant; b?: Combatant; res?: HitResult; info?: HitInfo }) => void)[] = [];

  add(c: Combatant) { this.fighters.push(c); }
  remove(c: Combatant) { this.fighters = this.fighters.filter((f) => f !== c); }
  emit(type: string, a?: Combatant, b?: Combatant, res?: HitResult, info?: HitInfo) { for (const l of this.listeners) l({ type, a, b, res, info }); }

  resolve(target: Combatant, h: HitInfo): HitResult {
    if (!target.alive) return { landed: false, reason: 'dead' };
    const block = canDamage(h.attacker.faction, target.faction);
    if (block) {
      const res: HitResult = { landed: false, reason: block };
      if (block === 'party') this.emit('party-block', h.attacker, target, res, h);
      return res;
    }
    if (target.isInvulnerable() && h.kind !== 'bleed') {
      const res: HitResult = { landed: false, reason: 'iframes' };
      this.emit('evade', h.attacker, target, res, h);
      return res;
    }
    let dmg = h.damage;
    if (target.marked > 0) dmg *= 1.25;
    if (target.staggered > 0) dmg *= 1.15;
    dmg *= target.dmgTakenMul ?? 1;
    target.hp = Math.max(0, target.hp - dmg);
    const res: HitResult = { landed: true };
    if (h.bleed) {
      target.bleed += h.bleed;
      if (target.bleed >= 100) {
        target.bleed = 0;
        const burst = Math.min(target.maxHp * 0.14, 90);
        target.hp = Math.max(0, target.hp - burst);
        res.bleedBurst = true;
      }
    }
    if (!target.hasHyperArmor() || h.poise >= target.maxPoise * 0.9) {
      target.poise -= h.poise;
      if (target.poise <= 0) { target.poise = target.maxPoise; res.staggered = true; }
    } else {
      target.poise -= h.poise * 0.3;
    }
    if (target.hp <= 0) { target.alive = false; res.killed = true; }
    target.onHit({ ...h, damage: dmg }, res);
    this.emit('hit', h.attacker, target, res, h);
    return res;
  }

  /** Arc/AOE sweep used by an active swing. `already` prevents multi-hits per swing. */
  sweep(attacker: Combatant, move: Move, already: Set<number>, extra: Partial<HitInfo> = {}, dmgMul = 1): Combatant[] {
    const out: Combatant[] = [];
    const fx = Math.sin(attacker.yaw), fz = Math.cos(attacker.yaw);
    for (const t of this.fighters) {
      if (t === attacker || !t.alive || already.has(t.id)) continue;
      const dx = t.pos.x - attacker.pos.x, dz = t.pos.z - attacker.pos.z;
      const dy = Math.abs(t.pos.y - attacker.pos.y);
      if (dy > 2.5) continue;
      const d = Math.hypot(dx, dz) - t.radius;
      if (d > move.range) continue;
      if (!move.aoe && d > 0.3) {
        const ang = Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / Math.max(1e-4, Math.hypot(dx, dz)))));
        if (ang > move.arc) continue;
      }
      already.add(t.id);
      const dir = new THREE.Vector3(dx, 0, dz).normalize();
      const res = this.resolve(t, { attacker, damage: move.damage * dmgMul, poise: move.poise * dmgMul, dir, kind: move.aoe ? 'aoe' : 'melee', ...extra });
      if (res.landed) out.push(t);
    }
    return out;
  }

  tickStatus(dt: number) {
    for (const f of this.fighters) {
      if (f.marked > 0) f.marked = Math.max(0, f.marked - dt);
      if (f.snared > 0) f.snared = Math.max(0, f.snared - dt);
      if (f.staggered > 0) f.staggered = Math.max(0, f.staggered - dt);
      if (f.bleed > 0) f.bleed = Math.max(0, f.bleed - dt * 6);
      // Poise regenerates when not being hit
      if (f.poise < f.maxPoise) f.poise = Math.min(f.maxPoise, f.poise + f.maxPoise * 0.25 * dt);
    }
  }
}
