// Hit detection & resolution, impact presentation (hit-stop, shake, sparks, impact frames,
// slow motion), projectiles and area attacks shared by the player, enemies and bosses.
import * as THREE from 'three';
import { Time } from '../core/time.js';
import { Audio } from '../core/audio.js';
import { FX } from '../render/fx.js';
import { angleDiff, clamp } from '../core/util.js';
import { glowMat } from '../render/toon.js';

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

/** Orientation of a crescent slash effect for a character facing `yaw`. */
export function slashQuat(yaw, roll = 0, pitch = 0) {
  _e.set(pitch, yaw, roll, 'YXZ');
  const q = new THREE.Quaternion().setFromEuler(_e);
  const base = new THREE.Quaternion().setFromAxisAngle(UP, -Math.PI / 2);
  return q.multiply(base);
}

const hex2rgb = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };

export class Combat {
  constructor(G) { this.G = G; this.projectiles = []; this.hazards = []; }

  /** Candidates hit by an arc in front of the attacker. */
  query(attacker, hit, targets, reach = 1) {
    const out = [];
    const range = hit.range * reach;
    const ay = attacker.yaw;
    for (const t of targets) {
      if (!t.alive || t === attacker || t.untargetable) continue;
      const dx = t.pos.x - attacker.pos.x, dz = t.pos.z - attacker.pos.z;
      const d = Math.hypot(dx, dz) - (t.radius || 0.5);
      if (d > range) continue;
      const ang = Math.atan2(dx, dz);
      if (d > 0.4 && Math.abs(angleDiff(ay, ang)) > hit.arc / 2) continue;
      const dy = t.pos.y - attacker.pos.y;
      const th = t.height || 1.6;
      if (dy > hit.up || dy + th < -0.8 - (hit.air ? 1.5 : 0)) continue;
      out.push(t);
    }
    return out;
  }

  slashFX(attacker, hit, weaponDef) {
    const s = hit.slash; if (!s) return;
    const color = s.dark ? 0x8a2aff : (weaponDef?.trail ?? 0x9fe8ff);
    const core = s.dark ? 0x100018 : (weaponDef?.core ?? 0xffffff);
    const pos = attacker.pos.clone(); pos.y += (attacker.height || 1.7) * 0.6;
    const fwd = new THREE.Vector3(Math.sin(attacker.yaw), 0, Math.cos(attacker.yaw));
    pos.addScaledVector(fwd, 0.35);
    const reach = (weaponDef?.reach || 2.2) / 2.2;
    if (s.thrust) {
      for (let i = 0; i < 2; i++) FX.sparks.spawn({ x: pos.x + fwd.x * 0.5, y: pos.y, z: pos.z + fwd.z * 0.5, vx: fwd.x * 40, vy: 0, vz: fwd.z * 40, life: 0.12, size: 0.5, r: 1, g: 1, b: 1, stretch: 0.06 });
      FX.ring(pos.clone().addScaledVector(fwd, 1.4), { color, from: 0.2, to: 1.6, dur: 0.18, y: 0, vertical: fwd, opacity: 1 });
      return;
    }
    FX.slash(pos, slashQuat(attacker.yaw, s.roll || 0, s.pitch || 0), { color, core, scale: (s.scale || 1) * reach * 1.15, flip: !!s.flip, dur: 0.1, life: 0.26 });
    if (hit.slash2) {
      const s2 = hit.slash2;
      FX.slash(pos, slashQuat(attacker.yaw, s2.roll || 0, 0), { color, core, scale: (s2.scale || 1) * reach * 1.15, flip: !!s2.flip, dur: 0.12, life: 0.3 });
    }
  }

  /** Spectacle for a landed hit. power ~ 1..3 */
  impact(pos, dir, { power = 1, color = 0x9fe8ff, crit = false, finale = false, blocked = false, heavy = false } = {}) {
    const G = this.G;
    const rgb = hex2rgb(color);
    if (blocked) {
      FX.sparksAt(pos, dir, { count: 18, color: [1, 0.85, 0.4], speed: 12 });
      FX.impactStar(pos, { size: 0.9, color: [1, 0.9, 0.5] });
      Audio.play('clang', 0.8);
      Time.hitStop(0.05); G.cam.shake(0.12);
      return;
    }
    FX.sparksAt(pos, dir, { count: 10 + power * 8, color: [1, 0.95, 0.8], speed: 9 + power * 3 });
    FX.sparksAt(pos, dir, { count: 6 + power * 4, color: rgb, speed: 7 + power * 3, size: 0.18 });
    FX.glowBurst(pos, { count: 4 + power * 3, color: rgb, speed: 3, size: 0.5 + power * 0.2, life: 0.3 });
    if (power >= 1.4 || crit) FX.impactStar(pos, { size: 1 + power * 0.6, color: crit ? [1, 0.9, 0.4] : [1, 1, 1] });
    if (power >= 1.8 || finale) { FX.ring(pos, { color, from: 0.3, to: 3 + power, dur: 0.3, y: 0, vertical: dir.clone().normalize(), opacity: 0.9 }); FX.light(pos, color, 25 * power, 0.25); }
    Audio.play('hit', power);
    if (crit || finale || heavy) { G.post.impactFrame(finale ? 3 : 2, finale ? 2 : 1); G.post.aberrate(0.8 + power * 0.3); }
    if (finale) {
      Time.slowMo(1.1, 0.18); G.cam.critical(0.7); G.cam.punch(2.2); G.cam.kick(10);
      FX.speedLines(1.2, 0.6); G.post.blur(1.2); FX.flash(0.5);
      Audio.play('explosion', 1.4); Audio.duck(0.2, 1.2);
    }
  }

