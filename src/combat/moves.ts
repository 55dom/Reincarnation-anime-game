// Attack definitions. Every move has explicit windup / active / recovery windows so both the
// player and AI share readable timing; poses are keyed against the same normalized clock.
import type { PoseKey, Pose } from '../player/animator';

export interface Move {
  id: string;
  name: string;
  stamina: number;
  windup: number;   // seconds of anticipation (telegraph)
  active: number;   // seconds hitbox is live
  recovery: number; // seconds of commitment after the swing
  damage: number;
  poise: number;    // poise damage dealt
  range: number;
  arc: number;      // half-angle radians
  lunge: number;    // m/s forward during windup end + active
  cancelAt?: number; // fraction of recovery after which chaining is allowed
  keys: PoseKey[];
  aoe?: boolean;    // hits all around (radius = range)
  hyperArmor?: boolean;
}

export const total = (m: Move) => m.windup + m.active + m.recovery;

/** Build pose keys from windup/strike/follow poses aligned to the move's real timing. */
export function keysFor(m: { windup: number; active: number; recovery: number }, wind: Pose, strike: Pose, follow: Pose): PoseKey[] {
  const T = m.windup + m.active + m.recovery;
  const a = m.windup / T, b = (m.windup + m.active) / T;
  return [
    { t: 0, pose: {} },
    { t: a * 0.9, pose: wind, ease: 'out' },
    { t: a, pose: wind },
    { t: Math.min(b, a + 0.12), pose: strike, ease: 'snap' },
    { t: b + (1 - b) * 0.35, pose: follow, ease: 'out' },
    { t: 1, pose: {}, ease: 'inout' },
  ];
}

