// Third-person action camera: orbit, lock-on framing, trauma shake, FOV punches, boss framing,
// dynamic "critical hit" zooms and scripted cinematic shots.
import * as THREE from 'three';
import { Input } from './input.js';
import { Time } from './time.js';
import { clamp, damp, lerp, angleDiff, makeNoise } from './util.js';

const nz = makeNoise(9);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();

export class CameraRig {
  constructor(camera, world) {
    this.cam = camera; this.world = world;
    this.yaw = 0; this.pitch = 0.28; this.dist = 6.2; this.baseDist = 6.2;
    this.target = new THREE.Vector3(); this.smoothTarget = new THREE.Vector3();
    this.trauma = 0; this.fovBase = 55; this.fovKick = 0; this.zoomPunch = 0;
    this.lock = null; this.boss = null;
    this.shot = null; // cinematic override
    this.sens = 0.0024; this.offsetSide = 0.0;
    this.pos = new THREE.Vector3(); this.look = new THREE.Vector3();
    this.critT = 0; this.critDir = 0;
  }
  shake(amount) { this.trauma = clamp(this.trauma + amount, 0, 1); }
  kick(fov = 6) { this.fovKick = Math.max(this.fovKick, fov); }
  punch(amount = 1.5) { this.zoomPunch = Math.max(this.zoomPunch, amount); }
  /** quick dramatic angle change toward the action, then ease back */
  critical(dur = 0.5) { this.critT = dur; this.critDir = Math.random() < 0.5 ? -1 : 1; }

  /** Play a cinematic shot: keys [{t, pos:[x,y,z], look:[x,y,z], fov}] relative to an anchor object or world. */
  play(keys, { anchor = null, onEnd = null, yawOf = null, holdLast = false } = {}) {
    this.shot = { keys, t: 0, anchor, onEnd, yawOf, holdLast };
  }
  stop() { this.shot = null; }
  orbitTo(yaw, pitch) { this.yaw = yaw; if (pitch != null) this.pitch = pitch; }

