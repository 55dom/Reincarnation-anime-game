// Non-humanoid monsters & bosses built from chunky toon primitives with stepped procedural animation.
import * as THREE from 'three';
import { inked, roundBox, glowMat, toon } from '../render/toon.js';
import { faceTexture } from './face.js';
import { lerp } from '../core/util.js';
import { bakeGroups } from './bake.js';

const step = (t, fps = 12) => Math.floor(t * fps) / fps;
const grp = (parent, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.order = 'YXZ'; parent.add(g); return g; };
const put = (parent, geo, color, x = 0, y = 0, z = 0, ol = 0.02, opt) => { const m = inked(geo, color, ol, opt); m.position.set(x, y, z); parent.add(m); return m; };
const limb = (len, r0, r1, seg = 6) => { const g = new THREE.CylinderGeometry(r0, r1, len, seg); g.translate(0, -len / 2, 0); return g; };

// ------------------------------------------------------------------ WOLF (also Frost wolf / Behemoth)
export function makeWolf({ fur = 0x5a5a6a, belly = 0x8a8a96, eye = 0xffcc33, scale = 1, horns = null, crystals = null, mane = null } = {}) {
  const root = new THREE.Group(); const model = grp(root); const P = {};
  model.scale.setScalar(scale);
  const ol = 0.02;
  P.body = grp(model, 0, 0.85, 0);
  put(P.body, roundBox(0.5, 0.46, 1.05, 0.15), fur, 0, 0, -0.05, ol);
  put(P.body, roundBox(0.58, 0.56, 0.5, 0.18), mane || fur, 0, 0.04, 0.3, ol); // chest ruff
  put(P.body, roundBox(0.36, 0.2, 0.8, 0.08), belly, 0, -0.2, 0, ol);
  for (let i = 0; i < 6; i++) { const c = put(P.body, new THREE.ConeGeometry(0.07, 0.28, 4), mane || fur, 0, 0.26, 0.35 - i * 0.16, ol); c.rotation.x = -0.9; }
  if (crystals) for (let i = 0; i < 5; i++) { const c = put(P.body, new THREE.OctahedronGeometry(0.12, 0), crystals, (i % 2 ? 0.12 : -0.12), 0.3, 0.3 - i * 0.18, 0.015, { emissive: crystals, emissiveIntensity: 0.4 }); c.scale.y = 2.2; c.rotation.z = (i % 2 ? -0.4 : 0.4); }
  P.neck = grp(P.body, 0, 0.12, 0.5);
  P.head = grp(P.neck, 0, 0.08, 0.18);
  put(P.head, roundBox(0.34, 0.3, 0.36, 0.1), fur, 0, 0, 0, ol);
  put(P.head, roundBox(0.2, 0.14, 0.3, 0.05), belly, 0, -0.05, 0.27, ol); // snout
  put(P.head, new THREE.SphereGeometry(0.04, 6, 4), 0x151015, 0, -0.0, 0.43, 0.01); // nose
  P.jaw = grp(P.head, 0, -0.11, 0.12);
  put(P.jaw, roundBox(0.16, 0.06, 0.26, 0.03), belly, 0, -0.02, 0.12, 0.015);
  for (const sx of [-1, 1]) { put(P.jaw, new THREE.ConeGeometry(0.02, 0.06, 4), 0xffffff, sx * 0.05, 0.03, 0.2, 0.005).rotation.x = 0; }
  for (const sx of [-1, 1]) { const e = put(P.head, new THREE.ConeGeometry(0.07, 0.2, 4), fur, sx * 0.11, 0.21, -0.05, ol); e.rotation.z = -sx * 0.2; }
  P.eyes = [];
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), glowMat(eye, 1)); e.position.set(sx * 0.1, 0.06, 0.17); e.scale.set(1.3, 0.7, 0.5); P.head.add(e); P.eyes.push(e); }
  if (horns) for (const sx of [-1, 1]) { const h = put(P.head, new THREE.ConeGeometry(0.06, 0.45, 5), horns, sx * 0.13, 0.22, -0.08, 0.015, { emissive: horns, emissiveIntensity: 0.3 }); h.rotation.set(-0.9, 0, -sx * 0.4); }
  P.tail = grp(P.body, 0, 0.12, -0.55);
  P.tail2 = grp(P.tail, 0, 0, -0.25);
  put(P.tail, new THREE.ConeGeometry(0.1, 0.3, 5).rotateX(-Math.PI / 2).translate(0, 0, -0.12), fur, 0, 0, 0, ol);
  put(P.tail2, new THREE.ConeGeometry(0.09, 0.32, 5).rotateX(-Math.PI / 2).translate(0, 0, -0.14), mane || fur, 0, 0, 0, ol);
  P.legs = [];
  for (const [x, z, front] of [[0.17, 0.35, 1], [-0.17, 0.35, 1], [0.17, -0.4, 0], [-0.17, -0.4, 0]]) {
    const up = grp(P.body, x, -0.1, z);
    put(up, limb(0.38, 0.09, 0.07), fur, 0, 0, 0, ol);
    const lo = grp(up, 0, -0.36, 0);
    put(lo, limb(0.38, 0.065, 0.05), fur, 0, 0, 0, ol);
    put(lo, roundBox(0.12, 0.07, 0.17, 0.03), belly, 0, -0.38, 0.04, 0.015);
    P.legs.push({ up, lo, front, side: Math.sign(x) });
  }
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const anim = (state, t, k = {}) => {
    const s = step(t, state === 'run' ? 16 : 12);
    const B = P.body;
    B.position.set(0, 0.85, 0); B.rotation.set(0, 0, 0); P.neck.rotation.set(0, 0, 0); P.head.rotation.set(0, 0, 0); P.jaw.rotation.x = 0.05;
    P.tail.rotation.set(0.5, Math.sin(s * 3) * 0.3, 0); P.tail2.rotation.set(-0.2, Math.sin(s * 3 - 1) * 0.4, 0);
    for (const L of P.legs) { L.up.rotation.set(0, 0, 0); L.lo.rotation.set(0, 0, 0); }
    if (state === 'idle' || state === 'strafe') {
      B.position.y = 0.85 + Math.sin(s * 2) * 0.015; P.head.rotation.y = Math.sin(s * 0.7) * 0.3; P.neck.rotation.x = 0.1;
      if (state === 'strafe') for (const L of P.legs) L.up.rotation.x = Math.sin(s * 8 + (L.front ? 0 : 2) + (L.side > 0 ? 0 : Math.PI)) * 0.3;
    } else if (state === 'run') {
      const f = s * (k.speed || 11);
      B.position.y = 0.85 + Math.abs(Math.sin(f)) * 0.12; B.rotation.x = Math.sin(f) * 0.12;
      for (const L of P.legs) { const ph = f + (L.front ? 0 : Math.PI * 0.8) + (L.side > 0 ? 0 : 0.4); L.up.rotation.x = Math.sin(ph) * 0.85; L.lo.rotation.x = (L.front ? -1 : 1) * Math.max(0, Math.cos(ph)) * 0.8; }
      P.neck.rotation.x = 0.25 - Math.sin(f) * 0.1; P.tail.rotation.x = 0.1;
    } else if (state === 'growl' || state === 'windup') {
      const shake = state === 'windup' ? Math.sin(s * 60) * 0.02 : Math.sin(s * 30) * 0.01;
      B.position.y = 0.68; B.rotation.x = 0.18; B.position.z = -0.1 + shake; P.neck.rotation.x = 0.35; P.head.rotation.x = -0.2; P.jaw.rotation.x = 0.35;
      for (const L of P.legs) { L.up.rotation.x = L.front ? -0.5 : 0.9; L.lo.rotation.x = L.front ? 0.9 : -1.4; }
      P.tail.rotation.x = 0.9;
    } else if (state === 'lunge' || state === 'bite') {
      B.position.y = 1.05; B.rotation.x = -0.25; P.neck.rotation.x = -0.1; P.jaw.rotation.x = state === 'bite' ? 0.0 : 0.7;
      for (const L of P.legs) { L.up.rotation.x = L.front ? -1.2 : 1.1; L.lo.rotation.x = L.front ? 0.3 : -0.2; }
    } else if (state === 'swipe') {
      B.rotation.x = -0.35; B.position.y = 0.95; P.jaw.rotation.x = 0.5;
      const fl = P.legs[1]; fl.up.rotation.set(-2.0, 0, -0.6); fl.lo.rotation.x = -0.3;
    } else if (state === 'howl') {
      B.rotation.x = -0.45; B.position.y = 0.95; P.neck.rotation.x = -0.6; P.head.rotation.x = -0.5; P.jaw.rotation.x = 0.6;
      for (const L of P.legs) { if (!L.front) { L.up.rotation.x = 0.9; L.lo.rotation.x = -1.3; } }
    } else if (state === 'hit') {
      B.rotation.x = -0.2; B.position.z = -0.12; P.neck.rotation.x = -0.3; P.jaw.rotation.x = 0.5; P.head.rotation.z = 0.3;
    } else if (state === 'air') {
      B.rotation.z = Math.sin(s * 10) * 0.2; B.rotation.x = -0.3;
      for (const L of P.legs) { L.up.rotation.x = Math.sin(s * 14 + L.side) * 0.8; L.lo.rotation.x = 0.6; }
      P.jaw.rotation.x = 0.6;
    } else if (state === 'down' || state === 'dead' || state === 'stagger') {
      if (state === 'stagger') { B.position.y = 0.6; B.rotation.z = 0.25 + Math.sin(s * 5) * 0.08; P.neck.rotation.x = 0.6; P.jaw.rotation.x = 0.4; for (const L of P.legs) { L.up.rotation.x = 0.4; L.lo.rotation.x = -0.6; } }
      else { B.position.y = 0.35; B.rotation.z = Math.PI / 2 * 0.95; P.neck.rotation.x = 0.2; P.jaw.rotation.x = 0.4; for (const L of P.legs) { L.up.rotation.x = 0.3 * L.side; L.lo.rotation.x = 0.2; } }
    }
  };
  bakeGroups(root);
  return { root, model, parts: P, anim, height: 1.2 * scale, radius: 0.6 * scale };
}

