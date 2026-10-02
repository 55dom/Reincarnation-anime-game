// ProcAnimator: one procedural animation system shared by the player, NPCs, beasts and bosses.
// Stride is phase-locked to ground speed (no foot sliding), with arm counter-swing, hip bob,
// acceleration lean, landing compression, turn-in-place steps and keyframed action poses
// (anticipation -> strike -> follow-through) blended over the locomotion layer.
import * as THREE from 'three';
import type { Rig } from './rig';
import { clamp, damp, lerp } from '../core/util';

export type PoseVal = [number, number, number];
export type Pose = Record<string, PoseVal>;
export interface PoseKey { t: number; pose: Pose; ease?: 'in' | 'out' | 'inout' | 'snap' }

export interface LocoInput {
  speed: number;      // horizontal m/s
  grounded: boolean;
  vy: number;
  turnRate: number;   // rad/s of yaw change
  crouch?: boolean;
  sprint?: boolean;
  guard?: boolean;
}

const ease = (t: number, e?: PoseKey['ease']) => {
  switch (e) {
    case 'in': return t * t * t;
    case 'out': return 1 - Math.pow(1 - t, 3);
    case 'snap': return 1 - Math.pow(1 - t, 6);
    default: return t * t * (3 - 2 * t);
  }
};

export function samplePose(keys: PoseKey[], t: number): Pose {
  if (t <= keys[0].t) return keys[0].pose;
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t <= b.t) {
      const k = ease((t - a.t) / Math.max(1e-4, b.t - a.t), b.ease);
      const out: Pose = {};
      const names = new Set([...Object.keys(a.pose), ...Object.keys(b.pose)]);
      for (const n of names) {
        const pa = a.pose[n] ?? [0, 0, 0], pb = b.pose[n] ?? [0, 0, 0];
        out[n] = [lerp(pa[0], pb[0], k), lerp(pa[1], pb[1], k), lerp(pa[2], pb[2], k)];
      }
      return out;
    }
  }
  return keys[keys.length - 1].pose;
}

export class ProcAnimator {
  phase = 0;
  private spd = 0;
  private land = 0;      // landing compression spring
  private landV = 0;
  private lean = 0;
  private sideLean = 0;
  private lastSpeed = 0;
  private turnStep = 0;
  private crouchW = 0;
  private airW = 0;
  private time = Math.random() * 10;
  action: { keys: PoseKey[]; dur: number; t: number; weight: number; fadeOut: number } | null = null;
  overlay: Pose | null = null; // static pose (e.g. guard, dead), weight-blended
  overlayW = 0;
  overlayTarget = 0;
  strideLen = 1.25;
  hitShake = 0;
  private applied: Pose = {};

  constructor(public rig: Rig) {
    if (rig.kind === 'quad') this.strideLen = rig.scale * 1.1;
    else this.strideLen = 1.3 * rig.scale;
  }

  play(keys: PoseKey[], dur: number) {
    this.action = { keys, dur, t: 0, weight: 1, fadeOut: 0 };
  }
  stopAction() { if (this.action) this.action.fadeOut = 0.12; }
  setOverlay(p: Pose | null, w = 1) { if (p) this.overlay = p; this.overlayTarget = p ? w : 0; }
  land_(impact: number) { this.landV -= clamp(impact, 0, 14) * 0.6; }
  hit() { this.hitShake = 1; }

