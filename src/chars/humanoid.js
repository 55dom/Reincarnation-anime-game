// Stylized 3D anime humanoids: anime proportions, V-jaw heads with drawn faces, spiky / long hair,
// layered clothing, armor, capes, scarves and coat tails. Rigid-part rig driven by the Animator.
import * as THREE from 'three';
import { inked, toon, outlineMaterial, roundBox, glowMat } from '../render/toon.js';
import { faceTexture } from './face.js';
import { makeWeapon, makeEnemyWeapon } from '../combat/weapons.js';
import { Time } from '../core/time.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { bakeGroups } from './bake.js';

export const JOINTS = ['hips', 'spine', 'chest', 'neck', 'head', 'shL', 'elL', 'haL', 'shR', 'elR', 'haR', 'thL', 'knL', 'ftL', 'thR', 'knR', 'ftR'];

const OL = 0.011; // outline thickness

function headGeo(r) {
  const g = new THREE.SphereGeometry(r, 32, 24);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // anime V-jaw: taper the lower half towards a pointed chin
    if (y < 0) {
      const k = -y / r;
      x *= 1 - k * 0.38;
      z *= 1 - k * 0.12;
      if (z > 0) z += k * k * r * 0.12;
      y *= 1 + k * 0.18;
    }
    // slightly flatter sides, wider cranium
    x *= 0.94;
    if (y > 0) { x *= 1.02; z *= 1.04; }
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

function faceGeo(r) {
  // front partial sphere matching the head (with the same jaw deformation)
  const span = 2.0;
  const g = new THREE.SphereGeometry(r * 1.012, 30, 22, Math.PI / 2 - span / 2, span, 0.95, 1.55);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y < 0) { const k = -y / r; x *= 1 - k * 0.38; z *= 1 - k * 0.12; if (z > 0) z += k * k * r * 0.12; y *= 1 + k * 0.18; }
    x *= 0.94;
    if (y > 0) { x *= 1.02; z *= 1.04; }
    p.setXYZ(i, x, y, z + 0.002);
  }
  g.computeVertexNormals();
  return g;
}