// ------------------------------------------------------------------ SLIME
export function makeSlime({ color = 0x5ad0ff, scale = 1, crown = false } = {}) {
  const root = new THREE.Group(); const model = grp(root); model.scale.setScalar(scale); const P = {};
  P.body = grp(model, 0, 0, 0);
  const g = new THREE.SphereGeometry(0.5, 18, 12); g.translate(0, 0.42, 0);
  const pos = g.attributes.position; for (let i = 0; i < pos.count; i++) if (pos.getY(i) < 0.15) pos.setY(i, 0.15 - (0.15 - pos.getY(i)) * 0.3);
  g.computeVertexNormals();
  const mat = toon(color, { transparent: true, opacity: 0.88, steps: 2 });
  P.blob = put(P.body, g, mat, 0, 0, 0, 0.02);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.505, 18, 12, Math.PI / 2 - 0.9, 1.8, 1.0, 1.2), new THREE.MeshBasicMaterial({ map: faceTexture({ eye: 0x1a1a40, style: 'cute', blush: true }, 'happy'), transparent: true, depthWrite: false }));
  face.position.y = 0.42; P.body.add(face); P.face = face;
  const hl = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff })); hl.position.set(-0.22, 0.72, 0.28); hl.scale.set(1, 0.6, 0.4); P.body.add(hl);
  if (crown) { const c = put(P.body, new THREE.CylinderGeometry(0.18, 0.2, 0.14, 6, 1, true), 0xe8c04a, 0, 0.95, 0, 0.01); c.material = toon(0xe8c04a, { side: THREE.DoubleSide }); }
  const anim = (state, t, k = {}) => {
    const s = step(t, 12);
    let sy = 1, sx = 1, y = 0;
    if (state === 'idle' || state === 'strafe' || state === 'run') { const b = Math.abs(Math.sin(s * (state === 'run' ? 8 : 4))); y = b * (state === 'run' ? 0.5 : 0.08); sy = 0.85 + b * 0.25; sx = 1.1 - b * 0.15; }
    else if (state === 'windup') { sy = 0.6; sx = 1.3; }
    else if (state === 'lunge' || state === 'bite') { sy = 1.4; sx = 0.8; y = 0.4; }
    else if (state === 'hit') { sy = 0.7; sx = 1.25; }
    else if (state === 'air') { sy = 1.2; sx = 0.85; }
    else if (state === 'down' || state === 'stagger') { sy = 0.5; sx = 1.4; }
    else if (state === 'dead') { sy = 0.2; sx = 1.8; }
    P.body.position.y = y; P.body.scale.set(sx, sy, sx);
    const expr = state === 'hit' || state === 'dead' || state === 'down' ? 'hurt' : state === 'windup' || state === 'lunge' ? 'angry' : 'happy';
    const tx = faceTexture({ eye: 0x1a1a40, style: 'cute', blush: true }, expr); if (P.face.material.map !== tx) { P.face.material.map = tx; P.face.material.needsUpdate = true; }
    void k;
  };
  bakeGroups(root);
  return { root, model, parts: P, anim, height: 0.9 * scale, radius: 0.5 * scale };
}