  update(dt: number, inp: LocoInput) {
    this.time += dt;
    const J = this.rig.joints;
    const r = this.rig.rest;
    this.spd = damp(this.spd, inp.speed, 12, dt);
    const accel = (inp.speed - this.lastSpeed) / Math.max(dt, 1e-3);
    this.lastSpeed = inp.speed;
    this.lean = damp(this.lean, clamp(accel * 0.03 + this.spd * 0.025, -0.25, 0.35), 6, dt);
    this.sideLean = damp(this.sideLean, clamp(-inp.turnRate * this.spd * 0.03, -0.3, 0.3), 6, dt);
    this.crouchW = damp(this.crouchW, inp.crouch ? 1 : 0, 10, dt);
    this.airW = damp(this.airW, inp.grounded ? 0 : 1, 14, dt);

    // Landing spring
    this.landV += (-this.land * 160 - this.landV * 16) * dt;
    this.land += this.landV * dt;
    this.hitShake = Math.max(0, this.hitShake - dt * 5);

    // Stride phase advances with distance travelled; turning in place drives small steps.
    const stride = this.strideLen * (inp.sprint ? 1.35 : 1) * (inp.crouch ? 0.7 : 1);
    if (inp.grounded) {
      if (this.spd > 0.15) this.phase += (this.spd / stride) * Math.PI * 2 * dt * 0.5;
      else if (Math.abs(inp.turnRate) > 1.2) { this.turnStep = Math.min(1, this.turnStep + dt * 4); this.phase += dt * 9; }
      else this.turnStep = Math.max(0, this.turnStep - dt * 3);
    }
    const moveW = clamp(this.spd / 2.0, 0, 1) * (1 - this.airW);
    const stepW = Math.max(moveW, this.turnStep * 0.45 * (1 - this.airW));
    const runW = clamp((this.spd - 2.5) / 3.5, 0, 1);
    const P: Pose = {};
    const set = (n: string, x: number, y = 0, z = 0) => { P[n] = [x, y, z]; };

    if (this.rig.kind === 'biped') {
      const s = Math.sin(this.phase), c = Math.cos(this.phase);
      const amp = lerp(0.45, 0.85, runW) * stepW;
      const breathe = Math.sin(this.time * 1.7) * 0.02 * (1 - moveW);
      const comp = -this.land; // >0 when compressing
      const crouch = this.crouchW;
      const legBend = comp * 1.4 + crouch * 0.9 + this.airW * 0.5;
      // Legs: L leads at phase 0
      for (const [n, ph] of [['L', 0], ['R', Math.PI]] as const) {
        const ss = Math.sin(this.phase + ph), cc = Math.cos(this.phase + ph);
        const thigh = -ss * amp - legBend * 0.6 - this.airW * (n === 'L' ? 0.5 : -0.1);
        const knee = Math.max(0, cc) * amp * 1.4 + legBend + this.airW * (n === 'L' ? 0.9 : 0.4) + 0.05;
        set('thigh' + n, thigh, 0, n === 'L' ? 0.03 : -0.03);
        set('shin' + n, knee);
        set('foot' + n, -thigh * 0.4 - knee * 0.5 + Math.max(0, -cc) * amp * 0.3);
      }
      const armAmp = lerp(0.35, 0.9, runW) * moveW;
      const guard = inp.guard ? 1 : 0;
      set('armL', s * armAmp - guard * 0.3, 0, 0.12 + runW * 0.1);
      set('armR', -s * armAmp - guard * 0.5, 0, -0.12 - runW * 0.1);
      set('foreL', -0.15 - runW * 1.0 - Math.max(0, s) * armAmp * 0.4 - guard * 0.6);
      set('foreR', -0.25 - runW * 1.0 - Math.max(0, -s) * armAmp * 0.4 - guard * 0.9);
      const bob = Math.abs(c) * 0.05 * moveW * (1 + runW);
      const hipY = 0.95 - legBend * 0.13 - bob + 0.03 * moveW - crouch * 0.12;
      J['hips'].position.y = hipY;
      set('hips', this.lean * 0.3 + crouch * 0.1, s * 0.12 * moveW, this.sideLean * 0.5);
      set('spine', this.lean * 0.6 + comp * 0.4 + crouch * 0.25 + breathe, -s * 0.15 * moveW, 0);
      set('chest', this.lean * 0.3 + breathe, -s * 0.12 * moveW, -this.sideLean * 0.3);
      set('neck', -this.lean * 0.6 - crouch * 0.2, s * 0.08 * moveW, 0);
      set('head', -this.lean * 0.3 + Math.sin(this.time * 0.6) * 0.03 * (1 - moveW), Math.sin(this.time * 0.37) * 0.1 * (1 - moveW), 0);
      if (J['cloak']) set('cloak', 0.15 + this.spd * 0.12 + this.airW * 0.5 + Math.sin(this.time * 7) * 0.04 * moveW, 0, 0);
    } else {
      // Quadruped trot/gallop, same phase machinery
      const gallop = runW;
      const amp = lerp(0.45, 0.8, gallop) * stepW;
      const offs: Record<string, number> = gallop > 0.5
        ? { FL: 0, FR: 0.6, BL: Math.PI, BR: Math.PI + 0.6 }
        : { FL: 0, BR: 0, FR: Math.PI, BL: Math.PI };
      const comp = -this.land + this.crouchW * 0.6;
      for (const n of ['FL', 'FR', 'BL', 'BR']) {
        const ph = this.phase + offs[n];
        const ss = Math.sin(ph), cc = Math.cos(ph);
        const back = n[0] === 'B';
        set('up' + n, -ss * amp + (back ? -0.25 : 0) - comp * (back ? -0.4 : 0.3) + this.airW * (back ? 0.6 : -0.6), 0, 0);
        set('lo' + n, (back ? 0.5 : 0) + Math.max(0, back ? -cc : cc) * amp * (back ? -0.9 : 1.1) * (back ? -1 : 1) + comp * 0.6, 0, 0);
        set('paw' + n, (back ? -0.25 : 0) + ss * 0.3 * amp, 0, 0);
      }
      const bob = Math.abs(Math.sin(this.phase)) * 0.05 * moveW;
      J['hips'].position.y = this.rig.hipHeight / this.rig.scale - bob - comp * 0.08;
      set('hips', Math.sin(this.phase * 2) * 0.04 * gallop * moveW, 0, Math.sin(this.phase) * 0.04 * moveW);
      set('spine', Math.sin(this.phase * 2) * 0.1 * gallop * moveW, -this.sideLean, 0);
      set('chest', -this.lean * 0.4 + Math.sin(this.time * 2) * 0.01, 0, 0);
      set('neck', -0.1 + this.crouchW * 0.4 - gallop * 0.2, 0, 0);
      set('head', Math.sin(this.time * 0.7) * 0.05 + this.crouchW * -0.2, Math.sin(this.time * 0.4) * 0.15 * (1 - moveW), 0);
      if (J['tail1']) set('tail1', -0.2 + Math.sin(this.time * 3) * 0.1 - gallop * 0.3, Math.sin(this.time * 2.3) * 0.3, 0);
      if (J['tail2']) set('tail2', 0.1, Math.sin(this.time * 2.3 - 0.8) * 0.3, 0);
      if (J['jaw']) set('jaw', 0.05 + Math.max(0, Math.sin(this.time * 4)) * 0.08 * gallop, 0, 0);
    }

    // Overlay (guard stance / death)
    this.overlayW = damp(this.overlayW, this.overlayTarget, 10, dt);
    if (this.overlay && this.overlayW > 0.001) blend(P, this.overlay, this.overlayW);

    // Action layer
    if (this.action) {
      const a = this.action;
      a.t += dt;
      if (a.fadeOut > 0) { a.weight -= dt / a.fadeOut; }
      else if (a.t >= a.dur) { a.fadeOut = 0.15; }
      if (a.weight <= 0) this.action = null;
      else {
        const pose = samplePose(a.keys, clamp(a.t / a.dur, 0, 1));
        blend(P, pose, clamp(a.weight, 0, 1), true);
      }
    }

    // Hit flinch
    if (this.hitShake > 0) {
      const h = this.hitShake;
      add(P, 'spine', -0.35 * h, Math.sin(this.time * 50) * 0.1 * h, 0);
      add(P, 'head', -0.2 * h, 0, 0);
    }

    // Apply relative to rest
    for (const n in J) {
      const rr = r[n];
      const p = P[n];
      if (!rr) continue;
      if (p) J[n].rotation.set(rr.x + p[0], rr.y + p[1], rr.z + p[2]);
      else J[n].rotation.copy(rr);
    }
    this.applied = P;
  }
}

function blend(P: Pose, Q: Pose, w: number, additiveOnMissing = false) {
  for (const n in Q) {
    const a = P[n] ?? [0, 0, 0];
    const b = Q[n];
    P[n] = [lerp(a[0], b[0], w), lerp(a[1], b[1], w), lerp(a[2], b[2], w)];
  }
}
function add(P: Pose, n: string, x: number, y: number, z: number) {
  const a = P[n] ?? [0, 0, 0];
  P[n] = [a[0] + x, a[1] + y, a[2] + z];
}

export const _v = new THREE.Vector3();
