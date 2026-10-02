// Weapon definitions + stylized weapon models (blade extends along the hand's local -Y).
import * as THREE from 'three';
import { inked, toon, glowMat } from '../render/toon.js';

export const WEAPONS = {
  broken: { name: 'Broken Sword', kind: 'sword', dmg: 0.75, speed: 1.0, reach: 2.0, len: 0.55, trail: 0xbfe6ff, core: 0xffffff, special: 'crossSlash', desc: 'A snapped blade found in the Whisperwood. It remembers you.' },
  iron: { name: 'Iron Sword', kind: 'sword', dmg: 1.0, speed: 1.0, reach: 2.4, len: 0.95, trail: 0x9fe8ff, core: 0xffffff, special: 'crossSlash', desc: 'Elmbrook steel. Honest and reliable.' },
  katana: { name: 'Katana — Moonlit Edge', kind: 'katana', dmg: 0.95, speed: 1.25, reach: 2.5, len: 1.05, trail: 0xc8b8ff, core: 0xffffff, special: 'iaido', desc: 'A blade from the First Cycle. Draw, cut, sheathe.' },
  dual: { name: 'Dual Blades — Twin Fangs', kind: 'dual', dmg: 0.62, speed: 1.45, reach: 2.1, len: 0.7, trail: 0xff9a5a, core: 0xfff0c0, special: 'tempest', desc: 'Desert assassin blades. Every strike strikes twice.' },
  great: { name: 'Greatsword — Ironspine Cleaver', kind: 'great', dmg: 1.85, speed: 0.72, reach: 3.0, len: 1.6, trail: 0xffd36a, core: 0xffffff, special: 'earthbreaker', armor: true, desc: 'Too heavy for most. Swings shrug off flinching.' },
  magic: { name: 'Magic Sword — Astral Arc', kind: 'sword', dmg: 1.1, speed: 1.05, reach: 2.5, len: 1.0, trail: 0x6fd8ff, core: 0xe0fbff, special: 'arcWave', magic: true, desc: 'Every swing releases a sliver of starlight.' },
  cursed: { name: 'Cursed Sword — Oblivion', kind: 'sword', dmg: 1.45, speed: 1.1, reach: 2.6, len: 1.15, trail: 0xb04aff, core: 0x200030, special: 'abyssRend', drain: 0.08, desc: 'It drinks. It whispers your name from a previous life.' },
};
export const WEAPON_ORDER = ['broken', 'iron', 'katana', 'dual', 'great', 'magic', 'cursed'];

function bladeGeo(len, w, t, { curve = 0, broken = false, tipLen = 0.18 } = {}) {
  const segs = 6;
  const g = new THREE.BoxGeometry(w, len, t, 1, segs, 1);
  g.translate(0, -len / 2, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i); const k = -y / len; // 0 at guard, 1 at tip
    let x = p.getX(i), z = p.getZ(i);
    if (!broken && k > 1 - tipLen) { const tk = (k - (1 - tipLen)) / tipLen; x *= 1 - tk * 0.95; if (x > 0) x *= 0.3 + (1 - tk) * 0.7; }
    if (broken && k > 0.92) { x += (Math.sin(i * 7.3) * 0.5) * w * 0.4; }
    // edge thin, spine thick
    z *= x > 0 ? 0.5 : 1;
    x += curve * k * k * 0.25;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  return g;
}

