// Enemies: shared actor logic (hit reactions, launches & juggles, posture/stagger, death) and
// per-type AI with telegraphed attacks, attack tokens (max two attackers) and strafing.
import * as THREE from 'three';
import { makeWolf, makeSlime, makeScorpion, makeSentinel } from '../chars/creatures.js';
import { Humanoid } from '../chars/humanoid.js';
import { Animator, CLIPS, attackClip } from '../chars/anim.js';
import { Time } from '../core/time.js';
import { Audio } from '../core/audio.js';
import { FX } from '../render/fx.js';
import { clamp, damp, angleDiff, approachAngle, rng } from '../core/util.js';
import { glowMat } from '../render/toon.js';

const R = rng(555);
const _v = new THREE.Vector3();

// humanoid enemy attack clips
const EC = {
  slash: attackClip('l1Wind', 'l1Hit', 'l1Follow', { fps: 12, tWind: 0.2, holdWind: 0.25, tHit: 0.06, tFollow: 0.15, tRecover: 0.35 }),
  slash2: attackClip('l2Wind', 'l2Hit', 'l2Follow', { fps: 12, tWind: 0.15, holdWind: 0.12, tHit: 0.06, tFollow: 0.15, tRecover: 0.35 }),
  smash: attackClip('hWind', 'hHit', 'hFollow', { fps: 10, tWind: 0.3, holdWind: 0.4, tHit: 0.06, tFollow: 0.2, tRecover: 0.45 }),
  thrust: attackClip('tWind', 'tHit', 'tHit', { fps: 12, tWind: 0.2, holdWind: 0.3, tHit: 0.06, tFollow: 0.15, tRecover: 0.4 }),
  spin: attackClip('l3Wind', 'l3Hit', 'l3Follow', { fps: 12, tWind: 0.25, holdWind: 0.3, tHit: 0.06, tFollow: 0.2, tRecover: 0.4 }),
  rise: attackClip('rWind', 'rHit', 'rFollow', { fps: 12, tWind: 0.2, holdWind: 0.3, tHit: 0.06, tFollow: 0.15, tRecover: 0.4 }),
  cast: CLIPS.cast,
};