  /** Player hits enemies with a move hit. Returns number of targets hit. */
  playerHit(player, move, hit, alreadyHit) {
    const G = this.G;
    const W = player.weaponDef;
    const reach = W.reach / 2.2;
    const targets = this.query(player, hit, G.enemies, reach);
    let n = 0;
    for (const t of targets) {
      if (alreadyHit.has(t)) continue;
      alreadyHit.add(t);
      n++;
      const crit = Math.random() < (hit.crit || 0) + player.stats.crit;
      let dmg = player.stats.atk * W.dmg * hit.dmg * (0.9 + Math.random() * 0.2) * (crit ? 1.8 : 1) * player.dmgMult();
      if (player.counterWindow > 0 && move.id !== 'counter') { dmg *= 1.3; }
      const dir = new THREE.Vector3(t.pos.x - player.pos.x, 0, t.pos.z - player.pos.z).normalize();
      const res = t.receiveHit({ dmg, dir, hit, crit, from: player, launch: hit.launch, juggle: hit.juggle, kb: hit.kb, stun: hit.stun, posture: hit.posture * (W.kind === 'great' ? 1.5 : 1), down: hit.down, guardBreak: hit.guardBreak, unblockable: hit.unblockable });
      const contact = t.pos.clone(); contact.y += (t.height || 1.5) * 0.55; contact.addScaledVector(dir, -(t.radius || 0.5) * 0.6);
      if (res === 'blocked') { this.impact(contact, dir.clone().negate(), { blocked: true }); continue; }
      if (res === 'immune') continue;
      const power = hit.pow * (crit ? 1.3 : 1);
      this.impact(contact, dir, { power, color: W.trail, crit, finale: hit.finale, heavy: hit.pow >= 1.8 });
      Time.hitStop(clamp(hit.stop * (crit ? 1.4 : 1), 0.03, 0.22));
      G.cam.shake(hit.shake * (crit ? 1.3 : 1));
      if (hit.pow >= 1.5) G.cam.kick(4 + hit.pow * 2);
      G.ui.damage(contact, Math.round(t.lastDamage ?? dmg), crit ? 'crit' : '');
      player.onHitLanded(t, dmg, hit, crit);
      if (W.drain) player.heal(dmg * W.drain, true);
      if (hit.quake) { FX.ring(t.pos, { color: 0xffffff, from: 1, to: 8, dur: 0.4 }); FX.debrisAt(t.pos, { count: 12, color: 0x7a6a55 }); }
      if (hit.delayedCuts) this.delayedCuts(t, hit.delayedCuts, dmg * 0.25, W);
    }
    return n;
  }

