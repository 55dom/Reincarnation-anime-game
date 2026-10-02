// Chunky terraced heightfield terrain with biome coloring. getHeight() exactly matches the mesh.
import * as THREE from 'three';
import { makeNoise, clamp, smooth, invLerp, lerp, rng } from '../core/util.js';
import { envMaterial } from '../render/toon.js';

export const WORLD = { size: 1728, cell: 6, half: 864 };
const N = WORLD.size / WORLD.cell; // cells per side
const noise = makeNoise(4242);
const noise2 = makeNoise(777);

// ------------------------------------------------------------- layout
export const LOC = {
  wake: { x: 30, z: 380 },
  forest: { x: 10, z: 330, r: 210 },
  village: { x: 240, z: 200, r: 70, h: 6 },
  crossroads: { x: 90, z: 60 },
  city: { x: 340, z: -110, r: 105, h: 10 },
  ruins: { x: -270, z: 230, r: 80, h: 4 },
  dungeonGate: { x: -300, z: 290 },
  beastCamp: { x: -110, z: 480, r: 22, h: 3 },
  desert: { x: -600, z: -40, r: 330 },
  oasis: { x: -560, z: 110, r: 30 },
  assassinCamp: { x: -660, z: -200, r: 30, h: 5 },
  mountain: { x: 0, z: -470 },
  fort: { x: 170, z: -340, r: 34, h: 28 },
  hiddenCave: { x: 52, z: -432 },
  snow: { x: -340, z: -560, r: 260 },
  snowCamp: { x: -260, z: -470, r: 26, h: 30 },
  frostArena: { x: -420, z: -660, r: 50, h: 38 },
  demon: { x: 590, z: -470, r: 250 },
  demonCastle: { x: 660, z: -620, r: 55, h: 16 },
  skyStone: { x: 120, z: -10, r: 12, h: 8 },
  islands: { x: 0, z: -220, y: 170 },
};

const FLATS = [LOC.village, LOC.city, LOC.ruins, LOC.beastCamp, LOC.assassinCamp, LOC.fort, LOC.snowCamp, LOC.frostArena, LOC.demonCastle, LOC.skyStone,
  { x: LOC.wake.x, z: LOC.wake.z, r: 16, h: 3 }];

// Road network (polyline segments) – flattened & colored dirt / stone
export const ROADS = [
  [LOC.wake, { x: 120, z: 300 }, LOC.village],
  [LOC.village, LOC.crossroads, { x: 260, z: -20 }, LOC.city],
  [LOC.crossroads, { x: -120, z: 150 }, LOC.ruins],
  [LOC.crossroads, LOC.skyStone],
  [LOC.ruins, { x: -400, z: 120 }, LOC.oasis, { x: -620, z: -60 }, LOC.assassinCamp],
  [LOC.city, { x: 250, z: -250 }, LOC.fort],
  [LOC.city, { x: 480, z: -280 }, { x: 600, z: -420 }, LOC.demonCastle],
  [{ x: 250, z: -250 }, { x: -60, z: -330 }, { x: -200, z: -420 }, LOC.snowCamp, LOC.frostArena],
  [LOC.ruins, { x: -180, z: 400 }, LOC.beastCamp],
];

function segDist(px, pz, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z; const l2 = dx * dx + dz * dz;
  let t = ((px - a.x) * dx + (pz - a.z) * dz) / l2; t = clamp(t, 0, 1);
  const x = a.x + dx * t, z = a.z + dz * t; return Math.hypot(px - x, pz - z);
}
export function roadDist(x, z) {
  let d = 1e9;
  for (const r of ROADS) for (let i = 0; i < r.length - 1; i++) d = Math.min(d, segDist(x, z, r[i], r[i + 1]));
  return d;
}

// biome weights
export function biomeAt(x, z) {
  const dd = (L) => Math.hypot(x - L.x, z - L.z) / L.r;
  const desert = clamp(1.4 - dd(LOC.desert) * 1.1 + noise(x / 90, z / 90) * 0.15, 0, 1);
  const demon = clamp(1.5 - dd(LOC.demon) * 1.2 + noise(x / 80, z / 80) * 0.15, 0, 1);
  const snowZone = clamp(1.4 - dd(LOC.snow) * 1.1, 0, 1);
  const mountain = clamp(invLerp(-250, -420, z) * (1 - desert) * (1 - demon * 0.8), 0, 1);
  return { desert, demon, snowZone, mountain };
}

