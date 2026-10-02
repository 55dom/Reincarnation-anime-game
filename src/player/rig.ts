// Procedural character construction. Humanoids and quadrupeds are joint hierarchies of shaped,
// low-poly meshes (tapered limbs, lathed torsos, faceted heads) driven by the shared ProcAnimator.
import * as THREE from 'three';
import { mat } from '../render/materials';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type JointMap = Record<string, THREE.Object3D>;

export interface Rig {
  root: THREE.Group;      // placed at feet; yaw applied here
  body: THREE.Group;      // scaled visual container
  joints: JointMap;
  rest: Record<string, THREE.Euler>;
  weaponMount?: THREE.Object3D;
  offhandMount?: THREE.Object3D;
  flashMats: THREE.MeshStandardMaterial[]; // tinted on hit / telegraph
  kind: 'biped' | 'quad';
  scale: number;
  hipHeight: number;
}

function limb(len: number, rTop: number, rBot: number, segs = 7): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBot, len, segs, 2);
  // Slight bulge in the middle for a muscle silhouette
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const t = 1 - Math.abs(y / (len / 2));
    const k = 1 + t * 0.12;
    p.setX(i, p.getX(i) * k);
    p.setZ(i, p.getZ(i) * k);
  }
  g.translate(0, -len / 2, 0);
  g.computeVertexNormals();
  return g;
}

function lathe(profile: [number, number][], segs = 8, zScale = 0.7): THREE.BufferGeometry {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segs);
  g.scale(1, 1, zScale);
  g.computeVertexNormals();
  return g;
}

function mesh(g: THREE.BufferGeometry, m: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0): THREE.Mesh {
  const me = new THREE.Mesh(g, m);
  me.position.set(x, y, z);
  me.castShadow = true;
  me.receiveShadow = true;
  parent.add(me);
  return me;
}

function joint(name: string, parent: THREE.Object3D, x: number, y: number, z: number, map: JointMap): THREE.Object3D {
  const o = new THREE.Object3D();
  o.name = name;
  o.position.set(x, y, z);
  parent.add(o);
  map[name] = o;
  return o;
}

export type WeaponKind = 'longsword' | 'spear' | 'greatsword' | 'curved' | 'halberd' | 'shortsword' | 'none';

export interface HumanoidOpts {
  scale?: number;
  skin?: number;
  cloth?: number;
  cloth2?: number;
  leather?: number;
  metal?: number;
  build?: 'light' | 'medium' | 'heavy';
  hood?: boolean;
  helmet?: 'none' | 'open' | 'great';
  cloak?: boolean;
  scarf?: boolean;
  pauldrons?: boolean;
  weapon?: WeaponKind;
  shield?: boolean;
  hair?: number;
  beard?: boolean;
  uniqueMats?: boolean;
}

