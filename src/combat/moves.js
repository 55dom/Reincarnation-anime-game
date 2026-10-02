// Player move data. Times are in seconds at weapon speed 1.0.
// Slash: { roll, flip, scale, pitch } orient the crescent effect (flip = sweep right→left).
import { attackClip, POSE } from '../chars/anim.js';

export const SKILLS = [
  { id: 'slash', name: 'Basic Slash', lv: 1, desc: 'LMB — 3-hit sword combo.' },
  { id: 'heavy', name: 'Heavy Slash', lv: 2, desc: 'RMB — crushing overhead strike. Breaks guards.' },
  { id: 'dash', name: 'Dash Slash', lv: 3, desc: 'Dodge then LMB — pass-through slash.' },
  { id: 'rise', name: 'Rising Slash', lv: 4, desc: 'LMB, LMB, RMB — launches enemies into the air.' },
  { id: 'aerial', name: 'Aerial Combo', lv: 5, desc: 'After a launch press Shift to pursue, LMB in the air, RMB to slam.' },
  { id: 'counter', name: 'Counter', lv: 6, desc: 'LMB right after a perfect dodge or parry — critical thrust.' },
  { id: 'parry', name: 'Parry', lv: 7, desc: 'Tap Q just before a hit — deflect, stagger, slow time.' },
  { id: 'skill', name: 'Weapon Skill', lv: 8, desc: 'E — unique technique of the equipped weapon (MP).' },
  { id: 'ultimate', name: 'Ultimate Ability', lv: 10, desc: 'R — when LIMIT is full. Finale with time-stop.' },
];

function h(at, o) {
  return { at, arc: 2.0, range: 1, up: 1.6, dmg: 1, kb: 3, launch: 0, juggle: 4, stun: 0.35, stop: 0.06, shake: 0.15, posture: 8, pow: 1, ...o };
}

