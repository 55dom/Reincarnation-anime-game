// The reincarnated player: movement, combo state machine with cancels and input buffering,
// dodge / perfect dodge, block / parry, launchers & aerial combos, finishers, weapon switching,
// weapon trails & afterimages, stats, levels, skills and the ERROR / Reincarnator class.
import * as THREE from 'three';
import { Humanoid } from '../chars/humanoid.js';
import { Animator, CLIPS } from '../chars/anim.js';
import { buildMoves, SKILLS } from '../combat/moves.js';
import { WEAPONS, WEAPON_ORDER } from '../combat/weapons.js';
import { Input } from '../core/input.js';
import { Time } from '../core/time.js';
import { Audio } from '../core/audio.js';
import { FX } from '../render/fx.js';
import { clamp, damp, angleDiff, approachAngle } from '../core/util.js';
import { glowMat } from '../render/toon.js';

export const PLAYER_LOOK = {
  hair: 0x1e2236, hairStyle: 'spiky', eye: 0x49a6ff, top: 0x2c4372, bottom: 0x2c2c38, coat: 0x1d2a4a, scarf: 0xd2303c,
  accent: 0xe8e0c8, gloves: 0x2a2228, boots: 0x3a2a22, belt: 0x5a3a2a, ahoge: true, faceStyle: 'hero',
};
// The avatar the player used in "Eternal Realms" before death: endgame gold armor & white cape
export const AVATAR_LOOK = { ...PLAYER_LOOK, armor: 0xe8c45a, cape: 0xf4f4ff, capeTrim: 0xe8c45a, top: 0x2a2a4a, coat: null, scarf: null, hair: 0xf0f0ff, eye: 0xffd04a };

export const CLASSES = {
  ERROR: { name: 'ERROR', desc: '[CLASS DATA CORRUPTED] — The System cannot classify you.' },
  REINCARNATOR: { name: 'Reincarnator', desc: 'Hidden class. Absorbs class cores and fuses two of them.' },
};
export const CORES = {
  swordsman: { name: 'Swordsman', desc: '+10% sword damage. Base of every fusion.', color: 0x9fe8ff },
  mage: { name: 'Mage', desc: 'Arcane affinity. +20 max MP.', color: 0x9a7aff },
  priest: { name: 'Priest', desc: 'Holy affinity. Slow HP regeneration.', color: 0xffe08a },
  assassin: { name: 'Assassin', desc: 'Longer perfect-dodge window, +8% crit.', color: 0xb04aff },
  archer: { name: 'Archer', desc: 'Ranged instinct. Weapon skills fire extra projectiles.', color: 0x8ad86a },
  guardian: { name: 'Guardian', desc: '+25% defense; blocking costs nothing.', color: 0xd8a04a },
  beast: { name: 'Beast Tamer', desc: 'Spirit companions answer your call.', color: 0xff9a5a },
};
export const FUSIONS = {
  'swordsman+mage': { name: 'Spellblade', desc: 'Every 3rd hit releases an arcane wave. E: Arcane Arc storm.', special: 'spellblade' },
  'swordsman+priest': { name: 'Holy Knight', desc: 'Hits heal you slightly. E: Sanctuary — holy pillars + heal.', special: 'holy' },
  'assassin+mage': { name: 'Shadow Mage', desc: 'Dodges leave exploding shadow clones. E: homing shadow orbs.', special: 'shadow' },
  'archer+beast': { name: 'Beast Ranger', desc: 'A spirit wolf fights beside you. E: arrow rain.', special: 'ranger' },
  'swordsman+assassin': { name: 'Phantom Blade', desc: 'Crits +15%. E: teleport strike chain.', special: 'phantom' },
  'swordsman+guardian': { name: 'Bastion Knight', desc: 'Super armor on heavies, +20% defense. E: shockwave guard.', special: 'bastion' },
  'mage+priest': { name: 'Sage', desc: 'MP regenerates quickly. E: holy+arcane nova.', special: 'holy' },
  'swordsman+beast': { name: 'Wild Blade', desc: 'Faster attacks. E: spirit wolf pack.', special: 'ranger' },
  'archer+mage': { name: 'Arcane Archer', desc: 'E: a fan of homing arcane bolts.', special: 'spellblade' },
};
export function fusionKey(a, b) { return [a, b].sort().join('+'); }
// normalize keys so lookups don't depend on slot order
for (const k of Object.keys(FUSIONS)) { const n = fusionKey(...k.split('+')); if (n !== k) { FUSIONS[n] = FUSIONS[k]; delete FUSIONS[k]; } }

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

export class Player {
  constructor(G) {
    this.G = G;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.yaw = 0;
    this.radius = 0.42; this.height = 1.75;
    this.team = 'player'; this.alive = true;
    this.moves = buildMoves();
    this.level = 1; this.exp = 0; this.gold = 30; this.potions = 3; this.elixirs = 0;
    this.hp = 100; this.mp = 50; this.limit = 0;
    this.name = 'UNKNOWN';
    this.classId = 'ERROR'; this.cores = ['swordsman']; this.fusion = null;
    this.weapons = ['broken']; this.weaponId = 'broken';
    this.memorySync = 0;
    this.state = 'move'; this.stateT = 0;
    this.inAir = false; this.grounded = true; this.airDashUsed = false; this.coyote = 0;
    this.move = null; this.moveT = 0; this.hitsDone = 0; this.hitSets = []; this.landedHit = false;
    this.lock = null; this.counterWindow = 0; this.combo = 0; this.comboT = 0; this.bestCombo = 0;
    this.iframes = 0; this.dodgeT = -9; this.blockPressT = -9; this.armorT = 0;
    this.footT = 0; this.footSide = 0; this.regenT = 0; this.hitCounter = 0;
    this.controlEnabled = true; this.cinematic = false;
    this.afterimages = [];
    this.statsCache = null;
    this.buildModel(PLAYER_LOOK);
    this.trail = FX.trail({ length: 22, life: 0.14 });
    this.trailL = FX.trail({ length: 22, life: 0.14 });
    this.trailing = 0; this.prevTip = null;
    this.recalc();
  }