export function buildHumanoid(o: HumanoidOpts = {}): Rig {
  const s = o.scale ?? 1;
  const build = o.build ?? 'medium';
  const bulk = build === 'heavy' ? 1.18 : build === 'light' ? 0.92 : 1.0;
  const u = o.uniqueMats ?? true;
  const skin = mat('skin', o.skin ?? 0xc89a74, { unique: u });
  const cloth = mat('cloth', o.cloth ?? 0x7a2e22, { unique: u });
  const cloth2 = mat('cloth', o.cloth2 ?? 0xb89a6a, { unique: u, side: THREE.DoubleSide });
  const leather = mat('leather', o.leather ?? 0x4a3020, { unique: u });
  const metal = mat('metal', o.metal ?? 0x9a948a, { unique: u });
  const flashMats = [skin, cloth, cloth2, leather, metal];

  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(s);
  root.add(body);
  const J: JointMap = {};

  const hipY = 0.95;
  const hips = joint('hips', body, 0, hipY, 0, J);
  // Pelvis / belt
  mesh(lathe([[0.0, -0.1], [0.15 * bulk, -0.1], [0.17 * bulk, 0.02], [0.15 * bulk, 0.1], [0, 0.1]], 8, 0.72), leather, hips);
  mesh(new THREE.TorusGeometry(0.16 * bulk, 0.025, 4, 10).rotateX(Math.PI / 2).scale(1, 1, 0.75), leather, hips, 0, 0.06, 0);
  // Tasset / skirt panels
  const skirt = new THREE.CylinderGeometry(0.18 * bulk, 0.24 * bulk, 0.32, 8, 1, true);
  skirt.translate(0, -0.2, 0); skirt.scale(1, 1, 0.8);
  mesh(skirt, cloth2, hips);

  const spine = joint('spine', hips, 0, 0.1, 0, J);
  const chest = joint('chest', spine, 0, 0.16, 0, J);
  // Torso: waist to broad chest
  mesh(lathe([[0.0, -0.16], [0.15 * bulk, -0.16], [0.17 * bulk, 0.0], [0.22 * bulk, 0.18], [0.21 * bulk, 0.3], [0.1, 0.36], [0, 0.37]], 9, 0.62), cloth, chest);
  // Chest plate / jerkin overlay
  const plate = lathe([[0.0, -0.05], [0.18 * bulk, -0.05], [0.235 * bulk, 0.17], [0.22 * bulk, 0.29], [0.0, 0.3]], 8, 0.66);
  mesh(plate, build === 'light' ? leather : build === 'heavy' ? metal : leather, chest, 0, 0, 0.012).scale.set(1.02, 1, 1.05);
  if (o.scarf || o.hood) {
    mesh(new THREE.TorusGeometry(0.12, 0.05, 5, 9).rotateX(Math.PI / 2), cloth2, chest, 0, 0.33, 0);
  }

  const neck = joint('neck', chest, 0, 0.36, 0, J);
  mesh(limb(0.1, 0.055, 0.065, 6).translate(0, 0.1, 0), skin, neck);
  const head = joint('head', neck, 0, 0.1, 0, J);
  const skull = new THREE.IcosahedronGeometry(0.115, 1);
  skull.scale(0.9, 1.08, 1.0);
  mesh(skull, skin, head, 0, 0.1, 0.0);
  // Jaw + nose wedge for a readable face silhouette
  mesh(new THREE.BoxGeometry(0.15, 0.07, 0.12).translate(0, 0.02, 0.03), skin, head);
  mesh(new THREE.ConeGeometry(0.022, 0.05, 4).rotateX(Math.PI / 2), skin, head, 0, 0.09, 0.115);
  // Eyes (dark sockets)
  const eyeM = mat('plain', 0x1a1210, { rough: 0.4 });
  mesh(new THREE.SphereGeometry(0.016, 5, 4), eyeM, head, 0.04, 0.12, 0.095);
  mesh(new THREE.SphereGeometry(0.016, 5, 4), eyeM, head, -0.04, 0.12, 0.095);
  if (o.hair !== undefined && !o.hood && o.helmet !== 'great') {
    const hair = new THREE.IcosahedronGeometry(0.122, 1);
    hair.scale(0.94, 0.8, 1.04);
    mesh(hair, mat('cloth', o.hair, { rough: 1 }), head, 0, 0.15, -0.015);
  }
  if (o.beard) mesh(new THREE.ConeGeometry(0.07, 0.12, 5).rotateX(Math.PI), mat('cloth', o.hair ?? 0x2a1a10), head, 0, -0.02, 0.06);
  if (o.hood) {
    const hood = new THREE.SphereGeometry(0.16, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.62);
    hood.scale(1, 1.15, 1.1);
    mesh(hood, cloth2, head, 0, 0.1, -0.02).rotation.x = -0.25;
    const drape = new THREE.ConeGeometry(0.2, 0.25, 8, 1, true);
    mesh(drape, cloth2, head, 0, -0.04, -0.03);
  }
  if (o.helmet === 'open') {
    const helm = new THREE.SphereGeometry(0.135, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55);
    mesh(helm, metal, head, 0, 0.11, 0);
    mesh(new THREE.BoxGeometry(0.03, 0.09, 0.03), metal, head, 0, 0.1, 0.13);
  } else if (o.helmet === 'great') {
    const helm = new THREE.CylinderGeometry(0.13, 0.145, 0.27, 8);
    mesh(helm, metal, head, 0, 0.1, 0);
    mesh(new THREE.ConeGeometry(0.135, 0.12, 8), metal, head, 0, 0.29, 0);
    mesh(new THREE.BoxGeometry(0.18, 0.018, 0.02), mat('plain', 0x080604), head, 0, 0.12, 0.135);
    // Crest fin
    mesh(new THREE.BoxGeometry(0.02, 0.1, 0.25), cloth, head, 0, 0.32, -0.02);
  }

  const armLen = 0.3, foreLen = 0.27;
  for (const side of [1, -1] as const) {
    const n = side === 1 ? 'L' : 'R';
    const sh = joint('sh' + n, chest, 0.2 * bulk * side, 0.27, 0, J);
    const arm = joint('arm' + n, sh, 0.03 * side, 0, 0, J);
    mesh(limb(armLen, 0.058 * bulk, 0.048 * bulk), cloth, arm);
    // Shoulder cap
    if (o.pauldrons) {
      const pd = new THREE.SphereGeometry(0.1 * bulk, 7, 5, 0, Math.PI * 2, 0, Math.PI * 0.5);
      pd.scale(1.15, 0.9, 1.05);
      mesh(pd, metal, sh, 0.02 * side, 0.02, 0).rotation.z = -0.35 * side;
    } else {
      mesh(new THREE.IcosahedronGeometry(0.065 * bulk, 0), cloth, arm, 0, -0.02, 0);
    }
    const fore = joint('fore' + n, arm, 0, -armLen, 0, J);
    mesh(limb(foreLen, 0.046 * bulk, 0.036 * bulk), skin, fore);
    // Bracer
    mesh(limb(0.15, 0.052 * bulk, 0.045 * bulk), leather, fore, 0, -0.1, 0);
    const hand = joint('hand' + n, fore, 0, -foreLen, 0, J);
    const hg = new THREE.BoxGeometry(0.07, 0.09, 0.05);
    hg.translate(0, -0.045, 0);
    mesh(hg, leather, hand);
    mesh(new THREE.BoxGeometry(0.025, 0.05, 0.025).translate(0, -0.02, 0), leather, hand, -0.04 * side, -0.02, 0.025);

    const thigh = joint('thigh' + n, hips, 0.095 * side * bulk, -0.04, 0, J);
    mesh(limb(0.44, 0.085 * bulk, 0.06 * bulk), cloth2, thigh);
    const shin = joint('shin' + n, thigh, 0, -0.44, 0, J);
    mesh(limb(0.43, 0.058 * bulk, 0.042 * bulk), leather, shin);
    // Knee guard
    mesh(new THREE.IcosahedronGeometry(0.055 * bulk, 0), build === 'heavy' ? metal : leather, shin, 0, -0.02, 0.03);
    const foot = joint('foot' + n, shin, 0, -0.43, 0, J);
    const fg = new THREE.BoxGeometry(0.1, 0.07, 0.22);
    // taper toe
    const fp = fg.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < fp.count; i++) if (fp.getZ(i) > 0) { fp.setX(i, fp.getX(i) * 0.75); if (fp.getY(i) > 0) fp.setY(i, fp.getY(i) * 0.3); }
    fg.computeVertexNormals();
    fg.translate(0, -0.035, 0.05);
    mesh(fg, leather, foot);
  }

  if (o.cloak) {
    const cl = joint('cloak', chest, 0, 0.32, -0.12, J);
    const cg = new THREE.PlaneGeometry(0.46 * bulk, 1.0, 3, 6);
    const cp = cg.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < cp.count; i++) {
      const y = cp.getY(i), x = cp.getX(i);
      const t = (0.5 - y);
      cp.setX(i, x * (1 + t * 0.6));
      cp.setZ(i, -Math.abs(x) * 0.25 - t * 0.05);
    }
    cg.translate(0, -0.5, 0);
    cg.computeVertexNormals();
    mesh(cg, cloth2, cl).rotation.x = 0.06;
  }

  const handR = J['handR'];
  const weaponMount = new THREE.Object3D();
  weaponMount.position.set(0, -0.06, 0.0);
  handR.add(weaponMount);
  if (o.weapon && o.weapon !== 'none') weaponMount.add(buildWeapon(o.weapon, metal, leather));
  const offhandMount = new THREE.Object3D();
  offhandMount.position.set(0.03, -0.06, 0);
  J['handL'].add(offhandMount);
  if (o.shield) {
    const sh = new THREE.CylinderGeometry(0.32, 0.32, 0.05, 7);
    sh.rotateZ(Math.PI / 2);
    const m = mesh(sh, metal, offhandMount, 0.06, 0, 0);
    mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.07, 6).rotateZ(Math.PI / 2), leather, m, 0.02, 0, 0);
  }

  const rest: Record<string, THREE.Euler> = {};
  // A grounded idle rest pose: slight elbow bend, arms out from the body.
  J['armL'].rotation.z = 0.12; J['armR'].rotation.z = -0.12;
  J['foreL'].rotation.x = -0.15; J['foreR'].rotation.x = -0.25;
  for (const k in J) rest[k] = J[k].rotation.clone();
  return optimizeRig({ root, body, joints: J, rest, weaponMount, offhandMount, flashMats, kind: 'biped', scale: s, hipHeight: hipY * s });
}

