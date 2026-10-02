// Keyframe animator with deliberately stepped ("on twos/threes") sampling for anime-style
// motion: strong held anticipation poses, snappy strikes, overshooting follow-through.
// Joint conventions (character faces +Z, its left is +X, Euler order YXZ):
//   arms/legs hang along -Y; x<0 swings a limb forward/up; shoulder y>0 swings the arm toward +X;
//   spine/chest x>0 leans forward, y>0 twists to the character's left. Blades extend along hand -Y.
import { JOINTS } from './humanoid.js';
import { lerp, clamp } from '../core/util.js';

export function mirror(p) {
  const o = {};
  for (const k in p) {
    const v = p[k];
    let mk = k;
    if (k.endsWith('L')) mk = k.slice(0, -1) + 'R'; else if (k.endsWith('R')) mk = k.slice(0, -1) + 'L';
    if (k === 'pos') o.pos = [-v[0], v[1], v[2]];
    else o[mk] = [v[0], -v[1], -v[2]];
  }
  return o;
}
const P = (...parts) => Object.assign({}, ...parts);

// ----------------------------------------------------------------------------- poses
const REST = { shL: [0.05, 0, 0.13], shR: [0.05, 0, -0.13], elL: [-0.18, 0, 0], elR: [-0.18, 0, 0], haL: [0, 0, 0], haR: [0, 0, 0] };
export const POSE = {
  rest: REST,
  idleA: P(REST, { chest: [0.03, 0, 0], head: [-0.04, 0, 0], thL: [0, 0, 0.05], thR: [0, 0, -0.05] }),
  idleB: P(REST, { chest: [-0.02, 0, 0], head: [0.0, 0, 0], shL: [0.03, 0, 0.16], shR: [0.03, 0, -0.16], elL: [-0.25, 0, 0], elR: [-0.25, 0, 0], pos: [0, -0.012, 0], thL: [0, 0, 0.05], thR: [0, 0, -0.05] }),
  // armed combat stance
  guard: { pos: [0, -0.07, 0], hips: [0, -0.35, 0], spine: [0.08, 0.1, 0], chest: [0.05, 0.22, 0], head: [0, 0.05, 0],
    shR: [-0.65, 0.4, -0.25], elR: [-1.0, 0, 0], haR: [-0.7, 0, 0.2], shL: [-0.35, -0.2, 0.3], elL: [-1.2, 0, 0],
    thL: [-0.45, 0.35, 0.12], knL: [0.55, 0, 0], ftL: [-0.1, 0, 0], thR: [0.2, 0.35, -0.1], knR: [0.45, 0, 0], ftR: [-0.25, 0, 0] },
  guardB: { pos: [0, -0.085, 0], hips: [0, -0.35, 0], spine: [0.1, 0.1, 0], chest: [0.02, 0.22, 0], head: [0.03, 0.05, 0],
    shR: [-0.62, 0.42, -0.25], elR: [-1.05, 0, 0], haR: [-0.7, 0, 0.2], shL: [-0.32, -0.2, 0.32], elL: [-1.25, 0, 0],
    thL: [-0.48, 0.35, 0.12], knL: [0.62, 0, 0], ftL: [-0.1, 0, 0], thR: [0.22, 0.35, -0.1], knR: [0.5, 0, 0], ftR: [-0.25, 0, 0] },
  // locomotion
  walkA: P(REST, { thR: [-0.45, 0, 0], knR: [0.1, 0, 0], thL: [0.35, 0, 0], knL: [0.35, 0, 0], shL: [-0.35, 0, 0.12], shR: [0.3, 0, -0.12], chest: [0.04, -0.06, 0], pos: [0, -0.02, 0] }),
  walkB: P(REST, { thR: [0.0, 0, 0], knR: [0.15, 0, 0], thL: [-0.15, 0, 0], knL: [0.7, 0, 0], pos: [0, 0.015, 0], chest: [0.04, 0, 0] }),
  runA: { pos: [0, -0.05, 0], hips: [0.05, 0.12, 0], spine: [0.25, 0, 0], chest: [0.12, -0.18, 0], head: [-0.3, 0.06, 0],
    thR: [-1.0, 0, 0], knR: [0.35, 0, 0], ftR: [0.1, 0, 0], thL: [0.55, 0, 0], knL: [1.1, 0, 0], ftL: [0.3, 0, 0],
    shL: [-0.9, 0, 0.15], elL: [-1.3, 0, 0], shR: [0.75, 0, -0.2], elR: [-0.6, 0, 0], haR: [0, 0, 0] },
  runB: { pos: [0, 0.06, 0], hips: [0.05, 0, 0], spine: [0.25, 0, 0], chest: [0.12, 0, 0], head: [-0.3, 0, 0],
    thR: [0.15, 0, 0], knR: [0.6, 0, 0], thL: [-0.65, 0, 0], knL: [1.6, 0, 0], ftL: [0.2, 0, 0],
    shL: [-0.2, 0, 0.15], elL: [-1.3, 0, 0], shR: [0.1, 0, -0.2], elR: [-0.9, 0, 0] },
  // armed run: sword arm trailing behind (anime "ninja run")
  runSwordA: { pos: [0, -0.06, 0], hips: [0.08, 0.12, 0], spine: [0.38, 0, 0], chest: [0.15, -0.12, 0], head: [-0.45, 0.06, 0],
    thR: [-1.05, 0, 0], knR: [0.35, 0, 0], ftR: [0.1, 0, 0], thL: [0.6, 0, 0], knL: [1.2, 0, 0], ftL: [0.3, 0, 0],
    shL: [-0.8, 0, 0.2], elL: [-1.4, 0, 0], shR: [1.05, 0, -0.35], elR: [-0.15, 0, 0], haR: [-0.9, 0, 0] },
  runSwordB: { pos: [0, 0.05, 0], hips: [0.08, 0, 0], spine: [0.38, 0, 0], chest: [0.15, 0, 0], head: [-0.45, 0, 0],
    thR: [0.15, 0, 0], knR: [0.6, 0, 0], thL: [-0.7, 0, 0], knL: [1.6, 0, 0], ftL: [0.2, 0, 0],
    shL: [-0.3, 0, 0.2], elL: [-1.4, 0, 0], shR: [1.0, 0, -0.32], elR: [-0.15, 0, 0], haR: [-0.9, 0, 0] },
  jumpUp: { pos: [0, 0.05, 0], spine: [0.1, 0, 0], chest: [-0.1, 0, 0], head: [-0.15, 0, 0], thL: [-1.2, 0, 0.1], knL: [1.8, 0, 0], thR: [-0.3, 0, -0.1], knR: [1.0, 0, 0],
    shL: [-2.3, 0, 0.5], elL: [-0.5, 0, 0], shR: [0.6, 0, -0.5], elR: [-0.4, 0, 0], haR: [-0.6, 0, 0] },
  fall: { pos: [0, 0, 0], spine: [0.0, 0, 0], chest: [-0.05, 0, 0], head: [0.1, 0, 0], thL: [-0.5, 0, 0.1], knL: [0.9, 0, 0], thR: [0.1, 0, -0.1], knR: [0.5, 0, 0],
    shL: [-0.5, 0, 1.2], elL: [-0.5, 0, 0], shR: [-0.3, 0, -1.1], elR: [-0.5, 0, 0], haR: [-0.4, 0, 0] },
  land: { pos: [0, -0.35, 0], spine: [0.5, 0, 0], chest: [0.2, 0, 0], head: [-0.4, 0, 0], thL: [-1.3, 0, 0.15], knL: [1.9, 0, 0], ftL: [0.4, 0, 0], thR: [0.3, 0, -0.15], knR: [1.6, 0, 0], ftR: [-0.2, 0, 0],
    shL: [-0.2, 0, 0.9], elL: [-0.3, 0, 0], shR: [0.3, 0, -0.9], elR: [-0.2, 0, 0], haR: [-0.8, 0, 0] },
  // defense
  block: { pos: [0, -0.12, 0], hips: [0, -0.2, 0], spine: [0.2, 0, 0], chest: [0.05, 0.15, 0], head: [-0.15, 0, 0],
    shR: [-1.25, 0.65, -0.1], elR: [-1.25, 0, 0], haR: [-1.0, 0, 1.4], shL: [-1.1, -0.5, 0.2], elL: [-1.5, 0, 0], haL: [0, 0, 0],
    thL: [-0.6, 0.2, 0.15], knL: [0.8, 0, 0], thR: [0.3, 0.2, -0.15], knR: [0.7, 0, 0], ftR: [-0.3, 0, 0] },
  parry: { pos: [0, -0.05, 0.05], hips: [0, 0.3, 0], spine: [0.1, 0, 0], chest: [-0.1, -0.4, 0], head: [0, -0.1, 0],
    shR: [-1.8, -0.9, 0], elR: [-0.4, 0, 0], haR: [-0.3, 0, 0.6], shL: [-0.2, 0, 0.9], elL: [-0.6, 0, 0],
    thL: [-0.7, 0, 0.1], knL: [0.6, 0, 0], thR: [0.4, 0, -0.2], knR: [0.5, 0, 0] },
  dodge: { pos: [0, -0.3, 0], hips: [0.2, 0, 0], spine: [0.55, 0, 0], chest: [0.25, 0, 0], head: [-0.6, 0, 0],
    thL: [-1.4, 0, 0.2], knL: [1.9, 0, 0], ftL: [0.4, 0, 0], thR: [0.8, 0, -0.2], knR: [0.8, 0, 0],
    shL: [0.9, 0, 0.5], elL: [-0.3, 0, 0], shR: [1.2, 0, -0.5], elR: [-0.1, 0, 0], haR: [-0.9, 0, 0] },
  dashPose: { pos: [0, -0.25, 0], hips: [0.25, 0, 0], spine: [0.6, 0, 0], chest: [0.2, 0, 0], head: [-0.7, 0, 0],
    thL: [-1.5, 0, 0.1], knL: [1.5, 0, 0], thR: [1.0, 0, -0.1], knR: [0.5, 0, 0],
    shL: [0.6, 0, 0.3], elL: [-0.2, 0, 0], shR: [1.3, 0, -0.4], elR: [0, 0, 0], haR: [-0.9, 0, 0] },
  // reactions
  hitF: { pos: [0, -0.08, -0.05], hips: [-0.15, 0, 0], spine: [-0.35, 0.1, 0], chest: [-0.3, 0.1, 0], head: [-0.4, 0.2, 0],
    shL: [-0.6, 0, 0.9], elL: [-0.6, 0, 0], shR: [-0.4, 0, -0.9], elR: [-0.6, 0, 0], thL: [-0.3, 0, 0.1], knL: [0.5, 0, 0], thR: [0.3, 0, -0.1], knR: [0.3, 0, 0] },
  hitF2: { pos: [0, -0.15, -0.08], hips: [0.1, 0, 0], spine: [0.5, -0.1, 0], chest: [0.35, -0.1, 0], head: [0.3, -0.1, 0],
    shL: [0.2, 0, 0.5], elL: [-0.8, 0, 0], shR: [0.2, 0, -0.5], elR: [-0.8, 0, 0], thL: [-0.2, 0, 0.1], knL: [0.6, 0, 0], thR: [0.2, 0, -0.1], knR: [0.6, 0, 0] },
  lieBack: { pos: [0, -0.8, 0], hips: [-1.57, 0, 0], spine: [0.0, 0, 0], head: [0.15, 0.3, 0], shL: [-0.2, 0, 1.0], elL: [-0.4, 0, 0], shR: [-0.1, 0, -0.7], elR: [-0.6, 0, 0], thL: [-0.1, 0, 0.15], knL: [0.2, 0, 0], thR: [-0.4, 0, -0.1], knR: [0.7, 0, 0] },
  lieFront: { pos: [0, -0.78, 0], hips: [1.57, 0, 0], head: [-0.6, 0.6, 0], shL: [-2.6, 0, 0.6], elL: [-0.4, 0, 0], shR: [-0.3, 0, -0.4], thL: [0, 0, 0.1], thR: [0.3, 0, -0.1], knR: [0.6, 0, 0] },
  sitUp: { pos: [0, -0.78, 0], hips: [-0.5, 0, 0], spine: [0.3, 0, 0], chest: [0.2, 0, 0], head: [0.2, 0, 0], shL: [0.6, 0, 0.4], elL: [-0.1, 0, 0], shR: [0.6, 0, -0.4], elR: [-0.1, 0, 0], thL: [-1.0, 0, 0.1], knL: [0.6, 0, 0], thR: [-1.3, 0, -0.1], knR: [1.4, 0, 0] },
  kneel: { pos: [0, -0.48, 0], spine: [0.35, 0, 0], chest: [0.15, 0, 0], head: [0.2, 0, 0], thL: [-1.5, 0, 0.1], knL: [1.5, 0, 0], ftL: [0, 0, 0], thR: [0.1, 0, -0.1], knR: [2.3, 0, 0], ftR: [0.6, 0, 0],
    shL: [-0.5, 0, 0.2], elL: [-0.8, 0, 0], shR: [-0.3, 0, -0.2], elR: [-0.7, 0, 0] },
  kneelSword: { pos: [0, -0.5, 0], spine: [0.45, 0, 0], chest: [0.2, 0, 0], head: [0.35, 0, 0], thL: [-1.5, 0, 0.1], knL: [1.5, 0, 0], thR: [0.1, 0, -0.1], knR: [2.3, 0, 0], ftR: [0.6, 0, 0],
    shL: [-0.6, 0, 0.2], elL: [-0.8, 0, 0], shR: [-0.9, 0, -0.1], elR: [-0.2, 0, 0], haR: [0.9, 0, 0] },
  crouchLook: { pos: [0, -0.35, 0], spine: [0.5, 0, 0], chest: [0.2, 0, 0], head: [0.3, 0, 0], thL: [-1.4, 0, 0.2], knL: [2.0, 0, 0], thR: [-0.6, 0, -0.2], knR: [2.1, 0, 0], ftR: [0.5, 0, 0],
    shR: [-1.0, 0.2, 0], elR: [-0.5, 0, 0], shL: [-0.3, 0, 0.3], elL: [-0.9, 0, 0] },
  lookSword: { pos: [0, -0.02, 0], chest: [0.1, 0.1, 0], head: [0.35, 0.15, 0], shR: [-1.15, 0.5, 0], elR: [-1.4, 0, 0], haR: [-0.2, 0, 1.4], shL: [-0.9, -0.3, 0.2], elL: [-1.6, 0, 0], thL: [0, 0, 0.06], thR: [0, 0, -0.06] },
  lookL: P(REST, { head: [0, 0.8, 0], chest: [0, 0.3, 0], shL: [0, 0, 0.2] }),
  lookR: P(REST, { head: [0, -0.8, 0], chest: [0, -0.3, 0] }),
  lookUp: P(REST, { head: [-0.6, 0, 0], chest: [-0.15, 0, 0], shL: [0.2, 0, 0.3], shR: [0.2, 0, -0.3] }),
  shock: P(REST, { pos: [0, -0.04, -0.05], chest: [-0.2, 0, 0], head: [-0.15, 0, 0], shL: [-0.6, 0, 0.6], elL: [-1.2, 0, 0], shR: [-0.6, 0, -0.6], elR: [-1.2, 0, 0], thL: [0.15, 0, 0.1], thR: [-0.1, 0, -0.1] }),
  handLook: P(REST, { head: [0.4, 0, 0], shL: [-1.0, -0.4, 0], elL: [-1.6, 0, 0], haL: [0, 0, 0], shR: [-1.0, 0.4, 0], elR: [-1.6, 0, 0] }),
  // social
  talk1: P(REST, { shR: [-0.8, 0.3, -0.2], elR: [-1.2, 0, 0], chest: [0.02, 0.1, 0], head: [0.05, -0.1, 0] }),
  talk2: P(REST, { shL: [-0.7, -0.3, 0.3], elL: [-1.1, 0, 0], shR: [-0.5, 0.2, -0.3], elR: [-0.9, 0, 0], head: [-0.05, 0.12, 0] }),
  wave1: P(REST, { shR: [-2.6, 0, -0.5], elR: [-0.6, 0, 0], head: [-0.05, 0, 0.1] }),
  wave2: P(REST, { shR: [-2.6, 0, -0.9], elR: [-0.3, 0, 0], head: [-0.05, 0, 0.1] }),
  armsCross: P(REST, { shL: [-0.45, -0.7, 0.2], elL: [-1.9, 0, 0], shR: [-0.45, 0.7, -0.2], elR: [-1.9, 0, 0], chest: [-0.05, 0, 0], head: [-0.05, 0, 0] }),
  hammerUp: P(REST, { shR: [-2.8, 0, -0.2], elR: [-0.8, 0, 0], spine: [-0.1, 0, 0], shL: [-0.7, 0, 0.1], elL: [-0.8, 0, 0] }),
  hammerDown: P(REST, { shR: [-1.0, 0, -0.1], elR: [-0.3, 0, 0], spine: [0.35, 0, 0], chest: [0.2, 0, 0], shL: [-0.7, 0, 0.1], elL: [-0.8, 0, 0], pos: [0, -0.05, 0] }),
  sweep1: P(REST, { spine: [0.3, 0.3, 0], shR: [-0.6, 0.6, 0], elR: [-0.4, 0, 0], shL: [-0.9, 0.5, 0], elL: [-0.6, 0, 0] }),
  sweep2: P(REST, { spine: [0.3, -0.3, 0], shR: [-0.6, -0.2, 0], elR: [-0.4, 0, 0], shL: [-0.9, -0.4, 0], elL: [-0.6, 0, 0] }),
  pray: P(REST, { pos: [0, -0.48, 0], thL: [-1.5, 0, 0.1], knL: [1.5, 0, 0], thR: [0.1, 0, -0.1], knR: [2.3, 0, 0], ftR: [0.6, 0, 0], spine: [0.2, 0, 0], head: [0.4, 0, 0], shL: [-0.9, -0.5, 0], elL: [-1.8, 0, 0], shR: [-0.9, 0.5, 0], elR: [-1.8, 0, 0] }),
  cheer: P(REST, { shL: [-2.9, 0, 0.3], elL: [-0.2, 0, 0], shR: [-2.9, 0, -0.3], elR: [-0.2, 0, 0], head: [-0.25, 0, 0], pos: [0, 0.04, 0] }),
  sit: { pos: [0, -0.45, -0.1], thL: [-1.5, 0, 0.1], knL: [1.5, 0, 0], thR: [-1.5, 0, -0.1], knR: [1.5, 0, 0], shL: [0.1, 0, 0.1], elL: [-0.8, 0, 0], shR: [0.1, 0, -0.1], elR: [-0.8, 0, 0], spine: [-0.05, 0, 0] },
  cast1: P(REST, { shR: [-1.6, 0.2, 0], elR: [-0.2, 0, 0], shL: [-1.2, -0.3, 0.2], elL: [-0.8, 0, 0], chest: [-0.1, 0.2, 0], pos: [0, -0.05, 0], thL: [-0.4, 0, 0.1], knL: [0.4, 0, 0], thR: [0.3, 0, -0.1] }),
  cast2: P(REST, { shR: [-2.8, 0.2, 0], elR: [-0.1, 0, 0], shL: [-2.8, -0.3, 0.2], elL: [-0.1, 0, 0], chest: [-0.25, 0, 0], head: [-0.3, 0, 0] }),
  bowDraw: P(REST, { shL: [-1.55, 0.9, 0], elL: [0, 0, 0], shR: [-1.5, 0.5, 0], elR: [-2.2, 0, 0], chest: [0, -0.9, 0], head: [0, 0.9, 0], hips: [0, -0.4, 0] }),
  dead: { pos: [0, -0.8, 0], hips: [-1.57, 0, 0.1], head: [0.3, 0.8, 0], shL: [-0.4, 0, 1.4], elL: [-0.2, 0, 0], shR: [-0.2, 0, -1.2], elR: [-0.3, 0, 0], thL: [-0.2, 0, 0.3], thR: [0.0, 0, -0.2], knR: [0.4, 0, 0] },
};