  buildModel(look) {
    if (this.char) this.G.scene.remove(this.char.root);
    this.look = look;
    this.char = new Humanoid(look);
    this.G.scene.add(this.char.root);
    this.anim = new Animator(this.char);
    this.anim.onSnap = () => { if (this.state === 'attack') this.smearT = 0.07; };
    this.anim.play('idle');
    if (this.weaponId && this.armed !== false) this.char.attachWeapon(this.weaponId);
    this.char.root.position.copy(this.pos);
  }
  setArmed(v) { this.armed = v; if (v) this.char.attachWeapon(this.weaponId); else this.char.detachWeapons(); }

  // ------------------------------------------------------------------ stats
  get weaponDef() { return WEAPONS[this.weaponId]; }
  get stats() { return this.statsCache; }
  recalc() {
    const L = this.level;
    const s = { maxHp: 100 + (L - 1) * 24, maxMp: 50 + (L - 1) * 6, atk: 10 + (L - 1) * 3.2, def: 5 + (L - 1) * 2, crit: 0.05, regen: 0, mpRegen: 0.8 };
    if (this.classId === 'REINCARNATOR') {
      const c = this.cores;
      if (c.includes('mage')) s.maxMp += 20;
      if (c.includes('guardian')) s.def *= 1.25;
      if (c.includes('assassin')) s.crit += 0.08;
      if (c.includes('priest')) s.regen += 0.6;
      if (c.includes('swordsman')) s.atk *= 1.1;
      const f = this.fusion && FUSIONS[this.fusion];
      if (f?.special === 'phantom') s.crit += 0.15;
      if (f?.special === 'bastion') s.def *= 1.2;
      if (this.fusion === 'mage+priest') s.mpRegen = 3;
    }
    if (this.G.flags?.charm) s.maxHp += 20;
    this.statsCache = s;
    this.hp = Math.min(this.hp, s.maxHp); this.mp = Math.min(this.mp, s.maxMp);
  }
  get maxHp() { return this.stats.maxHp; }
  get maxMp() { return this.stats.maxMp; }
  expToNext() { return Math.round(20 * Math.pow(this.level, 1.6) + 10); }
  hasSkill(id) { const s = SKILLS.find((k) => k.id === id); return !s || this.level >= s.lv || this.G.flags.allSkills; }
  dmgMult() { return this.fusion === 'beast+swordsman' ? 1.05 : 1; }
  speedMult() { return (this.fusion === 'beast+swordsman' ? 1.12 : 1); }

  gainExp(n) {
    this.exp += n;
    this.G.ui.toast(`+${n} EXP`);
    while (this.exp >= this.expToNext()) {
      this.exp -= this.expToNext(); this.level++;
      const before = SKILLS.filter((s) => s.lv <= this.level - 1).length;
      this.recalc(); this.hp = this.maxHp; this.mp = this.maxMp;
      this.G.ui.system(['[LEVEL UP]', `LEVEL ${this.level - 1} → ${this.level}`], { style: 'gold', sound: 'levelUp', time: 2.6 });
      FX.pillar(this.pos, { color: 0xffe08a, radius: 1.2, height: 14, dur: 1.2 });
      FX.glowBurst(_v.copy(this.pos).setY(this.pos.y + 1), { count: 30, color: [1, 0.9, 0.5], speed: 5, size: 0.5, up: 1 });
      const unlocked = SKILLS.filter((s) => s.lv === this.level);
      if (SKILLS.filter((s) => s.lv <= this.level).length > before) for (const s of unlocked) this.G.ui.system(['[SKILL ACQUIRED]', s.name.toUpperCase(), s.desc], { style: 'gold', time: 4 });
      this.G.story?.onLevel?.(this.level);
    }
  }
  heal(n, silent = false) {
    const before = this.hp; this.hp = Math.min(this.maxHp, this.hp + n);
    if (!silent && this.hp > before) this.G.ui.damage(_v.copy(this.pos).setY(this.pos.y + 1.8), '+' + Math.round(this.hp - before), 'heal');
  }

  // ------------------------------------------------------------------ weapons
  equip(id, fx = true) {
    if (!this.weapons.includes(id)) return;
    if (id === this.weaponId && this.char.weapon) return;
    this.weaponId = id;
    if (this.armed !== false) this.char.attachWeapon(id);
    const W = WEAPONS[id];
    this.trail.setColor(W.trail, W.core); this.trailL.setColor(W.trail, W.core);
    if (fx) {
      Audio.play('pickup'); Audio.play('swing', 0.6);
      FX.glowBurst(_v.copy(this.pos).setY(this.pos.y + 1.1), { count: 12, color: new THREE.Color(W.trail).toArray(), speed: 3, size: 0.4 });
      this.G.ui.toast(W.name);
    }
    this.G.ui.weapon(W.name);
  }
  giveWeapon(id) {
    if (!this.weapons.includes(id)) { this.weapons.push(id); this.weapons.sort((a, b) => WEAPON_ORDER.indexOf(a) - WEAPON_ORDER.indexOf(b)); }
    this.G.ui.system(['[ITEM ACQUIRED]', WEAPONS[id].name.toUpperCase(), WEAPONS[id].desc], { style: 'gold', sound: 'pickup', time: 3.5 });
    this.equip(id, false);
  }