// ---- Pose library (right-handed) ----
export const P = {
  slashR_wind: { chest: [0, -0.8, 0], spine: [0.05, -0.3, 0], armR: [-1.3, 0.3, -1.2], foreR: [-1.3, 0, 0], armL: [-0.4, 0, 0.5], thighR: [0.25, 0, 0], thighL: [-0.3, 0, 0], shinL: [0.35, 0, 0] } as Pose,
  slashR_hit: { chest: [0.1, 0.75, 0], spine: [0.15, 0.3, 0], armR: [-1.45, 0.4, 0.2], foreR: [-0.2, 0, 0], armL: [0.2, 0, 0.4], thighR: [0.35, 0, 0], thighL: [-0.55, 0, 0], shinL: [0.5, 0, 0], hips: [0.1, 0.2, 0] } as Pose,
  slashR_follow: { chest: [0.1, 0.9, 0], spine: [0.1, 0.3, 0], armR: [-0.8, 0.6, 0.5], foreR: [-0.4, 0, 0], thighL: [-0.4, 0, 0], shinL: [0.4, 0, 0] } as Pose,
  slashL_wind: { chest: [0, 0.8, 0], spine: [0.05, 0.3, 0], armR: [-1.4, -0.2, 0.6], foreR: [-1.6, 0, 0], thighL: [0.2, 0, 0], thighR: [-0.3, 0, 0], shinR: [0.35, 0, 0] } as Pose,
  slashL_hit: { chest: [0.1, -0.8, 0], spine: [0.15, -0.3, 0], armR: [-1.4, -0.3, -1.0], foreR: [-0.2, 0, 0], thighR: [-0.55, 0, 0], shinR: [0.5, 0, 0], hips: [0.1, -0.2, 0] } as Pose,
  slashL_follow: { chest: [0.1, -0.9, 0], armR: [-0.9, -0.3, -1.1], foreR: [-0.3, 0, 0], thighR: [-0.4, 0, 0], shinR: [0.4, 0, 0] } as Pose,
  thrust_wind: { chest: [0, -0.6, 0], armR: [-0.5, 0, -0.3], foreR: [-1.9, 0, 0], thighR: [0.4, 0, 0], thighL: [-0.2, 0, 0], shinL: [0.4, 0, 0], hips: [0.05, -0.3, 0] } as Pose,
  thrust_hit: { chest: [0.2, 0.3, 0], spine: [0.2, 0, 0], armR: [-1.55, 0, 0], foreR: [0, 0, 0], thighL: [-0.8, 0, 0], shinL: [0.7, 0, 0], thighR: [0.5, 0, 0], hips: [0.15, 0.2, 0] } as Pose,
  thrust_follow: { chest: [0.15, 0.2, 0], armR: [-1.2, 0, 0], foreR: [-0.3, 0, 0], thighL: [-0.6, 0, 0], shinL: [0.6, 0, 0] } as Pose,
  over_wind: { spine: [-0.3, 0, 0], chest: [-0.2, -0.2, 0], armR: [-2.8, 0, -0.2], foreR: [-0.9, 0, 0], armL: [-2.6, 0, 0.3], foreL: [-0.9, 0, 0], thighR: [0.3, 0, 0], shinR: [0.2, 0, 0] } as Pose,
  over_hit: { spine: [0.5, 0, 0], chest: [0.3, 0, 0], armR: [-0.9, 0, 0], foreR: [-0.1, 0, 0], armL: [-0.9, 0, 0.1], foreL: [-0.3, 0, 0], thighL: [-0.7, 0, 0], shinL: [0.8, 0, 0], thighR: [0.45, 0, 0], hips: [0.2, 0, 0] } as Pose,
  over_follow: { spine: [0.55, 0, 0], chest: [0.25, 0, 0], armR: [-0.4, 0, 0], armL: [-0.5, 0, 0], thighL: [-0.6, 0, 0], shinL: [0.8, 0, 0] } as Pose,
  spin_wind: { hips: [0, -0.9, 0], chest: [0, -1.0, 0], armR: [-1.3, 0, -1.4], foreR: [-0.3, 0, 0], thighL: [-0.4, 0, 0], shinL: [0.6, 0, 0], shinR: [0.6, 0, 0] } as Pose,
  spin_hit: { hips: [0, 1.6, 0], chest: [0.1, 1.2, 0], armR: [-1.5, 0, 0.1], foreR: [0, 0, 0], thighL: [-0.4, 0, 0], shinL: [0.6, 0, 0], shinR: [0.6, 0, 0] } as Pose,
  spin_follow: { hips: [0, 2.6, 0], chest: [0, 1.0, 0], armR: [-0.8, 0, 0.6] } as Pose,
  slam_wind: { spine: [-0.4, 0, 0], armR: [-3.0, 0, -0.1], armL: [-3.0, 0, 0.1], foreR: [-0.5, 0, 0], foreL: [-0.5, 0, 0], thighL: [0.2, 0, 0], thighR: [0.2, 0, 0], shinL: [0.3, 0, 0], shinR: [0.3, 0, 0] } as Pose,
  slam_hit: { spine: [0.75, 0, 0], chest: [0.4, 0, 0], armR: [-0.5, 0, 0], armL: [-0.5, 0, 0], thighL: [-1.0, 0, 0], shinL: [1.3, 0, 0], thighR: [-0.4, 0, 0], shinR: [1.4, 0, 0], hips: [0.2, 0, 0] } as Pose,
  slam_follow: { spine: [0.6, 0, 0], armR: [-0.4, 0, 0], armL: [-0.4, 0, 0], thighL: [-0.9, 0, 0], shinL: [1.2, 0, 0], shinR: [1.2, 0, 0], thighR: [-0.3, 0, 0] } as Pose,
  cast_wind: { armL: [-2.2, 0, 0.4], foreL: [-0.4, 0, 0], chest: [-0.15, 0.4, 0], spine: [-0.1, 0, 0] } as Pose,
  cast_hit: { armL: [-1.5, 0, -0.2], foreL: [0, 0, 0], chest: [0.15, -0.3, 0], thighL: [-0.4, 0, 0], shinL: [0.4, 0, 0] } as Pose,
  stab_down_wind: { armR: [-2.6, 0, -0.1], foreR: [-1.5, 0, 0], spine: [-0.2, 0, 0], thighL: [-0.3, 0, 0] } as Pose,
  stab_down_hit: { armR: [-0.6, 0, 0], foreR: [-1.2, 0, 0], spine: [0.7, 0, 0], thighL: [-1.0, 0, 0], shinL: [1.4, 0, 0], shinR: [1.6, 0, 0], thighR: [0.2, 0, 0] } as Pose,
};