// ---------------------------------------------------------------- sword attack poses
const A = {};
// Light 1: diagonal down-right → down-left
A.l1Wind = { pos: [0, -0.1, -0.02], hips: [0, -0.5, 0], spine: [0.0, -0.2, 0], chest: [-0.1, -0.55, 0], head: [0, 0.6, 0],
  shR: [-2.5, -0.9, -0.2], elR: [-0.6, 0, 0], haR: [-0.4, 0, 0], shL: [-0.6, 0.5, 0.3], elL: [-1.3, 0, 0],
  thL: [-0.55, 0.3, 0.12], knL: [0.6, 0, 0], thR: [0.3, 0.3, -0.12], knR: [0.5, 0, 0], ftR: [-0.25, 0, 0] };
A.l1Hit = { pos: [0, -0.18, 0.12], hips: [0.1, 0.35, 0], spine: [0.2, 0.25, 0], chest: [0.25, 0.45, 0], head: [-0.2, -0.5, 0],
  shR: [-0.85, 0.85, 0.0], elR: [-0.05, 0, 0], haR: [-0.45, 0, 0.2], shL: [0.4, -0.2, 0.6], elL: [-0.6, 0, 0],
  thL: [-0.9, -0.2, 0.15], knL: [0.75, 0, 0], ftL: [0.1, 0, 0], thR: [0.5, -0.2, -0.15], knR: [0.4, 0, 0], ftR: [-0.3, 0, 0] };