  delayedCuts(t, n, dmg, W) {
    // anime "the cuts appear after the sheathe" effect
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        if (!t.alive) return;
        const p = t.pos.clone(); p.y += (t.height || 1.5) * 0.5;
        FX.slash(p, slashQuat(Math.random() * 6.28, (Math.random() - 0.5) * 3), { color: W.trail, scale: 1.4, dur: 0.06, life: 0.18, flip: Math.random() < 0.5 });
        Audio.play('hit', 1.2);
        t.receiveHit({ dmg, dir: new THREE.Vector3(0, 0, 0), hit: { stun: 0.3, posture: 6, juggle: 2 }, from: this.G.player, kb: 0.3, stun: 0.3, posture: 6 });
        this.G.ui.damage(p, Math.round(dmg), '');
        Time.hitStop(0.04); this.G.cam.shake(0.15);
      }, 380 + i * 90);
    }
  }

  /** Enemy attack hits the player (melee). Returns result string. */
  enemyHit(enemy, atk) {
    const G = this.G; const p = G.player;
    if (!p.alive) return 'miss';
    const dx = p.pos.x - enemy.pos.x, dz = p.pos.z - enemy.pos.z;
    const d = Math.hypot(dx, dz) - p.radius - (enemy.radius || 0.5) * 0.4;
    if (d > atk.range) return 'miss';
    if (atk.arc < 6.2 && Math.abs(angleDiff(enemy.yaw, Math.atan2(dx, dz))) > atk.arc / 2) return 'miss';
    const dy = p.pos.y - enemy.pos.y;
    if (dy > (atk.up ?? 2.2) || dy < -2) return 'miss';
    return this.damagePlayer(enemy, atk, new THREE.Vector3(dx, 0, dz).normalize());
  }

  damagePlayer(source, atk, dir) {
    const G = this.G; const p = G.player;
    const dmg = Math.max(1, (source.atk || 10) * (atk.dmg || 1) - p.stats.def * 0.5) * (0.9 + Math.random() * 0.2);
    const res = p.receiveHit({ dmg, dir, atk, from: source });
    const contact = p.pos.clone(); contact.y += 1.1;
    if (res === 'parried') {
      FX.sparksAt(contact, dir.clone().negate(), { count: 40, color: [1, 0.9, 0.5], speed: 16 });
      FX.impactStar(contact, { size: 2.6, color: [1, 0.95, 0.6], life: 0.18 });
      FX.ring(contact, { color: 0xffe08a, from: 0.3, to: 4, dur: 0.35, y: 0, vertical: dir.clone() });
      FX.light(contact, 0xffe08a, 40, 0.3);
      Audio.play('parry'); Time.hitStop(0.12); Time.slowMo(0.9, 0.22); G.cam.shake(0.35); G.cam.punch(1.6); G.cam.kick(8);
      G.post.impactFrame(2, 1); FX.speedLines(0.8, 0.3);
      source.onParried?.();
      G.ui.damage(contact, 'PARRY!', 'info');
    } else if (res === 'blocked') {
      this.impact(contact, dir.clone().negate(), { blocked: true });
      source.onBlocked?.();
    } else if (res === 'perfectDodge') {
      Time.slowMo(1.0, 0.2); G.post.desatT = 0.6; setTimeout(() => (G.post.desatT = 0), 700);
      FX.speedLines(0.6, 0.4); Audio.play('whoosh');
      G.ui.damage(contact, 'PERFECT DODGE', 'info');
    } else if (res === 'hit') {
      FX.sparksAt(contact, dir, { count: 14, color: [1, 0.4, 0.4], speed: 10 });
      FX.impactStar(contact, { size: 1.1, color: [1, 0.5, 0.5] });
      Audio.play('hit', atk.heavy ? 1.6 : 1);
      Time.hitStop(atk.heavy ? 0.12 : 0.07); G.cam.shake(atk.heavy ? 0.5 : 0.3); FX.flash(0.15, '#f33');
      G.ui.damage(contact, Math.round(p.lastDamage), 'player');
      if (atk.heavy) G.post.impactFrame(1, 1);
    }
    return res;
  }

  // ---------------------------------------------------------------- projectiles & hazards
  spawnProjectile(o) {
    const mesh = o.mesh || new THREE.Mesh(new THREE.SphereGeometry(o.radius || 0.3, 8, 6), glowMat(o.color || 0xff5533));
    mesh.position.copy(o.pos); this.G.scene.add(mesh);
    const p = { life: 3, radius: 0.4, dmg: 1, team: 'enemy', ...o, mesh, hit: new Set() };
    this.projectiles.push(p);
    return p;
  }
  /** Telegraphed ground AoE (circle) that detonates after delay. */
  spawnHazard(o) {
    const r = o.radius || 3;
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.92, r, 40), glowMat(o.color || 0xff3355, 0.8)); ring.rotation.x = -Math.PI / 2;
    const fill = new THREE.Mesh(new THREE.CircleGeometry(r, 40), glowMat(o.color || 0xff3355, 0.25)); fill.rotation.x = -Math.PI / 2; fill.scale.setScalar(0.01);
    const g = new THREE.Group(); g.add(ring); g.add(fill); g.position.copy(o.pos); g.position.y += 0.12; this.G.scene.add(g);
    const h = { t: 0, delay: 1, dmg: 1, team: 'enemy', ...o, radius: r, g, fill };
    this.hazards.push(h);
    return h;
  }
  update(dt) {
    const G = this.G;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      if (p.homing && p.target?.alive) { _v.copy(p.target.pos); _v.y += 1; _v.sub(p.mesh.position).normalize().multiplyScalar(p.vel.length()); p.vel.lerp(_v, Math.min(1, dt * p.homing)); }
      if (p.gravity) p.vel.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.spin) p.mesh.rotation.y += dt * p.spin;
      if (p.trailColor && Math.random() < 0.7) FX.glow.spawn({ x: p.mesh.position.x, y: p.mesh.position.y, z: p.mesh.position.z, life: 0.25, size: (p.radius || 0.4) * 1.6, ...rgbObj(p.trailColor), grow: -1 });
      let dead = p.life <= 0;
      const gy = G.world.groundAt(p.mesh.position.x, p.mesh.position.z, p.mesh.position.y);
      if (p.mesh.position.y < gy && !p.ghost) dead = true;
      if (!dead) {
        if (p.team === 'enemy') {
          const pl = G.player;
          if (pl.alive && p.mesh.position.distanceTo(_v.copy(pl.pos).setY(pl.pos.y + 1)) < p.radius + 0.5) {
            this.damagePlayer(p.owner || { atk: p.atk || 15 }, { dmg: p.dmg, heavy: p.heavy, unblockable: p.unblockable, projectile: true }, p.vel.clone().setY(0).normalize());
            dead = !p.pierce;
          }
        } else {
          for (const e of G.enemies) {
            if (!e.alive || p.hit.has(e)) continue;
            if (p.mesh.position.distanceTo(_v.copy(e.pos).setY(e.pos.y + (e.height || 1.5) * 0.5)) < p.radius + (e.radius || 0.5)) {
              p.hit.add(e);
              const dir = p.vel.clone().setY(0).normalize();
              const res = e.receiveHit({ dmg: p.dmg, dir, hit: { stun: 0.4, posture: 10 }, from: G.player, kb: 2, stun: 0.4, posture: 10, juggle: 3 });
              if (res !== 'immune') { this.impact(p.mesh.position.clone(), dir, { power: 1.3, color: p.color || 0x6fd8ff }); G.ui.damage(p.mesh.position, Math.round(e.lastDamage ?? p.dmg), ''); Time.hitStop(0.04); G.player.onHitLanded(e, p.dmg, { pow: 1 }, false); }
              if (!p.pierce) { dead = true; break; }
            }
          }
        }
      }
      if (dead) {
        if (p.explode) { FX.glowBurst(p.mesh.position, { count: 14, color: hex2rgb(p.color || 0xff5533), speed: 6, size: 0.8 }); FX.ring(p.mesh.position, { color: p.color || 0xff5533, to: 2.5, dur: 0.3 }); Audio.play('explosion', 0.5); }
        G.scene.remove(p.mesh); this.projectiles.splice(i, 1);
      }
    }
    for (let i = this.hazards.length - 1; i >= 0; i--) {
      const h = this.hazards[i]; h.t += dt;
      const k = Math.min(1, h.t / h.delay); h.fill.scale.setScalar(Math.max(0.01, k));
      if (h.follow && h.t < h.delay * 0.6) { h.g.position.x += (G.player.pos.x - h.g.position.x) * dt * 2; h.g.position.z += (G.player.pos.z - h.g.position.z) * dt * 2; }
      if (h.t >= h.delay) {
        const c = h.g.position;
        const color = h.color || 0xff3355;
        if (h.kind === 'pillar') FX.pillar(c, { color, radius: h.radius * 0.7, height: 18, dur: 0.6 });
        if (h.kind === 'ice') for (let k2 = 0; k2 < 6; k2++) FX.debrisAt(c, { count: 2, color: 0xbfe9ff, speed: 6, size: 0.5 });
        FX.ring(c, { color, from: 0.5, to: h.radius * 1.2, dur: 0.35 }); FX.dustAt(c, { count: 10, speed: 5, color: h.kind === 'ice' ? [0.85, 0.95, 1] : [0.6, 0.5, 0.45] });
        FX.glowBurst(c, { count: 16, color: hex2rgb(color), speed: 8, size: 0.9, up: 1 });
        Audio.play('explosion', 0.7); G.cam.shake(0.25);
        const pl = G.player;
        if (h.team !== 'player' && pl.alive && Math.hypot(pl.pos.x - c.x, pl.pos.z - c.z) < h.radius + 0.3 && pl.pos.y - c.y < 3) {
          this.damagePlayer(h.owner || { atk: h.atk || 15 }, { dmg: h.dmg, heavy: true, unblockable: !!h.unblockable, launch: h.launch }, new THREE.Vector3(pl.pos.x - c.x, 0, pl.pos.z - c.z).normalize());
        }
        G.scene.remove(h.g); this.hazards.splice(i, 1);
      }
    }
  }
  clear() {
    for (const p of this.projectiles) this.G.scene.remove(p.mesh);
    for (const h of this.hazards) this.G.scene.remove(h.g);
    this.projectiles.length = 0; this.hazards.length = 0;
  }
}
function rgbObj(hex) { const c = new THREE.Color(hex); return { r: c.r, g: c.g, b: c.b }; }
export { hex2rgb };