export const POSE_ROLL: PoseKey[] = [
  { t: 0, pose: {} },
  { t: 0.15, pose: { spine: [0.9, 0, 0], neck: [0.6, 0, 0], thighL: [-1.8, 0, 0], thighR: [-1.6, 0, 0], shinL: [2.2, 0, 0], shinR: [2.2, 0, 0], armL: [-1.2, 0, 0.3], armR: [-1.2, 0, -0.3], foreL: [-1.4, 0, 0], foreR: [-1.4, 0, 0] }, ease: 'out' },
  { t: 0.75, pose: { spine: [0.9, 0, 0], neck: [0.6, 0, 0], thighL: [-1.8, 0, 0], thighR: [-1.6, 0, 0], shinL: [2.2, 0, 0], shinR: [2.2, 0, 0], armL: [-1.2, 0, 0.3], armR: [-1.2, 0, -0.3], foreL: [-1.4, 0, 0], foreR: [-1.4, 0, 0] } },
  { t: 0.9, pose: { spine: [0.3, 0, 0], thighL: [-0.8, 0, 0], shinL: [1.2, 0, 0], thighR: [0.2, 0, 0], shinR: [1.4, 0, 0] }, ease: 'out' },
  { t: 1, pose: {} },
];
export const POSE_BACKSTEP: PoseKey[] = [
  { t: 0, pose: {} },
  { t: 0.2, pose: { spine: [-0.3, 0, 0], thighL: [0.5, 0, 0], shinL: [0.6, 0, 0], thighR: [-0.4, 0, 0], shinR: [0.9, 0, 0], armL: [0.5, 0, 0.5], armR: [0.4, 0, -0.5] }, ease: 'out' },
  { t: 0.7, pose: { spine: [0.1, 0, 0], thighL: [-0.4, 0, 0], shinL: [0.7, 0, 0], thighR: [-0.5, 0, 0], shinR: [0.8, 0, 0] } },
  { t: 1, pose: {} },
];
export const POSE_STAGGER: PoseKey[] = [
  { t: 0, pose: {} },
  { t: 0.15, pose: { spine: [-0.5, 0.3, 0], chest: [-0.3, 0, 0.2], head: [-0.4, 0, 0], armL: [0.6, 0, 0.8], armR: [0.6, 0, -0.8], thighL: [0.4, 0, 0], shinR: [0.7, 0, 0] }, ease: 'snap' },
  { t: 0.7, pose: { spine: [0.3, 0, 0], thighL: [-0.3, 0, 0], shinL: [0.6, 0, 0], shinR: [0.6, 0, 0] } },
  { t: 1, pose: {} },
];
export const POSE_DEAD_BIPED = { hips: [-1.45, 0, 0.1], spine: [0.1, 0, 0], neck: [0.3, 0.4, 0], armL: [-2.6, 0, 0.6], armR: [-2.2, 0, -0.9], thighL: [0.1, 0, 0.1], thighR: [-0.2, 0, -0.1], shinR: [0.5, 0, 0] } as Pose;
export const POSE_DEAD_QUAD = { hips: [0, 0, 1.45], spine: [0, 0.1, 0], neck: [0.3, 0.3, 0], upFL: [-0.6, 0, 0], upFR: [0.4, 0, 0], upBL: [0.5, 0, 0], upBR: [-0.3, 0, 0], tail1: [0.4, 0, 0] } as Pose;
export const POSE_GUARD = { armR: [-0.7, 0, -0.3], foreR: [-1.1, 0, 0], armL: [-0.6, 0, 0.5], foreL: [-1.3, 0, 0], spine: [0.15, 0, 0], thighL: [-0.2, 0, 0], shinL: [0.3, 0, 0], shinR: [0.3, 0, 0] } as Pose;
export const POSE_KNEEL = { hips: [0, 0, 0], thighL: [-1.5, 0, 0], shinL: [1.5, 0, 0], thighR: [0.1, 0, 0], shinR: [1.9, 0, 0], footR: [-0.4, 0, 0], spine: [0.4, 0, 0], armR: [-0.8, 0, 0], foreR: [-0.8, 0, 0], armL: [-0.6, 0, 0], foreL: [-0.9, 0, 0] } as Pose;