// ------------------------------------------------------------------ SCORPION
export function makeScorpion({ color = 0xb0603a, scale = 1 } = {}) {
  const root = new THREE.Group(); const model = grp(root); model.scale.setScalar(scale); const P = {};
  P.body = grp(model, 0, 0.45, 0);
  put(P.body, roundBox(0.7, 0.3, 0.9, 0.1), color, 0, 0, 0);
  put(P.body, roundBox(0.45, 0.25, 0.35, 0.08), color, 0, 0.02, 0.55);
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), glowMat(0xff3333)); e.position.set(sx * 0.1, 0.12, 0.7); P.body.add(e); }
  P.claws = [];
  for (const sx of [-1, 1]) {
    const a = grp(P.body, sx * 0.25, 0, 0.6); put(a, limb(0.35, 0.06, 0.05).rotateX(-Math.PI / 2), color);
    const b = grp(a, 0, 0, 0.35); put(b, roundBox(0.18, 0.12, 0.28, 0.05), color, 0, 0, 0.12);
    const pin = grp(b, sx * 0.05, 0, 0.2); put(pin, new THREE.ConeGeometry(0.04, 0.2, 4).rotateX(Math.PI / 2), 0x6a3a20, 0, 0, 0.08);
    a.rotation.y = -sx * 0.4; P.claws.push({ a, b, pin, sx });
  }
  P.tail = []; let parent = P.body; let z = -0.45;
  for (let i = 0; i < 5; i++) { const s = grp(parent, 0, i === 0 ? 0.1 : 0, i === 0 ? z : -0.22); put(s, roundBox(0.2 - i * 0.02, 0.18 - i * 0.015, 0.24, 0.06), color, 0, 0, -0.1); P.tail.push(s); parent = s; }
  const sting = grp(parent, 0, 0, -0.24); put(sting, new THREE.ConeGeometry(0.06, 0.3, 5).rotateX(-Math.PI / 2), 0x3a1a10, 0, 0, -0.12); P.sting = sting;
  P.legs = [];
  for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) { const l = grp(P.body, sx * 0.32, -0.05, 0.3 - i * 0.22); put(l, limb(0.4, 0.035, 0.025), 0x8a4a2a); l.rotation.z = sx * 0.9; P.legs.push({ l, i, sx }); }
  const anim = (state, t) => {
    const s = step(t, 12);
    P.body.position.y = 0.45; P.body.rotation.set(0, 0, 0);
    const curl = state === 'windup' ? 1.0 : state === 'lunge' || state === 'bite' ? 0.2 : 0.75;
    P.tail.forEach((seg, i) => { seg.rotation.x = -(curl * 0.55) - (i === 0 ? 0.3 : 0) + Math.sin(s * 3 + i) * 0.05; });
    if (state === 'lunge' || state === 'bite') { P.tail.forEach((seg) => { seg.rotation.x = -0.9; }); P.sting.rotation.x = -1.2; }
    for (const c of P.claws) { c.pin.rotation.y = c.sx * (state === 'swipe' ? 0.0 : 0.4 + Math.sin(s * 6) * 0.2); c.a.rotation.x = state === 'swipe' ? -0.5 : 0; }
    const walk = state === 'run' || state === 'strafe';
    for (const L of P.legs) L.l.rotation.x = walk ? Math.sin(s * 14 + L.i + (L.sx > 0 ? 0 : Math.PI)) * 0.4 : 0;
    if (state === 'hit') P.body.rotation.x = -0.25;
    if (state === 'air') P.body.rotation.z = Math.sin(s * 10) * 0.3;
    if (state === 'dead' || state === 'down') { P.body.rotation.z = Math.PI * 0.95; P.body.position.y = 0.3; }
    if (state === 'stagger') P.body.rotation.z = Math.sin(s * 5) * 0.2;
  };
  bakeGroups(root);
  return { root, model, parts: P, anim, height: 0.7 * scale, radius: 0.6 * scale };
}