function rawHeight(x, z) {
  const b = biomeAt(x, z);
  let h = 4 + noise.fbm(x / 220, z / 220, 4) * 9 + noise(x / 60, z / 60) * 1.5;
  // forest: gentle hills
  // desert dunes
  h = lerp(h, 3 + Math.abs(noise2.fbm(x / 70, z / 110, 3)) * 10, b.desert);
  // mountains
  const ridge = noise.ridge(x / 140, z / 140, 4);
  const mh = 18 + ridge * ridge * 95 + noise(x / 40, z / 40) * 4;
  h = lerp(h, mh, smooth(b.mountain));
  // snow plateau in NW
  h = lerp(h, Math.max(h, 30 + ridge * 25), b.snowZone * 0.7);
  // demon territory: jagged plateau with lava trenches
  const dn = noise2(x / 50, z / 50);
  const dh = 12 + Math.abs(dn) * 14 + (noise2.ridge(x / 30, z / 30, 2) > 0.9 ? 8 : 0);
  h = lerp(h, dh, smooth(b.demon));
  // lakes
  const lake = (cx, cz, r, depth) => { const d = Math.hypot(x - cx, z - cz) / r; if (d < 1) h = lerp(h, -depth, smooth(1 - d)); };
  lake(-60, 300, 55, 3); lake(140, 470, 40, 2.5); lake(-560, 110, 22, 2); lake(420, 60, 50, 3);
  // flats
  for (const f of FLATS) {
    const d = Math.hypot(x - f.x, z - f.z);
    const r = f.r * 1.05;
    if (d < r * 1.6) h = lerp(h, f.h, smooth(clamp(1 - (d - r) / (r * 0.6), 0, 1)));
  }
  // roads
  const rd = roadDist(x, z);
  if (rd < 9) h = lerp(h, Math.max(h * 0.85 + 0.6, 0.8), smooth(1 - rd / 9) * 0.35);
  // world edge falls into the sea
  const e = Math.max(Math.abs(x), Math.abs(z));
  if (e > 760) h = lerp(h, -12, smooth(clamp((e - 760) / 90, 0, 1)));
  // terraces: partially snap to steps for the chunky hand-built look
  const step = 1.6;
  const q = Math.round(h / step) * step;
  return lerp(h, q, 0.55);
}

// grid heights
const H = new Float32Array((N + 1) * (N + 1));
export function buildHeights() {
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const x = -WORLD.half + i * WORLD.cell, z = -WORLD.half + j * WORLD.cell;
    H[j * (N + 1) + i] = rawHeight(x, z);
  }
}

/** Exact height of the terrain mesh at x,z. */
export function terrainHeight(x, z) {
  const fx = (x + WORLD.half) / WORLD.cell, fz = (z + WORLD.half) / WORLD.cell;
  if (fx < 0 || fz < 0 || fx >= N || fz >= N) return -1000;
  const i = Math.floor(fx), j = Math.floor(fz);
  const u = fx - i, v = fz - j;
  const h00 = H[j * (N + 1) + i], h10 = H[j * (N + 1) + i + 1], h01 = H[(j + 1) * (N + 1) + i], h11 = H[(j + 1) * (N + 1) + i + 1];
  // triangles: (00,01,11) and (00,11,10) split along the diagonal u==v
  if (v >= u) return h00 + (h11 - h01) * u + (h01 - h00) * v;
  return h00 + (h10 - h00) * u + (h11 - h10) * v;
}

export function surfaceAt(x, z) {
  const b = biomeAt(x, z); const h = terrainHeight(x, z);
  if (roadDist(x, z) < 4) return 'stone';
  if (b.demon > 0.5) return 'demon';
  if (b.desert > 0.5) return 'sand';
  if (h > 46 || b.snowZone > 0.55) return 'snow';
  return 'grass';
}

// ------------------------------------------------------------- mesh
const COL = {
  grass: [new THREE.Color(0x6fae4a), new THREE.Color(0x86c25a), new THREE.Color(0x5a9a40)],
  forest: [new THREE.Color(0x4c8a3a), new THREE.Color(0x3f7a34)],
  sand: [new THREE.Color(0xe4c88a), new THREE.Color(0xd8b878)],
  rock: [new THREE.Color(0x8a8378), new THREE.Color(0x77706a)],
  snow: [new THREE.Color(0xf2f6ff), new THREE.Color(0xdfe8f5)],
  demon: [new THREE.Color(0x3a2433), new THREE.Color(0x4a2a3a), new THREE.Color(0x2d1c28)],
  lava: new THREE.Color(0xff4a1a),
  road: new THREE.Color(0xb59a6e), stone: new THREE.Color(0x9c9488),
  shore: new THREE.Color(0xd9c48e), lakebed: new THREE.Color(0x5d7a6a),
};