// attack: { name, range, windup, active (hit time after windup), recover, dmg, arc, lunge, heavy, unblockable, anim, projectile, cd }
export const TYPES = {
  wolf: { name: 'Dire Wolf', model: 'wolf', hp: [40, 15], atk: [6, 2.2], speed: 8.5, aggro: 16, posture: 60, exp: [8, 4], gold: [2, 1], voice: 'growl',
    attacks: [
      { name: 'bite', range: 2.2, windup: 0.45, active: 0.12, recover: 0.55, dmg: 1, arc: 1.6, lunge: 13, anim: 'lunge', cd: 1.2, w: 3 },
      { name: 'swipe', range: 1.8, windup: 0.35, active: 0.1, recover: 0.45, dmg: 0.8, arc: 2, anim: 'swipe', cd: 1, w: 2 },
      { name: 'pounce', range: 7, minRange: 3.5, windup: 0.75, active: 0.25, recover: 0.7, dmg: 1.4, arc: 1.4, leap: 15, heavy: true, anim: 'lunge', cd: 4, w: 2 },
    ] },
  frostwolf: { name: 'Frost Wolf', model: 'wolf', look: { fur: 0xdfe8f4, belly: 0xffffff, eye: 0x5fd8ff, mane: 0xa8d8f0 }, hp: [45, 17], atk: [7, 2.4], speed: 9, aggro: 18, posture: 70, exp: [9, 4], gold: [3, 1],
    attacks: [
      { name: 'bite', range: 2.2, windup: 0.4, active: 0.12, recover: 0.5, dmg: 1, arc: 1.6, lunge: 14, anim: 'lunge', cd: 1.1, w: 3 },
      { name: 'frost', range: 9, minRange: 3, windup: 0.8, active: 0.1, recover: 0.6, dmg: 1.2, projectile: { color: 0x9fe8ff, speed: 18, count: 3, spread: 0.25, radius: 0.35 }, anim: 'howl', cd: 4, w: 2 },
      { name: 'pounce', range: 7, minRange: 3.5, windup: 0.7, active: 0.25, recover: 0.7, dmg: 1.4, arc: 1.4, leap: 16, heavy: true, anim: 'lunge', cd: 4, w: 1 },
    ] },
  slime: { name: 'Slime', model: 'slime', hp: [25, 9], atk: [4, 1.6], speed: 4.5, aggro: 10, posture: 30, exp: [5, 3], gold: [1, 1],
    attacks: [{ name: 'bounce', range: 1.7, windup: 0.5, active: 0.2, recover: 0.6, dmg: 1, arc: 6.3, lunge: 6, anim: 'lunge', cd: 1.5, w: 1 }] },
  goblin: { name: 'Goblin', model: 'humanoid', look: { build: 'small', height: 0.78, skin: 0x7ab04a, hair: 0x2a1a10, hairStyle: 'mohawk', faceStyle: 'monster', eye: 0xffcc33, ears: 'goblin', top: 0x7a5a3a, bottom: 0x5a4030, boots: 0x3a2a1a, gloves: 0x6a4a2a, accent: 0xb08a5a, sleeves: false },
    weapon: 'club', hp: [32, 12], atk: [5, 2], speed: 6.5, aggro: 14, posture: 40, exp: [7, 4], gold: [4, 2], voiceType: 'goblin',
    attacks: [
      { name: 'smack', range: 1.8, windup: 0.4, active: 0.12, recover: 0.5, dmg: 1, arc: 1.8, lunge: 6, clip: 'slash', cd: 1, w: 3 },
      { name: 'jumpSmash', range: 5, minRange: 2.5, windup: 0.6, active: 0.3, recover: 0.7, dmg: 1.5, arc: 1.6, leap: 10, heavy: true, clip: 'smash', cd: 3.5, w: 1 },
    ] },
  skeleton: { name: 'Skeleton Knight', model: 'humanoid', look: { skin: 0xe8e0c8, hairStyle: 'bald', faceStyle: 'skull', eye: 0xff3355, top: 0x5a5a62, bottom: 0x4a4a52, armor: 0x7a7a84, boots: 0x5a5a62, gloves: 0xe8e0c8, accent: 0x8a2a2a, sleeves: false, hat: 'helm' },
    weapon: 'bone', hp: [48, 15], atk: [7, 2.3], speed: 5.5, aggro: 14, posture: 70, exp: [10, 4], gold: [4, 2], guards: true,
    attacks: [
      { name: 'slash', range: 2.2, windup: 0.45, active: 0.08, recover: 0.5, dmg: 1, arc: 1.8, lunge: 6, clip: 'slash', cd: 1.1, w: 3, combo: 'slash2' },
      { name: 'thrust', range: 3, windup: 0.55, active: 0.08, recover: 0.6, dmg: 1.3, arc: 0.9, lunge: 14, clip: 'thrust', cd: 2.4, w: 2 },
      { name: 'cleave', range: 2.4, windup: 0.75, active: 0.08, recover: 0.7, dmg: 1.7, arc: 2.2, lunge: 4, clip: 'smash', heavy: true, unblockable: true, cd: 4, w: 1 },
    ] },
  scorpion: { name: 'Sand Scorpion', model: 'scorpion', hp: [55, 16], atk: [8, 2.3], speed: 6, aggro: 13, posture: 80, exp: [11, 4], gold: [5, 2],
    attacks: [
      { name: 'pinch', range: 2, windup: 0.4, active: 0.1, recover: 0.5, dmg: 1, arc: 1.6, lunge: 5, anim: 'swipe', cd: 1, w: 3 },
      { name: 'sting', range: 2.8, windup: 0.8, active: 0.1, recover: 0.7, dmg: 1.8, arc: 1.0, lunge: 8, anim: 'lunge', heavy: true, unblockable: true, cd: 3.5, w: 2 },
    ] },
  demon: { name: 'Demon Soldier', model: 'humanoid', look: { skin: 0x9a4a5a, hair: 0x1a0a14, hairStyle: 'short', faceStyle: 'demon', eye: 0xff3355, horns: 0x2a1a20, top: 0x3a1a24, bottom: 0x2a1018, armor: 0x5a1a2a, boots: 0x1a0a10, gloves: 0x2a1018, accent: 0xb0103a },
    weapon: 'spear', hp: [62, 18], atk: [9, 2.6], speed: 6.5, aggro: 18, posture: 90, exp: [13, 5], gold: [7, 3],
    attacks: [
      { name: 'thrust', range: 3.2, windup: 0.4, active: 0.08, recover: 0.5, dmg: 1.1, arc: 0.9, lunge: 12, clip: 'thrust', cd: 1.2, w: 3 },
      { name: 'sweep', range: 2.8, windup: 0.55, active: 0.08, recover: 0.6, dmg: 1.2, arc: 3.6, clip: 'spin', cd: 2.2, w: 2 },
      { name: 'fireball', range: 14, minRange: 4, windup: 0.7, active: 0.1, recover: 0.6, dmg: 1.4, projectile: { color: 0xff5a2a, speed: 16, count: 1, radius: 0.45, homing: 1.4, explode: true }, clip: 'cast', cd: 4, w: 2 },
    ] },
  sentinel: { name: 'Administrator Sentinel', model: 'sentinel', hp: [70, 18], atk: [10, 2.6], speed: 5, aggro: 22, posture: 100, exp: [16, 5], gold: [8, 3], flying: true,
    attacks: [
      { name: 'laser', range: 16, minRange: 3, windup: 0.9, active: 0.1, recover: 0.6, dmg: 1.3, projectile: { color: 0xff3355, speed: 34, count: 1, radius: 0.3, laser: true }, anim: 'windup', cd: 2.2, w: 3 },
      { name: 'ram', range: 9, windup: 0.6, active: 0.3, recover: 0.6, dmg: 1.3, arc: 1.4, lunge: 22, anim: 'lunge', heavy: true, cd: 3, w: 2 },
      { name: 'burst', range: 6, windup: 0.8, active: 0.1, recover: 0.7, dmg: 1, projectile: { color: 0x5fd8ff, speed: 12, count: 8, spread: 0.785, radius: 0.3 }, anim: 'windup', cd: 5, w: 1 },
    ] },
};