// ------------------------------------------------------------------ SENTINEL (Administrator construct)
export function makeSentinel({ scale = 1 } = {}) {
  const root = new THREE.Group(); const model = grp(root); model.scale.setScalar(scale); const P = {};
  P.core = grp(model, 0, 1.6, 0);
  put(P.core, new THREE.BoxGeometry(0.7, 0.7, 0.7), 0xe8ecf4, 0, 0, 0, 0.02);
  const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 12).rotateX(Math.PI / 2), glowMat(0x5fd8ff)); eye.position.z = 0.36; P.core.add(eye); P.eye = eye;
  P.rings = [];
  for (let i = 0; i < 2; i++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.75 + i * 0.2, 0.03, 4, 24), glowMat(i ? 0xfff0a0 : 0x5fd8ff, 0.8)); P.core.add(r); P.rings.push(r); }
  P.cubes = [];
  for (let i = 0; i < 4; i++) { const c = put(model, new THREE.BoxGeometry(0.22, 0.22, 0.22), 0xc8d0e0, 0, 1.6, 0, 0.015); P.cubes.push(c); }
  const anim = (state, t) => {
    const s = step(t, 12);
    P.core.position.y = 1.6 + Math.sin(s * 2) * 0.12;
    P.core.rotation.y = s * (state === 'windup' ? 6 : 1);
    P.rings[0].rotation.set(s * 1.3, s * 0.7, 0); P.rings[1].rotation.set(-s * 0.9, 0, s * 1.1);
    const spread = state === 'windup' ? 1.4 : state === 'lunge' ? 0.4 : 1.0;
    P.cubes.forEach((c, i) => { const a = s * 2 + i * Math.PI / 2; c.position.set(Math.cos(a) * spread, 1.6 + Math.sin(a * 2) * 0.3, Math.sin(a) * spread); c.rotation.set(s * 3, s * 2, 0); });
    P.eye.material = glowMat(state === 'windup' ? 0xff3355 : 0x5fd8ff);
    if (state === 'dead') { P.core.rotation.x = 1; P.core.position.y = 0.4; }
  };
  bakeGroups(root);
  return { root, model, parts: P, anim, height: 2.2 * scale, radius: 0.6 * scale, flying: true };
}