A.l1Follow = P(A.l1Hit, { chest: [0.3, 0.7, 0], shR: [-0.55, 1.25, 0.1], haR: [-0.25, 0, 0.3], pos: [0, -0.2, 0.15] });
// Light 2: horizontal backhand left → right
A.l2Wind = { pos: [0, -0.12, 0.05], hips: [0, 0.4, 0], spine: [0.1, 0.3, 0], chest: [0.05, 0.6, 0], head: [0, -0.6, 0],
  shR: [-1.35, 1.35, 0.0], elR: [-1.2, 0, 0], haR: [-0.4, 0, -0.4], shL: [-0.2, 0.2, 0.5], elL: [-0.9, 0, 0],
  thL: [-0.8, -0.1, 0.12], knL: [0.7, 0, 0], thR: [0.4, -0.1, -0.12], knR: [0.5, 0, 0] };
A.l2Hit = { pos: [0, -0.16, 0.18], hips: [0, -0.45, 0], spine: [0.15, -0.3, 0], chest: [0.1, -0.6, 0], head: [-0.1, 0.6, 0],
  shR: [-1.45, -1.05, 0.0], elR: [-0.05, 0, 0], haR: [-0.2, 0, 0.0], shL: [0.3, -0.4, 0.8], elL: [-0.4, 0, 0],
  thL: [-0.7, 0.4, 0.12], knL: [0.6, 0, 0], thR: [0.45, 0.4, -0.12], knR: [0.45, 0, 0], ftR: [-0.3, 0, 0] };