/** limb segment: tapered capsule-like cylinder hanging down from the pivot */
function limb(len, r0, r1, seg = 12) {
  const g = new THREE.CylinderGeometry(r0, r1, len, seg, 2);
  g.translate(0, -len / 2, 0);
  const cap = new THREE.SphereGeometry(r0, seg, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  // merge a top cap so joints look round
  const merged = mergeTwo(g, cap);
  return merged;
}
function mergeTwo(a, b) {
  return mergeGeometries([a, b], false);
}

function hairSpike(len, rad, seg = 5) { const g = new THREE.ConeGeometry(rad, len, seg); g.translate(0, len / 2, 0); return g; }

export const DEFAULT_LOOK = {
  build: 'male', height: 1, skin: 0xffe0cc, hair: 0x2a2a3a, hairStyle: 'spiky', eye: 0x3a7ad8, faceStyle: 'hero',
  top: 0x2b3a5a, bottom: 0x3a3a48, accent: 0xd8d0c0, boots: 0x4a3426, gloves: 0x3a2a24, belt: 0x5a3a2a,
  armor: null, cape: null, scarf: null, coat: null, skirt: null, hood: null, horns: null, ears: null, hat: null, sleeves: true,
};

export class Humanoid {
  constructor(look = {}) {
    this.look = { ...DEFAULT_LOOK, ...look };
    const L = this.look;
    this.root = new THREE.Group();
    this.model = new THREE.Group(); // allows squash / smear scaling independently of root
    this.root.add(this.model);
    this.j = {};
    const fem = L.build === 'female' || L.build === 'small';
    const big = L.build === 'big';
    const sw = fem ? 0.82 : big ? 1.3 : 1; // shoulder width factor
    this.dims = { thigh: 0.43, shin: 0.43, upper: 0.27, fore: 0.25, torso: 0.46 };
    const D = this.dims;
    const mk = (name, parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.order = 'YXZ'; parent.add(g); this.j[name] = g; return g; };

    // skeleton
    const hips = mk('hips', this.model, 0, D.thigh + D.shin + 0.05, 0);
    const spine = mk('spine', hips, 0, 0.08, 0);
    const chest = mk('chest', spine, 0, 0.2, 0);
    const neck = mk('neck', chest, 0, 0.27, 0);
    const head = mk('head', neck, 0, 0.07, 0);
    const shX = 0.19 * sw;
    const shL = mk('shL', chest, shX, 0.22, 0), shR = mk('shR', chest, -shX, 0.22, 0);
    const elL = mk('elL', shL, 0, -D.upper, 0), elR = mk('elR', shR, 0, -D.upper, 0);
    const haL = mk('haL', elL, 0, -D.fore, 0), haR = mk('haR', elR, 0, -D.fore, 0);
    const hx = fem ? 0.1 : 0.105;
    const thL = mk('thL', hips, hx, -0.04, 0), thR = mk('thR', hips, -hx, -0.04, 0);
    const knL = mk('knL', thL, 0, -D.thigh, 0), knR = mk('knR', thR, 0, -D.thigh, 0);
    const ftL = mk('ftL', knL, 0, -D.shin, 0), ftR = mk('ftR', knR, 0, -D.shin, 0);

    const add = (parent, geo, color, x = 0, y = 0, z = 0, ol = OL, opt) => { const m = inked(geo, color, ol, opt); m.position.set(x, y, z); parent.add(m); return m; };

    // pelvis & torso
    add(hips, roundBox(0.3 * (fem ? 1.05 : 1) * (big ? 1.2 : 1), 0.18, 0.2, 0.06), L.bottom, 0, 0, 0);
    add(spine, new THREE.CylinderGeometry(0.15 * sw * (big ? 1.1 : 1), (fem ? 0.13 : 0.14) * (big ? 1.2 : 1), 0.22, 10), L.top, 0, 0.08, 0);
    const torsoTop = 0.19 * sw * (big ? 1.1 : 1);
    const ch = add(chest, new THREE.CylinderGeometry(torsoTop, 0.15 * sw * (big ? 1.1 : 1), 0.3, 10), L.top, 0, 0.13, 0);
    ch.scale.z = 0.72;
    add(chest, new THREE.SphereGeometry(torsoTop * 0.98, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), L.top, 0, 0.27, 0).scale.set(1, 0.35, 0.72);
    // collar / accent strip
    add(chest, new THREE.TorusGeometry(0.07, 0.025, 6, 12), L.accent, 0, 0.29, 0).rotation.x = Math.PI / 2;
    add(spine, new THREE.CylinderGeometry(0.155 * sw, 0.155 * sw, 0.05, 10), L.belt, 0, -0.01, 0).scale.z = 0.8;
    add(spine, new THREE.BoxGeometry(0.06, 0.05, 0.02), 0xd8b04a, 0, -0.01, 0.12);
    // neck & head
    add(neck, new THREE.CylinderGeometry(0.045, 0.05, 0.1, 8), L.skin, 0, 0.03, 0);
    const R = 0.15;
    this.headR = R;
    const hm = add(head, headGeo(R), L.skin, 0, R * 0.95, 0);
    this.headMesh = hm;
    // face decal
    this.faceDef = { eye: L.eye, brow: L.brow || darker(L.hair), style: L.faceStyle, blush: L.blush };
    this.faceMat = new THREE.MeshBasicMaterial({ map: faceTexture(this.faceDef, 'neutral'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const face = new THREE.Mesh(faceGeo(R), this.faceMat); face.position.copy(hm.position); face.renderOrder = 2; head.add(face);
    this.face = face;
    // ears
    if (L.ears === 'elf' || L.ears === 'goblin') {
      for (const sx of [-1, 1]) { const e = add(head, new THREE.ConeGeometry(0.035, L.ears === 'goblin' ? 0.22 : 0.16, 4), L.skin, sx * R * 0.95, R * 1.0, -0.01); e.rotation.z = -sx * 1.25; e.rotation.x = -0.3; }
    } else {
      for (const sx of [-1, 1]) add(head, new THREE.SphereGeometry(0.03, 6, 4), L.skin, sx * R * 0.9, R * 0.9, 0).scale.set(0.5, 1, 0.8);
    }
    this.buildHair(head, R, L);
    if (L.horns) for (const sx of [-1, 1]) { const h = add(head, new THREE.ConeGeometry(0.04, 0.26, 6), L.horns, sx * 0.09, R * 1.75, -0.02); h.rotation.z = -sx * 0.5; h.rotation.x = -0.4; }
    if (L.hat === 'witch') { add(head, new THREE.ConeGeometry(0.2, 0.4, 8), L.hatColor || 0x3a2a5a, 0, R * 2.1, -0.02).rotation.x = -0.2; add(head, new THREE.CylinderGeometry(0.32, 0.32, 0.02, 12), L.hatColor || 0x3a2a5a, 0, R * 1.75, 0); }
    if (L.hat === 'helm') { const hm2 = add(head, new THREE.SphereGeometry(R * 1.12, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), L.armor || 0x9aa0aa, 0, R * 1.0, 0); hm2.scale.set(1, 1.05, 1.05); add(head, new THREE.BoxGeometry(0.03, 0.14, 0.12), L.accent, 0, R * 2.05, 0); }
    if (L.hood) { const hd = add(head, new THREE.SphereGeometry(R * 1.22, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), L.hood, 0, R * 0.98, -0.02); hd.rotation.x = -0.35; }
    if (L.crown) { add(head, new THREE.CylinderGeometry(R * 0.85, R * 0.9, 0.06, 8, 1, true), 0xe8c04a, 0, R * 1.85, 0); }

    // arms
    const sleeve = L.sleeves ? L.top : L.skin;
    add(shL, limb(D.upper, 0.055 * (big ? 1.4 : 1), 0.045 * (big ? 1.4 : 1)), sleeve);
    add(shR, limb(D.upper, 0.055 * (big ? 1.4 : 1), 0.045 * (big ? 1.4 : 1)), sleeve);
    add(elL, limb(D.fore, 0.045 * (big ? 1.4 : 1), 0.038 * (big ? 1.3 : 1)), L.sleeves ? L.gloves : L.skin);
    add(elR, limb(D.fore, 0.045 * (big ? 1.4 : 1), 0.038 * (big ? 1.3 : 1)), L.sleeves ? L.gloves : L.skin);
    for (const el of [elL, elR]) add(el, new THREE.CylinderGeometry(0.052 * (big ? 1.4 : 1), 0.05 * (big ? 1.4 : 1), 0.07, 8), L.accent, 0, -D.fore * 0.72, 0); // cuffs
    add(haL, roundBox(0.075, 0.09, 0.085, 0.03), L.gloves, 0, -0.035, 0);
    add(haR, roundBox(0.075, 0.09, 0.085, 0.03), L.gloves, 0, -0.035, 0);
    // legs
    const legR = big ? 1.35 : 1;
    add(thL, limb(D.thigh, 0.075 * legR, 0.06 * legR), L.bottom);
    add(thR, limb(D.thigh, 0.075 * legR, 0.06 * legR), L.bottom);
    add(knL, limb(D.shin, 0.062 * legR, 0.05 * legR), L.boots);
    add(knR, limb(D.shin, 0.062 * legR, 0.05 * legR), L.boots);
    for (const kn of [knL, knR]) add(kn, new THREE.CylinderGeometry(0.07 * legR, 0.066 * legR, 0.08, 8), darker(L.boots, 0.8), 0, -0.04, 0); // boot cuff
    add(ftL, roundBox(0.09 * legR, 0.07, 0.2, 0.03), L.boots, 0, -0.01, 0.04);
    add(ftR, roundBox(0.09 * legR, 0.07, 0.2, 0.03), L.boots, 0, -0.01, 0.04);

    // armor pieces
    if (L.armor) {
      const A = L.armor;
      const pl = add(chest, roundBox(0.34 * sw, 0.26, 0.24, 0.07), A, 0, 0.15, 0.015); pl.scale.z = 1;
      for (const [sh, sx] of [[shL, 1], [shR, -1]]) { const p = add(sh, new THREE.SphereGeometry(0.09 * (big ? 1.4 : 1), 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), A, sx * 0.015, 0.0, 0); p.scale.set(1.15, 0.85, 1.1); add(sh, new THREE.BoxGeometry(0.1, 0.012, 0.13), L.accent, sx * 0.02, 0.0, 0); }
      for (const kn of [knL, knR]) add(kn, roundBox(0.1 * legR, 0.1, 0.06, 0.025), A, 0, -0.02, 0.04);
      for (const el of [elL, elR]) add(el, roundBox(0.085, 0.13, 0.085, 0.03), A, 0, -0.12, 0);
      add(hips, roundBox(0.32, 0.1, 0.22, 0.04), A, 0, -0.02, 0);
    }
    // skirt / coat bottom
    this.flaps = [];
    if (L.skirt) {
      const sk = add(hips, new THREE.CylinderGeometry(0.17, 0.27, 0.3, 12, 1, true), L.skirt, 0, -0.14, 0);
      sk.material = toon(L.skirt, { side: THREE.DoubleSide, steps: 2 }); sk.scale.z = 0.85;
    }
    if (L.coat) {
      // long coat tails (two hinged flaps) – they lag behind motion
      for (const sx of [-1, 1]) {
        const piv = new THREE.Group(); piv.position.set(sx * 0.08, -0.02, -0.06); hips.add(piv);
        const seg2 = new THREE.Group(); seg2.position.y = -0.28; piv.add(seg2);
        add(piv, roundBox(0.15, 0.3, 0.03, 0.012), L.coat, 0, -0.14, 0);
        add(seg2, roundBox(0.14, 0.26, 0.03, 0.012), L.coat, 0, -0.12, 0);
        this.flaps.push({ a: piv, b: seg2, side: sx, rest: 0.12 });
      }
      // coat body over torso
      const cb = add(chest, new THREE.CylinderGeometry(torsoTop * 1.08, 0.16 * sw, 0.32, 10, 1, true), L.coat, 0, 0.12, -0.005);
      cb.scale.z = 0.78; cb.material = toon(L.coat, { side: THREE.DoubleSide, steps: 2 });
      for (const sh of [shL, shR]) add(sh, limb(D.upper * 0.9, 0.064, 0.056), L.coat);
    }
    // cape: three hinged segments that trail behind
    this.cape = null;
    if (L.cape) {
      const c1 = new THREE.Group(); c1.position.set(0, 0.27, -0.12); chest.add(c1);
      const c2 = new THREE.Group(); c2.position.y = -0.33; c1.add(c2);
      const c3 = new THREE.Group(); c3.position.y = -0.33; c2.add(c3);
      const capeMat = toon(L.cape, { side: THREE.DoubleSide, steps: 2 });
      const pg = (w0, w1, h) => { const g = new THREE.BufferGeometry(); const v = [-w0 / 2, 0, 0, w0 / 2, 0, 0, w1 / 2, -h, 0, -w0 / 2, 0, 0, w1 / 2, -h, 0, -w1 / 2, -h, 0]; g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.computeVertexNormals(); return g; };
      for (const [grp, w0, w1] of [[c1, 0.34 * sw, 0.42 * sw], [c2, 0.42 * sw, 0.48 * sw], [c3, 0.48 * sw, 0.5 * sw]]) {
        const m = new THREE.Mesh(pg(w0, w1, 0.34), capeMat); m.castShadow = true; grp.add(m);
        const o = new THREE.Mesh(pg(w0 + 0.02, w1 + 0.02, 0.35), outlineMaterial(0.006)); o.position.z = -0.003; grp.add(o);
      }
      this.cape = [c1, c2, c3];
      add(chest, new THREE.TorusGeometry(0.16 * sw, 0.025, 5, 10, Math.PI), L.capeTrim || L.accent, 0, 0.27, -0.02).rotation.set(Math.PI / 2, 0, 0);
    }
    // scarf with trailing ends
    this.scarf = null;
    if (L.scarf) {
      add(neck, new THREE.TorusGeometry(0.07, 0.035, 6, 12), L.scarf, 0, 0.0, 0).rotation.x = Math.PI / 2;
      const s1 = new THREE.Group(); s1.position.set(0.04, 0.0, -0.07); neck.add(s1);
      const s2 = new THREE.Group(); s2.position.y = -0.22; s1.add(s2);
      add(s1, roundBox(0.07, 0.24, 0.02, 0.008), L.scarf, 0, -0.11, 0);
      add(s2, roundBox(0.065, 0.22, 0.02, 0.008), L.scarf, 0, -0.1, 0);
      this.scarf = [s1, s2];
    }
    // shoulder bag / quiver for archers etc.
    if (L.quiver) { const q = add(chest, new THREE.CylinderGeometry(0.05, 0.045, 0.45, 6), 0x6a4a2a, 0.08, 0.12, -0.15); q.rotation.z = -0.4; }
    if (L.backpack) add(chest, roundBox(0.24, 0.26, 0.12, 0.03), 0x7a5a3a, 0, 0.1, -0.16);
    if (L.apron) add(spine, roundBox(0.24, 0.42, 0.02, 0.01), L.apron, 0, -0.1, 0.13);

    const s = (L.height || 1) * (fem ? 0.94 : big ? 1.08 : 1);
    this.root.scale.setScalar(s);
    this.scale = s;
    this.root.traverse((o) => { if (o.isMesh && !o.userData.isOutline) o.castShadow = true; });
    bakeGroups(this.root);

    this.expr = 'neutral'; this.exprT = 0; this.blinkT = 2 + Math.random() * 3; this.blinking = 0;
    this.weapon = null; this.weaponL = null; this.flapVel = 0; this.sway = new THREE.Vector3(); this.prevPos = new THREE.Vector3();
    this.capeLag = 0;
  }

  buildHair(head, R, L) {
    const col = L.hair; const y0 = R * 0.95;
    const add = (geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => { const m = inked(geo, col, OL); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz); head.add(m); return m; };
    if (L.hairStyle === 'bald') return;
    // cap covering the top/back of the skull
    add(new THREE.SphereGeometry(R * 1.1, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), 0, y0 + 0.012, -0.012, -0.28, 0, 0, 1, 1.03, 1.06);
    const style = L.hairStyle;
    // bangs: flattened cones hanging over the forehead
    const bangs = style === 'long' || style === 'twin' || style === 'bob' || style === 'pony' ? 7 : 6;
    for (let i = 0; i < bangs; i++) {
      const t = i / (bangs - 1) - 0.5;
      const len = 0.1 + (Math.abs(t) * 1.2) * 0.05 + ((i * 37) % 5) * 0.005;
      const m = add(hairSpike(len, 0.045, 4), t * R * 1.5, y0 + R * 1.02, R * 0.7 + (0.5 - Math.abs(t)) * 0.03, Math.PI - 0.62, 0, t * 0.9, 1, 1, 0.45);
      m.rotation.y = t * 0.6;
    }
    // side locks
    for (const sx of [-1, 1]) add(hairSpike(style === 'long' || style === 'twin' ? 0.32 : 0.22, 0.045, 4), sx * R * 0.92, y0 + R * 0.5, R * 0.25, Math.PI - 0.1, 0, sx * 0.12, 1, 1, 0.55);
    if (style === 'spiky' || style === 'messy') {
      // dramatic shonen spikes swept back
      const spikes = [[0, 1.1, -0.2, -0.9, 0], [0.5, 0.95, -0.4, -1.3, 0.5], [-0.5, 0.95, -0.4, -1.3, -0.5], [0.8, 0.6, -0.6, -1.7, 1.0], [-0.8, 0.6, -0.6, -1.7, -1.0],
        [0.3, 0.5, -0.9, -2.1, 0.4], [-0.3, 0.5, -0.9, -2.1, -0.4], [0, 0.2, -1.0, -2.5, 0], [0.6, 0.15, -0.8, -2.4, 1.2], [-0.6, 0.15, -0.8, -2.4, -1.2], [0.2, 1.15, 0.3, -0.5, 0.2], [-0.25, 1.1, 0.35, -0.4, -0.3]];
      for (const [x, y, z, rx, rz] of spikes) add(hairSpike(0.2 + Math.abs(rx) * 0.03, 0.06, 5), x * R, y0 + y * R, z * R, rx, 0, -rz * 0.6);
    }
    if (style === 'short' || style === 'bob' || style === 'pony' || style === 'twin' || style === 'long') {
      for (let i = 0; i < 7; i++) { const a = (i / 6 - 0.5) * 2.6; add(hairSpike(style === 'short' ? 0.14 : 0.22, 0.07, 5), Math.sin(a) * R * 0.9, y0 + R * 0.25, -Math.cos(a) * R * 0.85, Math.PI - 0.3 + Math.cos(a) * 0.1, 0, Math.sin(a) * 0.4); }
    }
    if (style === 'long') {
      const back = add(roundBox(0.3, 0.55, 0.08, 0.04), 0, y0 - R * 1.6, -R * 0.75, 0.12); back.scale.x = 1;
      for (let i = 0; i < 5; i++) add(hairSpike(0.16, 0.05, 4), (i / 4 - 0.5) * 0.26, y0 - R * 3.4, -R * 0.82, Math.PI, 0, 0);
    }
    if (style === 'pony') {
      add(new THREE.SphereGeometry(0.04, 6, 4), 0, y0 + R * 0.6, -R * 1.05);
      this.pony = new THREE.Group(); this.pony.position.set(0, y0 + R * 0.55, -R * 1.1); head.add(this.pony);
      const p = inked(hairSpike(0.45, 0.075, 6), col, OL); p.rotation.x = Math.PI + 0.25; this.pony.add(p);
    }
    if (style === 'twin') {
      this.twin = [];
      for (const sx of [-1, 1]) { const g = new THREE.Group(); g.position.set(sx * R * 0.9, y0 + R * 0.7, -R * 0.4); head.add(g); const p = inked(hairSpike(0.5, 0.07, 6), col, OL); p.rotation.set(Math.PI + 0.2, 0, -sx * 0.25); g.add(p); this.twin.push(g); }
    }
    if (style === 'mohawk') for (let i = 0; i < 5; i++) add(hairSpike(0.18, 0.05, 4), 0, y0 + R * 0.9, (0.6 - i * 0.35) * R, -0.3 - i * 0.3, 0, 0);
    if (L.ahoge) add(hairSpike(0.14, 0.02, 4), 0.02, y0 + R * 1.05, 0.02, 0.6, 0, 0.3);
  }

  setExpression(expr, hold = 0) { this.expr = expr; this.exprT = hold; this._applyFace(); }
  _applyFace() {
    const e = this.blinking > 0 && (this.expr === 'neutral' || this.expr === 'determined' || this.expr === 'angry' || this.expr === 'sad') ? 'blink' : this.expr;
    const t = faceTexture(this.faceDef, e);
    if (this.faceMat.map !== t) { this.faceMat.map = t; this.faceMat.needsUpdate = true; }
  }

  attachWeapon(id, opts = {}) {
    this.detachWeapons();
    const w = makeWeapon(id, opts.scale || 1);
    this.j.haR.add(w.group); w.group.position.set(0, -0.04, 0.0);
    this.weapon = w;
    if (w.def.kind === 'dual') { const w2 = makeWeapon(id, opts.scale || 1); this.j.haL.add(w2.group); w2.group.position.set(0, -0.04, 0); this.weaponL = w2; }
    return w;
  }
  attachEnemyWeapon(kind, scale = 1, left = false) {
    const w = makeEnemyWeapon(kind, scale);
    (left ? this.j.haL : this.j.haR).add(w.group); w.group.position.set(0, -0.04, 0);
    if (left) this.weaponL = w; else this.weapon = w;
    return w;
  }
  detachWeapons() {
    if (this.weapon) this.weapon.group.parent?.remove(this.weapon.group);
    if (this.weaponL) this.weaponL.group.parent?.remove(this.weaponL.group);
    this.weapon = this.weaponL = null;
  }

  /** Apply a pose object { joint: [x,y,z], pos: [x,y,z] } */
  applyPose(p) {
    for (const k of JOINTS) { const v = p[k]; const j = this.j[k]; if (v) j.rotation.set(v[0], v[1], v[2]); else j.rotation.set(0, 0, 0); }
    const base = this.dims.thigh + this.dims.shin + 0.05;
    const pp = p.pos; this.j.hips.position.set(pp ? pp[0] : 0, base + (pp ? pp[1] : 0), pp ? pp[2] : 0);
  }

  /** Secondary motion: cape, coat tails, scarf, hair; blinking & expression timers. */
  updateSecondary(dt, worldVel, moving = 0) {
    // blinking
    this.blinkT -= dt;
    if (this.blinkT < 0) { this.blinking = 0.12; this.blinkT = 2 + Math.random() * 4; this._applyFace(); }
    if (this.blinking > 0) { this.blinking -= dt; if (this.blinking <= 0) this._applyFace(); }
    if (this.exprT > 0) { this.exprT -= dt; if (this.exprT <= 0) { this.expr = 'neutral'; this._applyFace(); } }
    // local-space velocity → lag swing
    const inv = this.root.quaternion.clone().invert();
    const lv = worldVel.clone().applyQuaternion(inv);
    const speed = Math.min(lv.z, 12);
    const vy = worldVel.y;
    this.sway.lerp(new THREE.Vector3(lv.x, vy, speed), 1 - Math.exp(-dt * 8));
    const t = Time.game;
    const flutter = Math.sin(t * 9) * 0.06 * Math.min(1, Math.abs(this.sway.z) / 4) + Math.sin(t * 2.1) * 0.03;
    if (this.cape) {
      const back = Math.min(1.25, Math.max(0, this.sway.z * 0.11 + Math.max(0, -this.sway.y) * 0.05)) + 0.08;
      this.cape[0].rotation.x = back * 0.7 + flutter; this.cape[1].rotation.x = back * 0.35 + flutter * 1.4; this.cape[2].rotation.x = back * 0.25 + flutter * 1.8;
      this.cape[0].rotation.z = -this.sway.x * 0.03;
      // keep the cape from clipping through legs when crouched
      const chestPitch = this.j.spine.rotation.x + this.j.chest.rotation.x + this.j.hips.rotation.x;
      if (chestPitch > 0) this.cape[0].rotation.x += chestPitch * 0.9;
    }
    for (const f of this.flaps) {
      f.a.rotation.x = f.rest + Math.min(1.1, Math.max(0, this.sway.z * 0.09)) + flutter + Math.max(0, -this.j.thL.rotation.x * (f.side < 0 ? 0 : 0.6)) + Math.max(0, -this.j.thR.rotation.x * (f.side > 0 ? 0 : 0.6));
      f.b.rotation.x = f.a.rotation.x * 0.4 + flutter;
    }
    if (this.scarf) {
      // spring-damped scarf: trails behind when running, hangs when still, never sticks out like a rod
      const fwd = Math.max(0, Math.min(10, this.sway.z));
      const want0 = 0.15 + Math.min(1.05, fwd * 0.1) + flutter * 1.5 + Math.max(0, (this.j.spine.rotation.x + this.j.chest.rotation.x)) * 0.8;
      const k = 1 - Math.exp(-dt * 7);
      this._sc0 = (this._sc0 ?? want0) + (want0 - (this._sc0 ?? want0)) * k;
      this._sc1 = (this._sc1 ?? 0.1) + ((0.08 + flutter * 2 + Math.min(0.4, fwd * 0.04)) - (this._sc1 ?? 0.1)) * k;
      this.scarf[0].rotation.x = Math.min(1.15, this._sc0); this.scarf[1].rotation.x = Math.min(0.5, this._sc1);
      this.scarf[0].rotation.z = 0.12 + Math.sin(t * 6) * 0.06 * Math.min(1, fwd / 4);
    }
    if (this.pony) this.pony.rotation.x = Math.min(0.8, this.sway.z * 0.06) + Math.sin(t * 6) * 0.05 - Math.max(-0.5, Math.min(0.5, this.sway.y * 0.04));
    if (this.twin) for (const g of this.twin) g.rotation.x = Math.min(0.9, this.sway.z * 0.07) + Math.sin(t * 6 + g.position.x * 9) * 0.06;
    void moving;
  }
}

function darker(hex, k = 0.6) { const c = new THREE.Color(hex); c.multiplyScalar(k); return c.getHex(); }
export { glowMat };