export function buildMoves() {
  const M = {};
  const mk = (id, clip, o) => { M[id] = { id, clip, ...o }; return M[id]; };
  // --- ground light chain
  mk('l1', attackClip('l1Wind', 'l1Hit', 'l1Follow', { fps: 15, tWind: 0.1, holdWind: 0.03, tHit: 0.05, tFollow: 0.1, tRecover: 0.25 }), {
    hits: [h(0.16, { slash: { roll: -0.6, flip: true, scale: 1.1 }, stop: 0.05 })], lunge: [[0.1, 0.22, 7]], cancel: 0.2, dodgeCancel: 0.18,
    next: { light: 'l2', heavy: 'heavy' }, voice: 0, skill: 'slash' });
  mk('l2', attackClip('l2Wind', 'l2Hit', 'l2Follow', { fps: 15, tWind: 0.08, holdWind: 0.03, tHit: 0.05, tFollow: 0.1, tRecover: 0.25 }), {
    hits: [h(0.14, { slash: { roll: 0.25, flip: false, scale: 1.15 }, stop: 0.05 })], lunge: [[0.08, 0.2, 7]], cancel: 0.18, dodgeCancel: 0.16,
    next: { light: 'l3', heavy: 'rise' }, voice: 1, skill: 'slash' });
  mk('l3', attackClip('l3Wind', 'l3Hit', 'l3Follow', { fps: 12, tWind: 0.14, holdWind: 0.06, tHit: 0.06, tFollow: 0.14, tRecover: 0.3 }), {
    hits: [h(0.24, { arc: 3.6, range: 1.25, dmg: 1.6, kb: 7, stun: 0.5, stop: 0.12, shake: 0.35, posture: 16, pow: 1.6, slash: { roll: 0.08, flip: true, scale: 1.6 }, crit: 0.1 })],
    lunge: [[0.12, 0.28, 8]], cancel: 0.34, dodgeCancel: 0.3, next: { light: 'l1', heavy: 'heavy' }, voice: 2, big: true, skill: 'slash' });
  // --- heavy & launcher
  mk('heavy', attackClip('hWind', 'hHit', 'hFollow', { fps: 12, tWind: 0.2, holdWind: 0.12, tHit: 0.05, tFollow: 0.18, tRecover: 0.32 }), {
    hits: [h(0.36, { arc: 1.6, range: 1.2, dmg: 2.2, kb: 9, stun: 0.7, stop: 0.16, shake: 0.5, posture: 35, pow: 1.9, guardBreak: true, down: true, ground: true, slash: { roll: 1.45, flip: false, scale: 1.5 }, crit: 0.15 })],
    lunge: [[0.3, 0.4, 6]], cancel: 0.5, dodgeCancel: 0.42, next: { light: 'l1' }, voice: 2, big: true, skill: 'heavy', armor: 0.3 });
  mk('rise', attackClip('rWind', 'rHit', 'rFollow', { fps: 12, tWind: 0.12, holdWind: 0.06, tHit: 0.05, tFollow: 0.15, tRecover: 0.3 }), {
    hits: [h(0.2, { arc: 1.8, range: 1.1, dmg: 1.3, kb: 0.5, launch: 13, stun: 1.0, stop: 0.1, shake: 0.3, posture: 12, pow: 1.4, slash: { roll: -1.5, flip: false, scale: 1.4 } })],
    lunge: [[0.1, 0.2, 5]], hop: [0.2, 6], cancel: 0.26, dodgeCancel: 0.24, next: { light: 'l1', heavy: 'heavy', dodge: 'pursuit', jump: 'pursuit' }, voice: 1, skill: 'rise', launcher: true });
  // --- dash slash & pursuit
  mk('dashSlash', attackClip('dWind', 'dHit', 'dHit', { fps: 15, tWind: 0.06, holdWind: 0.02, tHit: 0.06, tFollow: 0.12, tRecover: 0.25 }), {
    hits: [h(0.1, { arc: 2.6, range: 1.3, dmg: 1.4, kb: 2, stun: 0.5, stop: 0.08, shake: 0.25, posture: 12, pow: 1.3, slash: { roll: 0.0, flip: true, scale: 1.8 }, multi: true })],
    lunge: [[0.0, 0.2, 26]], cancel: 0.24, dodgeCancel: 0.2, next: { light: 'l2', heavy: 'rise' }, voice: 1, skill: 'dash', passThrough: true, afterimage: true });
  mk('pursuit', { fps: 20, loop: false, keys: [[0, 'dashPose'], [0.25, 'jumpUp']] }, { hits: [], pursuit: true, cancel: 0.18, dodgeCancel: 0.3, next: { light: 'a1', heavy: 'slam', special: 'special' }, air: true, skill: 'aerial' });
  // --- air chain
  const airOpt = { air: true, gravity: 0.08 };
  mk('a1', attackClip('a1Wind', 'a1Hit', 'a1Hit', { fps: 15, tWind: 0.07, holdWind: 0.02, tHit: 0.05, tFollow: 0.08, tRecover: 0.18, end: 'fall' }), {
    hits: [h(0.12, { juggle: 5.5, up: 2.4, stun: 0.6, slash: { roll: -0.7, flip: true, scale: 1.1 }, air: true })], cancel: 0.16, dodgeCancel: 0.16, next: { light: 'a2', heavy: 'slam', special: 'special' }, voice: 0, ...airOpt, skill: 'aerial' });
  mk('a2', attackClip('a2Wind', 'a2Hit', 'a2Hit', { fps: 15, tWind: 0.07, holdWind: 0.02, tHit: 0.05, tFollow: 0.08, tRecover: 0.18, end: 'fall' }), {
    hits: [h(0.12, { juggle: 5.5, up: 2.4, stun: 0.6, slash: { roll: 0.5, flip: false, scale: 1.1 }, air: true })], cancel: 0.16, dodgeCancel: 0.16, next: { light: 'a3', heavy: 'slam', special: 'special' }, voice: 1, ...airOpt, skill: 'aerial' });
  mk('a3', attackClip('a3Wind', 'a3Hit', 'a3Hit', { fps: 12, tWind: 0.1, holdWind: 0.04, tHit: 0.05, tFollow: 0.1, tRecover: 0.22, end: 'fall' }), {
    hits: [h(0.17, { juggle: 6, up: 2.6, dmg: 1.4, kb: 3, stun: 0.7, stop: 0.1, shake: 0.3, pow: 1.4, slash: { roll: 1.35, flip: false, scale: 1.4 }, air: true })], cancel: 0.2, dodgeCancel: 0.2, next: { light: 'a1', heavy: 'slam', special: 'special' }, voice: 2, ...airOpt, skill: 'aerial' });
  mk('slam', attackClip('slamWind', 'slamHit', 'slamHit', { fps: 12, tWind: 0.12, holdWind: 0.06, tHit: 0.08, tFollow: 0.2, tRecover: 0.3, end: 'guard' }), {
    hits: [h(0.2, { arc: 6.3, range: 1.6, up: 3, dmg: 2.0, kb: 6, launch: 0, juggle: -16, stun: 0.8, stop: 0.12, shake: 0.55, posture: 25, pow: 2, down: true, slash: { roll: 1.57, flip: false, scale: 1.6 }, air: true })],
    slam: true, cancel: 0.5, dodgeCancel: 0.45, next: { light: 'l1' }, voice: 2, air: true, gravity: 0, big: true, skill: 'aerial' });
  // --- counter (after perfect dodge / parry)
  mk('counter', attackClip('tWind', 'tHit', 'tHit', { fps: 15, tWind: 0.05, holdWind: 0.03, tHit: 0.05, tFollow: 0.12, tRecover: 0.25 }), {
    hits: [h(0.1, { arc: 1.2, range: 1.5, dmg: 2.6, kb: 8, stun: 0.9, stop: 0.18, shake: 0.5, posture: 45, pow: 2, slash: { roll: 0, flip: false, scale: 0.9, thrust: true }, crit: 1 })],
    lunge: [[0, 0.15, 22]], cancel: 0.28, dodgeCancel: 0.22, next: { light: 'l2', heavy: 'rise' }, voice: 2, big: true, skill: 'counter', afterimage: true, slowmo: true });
  // --- weapon skills (E)
  mk('crossSlash', attackClip('xWind', 'xHit', 'xHit', { fps: 12, tWind: 0.18, holdWind: 0.12, tHit: 0.06, tFollow: 0.2, tRecover: 0.3 }), {
    hits: [h(0.36, { arc: 2.2, range: 1.6, dmg: 2.6, kb: 10, stun: 0.9, stop: 0.18, shake: 0.6, posture: 40, pow: 2, slash: { roll: -0.8, flip: true, scale: 2.2 }, slash2: { roll: 0.8, flip: false, scale: 2.2 }, crit: 0.3 })],
    lunge: [[0.3, 0.42, 10]], mp: 15, cancel: 0.55, dodgeCancel: 0.5, voice: 2, big: true, charge: true, skill: 'skill' });
  mk('iaido', { ...attackClip('iaiWind', 'dHit', 'dHit', { fps: 12, tWind: 0.12, holdWind: 0.25, tHit: 0.04, tFollow: 0.18, tRecover: 0.3 }) }, {
    hits: [h(0.41, { arc: 3.0, range: 2.2, dmg: 3.2, kb: 3, stun: 1.0, stop: 0.22, shake: 0.6, posture: 50, pow: 2.2, multi: true, slash: { roll: 0.05, flip: true, scale: 3 }, crit: 0.5, delayedCuts: 4 })],
    lunge: [[0.37, 0.46, 40]], mp: 18, cancel: 0.6, dodgeCancel: 0.55, voice: 2, big: true, charge: true, passThrough: true, afterimage: true, skill: 'skill' });
  mk('tempest', { fps: 15, loop: false, keys: [[0, 'guard'], [0.08, 'l3Wind'], [0.16, 'l3Hit', true], [0.24, POSE.l3Wind], [0.32, 'l3Hit', true], [0.4, 'l3Wind'], [0.48, 'l3Hit', true], [0.56, 'l3Wind'], [0.64, 'l3Hit', true], [0.9, 'guard']] }, {
    hits: [0.16, 0.32, 0.48, 0.64].map((t, i) => h(t, { arc: 6.3, range: 1.4, dmg: 0.9, kb: i === 3 ? 8 : 1, stun: 0.5, stop: 0.05, shake: 0.2, posture: 8, pow: 1.2, slash: { roll: (i % 2 ? 0.3 : -0.3), flip: i % 2 === 0, scale: 1.8 } })),
    spin: true, mp: 16, cancel: 0.75, dodgeCancel: 0.7, voice: 2, skill: 'skill' });
  mk('earthbreaker', attackClip('hWind', 'hHit', 'hFollow', { fps: 10, tWind: 0.3, holdWind: 0.2, tHit: 0.06, tFollow: 0.3, tRecover: 0.35 }), {
    hits: [h(0.53, { arc: 6.3, range: 3.2, up: 3, dmg: 3.0, kb: 12, launch: 9, stun: 1.0, stop: 0.2, shake: 0.85, posture: 60, pow: 2.5, slash: { roll: 1.57, flip: false, scale: 2.2 }, quake: true, crit: 0.2 })],
    mp: 20, cancel: 0.8, dodgeCancel: 0.7, voice: 2, big: true, charge: true, armor: 1, skill: 'skill' });
  mk('arcWave', attackClip('xWind', 'l1Hit', 'l1Follow', { fps: 12, tWind: 0.16, holdWind: 0.1, tHit: 0.05, tFollow: 0.15, tRecover: 0.25 }), {
    hits: [], projectile: { kind: 'arc', at: 0.3, count: 3, dmg: 1.6, speed: 30, color: 0x6fd8ff }, mp: 14, cancel: 0.45, dodgeCancel: 0.4, voice: 2, charge: true, skill: 'skill' });
  mk('abyssRend', attackClip('hWind', 'xHit', 'xHit', { fps: 12, tWind: 0.25, holdWind: 0.2, tHit: 0.06, tFollow: 0.2, tRecover: 0.3 }), {
    hits: [h(0.5, { arc: 3.2, range: 2.6, dmg: 4.0, kb: 10, stun: 1.0, stop: 0.22, shake: 0.7, posture: 55, pow: 2.4, slash: { roll: 1.2, flip: true, scale: 3.2, dark: true }, crit: 0.4 })],
    mp: 10, hpCost: 0.08, cancel: 0.7, dodgeCancel: 0.6, voice: 2, big: true, charge: true, skill: 'skill' });
  // --- aerial special finisher (Special used during air combo) & ultimate
  mk('skyfall', { fps: 12, loop: false, keys: [[0, 'slamWind'], [0.25, 'ultRaise'], [0.45, 'slamWind'], [0.55, 'slamHit', true], [1.0, 'slamHit'], [1.3, 'guard']] }, {
    hits: [h(0.55, { arc: 6.3, range: 2.6, up: 6, dmg: 4.5, kb: 12, juggle: -20, stun: 1.2, stop: 0.25, shake: 1, posture: 80, pow: 3, down: true, slash: { roll: 1.57, flip: false, scale: 3 }, quake: true, crit: 0.5, finale: true })],
    mp: 25, slam: true, air: true, gravity: 0, cancel: 1.1, dodgeCancel: 1.0, voice: 2, big: true, skill: 'skill', finale: true });
  mk('ultimate', { fps: 12, loop: false, keys: [[0, 'guard'], [0.4, 'ultRaise'], [1.6, 'ultRaise'], [1.7, 'hWind'], [1.85, 'hHit', true], [2.6, 'hFollow'], [3.0, 'guard']] }, {
    hits: [h(1.85, { arc: 6.3, range: 7, up: 8, dmg: 9, kb: 16, launch: 10, stun: 2, stop: 0.3, shake: 1, posture: 200, pow: 3, slash: { roll: 1.57, flip: false, scale: 5 }, quake: true, crit: 1, finale: true, unblockable: true })],
    cancel: 2.8, dodgeCancel: 9, voice: 2, big: true, armor: 1, invuln: true, skill: 'ultimate', ultimate: true });
  // finisher execution on staggered enemies
  mk('finisher', { fps: 12, loop: false, keys: [[0, 'guard'], [0.2, 'tWind'], [0.5, 'tWind'], [0.55, 'tHit', true], [0.9, 'tHit'], [1.0, 'l3Wind'], [1.08, 'l3Hit', true], [1.6, 'l3Follow'], [1.9, 'guard']] }, {
    hits: [h(0.55, { arc: 6.3, range: 3, dmg: 3, kb: 0, stun: 1.5, stop: 0.2, shake: 0.5, posture: 0, pow: 2, slash: { roll: 0, scale: 1, thrust: true }, crit: 1 }),
      h(1.08, { arc: 6.3, range: 3, dmg: 5, kb: 14, launch: 6, stun: 1.5, stop: 0.3, shake: 0.9, posture: 0, pow: 3, slash: { roll: 0.1, flip: true, scale: 2.6 }, crit: 1, finale: true })],
    cancel: 1.8, dodgeCancel: 9, armor: 1, invuln: true, finisher: true, big: true });
  return M;
}