export function buildWeapon(kind: WeaponKind, metal: THREE.Material, leather: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const bladeShape = (len: number, w: number, curve = 0) => {
    const sh = new THREE.Shape();
    sh.moveTo(-w / 2, 0);
    sh.quadraticCurveTo(-w / 2 + curve * 0.5, len * 0.5, -w * 0.1 + curve, len);
    sh.lineTo(w * 0.15 + curve, len * 1.04);
    sh.quadraticCurveTo(w / 2 + curve * 0.6, len * 0.5, w / 2, 0);
    sh.lineTo(-w / 2, 0);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 1, steps: 1 });
    geo.translate(0, 0, -0.006);
    return geo;
  };
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, y = 0) => {
    const me = new THREE.Mesh(geo, m);
    me.position.y = y;
    me.castShadow = true;
    g.add(me);
    return me;
  };
  // Weapons point along -Y of the hand (down the fist), then rotated so blade extends forward from grip.
  let gripLen = 0.18;
  switch (kind) {
    case 'longsword':
      add(bladeShape(0.9, 0.07), metal, 0.1);
      add(new THREE.BoxGeometry(0.22, 0.03, 0.04), metal, 0.09);
      break;
    case 'shortsword':
      add(bladeShape(0.6, 0.075), metal, 0.1);
      add(new THREE.BoxGeometry(0.16, 0.03, 0.04), metal, 0.09);
      break;
    case 'curved':
      add(bladeShape(0.78, 0.06, 0.12), metal, 0.1);
      add(new THREE.CylinderGeometry(0.05, 0.05, 0.02, 8), metal, 0.09);
      break;
    case 'greatsword':
      gripLen = 0.32;
      add(bladeShape(1.35, 0.14), metal, 0.18);
      add(new THREE.BoxGeometry(0.34, 0.05, 0.06), metal, 0.17);
      break;
    case 'spear': {
      gripLen = 1.4;
      const shaft = new THREE.CylinderGeometry(0.018, 0.022, 1.7, 6);
      add(shaft, leather, 0.35);
      add(new THREE.ConeGeometry(0.04, 0.3, 4), metal, 1.33);
      break;
    }
    case 'halberd': {
      gripLen = 1.6;
      add(new THREE.CylinderGeometry(0.03, 0.035, 2.4, 6), leather, 0.6);
      add(new THREE.ConeGeometry(0.06, 0.4, 4), metal, 1.95);
      const axe = new THREE.Shape();
      axe.moveTo(0, 0); axe.quadraticCurveTo(0.35, 0.05, 0.4, 0.3); axe.quadraticCurveTo(0.3, 0.4, 0, 0.35); axe.lineTo(0, 0);
      const ag = new THREE.ExtrudeGeometry(axe, { depth: 0.02, bevelEnabled: false });
      const a = add(ag, metal, 1.5);
      a.position.x = 0.03;
      break;
    }
  }
  const grip = new THREE.CylinderGeometry(0.02, 0.02, gripLen, 6);
  add(grip, leather, -gripLen / 2 + 0.1 - (kind === 'spear' || kind === 'halberd' ? -0.0 : 0));
  add(new THREE.SphereGeometry(0.032, 6, 4), metal, 0.1 - gripLen);
  // Point the weapon forward out of the fist
  g.rotation.x = Math.PI / 2;
  return g;
}

