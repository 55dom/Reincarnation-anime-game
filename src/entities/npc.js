// Villagers & townsfolk: daily schedules, walking between places, activities, looking at and
// greeting the player, ambient barks, fear reactions, relationships and dialogue hooks.
import * as THREE from 'three';
import { Humanoid } from '../chars/humanoid.js';
import { Animator } from '../chars/anim.js';
import { damp, approachAngle, angleDiff, rng } from '../core/util.js';
import { Time } from '../core/time.js';

const R = rng(77);
const _v = new THREE.Vector3();

export class NPC {
  constructor(G, def) {
    this.G = G; this.def = def; this.id = def.id; this.name = def.name;
    this.char = new Humanoid(def.look);
    this.anim = new Animator(this.char); this.anim.play('idle');
    if (def.prop) this.char.attachEnemyWeapon(def.prop, 1);
    this.root = this.char.root; G.scene.add(this.root);
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.yaw = R() * 6;
    this.radius = 0.4; this.height = 1.7 * this.char.scale;
    this.offset = def.offset ? new THREE.Vector3(def.offset[0], 0, def.offset[1]) : new THREE.Vector3((R() - 0.5) * 2.5, 0, (R() - 0.5) * 2.5);
    this.visible = true; this.activity = 'idle'; this.target = null; this.barkT = 3 + R() * 10; this.greeted = false;
    this.scared = 0; this.talking = false; this.stuckT = 0;
    this.bubble = document.createElement('div');
    this.bubble.style.cssText = 'position:fixed;transform:translate(-50%,-100%);background:#fff;color:#111;font-weight:700;font-size:14px;padding:4px 10px;border-radius:12px;border:2px solid #111;pointer-events:none;z-index:9;display:none;white-space:nowrap';
    document.body.appendChild(this.bubble); this.bubbleT = 0;
    this.placeAtSchedule(true);
  }
  get affinity() { return this.G.flags.affinity?.[this.id] || 0; }
  addAffinity(n) {
    const f = this.G.flags; f.affinity = f.affinity || {}; f.affinity[this.id] = (f.affinity[this.id] || 0) + n;
    if (n > 0) this.G.ui.toast(`${this.name} ♥ ${f.affinity[this.id]}`, 'gold');
  }
  currentEntry() {
    const s = this.def.schedule; if (!s) return null;
    const h = this.G.hours;
    let cur = s[s.length - 1];
    for (const e of s) if (h >= e[0]) cur = e;
    return cur;
  }
  markerPos(name) {
    const m = this.G.world.markers[name];
    return m ? m.clone().add(this.offset) : null;
  }
  placeAtSchedule(force = false) {
    const e = this.currentEntry();
    const p = this.markerPos(e ? e[1] : this.def.home) || this.markerPos(this.def.home);
    if (!p) return;
    if (force) { this.pos.copy(p); this.pos.y = this.G.world.groundAt(p.x, p.z); }
    this.target = p; this.activity = e ? e[2] : 'idle';
  }
  say(text, dur = 3) { this.bubble.textContent = text; this.bubble.style.display = 'block'; this.bubbleT = dur; }