/** Build a weapon mesh. Returns { group, base, tip, glow } */
export function makeWeapon(id, scale = 1) {
  const W = WEAPONS[id];
  const grp = new THREE.Group();
  const add = (geo, color, opt) => { const m = inked(geo, color, 0.008, opt); grp.add(m); return m; };
  const metal = 0xdfe6f0, dark = 0x2a2230, gold = 0xe8b84a, leather = 0x5a3a2a;
  let len = W.len;
  const grip = (l = 0.2, c = leather) => { const m = add(new THREE.CylinderGeometry(0.025, 0.025, l, 6), c); m.position.y = 0.04; return m; };
  switch (id) {
    case 'broken': {
      grip(); add(new THREE.BoxGeometry(0.24, 0.04, 0.06), 0x7a6a5a).position.y = -0.07;
      add(bladeGeo(len, 0.07, 0.022, { broken: true }), 0xa8aeb8).position.y = -0.09;
      break;
    }
    case 'iron': case 'magic': case 'cursed': {
      grip(0.22, id === 'cursed' ? 0x301030 : leather);
      const gc = id === 'magic' ? 0x6a8aff : id === 'cursed' ? 0x5a1a6a : gold;
      const gd = add(new THREE.BoxGeometry(0.3, 0.05, 0.07), gc); gd.position.y = -0.07;
      if (id !== 'iron') { const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.035), glowMat(id === 'magic' ? 0x6fd8ff : 0xff3355)); gem.position.set(0, -0.07, 0.04); grp.add(gem); }
      add(new THREE.SphereGeometry(0.035, 6, 4), gc).position.y = 0.17;
      const bc = id === 'magic' ? 0xbfefff : id === 'cursed' ? 0x3a1a4a : metal;
      const bl = add(bladeGeo(len, id === 'cursed' ? 0.1 : 0.08, 0.024), bc, id === 'magic' ? { emissive: 0x2a6aa0 } : id === 'cursed' ? { emissive: 0x30104a } : undefined);
      bl.position.y = -0.09;
      if (id === 'magic' || id === 'cursed') {
        const glow = new THREE.Mesh(bladeGeo(len * 1.04, 0.16, 0.05), glowMat(W.trail, 0.25)); glow.position.y = -0.09; grp.add(glow); grp.userData.glow = glow;
      }
      if (id === 'cursed') { const eye = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), glowMat(0xff2244, 1)); eye.position.set(0, -0.2, 0.015); grp.add(eye); }
      break;
    }
    case 'katana': {
      grip(0.3, 0x222244); grp.children[grp.children.length - 1].position.y = 0.09;
      const ts = add(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 8), gold); ts.position.y = -0.07;
      add(bladeGeo(len, 0.05, 0.018, { curve: 0.35, tipLen: 0.12 }), 0xeef2ff).position.y = -0.08;
      break;
    }
    case 'dual': {
      grip(0.16, 0x3a2a3a);
      add(new THREE.BoxGeometry(0.16, 0.04, 0.05), 0xc87a3a).position.y = -0.06;
      add(bladeGeo(len, 0.07, 0.02, { curve: -0.3 }), 0xe8dcc8).position.y = -0.08;
      break;
    }
    case 'great': {
      grip(0.36); grp.children[grp.children.length - 1].position.y = 0.12;
      add(new THREE.BoxGeometry(0.42, 0.08, 0.1), 0x6a6a72).position.y = -0.08;
      add(bladeGeo(len, 0.2, 0.05, { tipLen: 0.1 }), 0xb8bcc4).position.y = -0.12;
      add(new THREE.BoxGeometry(0.04, len * 0.7, 0.055), 0x5a5a62).position.y = -0.12 - len * 0.35;
      break;
    }
  }
  const base = new THREE.Object3D(); base.position.y = -0.14; grp.add(base);
  const tip = new THREE.Object3D(); tip.position.y = -0.09 - len; grp.add(tip);
  grp.scale.setScalar(scale);
  return { group: grp, base, tip, def: W, id };
}

/** Simple non-player weapons (club, spear, bone sword, demon blade, claws...). */
export function makeEnemyWeapon(kind, scale = 1) {
  const grp = new THREE.Group();
  const add = (geo, color, opt) => { const m = inked(geo, color, 0.01, opt); grp.add(m); return m; };
  let len = 0.8;
  if (kind === 'club') { const m = add(new THREE.CylinderGeometry(0.09, 0.04, 0.8, 6), 0x7a5a3a); m.position.y = -0.35; len = 0.75; }
  else if (kind === 'bone') { add(bladeGeo(0.8, 0.09, 0.03, { broken: true }), 0xd8d0b8).position.y = -0.06; add(new THREE.BoxGeometry(0.22, 0.04, 0.05), 0x5a4a3a).position.y = -0.05; }
  else if (kind === 'demon') { add(bladeGeo(1.3, 0.16, 0.04, { curve: 0.6 }), 0x2a1a2a, { emissive: 0x400010 }).position.y = -0.08; add(new THREE.BoxGeometry(0.34, 0.06, 0.08), 0xb0103a).position.y = -0.07; len = 1.35; }
  else if (kind === 'spear') { const s = add(new THREE.CylinderGeometry(0.025, 0.025, 1.8, 6), 0x6a4a2a); s.position.y = -0.5; add(new THREE.ConeGeometry(0.06, 0.3, 4), 0xcfd6e0).position.y = -1.5; len = 1.6; }
  else if (kind === 'staff') { const s = add(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 6), 0x5a3a2a); s.position.y = -0.4; const o = new THREE.Mesh(new THREE.OctahedronGeometry(0.1), glowMat(0x9a7aff)); o.position.y = 0.42; grp.add(o); len = 1.2; }
  else if (kind === 'hammer') { const s = add(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6), 0x6a4a2a); s.position.y = -0.2; add(new THREE.BoxGeometry(0.25, 0.14, 0.14), 0x5a5a62).position.y = -0.5; len = 0.55; }
  else if (kind === 'bow') { const b = add(new THREE.TorusGeometry(0.45, 0.02, 4, 12, Math.PI), 0x7a5a3a); b.rotation.z = Math.PI / 2; b.position.x = -0.1; len = 0.3; }
  else if (kind === 'broom') { const s = add(new THREE.CylinderGeometry(0.02, 0.02, 1.3, 5), 0x8a6a4a); s.position.y = -0.3; add(new THREE.ConeGeometry(0.12, 0.35, 6), 0xc8a85a).position.y = -1.0; len = 1.0; }
  const base = new THREE.Object3D(); base.position.y = -0.12; grp.add(base);
  const tip = new THREE.Object3D(); tip.position.y = -len; grp.add(tip);
  grp.scale.setScalar(scale);
  return { group: grp, base, tip };
}
export { toon };