export interface QuadOpts { scale?: number; fur?: number; fur2?: number; kind?: 'wolf' | 'rabbit'; uniqueMats?: boolean }

export function buildQuadruped(o: QuadOpts = {}): Rig {
  const s = o.scale ?? 1;
  const rabbit = o.kind === 'rabbit';
  const fur = mat('fur', o.fur ?? 0x6b5848, { unique: o.uniqueMats ?? true });
  const fur2 = mat('fur', o.fur2 ?? 0x3a2e26, { unique: o.uniqueMats ?? true });
  const eyeM = mat('plain', rabbit ? 0x100808 : 0xd8a040, { emissive: rabbit ? 0 : 0x3a2000 });
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(s);
  root.add(body);
  const J: JointMap = {};
  const legLen = rabbit ? 0.12 : 0.34;
  const hipY = legLen * 2 + 0.04;
  const len = rabbit ? 0.22 : 0.9;
  const hips = joint('hips', body, 0, hipY, -len * 0.35, J);
  const torso = new THREE.CylinderGeometry(rabbit ? 0.1 : 0.17, rabbit ? 0.11 : 0.15, len, 8, 3);
  torso.rotateX(Math.PI / 2);
  const tp = torso.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < tp.count; i++) {
    const z = tp.getZ(i);
    const t = (z / len) + 0.5; // 0 rear -> 1 front
    tp.setY(i, tp.getY(i) * (rabbit ? 1.1 : 0.9 + t * 0.45) + (rabbit ? 0 : t * 0.05));
    tp.setX(i, tp.getX(i) * (rabbit ? 1 : 0.85 + t * 0.2));
  }
  torso.computeVertexNormals();
  torso.translate(0, 0, len / 2);
  mesh(torso, fur, hips);
  const spine = joint('spine', hips, 0, 0, len * 0.5, J);
  const chest = joint('chest', spine, 0, 0, len * 0.4, J);
  if (!rabbit) mesh(new THREE.IcosahedronGeometry(0.21, 1).scale(0.9, 1.1, 1.1), fur2, chest, 0, 0.03, -0.05);
  const neck = joint('neck', chest, 0, rabbit ? 0.06 : 0.08, rabbit ? 0.04 : 0.1, J);
  mesh(limb(rabbit ? 0.08 : 0.26, rabbit ? 0.06 : 0.11, rabbit ? 0.07 : 0.14, 7).rotateX(-Math.PI / 2 - 0.5), fur2, neck);
  const head = joint('head', neck, 0, rabbit ? 0.04 : 0.14, rabbit ? 0.06 : 0.2, J);
  const skull = new THREE.IcosahedronGeometry(rabbit ? 0.07 : 0.13, 1);
  skull.scale(0.9, 0.85, 1.1);
  mesh(skull, fur, head);
  if (!rabbit) {
    const snout = new THREE.CylinderGeometry(0.04, 0.075, 0.22, 6);
    snout.rotateX(Math.PI / 2);
    mesh(snout, fur, head, 0, -0.02, 0.16);
    mesh(new THREE.SphereGeometry(0.025, 5, 4), mat('plain', 0x111111), head, 0, 0.0, 0.27);
    const jaw = joint('jaw', head, 0, -0.06, 0.04, J);
    const jg = new THREE.BoxGeometry(0.08, 0.03, 0.2);
    jg.translate(0, 0, 0.1);
    mesh(jg, fur2, jaw);
    // Fangs
    const fang = mat('plain', 0xe8dcc0);
    mesh(new THREE.ConeGeometry(0.01, 0.04, 4).rotateX(Math.PI), fang, head, 0.025, -0.06, 0.24);
    mesh(new THREE.ConeGeometry(0.01, 0.04, 4).rotateX(Math.PI), fang, head, -0.025, -0.06, 0.24);
  }
  mesh(new THREE.SphereGeometry(rabbit ? 0.012 : 0.018, 5, 4), eyeM, head, rabbit ? 0.05 : 0.06, 0.03, rabbit ? 0.04 : 0.08);
  mesh(new THREE.SphereGeometry(rabbit ? 0.012 : 0.018, 5, 4), eyeM, head, rabbit ? -0.05 : -0.06, 0.03, rabbit ? 0.04 : 0.08);
  for (const side of [1, -1]) {
    const ear = new THREE.ConeGeometry(rabbit ? 0.025 : 0.045, rabbit ? 0.16 : 0.11, 4);
    const e = mesh(ear, fur2, head, side * (rabbit ? 0.03 : 0.07), rabbit ? 0.12 : 0.12, rabbit ? -0.02 : -0.02);
    e.rotation.z = -side * (rabbit ? 0.15 : 0.3);
    if (rabbit) e.rotation.x = -0.4;
  }
  // Tail
  const tail1 = joint('tail1', hips, 0, 0.05, -0.02, J);
  if (rabbit) {
    mesh(new THREE.IcosahedronGeometry(0.04, 0), mat('fur', 0xe8e0d0), tail1, 0, 0, -0.02);
  } else {
    mesh(limb(0.25, 0.06, 0.05, 6).rotateX(-Math.PI / 2 - 0.6), fur, tail1);
    const tail2 = joint('tail2', tail1, 0, -0.14, -0.2, J);
    mesh(limb(0.25, 0.05, 0.02, 6).rotateX(-Math.PI / 2 - 0.3), fur2, tail2);
  }
  // Legs: front attach to chest, back to hips
  const legs: [string, THREE.Object3D, number, number][] = [
    ['FL', chest, 1, 0], ['FR', chest, -1, 0], ['BL', hips, 1, 0.05], ['BR', hips, -1, 0.05],
  ];
  for (const [n, parent, side, z] of legs) {
    const back = n[0] === 'B';
    const up = joint('up' + n, parent, side * (rabbit ? 0.07 : 0.11), -0.02, z, J);
    const ul = back && !rabbit ? legLen * 1.05 : legLen;
    mesh(limb(ul, rabbit ? 0.04 : back ? 0.09 : 0.07, rabbit ? 0.03 : 0.045, 6), back ? fur : fur2, up);
    const lo = joint('lo' + n, up, 0, -ul, 0, J);
    mesh(limb(legLen, rabbit ? 0.025 : 0.04, rabbit ? 0.02 : 0.03, 6), fur2, lo);
    const paw = joint('paw' + n, lo, 0, -legLen, 0, J);
    mesh(new THREE.BoxGeometry(rabbit ? 0.04 : 0.07, 0.04, rabbit ? (back ? 0.12 : 0.05) : 0.1).translate(0, 0.0, 0.02), fur2, paw);
    if (back) { up.rotation.x = -0.25; lo.rotation.x = 0.5; paw.rotation.x = -0.25; }
  }
  const rest: Record<string, THREE.Euler> = {};
  for (const k in J) rest[k] = J[k].rotation.clone();
  return optimizeRig({ root, body, joints: J, rest, flashMats: [fur, fur2], kind: 'quad', scale: s, hipHeight: hipY * s });
}