  // ------------------------------------------------------------------ helpers
  forward(out = _v) { return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  inputDir() {
    const ix = Input.moveX, iy = Input.moveY;
    if (!this.controlEnabled || (Math.abs(ix) < 0.05 && Math.abs(iy) < 0.05)) return null;
    const cy = this.G.cam.yaw;
    const fx = -Math.sin(cy), fz = -Math.cos(cy), rx = Math.cos(cy), rz = -Math.sin(cy);
    const d = new THREE.Vector3(fx * iy + rx * ix, 0, fz * iy + rz * ix);
    const l = d.length(); if (l > 1) d.divideScalar(l);
    return d;
  }
  /** Choose a target to face when attacking. */
  acquireTarget(maxDist = 7) {
    if (this.lock?.alive) return this.lock;
    const dir = this.inputDir();
    const fy = dir ? Math.atan2(dir.x, dir.z) : this.yaw;
    let best = null, bs = 1e9;
    for (const e of this.G.enemies) {
      if (!e.alive || e.untargetable) continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z; const d = Math.hypot(dx, dz);
      if (d > maxDist + (e.radius || 0) || Math.abs(e.pos.y - this.pos.y) > 6) continue;
      const a = Math.abs(angleDiff(fy, Math.atan2(dx, dz)));
      if (a > 1.4 && d > 2.2) continue;
      const score = d + a * 3;
      if (score < bs) { bs = score; best = e; }
    }
    return best;
  }
  faceTarget(t, instant = true) {
    if (!t) { const d = this.inputDir(); if (d) this.yaw = Math.atan2(d.x, d.z); return; }
    const a = Math.atan2(t.pos.x - this.pos.x, t.pos.z - this.pos.z);
    this.yaw = instant ? a : approachAngle(this.yaw, a, 0.3);
  }

  // ------------------------------------------------------------------ actions
  startMove(id) {
    const m = this.moves[id]; if (!m) return false;
    if (m.mp && this.mp < m.mp) { this.G.ui.toast('Not enough MP'); return false; }
    if (m.skill && !this.hasSkill(m.skill)) return false;
    if (m.mp) this.mp -= m.mp;
    if (m.hpCost) { this.hp = Math.max(1, this.hp - this.maxHp * m.hpCost); FX.glowBurst(_v.copy(this.pos).setY(this.pos.y + 1), { count: 14, color: [0.6, 0.1, 0.9], speed: 3 }); }
    this.state = 'attack'; this.move = m; this.moveT = 0; this.hitsDone = 0; this.hitSets = m.hits.map(() => new Set()); this.landedHit = false; this.slamPending = false;
    this.target = m.pursuit ? (this.launchTarget || this.acquireTarget(12)) : this.acquireTarget(m.passThrough ? 10 : 7);
    this.faceTarget(this.target);
    const spd = this.weaponDef.speed * this.speedMult();
    this.moveSpeed = spd;
    if (m.clip) this.anim.play('mv_' + id, { clip: m.clip, speed: spd, blend: 0.04, restart: true });
    this.trailing = 1;
    if (m.voice != null && (Math.random() < 0.55 || m.big)) Audio.say(m.big ? 'big' : 'attack', 'hero', m.voice);
    if (m.armor) this.armorT = m.armor;
    if (m.invuln) this.iframes = (m.clip ? m.clip.keys[m.clip.keys.length - 1][0] : 1) / spd;
    if (m.charge) { Audio.play('charge'); FX.glowBurst(_v.copy(this.pos).setY(this.pos.y + 1.1), { count: 20, color: new THREE.Color(this.weaponDef.trail).toArray(), speed: -3, size: 0.4, life: 0.4 }); this.G.cam.punch(0.8); }
    if (m.pursuit) this.doPursuit();
    if (m.air && !this.inAir && !m.pursuit) { this.vel.y = 4; this.inAir = true; }
    if (m.air && !m.pursuit && !m.slam && this.target?.alive && this.target.state === 'air') {
      // air attacks home in on the juggled enemy so aerial combos connect reliably
      const t = this.target; const dx = t.pos.x - this.pos.x, dz = t.pos.z - this.pos.z, dy = t.pos.y + (t.height || 1.4) * 0.3 - this.pos.y;
      const d = Math.hypot(dx, dz);
      if (d > 1.6 || Math.abs(dy) > 1) { const T = 0.12; this.vel.set(dx / d * Math.max(0, d - 1.3) / T, dy / T, dz / d * Math.max(0, d - 1.3) / T); this.vel.clampLength(0, 30); }
    }
    if (m.ultimate) this.G.story.ultimateCinematic(this);
    if (m.finisher) this.G.story.finisherCinematic(this, this.finishTarget);
    if (m.afterimage) { this.afterimageBurst(3); this.G.post.blur(0.6); FX.speedLines(0.5, 0.2); }
    if (m.slowmo) Time.slowMo(0.4, 0.4);
    if (m.slam) this.vel.y = 5;
    this.char.setExpression(m.big ? 'shout' : 'angry', 0.6);
    return true;
  }
  doPursuit() {
    const t = this.target;
    this.inAir = true; this.grounded = false;
    Audio.play('dash'); FX.speedLines(0.7, 0.25); this.afterimageBurst(2); this.G.post.blur(0.5);
    FX.dustAt(this.pos, { count: 10, speed: 5 });
    if (t && t.alive) {
      const tp = _v.copy(t.pos); tp.y += (t.height || 1.4) * 0.3;
      const dir = _v2.subVectors(tp, this.pos); const d = Math.max(0.1, Math.hypot(dir.x, dir.z) - 1.4);
      const hz = Math.atan2(dir.x, dir.z); this.yaw = hz;
      const T = 0.24;
      this.vel.set(Math.sin(hz) * d / T, (tp.y - this.pos.y) / T + 0.5 * 28 * T * 0.2, Math.cos(hz) * d / T);
      this.vel.y = clamp(this.vel.y, 4, 34);
    } else this.vel.y = 13;
  }
  startDodge() {
    const dir = this.inputDir();
    const d = dir ? dir.clone().normalize() : this.forward(new THREE.Vector3()).negate();
    this.dodgeDir = d; this.yaw = dir ? Math.atan2(d.x, d.z) : this.yaw;
    this.state = 'dodge'; this.stateT = 0; this.dodgeT = Time.game;
    const assassin = this.classId === 'REINCARNATOR' && this.cores.includes('assassin');
    this.iframes = assassin ? 0.36 : 0.3;
    this.anim.play(this.inAir ? 'dash' : 'dodge', { restart: true, blend: 0.02 });
    Audio.play('dodge'); FX.dustAt(this.pos, { count: 6, speed: 3, size: 0.6 }); this.G.post.blur(0.35);
    this.afterimageBurst(2, 0x5fd8ff);
    if (this.inAir) { this.airDashUsed = true; this.vel.y = 2; }
    if (this.fusion === 'assassin+mage') this.G.story.shadowClone?.(this);
    this.move = null; this.trailing = 0.3;
  }

  receiveHit({ dmg, dir, atk, from }) {
    if (!this.alive) return 'miss';
    if (this.iframes > 0) {
      if (this.state === 'dodge' && Time.game - this.dodgeT < 0.26 && !atk.projectile) {
        this.counterWindow = 1.2; this.perfectT = Time.real;
        this.G.story.onPerfectDodge?.(from);
        return 'perfectDodge';
      }
      return 'dodged';
    }
    const facing = Math.abs(angleDiff(this.yaw, Math.atan2(-dir.x, -dir.z))) < 1.9;
    const parryWin = Time.real - this.blockPressT < 0.2;
    if (facing && !atk.unblockable && (this.state === 'block' || parryWin) && this.controlEnabled) {
      if (parryWin && this.hasSkill('parry')) {
        this.anim.play('parry', { restart: true }); this.state = 'parry'; this.stateT = 0; this.counterWindow = 1.3;
        this.limit = Math.min(100, this.limit + 8); this.char.setExpression('determined', 1);
        this.G.story.onParry?.(from);
        return 'parried';
      }
      if (this.state === 'block') {
        const guardian = this.classId === 'REINCARNATOR' && this.cores.includes('guardian');
        this.hp -= dmg * (guardian ? 0.1 : 0.25); this.lastDamage = dmg * 0.25;
        this.anim.play('blockHit', { restart: true }); this.vel.addScaledVector(dir, atk.heavy ? 6 : 3);
        if (this.hp <= 0) this.die();
        return 'blocked';
      }
    }
    if (this.armorT > 0 && !atk.heavy) { this.hp -= dmg * 0.6; this.lastDamage = dmg * 0.6; this.char.setExpression('pain', 0.4); if (this.hp <= 0) this.die(); return 'hit'; }
    this.hp -= dmg; this.lastDamage = dmg;
    this.limit = Math.min(100, this.limit + 4);
    this.combo = 0; this.G.ui.combo(0);
    this.char.setExpression('pain', 0.8);
    Audio.say('hurt', 'hero');
    if (this.hp <= 0) { this.die(); return 'hit'; }
    this.move = null; this.trailing = 0;
    if (atk.heavy || atk.launch) {
      this.state = 'knockdown'; this.stateT = 0; this.anim.play('knockdown', { restart: true });
      this.vel.set(dir.x * 9, atk.launch ? atk.launch : 5, dir.z * 9); this.inAir = true; this.iframes = 1.1;
    } else {
      this.state = 'hit'; this.stateT = 0; this.anim.play(Math.random() < 0.5 ? 'hit' : 'hit2', { restart: true });
      this.vel.addScaledVector(dir, 5); this.iframes = 0.25;
    }
    return 'hit';
  }
  die() {
    if (!this.alive) return;
    if (this.G.flags.cannotDie) { this.hp = 1; return; }
    this.hp = 0; this.alive = false; this.state = 'dead'; this.anim.play('death', { restart: true });
    this.char.setExpression('dead'); Audio.say('hurt', 'hero'); Time.slowMo(1.5, 0.3);
    this.G.onPlayerDeath();
  }
  revive() { this.alive = true; this.hp = this.maxHp; this.mp = this.maxMp; this.state = 'move'; this.anim.play('idle', { restart: true }); this.char.setExpression('neutral'); this.vel.set(0, 0, 0); }

  onHitLanded(t, dmg, hit, crit) {
    this.landedHit = true; this.lastHitT = this.moveT;
    this.combo++; this.comboT = 2.6; this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.G.ui.combo(this.combo);
    this.limit = Math.min(100, this.limit + (hit.pow || 1) * 2.2);
    this.mp = Math.min(this.maxMp, this.mp + 0.8);
    this.hitCounter++;
    const f = this.fusion && FUSIONS[this.fusion];
    if (f?.special === 'spellblade' && this.hitCounter % 3 === 0) this.fireArc(1, 0.9);
    if (f?.special === 'holy') this.heal(dmg * 0.04, true);
    if (hit.launch && this.move?.launcher) { this.launchTarget = t; this.pursuitWindow = 0.9; }
    void crit;
  }
  fireArc(count = 3, dmgMult = 1.6, color = 0x6fd8ff) {
    const W = this.weaponDef;
    for (let i = 0; i < count; i++) {
      const a = this.yaw + (i - (count - 1) / 2) * 0.22;
      const geo = new THREE.RingGeometry(0.6, 1.1, 16, 1, -1.1, 2.2); geo.rotateX(-Math.PI / 2); geo.rotateY(Math.PI / 2);
      const mesh = new THREE.Mesh(geo, glowMat(color, 0.85));
      mesh.rotation.y = a;
      const pos = this.pos.clone(); pos.y += 1.1;
      this.G.combat.spawnProjectile({ pos, vel: new THREE.Vector3(Math.sin(a), 0, Math.cos(a)).multiplyScalar(30), mesh, team: 'player', dmg: this.stats.atk * W.dmg * dmgMult, radius: 1.0, life: 0.8, pierce: true, ghost: true, color, trailColor: color });
    }
    Audio.play('magic', 'arcane');
  }

  // ------------------------------------------------------------------ afterimages
  afterimageBurst(n = 3, color = 0x7fd8ff) {
    for (let i = 0; i < n; i++) setTimeout(() => this.spawnAfterimage(color), i * 45);
  }
  spawnAfterimage(color = 0x7fd8ff) {
    if (!this.char) return;
    const ghost = this.char.root.clone(true);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
    ghost.traverse((o) => { if (o.isMesh) { o.material = o.userData.isOutline ? mat : mat; o.castShadow = false; } });
    this.G.scene.add(ghost);
    this.afterimages.push({ g: ghost, t: 0, mat });
  }

  // ------------------------------------------------------------------ update
  update(dt) {
    const G = this.G;
    if (!this.alive) { this.physics(dt); this.anim.update(dt); this.syncModel(dt); return; }
    this.stateT += dt;
    this.iframes = Math.max(0, this.iframes - dt);
    this.armorT = Math.max(0, this.armorT - dt);
    this.counterWindow = Math.max(0, this.counterWindow - dt);
    this.pursuitWindow = Math.max(0, (this.pursuitWindow || 0) - dt);
    if (this.comboT > 0) { this.comboT -= dt; if (this.comboT <= 0) { this.combo = 0; G.ui.combo(0); } }
    // regen
    const s = this.stats;
    this.mp = Math.min(this.maxMp, this.mp + s.mpRegen * dt);
    if (s.regen) this.hp = Math.min(this.maxHp, this.hp + s.regen * dt);
    if (this.controlEnabled && !this.cinematic) this.handleInput(dt);
    this.updateState(dt);
    this.physics(dt);
    this.anim.update(dt);
    this.syncModel(dt);
    this.updateTrail();
    for (let i = this.afterimages.length - 1; i >= 0; i--) {
      const a = this.afterimages[i]; a.t += Time.rdt; a.mat.opacity = 0.45 * (1 - a.t / 0.35);
      if (a.t > 0.35) { G.scene.remove(a.g); this.afterimages.splice(i, 1); }
    }
  }

  handleInput() {
    const G = this.G;
    if (Input.pressed('block')) this.blockPressT = Time.real;
    // lock-on toggle
    if (Input.pressed('lock')) {
      if (this.lock) { this.lock = null; }
      else { this.lock = this.acquireTarget(25); }
      G.cam.lock = this.lock;
      Audio.play('ui');
    }
    if (this.lock && !this.lock.alive) { this.lock = this.acquireTarget(20); G.cam.lock = this.lock; }
    // weapon switching (allowed mid-combo: switch-cancel)
    const slots = this.weapons;
    for (let i = 1; i <= 6; i++) if (Input.pressed('w' + i) && i - 1 < slots.length) this.equip(slots[i - 1]);
    if (Input.pressed('wnext') || Input.pressed('wprev')) {
      const i = slots.indexOf(this.weaponId); const n = slots.length;
      this.equip(slots[(i + (Input.pressed('wnext') ? 1 : n - 1)) % n]);
    }
    // potions
    if (Input.pressed('confirm') && this.state === 'move' && this.potions > 0 && this.hp < this.maxHp) {
      this.potions--; this.heal(this.maxHp * 0.45); Audio.play('magic', 'holy'); FX.glowBurst(_v.copy(this.pos).setY(this.pos.y + 1), { count: 16, color: [0.4, 1, 0.6], speed: 3, up: 1 });
      G.ui.toast(`Potion used (${this.potions} left)`);
    }
  }

  canAct() { return this.state === 'move' || this.state === 'land'; }

  updateState(dt) {
    const G = this.G;
    const ctl = this.controlEnabled && !this.cinematic;
    switch (this.state) {
      case 'move': case 'land': {
        if (this.state === 'land' && this.stateT > 0.12) this.state = 'move';
        if (!ctl) { this.vel.x = damp(this.vel.x, 0, 10, dt); this.vel.z = damp(this.vel.z, 0, 10, dt); if (!this.inAir && (this.anim.name === 'runSword' || this.anim.name === 'run' || this.anim.name === 'walk')) this.anim.play(this.armed === false ? 'idle' : 'guard'); break; }
        // finisher
        const fin = this.finisherCandidate();
        if (fin && Input.pressed('interact')) { this.finishTarget = fin; this.startMove('finisher'); break; }
        if (!fin && Input.pressed('interact')) G.tryInteract();
        if (this.pursuitWindow > 0 && this.launchTarget?.alive && this.launchTarget.state === 'air' && this.hasSkill('aerial') && (Input.peekBuffered('dodge', 0.3) || Input.peekBuffered('jump', 0.3))) { Input.consume('dodge'); Input.consume('jump'); this.pursuitWindow = 0; this.startMove('pursuit'); break; }
        if (Input.buffered('dodge', 0.15)) {
          if (!this.inAir || !this.airDashUsed) { this.startDodge(); break; }
        }
        if (Input.buffered('jump', 0.12) && (!this.inAir || this.coyote > 0)) { this.jump(); break; }
        if (this.armed === false) { Input.consume('light'); Input.consume('heavy'); Input.consume('special'); Input.consume('ultimate'); }
        if (Input.buffered('ultimate', 0.2)) { if (this.limit >= 100 && this.hasSkill('ultimate')) { this.limit = 0; this.startMove('ultimate'); break; } else if (!this.hasSkill('ultimate')) G.ui.toast('Ultimate locked (Lv 10)'); else G.ui.toast('LIMIT not full'); }
        if (Input.buffered('special', 0.2)) { this.useSpecial(); if (this.state === 'attack') break; }
        if (Input.buffered('light', 0.2)) {
          const sinceDodge = Time.game - this.dodgeT;
          if (this.counterWindow > 0 && this.hasSkill('counter')) { this.counterWindow = 0; this.startMove('counter'); }
          else if (this.inAir && this.hasSkill('aerial')) this.startMove('a1');
          else if (sinceDodge < 0.55 && this.hasSkill('dash')) this.startMove('dashSlash');
          else if (!this.inAir) this.startMove('l1');
          break;
        }
        if (Input.buffered('heavy', 0.2)) {
          if (this.inAir && this.hasSkill('aerial')) this.startMove('slam');
          else if (!this.inAir) { if (!this.startMove('heavy')) this.startMove('l1'); }
          break;
        }
        if (Input.isHeld('block') && !this.inAir) { this.state = 'block'; this.stateT = 0; this.anim.play('block', { blend: 0.05 }); Audio.play('swing', 0.3); break; }
        this.locomotion(dt);
        break;
      }
      case 'block': {
        this.vel.x = damp(this.vel.x, 0, 10, dt); this.vel.z = damp(this.vel.z, 0, 10, dt);
        const d = this.inputDir();
        if (d) { this.vel.x = d.x * 2; this.vel.z = d.z * 2; }
        if (this.lock?.alive) this.faceTarget(this.lock, false);
        else if (d) this.yaw = approachAngle(this.yaw, G.cam.yaw + Math.PI, dt * 8);
        if (!Input.isHeld('block') || !ctl) { this.state = 'move'; this.anim.play(this.armed === false ? 'idle' : 'guard'); }
        if (Input.buffered('dodge', 0.12)) this.startDodge();
        if (Input.buffered('light', 0.15) && this.counterWindow > 0 && this.hasSkill('counter')) { this.counterWindow = 0; this.startMove('counter'); }
        break;
      }
      case 'parry': {
        this.vel.x = damp(this.vel.x, 0, 12, dt); this.vel.z = damp(this.vel.z, 0, 12, dt);
        if (Input.buffered('light', 0.3) && this.hasSkill('counter')) { this.counterWindow = 0; this.startMove('counter'); break; }
        if (this.stateT > 0.35) { this.state = Input.isHeld('block') ? 'block' : 'move'; if (this.state === 'block') this.anim.play('block'); }
        break;
      }
      case 'dodge': {
        const k = this.stateT;
        const sp = (this.inAir ? 18 : 15) * Math.max(0, 1 - k / 0.36) + 1;
        this.vel.x = this.dodgeDir.x * sp; this.vel.z = this.dodgeDir.z * sp;
        if (this.inAir) this.vel.y = Math.max(this.vel.y, 0);
        if (k < 0.2 && Math.random() < 0.5) FX.dustAt(this.pos, { count: 1, speed: 1, size: 0.5 });
        if (k > 0.08 && ctl && Input.peekBuffered('light', 0.2) && this.counterWindow > 0 && this.hasSkill('counter')) { Input.consume('light'); this.counterWindow = 0; this.startMove('counter'); break; }
        if (k > 0.3) { this.state = 'move'; if (ctl && Input.peekBuffered('light', 0.25) && this.hasSkill('dash')) { Input.consume('light'); this.startMove(this.counterWindow > 0 && this.hasSkill('counter') ? 'counter' : 'dashSlash'); } }
        break;
      }
      case 'attack': this.updateAttack(dt, ctl); break;
      case 'hit': {
        this.vel.x = damp(this.vel.x, 0, 8, dt); this.vel.z = damp(this.vel.z, 0, 8, dt);
        if (this.stateT > 0.35) this.state = 'move';
        else if (this.stateT > 0.2 && ctl && Input.buffered('dodge', 0.1)) this.startDodge(); // recovery cancel
        break;
      }
      case 'knockdown': {
        if (this.grounded) { this.vel.x = damp(this.vel.x, 0, 6, dt); this.vel.z = damp(this.vel.z, 0, 6, dt); }
        if (this.stateT > 0.9 && this.grounded) { this.state = 'getup'; this.stateT = 0; this.anim.play('getup', { restart: true }); this.iframes = 0.8; }
        break;
      }
      case 'getup': if (this.stateT > 0.75) this.state = 'move'; break;
      case 'scripted': break;
    }
  }

  locomotion(dt) {
    const d = this.inputDir();
    const armed = this.armed !== false;
    const speed = (this.G.flags.walkOnly ? 3.2 : 8.2) * this.speedMult();
    if (d) {
      const mag = Math.min(1, d.length());
      const tv = d.clone().normalize().multiplyScalar(speed * mag);
      const acc = this.inAir ? 5 : 14;
      this.vel.x = damp(this.vel.x, tv.x, acc, dt); this.vel.z = damp(this.vel.z, tv.z, acc, dt);
      if (this.lock?.alive && !this.inAir) this.faceTarget(this.lock, false);
      else this.yaw = approachAngle(this.yaw, Math.atan2(d.x, d.z), dt * 14);
      if (!this.inAir) {
        const walk = mag < 0.5 || this.G.flags.walkOnly;
        this.anim.play(walk ? 'walk' : (armed ? 'runSword' : 'run'), { speed: walk ? 1 : 1.05 * this.speedMult() });
        this.footT -= dt * (walk ? 0.7 : 1);
        if (this.footT <= 0) {
          this.footT = walk ? 0.5 : 0.3; this.footSide ^= 1;
          Audio.play('step', this.G.world.surface(this.pos));
          if (!walk && Math.random() < 0.6) FX.dustAt(this.pos, { count: 1, speed: 0.8, size: 0.45, life: 0.5, color: this.dustColor() });
        }
      }
    } else {
      this.vel.x = damp(this.vel.x, 0, this.inAir ? 2 : 12, dt); this.vel.z = damp(this.vel.z, 0, this.inAir ? 2 : 12, dt);
      if (!this.inAir) this.anim.play(armed && (this.G.inCombat || this.lock) ? 'guard' : 'idle', { blend: 0.12 });
      if (this.lock?.alive) this.faceTarget(this.lock, false);
    }
    if (this.inAir) this.anim.play(this.vel.y > 1 ? 'jump' : 'fall', { blend: 0.08 });
  }
  dustColor() { const s = this.G.world.surface(this.pos); return s === 'sand' ? [0.9, 0.78, 0.55] : s === 'snow' ? [0.95, 0.97, 1] : s === 'demon' ? [0.35, 0.25, 0.3] : [0.72, 0.66, 0.55]; }
  jump() {
    this.vel.y = 10.5; this.inAir = true; this.grounded = false; this.coyote = 0;
    this.anim.play('jump', { restart: true }); Audio.play('jump'); Audio.say('effort', 'hero');
    FX.dustAt(this.pos, { count: 5, speed: 2.5, color: this.dustColor() });
  }

  updateAttack(dt, ctl) {
    const m = this.move; const G = this.G;
    const spd = this.moveSpeed;
    const prevT = this.moveT;
    this.moveT += dt * spd;
    const t = this.moveT;
    // forward lunges / tracking
    if (m.lunge) {
      let moving = false;
      for (const [a, b, s] of m.lunge) if (t >= a && t <= b) {
        moving = true;
        let sp = s;
        if (this.target?.alive && !m.passThrough) {
          const d = Math.hypot(this.target.pos.x - this.pos.x, this.target.pos.z - this.pos.z) - (this.target.radius || 0.5) - 0.9;
          const nextHit = m.hits[this.hitsDone]?.at;
          const arrive = nextHit != null && nextHit > t + 0.02 ? Math.min(b, nextHit - 0.01) : b;
          sp = d <= 0 ? 0 : Math.min(s * 1.6, d / Math.max(0.01, (arrive - t) / spd));
          this.faceTarget(this.target, false);
        }
        this.forward(_v); this.vel.x = _v.x * sp; this.vel.z = _v.z * sp;
        if (m.passThrough && Math.random() < 0.6) FX.dustAt(this.pos, { count: 1, speed: 1, size: 0.6, color: this.dustColor() });
      }
      if (!moving && !this.inAir) { this.vel.x = damp(this.vel.x, 0, 14, dt); this.vel.z = damp(this.vel.z, 0, 14, dt); }
    } else if (!this.inAir) { this.vel.x = damp(this.vel.x, 0, 14, dt); this.vel.z = damp(this.vel.z, 0, 14, dt); }
    else if (m.air && !m.pursuit) { this.vel.x = damp(this.vel.x, 0, 6, dt); this.vel.z = damp(this.vel.z, 0, 6, dt); }
    if (m.hop && prevT < m.hop[0] && t >= m.hop[0]) { this.vel.y = m.hop[1]; this.inAir = true; this.grounded = false; }
    if (m.spin) this.yaw += dt * 22;
    // slam descends hard
    if (m.slam && m.hits[0] && t >= m.hits[0].at - 0.06 && this.inAir) { this.vel.y = -42; this.vel.x *= 0.5; this.vel.z *= 0.5; }
    // projectile skills
    if (m.projectile && prevT < m.projectile.at && t >= m.projectile.at) {
      const archer = this.cores.includes('archer') && this.classId === 'REINCARNATOR';
      this.fireArc(m.projectile.count + (archer ? 2 : 0), m.projectile.dmg, m.projectile.color);
      G.cam.shake(0.2); FX.speedLines(0.4, 0.2);
    }
    // hits
    for (let i = 0; i < m.hits.length; i++) {
      const hd = m.hits[i];
      if (this.hitsDone > i) continue;
      if (t < hd.at) break;
      if (m.slam && this.inAir && !this.grounded && t < hd.at + 1.2) break; // wait for ground contact
      this.hitsDone = i + 1;
      G.combat.slashFX(this, hd, this.weaponDef);
      Audio.play('swing', hd.pow);
      if (hd.slash && this.weaponDef.kind === 'dual') G.combat.slashFX(this, { ...hd, slash: { ...hd.slash, roll: -(hd.slash.roll || 0), flip: !hd.slash.flip } }, this.weaponDef);
      if (m.slam || hd.quake) { this.landImpact(hd.pow); }
      const n = G.combat.playerHit(this, m, hd, this.hitSets[i]);
      if (n === 0 && hd.pow >= 1.5) G.cam.shake(0.08);
      if (this.weaponDef.magic && n > 0 && Math.random() < 0.35) this.fireArc(1, 0.6);
      if (hd.multi) this.multiPending = { i, until: hd.at + 0.15 };
    }
    // multi-target sweep for pass-through moves
    if (this.multiPending && t < this.multiPending.until) G.combat.playerHit(this, m, m.hits[this.multiPending.i], this.hitSets[this.multiPending.i]);
    // air hover
    if (m.air && !m.slam && !m.pursuit && this.inAir) this.vel.y = damp(this.vel.y, t < 0.15 ? 1.5 : -0.6, 10, dt);
    if (m.pursuit && t > 0.22) { this.vel.x *= 0.85; this.vel.z *= 0.85; this.vel.y = Math.min(this.vel.y, 2); }
    // cancels & chaining
    if (ctl) {
      const canChain = t >= m.cancel;
      const canDodge = t >= m.dodgeCancel || (this.landedHit && t > (this.lastHitT || 0) + 0.04);
      if (this.pursuitWindow > 0 && m.launcher && this.launchTarget?.alive && this.hasSkill('aerial') && (Input.peekBuffered('dodge', 0.3) || Input.peekBuffered('jump', 0.3))) { Input.consume('dodge'); Input.consume('jump'); this.pursuitWindow = 0; this.startMove('pursuit'); return; }
      if (canDodge && Input.peekBuffered('dodge', 0.18)) {
        Input.consume('dodge');
        if (m.next?.dodge && this.landedHit && this.launchTarget?.alive && this.hasSkill('aerial')) { this.startMove(m.next.dodge); return; }
        if (!this.inAir || !this.airDashUsed) { this.startDodge(); return; }
      }
      if (canChain && m.next?.jump && Input.peekBuffered('jump', 0.18) && this.landedHit && this.launchTarget?.alive && this.hasSkill('aerial')) { Input.consume('jump'); this.startMove(m.next.jump); return; }
      if (canChain && Input.peekBuffered('special', 0.25)) { Input.consume('special'); if (this.useSpecial()) return; }
      if (canChain && Input.peekBuffered('ultimate', 0.25) && this.limit >= 100 && this.hasSkill('ultimate')) { Input.consume('ultimate'); this.limit = 0; this.startMove('ultimate'); return; }
      // combo queue: when both attack buttons are buffered, honor the one pressed first
      const BUF = 0.45;
      const lightQ = Input.peekBuffered('light', BUF), heavyQ = Input.peekBuffered('heavy', BUF);
      const heavyFirst = heavyQ && (!lightQ || Input.pressedAt.heavy < Input.pressedAt.light);
      if (canChain && lightQ && !heavyFirst) {
        let nx = m.next?.light;
        if (this.counterWindow > 0 && this.hasSkill('counter') && !m.air) nx = 'counter';
        if (this.inAir && !(nx || '').startsWith('a') && this.hasSkill('aerial')) nx = 'a1';
        if (nx && this.moves[nx] && (!this.moves[nx].skill || this.hasSkill(this.moves[nx].skill))) { Input.consume('light'); this.startMove(nx); return; }
      }
      if (canChain && heavyQ) {
        let nx = m.next?.heavy;
        if (nx === 'rise' && !this.hasSkill('rise')) nx = 'heavy';
        if (this.inAir && this.hasSkill('aerial')) nx = 'slam';
        if (nx && this.moves[nx] && this.hasSkill(this.moves[nx].skill)) { Input.consume('heavy'); this.startMove(nx); return; }
      }
    }
    const dur = m.clip ? m.clip.keys[m.clip.keys.length - 1][0] : 0.5;
    if (t >= dur && !(m.slam && this.inAir && this.hitsDone < m.hits.length)) {
      this.state = 'move'; this.move = null; this.multiPending = null;
      this.trailing = 0.15;
      if (this.armed !== false) this.anim.play(this.inAir ? 'fall' : 'guard', { blend: 0.1 });
    }
  }

  useSpecial() {
    if (!this.hasSkill('skill')) { this.G.ui.toast('Weapon Skill locked (Lv 8)'); return false; }
    if (this.inAir && this.move?.air) return this.startMove('skyfall');
    const f = this.fusion && FUSIONS[this.fusion];
    if (f && this.classId === 'REINCARNATOR') {
      if (this.mp < 20) { this.G.ui.toast('Not enough MP'); return false; }
      return this.G.story.fusionSpecial(this, f.special);
    }
    return this.startMove(this.weaponDef.special);
  }

  landImpact(pow = 2) {
    const G = this.G;
    FX.ring(this.pos, { color: this.weaponDef.trail, from: 0.5, to: 5 + pow * 1.5, dur: 0.4 });
    FX.ring(this.pos, { color: 0xffffff, from: 0.3, to: 3 + pow, dur: 0.25 });
    FX.dustAt(this.pos, { count: 18, speed: 7, size: 1, color: this.dustColor() });
    FX.debrisAt(this.pos, { count: 10 + pow * 4, color: 0x7a6a55, speed: 8 });
    G.cam.shake(0.5); Audio.play('explosion', 0.6 + pow * 0.2);
  }

  finisherCandidate() {
    for (const e of this.G.enemies) {
      if (!e.alive || e.state !== 'stagger') continue;
      if (e.pos.distanceTo(this.pos) < 3.2 + (e.radius || 0.5)) return e;
    }
    return null;
  }

  physics(dt) {
    const G = this.G; const w = G.world;
    // gravity
    let grav = 28;
    if (this.state === 'attack' && this.move?.air && !this.move.slam) grav *= this.move.gravity ?? 0.1;
    if (this.state === 'dodge' && this.inAir) grav *= 0.15;
    if (this.state === 'scripted') grav = this.scriptGravity ?? 28;
    this.vel.y -= grav * dt;
    if (this.vel.y < -45) this.vel.y = -45;
    const prevY = this.pos.y;
    this.pos.addScaledVector(this.vel, dt);
    w.resolve(this.pos, this.radius);
    const gy = w.groundAt(this.pos.x, this.pos.z, Math.max(prevY, this.pos.y));
    if (this.pos.y <= gy + 0.001) {
      const fallSpeed = -this.vel.y;
      this.pos.y = gy;
      if (this.inAir) {
        this.inAir = false; this.airDashUsed = false;
        if (fallSpeed > 9 && this.state === 'move') { this.state = 'land'; this.stateT = 0; this.anim.play('land', { restart: true }); Audio.play('land', Math.min(2, fallSpeed / 12)); FX.dustAt(this.pos, { count: 8, speed: 3.5, color: this.dustColor() }); }
        else if (this.state === 'move') Audio.play('land', 0.5);
        if (fallSpeed > 26 && this.state === 'move') G.cam.shake(0.2);
      }
      this.vel.y = Math.max(0, this.vel.y);
      this.grounded = true; this.coyote = 0.12;
    } else {
      // walking off ledges → air after coyote time
      if (this.grounded && this.pos.y - gy < 0.6 && this.vel.y <= 0 && this.state !== 'dodge') { this.pos.y = gy; this.vel.y = 0; }
      else { this.grounded = false; this.inAir = true; this.coyote -= dt; }
    }
    // water: shallow wading slows
    if (this.pos.y < -0.3 && !w.interior) { this.vel.x *= 0.92; this.vel.z *= 0.92; }
    // fell into the void (islands)
    if (this.pos.y < -30) G.respawnFromFall?.();
  }

  syncModel(dt) {
    const r = this.char.root;
    r.position.copy(this.pos);
    // characters turn on stepped frames during attacks (choppy anime turn), smooth otherwise
    const target = this.yaw;
    if (this.state === 'attack' || this.state === 'dodge') r.rotation.y = target;
    else r.rotation.y = target - angleDiff(target, r.rotation.y) * Math.exp(-dt * 25);
    this.char.updateSecondary(dt, this.vel, 0);
    // squash & stretch on jumps / landings (model only)
    const m = this.char.model;
    let sy = 1;
    if (this.inAir) sy = clamp(1 + this.vel.y * 0.006, 0.92, 1.08);
    if (this.state === 'land') sy = 0.88;
    m.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
    // smear frame: stretch along the facing for a couple of frames when an attack snaps to its impact pose
    if (this.smearT > 0) { this.smearT -= Time.rdt; m.scale.set(0.88, 0.96, 1.35); }
  }

  updateTrail() {
    const W = this.char.weapon;
    if (!W) return;
    this.trailing = Math.max(0, this.trailing - Time.dt);
    const active = this.state === 'attack' || this.trailing > 0;
    if (!active) { this.prevTip = null; return; }
    const pushArc = (wp, trail, key) => {
      const base = wp.base.getWorldPosition(new THREE.Vector3());
      const tip = wp.tip.getWorldPosition(new THREE.Vector3());
      // extend the visual trail beyond the blade a little (anime smear)
      const dir = _v3.subVectors(tip, base); tip.addScaledVector(dir, 0.25);
      const prev = this[key];
      if (prev) {
        // fill big stepped jumps with an arc around the shoulder: smear frames
        const center = this.char.j.shR.getWorldPosition(new THREE.Vector3());
        const a = prev.t.clone().sub(center), b = tip.clone().sub(center);
        const ang = a.angleTo(b);
        const n = Math.min(8, Math.floor(ang / 0.18));
        if (n > 0) {
          const la = a.length(), lb = b.length();
          const qa = new THREE.Quaternion().setFromUnitVectors(a.clone().normalize(), b.clone().normalize());
          const ba = prev.b.clone().sub(center), bb = base.clone().sub(center);
          for (let i = 1; i <= n; i++) {
            const k = i / (n + 1);
            const q = new THREE.Quaternion().slerp(qa, k);
            const tt = a.clone().normalize().applyQuaternion(q).multiplyScalar(la + (lb - la) * k).add(center);
            const bt = ba.clone().lerp(bb, k).add(center);
            trail.push(bt, tt);
          }
        }
      }
      trail.push(base, tip);
      this[key] = { b: base, t: tip };
    };
    pushArc(W, this.trail, 'prevTip');
    if (this.char.weaponL) pushArc(this.char.weaponL, this.trailL, 'prevTipL');
  }

  // ------------------------------------------------------------------ save/load
  serialize() {
    return { level: this.level, exp: this.exp, gold: this.gold, potions: this.potions, elixirs: this.elixirs, hp: this.hp, mp: this.mp, weapons: this.weapons, weaponId: this.weaponId,
      classId: this.classId, cores: this.cores, fusion: this.fusion, memorySync: this.memorySync, name: this.name, pos: this.pos.toArray(), limit: this.limit };
  }
  deserialize(d) {
    Object.assign(this, { level: d.level, exp: d.exp, gold: d.gold, potions: d.potions, elixirs: d.elixirs || 0, weapons: d.weapons, classId: d.classId, cores: d.cores, fusion: d.fusion, memorySync: d.memorySync, name: d.name || 'UNKNOWN', limit: d.limit || 0 });
    this.recalc(); this.hp = d.hp; this.mp = d.mp;
    this.pos.fromArray(d.pos);
    this.equip(d.weaponId, false);
  }
}
export { CLIPS };