A.l2Follow = P(A.l2Hit, { chest: [0.15, -0.85, 0], shR: [-1.3, -1.55, 0.05], pos: [0, -0.17, 0.2] });
// Light 3: spinning wide slash (big)
A.l3Wind = { pos: [0, -0.22, -0.05], hips: [0.1, -0.7, 0], spine: [0.25, -0.3, 0], chest: [0.15, -0.6, 0], head: [-0.2, 0.9, 0],
  shR: [-1.2, -1.6, 0], elR: [-0.3, 0, 0], haR: [-0.2, 0, 0], shL: [-0.9, 0.9, 0.2], elL: [-0.8, 0, 0],
  thL: [-0.9, 0.4, 0.2], knL: [1.1, 0, 0], thR: [0.5, 0.4, -0.2], knR: [0.9, 0, 0] };
A.l3Hit = { pos: [0, -0.25, 0.25], hips: [0.1, 0.8, 0], spine: [0.25, 0.4, 0], chest: [0.15, 0.7, 0], head: [-0.2, -0.9, 0],
  shR: [-1.5, 1.4, 0], elR: [0, 0, 0], haR: [-0.15, 0, 0], shL: [0.4, -0.6, 1.0], elL: [-0.3, 0, 0],
  thL: [-1.1, -0.3, 0.25], knL: [0.9, 0, 0], thR: [0.7, -0.3, -0.25], knR: [0.5, 0, 0], ftR: [-0.4, 0, 0] };