function faceColor(cx, cz, h, slope, r) {
  const b = biomeAt(cx, cz);
  const pick = (arr) => arr[Math.min(arr.length - 1, Math.max(0, Math.floor(r * arr.length)))];
  let c = pick(COL.grass).clone();
  const fd = Math.hypot(cx - LOC.forest.x, cz - LOC.forest.z) / LOC.forest.r;
  if (fd < 1) c.lerp(pick(COL.forest), clamp(1.2 - fd, 0, 1));
  if (b.desert > 0.3) c.lerp(pick(COL.sand), smooth(clamp((b.desert - 0.3) / 0.4, 0, 1)));
  if (b.demon > 0.3) c.lerp(pick(COL.demon), smooth(clamp((b.demon - 0.3) / 0.4, 0, 1)));
  if (slope > 0.55) c.lerp(pick(COL.rock), clamp((slope - 0.55) * 3, 0, 1));
  const snowLine = 48 - b.snowZone * 30;
  if ((h > snowLine || b.snowZone > 0.6) && b.demon < 0.3 && slope < 0.8) c.lerp(pick(COL.snow), clamp((h - snowLine) / 6 + b.snowZone, 0, 1));
  if (h < 0.6) c.lerp(h < -0.5 ? COL.lakebed : COL.shore, 0.8);
  if (b.demon > 0.6 && h < 13 && noise2(cx / 25, cz / 25) > 0.35) c.copy(COL.lava);
  const rd = roadDist(cx, cz);
  if (rd < 4.2) c.lerp(b.desert > 0.5 ? COL.sand : (Math.hypot(cx - LOC.city.x, cz - LOC.city.z) < LOC.city.r * 1.4 ? COL.stone : COL.road), 0.85);
  return c;
}

export function buildTerrainMeshes(scene) {
  const CH = 32; // cells per chunk
  const mat = envMaterial();
  const r = rng(99);
  const group = new THREE.Group();
  const lavaSpots = [];
  for (let cj = 0; cj < N / CH; cj++) for (let ci = 0; ci < N / CH; ci++) {
    const pos = [], col = [];
    for (let j = cj * CH; j < (cj + 1) * CH; j++) for (let i = ci * CH; i < (ci + 1) * CH; i++) {
      const x0 = -WORLD.half + i * WORLD.cell, z0 = -WORLD.half + j * WORLD.cell, x1 = x0 + WORLD.cell, z1 = z0 + WORLD.cell;
      const h00 = H[j * (N + 1) + i], h10 = H[j * (N + 1) + i + 1], h01 = H[(j + 1) * (N + 1) + i], h11 = H[(j + 1) * (N + 1) + i + 1];
      if (Math.max(h00, h10, h01, h11) < -11) continue; // deep sea – skip
      const tri = (ax, ay, az, bx, by, bz, cx, cy, cz) => {
        pos.push(ax, ay, az, bx, by, bz, cx, cy, cz);
        const mx = (ax + bx + cx) / 3, mz = (az + bz + cz) / 3, my = (ay + by + cy) / 3;
        const slope = Math.max(Math.abs(ay - by), Math.abs(by - cy), Math.abs(ay - cy)) / WORLD.cell;
        const c = faceColor(mx, mz, my, slope, clamp((noise2(mx / 22, mz / 22) + 1) * 0.5, 0, 0.999));
        const v = 0.975 + r() * 0.05;
        for (let k = 0; k < 3; k++) col.push(c.r * v, c.g * v, c.b * v);
        if (c.equals(COL.lava) && r() < 0.05) lavaSpots.push(new THREE.Vector3(mx, my, mz));
      };
      tri(x0, h00, z0, x0, h01, z1, x1, h11, z1);
      tri(x0, h00, z0, x1, h11, z1, x1, h10, z0);
    }
    if (!pos.length) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals(); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true;
    group.add(m);
  }
  scene.add(group);
  // water
  const wg = new THREE.PlaneGeometry(WORLD.size + 2400, WORLD.size + 2400, 1, 1); wg.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(wg, new THREE.MeshToonMaterial({ color: 0x3a8fc8, transparent: true, opacity: 0.78 }));
  water.position.y = 0.05; water.receiveShadow = true; scene.add(water);
  return { group, water, lavaSpots };
}