/**
 * Draw-call reduction: bake every part's material colour into vertex colours, then merge each joint's
 * meshes into at most two meshes (soft: cloth/skin/leather/fur, hard: metal). ~60 meshes → ~20 per rig.
 */
export function optimizeRig(rig: Rig) {
  const anyMetal = rig.flashMats.find((m) => m.metalness > 0.5);
  const softSrc = [rig.flashMats[1], rig.flashMats[0]].find((m) => m && m.metalness <= 0.5)!;
  const soft = new THREE.MeshStandardMaterial({ vertexColors: true, map: softSrc.map, normalMap: softSrc.normalMap, roughness: 0.85, metalness: 0 });
  soft.normalScale.set(0.6, 0.6);
  const hard = new THREE.MeshStandardMaterial({ vertexColors: true, map: anyMetal?.map ?? null, normalMap: anyMetal?.normalMap ?? null, roughness: 0.4, metalness: 0.8, flatShading: true });
  const touched = { soft: false, hard: false };
  for (const j of Object.values(rig.joints)) {
    const groups: Record<'soft' | 'hard', THREE.BufferGeometry[]> = { soft: [], hard: [] };
    const remove: THREE.Mesh[] = [];
    for (const c of j.children) {
      const m = c as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material)) continue;
      const src = m.material as THREE.MeshStandardMaterial;
      const kind = src.metalness > 0.5 ? 'hard' : 'soft';
      m.updateMatrix();
      const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      g.applyMatrix4(m.matrix);
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      const n = g.attributes.position.count;
      const col = new Float32Array(n * 3);
      const cc = src.color;
      for (let i = 0; i < n; i++) { col[i * 3] = cc.r; col[i * 3 + 1] = cc.g; col[i * 3 + 2] = cc.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      groups[kind].push(g);
      remove.push(m);
    }
    for (const m of remove) { j.remove(m); m.geometry.dispose(); }
    for (const kind of ['soft', 'hard'] as const) {
      if (!groups[kind].length) continue;
      const merged = mergeGeometries(groups[kind]);
      if (!merged) continue;
      touched[kind] = true;
      const mm = new THREE.Mesh(merged, kind === 'soft' ? soft : hard);
      mm.castShadow = true; mm.receiveShadow = true;
      j.add(mm);
    }
  }
  // Weapon/offhand meshes keep their own materials but join the flash list via the hard material colour.
  rig.flashMats = [soft, ...(touched.hard ? [hard] : [])];
  for (const mount of [rig.weaponMount, rig.offhandMount]) mount?.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const src = m.material as THREE.MeshStandardMaterial;
    const n = m.geometry.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { col[i * 3] = src.color.r; col[i * 3 + 1] = src.color.g; col[i * 3 + 2] = src.color.b; }
    m.geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
    m.material = src.metalness > 0.5 ? hard : soft;
  });
  if (!touched.hard && (rig.weaponMount?.children.length || rig.offhandMount?.children.length)) rig.flashMats.push(hard);
  return rig;
}