A.l3Follow = P(A.l3Hit, { chest: [0.2, 0.95, 0], shR: [-1.3, 1.8, 0.1], pos: [0, -0.27, 0.28] });
// Heavy: two-handed overhead smash
A.hWind = { pos: [0, -0.02, -0.1], hips: [-0.15, -0.1, 0], spine: [-0.25, 0, 0], chest: [-0.25, -0.1, 0], head: [0.15, 0, 0],
  shR: [-3.05, -0.15, -0.1], elR: [-0.6, 0, 0], haR: [-0.5, 0, 0], shL: [-3.0, -0.6, 0.0], elL: [-0.9, 0, 0],
  thL: [-0.3, 0, 0.1], knL: [0.3, 0, 0], thR: [0.2, 0, -0.1], knR: [0.2, 0, 0] };
A.hHit = { pos: [0, -0.42, 0.3], hips: [0.35, 0, 0], spine: [0.45, 0, 0], chest: [0.3, 0.05, 0], head: [-0.6, 0, 0],
  shR: [-0.55, 0.15, 0], elR: [-0.05, 0, 0], haR: [-0.5, 0, 0], shL: [-0.65, -0.35, 0], elL: [-0.3, 0, 0],
  thL: [-1.4, 0, 0.12], knL: [1.3, 0, 0], ftL: [0.2, 0, 0], thR: [0.9, 0, -0.12], knR: [0.7, 0, 0], ftR: [-0.4, 0, 0] };
A.hFollow = P(A.hHit, { shR: [-0.25, 0.15, 0], pos: [0, -0.45, 0.32], spine: [0.55, 0, 0] });
// Launcher (Rising Slash)
A.rWind = { pos: [0, -0.35, 0], hips: [0.3, -0.3, 0], spine: [0.4, -0.2, 0], chest: [0.2, -0.2, 0], head: [-0.4, 0.2, 0],
  shR: [0.5, -0.6, -0.2], elR: [-0.2, 0, 0], haR: [-1.4, 0, 0], shL: [-0.4, 0.4, 0.4], elL: [-0.9, 0, 0],
  thL: [-1.2, 0.2, 0.15], knL: [1.5, 0, 0], thR: [0.4, 0.2, -0.15], knR: [1.2, 0, 0] };
A.rHit = { pos: [0, 0.12, 0.1], hips: [-0.15, 0.3, 0], spine: [-0.3, 0.2, 0], chest: [-0.3, 0.2, 0], head: [0.4, 0, 0],
  shR: [-3.1, 0.3, 0], elR: [0, 0, 0], haR: [0.2, 0, 0], shL: [0.3, -0.2, 0.7], elL: [-0.4, 0, 0],
  thL: [-0.2, 0, 0.1], knL: [0.2, 0, 0], ftL: [0.5, 0, 0], thR: [-1.2, 0, -0.1], knR: [1.4, 0, 0] };
A.rFollow = P(A.rHit, { shR: [-3.35, 0.3, 0], pos: [0, 0.16, 0.12] });
// Dash slash (pass-through)
A.dWind = { pos: [0, -0.3, 0], hips: [0.25, 0.5, 0], spine: [0.5, 0.2, 0], chest: [0.2, 0.6, 0], head: [-0.6, -0.6, 0],
  shR: [-1.3, 1.5, 0], elR: [-1.3, 0, 0], haR: [-0.3, 0, 0], shL: [0.2, 0, 0.4], thL: [-1.4, 0, 0.1], knL: [1.5, 0, 0], thR: [1.0, 0, -0.1], knR: [0.5, 0, 0] };
A.dHit = { pos: [0, -0.4, 0.2], hips: [0.3, -0.6, 0], spine: [0.55, -0.3, 0], chest: [0.2, -0.7, 0], head: [-0.7, 0.7, 0],
  shR: [-1.35, -1.75, 0], elR: [0, 0, 0], haR: [-0.15, 0, 0], shL: [0.9, 0, 0.6], elL: [-0.2, 0, 0],
  thL: [-1.5, 0, 0.15], knL: [1.3, 0, 0], thR: [1.2, 0, -0.15], knR: [0.4, 0, 0], ftR: [-0.5, 0, 0] };