  update(player) {
    const rdt = Time.rdt;
    if (this.shot) { this.updateShot(rdt); this.applyShake(rdt); return; }
    // input
    if (Input.enabled) {
      this.yaw -= Input.mouseDX * this.sens; this.pitch += Input.mouseDY * this.sens;
      this.yaw -= Input.lookX * 2.6 * rdt; this.pitch += Input.lookY * 1.8 * rdt;
    }
    this.pitch = clamp(this.pitch, -0.35, 1.2);
    const p = player.pos;
    const h = player.height || 1.7;
    this.target.set(p.x, p.y + h * 0.82, p.z);
    let wantDist = this.baseDist;
    // lock-on: rotate yaw to keep target framed behind the player
    if (this.lock && this.lock.alive) {
      const L = this.lock.pos;
      const toT = Math.atan2(L.x - p.x, L.z - p.z);
      const wantYaw = toT + Math.PI;
      this.yaw += angleDiff(this.yaw, wantYaw) * (1 - Math.exp(-rdt * 5));
      const d = Math.hypot(L.x - p.x, L.z - p.z);
      wantDist = clamp(5 + d * 0.35, 6, 14) + (this.lock.radius || 0.5) * 1.2;
      this.target.lerp(_v.set(L.x, L.y + (this.lock.height || 1.5) * 0.5, L.z), 0.25);
      this.pitch = lerp(this.pitch, clamp(0.22 + (this.lock.height || 1.5) * 0.02, 0.15, 0.5), 1 - Math.exp(-rdt * 2));
    }
    if (this.boss && this.boss.alive) {
      // emphasize scale: further back and lower, looking up at the boss
      const B = this.boss.pos;
      const d = Math.hypot(B.x - p.x, B.z - p.z);
      wantDist = Math.max(wantDist, clamp(8 + this.boss.height * 0.8 + d * 0.15, 10, 22));
      this.target.lerp(_v.set(B.x, B.y + this.boss.height * 0.45, B.z), 0.3);
      if (!this.lock) this.pitch = lerp(this.pitch, 0.05, 1 - Math.exp(-rdt * 1.2));
    }
    if (player.inAir) wantDist += 1.2;
    wantDist -= this.zoomPunch;
    this.dist = damp(this.dist, wantDist, 4, rdt);
    this.zoomPunch = damp(this.zoomPunch, 0, 6, rdt);
    this.smoothTarget.x = damp(this.smoothTarget.x, this.target.x, 14, rdt);
    this.smoothTarget.z = damp(this.smoothTarget.z, this.target.z, 14, rdt);
    this.smoothTarget.y = damp(this.smoothTarget.y, this.target.y, player.inAir ? 6 : 10, rdt);
    if (this.smoothTarget.distanceTo(this.target) > 30) this.smoothTarget.copy(this.target);
    let yaw = this.yaw, pitch = this.pitch, dist = this.dist;
    if (this.critT > 0) {
      // swing the camera for a dramatic low angle on big hits
      this.critT -= rdt;
      const k = Math.sin(clamp(this.critT / 0.5, 0, 1) * Math.PI);
      yaw += this.critDir * 0.45 * k; pitch -= 0.18 * k; dist -= 1.6 * k;
    }
    const cp = Math.cos(pitch);
    _v.set(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp).multiplyScalar(dist);
    this.pos.copy(this.smoothTarget).add(_v);
    // over-the-shoulder framing during lock-on / boss fights so the player never hides the target
    this.shoulder = damp(this.shoulder || 0, (this.lock?.alive || this.boss?.alive) ? 1 : 0, 3, rdt);
    if (this.shoulder > 0.01) {
      const rx = Math.cos(yaw) * 1.4 * this.shoulder, rz = -Math.sin(yaw) * 1.4 * this.shoulder;
      this.pos.x += rx; this.pos.z += rz; this.pos.y += 0.5 * this.shoulder;
      _v2.set(rx * 0.8, 0, rz * 0.8);
    } else _v2.set(0, 0, 0);
    // keep above terrain
    const gh = this.world.heightAt(this.pos.x, this.pos.z);
    if (this.pos.y < gh + 0.6) this.pos.y = gh + 0.6;
    this.look.copy(this.smoothTarget).add(_v2);
    this.cam.position.copy(this.pos);
    this.cam.lookAt(this.look);
    this.fovKick = damp(this.fovKick, 0, 5, rdt);
    this.cam.fov = this.fovBase + this.fovKick;
    this.cam.updateProjectionMatrix();
    this.applyShake(rdt);
  }
  applyShake(rdt) {
    if (this.trauma > 0) {
      const s = this.trauma * this.trauma;
      const t = Time.real * 40;
      this.cam.position.x += nz(t, 1.3) * 0.45 * s; this.cam.position.y += nz(t, 7.1) * 0.35 * s; this.cam.position.z += nz(t, 3.7) * 0.45 * s;
      this.cam.rotation.z += nz(t, 9.9) * 0.06 * s;
      this.trauma = Math.max(0, this.trauma - rdt * 1.6);
    }
  }
  updateShot(rdt) {
    const S = this.shot; S.t += rdt;
    const keys = S.keys; let i = 0;
    while (i < keys.length - 2 && keys[i + 1].t <= S.t) i++;
    const a = keys[i], b = keys[Math.min(i + 1, keys.length - 1)];
    let u = b.t > a.t ? clamp((S.t - a.t) / (b.t - a.t), 0, 1) : 1;
    u = b.cut ? (u > 0 ? 1 : 0) : u * u * (3 - 2 * u);
    const anchor = S.anchor;
    const rot = S.yawOf ? S.yawOf.rotation.y : 0;
    const tr = (arr, out) => {
      out.set(arr[0], arr[1], arr[2]);
      if (anchor) { out.applyAxisAngle(new THREE.Vector3(0, 1, 0), rot); out.add(anchor.position || anchor); }
      return out;
    };
    const pa = tr(a.pos, new THREE.Vector3()), pb = tr(b.pos, new THREE.Vector3());
    const la = tr(a.look, new THREE.Vector3()), lb = tr(b.look, new THREE.Vector3());
    this.cam.position.lerpVectors(pa, pb, u);
    _v2.lerpVectors(la, lb, u);
    this.cam.lookAt(_v2);
    this.cam.fov = lerp(a.fov || this.fovBase, b.fov || this.fovBase, u) + this.fovKick;
    this.fovKick = damp(this.fovKick, 0, 5, rdt);
    this.cam.updateProjectionMatrix();
    if (S.t >= keys[keys.length - 1].t && !S.ended) { S.ended = true; if (!S.holdLast) this.shot = null; S.onEnd?.(); }
    // sync orbit so returning from the shot is smooth
    this.pos.copy(this.cam.position);
  }
}