// ------------------------------------------------------------------ RUIN GOLEM (boss)
export function makeGolem({ scale = 1, color = 0x8a8a7a, moss = 0x5a7a4a, core = 0x5fd8ff } = {}) {
  const root = new THREE.Group(); const model = grp(root); model.scale.setScalar(scale); const P = {};
  const ol = 0.03;
  P.hips = grp(model, 0, 1.3, 0);
  put(P.hips, roundBox(1.1, 0.5, 0.7, 0.1), color, 0, 0, 0, ol);
  P.torso = grp(P.hips, 0, 0.25, 0);
  put(P.torso, roundBox(1.8, 1.3, 1.1, 0.15), color, 0, 0.75, 0, ol);
  put(P.torso, roundBox(1.9, 0.4, 1.2, 0.1), moss, 0, 1.4, 0, ol);
  const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), glowMat(core, 1)); c.position.set(0, 0.85, 0.58); P.torso.add(c); P.core = c;
  P.head = grp(P.torso, 0, 1.55, 0.1);
  put(P.head, roundBox(0.6, 0.5, 0.55, 0.08), color, 0, 0.2, 0, ol);
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.05), glowMat(core, 1)); eye.position.set(0, 0.25, 0.29); P.head.add(eye); P.eye = eye;
  P.arms = [];
  for (const sx of [-1, 1]) {
    const sh = grp(P.torso, sx * 1.1, 1.2, 0);
    put(sh, roundBox(0.8, 0.7, 0.8, 0.12), moss, 0, 0.05, 0, ol);
    put(sh, limb(0.9, 0.3, 0.26), color, 0, -0.2, 0, ol);
    const el = grp(sh, 0, -1.05, 0);
    put(el, limb(0.9, 0.3, 0.34), color, 0, 0, 0, ol);
    put(el, roundBox(0.75, 0.65, 0.75, 0.12), color, 0, -1.05, 0, ol); // fist
    P.arms.push({ sh, el, sx });
  }
  P.legs = [];
  for (const sx of [-1, 1]) { const th = grp(P.hips, sx * 0.4, -0.1, 0); put(th, limb(0.6, 0.3, 0.28), color, 0, 0, 0, ol); const kn = grp(th, 0, -0.6, 0); put(kn, limb(0.5, 0.3, 0.36), color, 0, 0, 0, ol); put(kn, roundBox(0.6, 0.25, 0.8, 0.08), color, 0, -0.55, 0.08, ol); P.legs.push({ th, kn, sx }); }
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  // pose tables (shoulder [x,y,z], elbow x, torso [x,y])
  const POSES = {
    idle: { L: [0.1, 0, 0.15], R: [0.1, 0, -0.15], eL: -0.3, eR: -0.3, tor: [0.05, 0] },
    slamWind: { L: [-2.9, 0, 0.3], R: [-2.9, 0, -0.3], eL: -0.6, eR: -0.6, tor: [-0.25, 0] },
    slam: { L: [-1.1, 0, 0.1], R: [-1.1, 0, -0.1], eL: -0.1, eR: -0.1, tor: [0.55, 0], crouch: -0.35 },
    sweepWind: { L: [-0.3, 0, 0.4], R: [-1.4, -1.3, -0.2], eL: -0.4, eR: -0.2, tor: [0.1, -0.6] },
    sweep: { L: [-0.3, 0, 0.4], R: [-1.4, 1.2, -0.2], eL: -0.4, eR: -0.2, tor: [0.1, 0.7] },
    throwWind: { L: [0.3, 0, 0.3], R: [-2.6, 0, 0.3], eL: -0.3, eR: -1.4, tor: [-0.2, -0.5] },
    throw: { L: [0.3, 0, 0.3], R: [-1.3, 0.2, 0], eL: -0.3, eR: -0.1, tor: [0.3, 0.3] },
    beam: { L: [-0.5, 0, 0.8], R: [-0.5, 0, -0.8], eL: -0.5, eR: -0.5, tor: [-0.2, 0] },
    hit: { L: [0.3, 0, 0.5], R: [0.3, 0, -0.5], eL: -0.6, eR: -0.6, tor: [-0.3, 0.1] },
    stagger: { L: [0.4, 0, 0.3], R: [0.2, 0, -0.3], eL: -0.2, eR: -0.4, tor: [0.6, 0.2], crouch: -0.6 },
    dead: { L: [0.6, 0, 0.8], R: [0.4, 0, -0.9], eL: 0, eR: 0, tor: [0.9, 0.3], crouch: -0.9 },
  };
  let cur = POSES.idle;
  const anim = (state, t, k = {}) => {
    const s = step(t, 10);
    const tgt = POSES[k.pose || state] || POSES.idle;
    const u = k.snap ? 1 : 0.35;
    cur = { L: cur.L.map((v, i) => lerp(v, tgt.L[i], u)), R: cur.R.map((v, i) => lerp(v, tgt.R[i], u)), eL: lerp(cur.eL, tgt.eL, u), eR: lerp(cur.eR, tgt.eR, u), tor: cur.tor.map((v, i) => lerp(v, tgt.tor[i], u)), crouch: lerp(cur.crouch || 0, tgt.crouch || 0, u) };
    const [aL, aR] = P.arms[0].sx < 0 ? [P.arms[1], P.arms[0]] : [P.arms[0], P.arms[1]];
    aL.sh.rotation.set(cur.L[0], cur.L[1], cur.L[2]); aR.sh.rotation.set(cur.R[0], cur.R[1], cur.R[2]);
    aL.el.rotation.x = cur.eL; aR.el.rotation.x = cur.eR;
    P.torso.rotation.set(cur.tor[0], cur.tor[1], 0);
    P.hips.position.y = 1.3 + (cur.crouch || 0) + (state === 'idle' ? Math.sin(s * 1.5) * 0.03 : 0);
    const walking = state === 'run' || state === 'strafe';
    for (const L of P.legs) { L.th.rotation.x = walking ? Math.sin(s * 5 + (L.sx > 0 ? 0 : Math.PI)) * 0.45 : (cur.crouch || 0) * -0.6; L.kn.rotation.x = walking ? Math.max(0, Math.sin(s * 5 + (L.sx > 0 ? 0 : Math.PI) + 1)) * 0.6 : (cur.crouch || 0) * -1.2; }
    const glow = state === 'windup' || k.pose?.endsWith('Wind') || k.pose === 'beam';
    P.core.scale.setScalar(glow ? 1.4 + Math.sin(s * 30) * 0.2 : 1); P.eye.scale.x = glow ? 1.4 : 1;
    P.core.rotation.y = s * 2;
  };
  bakeGroups(root);
  return { root, model, parts: P, anim, height: 4 * scale, radius: 1.3 * scale };
}

