// Bosses: timeline-scripted attack patterns, phases, arena hazards, scale-emphasizing presentation.
import * as THREE from 'three';
import { Enemy, TYPES } from './enemy.js';
import { makeGolem, makeWolf, makeHerald } from '../chars/creatures.js';
import { Humanoid } from '../chars/humanoid.js';
import { Animator, CLIPS, attackClip } from '../chars/anim.js';
import { Audio } from '../core/audio.js';
import { FX, Trail } from '../render/fx.js';
import { Time } from '../core/time.js';
import { angleDiff, approachAngle, damp, rng, clamp } from '../core/util.js';
import { glowMat } from '../render/toon.js';

const R = rng(9001);
const _v = new THREE.Vector3();

const BC = {
  c1: attackClip('l1Wind', 'l1Hit', 'l1Follow', { fps: 12, tWind: 0.2, holdWind: 0.3, tHit: 0.05, tFollow: 0.15, tRecover: 0.25 }),
  c2: attackClip('l2Wind', 'l2Hit', 'l2Follow', { fps: 12, tWind: 0.15, holdWind: 0.2, tHit: 0.05, tFollow: 0.15, tRecover: 0.25 }),
  c3: attackClip('l3Wind', 'l3Hit', 'l3Follow', { fps: 12, tWind: 0.2, holdWind: 0.35, tHit: 0.06, tFollow: 0.2, tRecover: 0.35 }),
  smash: attackClip('hWind', 'hHit', 'hFollow', { fps: 10, tWind: 0.3, holdWind: 0.6, tHit: 0.06, tFollow: 0.25, tRecover: 0.5 }),
  dash: attackClip('dWind', 'dHit', 'dHit', { fps: 12, tWind: 0.2, holdWind: 0.35, tHit: 0.06, tFollow: 0.2, tRecover: 0.4 }),
  rise: attackClip('rWind', 'rHit', 'rFollow', { fps: 12, tWind: 0.2, holdWind: 0.3, tHit: 0.06, tFollow: 0.2, tRecover: 0.35 }),
  thrust: attackClip('tWind', 'tHit', 'tHit', { fps: 12, tWind: 0.2, holdWind: 0.3, tHit: 0.06, tFollow: 0.2, tRecover: 0.35 }),
  cross: attackClip('xWind', 'xHit', 'xHit', { fps: 12, tWind: 0.3, holdWind: 0.5, tHit: 0.06, tFollow: 0.25, tRecover: 0.4 }),
};

export const BOSSES = {
  golem: { name: 'Ruin Golem', title: 'Warden of the First Cycle', level: 12, hp: 1600, atk: 34, posture: 260, height: 6.4, scale: 1.6, music: 'boss' },
  behemoth: { name: 'Frost Behemoth', title: 'The Winter That Remembers', level: 20, hp: 3200, atk: 52, posture: 360, scale: 3.4, music: 'boss' },
  general: { name: 'Azgaroth', title: 'Demon General of the Ashen Maw', level: 26, hp: 4600, atk: 64, posture: 420, scale: 2.0, music: 'boss' },
  knight: { name: 'The Forgotten Knight', title: 'Reincarnator of the Sixth Cycle', level: 24, hp: 3000, atk: 58, posture: 300, scale: 1.0, music: 'boss' },
  herald: { name: 'Herald of the Administrator', title: 'Keeper of the Reset', level: 30, hp: 6400, atk: 72, posture: 520, scale: 1.6, music: 'boss' },
  varkas: { name: 'Varkas', title: 'The Eternal King — Final Boss of Eternal Realms', level: 99, hp: 900, atk: 10, posture: 9999, scale: 2.4, music: 'finalboss' },
};

// pseudo type definitions so Enemy's constructor works
for (const k of Object.keys(BOSSES)) TYPES['boss_' + k] = { name: BOSSES[k].name, model: 'custom', hp: [BOSSES[k].hp, 0], atk: [BOSSES[k].atk, 0], speed: 6, aggro: 40, posture: BOSSES[k].posture, exp: [0, 0], gold: [0, 0], attacks: [] };