// Air combo (legs tucked)
const tuck = { thL: [-1.3, 0, 0.15], knL: [1.9, 0, 0], thR: [-0.7, 0, -0.15], knR: [1.6, 0, 0] };
A.a1Wind = P(A.l1Wind, tuck, { pos: [0, 0, 0] });
A.a1Hit = P(A.l1Hit, tuck, { pos: [0, 0, 0] });
A.a2Wind = P(A.l2Wind, tuck, { pos: [0, 0, 0] });
A.a2Hit = P(A.l2Hit, tuck, { pos: [0, 0, 0] });
A.a3Wind = P(A.hWind, tuck, { pos: [0, 0, 0] });
A.a3Hit = P(A.hHit, tuck, { pos: [0, 0, 0], hips: [0.2, 0, 0] });
// Air slam: plunge down
A.slamWind = P(A.hWind, tuck, { pos: [0, 0.1, 0], spine: [-0.4, 0, 0] });
A.slamHit = { pos: [0, -0.4, 0], hips: [0.4, 0, 0], spine: [0.6, 0, 0], chest: [0.3, 0, 0], head: [-0.8, 0, 0],
  shR: [-0.3, 0.1, 0], elR: [0, 0, 0], haR: [0.25, 0, 0], shL: [-0.35, -0.2, 0], elL: [-0.1, 0, 0],
  thL: [-1.6, 0, 0.3], knL: [2.2, 0, 0], ftL: [0.5, 0, 0], thR: [0.2, 0, -0.3], knR: [2.1, 0, 0], ftR: [0.6, 0, 0] };
// Thrust (counter)
A.tWind = { pos: [0, -0.2, -0.1], hips: [0, -0.6, 0], chest: [0, -0.5, 0], head: [0, 0.5, 0], shR: [0.3, -0.3, -0.3], elR: [-2.0, 0, 0], haR: [-1.5, 0, 0], shL: [-1.5, 0.6, 0], elL: [-0.1, 0, 0],
  thL: [-0.8, 0.3, 0.1], knL: [0.9, 0, 0], thR: [0.5, 0.3, -0.1], knR: [0.7, 0, 0] };
A.tHit = { pos: [0, -0.3, 0.35], hips: [0.2, 0.3, 0], spine: [0.3, 0.2, 0], chest: [0.15, 0.3, 0], head: [-0.4, -0.3, 0], shR: [-1.6, 0.25, 0], elR: [0, 0, 0], haR: [-1.55, 0, 0], shL: [0.8, 0, 0.5],
  thL: [-1.4, 0, 0.1], knL: [1.1, 0, 0], thR: [1.0, 0, -0.1], knR: [0.3, 0, 0], ftR: [-0.4, 0, 0] };
// Special: cross slash (X)
A.xWind = { pos: [0, -0.15, -0.05], chest: [-0.2, 0, 0], shR: [-2.8, -0.7, 0], elR: [-0.3, 0, 0], shL: [-2.8, 0.7, 0], elL: [-0.3, 0, 0], thL: [-0.5, 0, 0.15], knL: [0.6, 0, 0], thR: [0.3, 0, -0.15], knR: [0.5, 0, 0] };
A.xHit = { pos: [0, -0.35, 0.25], spine: [0.4, 0, 0], chest: [0.3, 0, 0], head: [-0.5, 0, 0], shR: [-0.6, 0.9, 0], elR: [0, 0, 0], shL: [-0.6, -0.9, 0], elL: [0, 0, 0], thL: [-1.3, 0, 0.15], knL: [1.2, 0, 0], thR: [0.9, 0, -0.15], knR: [0.6, 0, 0] };
// Iaido: sheathed draw
A.iaiWind = { pos: [0, -0.35, 0], hips: [0.2, -0.6, 0], spine: [0.35, -0.3, 0], chest: [0.15, -0.4, 0], head: [-0.4, 0.8, 0], shR: [0.2, 0.9, -0.2], elR: [-1.7, 0, 0], haR: [-1.2, 0, 1.2], shL: [0.1, 0.4, 0.2], elL: [-1.6, 0, 0],
  thL: [-1.2, 0.3, 0.2], knL: [1.3, 0, 0], thR: [0.7, 0.3, -0.2], knR: [1.0, 0, 0] };
// Ultimate: sword raised to sky, then descending
A.ultRaise = { pos: [0, 0.02, 0], chest: [-0.3, 0, 0], head: [-0.6, 0, 0], shR: [-3.1, 0, -0.05], elR: [0, 0, 0], haR: [0, 0, 0], shL: [-0.3, 0, 0.6], elL: [-0.3, 0, 0], thL: [0, 0, 0.12], thR: [0, 0, -0.12] };
Object.assign(POSE, A);

// ----------------------------------------------------------------------------- clips
// keys: [time, poseName | poseObj, hold?]  — hold=true means "snap" (no interpolation into this key)
const C = {};
const loop = (fps, keys, extra = {}) => ({ fps, loop: true, keys, ...extra });
const once = (fps, keys, extra = {}) => ({ fps, loop: false, keys, ...extra });