  update(dt) {
    const G = this.G; const P = G.player;
    const e = this.currentEntry();
    if (e) { const tp = this.markerPos(e[1]); if (tp && (!this.target || tp.distanceTo(this.target) > 0.5)) { this.target = tp; this.arrived = false; } this.activity = e[2]; }
    const dP = this.pos.distanceTo(P.pos);
    // simple visibility culling + sleeping NPCs vanish indoors
    const asleep = this.activity === 'sleep' && this.arrived;
    const far = dP > 140 || G.world.interior;
    this.visible = !asleep && !far && !this.hiddenByStory;
    this.root.visible = this.visible;
    if (far) { this.bubble.style.display = 'none'; return; }
    // fear: enemies fighting nearby
    const danger = G.inCombat && G.enemies.some((en) => en.alive && en.state !== 'idle' && en.pos.distanceTo(this.pos) < 18);
    if (danger) this.scared = 2;
    this.scared = Math.max(0, this.scared - dt);
    let moving = false;
    if (this.talking) {
      this.vel.set(0, 0, 0);
      this.yaw = approachAngle(this.yaw, Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z), dt * 6);
      this.anim.play('talk');
    } else if (this.scared > 0 && !this.def.brave) {
      this.anim.play('shock'); if (this.anim.done) this.anim.play('armsCross');
      if (R() < dt * 0.3) this.say(this.def.scaredLine || 'Monsters!!', 1.5);
    } else if (this.target && !this.arrived) {
      const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z; const d = Math.hypot(dx, dz);
      if (d < 0.6) { this.arrived = true; this.vel.set(0, 0, 0); }
      else {
        const sp = this.def.speed || 2.6;
        this.vel.x = damp(this.vel.x, dx / d * sp, 6, dt); this.vel.z = damp(this.vel.z, dz / d * sp, 6, dt);
        this.yaw = approachAngle(this.yaw, Math.atan2(dx, dz), dt * 6); moving = true;
        if (d > 120) { this.pos.copy(this.target); } // teleport if absurdly far (schedule jump while unseen)
      }
      this.anim.play('walk', { speed: 1 });
    } else {
      this.vel.set(0, 0, 0);
      const act = { idle: 'idle', talk: 'talk', hammer: 'hammer', sweep: 'sweep', sit: 'sit', pray: 'pray', wave: 'wave', cheer: 'cheer', cross: 'armsCross', cast: 'cast', bow: 'bow', sleep: 'idle', guard: 'armsCross', work: 'sweep', kneel: 'kneel' }[this.activity] || 'idle';
      if (act === 'cast') { if (this.anim.done || this.anim.name !== 'cast') this.anim.play('cast', { restart: true }); }
      else this.anim.play(act);
      if (this.activity === 'wander' && R() < dt * 0.25) { this.offset.set((R() - 0.5) * 8, 0, (R() - 0.5) * 8); this.arrived = false; }
      if (this.def.faceYaw != null && this.activity !== 'wander') this.yaw = approachAngle(this.yaw, this.def.faceYaw, dt * 3);
    }
    // look at player when nearby
    if (dP < 5 && !moving && P.alive) {
      const a = Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
      const rel = angleDiff(this.yaw, a);
      if (Math.abs(rel) < 2.2) { const h = this.char.j.head; h.rotation.y = Math.max(-1, Math.min(1, rel)); }
      else if (!this.talking && this.activity !== 'sit' && this.activity !== 'hammer') this.yaw = approachAngle(this.yaw, a, dt * 2);
      if (!this.greeted && this.def.greet) { this.greeted = true; const g = typeof this.def.greet === 'function' ? this.def.greet(G, this) : this.def.greet; if (g) this.say(g, 2.5); }
      // react to reckless sword swings
      if (P.state === 'attack' && dP < 2.6 && !this.talking && (this._swingReact || 0) < Time.game - 4) {
        this._swingReact = Time.game; this.char.setExpression('surprised', 1.5); this.say(this.def.swingLine || 'H-hey! Watch that sword!', 2); this.addAffinity(-1); this.anim.play('shock', { restart: true });
      }
    } else if (dP > 12) this.greeted = false;
    // ambient barks
    this.barkT -= dt;
    if (this.barkT < 0 && dP < 18 && this.def.barks?.length) { this.barkT = 8 + R() * 14; const b = this.def.barks[Math.floor(R() * this.def.barks.length)]; this.say(typeof b === 'function' ? b(G) : b, 3); }
    // physics
    this.pos.addScaledVector(this.vel, dt);
    const before = this.pos.clone();
    G.world.resolve(this.pos, this.radius);
    if (moving && before.distanceTo(this.pos) > 0.001) { this.stuckT += dt; if (this.stuckT > 1.5) { this.offset.set((R() - 0.5) * 6, 0, (R() - 0.5) * 6); this.stuckT = 0; const t = this.target; this.pos.addScaledVector(new THREE.Vector3(t.z - this.pos.z, 0, this.pos.x - t.x).normalize(), 0.6); } }
    else this.stuckT = Math.max(0, this.stuckT - dt);
    this.pos.y = G.world.groundAt(this.pos.x, this.pos.z, this.pos.y + 1);
    // player push
    const dx = this.pos.x - P.pos.x, dz = this.pos.z - P.pos.z; const dd = Math.hypot(dx, dz);
    if (dd < 0.8 && dd > 0.01) { this.pos.x += dx / dd * (0.8 - dd) * 0.5; this.pos.z += dz / dd * (0.8 - dd) * 0.5; }
    this.anim.update(dt);
    if (dP < 5 && !moving) { const h = this.char.j.head; const a = Math.atan2(P.pos.x - this.pos.x, P.pos.z - this.pos.z); h.rotation.y = Math.max(-1, Math.min(1, angleDiff(this.yaw, a))); }
    this.char.updateSecondary(dt, this.vel);
    this.root.position.copy(this.pos); this.root.rotation.y = this.yaw;
    // speech bubble
    if (this.bubbleT > 0) {
      this.bubbleT -= Time.rdt;
      _v.copy(this.pos); _v.y += this.height + 0.5; _v.project(G.camera);
      if (_v.z > 1 || this.bubbleT <= 0 || G.ui.dialogueOpen) this.bubble.style.display = 'none';
      else { this.bubble.style.display = 'block'; this.bubble.style.left = (_v.x * 0.5 + 0.5) * innerWidth + 'px'; this.bubble.style.top = (-_v.y * 0.5 + 0.5) * innerHeight + 'px'; }
    }
  }
  get questMark() { return this.def.questMark?.(this.G) || false; }
  async interact() {
    const G = this.G;
    this.talking = true; this.bubble.style.display = 'none';
    try { await this.def.talk(G, this); } finally { this.talking = false; }
  }
}