export class Enemy {
  constructor(G, type, level, pos, opts = {}) {
    this.G = G; this.type = type; this.def = TYPES[type] || opts.def; this.level = level;
    const D = this.def;
    this.name = opts.name || D.name;
    this.maxHp = Math.round((D.hp[0] + D.hp[1] * level) * (opts.hpMult || 1)); this.hp = this.maxHp;
    this.atk = D.atk[0] + D.atk[1] * level;
    this.speed = D.speed; this.maxPosture = D.posture * (opts.postureMult || 1); this.posture = 0;
    this.pos = pos.clone(); this.home = pos.clone(); this.vel = new THREE.Vector3(); this.yaw = R() * 6.28;
    this.alive = true; this.team = 'enemy'; this.state = 'idle'; this.stateT = 0; this.animT = R() * 5;
    this.cooldowns = {}; this.atk_ = null; this.hitDone = false; this.flying = !!D.flying;
    this.wanderT = 0; this.wanderTarget = pos.clone(); this.strafeDir = R() < 0.5 ? 1 : -1; this.token = false;
    this.superArmor = !!opts.superArmor; this.canLaunch = opts.canLaunch ?? true; this.boss = !!opts.boss;
    this.scale = opts.scale || 1; this.hitFlash = 0; this.airHang = 0;
    this.region = opts.region; this.zone = opts.zone;
    this.buildModel(opts);
    G.scene.add(this.root);
    this.syncModel(0);
  }
  buildModel(opts) {
    const D = this.def; const look = { ...(D.look || {}), ...(opts.look || {}) };
    if (D.model === 'humanoid') {
      this.char = new Humanoid({ ...look, height: (look.height || 1) * this.scale });
      this.root = this.char.root; this.anim = new Animator(this.char, { ...CLIPS, ...EC }); this.anim.play('guard');
      if (opts.weaponId) this.char.attachWeapon(opts.weaponId, { scale: opts.weaponScale || 1 });
      else if (D.weapon) this.char.attachEnemyWeapon(D.weapon, opts.weaponScale || 1);
      this.height = 1.7 * this.char.scale; this.radius = 0.45 * this.char.scale;
    } else {
      const maker = { wolf: makeWolf, slime: makeSlime, scorpion: makeScorpion, sentinel: makeSentinel }[D.model];
      this.cr = maker({ ...look, scale: this.scale * (look.scale || 1) });
      this.root = this.cr.root; this.height = this.cr.height; this.radius = this.cr.radius;
    }
    // telegraph glint
    this.glint = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), glowMat(0xffee88, 0)); this.glint.scale.set(0.4, 2, 0.4);
    this.glint.position.y = this.height + 0.5; this.root.add(this.glint);
    this.root.traverse((o) => { if (o.isMesh && o.material?.emissive !== undefined) o.userData.baseEmissive = o.material.emissive?.getHex?.(); });
  }

  get atkTokenFree() { return this.G.attackTokens < (this.G.maxTokens || 2); }

  // ------------------------------------------------------------------ hits
  receiveHit(info) {
    if (!this.alive || this.state === 'finished' || this.invuln) return 'immune';
    const fromDir = info.dir;
    // guarding skeletons block light hits from the front
    if (this.def.guards && this.state === 'guard' && !info.guardBreak && !info.unblockable && fromDir && fromDir.lengthSq() > 0) {
      const facing = Math.abs(angleDiff(this.yaw, Math.atan2(-fromDir.x, -fromDir.z))) < 1.4;
      if (facing) { this.posture += info.posture * 1.5; Audio.play('block'); if (this.posture >= this.maxPosture) this.stagger(); return 'blocked'; }
    }
    let dmg = info.dmg;
    if (this.state === 'stagger') dmg *= 1.5;
    if (this.dmgTakenMult) dmg *= this.dmgTakenMult;
    this.hp -= dmg; this.lastDamage = dmg;
    this.hitFlash = 0.1;
    if (info.posture) { this.posture = Math.min(this.maxPosture, this.posture + info.posture); this.postureT = 2.5; }
    this.aggro(info.from);
    if (this.hp <= 0) { this.die(info); return 'hit'; }
    if (this.posture >= this.maxPosture && this.state !== 'stagger') { this.stagger(); return 'hit'; }
    if (this.state === 'stagger') return 'hit';
    const kb = (info.kb || 0) / (this.boss ? 4 : 1);
    if (info.dir) { this.vel.x += info.dir.x * kb; this.vel.z += info.dir.z * kb; }
    if (this.superArmor && !this.inAirState) { this.onArmoredHit?.(info); return 'hit'; }
    this.cancelAttack();
    const airborne = this.state === 'air';
    if ((info.launch > 0 && this.canLaunch) || airborne) {
      this.state = 'air'; this.stateT = 0; this.inAirState = true;
      if (info.launch > 0 && !airborne) this.vel.y = info.launch;
      else if (info.juggle != null) this.vel.y = info.juggle < 0 ? info.juggle : Math.max(this.vel.y, info.juggle);
      this.airHang = 0.45;
    } else if (info.down) {
      this.state = 'down'; this.stateT = 0;
    } else {
      this.state = 'hit'; this.stateT = 0; this.stun = info.stun || 0.35;
    }
    this.onHurt?.(info);
    if (this.char) { this.char.setExpression('hurt', 0.4); this.anim.play(this.state === 'down' || this.state === 'air' ? 'knockdown' : (R() < 0.5 ? 'hit' : 'hit2'), { restart: true }); }
    if (R() < 0.3) this.voice('hurt');
    return 'hit';
  }
  stagger() {
    this.cancelAttack();
    this.state = 'stagger'; this.stateT = 0; this.posture = this.maxPosture;
    this.staggerTime = this.boss ? 4 : 3.2;
    Audio.play('parry'); Time.hitStop(0.1);
    const p = _v.copy(this.pos); p.y += this.height * 0.9;
    FX.impactStar(p, { size: 2, color: [1, 0.85, 0.3] }); FX.ring(p, { color: 0xffcc33, to: 3, dur: 0.35, y: 0, vertical: new THREE.Vector3(0, 1, 0) });
    this.G.ui.damage(p, 'BREAK!', 'crit');
    this.G.story?.onStagger?.(this);
    if (this.char) { this.anim.play('kneel', { restart: true }); this.char.setExpression('pain'); }
  }
  aggro(from) {
    if (this.state === 'idle' || this.state === 'return') { this.state = 'alert'; this.stateT = 0; this.voice('alert'); }
    this.target = from || this.G.player;
  }
  cancelAttack() {
    if (this.token) { this.token = false; this.G.attackTokens = Math.max(0, this.G.attackTokens - 1); }
    this.atk_ = null; this.glint.material.opacity = 0;
  }
  onParried() {
    // parried enemies are knocked off balance; big posture damage
    this.posture += this.maxPosture * (this.boss ? 0.3 : 0.6);
    this.cancelAttack();
    if (this.posture >= this.maxPosture) this.stagger();
    else if (!this.superArmor) { this.state = 'hit'; this.stateT = 0; this.stun = 0.9; if (this.char) this.anim.play('hit', { restart: true }); }
    else { this.state = 'recover'; this.stateT = 0; this.recoverT = 1.0; }
  }
  onBlocked() { this.posture += 4; }
  die(info) {
    this.alive = false; this.cancelAttack(); this.state = 'dead'; this.stateT = 0;
    if (this.char) { this.anim.play('death', { restart: true }); this.char.setExpression('dead'); }
    this.voice('death');
    if (info?.dir) { this.vel.x += info.dir.x * 6; this.vel.z += info.dir.z * 6; this.vel.y = Math.max(this.vel.y, 4); }
    this.G.onEnemyKilled(this);
  }
  voice(kind) {
    const D = this.def;
    if (D.model === 'wolf') { if (kind === 'alert') Audio.play('growl', D.look?.fur === 0xdfe8f4 ? 1.2 : 1, 0.7); if (kind === 'death') Audio.play('growl', 1.4, 0.4); if (kind === 'hurt') Audio.play('growl', 1.6, 0.25); }
    else if (D.model === 'slime') Audio.play('squish');
    else if (this.type === 'skeleton') Audio.play('bones');
    else if (D.voiceType) Audio.say(kind === 'hurt' || kind === 'death' ? 'hurt' : 'attack', D.voiceType);
    else if (D.model === 'humanoid') { if (kind !== 'alert') Audio.say(kind === 'hurt' || kind === 'death' ? 'hurt' : 'effort', 'boss'); }
    else if (D.model === 'sentinel') Audio.play('glitch');
    else if (D.model === 'scorpion' && kind !== 'hurt') Audio.play('bones');
  }

  // ------------------------------------------------------------------ AI
  update(dt) {
    if (this.G.cutscene && !this.scripted) { this.animT += dt; this.stateT += dt; this.brake(dt); this.physics(dt); this.animate(dt); this.syncModel(dt); return; }
    this.stateT += dt; this.animT += dt;
    for (const k in this.cooldowns) this.cooldowns[k] -= dt;
    if (this.postureT > 0) this.postureT -= dt; else if (this.state !== 'stagger') this.posture = Math.max(0, this.posture - dt * this.maxPosture * 0.12);
    const P = this.G.player;
    const toP = _v.set(P.pos.x - this.pos.x, 0, P.pos.z - this.pos.z);
    const dist = toP.length();
    const facingP = Math.atan2(toP.x, toP.z);
    switch (this.state) {
      case 'idle': {
        this.wanderT -= dt;
        if (this.wanderT <= 0) { this.wanderT = 2 + R() * 4; const a = R() * 6.28, r = R() * 8; this.wanderTarget.set(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r); }
        const d = Math.hypot(this.wanderTarget.x - this.pos.x, this.wanderTarget.z - this.pos.z);
        if (d > 1) this.moveToward(this.wanderTarget, this.speed * 0.3, dt); else this.brake(dt);
        if (P.alive && dist < this.def.aggro && Math.abs(P.pos.y - this.pos.y) < 8 && !this.G.flags.peaceful) this.aggro(P);
        break;
      }
      case 'alert': {
        this.brake(dt); this.yaw = approachAngle(this.yaw, facingP, dt * 8);
        if (this.stateT > 0.5) this.state = 'chase';
        break;
      }
      case 'chase': {
        if (!P.alive || dist > 45 || this.home.distanceTo(this.pos) > 70) { this.state = 'return'; break; }
        const atk = this.pickAttack(dist);
        if (atk && (this.atkTokenFree || this.boss)) { this.beginAttack(atk); break; }
        if (dist < 5 && !this.atkTokenFree && !this.boss) { this.state = 'strafe'; this.stateT = 0; break; }
        if (dist > 1.6 + this.radius) this.moveToward(P.pos, this.speed, dt); else { this.brake(dt); this.yaw = approachAngle(this.yaw, facingP, dt * 6); }
        break;
      }
      case 'strafe': {
        const want = 4.5;
        const side = new THREE.Vector3(-toP.z, 0, toP.x).normalize().multiplyScalar(this.strafeDir);
        const radial = toP.clone().normalize().multiplyScalar((dist - want) * 0.6);
        const v = side.multiplyScalar(this.speed * 0.35).add(radial);
        this.vel.x = damp(this.vel.x, v.x, 6, dt); this.vel.z = damp(this.vel.z, v.z, 6, dt);
        this.yaw = approachAngle(this.yaw, facingP, dt * 6);
        if (this.def.guards && this.stateT > 0.6 && R() < dt * 0.6) { this.state = 'guard'; this.stateT = 0; if (this.char) this.anim.play('block'); }
        if (this.stateT > 1.2 && (this.atkTokenFree || R() < dt * 0.3)) this.state = 'chase';
        if (R() < dt * 0.4) this.strafeDir *= -1;
        break;
      }
      case 'guard': {
        this.brake(dt); this.yaw = approachAngle(this.yaw, facingP, dt * 5);
        if (this.stateT > 1.6 + R()) { this.state = 'chase'; if (this.char) this.anim.play('guard'); }
        break;
      }
      case 'windup': {
        const a = this.atk_;
        if (!a.leap && !a.noTrack) this.yaw = approachAngle(this.yaw, facingP, dt * (a.track ?? 6));
        this.brake(dt);
        const k = this.stateT / a.windup;
        this.glint.material.opacity = a.unblockable ? (Math.floor(this.stateT * 16) % 2 ? 1 : 0.3) : (k > 0.6 ? (1 - k) * 2 : 0);
        this.glint.material.color.set(a.unblockable ? 0xff2244 : 0xffee88);
        if (this.stateT >= a.windup) this.startActive();
        break;
      }
      case 'attack': {
        const a = this.atk_;
        if (a.lunge && this.stateT < a.active + 0.1) { this.forwardVel(a.lunge * (1 - this.stateT / (a.active + 0.15))); }
        else this.brake(dt);
        if (!this.hitDone && this.stateT >= a.active) {
          this.hitDone = true;
          if (a.projectile) this.fireProjectile(a);
          else {
            const res = this.G.combat.enemyHit(this, a);
            if (res === 'miss' && a.leap) FX.dustAt(this.pos, { count: 8, speed: 4 });
            this.G.story?.onEnemyAttack?.(this, a, res);
          }
          if (this.onAttackHit) this.onAttackHit(a);
        }
        if (this.stateT >= a.active + 0.12) {
          if (a.combo && this.char && R() < 0.65) { const c = this.def.attacks.find((x) => x.name === a.combo) || { ...a, clip: a.combo, combo: null, name: a.combo }; this.beginAttack({ ...a, ...c, clip: a.combo, combo: null, windup: 0.2 }, true); break; }
          this.state = 'recover'; this.stateT = 0; this.recoverT = a.recover; this.glint.material.opacity = 0;
        }
        break;
      }
      case 'recover': {
        this.brake(dt);
        if (this.stateT > this.recoverT) { this.cancelAttack(); this.state = this.boss ? 'chase' : (R() < 0.4 ? 'strafe' : 'chase'); this.stateT = 0; }
        break;
      }
      case 'hit': {
        this.brake(dt, 5);
        if (this.stateT > this.stun) { this.state = 'chase'; this.stateT = 0; }
        break;
      }
      case 'air': {
        this.airHang -= dt;
        if (this.grounded && this.stateT > 0.15) {
          this.state = 'down'; this.stateT = 0; this.inAirState = false;
          FX.dustAt(this.pos, { count: 8, speed: 4 }); Audio.play('land', 1.2); this.G.cam.shake(0.1);
        }
        break;
      }
      case 'down': {
        this.brake(dt, 4);
        if (this.stateT > 0.9) { this.state = 'getup'; this.stateT = 0; if (this.char) this.anim.play('getup', { restart: true }); }
        break;
      }
      case 'getup': if (this.stateT > (this.char ? 0.75 : 0.35)) { this.state = 'chase'; this.stateT = 0; } this.brake(dt); break;
      case 'stagger': {
        this.brake(dt, 6);
        if (Math.random() < dt * 6) FX.glow.spawn({ x: this.pos.x + Math.cos(this.animT * 5) * 0.5, y: this.pos.y + this.height + 0.3, z: this.pos.z + Math.sin(this.animT * 5) * 0.5, life: 0.4, size: 0.3, r: 1, g: 0.9, b: 0.3 });
        if (this.stateT > this.staggerTime) { this.state = 'chase'; this.posture = 0; this.stateT = 0; if (this.char) this.anim.play('guard'); }
        break;
      }
      case 'return': {
        this.moveToward(this.home, this.speed * 0.7, dt);
        this.hp = Math.min(this.maxHp, this.hp + this.maxHp * dt * 0.2);
        if (this.home.distanceTo(this.pos) < 3) this.state = 'idle';
        if (P.alive && dist < this.def.aggro * 0.6) this.aggro(P);
        break;
      }
      case 'finished': this.brake(dt, 10); break;
      case 'dead': this.brake(dt, 3); break;
    }
    this.physics(dt);
    this.animate(dt);
    this.syncModel(dt);
  }
  pickAttack(dist) {
    const list = this.def.attacks.filter((a) => dist <= a.range + this.radius && dist >= (a.minRange || 0) && !(this.cooldowns[a.name] > 0));
    if (!list.length) return null;
    let tot = 0; for (const a of list) tot += a.w || 1;
    let r = R() * tot; for (const a of list) { r -= a.w || 1; if (r <= 0) return a; }
    return list[0];
  }
  beginAttack(a, chained = false) {
    if (!chained && !this.boss) { this.token = true; this.G.attackTokens++; }
    this.atk_ = a; this.state = 'windup'; this.stateT = 0; this.hitDone = false;
    this.cooldowns[a.name] = a.cd || 1;
    if (this.char) {
      const clip = EC[a.clip] || EC.slash;
      // play the clip slowed so its wind pose spans the windup
      const holdEnd = clip.activeStart || 0.2;
      this.anim.play('atk_' + a.name, { clip, speed: Math.min(2, holdEnd / Math.max(0.05, a.windup)), restart: true, blend: 0.05 });
      this.char.setExpression('angry', a.windup + 0.5);
    }
    if (a.unblockable) { Audio.play('danger'); this.G.ui.damage(_v.copy(this.pos).setY(this.pos.y + this.height + 0.6), '!', 'crit'); }
    if (this.def.model === 'wolf' && R() < 0.6) Audio.play('growl', 1, 0.5);
    this.G.story?.onEnemyWindup?.(this, a);
  }
  startActive() {
    const a = this.atk_;
    this.state = 'attack'; this.stateT = 0; this.glint.material.opacity = 0;
    if (this.char) { const clip = EC[a.clip] || EC.slash; const remain = clip.total - clip.activeStart; this.anim.speed = Math.max(0.6, remain / (a.active + a.recover + 0.2)) * 1.4; }
    if (a.leap) {
      const P = this.G.player;
      const d = Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
      this.yaw = Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
      const T = Math.max(0.3, a.active + 0.1);
      this.forwardVel(Math.min(a.leap * 1.5, d / T)); this.vel.y = 7;
      FX.dustAt(this.pos, { count: 6, speed: 3 });
    }
    Audio.play('swing', a.heavy ? 1.6 : 1);
    if (this.char && R() < 0.5) this.voice('attack');
    if (a.lunge && !a.projectile) FX.dustAt(this.pos, { count: 3, speed: 2, size: 0.5 });
  }
  fireProjectile(a) {
    const pr = a.projectile; const P = this.G.player;
    const origin = this.pos.clone(); origin.y += this.height * 0.65;
    const n = pr.count || 1;
    for (let i = 0; i < n; i++) {
      let ang = this.yaw;
      if (pr.spread) ang += pr.spread >= 0.7 ? i * (Math.PI * 2 / n) : (i - (n - 1) / 2) * pr.spread;
      const target = P.pos.clone(); target.y += 1;
      const dir = pr.spread >= 0.7 ? new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang)) : target.sub(origin).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), ang - this.yaw);
      let mesh;
      if (pr.laser) { mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 6).rotateX(Math.PI / 2), glowMat(pr.color)); mesh.lookAt(dir); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir); }
      this.G.combat.spawnProjectile({ pos: origin.clone(), vel: dir.multiplyScalar(pr.speed), color: pr.color, radius: pr.radius || 0.35, dmg: a.dmg, owner: this, homing: pr.homing, target: P, explode: pr.explode, trailColor: pr.color, mesh, life: 2.5, heavy: a.heavy });
    }
    Audio.play(pr.laser ? 'laser' : 'magic', pr.color === 0xff5a2a ? 'fire' : 'ice');
  }

  moveToward(target, speed, dt) {
    const dx = target.x - this.pos.x, dz = target.z - this.pos.z; const d = Math.hypot(dx, dz) || 1;
    this.vel.x = damp(this.vel.x, dx / d * speed, 6, dt); this.vel.z = damp(this.vel.z, dz / d * speed, 6, dt);
    this.yaw = approachAngle(this.yaw, Math.atan2(dx, dz), dt * 8);
  }
  forwardVel(s) { this.vel.x = Math.sin(this.yaw) * s; this.vel.z = Math.cos(this.yaw) * s; }
  brake(dt, k = 10) { this.vel.x = damp(this.vel.x, 0, k, dt); this.vel.z = damp(this.vel.z, 0, k, dt); }

  physics(dt) {
    const w = this.G.world;
    if (this.flying && this.state !== 'air' && this.state !== 'dead') {
      const gy = w.groundAt(this.pos.x, this.pos.z, this.pos.y + 2);
      this.vel.y = damp(this.vel.y, 0, 5, dt); this.pos.y = damp(this.pos.y, gy + 0.2, 3, dt);
      this.grounded = true;
    } else {
      let g = 26;
      if (this.state === 'air' && this.airHang > 0 && this.vel.y < 4) g = 8; // anime float during juggles
      this.vel.y -= g * dt;
    }
    const prevY = this.pos.y;
    this.pos.addScaledVector(this.vel, dt);
    w.resolve(this.pos, this.radius * 0.8);
    // separation from other enemies & player
    for (const e of this.G.enemies) {
      if (e === this || !e.alive) continue;
      const dx = this.pos.x - e.pos.x, dz = this.pos.z - e.pos.z; const d = Math.hypot(dx, dz); const m = (this.radius + e.radius) * 0.9;
      if (d < m && d > 0.001) { const push = (m - d) * 0.5; this.pos.x += dx / d * push; this.pos.z += dz / d * push; }
    }
    const P = this.G.player;
    if (this.alive && P.alive && this.state !== 'air') {
      const dx = this.pos.x - P.pos.x, dz = this.pos.z - P.pos.z; const d = Math.hypot(dx, dz); const m = (this.radius + P.radius) * 0.85;
      if (d < m && d > 0.001 && Math.abs(this.pos.y - P.pos.y) < 1.5) { const push = m - d; this.pos.x += dx / d * push; this.pos.z += dz / d * push; }
    }
    if (!this.flying || this.state === 'air' || this.state === 'dead') {
      const gy = w.groundAt(this.pos.x, this.pos.z, Math.max(prevY, this.pos.y));
      if (this.pos.y <= gy) { this.pos.y = gy; if (this.vel.y < 0) this.vel.y = 0; this.grounded = true; }
      else if (this.pos.y - gy < 0.5 && this.vel.y <= 0 && this.state !== 'air') { this.pos.y = gy; this.vel.y = 0; this.grounded = true; }
      else this.grounded = false;
    }
    if (this.pos.y < -40) { this.hp = 0; if (this.alive) this.die(); }
  }

  animState() {
    const s = this.state;
    if (s === 'windup') return this.atk_?.anim === 'howl' ? 'howl' : this.atk_?.anim === 'swipe' ? 'growl' : 'windup';
    if (s === 'attack') return this.atk_?.anim || 'lunge';
    if (s === 'chase' || s === 'return') return Math.hypot(this.vel.x, this.vel.z) > 1 ? 'run' : 'idle';
    if (s === 'strafe') return 'strafe';
    if (s === 'idle') return Math.hypot(this.vel.x, this.vel.z) > 0.8 ? 'run' : 'idle';
    if (s === 'alert') return this.def.model === 'wolf' ? 'growl' : 'idle';
    if (s === 'hit' || s === 'recover') return s === 'hit' ? 'hit' : 'idle';
    if (s === 'getup') return 'idle';
    return s; // air, down, stagger, dead
  }
  animate(dt) {
    if (this.char) {
      const s = this.state;
      if (s === 'chase' || s === 'idle' || s === 'return') { const sp = Math.hypot(this.vel.x, this.vel.z); this.anim.play(sp > 4 ? 'run' : sp > 0.8 ? 'walk' : 'guard', { speed: sp > 4 ? sp / 8 : 1 }); }
      else if (s === 'strafe') this.anim.play('walk', { speed: 0.8 });
      else if (s === 'alert') this.anim.play('guard');
      else if (s === 'recover' && this.anim.done) this.anim.play('guard');
      else if (s === 'air' && this.anim.name !== 'knockdown') this.anim.play('knockdown', { restart: true });
      this.anim.update(dt);
      this.char.updateSecondary(dt, this.vel);
    } else {
      this.cr.anim(this.animState(), this.animT, { speed: 11 });
    }
  }
  syncModel(dt) {
    this.root.position.copy(this.pos);
    const ry = this.root.rotation.y;
    this.root.rotation.y = this.state === 'attack' || this.state === 'windup' ? this.yaw : ry + angleDiff(ry, this.yaw) * (1 - Math.exp(-dt * 12));
    // hit flash: briefly turn white-hot
    if (this.hitFlash > 0) {
      this.hitFlash -= Time.rdt;
      const k = this.hitFlash > 0 ? 1 : 0;
      if (k !== this._flashState) { this._flashState = k; this.root.traverse((o) => { if (o.isMesh && o.material?.emissive && !o.userData.isOutline) { if (!o.material.userData?.cloned) { o.material = o.material.clone(); o.material.userData = { cloned: true }; } o.material.emissive.set(k ? 0xffffff : (o.userData.baseEmissive ?? 0)); o.material.emissiveIntensity = k ? 0.8 : 1; } }); }
    }
    if (this.state === 'dead') {
      if (this.stateT > 1.2) {
        const k = Math.min(1, (this.stateT - 1.2) / 0.6);
        if (!this._dissolving) { this._dissolving = true; FX.glowBurst(_v.copy(this.pos).setY(this.pos.y + this.height * 0.5), { count: 30, color: [0.6, 0.9, 1], speed: 3, size: 0.4, up: 2, life: 1 }); }
        this.root.scale.set(1 + k * 0.3, Math.max(0.01, 1 - k), 1 + k * 0.3);
        if (k >= 1) this.remove = true;
      }
    }
  }
  dispose() { this.cancelAttack(); this.G.scene.remove(this.root); }
}