export class Boss extends Enemy {
  constructor(G, kind, pos, opts = {}) {
    const B = BOSSES[kind];
    super(G, 'boss_' + kind, B.level, pos, { boss: true, superArmor: true, canLaunch: false, kind, ...opts });
    this.kind = kind; this.B = B; this.title = B.title;
    this.phase = 1; this.act = null; this.idleT = 1.5; this.dormant = true;
    this.arena = opts.arena || pos.clone(); this.arenaR = opts.arenaR || 30;
    this.expReward = { golem: 600, behemoth: 1400, general: 2400, knight: 2000, herald: 4000, varkas: 0 }[kind];
  }
  buildModel(opts) {
    const kind = opts.kind; const B = BOSSES[kind];
    this.humanoid = false;
    if (kind === 'golem') { this.cr = makeGolem({ scale: B.scale }); }
    else if (kind === 'behemoth') { this.cr = makeWolf({ fur: 0xe8eef8, belly: 0xffffff, eye: 0x5fd8ff, scale: B.scale, horns: 0x9fe8ff, crystals: 0x7fd8ff, mane: 0xbfe0f4 }); }
    else if (kind === 'herald') { this.cr = makeHerald({ scale: B.scale }); }
    else {
      this.humanoid = true;
      const looks = {
        general: { build: 'big', skin: 0x8a3a4a, hair: 0xe8e8f0, hairStyle: 'long', faceStyle: 'demon', eye: 0xff2244, horns: 0x1a0a10, top: 0x2a0a14, bottom: 0x1a0a10, armor: 0x3a0a1a, cape: 0x5a0a1a, capeTrim: 0xc8a040, boots: 0x1a0a10, gloves: 0x2a0a14, accent: 0xc8a040 },
        knight: { skin: 0xd8c8b8, hair: 0xd0d0e0, hairStyle: 'messy', faceStyle: 'stern', eye: 0xb04aff, top: 0x1a1a24, bottom: 0x1a1a24, armor: 0x2a2a38, coat: 0x14141c, scarf: 0x5a1a7a, boots: 0x14141c, gloves: 0x1a1a24, accent: 0x8a6ab0 },
        varkas: { build: 'big', skin: 0xc8b0c8, hair: 0x1a1020, hairStyle: 'long', faceStyle: 'demon', eye: 0xffcc33, crown: true, top: 0x1a1020, bottom: 0x14101a, armor: 0x2a2030, cape: 0x3a0a3a, capeTrim: 0xe8c04a, boots: 0x14101a, gloves: 0x2a2030, accent: 0xe8c04a },
      };
      this.char = new Humanoid({ ...looks[kind], height: B.scale });
      this.anim = new Animator(this.char, { ...CLIPS, ...BC }); this.anim.play('guard');
      if (kind === 'knight') this.char.attachWeapon('cursed');
      else this.char.attachEnemyWeapon('demon', kind === 'general' ? 1.0 : 1.2);
      this.root = this.char.root; this.height = 1.75 * this.char.scale; this.radius = 0.5 * this.char.scale;
      if (this.char.weapon) { this.trail = new Trail(this.G.scene, { color: kind === 'knight' ? 0xb04aff : 0xff3355, core: 0xffffff, life: 0.16 }); }
    }
    if (this.cr) { this.root = this.cr.root; this.height = this.cr.height; this.radius = this.cr.radius; }
    if (kind === 'golem') this.height = 6.4;
    this.glint = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), glowMat(0xffee88, 0)); this.glint.scale.set(0.4, 2, 0.4); this.glint.position.y = this.height + 0.8; this.root.add(this.glint);
    this.root.traverse((o) => { if (o.isMesh && o.material?.emissive !== undefined) o.userData.baseEmissive = o.material.emissive?.getHex?.(); });
    this.pose = 'idle'; this.snap = false;
  }

  // ------------------------------------------------------------------ actions
  do(name, dur, steps = [], tick = null) {
    this.act = { name, t: 0, dur, steps: steps.sort((a, b) => a[0] - b[0]), idx: 0, tick };
    this.state = 'act';
  }
  telegraph(unblockable = false) {
    if (unblockable) { Audio.play('danger'); this.G.ui.damage(_v.copy(this.pos).setY(this.pos.y + this.height + 0.8), '!', 'crit'); }
    this.glintT = 0.5; this.glintRed = unblockable;
  }
  meleeHit(o) { return this.G.combat.enemyHit(this, { range: 3, arc: 2.2, dmg: 1, up: this.height, ...o }); }
  hazard(pos, o = {}) { return this.G.combat.spawnHazard({ pos: pos.clone(), owner: this, radius: 3, delay: 1, dmg: 1.2, ...o }); }
  facePlayer(dt, rate = 4) { const P = this.G.player; this.yaw = approachAngle(this.yaw, Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z), dt * rate); }
  distP() { const P = this.G.player; return Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z); }
  front(d) { return new THREE.Vector3(this.pos.x + Math.sin(this.yaw) * d, this.pos.y, this.pos.z + Math.cos(this.yaw) * d); }
  quake(power = 1, at = this.pos) {
    FX.ring(at, { color: 0xffffff, from: 1, to: 8 * power, dur: 0.45 }); FX.dustAt(at, { count: 20, speed: 8 * power, size: 1.4 }); FX.debrisAt(at, { count: 14, speed: 9 });
    this.G.cam.shake(0.5 * power); Audio.play('explosion', power);
  }

  onArmoredHit() {
    // phase transitions
    const k = this.hp / this.maxHp;
    if (this.phase === 1 && k < 0.5) this.enterPhase2();
  }
  enterPhase2() {
    this.phase = 2; this.act = null; this.state = 'act';
    this.do('phase2', 2.2, [[0, () => { Audio.play('roar', this.kind === 'herald' ? 1.6 : 0.8); this.G.cam.shake(0.8); FX.flash(0.4, '#fff'); this.G.post.glitchFor(this.kind === 'herald' ? 1 : 0.2); this.invuln = true; this.G.story.bossPhase2?.(this); }], [2.1, () => { this.invuln = false; }]],
      () => { FX.glowBurst(_v.copy(this.pos).setY(this.pos.y + this.height * 0.5), { count: 2, color: [1, 0.3, 0.3], speed: 6, size: 1 }); });
    if (this.kind === 'golem') this.pose = 'beam';
  }

  update(dt) {
    if (this.dormant) { this.animT += dt; this.physics(dt); this.animate(dt); this.syncModel(dt); return; }
    if (!this.alive || this.state === 'stagger' || this.state === 'finished' || this.state === 'clash') return super.update(dt);
    this.stateT += dt; this.animT += dt;
    if (this.postureT > 0) this.postureT -= dt; else this.posture = Math.max(0, this.posture - dt * this.maxPosture * 0.06);
    if (this.glintT > 0) { this.glintT -= dt; this.glint.material.opacity = Math.floor(this.glintT * 16) % 2 ? 1 : 0.3; this.glint.material.color.set(this.glintRed ? 0xff2244 : 0xffee88); } else this.glint.material.opacity = 0;
    if (this.act) {
      const A = this.act; A.t += dt;
      while (this.act === A && A.idx < A.steps.length && A.steps[A.idx][0] <= A.t) { const f = A.steps[A.idx][1]; A.idx++; f(); }
      if (this.act === A) A.tick?.(dt, A.t);
      if (this.act === A && A.t >= A.dur) { this.act = null; this.idleT = this.phase === 2 ? 0.5 + R() * 0.6 : 0.9 + R() * 0.9; this.state = 'chase'; this.pose = 'idle'; }
    } else {
      this.idleT -= dt;
      const d = this.distP();
      this.facePlayer(dt, 3);
      // approach / circle the player between attacks
      const want = this.kind === 'herald' ? 9 : this.kind === 'golem' ? 5 : 3.5 + this.radius;
      if (d > want + 1) this.moveToward(this.G.player.pos, this.speedFor(), dt); else this.brake(dt);
      if (this.idleT <= 0) this.choose(d);
      this.state = 'chase';
    }
    this.physics(dt);
    // keep inside arena
    const ax = this.pos.x - this.arena.x, az = this.pos.z - this.arena.z; const ad = Math.hypot(ax, az);
    if (ad > this.arenaR - 2) { this.pos.x = this.arena.x + ax / ad * (this.arenaR - 2); this.pos.z = this.arena.z + az / ad * (this.arenaR - 2); }
    this.animate(dt);
    this.syncModel(dt);
    this.updateTrail();
  }
  speedFor() { return { golem: 3, behemoth: 8, general: 6.5, knight: 8, herald: 5, varkas: 3 }[this.kind] * (this.phase === 2 ? 1.25 : 1); }
  updateTrail() {
    if (!this.trail || !this.char.weapon) return;
    if (this.state === 'act' && this.swinging) {
      const b = this.char.weapon.base.getWorldPosition(new THREE.Vector3()), t = this.char.weapon.tip.getWorldPosition(new THREE.Vector3());
      this.trail.push(b, t);
    }
    this.trail.update();
  }

  // ------------------------------------------------------------------ pattern selection
  choose(d) {
    const fn = this['choose_' + this.kind]; if (fn) fn.call(this, d);
  }
  choose_varkas() {
    // final boss of the old game: slow, theatrical, mostly a punching bag for the prologue
    this.swing('c1', 1.4, 0.55, { range: 4, dmg: 1 });
  }
  /** Humanoid sword swing helper: clip, duration, hit time, hit opts */
  swing(clip, dur, hitAt, hitOpts = {}, extra = []) {
    const lunge = hitOpts.lunge || 0;
    this.anim.play('b_' + clip + R(), { clip: BC[clip], speed: BC[clip].activeStart / Math.max(0.1, hitAt - 0.05), restart: true, blend: 0.05 });
    this.char.setExpression('angry', dur);
    if (hitOpts.unblockable) this.telegraph(true); else this.telegraph(false);
    this.swinging = true;
    this.do(clip, dur, [
      [hitAt - 0.06, () => { this.anim.speed = 1.2; Audio.play('swing', 1.6); if (lunge) this.forwardVel(lunge); this.trail?.clear(); }],
      [hitAt, () => { const r = this.meleeHit({ range: 2.6 * this.char.scale * 0.7, arc: 2.4, heavy: true, ...hitOpts }); this.lastResult = r; FX.slash(_v.copy(this.pos).setY(this.pos.y + this.height * 0.55).addScaledVector(new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)), 0.6), slashQ(this.yaw, hitOpts.roll ?? -0.5), { color: this.kind === 'knight' ? 0xb04aff : 0xff3355, core: 0xffd0d0, scale: 1.6 * this.char.scale * 0.6, flip: hitOpts.flip ?? true, dur: 0.1, life: 0.25 }); }],
      [hitAt + 0.2, () => { this.brake(1); }],
      [dur - 0.05, () => { this.swinging = false; }],
      ...extra,
    ], (dt, t) => { if (t < hitAt - 0.1) this.facePlayer(dt, 5); if (t > hitAt + 0.05) this.brake(dt, 8); });
  }

  choose_golem(d) {
    const P = this.G.player; const ph2 = this.phase === 2;
    const r = R();
    if (d < 7 && r < 0.4) {
      // double-fist slam
      this.pose = 'slamWind'; this.telegraph(false);
      const at = ph2 ? 0.8 : 1.05;
      this.do('slam', at + 1.2, [
        [at, () => { this.pose = 'slam'; this.snap = true; const c = this.front(4.2); this.quake(1.2, c); const pd = Math.hypot(P.pos.x - c.x, P.pos.z - c.z); if (pd < 4.2 && P.pos.y - c.y < 2.5) this.G.combat.damagePlayer(this, { dmg: 1.4, heavy: true }, new THREE.Vector3(P.pos.x - c.x, 0, P.pos.z - c.z).normalize()); if (ph2) for (let i = 0; i < 6; i++) { const a = this.yaw + (i - 2.5) * 0.4; this.hazard(new THREE.Vector3(this.pos.x + Math.sin(a) * 10, this.pos.y, this.pos.z + Math.cos(a) * 10), { radius: 2.2, delay: 0.7, color: 0x5fd8ff }); } }],
        [at + 0.1, () => { this.snap = false; }],
      ], (dt, t) => { if (t < at - 0.3) this.facePlayer(dt, 2); this.brake(dt); });
    } else if (d < 9 && r < 0.75) {
      // horizontal sweep — jump or dodge!
      this.pose = 'sweepWind'; this.telegraph(true);
      const at = ph2 ? 0.75 : 0.95;
      this.do('sweep', at + 1.0, [
        [at, () => { this.pose = 'sweep'; this.snap = true; Audio.play('whoosh'); FX.slash(_v.copy(this.pos).setY(this.pos.y + 1.6), slashQ(this.yaw, 0.1), { color: 0x9a9a8a, scale: 6, flip: false, dur: 0.15, life: 0.3 });
          const res = this.G.combat.enemyHit(this, { range: 8, arc: 3.4, dmg: 1.3, heavy: true, unblockable: true, up: 1.4 }); void res; }],
        [at + 0.1, () => { this.snap = false; }],
      ], (dt, t) => { if (t < at - 0.25) this.facePlayer(dt, 2.5); this.brake(dt); });
    } else if (ph2 && r < 0.9) {
      // rune beams: hazards chase the player
      this.pose = 'beam'; Audio.play('charge');
      const steps = [];
      for (let i = 0; i < 5; i++) steps.push([0.3 + i * 0.45, () => this.hazard(P.pos, { radius: 2.6, delay: 0.75, kind: 'pillar', color: 0x5fd8ff, dmg: 1.2 })]);
      this.do('beam', 3, steps, (dt) => this.brake(dt));
    } else {
      // rock throw
      this.pose = 'throwWind';
      this.do('throw', 1.8, [
        [0.85, () => {
          this.pose = 'throw'; this.snap = true; Audio.play('swing', 2);
          const from = this.pos.clone(); from.y += 6; const to = P.pos.clone(); const T = 0.9;
          const vel = new THREE.Vector3((to.x - from.x) / T, (to.y - from.y) / T + 0.5 * 22 * T, (to.z - from.z) / T);
          const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.1, 0), new THREE.MeshToonMaterial({ color: 0x8a8a7a }));
          this.G.combat.spawnProjectile({ pos: from, vel, mesh: rock, gravity: 22, radius: 1.2, dmg: 1.4, owner: this, heavy: true, explode: true, color: 0xb0a080, spin: 4, life: 3 });
          this.hazard(to, { radius: 2.4, delay: T, dmg: 0, color: 0xffaa55 });
        }],
        [0.95, () => { this.snap = false; }],
      ], (dt, t) => { if (t < 0.8) this.facePlayer(dt, 3); this.brake(dt); });
    }
  }

  choose_behemoth(d) {
    const P = this.G.player; const ph2 = this.phase === 2; const r = R();
    if (d > 10 || r < 0.25) {
      // charge across the arena
      this.wstate = 'windup'; this.telegraph(false); Audio.play('roar', 1.1);
      this.do('charge', 2.4, [
        [0.8, () => { this.wstate = 'run'; this.yaw = Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z); Audio.play('dash'); this.chargeHit = false; }],
        [2.0, () => { this.wstate = 'idle'; }],
      ], (dt, t) => {
        if (t < 0.8) { this.facePlayer(dt, 4); this.brake(dt); return; }
        if (t < 2.0) {
          this.forwardVel(ph2 ? 26 : 21);
          if (Math.random() < 0.5) FX.dustAt(this.pos, { count: 2, speed: 3, size: 1.5, color: [0.9, 0.95, 1] });
          if (!this.chargeHit && this.distP() < this.radius + 1.6) { this.chargeHit = true; this.G.combat.damagePlayer(this, { dmg: 1.5, heavy: true, launch: 9 }, new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw))); }
          const ax = this.pos.x - this.arena.x, az = this.pos.z - this.arena.z;
          if (Math.hypot(ax, az) > this.arenaR - 4) { this.act.t = 2.0; this.quake(0.8); this.wstate = 'hit'; }
        } else this.brake(dt, 3);
      });
    } else if (d < 9 && r < 0.55) {
      // frost breath cone
      this.wstate = 'growl'; this.telegraph(false);
      const steps = [[0.7, () => { this.wstate = 'howl'; Audio.play('roar', 1.4); }]];
      for (let i = 0; i < 10; i++) steps.push([0.75 + i * 0.09, () => {
        const head = this.pos.clone(); head.y += this.height * 0.7; head.add(new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(this.radius * 1.4));
        const a = this.yaw + (Math.random() - 0.5) * 0.7; const dir = new THREE.Vector3(Math.sin(a), -0.25, Math.cos(a));
        this.G.combat.spawnProjectile({ pos: head, vel: dir.multiplyScalar(18), color: 0xbfe9ff, radius: 0.7, dmg: 0.5, owner: this, trailColor: 0xbfe9ff, life: 0.9, ghost: true });
      }]);
      this.do('breath', 2.2, steps, (dt, t) => { if (t < 1.4) this.facePlayer(dt, 1.5); this.brake(dt); });
    } else if (r < 0.8) {
      // ice spikes erupt under the player
      this.wstate = 'howl'; Audio.play('howl');
      const n = ph2 ? 6 : 4; const steps = [];
      for (let i = 0; i < n; i++) steps.push([0.4 + i * 0.35, () => this.hazard(P.pos, { radius: 2.5, delay: 0.7, kind: 'ice', color: 0x9fe8ff, dmg: 1.2, launch: 8 })]);
      this.do('spikes', 0.6 + n * 0.35 + 0.6, steps, (dt) => this.brake(dt));
    } else {
      // tail sweep / stomp around itself
      this.wstate = 'growl'; this.telegraph(true);
      this.do('stomp', 1.6, [[0.75, () => { this.wstate = 'swipe'; this.quake(1); const res = this.G.combat.enemyHit(this, { range: this.radius + 4.5, arc: 6.3, dmg: 1.3, heavy: true, unblockable: true, up: 1.2 }); void res; }], [1.1, () => { this.wstate = 'idle'; }]], (dt) => this.brake(dt));
    }
  }

  choose_general(d) {
    const P = this.G.player; const ph2 = this.phase === 2; const r = R();
    if (d > 9 && r < 0.6) {
      // dash slash gap closer
      this.swing('dash', 1.5, 0.75, { lunge: 30, range: 3.2, dmg: 1.3, roll: 0.05, flip: true });
    } else if (d < 5 && r < 0.55) {
      // three-hit combo
      const tail = ph2 ? [[1.9, () => this.swing('c3', 1.5, 0.7, { range: 3.4, dmg: 1.5, unblockable: ph2 && R() < 0.5, roll: 0.05, flip: true, lunge: 8 })]] : [];
      this.swing('c1', 1.0, 0.55, { range: 3, dmg: 1, roll: -0.6, lunge: 8 }, [[0.95, () => this.swing('c2', 1.0, 0.45, { range: 3, dmg: 1, roll: 0.3, flip: false, lunge: 8 }, tail)]]);
    } else if (r < 0.75) {
      // fire pillars in a line toward the player
      this.anim.play('cast', { restart: true }); Audio.play('magic', 'fire'); this.telegraph(false);
      const steps = []; const n = ph2 ? 9 : 6;
      const dir = new THREE.Vector3(P.pos.x - this.pos.x, 0, P.pos.z - this.pos.z).normalize();
      const reach = this.distP() + 5;
      for (let i = 0; i < n; i++) { const d = 3 + i * 2.6; if (d > reach) break; steps.push([0.3 + i * 0.12, () => this.hazard(this.pos.clone().addScaledVector(dir, d), { radius: 1.9, delay: 0.75, kind: 'pillar', color: 0xff5a2a, dmg: 1.2 })]); }
      if (ph2) for (let i = 0; i < 4; i++) steps.push([0.5 + i * 0.3, () => this.hazard(P.pos, { radius: 2.2, delay: 0.8, kind: 'pillar', color: 0xff3020, dmg: 1.2 })]);
      this.do('pillars', 2.4, steps, (dt) => this.brake(dt));
    } else {
      // leaping overhead smash — parry it to trigger a blade clash
      this.anim.play('jump', { restart: true }); this.telegraph(false);
      this.do('leap', 2.2, [
        [0.35, () => { const T = 0.7; this.vel.set((P.pos.x - this.pos.x) / T, 14, (P.pos.z - this.pos.z) / T); this.anim.play('b_smash', { clip: BC.smash, speed: 1.2, restart: true }); this.swinging = true; this.trail?.clear(); }],
        [1.05, () => {
          this.brake(1); this.vel.set(0, 0, 0);
          const res = this.meleeHit({ range: 3.6, arc: 6.3, dmg: 1.6, heavy: true });
          this.quake(1.1); this.lastResult = res;
          if (res === 'parried' && ph2) this.G.story.bladeClash(this);
        }],
        [2.0, () => { this.swinging = false; }],
      ]);
    }
  }

  choose_knight(d) {
    const P = this.G.player; const r = R(); const ph2 = this.phase === 2;
    if (d > 7 && r < 0.5) {
      // shadow step behind the player
      this.do('blink', 1.2, [
        [0.15, () => { FX.glowBurst(_v.copy(this.pos).setY(this.pos.y + 1), { count: 20, color: [0.6, 0.2, 1], speed: 4 }); Audio.play('whoosh'); this.root.visible = false; }],
        [0.45, () => { const back = new THREE.Vector3(-Math.sin(P.yaw), 0, -Math.cos(P.yaw)).multiplyScalar(2.2); this.pos.copy(P.pos).add(back); this.root.visible = true; this.yaw = Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z); FX.glowBurst(_v.copy(this.pos).setY(this.pos.y + 1), { count: 20, color: [0.6, 0.2, 1], speed: 4 }); }],
        [0.5, () => this.swing('c2', 0.9, 0.35, { range: 3, dmg: 1.1, roll: 0.3, flip: false })],
      ]);
    } else if (r < 0.3) {
      // parry stance: punish attacks
      this.anim.play('block', { restart: true }); this.parryStance = true; this.G.ui.damage(_v.copy(this.pos).setY(this.pos.y + 2.4), 'STANCE', 'info');
      this.do('stance', 1.6, [[1.55, () => { this.parryStance = false; }]], (dt) => { this.facePlayer(dt, 6); this.brake(dt); });
    } else if (d < 5) {
      const fin = ph2 ? [[0.85, () => this.swing('rise', 1.0, 0.4, { range: 3, dmg: 1.2, roll: -1.5, flip: false }, [[0.9, () => this.swing('smash', 1.2, 0.6, { range: 3.2, dmg: 1.6, unblockable: true, roll: 1.4, flip: false })]])]] : [];
      this.swing('c1', 0.85, 0.4, { range: 3, dmg: 1, roll: -0.6, lunge: 10 }, [[0.8, () => this.swing('c2', 0.85, 0.35, { range: 3, dmg: 1, roll: 0.3, flip: false, lunge: 10 }, fin)]]);
    } else {
      // arc wave projectiles
      this.anim.play('b_cross', { clip: BC.cross, restart: true, speed: 1.4 }); this.telegraph(false);
      const steps = [];
      for (let i = 0; i < (ph2 ? 3 : 2); i++) steps.push([0.5 + i * 0.35, () => {
        const geo = new THREE.RingGeometry(0.7, 1.3, 16, 1, -1.1, 2.2); geo.rotateX(-Math.PI / 2); geo.rotateY(Math.PI / 2);
        const m = new THREE.Mesh(geo, glowMat(0xb04aff, 0.9)); const a = Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z); m.rotation.y = a;
        const pos = this.pos.clone(); pos.y += 1.1;
        this.G.combat.spawnProjectile({ pos, vel: new THREE.Vector3(Math.sin(a), 0, Math.cos(a)).multiplyScalar(24), mesh: m, radius: 1.1, dmg: 1.1, owner: this, ghost: true, trailColor: 0xb04aff, life: 1.5 });
        Audio.play('swing', 1.5);
      }]);
      this.do('waves', 1.6, steps, (dt) => { this.facePlayer(dt, 4); this.brake(dt); });
    }
  }

  choose_herald(d) {
    const P = this.G.player; const ph2 = this.phase === 2; const r = R();
    if (r < 0.3) {
      this.hpose = 'smashWind'; this.telegraph(false);
      this.do('smash', 1.6, [[0.2, () => this.hazard(P.pos, { radius: 3.2, delay: 0.75, dmg: 1.3, color: 0x5fd8ff, follow: true })], [0.95, () => { this.hpose = 'smash'; this.hsnap = true; this.quake(0.8, P.pos); }], [1.05, () => { this.hsnap = false; }]], (dt) => this.facePlayer(dt, 3));
    } else if (r < 0.5 && d < 12) {
      this.hpose = 'clapWind'; this.telegraph(true);
      this.do('clap', 1.6, [[0.9, () => { this.hpose = 'clap'; this.hsnap = true; Audio.play('clang', 2); this.G.cam.shake(0.6); FX.flash(0.3); this.G.combat.enemyHit(this, { range: 14, arc: 1.6, dmg: 1.5, heavy: true, unblockable: true, up: 4 }); }], [1.0, () => { this.hsnap = false; }]], (dt, t) => { if (t < 0.7) this.facePlayer(dt, 3); });
    } else if (r < 0.75) {
      // laser grid: lines of pillars
      Audio.play('laser'); this.telegraph(false);
      const steps = []; const lines = ph2 ? 3 : 2;
      for (let l = 0; l < lines; l++) {
        const ang = R() * Math.PI; const dir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
        steps.push([0.2 + l * 0.6, () => { for (let i = -6; i <= 6; i++) this.hazard(P.pos.clone().addScaledVector(dir, i * 3), { radius: 1.6, delay: 0.9, kind: 'pillar', color: 0xfff0a0, dmg: 1.1 }); }]);
      }
      this.do('grid', 0.6 * lines + 1.4, steps);
    } else {
      // data cube rain
      Audio.play('glitch'); this.G.post.glitchFor(0.3);
      const steps = [];
      for (let i = 0; i < (ph2 ? 14 : 9); i++) steps.push([0.2 + i * 0.12, () => { const a = R() * 6.28, rr = R() * 9; this.hazard(new THREE.Vector3(P.pos.x + Math.cos(a) * rr, P.pos.y, P.pos.z + Math.sin(a) * rr), { radius: 1.8, delay: 0.9, color: 0x5fd8ff, dmg: 1, kind: 'pillar' }); }]);
      if (ph2 && this.G.enemies.filter((e) => e.type === 'sentinel' && e.alive).length < 2) steps.push([1.2, () => this.G.spawnEnemy('sentinel', 30, this.front(6))]);
      this.do('rain', 2.6, steps);
    }
  }

  animate(dt) {
    if (this.humanoid) {
      if (!this.act && this.alive && this.state !== 'stagger' && this.state !== 'clash' && this.state !== 'finished') { const sp = Math.hypot(this.vel.x, this.vel.z); this.anim.play(sp > 3 ? 'run' : sp > 0.6 ? 'walk' : 'guard', { speed: sp > 3 ? sp / 9 : 1 }); }
      if (this.state === 'stagger' && this.anim.name !== 'kneel') this.anim.play('kneel');
      if (this.state === 'dead' && this.anim.name !== 'death') this.anim.play('death', { restart: true });
      this.anim.update(dt);
      this.char.updateSecondary(dt, this.vel);
      return;
    }
    const s = this.state;
    if ((this.kind === 'golem' || this.kind === 'behemoth') && this.alive && Math.hypot(this.vel.x, this.vel.z) > 1) {
      this.stepT = (this.stepT || 0) - dt;
      if (this.stepT <= 0) { this.stepT = this.kind === 'golem' ? 0.55 : 0.32; this.G.cam.shake(this.kind === 'golem' ? 0.12 : 0.06); FX.dustAt(this.pos, { count: 4, speed: 3, size: 1.2 }); Audio.play('land', 1.6); }
    }
    if (this.kind === 'golem') {
      const st = s === 'dead' ? 'dead' : s === 'stagger' ? 'stagger' : (this.act ? 'act' : Math.hypot(this.vel.x, this.vel.z) > 0.5 ? 'run' : 'idle');
      this.cr.anim(st, this.animT, { pose: s === 'dead' ? 'dead' : s === 'stagger' ? 'stagger' : (this.act ? this.pose : 'idle'), snap: this.snap });
    } else if (this.kind === 'behemoth') {
      const st = s === 'dead' ? 'dead' : s === 'stagger' ? 'stagger' : this.act ? (this.wstate || 'idle') : (Math.hypot(this.vel.x, this.vel.z) > 0.5 ? 'run' : 'idle');
      this.cr.anim(st, this.animT, { speed: 7 });
    } else if (this.kind === 'herald') {
      this.cr.anim(s === 'dead' ? 'dead' : this.glintT > 0 ? 'windup' : 'idle', this.animT, { pose: this.act ? this.hpose : null, snap: this.hsnap, phase2: this.phase === 2 });
    }
  }

  receiveHit(info) {
    if (this.dormant) return 'immune';
    if (this.parryStance && info.from === this.G.player && !info.unblockable) {
      // the knight counters
      this.parryStance = false; this.act = null;
      Audio.play('parry'); Time.hitStop(0.12); this.G.ui.damage(_v.copy(this.pos).setY(this.pos.y + 2.2), 'COUNTERED', 'crit');
      FX.sparksAt(_v.copy(this.pos).setY(this.pos.y + 1.2), null, { count: 30, speed: 14 });
      this.G.combat.damagePlayer(this, { dmg: 1.2, heavy: true }, new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)));
      return 'blocked';
    }
    if (this.kind === 'varkas') info = { ...info, dmg: Math.min(info.dmg * (this.dmgTakenMult || 1), Math.max(0, this.hp - 1)) / (this.dmgTakenMult || 1) };
    const r = super.receiveHit(info);
    if (r === 'hit') this.G.story.bossTaunt?.(this);
    return r;
  }
  onParried() {
    this.posture += this.maxPosture * 0.22; this.postureT = 2.5;
    if (this.posture >= this.maxPosture) { this.act = null; this.stagger(); }
  }
  stagger() { this.act = null; this.swinging = false; super.stagger(); }
  die(info) {
    this.act = null; this.swinging = false;
    super.die(info);
  }
}

function slashQ(yaw, roll) {
  const e = new THREE.Euler(0, yaw, roll, 'YXZ'); const q = new THREE.Quaternion().setFromEuler(e);
  return q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2));
}
export { clamp, damp, angleDiff };