// ------------------------------------------------------------------ HERALD OF THE ADMINISTRATOR (boss)
export function makeHerald({ scale = 1 } = {}) {
  const root = new THREE.Group(); const model = grp(root); model.scale.setScalar(scale); const P = {};
  P.body = grp(model, 0, 3, 0);
  put(P.body, new THREE.OctahedronGeometry(0.8, 0), 0xf4f6ff, 0, 0, 0, 0.03).scale.set(0.8, 1.6, 0.6);
  put(P.body, new THREE.ConeGeometry(0.9, 2.4, 6), 0xdfe4f2, 0, -1.5, 0, 0.03).rotation.x = Math.PI;
  P.mask = grp(P.body, 0, 1.2, 0.1);
  put(P.mask, new THREE.SphereGeometry(0.45, 12, 10), 0xffffff, 0, 0, 0, 0.025).scale.set(0.85, 1.1, 0.8);
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), glowMat(0x5fd8ff)); eye.position.set(0, 0.03, 0.36); eye.scale.set(1.6, 0.6, 0.5); P.mask.add(eye); P.eye = eye;
  P.halo = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.06, 6, 32), glowMat(0xfff0a0)); P.halo.position.set(0, 1.9, -0.3); P.halo.rotation.x = -0.3; P.body.add(P.halo);
  P.wings = [];
  for (let i = 0; i < 6; i++) { const w = put(P.body, new THREE.BoxGeometry(0.3, 1.6 - Math.abs(i - 2.5) * 0.15, 0.08), 0xe8ecf8, 0, 0, -0.6, 0.02); P.wings.push(w); }
  P.hands = [];
  for (const sx of [-1, 1]) { const h = grp(model, sx * 2.4, 3, 0.8); put(h, roundBox(0.6, 0.8, 0.3, 0.1), 0xf4f6ff, 0, 0, 0, 0.025); for (let f = 0; f < 3; f++) put(h, roundBox(0.14, 0.45, 0.14, 0.05), 0xf4f6ff, (f - 1) * 0.18, -0.55, 0, 0.02); P.hands.push({ h, sx }); }
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const anim = (state, t, k = {}) => {
    const s = step(t, 12);
    P.body.position.y = 3 + Math.sin(s * 1.8) * 0.25;
    P.halo.rotation.z = s * 0.8;
    P.wings.forEach((w, i) => { const a = (i - 2.5) * 0.35 + Math.sin(s * 2 + i) * 0.08 * (state === 'windup' ? 3 : 1); w.position.set(Math.sin(a) * 1.4, Math.cos(a) * 0.6 + 0.3, -0.6); w.rotation.z = -a; });
    const glitch = k.phase2 ? (Math.sin(s * 47) > 0.92 ? 0.25 : 0) : 0;
    model.position.x = glitch;
    for (const H of P.hands) {
      let x = H.sx * 2.4, y = 3 + Math.sin(s * 2 + H.sx) * 0.3, z = 0.8;
      if (k.pose === 'smashWind') { y = 6; z = 1.5; } else if (k.pose === 'smash') { y = 0.6; z = 2.4; x = H.sx * 1.2; } else if (k.pose === 'clap') { x = H.sx * 0.3; z = 2.6; y = 2.4; } else if (k.pose === 'clapWind') { x = H.sx * 4.2; z = 2; }
      H.h.position.lerp(new THREE.Vector3(x, y, z), k.snap ? 1 : 0.4);
      H.h.rotation.x = k.pose === 'smash' ? 1.2 : 0;
    }
    P.eye.material = glowMat(state === 'windup' ? 0xff3355 : (k.phase2 ? 0xff7a2a : 0x5fd8ff));
    if (state === 'dead') { P.body.rotation.x = 0.6; P.body.position.y = 1.2; }
    else P.body.rotation.x = state === 'hit' ? -0.2 : 0;
  };
  bakeGroups(root);
  return { root, model, parts: P, anim, height: 5 * scale, radius: 1.6 * scale, flying: true };
}