C.idle = loop(8, [[0, 'idleA'], [1.2, 'idleB'], [2.4, 'idleA']]);
C.guard = loop(8, [[0, 'guard'], [0.9, 'guardB'], [1.8, 'guard']]);
C.walk = loop(18, [[0, 'walkA'], [0.25, 'walkB'], [0.5, mirror(POSE.walkA)], [0.75, mirror(POSE.walkB)], [1.0, 'walkA']]);
C.run = loop(24, [[0, 'runA'], [0.16, 'runB'], [0.32, mirror(POSE.runA)], [0.48, mirror(POSE.runB)], [0.64, 'runA']]);
const rsA = POSE.runSwordA, rsB = POSE.runSwordB;
const mA = mirror(rsA), mB = mirror(rsB);
// keep the sword arm trailing on both steps
mA.shR = rsA.shR; mA.elR = rsA.elR; mA.haR = rsA.haR; mA.shL = [-0.8, 0, 0.2]; mB.shR = rsB.shR; mB.elR = rsB.elR; mB.haR = rsB.haR;
C.runSword = loop(24, [[0, rsA], [0.15, rsB], [0.3, mA], [0.45, mB], [0.6, rsA]]);
C.jump = once(16, [[0, 'land'], [0.06, 'jumpUp'], [0.5, 'jumpUp']]);
C.fall = loop(12, [[0, 'fall'], [0.4, P(POSE.fall, { shL: [-0.7, 0, 1.4], shR: [-0.5, 0, -1.3] })], [0.8, 'fall']]);
C.land = once(16, [[0, 'land'], [0.12, 'land'], [0.3, 'guard']]);
C.block = loop(10, [[0, 'block'], [0.5, P(POSE.block, { pos: [0, -0.13, 0] })], [1, 'block']]);
C.blockHit = once(20, [[0, P(POSE.block, { pos: [0, -0.2, -0.12], chest: [-0.1, 0.15, 0] })], [0.12, 'block'], [0.25, 'block']]);
C.parry = once(24, [[0, 'parry', true], [0.15, P(POSE.parry, { shR: [-2.1, -1.1, 0] })], [0.45, 'guard']]);
C.dodge = once(20, [[0, 'dodge', true], [0.32, 'dodge'], [0.45, 'guard']]);
C.dash = once(20, [[0, 'dashPose', true], [0.3, 'dashPose'], [0.4, 'guard']]);
C.hit = once(15, [[0, 'hitF', true], [0.13, 'hitF'], [0.4, 'guard']]);
C.hit2 = once(15, [[0, 'hitF2', true], [0.13, 'hitF2'], [0.4, 'guard']]);
C.knockdown = once(12, [[0, 'hitF', true], [0.15, P(POSE.lieBack, { pos: [0, -0.5, 0], hips: [-1.0, 0, 0] })], [0.35, 'lieBack'], [1.0, 'lieBack']]);
C.getup = once(12, [[0, 'lieBack'], [0.25, 'sitUp'], [0.5, 'kneel'], [0.75, 'guard']]);
C.death = once(10, [[0, 'hitF', true], [0.3, P(POSE.kneel, { head: [0.6, 0, 0] })], [0.7, 'dead'], [5, 'dead']]);
C.lie = loop(4, [[0, 'lieBack'], [2, P(POSE.lieBack, { head: [0.1, 0.35, 0] })], [4, 'lieBack']]);
C.wakeUp = once(10, [[0, 'lieBack'], [0.8, 'lieBack'], [1.4, 'sitUp'], [2.4, P(POSE.sitUp, { head: [0, 0.6, 0] })], [3.2, P(POSE.sitUp, { head: [0, -0.6, 0] })], [3.8, 'kneel'], [4.5, 'idleA']]);
C.lookAround = once(8, [[0, 'idleA'], [0.6, 'lookL'], [1.5, 'lookL'], [2.1, 'lookR'], [3.0, 'lookR'], [3.5, 'lookUp'], [4.2, 'handLook'], [5.2, 'handLook'], [5.8, 'idleA']]);
C.pickUp = once(10, [[0, 'idleA'], [0.4, 'crouchLook'], [1.2, 'crouchLook'], [1.6, 'lookSword'], [2.4, 'guard']]);
C.lookSword = loop(6, [[0, 'lookSword'], [1.5, P(POSE.lookSword, { head: [0.4, 0.05, 0] })], [3, 'lookSword']]);
C.shock = once(12, [[0, 'shock', true], [0.5, 'shock'], [1.2, 'idleA']]);
C.kneelSword = loop(6, [[0, 'kneelSword'], [1, P(POSE.kneelSword, { pos: [0, -0.52, 0] })], [2, 'kneelSword']]);
C.talk = loop(6, [[0, 'talk1'], [0.8, 'talk2'], [1.6, 'idleB'], [2.4, 'talk1']]);
C.wave = loop(8, [[0, 'wave1'], [0.25, 'wave2'], [0.5, 'wave1']]);
C.armsCross = loop(4, [[0, 'armsCross'], [2, P(POSE.armsCross, { head: [0.05, 0.2, 0] })], [4, 'armsCross']]);
C.hammer = loop(10, [[0, 'hammerUp'], [0.35, 'hammerDown', true], [0.6, 'hammerDown'], [1.0, 'hammerUp']]);
C.sweep = loop(8, [[0, 'sweep1'], [0.7, 'sweep2'], [1.4, 'sweep1']]);
C.pray = loop(4, [[0, 'pray'], [2, P(POSE.pray, { head: [0.5, 0, 0] })], [4, 'pray']]);
C.cheer = loop(8, [[0, 'cheer'], [0.25, P(POSE.cheer, { pos: [0, 0.12, 0] })], [0.5, 'cheer']]);
C.sit = loop(4, [[0, 'sit'], [3, P(POSE.sit, { head: [0.1, 0.2, 0] })], [6, 'sit']]);
C.cast = once(12, [[0, 'cast1'], [0.3, 'cast2'], [0.8, 'cast1']]);
C.bow = loop(8, [[0, 'bowDraw'], [1, P(POSE.bowDraw, { elR: [-2.4, 0, 0] })], [2, 'bowDraw']]);
C.ultRaise = once(10, [[0, 'guard'], [0.35, 'ultRaise'], [3, 'ultRaise']]);
C.kneel = loop(4, [[0, 'kneel'], [2, P(POSE.kneel, { head: [0.3, 0, 0] })], [4, 'kneel']]);

