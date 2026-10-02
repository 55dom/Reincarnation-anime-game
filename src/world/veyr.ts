// The city of Veyr (walls, streets, Guild of the Red Ledger interior, training yard),
// outlying sites (gate camp, scrub camp, ruined watchtower) and the Sunken Fort dungeon.
import * as THREE from 'three';
import { StaticBuilder } from './builder';
import type { Collision } from './collision';
import { mat } from '../render/materials';
import { heightAt, SITES, FORT_RADIUS, FORT_DEPTH } from './layout';
import { mulberry32 } from '../core/util';

export interface Campfire { pos: THREE.Vector3; flame: THREE.Mesh; name: string }
export interface Plaque { pos: THREE.Vector3; title: string; text: string }

export interface WorldProps {
  ledgerBook: THREE.Mesh;
  ledgerGlow: THREE.PointLight;
  campfires: Campfire[];
  plaques: Plaque[];
  demonChest: THREE.Group;
  boardPos: THREE.Vector3;
  fireLight: THREE.PointLight;
  braziers: THREE.Mesh[];
}

function bannerTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#6a1a14'; g.fillRect(0, 0, 128, 256);
  // worn edge
  g.fillStyle = '#3a0c08';
  for (let i = 0; i < 20; i++) g.fillRect(Math.random() * 128, Math.random() * 256, 2, 10 + Math.random() * 30);
  g.strokeStyle = '#d4a24a'; g.lineWidth = 4; g.strokeRect(8, 8, 112, 240);
  // Sigil: an open ledger with a single falling drop
  g.fillStyle = '#d4a24a';
  g.beginPath(); g.moveTo(24, 110); g.lineTo(62, 100); g.lineTo(62, 150); g.lineTo(24, 160); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(104, 110); g.lineTo(66, 100); g.lineTo(66, 150); g.lineTo(104, 160); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(64, 170); g.quadraticCurveTo(54, 190, 64, 198); g.quadraticCurveTo(74, 190, 64, 170); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function slipTexture(seed: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 80;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d8c49a'; g.fillRect(0, 0, 64, 80);
  const r = mulberry32(seed);
  g.fillStyle = '#3a2416';
  for (let y = 12; y < 70; y += 7) g.fillRect(8, y, 20 + r() * 30, 2);
  g.fillStyle = '#8a1a10'; g.beginPath(); g.arc(50, 66, 6, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildWorld(scene: THREE.Scene, col: Collision): WorldProps {
  const B = new StaticBuilder(col);
  const stone = mat('stone', 0xe0b494);
  const stoneDark = mat('stone', 0xa87a60);
  const wood = mat('wood', 0xa07a5a);
  const plank = mat('wood', 0x7a5236, { flat: false });
  const clothRed = mat('cloth', 0x8a2a1c, { side: THREE.DoubleSide });
  const clothSand = mat('cloth', 0xc8a878, { side: THREE.DoubleSide });
  const ironM = mat('metal', 0x4a4440);
  const rnd = mulberry32(2024);

  // ---------- City wall ----------
  const R = 46;
  const segs = 40;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    const x = Math.sin(am) * R, z = Math.cos(am) * R;
    if (z > 40 && Math.abs(x) < 6) continue; // south gate gap
    const len = 2 * R * Math.sin(Math.PI / segs) + 0.4;
    B.box(x, -1, z, len, 8, 1.8, stone, { yaw: am });
    // crenellations
    if (i % 2 === 0) B.box(x, 7, z, len * 0.4, 0.9, 1.8, stone, { yaw: am, collide: false });
  }
  // Gate towers + arch
  for (const sx of [-1, 1]) {
    B.box(sx * 6.5, -1, R, 4, 11, 4, stone);
    B.box(sx * 6.5, 10, R, 4.6, 0.8, 4.6, stoneDark, { collide: false });
  }
  B.box(0, 6.2, R, 9, 2.2, 2.2, stone);
  // Gate banners
  const bannerM = new THREE.MeshStandardMaterial({ map: bannerTexture(), roughness: 0.9, side: THREE.DoubleSide });
  for (const sx of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 3.6, 1, 4), bannerM);
    b.position.set(sx * 6.5, 6.5, R + 2.05);
    scene.add(b);
  }

  // ---------- Houses ----------
  const houseSpots: [number, number, number, number, number][] = [
    [-14, 30, 8, 7, 5], [14, 30, 7, 8, 6], [-16, 14, 9, 7, 4.5], [16, 12, 8, 9, 5.5], [-30, 18, 8, 8, 6],
    [30, 20, 8, 7, 4.5], [-32, -4, 9, 8, 5], [-24, -30, 8, 7, 5], [24, -34, 9, 7, 6], [-12, -36, 7, 6, 4.5],
    [12, -38, 8, 6, 5], [32, 0, 7, 8, 7], [-20, 36, 6, 6, 4], [38, -14, 6, 7, 5],
  ];
  for (const [x, z, w, d, h] of houseSpots) {
    const m = rnd() > 0.5 ? stone : stoneDark;
    B.box(x, -0.5, z, w, h + 0.5, d, m);
    // parapet
    B.box(x, h, z - d / 2 + 0.2, w, 0.6, 0.4, m, { collide: false });
    B.box(x, h, z + d / 2 - 0.2, w, 0.6, 0.4, m, { collide: false });
    // door facing the avenue
    const facing = x < 0 ? 1 : -1;
    B.box(x + facing * (w / 2 + 0.02), 0, z, 0.08, 2.2, 1.2, plank, { collide: false });
    // awning
    const aw = new THREE.PlaneGeometry(2.4, 1.6, 2, 2);
    B.add(aw, rnd() > 0.5 ? clothRed : clothSand, x + facing * (w / 2 + 0.75), 2.6, z, facing > 0 ? Math.PI / 2 : -Math.PI / 2, -1.0);
    // small windows (dark insets)
    B.box(x + facing * (w / 2 + 0.02), 3, z + d * 0.25, 0.06, 0.7, 0.5, ironM, { collide: false });
  }
  // Market stalls along the avenue
  for (const [x, z] of [[-6, 24], [6, 22], [-6, 10], [6, 6]] as [number, number][]) {
    for (const ox of [-1, 1]) for (const oz of [-1, 1]) B.cyl(x + ox * 1.2, 0, z + oz * 0.9, 0.06, 0.06, 2.4, wood, 5, ox * oz > 0);
    B.box(x, 0.9, z, 2.6, 0.12, 2, wood, { collide: false });
    col.addBox(x, z, 2.6, 2, 0, 1.0);
    const tarp = new THREE.PlaneGeometry(3, 2.4, 2, 2);
    B.add(tarp, rnd() > 0.5 ? clothRed : clothSand, x, 2.45, z, 0, -Math.PI / 2 + 0.15);
    // crates of goods
    B.box(x - 0.6, 1.02, z, 0.6, 0.35, 0.5, plank, { collide: false });
    B.box(x + 0.5, 1.02, z + 0.2, 0.5, 0.3, 0.5, plank, { collide: false });
  }
  // Crates & barrels scattered
  for (let i = 0; i < 16; i++) {
    const a = rnd() * Math.PI * 2, r = 18 + rnd() * 22;
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (Math.abs(x) < 6 || (Math.abs(x) < 14 && z < -6 && z > -30) || (x > 12 && x < 32 && z < -8 && z > -28)) continue;
    if (rnd() > 0.5) B.box(x, 0, z, 0.9, 0.9, 0.9, plank, { yaw: rnd() * 3 });
    else B.cyl(x, 0, z, 0.38, 0.32, 1.0, wood, 8);
  }

  // ---------- Guild of the Red Ledger ----------
  const G = SITES.guild; // center (0,-18)
  const gw = 22, gd = 16, gh = 6.5, t = 0.7;
  const gx0 = G.x - gw / 2, gx1 = G.x + gw / 2, gz0 = G.z - gd / 2, gz1 = G.z + gd / 2;
  B.box(G.x, -0.5, gz0, gw, gh + 0.5, t, stone); // north wall
  B.box(gx0, -0.5, G.z, t, gh + 0.5, gd, stone); // west
  B.box(gx1, -0.5, G.z, t, gh + 0.5, gd, stone); // east
  // south wall with door gap (3.6 wide, 3.8 tall)
  const doorW = 3.6;
  const sideW = (gw - doorW) / 2;
  B.box(gx0 + sideW / 2, -0.5, gz1, sideW, gh + 0.5, t, stone);
  B.box(gx1 - sideW / 2, -0.5, gz1, sideW, gh + 0.5, t, stone);
  B.box(G.x, 3.8, gz1, doorW, gh - 3.8, t, stone);
  // roof slab + overhang + parapet
  B.box(G.x, gh, G.z, gw + 1, 0.6, gd + 1, stoneDark);
  B.box(G.x, gh + 0.6, gz1 + 0.3, gw + 1, 0.8, 0.5, stoneDark, { collide: false });
  // Interior floor: planks (decorative, sits on the flat plateau)
  const floorG = new THREE.PlaneGeometry(gw - t, gd - t, 1, 1);
  floorG.rotateX(-Math.PI / 2);
  const fuv = floorG.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < fuv.count; i++) fuv.setXY(i, fuv.getX(i) * 6, fuv.getY(i) * 4);
  B.add(floorG, plank, G.x, 0.03, G.z);
  // Interior columns
  for (const cx of [-5, 5]) for (const cz of [-21, -14]) B.box(G.x + cx, 0, cz, 0.7, gh, 0.7, stoneDark);
  // Clerk desk
  B.box(G.x, 0, -21.1, 4.2, 1.05, 1.0, plank);
  B.box(G.x, 1.05, -21.1, 4.4, 0.08, 1.2, wood, { collide: false });
  // Ledger book (great book on a lectern on the desk)
  const ledgerBook = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.6), new THREE.MeshStandardMaterial({ color: 0x5a1a12, roughness: 0.7, emissive: 0x000000 }));
  ledgerBook.position.set(G.x, 1.18, -20.9);
  ledgerBook.rotation.x = 0.15;
  ledgerBook.castShadow = true;
  scene.add(ledgerBook);
  const pages = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.03, 0.54), new THREE.MeshStandardMaterial({ color: 0xe8d8b0, roughness: 0.9 }));
  pages.position.y = 0.05;
  ledgerBook.add(pages);
  const ledgerGlow = new THREE.PointLight(0xff3a1a, 0, 6, 2);
  ledgerGlow.position.set(G.x, 1.8, -20.6);
  scene.add(ledgerGlow);
  // Shelves of ledgers behind the clerk
  B.box(G.x, 0, gz0 + 0.8, 8, 3.2, 0.7, plank);
  for (let i = 0; i < 18; i++) {
    const bx = G.x - 3.6 + (i % 9) * 0.85, by = 0.6 + Math.floor(i / 9) * 1.3;
    B.box(bx, by, gz0 + 1.2, 0.5 + rnd() * 0.25, 0.7 + rnd() * 0.25, 0.25, rnd() > 0.5 ? clothRed : plank, { collide: false });
  }
  // Banners inside
  for (const bx of [-7.5, 7.5]) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 3.2), bannerM);
    b.position.set(G.x + bx, 3.6, gz0 + 0.4);
    scene.add(b);
  }
  // Contract board on west wall
  const boardPos = new THREE.Vector3(SITES.board.x, 0, SITES.board.z);
  B.box(gx0 + 0.6, 0.9, G.z, 0.2, 2.2, 3.4, wood, { collide: false });
  B.box(gx0 + 0.6, 0, G.z - 1.6, 0.25, 3.2, 0.2, wood, { collide: false });
  B.box(gx0 + 0.6, 0, G.z + 1.6, 0.25, 3.2, 0.2, wood, { collide: false });
  for (let i = 0; i < 9; i++) {
    const slip = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.56), new THREE.MeshStandardMaterial({ map: slipTexture(i + 3), roughness: 1 }));
    slip.position.set(gx0 + 0.72, 1.3 + (i % 3) * 0.6 + rnd() * 0.08, G.z - 1.1 + Math.floor(i / 3) * 0.95 + rnd() * 0.1);
    slip.rotation.y = Math.PI / 2;
    slip.rotation.z = (rnd() - 0.5) * 0.15;
    scene.add(slip);
  }
  // Quartermaster counter (east)
  B.box(gx1 - 3.2, 0, -15, 1.0, 1.05, 3.6, plank);
  B.box(gx1 - 1.0, 0, -15, 0.8, 2.6, 4, plank);
  // Benches & table
  B.box(G.x - 4, 0, -12.5, 3, 0.5, 0.5, plank);
  B.box(G.x + 3, 0, -12.5, 3, 0.5, 0.5, plank);
  // Braziers (flames animated in main loop)
  const braziers: THREE.Mesh[] = [];
  const flameM = new THREE.MeshBasicMaterial({ color: 0xff8a30, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const [bx, bz] of [[-3.2, -20.5], [3.2, -20.5]]) {
    B.cyl(G.x + bx, 0, bz, 0.35, 0.18, 1.1, ironM, 7);
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.7, 6), flameM);
    f.position.set(G.x + bx, 1.45, bz);
    scene.add(f);
    braziers.push(f);
  }
  const gl = new THREE.PointLight(0xff9a50, 14, 22, 1.6);
  gl.position.set(G.x, 3.4, -18);
  scene.add(gl);

  // ---------- Training yard ----------
  const T = SITES.trainingYard;
  const posts: [number, number][] = [[-5, -5], [5, -5], [5, 5], [-5, 5], [-1.6, 5], [1.6, 5], [0, -5], [5, 0], [-5, 0]];
  for (const [px, pz] of posts) B.cyl(T.x + px, 0, T.z + pz, 0.09, 0.11, 1.15, wood, 5);
  for (const [x0, z0, x1, z1] of [[-5, -5, 5, -5], [5, -5, 5, 5], [-5, 5, -1.6, 5], [1.6, 5, 5, 5], [-5, -5, -5, 5]]) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const along = x0 === x1;
    for (const ry of [0.45, 0.95]) B.box(T.x + (x0 + x1) / 2, ry, T.z + (z0 + z1) / 2, along ? 0.07 : len, 0.09, along ? len : 0.07, wood, { collide: false, uvScale: 1 });
    col.addBox(T.x + (x0 + x1) / 2, T.z + (z0 + z1) / 2, along ? 0.2 : len, along ? len : 0.2, 0, 1.1);
  }
  // Straw target post on a stand
  B.box(T.x - 2, 0, T.z - 3.6, 2.4, 0.15, 0.6, plank, { collide: false });

  // ---------- Campfires ----------
  const campfires: Campfire[] = [];
  const mkCamp = (x: number, z: number, name: string, tent: boolean) => {
    const y = heightAt(x, z);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      B.add(new THREE.DodecahedronGeometry(0.18, 0), stoneDark, x + Math.cos(a) * 0.6, y + 0.08, z + Math.sin(a) * 0.6);
    }
    for (let i = 0; i < 3; i++) B.add(new THREE.CylinderGeometry(0.05, 0.06, 0.9, 5), wood, x, y + 0.15, z, i * 2.1, Math.PI / 2 - 0.25);
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.9, 6), flameM);
    f.position.set(x, y + 0.5, z);
    scene.add(f);
    col.addCyl(x, z, 0.6, y - 1, y + 0.4);
    campfires.push({ pos: new THREE.Vector3(x, y, z), flame: f, name });
    if (tent) {
      // A-frame tent + bedroll + logs
      const tx = x - 3, tz = z - 1.5, ty = heightAt(tx, tz);
      const tentG = new THREE.ConeGeometry(1.5, 1.9, 4, 1, true);
      B.add(tentG, clothSand, tx, ty + 0.95, tz, Math.PI / 4);
      col.addCyl(tx, tz, 1.1, ty - 1, ty + 1.8);
      B.add(new THREE.CylinderGeometry(0.18, 0.18, 1.6, 6), wood, x + 1.4, y + 0.18, z + 0.6, 0.4, 0, Math.PI / 2);
    }
  };
  mkCamp(SITES.gateCamp.x, SITES.gateCamp.z, 'Gate Camp', true);
  mkCamp(SITES.scrubCamp.x, SITES.scrubCamp.z, 'Scrub Camp', true);
  const fireLight = new THREE.PointLight(0xff8a3a, 0, 14, 1.8);
  scene.add(fireLight);

  // ---------- Ruined watchtowers ----------
  const plaques: Plaque[] = [];
  const tower = (x: number, z: number, h: number) => {
    const y = heightAt(x, z);
    B.cyl(x, y - 1, z, 3.2, 3.6, h + 1, stoneDark, 10);
    // broken crown teeth
    for (let i = 0; i < 6; i++) {
      if (rnd() < 0.35) continue;
      const a = (i / 6) * Math.PI * 2;
      B.box(x + Math.cos(a) * 2.9, y + h, z + Math.sin(a) * 2.9, 1.2, 0.6 + rnd() * 1.6, 0.8, stoneDark, { yaw: -a, collide: false });
    }
    // fallen rubble
    for (let i = 0; i < 6; i++) {
      const a = rnd() * Math.PI * 2, r = 4.5 + rnd() * 4;
      const rx = x + Math.cos(a) * r, rz = z + Math.sin(a) * r;
      B.box(rx, heightAt(rx, rz) - 0.2, rz, 0.8 + rnd(), 0.6 + rnd() * 0.5, 0.7 + rnd(), stoneDark, { yaw: rnd() * 3 });
    }
  };
  tower(SITES.tower.x, SITES.tower.z, 9);
  tower(-60, -110, 6);
  tower(90, 140, 7);
  tower(-200, -160, 5);
  plaques.push({ pos: new THREE.Vector3(SITES.tower.x + 4.5, heightAt(SITES.tower.x + 4.5, SITES.tower.z), SITES.tower.z), title: 'Scratched into the tower stone', text: '“Ninth Banner held here eleven days. The sky went red on the twelfth. We were told it was the enemy burning. It was not the enemy.”' });

  // ---------- Sunken Fort (dungeon) ----------
  const F = SITES.fort;
  const fy = -FORT_DEPTH;
  const fsegs = 28;
  for (let i = 0; i < fsegs; i++) {
    const am = ((i + 0.5) / fsegs) * Math.PI * 2;
    const x = F.x + Math.sin(am) * FORT_RADIUS, z = F.z + Math.cos(am) * FORT_RADIUS;
    if (Math.cos(am) > 0.97) continue; // south gate
    const broken = rnd() < 0.25;
    const len = 2 * FORT_RADIUS * Math.sin(Math.PI / fsegs) + 0.3;
    B.box(x, fy - 1, z, len, broken ? 3 + rnd() * 2 : 9 + rnd() * 2, 2, stoneDark, { yaw: am });
  }
  for (const sx of [-1, 1]) B.box(F.x + sx * 4.6, fy - 1, F.z + FORT_RADIUS, 3, 12, 3, stoneDark);
  B.box(F.x, fy + 7, F.z + FORT_RADIUS, 6.4, 1.6, 2.4, stoneDark);
  // Broken pillars ring in arena
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const r = 21;
    const x = F.x + Math.cos(a) * r, z = F.z + Math.sin(a) * r;
    if (z > F.z + 15 && Math.abs(x - F.x) < 6) continue;
    const h = 2 + rnd() * 6;
    B.cyl(x, fy - 0.5, z, 0.9, 1.1, h, stone, 8);
  }
  // Half-buried colossal statue head (saint) at the north end
  const headG = new THREE.IcosahedronGeometry(4, 1);
  headG.scale(0.9, 1.1, 1);
  B.add(headG, stone, F.x - 10, fy + 1.2, F.z - 22, 0.6, 0.3, 0.4);
  col.addCyl(F.x - 10, F.z - 22, 3.5, fy - 2, fy + 5);
  // Altar dais behind arena + chest
  B.box(F.x, fy - 0.3, F.z - 24, 7, 0.7, 4, stone, { walkable: true });
  const demonChest = new THREE.Group();
  const cBody = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.9), mat('wood', 0x3a1a14));
  cBody.position.y = 0.4;
  const cLid = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 1.4, 8, 1, false, 0, Math.PI), mat('wood', 0x3a1a14));
  cLid.rotation.z = Math.PI / 2;
  cLid.position.y = 0.8;
  const cBand = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.12, 0.95), mat('metal', 0x6a1a10, { emissive: 0x200000 }));
  cBand.position.y = 0.55;
  const lock = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), mat('metal', 0xaa2a1a, { emissive: 0x501008 }));
  lock.scale.set(1, 1.3, 0.6);
  lock.position.set(0, 0.6, 0.48);
  demonChest.add(cBody, cLid, cBand, lock);
  demonChest.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  demonChest.position.set(F.x, fy + 0.4, F.z - 24.5);
  scene.add(demonChest);
  col.addBox(F.x, F.z - 24.5, 1.4, 0.9, fy, fy + 1.4);
  plaques.push({ pos: new THREE.Vector3(F.x + 2, fy, F.z + FORT_RADIUS - 3), title: 'Inscription above the sunken gate', text: '“Here the Warden keeps the sand from speaking. Bring no saint below.”' });
  plaques.push({ pos: new THREE.Vector3(F.x - 6, fy, F.z - 17), title: 'Beneath the buried face', text: 'The statue wears a guild seal at its throat — the same drop of red that hangs over the clerk’s desk.' });

  B.flush(scene);
  return { ledgerBook, ledgerGlow, campfires, plaques, demonChest, boardPos, fireLight, braziers };
}
