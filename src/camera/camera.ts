// Third-person spring-arm camera: free orbit, collision pull-in, lock-on orbit, subtle punch, cinematic shots.
import * as THREE from 'three';
import { clamp, damp, dampAngle, lerp } from '../core/util';
import type { Collision } from '../world/collision';

export class ThirdPersonCamera {
  yaw = Math.PI;      // camera sits at -forward of yaw; yaw=PI looks toward -Z
  pitch = 0.28;
  dist = 4.4;
  private curDist = 4.4;
  pivot = new THREE.Vector3();
  private punch = new THREE.Vector3();
  private punchV = new THREE.Vector3();
  private shake = 0;
  lockTarget: THREE.Vector3 | null = null;
  private idleLook = 0;
  cinematic: { pos: THREE.Vector3; look: THREE.Vector3; blend: number } | null = null;
  private cinBlend = 0;
  /** Blend speed into/out of cinematic shots; finishers use fast cuts and a quicker return. */
  cinRate = 2.2;
  cinFollow = 2.5;
  /** Hard cut: jump straight to the shot this frame (no blend). */
  cut(pos: THREE.Vector3, look: THREE.Vector3) {
    this.cinematic = { pos: pos.clone(), look: look.clone(), blend: 1 };
    this.lastCin.pos.copy(pos);
    this.lastCin.look.copy(look);
    this.cinBlend = 1;
  }
  private lastCin = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  fovBase = 62;

  constructor(public cam: THREE.PerspectiveCamera, private col: Collision) {}

  addPunch(dir: THREE.Vector3, amount: number) {
    this.punchV.addScaledVector(dir, amount);
  }
  addShake(a: number) { this.shake = Math.min(1, this.shake + a); }

  update(dt: number, target: THREE.Vector3, look: THREE.Vector2, opts: { sprint: boolean; moving: boolean; playerYaw: number; indoor: boolean; scale?: number }) {
    // Pivot: head height, smoothed vertically to absorb jump/landing jitter
    const ph = 1.55;
    this.pivot.x = damp(this.pivot.x, target.x, 18, dt);
    this.pivot.z = damp(this.pivot.z, target.z, 18, dt);
    this.pivot.y = damp(this.pivot.y, target.y + ph, 9, dt);
    if (this.pivot.distanceToSquared(target) > 100) this.pivot.set(target.x, target.y + ph, target.z);

    if (this.lockTarget) {
      const dx = this.lockTarget.x - target.x, dz = this.lockTarget.z - target.z;
      const want = Math.atan2(dx, dz) + Math.PI; // camera behind player, looking at target
      this.yaw = dampAngle(this.yaw, want + look.x * 0, 7, dt);
      const d = Math.hypot(dx, dz);
      const tgtPitch = clamp(0.2 + (this.lockTarget.y - target.y) * -0.02 + (d < 3 ? 0.15 : 0), 0.05, 0.6);
      this.pitch = damp(this.pitch, tgtPitch, 4, dt);
      this.idleLook = 0;
    } else {
      this.yaw -= look.x;
      this.pitch = clamp(this.pitch + look.y, -0.45, 1.15);
      if (look.lengthSq() > 0) this.idleLook = 0; else this.idleLook += dt;
      // Gentle recenter behind the player when running with no camera input
      if (opts.moving && this.idleLook > 2.0) {
        this.yaw = dampAngle(this.yaw, opts.playerYaw + Math.PI, 0.8, dt);
      }
    }

    const s = opts.scale ?? 1;
    const wantDist = (this.lockTarget ? 5.0 : opts.sprint ? 4.9 : this.dist) * (opts.indoor ? 0.85 : 1) * s;
    // Shoulder offset to the right so the player doesn't block the reticle/targets
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const off = new THREE.Vector3(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), Math.cos(this.yaw) * Math.cos(this.pitch));
    const piv = this.pivot.clone().addScaledVector(right, 0.35);
    const desired = piv.clone().addScaledVector(off, wantDist);
    const free = this.col.raycast(piv, desired, 0.28);
    const allowed = Math.max(0.6, wantDist * free);
    // Snap in immediately on collision, ease back out
    this.curDist = allowed < this.curDist ? allowed : damp(this.curDist, allowed, 3.5, dt);
    const pos = piv.clone().addScaledVector(off, this.curDist);

    // Punch spring
    this.punchV.addScaledVector(this.punch, -220 * dt);
    this.punchV.multiplyScalar(Math.exp(-18 * dt));
    this.punch.addScaledVector(this.punchV, dt);
    pos.add(this.punch);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      const t = performance.now() * 0.05;
      pos.x += Math.sin(t * 1.3) * this.shake * 0.08;
      pos.y += Math.sin(t * 1.7) * this.shake * 0.06;
    }

    let lookAt = piv.clone().addScaledVector(off, -6);
    lookAt.y = piv.y + 0.15 - Math.sin(this.pitch) * 2.5;
    if (this.lockTarget) {
      lookAt = this.pivot.clone().lerp(this.lockTarget, 0.5);
      lookAt.y = lerp(this.pivot.y - 0.2, this.lockTarget.y, 0.4);
    }

    // Cinematic override blend
    this.cinBlend = damp(this.cinBlend, this.cinematic ? 1 : 0, this.cinRate, dt);
    if (this.cinematic) {
      this.lastCin.pos.lerp(this.cinematic.pos, 1 - Math.exp(-this.cinFollow * dt));
      this.lastCin.look.lerp(this.cinematic.look, 1 - Math.exp(-(this.cinFollow + 0.5) * dt));
    } else if (this.cinBlend < 0.01) {
      this.lastCin.pos.copy(pos); this.lastCin.look.copy(lookAt);
    }
    if (this.cinBlend > 0.001) {
      pos.lerp(this.lastCin.pos, this.cinBlend);
      lookAt.lerp(this.lastCin.look, this.cinBlend);
    }
    this.cam.position.copy(pos);
    this.cam.lookAt(lookAt);
    const fov = this.fovBase + (opts.sprint && opts.moving ? 5 : 0) + (this.lockTarget ? -3 : 0);
    if (Math.abs(this.cam.fov - fov) > 0.05) { this.cam.fov = damp(this.cam.fov, fov, 4, dt); this.cam.updateProjectionMatrix(); }
  }

  /** Camera-relative ground-plane basis for movement. */
  basis() {
    const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    return { fwd, right };
  }
}