// Attack clips are generated from (wind, hit, follow) poses and timing so moves.js can scale speed.
/** Blend two poses (names or objects) into a new in-between pose. */
export function mixPose(a, b, k) {
  const A = typeof a === 'string' ? POSE[a] : a, B = typeof b === 'string' ? POSE[b] : b;
  const o = {};
  for (const j of [...JOINTS, 'pos']) {
    const x = A[j] || ZERO, y = B[j] || ZERO;
    o[j] = [lerp(x[0], y[0], k), lerp(x[1], y[1], k), lerp(x[2], y[2], k)];
  }
  return o;
}
export function attackClip(wind, hit, follow, { fps = 15, tWind = 0.12, tHit = 0.05, tFollow = 0.1, tRecover = 0.2, end = 'guard', holdWind = 0.04 } = {}) {
  const t1 = tWind, t2 = t1 + holdWind, t3 = t2 + tHit, t4 = t3 + tFollow, t5 = t4 + tRecover;
  follow = follow || hit;
  // in-betweens: an eased lead into the wind-up, a settle out of the strike and a soft recovery
  return once(fps, [[0, end], [t1 * 0.55, mixPose(end, wind, 0.72)], [t1, wind], [t2, wind], [t3, hit, true],
    [t3 + tFollow * 0.45, mixPose(hit, follow, 0.7)], [t4, follow], [t4 + tRecover * 0.45, mixPose(follow, end, 0.55)], [t5, end]],
  { activeStart: t2, activeEnd: t3 + tFollow * 0.5, total: t5 });
}
export const CLIPS = C;

// ----------------------------------------------------------------------------- animator
export class Animator {
  constructor(target, clips = CLIPS) {
    this.target = target; this.clips = clips;
    this.clip = null; this.name = ''; this.t = 0; this.speed = 1;
    this.blendFrom = null; this.blendT = 0; this.blendDur = 0;
    this.cur = {}; this.overlay = null; this.fpsOverride = 0;
  }
  play(name, { speed = 1, blend = 0.08, restart = false, clip = null } = {}) {
    const c = clip || this.clips[name];
    if (!c) { console.warn('missing clip', name); return; }
    if (!restart && this.name === name && !clip) { this.speed = speed; return; }
    this.blendFrom = this._snapshot(); this.blendT = 0; this.blendDur = blend;
    this.clip = c; this.name = name; this.t = 0; this.speed = speed; this._snapIdx = -1;
  }
  get done() { const c = this.clip; return c && !c.loop && this.t >= c.keys[c.keys.length - 1][0]; }
  get duration() { const c = this.clip; return c ? c.keys[c.keys.length - 1][0] : 0; }
  _snapshot() { const s = {}; for (const k of JOINTS) s[k] = this.cur[k] ? this.cur[k].slice() : [0, 0, 0]; s.pos = this.cur.pos ? this.cur.pos.slice() : [0, 0, 0]; return s; }
  _resolve(p) { return typeof p === 'string' ? POSE[p] : p; }
  sample(t) {
    const c = this.clip; const keys = c.keys; const end = keys[keys.length - 1][0];
    let tt = c.loop ? (t % end) : Math.min(t, end);
    const smooth = Animator.STYLE === 'smooth';
    const fps = smooth ? 0 : (this.fpsOverride || c.fps);
    if (fps) tt = Math.floor(tt * fps + 1e-6) / fps; // stepped sampling: the anime "on twos" look
    let i = 0; while (i < keys.length - 2 && keys[i + 1][0] <= tt) i++;
    const [ta, pa] = keys[i], [tb, pb, snap] = keys[i + 1];
    let u = tb > ta ? clamp((tt - ta) / (tb - ta), 0, 1) : 1;
    if (snap) {
      // impact keys: instant in anime mode, a very fast ease-out strike in smooth mode
      if (u > 0 && this._snapIdx !== i) { this._snapIdx = i; this.onSnap?.(); }
      u = smooth ? 1 - Math.pow(1 - u, 4) : (u > 0 ? 1 : 0);
    } else u = smooth ? u * u * u * (u * (u * 6 - 15) + 10) : u * u * (3 - 2 * u);
    const A = this._resolve(pa), B = this._resolve(pb);
    const out = {};
    for (const k of JOINTS) {
      const a = A[k] || ZERO, b = B[k] || ZERO;
      out[k] = [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
    }
    const a = A.pos || ZERO, b = B.pos || ZERO;
    out.pos = [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
    return out;
  }
  update(dt) {
    if (!this.clip) return;
    this.t += dt * this.speed;
    let p = this.sample(this.t);
    if (this.blendFrom && this.blendT < this.blendDur) {
      this.blendT += dt;
      let u = clamp(this.blendT / this.blendDur, 0, 1);
      u = Animator.STYLE === 'smooth' ? u * u * (3 - 2 * u) : Math.floor(u * 3) / 3; // blend in steps in anime mode
      const f = this.blendFrom; const o = {};
      for (const k of JOINTS) { const a = f[k], b = p[k]; o[k] = [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)]; }
      o.pos = [lerp(f.pos[0], p.pos[0], u), lerp(f.pos[1], p.pos[1], u), lerp(f.pos[2], p.pos[2], u)];
      p = o;
    }
    if (this.overlay) this.overlay(p);
    this.cur = p;
    this.target.applyPose(p);
  }
}
const ZERO = [0, 0, 0];
// 'smooth' (continuous, clean) or 'anime' (stepped on twos/threes). Switchable in the System menu.
Animator.STYLE = 'smooth';
