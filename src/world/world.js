// The open world: terrain, regions, chunky props & architecture, colliders, platforms,
// interiors (dungeon, hidden cave), floating islands, sky and the day/night cycle.
import * as THREE from 'three';
import { Batch } from './builder.js';
import { LOC, WORLD, buildHeights, buildTerrainMeshes, terrainHeight, biomeAt, roadDist, surfaceAt } from './terrain.js';
import { rng, clamp, lerp, smooth, makeNoise } from '../core/util.js';
import { glowMat, toon } from '../render/toon.js';

export { LOC };
const noise = makeNoise(31337);

// Interior anchors (far outside the terrain)
export const INTERIOR = {
  dungeon: { x: 3000, z: 0 },
  cave: { x: 3000, z: 900 },
};

const C = {
  trunk: 0x6b4a32, trunkD: 0x4e3524, leaf: 0x4f9a3c, leafL: 0x6cbf4a, leafD: 0x3b7d33, pine: 0x2f6b40, pineD: 0x245a36,
  stone: 0xa39e94, stoneD: 0x7d786f, stoneL: 0xc4beb2, wall: 0xe9dcc0, wallB: 0xd8c7a3, timber: 0x5a3d2a, roofR: 0xb5463a, roofB: 0x3d5f9a, roofG: 0x4a7a4a,
  roofO: 0xc77a3a, sand: 0xdcbf86, sandD: 0xc2a26a, sandstone: 0xd9a86c, cactus: 0x4f8a45, snow: 0xf4f8ff, ice: 0x9fdcff,
  demonRock: 0x2c1e2a, demonRock2: 0x452436, crystalR: 0xff3355, lava: 0xff5a1f, bone: 0xe8e0c8, gold: 0xe8b84a, wood: 0x8a6240, dark: 0x2a2630,
  ruin: 0x9a9c8e, ruinMoss: 0x6f8f5a, rune: 0x5fd8ff,
};

class Placer {
  constructor(b, x, y, z, rot = 0) { this.b = b; this.x = x; this.y = y; this.z = z; this.rot = rot; this.c = Math.cos(rot); this.s = Math.sin(rot); }
  w(lx, lz) { return [this.x + lx * this.c + lz * this.s, this.z - lx * this.s + lz * this.c]; }
  block(lx, ly, lz, w, h, d, color, o = {}) { const [x, z] = this.w(lx, lz); this.b.block(x, this.y + ly, z, w, h, d, color, { ...o, ry: this.rot + (o.ry || 0) }); return this; }
  box(lx, ly, lz, w, h, d, color, o = {}) { const [x, z] = this.w(lx, lz); this.b.box(x, this.y + ly, z, w, h, d, color, { ...o, ry: this.rot + (o.ry || 0) }); return this; }
  prism(lx, ly, lz, w, h, d, color, o = {}) { const [x, z] = this.w(lx, lz); this.b.prism(x, this.y + ly, z, w, h, d, color, { ...o, ry: this.rot + (o.ry || 0) }); return this; }
  cyl(lx, ly, lz, r, h, color, o = {}) { const [x, z] = this.w(lx, lz); this.b.cyl(x, this.y + ly, z, r, h, color, { ...o, ry: this.rot }); return this; }
  cone(lx, ly, lz, r, h, color, o = {}) { const [x, z] = this.w(lx, lz); this.b.cone(x, this.y + ly, z, r, h, color, { ...o, ry: this.rot + (o.ry || 0) }); return this; }
}

export class World {
  constructor(scene) {
    this.scene = scene;
    this.colliders = []; this.platforms = []; this.grid = new Map(); this.pgrid = new Map();
    this.animated = []; this.markers = {}; this.spawnZones = []; this.chests = []; this.fragments = [];
    this.batches = new Map();
    this.r = rng(2024);
    this.regionCache = { name: '', key: '' };
    this.interior = null;
  }

  // ------------------------------------------------------------ collision structures
  _cells(minX, maxX, minZ, maxZ) { const out = []; for (let i = Math.floor(minX / 32); i <= Math.floor(maxX / 32); i++) for (let j = Math.floor(minZ / 32); j <= Math.floor(maxZ / 32); j++) out.push(i + ',' + j); return out; }
  addCircle(x, z, r, top = 1e4, bottom = -1e4) {
    const c = { t: 'c', x, z, r, top, bottom };
    for (const k of this._cells(x - r, x + r, z - r, z + r)) { if (!this.grid.has(k)) this.grid.set(k, []); this.grid.get(k).push(c); }
    return c;
  }
  addBox(cx, cz, w, d, top = 1e4, bottom = -1e4, rot = 0) {
    const q = Math.abs(Math.sin(rot * 2)) < 0.15;
    if (!q) {
      // arbitrary rotation: approximate with a row of circles along the long axis
      const alongZ = d >= w; const len = alongZ ? d : w; const rad = (alongZ ? w : d) / 2;
      const dx = alongZ ? Math.sin(rot) : Math.cos(rot), dz = alongZ ? Math.cos(rot) : -Math.sin(rot);
      const n = Math.max(1, Math.ceil(len / (rad * 1.2)));
      let last = null;
      for (let i = 0; i <= n; i++) { const t = -len / 2 + rad * 0.6 + (len - rad * 1.2) * (i / n); last = this.addCircle(cx + dx * t, cz + dz * t, rad * 1.05, top, bottom); }
      return last;
    }
    let hw = w / 2, hd = d / 2;
    if (Math.abs(Math.sin(rot)) > 0.7) [hw, hd] = [hd, hw];
    const c = { t: 'b', minX: cx - hw, maxX: cx + hw, minZ: cz - hd, maxZ: cz + hd, top, bottom };
    for (const k of this._cells(c.minX, c.maxX, c.minZ, c.maxZ)) { if (!this.grid.has(k)) this.grid.set(k, []); this.grid.get(k).push(c); }
    return c;
  }
  addPlatformBox(cx, cz, w, d, top) {
    const p = { t: 'b', minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, top };
    for (const k of this._cells(p.minX, p.maxX, p.minZ, p.maxZ)) { if (!this.pgrid.has(k)) this.pgrid.set(k, []); this.pgrid.get(k).push(p); }
    return p;
  }
  addPlatformCircle(x, z, r, top) {
    const p = { t: 'c', x, z, r, top };
    for (const k of this._cells(x - r, x + r, z - r, z + r)) { if (!this.pgrid.has(k)) this.pgrid.set(k, []); this.pgrid.get(k).push(p); }
    return p;
  }
  /** Highest walkable surface under (x, z) not above y + step. */
  groundAt(x, z, y = 1e4, step = 0.9) {
    let best = terrainHeight(x, z);
    if (best > y + step) best = best; // terrain is always walkable (can't be below it)
    const list = this.pgrid.get(Math.floor(x / 32) + ',' + Math.floor(z / 32));
    if (list) for (const p of list) {
      const inside = p.t === 'b' ? (x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ) : ((x - p.x) ** 2 + (z - p.z) ** 2 <= p.r * p.r);
      if (inside && p.top <= y + step && p.top > best) best = p.top;
    }
    return best;
  }
  /** Push a circle (x,z,r) at height y out of colliders. Mutates pos. Returns true if collided. */
  resolve(pos, r = 0.45) {
    const list = this.grid.get(Math.floor(pos.x / 32) + ',' + Math.floor(pos.z / 32));
    let hit = false;
    if (list) for (const c of list) {
      if (pos.y > c.top - 0.3 || pos.y + 1.6 < c.bottom) continue;
      if (c.t === 'c') {
        const dx = pos.x - c.x, dz = pos.z - c.z; const d = Math.hypot(dx, dz); const m = c.r + r;
        if (d < m && d > 1e-4) { pos.x = c.x + dx / d * m; pos.z = c.z + dz / d * m; hit = true; }
      } else {
        const nx = clamp(pos.x, c.minX, c.maxX), nz = clamp(pos.z, c.minZ, c.maxZ);
        const dx = pos.x - nx, dz = pos.z - nz; const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 > 1e-8) { const d = Math.sqrt(d2); pos.x = nx + dx / d * r; pos.z = nz + dz / d * r; }
          else { // inside: push out along smallest axis
            const l = pos.x - c.minX, rr = c.maxX - pos.x, t = pos.z - c.minZ, bb = c.maxZ - pos.z; const m = Math.min(l, rr, t, bb);
            if (m === l) pos.x = c.minX - r; else if (m === rr) pos.x = c.maxX + r; else if (m === t) pos.z = c.minZ - r; else pos.z = c.maxZ + r;
          }
          hit = true;
        }
      }
    }
    // world bounds / interior bounds
    if (!this.interior) { pos.x = clamp(pos.x, -800, 800); pos.z = clamp(pos.z, -800, 800); }
    return hit;
  }
  /** Line-of-sight helper for camera: returns ground height including platforms. */
  heightAt(x, z) { return this.groundAt(x, z, 1e4, 0); }

  batch(x, z) {
    const key = this.interior ? 'int' : Math.floor(x / 160) + ',' + Math.floor(z / 160);
    if (!this.batches.has(key)) this.batches.set(key, new Batch());
    return this.batches.get(key);
  }
  h(x, z) { return terrainHeight(x, z); }

  // ------------------------------------------------------------ props
  tree(x, z, kind = 'oak', s = 1) {
    const r = this.r; const y = this.h(x, z) - 0.2; if (y < 0.4) return;
    const b = this.batch(x, z);
    if (kind === 'oak') {
      const th = (2.2 + r() * 1.2) * s;
      b.cyl(x, y, z, 0.32 * s, th, C.trunk, { jitter: 0.08 });
      const n = 2 + Math.floor(r() * 2);
      for (let i = 0; i < n; i++) {
        const ox = (r() - 0.5) * 1.4 * s, oz = (r() - 0.5) * 1.4 * s;
        b.ico(x + ox, y + th + 0.6 * s + i * 0.9 * s, z + oz, (1.9 - i * 0.35) * s, r.pick([C.leaf, C.leafL, C.leafD]), { ay: 0.8, jitter: 0.6 * s });
      }
      this.addCircle(x, z, 0.45 * s, y + th + 3);
    } else if (kind === 'giant') {
      const th = 8 * s;
      b.cyl(x, y, z, 1.4 * s, th, C.trunkD, { jitter: 0.4, seg: 8 });
      for (let i = 0; i < 4; i++) { const a = i * 1.57 + r(); b.box(x + Math.cos(a) * 1.4 * s, y + 0.5, z + Math.sin(a) * 1.4 * s, 0.8 * s, 1.4, 2.4 * s, C.trunkD, { ry: -a }); }
      for (let i = 0; i < 6; i++) b.ico(x + (r() - 0.5) * 7 * s, y + th + r() * 4 * s, z + (r() - 0.5) * 7 * s, (3 + r() * 1.5) * s, r.pick([C.leafD, C.leaf]), { ay: 0.7, jitter: 1.2 });
      this.addCircle(x, z, 1.6 * s, y + th + 4);
    } else if (kind === 'pine' || kind === 'snowpine') {
      const th = (1.2 + r() * 0.6) * s; const snow = kind === 'snowpine';
      b.cyl(x, y, z, 0.25 * s, th + 1, C.trunkD, { jitter: 0.05 });
      for (let i = 0; i < 3; i++) {
        const rr = (1.8 - i * 0.45) * s;
        b.cone(x, y + th + i * 1.3 * s, z, rr, 2.2 * s, snow && i === 2 ? C.snow : r.pick([C.pine, C.pineD]), { jitter: 0.25 * s, top: snow ? C.snow : null });
      }
      this.addCircle(x, z, 0.35 * s, y + th + 4);
    } else if (kind === 'palm') {
      const th = 4.5 * s; let px = x, pz = z; const lean = r() * 6;
      for (let i = 0; i < 5; i++) { b.cyl(px, y + i * th / 5, pz, (0.28 - i * 0.03) * s, th / 5 + 0.1, C.trunk, { jitter: 0.05 }); px += Math.cos(lean) * 0.2; pz += Math.sin(lean) * 0.2; }
      for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; b.box(px + Math.cos(a) * 1.3 * s, y + th - 0.2, pz + Math.sin(a) * 1.3 * s, 2.6 * s, 0.12, 0.7 * s, C.leafL, { ry: -a, rz: -0.35, jitter: 0.1 }); }
      this.addCircle(x, z, 0.35 * s, y + th);
    } else if (kind === 'dead') {
      const th = 3 * s;
      b.cyl(x, y, z, 0.25 * s, th, C.dark, { jitter: 0.1 });
      for (let i = 0; i < 3; i++) { const a = r() * 6.28; b.box(x + Math.cos(a) * 0.6, y + th * (0.6 + r() * 0.3), z + Math.sin(a) * 0.6, 1.6 * s, 0.18, 0.18, C.dark, { ry: -a, rz: 0.5 }); }
      this.addCircle(x, z, 0.3 * s, y + th);
    } else if (kind === 'cherry') {
      const th = 2.4 * s;
      b.cyl(x, y, z, 0.28 * s, th, C.trunkD, { jitter: 0.08 });
      for (let i = 0; i < 3; i++) b.ico(x + (r() - 0.5) * 2, y + th + 0.8 + r(), z + (r() - 0.5) * 2, 1.6 * s, r.pick([0xffb7d0, 0xf7a1c4, 0xffc9dc]), { ay: 0.75, jitter: 0.5 });
      this.addCircle(x, z, 0.4 * s, y + th + 3);
    }
  }
  rock(x, z, s, color = C.stone, o = {}) {
    const y = this.h(x, z); const b = this.batch(x, z);
    b.rock(x, y + s * 0.3, z, s, color, { top: o.top, ax: o.ax, ay: o.ay, az: o.az });
    if (s > 0.8) this.addCircle(x, z, s * 0.8, y + s * 1.1);
  }
  bush(x, z, color = C.leafD) { const y = this.h(x, z); if (y < 0.3) return; this.batch(x, z).ico(x, y + 0.4, z, 0.8 + this.r() * 0.4, color, { ay: 0.7, jitter: 0.3 }); }
  mushroom(x, z, s = 1) {
    const y = this.h(x, z); const b = this.batch(x, z);
    b.cyl(x, y, z, 0.12 * s, 0.5 * s, 0xf0e6d0); b.cone(x, y + 0.45 * s, z, 0.45 * s, 0.35 * s, this.r() < 0.5 ? 0xd9443a : 0x9a5ad9, { seg: 6 });
  }

  house(x, z, rot, { w = 6, d = 5, h = 3.2, roof = C.roofR, wall = C.wall, floors = 1, chimney = true } = {}) {
    const y = this.h(x, z) - 0.1; const b = this.batch(x, z); const P = new Placer(b, x, y, z, rot);
    P.block(0, -0.6, 0, w + 0.6, 0.8, d + 0.6, C.stoneD); // foundation
    const H = h * floors;
    P.block(0, 0.2, 0, w, H, d, wall, { jitter: 0.12 });
    // timber frame
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) P.block(sx * w / 2, 0.2, sz * d / 2, 0.3, H, 0.3, C.timber, { jitter: 0.03 });
    for (let f = 1; f <= floors; f++) { P.box(0, 0.2 + h * f - 0.1, d / 2 + 0.05, w, 0.25, 0.12, C.timber); P.box(0, 0.2 + h * f - 0.1, -d / 2 - 0.05, w, 0.25, 0.12, C.timber); }
    P.box(0, 0.2 + H / 2, d / 2 + 0.06, 0.18, H, 0.1, C.timber, { rz: 0.6 });
    // door & windows
    P.block(0, 0.2, d / 2 + 0.05, 1.1, 2, 0.15, C.wood);
    for (const sx of [-1, 1]) for (let f = 0; f < floors; f++) P.box(sx * w * 0.3, 0.2 + h * f + 1.6, d / 2 + 0.06, 0.8, 0.8, 0.12, 0x3a4a6a);
    // roof
    P.prism(0, 0.2 + H + 1.1, 0, w + 1.0, 2.2, d + 1.2, roof, { ry: 0, jitter: 0.15 });
    if (chimney) P.block(w * 0.25, 0.2 + H + 0.4, -d * 0.15, 0.7, 2.6, 0.7, C.stoneD);
    this.addBox(x, z, w + 0.6, d + 0.6, y + H + 3, -1e4, rot);
    return P;
  }
  fence(ax, az, bx, bz) {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 2.2);
    const ang = Math.atan2(bx - ax, bz - az);
    for (let i = 0; i <= n; i++) {
      const t = i / n; const x = lerp(ax, bx, t), z = lerp(az, bz, t); const y = this.h(x, z);
      const b = this.batch(x, z);
      b.block(x, y - 0.2, z, 0.25, 1.4, 0.25, C.wood);
      if (i < n) { const mx = lerp(ax, bx, t + 0.5 / n), mz = lerp(az, bz, t + 0.5 / n); b.box(mx, this.h(mx, mz) + 0.8, mz, 0.12, 0.16, 2.3, C.wood, { ry: ang }); b.box(mx, this.h(mx, mz) + 0.4, mz, 0.12, 0.14, 2.3, C.wood, { ry: ang }); }
    }
  }
  torch(x, y, z, color = 0xffa040) {
    this.batch(x, z).block(x, y, z, 0.2, 1.6, 0.2, C.timber);
    const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), glowMat(color, 0.95));
    flame.position.set(x, y + 1.85, z); this.scene.add(flame);
    const seed = Math.random() * 10;
    this.animated.push((t) => { const k = 1 + Math.sin(t * 17 + seed) * 0.15 + Math.sin(t * 29 + seed) * 0.1; flame.scale.set(k, k * 1.4, k); });
  }
  crystal(x, y, z, s, color, glow = true) {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(s, 0), toon(color, { emissive: color, emissiveIntensity: 0.6 }));
    m.scale.y = 1.8; m.position.set(x, y + s * 1.6, z); m.rotation.y = Math.random() * 3; this.scene.add(m);
    if (glow) { const g = new THREE.Mesh(new THREE.OctahedronGeometry(s * 1.4, 0), glowMat(color, 0.18)); m.add(g); }
    const seed = Math.random() * 10;
    this.animated.push((t) => { m.position.y = y + s * 1.6 + Math.sin(t * 1.4 + seed) * 0.25; m.rotation.y += 0.004; });
    return m;
  }

  // ------------------------------------------------------------ regions
  buildForest() {
    const r = this.r; const F = LOC.forest;
    for (let i = 0; i < 1500; i++) {
      const a = r() * 6.28, d = Math.sqrt(r()) * F.r * 1.15;
      const x = F.x + Math.cos(a) * d, z = F.z + Math.sin(a) * d;
      if (roadDist(x, z) < 6 || Math.hypot(x - LOC.wake.x, z - LOC.wake.z) < 18 || Math.hypot(x - LOC.village.x, z - LOC.village.z) < LOC.village.r + 10) continue;
      if (Math.hypot(x - LOC.beastCamp.x, z - LOC.beastCamp.z) < 26) continue;
      const k = r();
      if (k < 0.62) this.tree(x, z, 'oak', 0.9 + r() * 0.6);
      else if (k < 0.8) this.tree(x, z, 'pine', 0.9 + r() * 0.5);
      else if (k < 0.9) this.bush(x, z);
      else if (k < 0.95) this.rock(x, z, 0.6 + r() * 1.4, C.stone, { top: C.ruinMoss });
      else this.mushroom(x, z, 0.8 + r());
    }
    // giant ancient trees
    for (const [x, z] of [[-40, 260], [80, 420], [-120, 380], [160, 300], [-20, 470]]) this.tree(x, z, 'giant', 1 + r() * 0.4);
    // wake clearing: fallen log, broken sword marker, flowers
    const w = LOC.wake; const y = this.h(w.x, w.z); const b = this.batch(w.x, w.z);
    b.cyl(w.x - 6, y + 0.45 - 3, w.z - 4, 0.5, 6, C.trunk, { rz: Math.PI / 2, ry: 0.4 });
    for (let i = 0; i < 40; i++) { const a = r() * 6.28, d = 3 + r() * 10; b.cone(w.x + Math.cos(a) * d, this.h(w.x + Math.cos(a) * d, w.z + Math.sin(a) * d), w.z + Math.sin(a) * d, 0.09, 0.2, r.pick([0xffffff, 0xffe066, 0xff8fb0, 0x9fd8ff]), { seg: 4 }); }
    this.markers.brokenSword = new THREE.Vector3(w.x + 3, y, w.z - 5);
    // beast tamer camp
    const bc = LOC.beastCamp; const by = this.h(bc.x, bc.z); const bb = this.batch(bc.x, bc.z);
    for (let i = 0; i < 3; i++) { const a = i * 2.1; const tx = bc.x + Math.cos(a) * 8, tz = bc.z + Math.sin(a) * 8; bb.cone(tx, by, tz, 2.4, 3.4, r.pick([0x8a5a3a, 0x6a7a3a, 0x9a6a4a]), { seg: 6 }); this.addCircle(tx, tz, 2.2, by + 3); }
    bb.cyl(bc.x, by, bc.z, 1, 0.3, C.stoneD); this.torch(bc.x + 2, by, bc.z + 2);
    this.markers.beastCamp = new THREE.Vector3(bc.x, by, bc.z);
    // forest spawn zones
    this.spawnZones.push({ x: 60, z: 330, r: 120, types: ['wolf', 'slime', 'slime'], level: [2, 5], count: 8, region: 'forest' });
    this.spawnZones.push({ x: -100, z: 420, r: 80, types: ['wolf', 'goblin'], level: [4, 7], count: 6, region: 'forest' });
    this.spawnZones.push({ x: 150, z: 120, r: 70, types: ['goblin', 'goblin', 'wolf'], level: [3, 7], count: 7, region: 'plains' });
  }

  buildVillage() {
    const V = LOC.village; const r = this.r; const y0 = V.h;
    const houses = [[-22, -14, 0], [-24, 10, Math.PI / 2], [20, -18, 0], [26, 6, -Math.PI / 2], [0, -30, 0], [-8, 28, Math.PI], [14, 26, Math.PI], [-38, -6, Math.PI / 2], [38, -22, -Math.PI / 2]];
    const roofs = [C.roofR, C.roofB, C.roofO, C.roofG];
    houses.forEach(([dx, dz, rot], i) => this.house(V.x + dx, V.z + dz, rot + (r() - 0.5) * 0.08, { w: 6 + r() * 3, d: 5 + r() * 2, roof: roofs[i % 4], floors: i % 3 === 0 ? 2 : 1 }));
    // well
    const b = this.batch(V.x, V.z);
    b.cyl(V.x, y0, V.z, 1.4, 1.1, C.stone, { seg: 8 }); b.block(V.x - 1.2, y0, V.z, 0.2, 2.6, 0.2, C.timber); b.block(V.x + 1.2, y0, V.z, 0.2, 2.6, 0.2, C.timber);
    b.prism(V.x, y0 + 3, V.z, 3, 0.9, 2, C.roofR);
    this.addCircle(V.x, V.z, 1.6, y0 + 2);
    // market stalls
    for (let i = 0; i < 3; i++) {
      const sx = V.x - 8 + i * 8, sz = V.z + 10;
      b.block(sx, y0, sz, 3, 1, 1.6, C.wood); b.block(sx - 1.4, y0, sz - 0.7, 0.15, 2.4, 0.15, C.timber); b.block(sx + 1.4, y0, sz - 0.7, 0.15, 2.4, 0.15, C.timber);
      b.box(sx, y0 + 2.5, sz, 3.4, 0.15, 2.2, [0xd94a4a, 0x4a8ad9, 0xe6c84a][i], { rx: 0.2 });
      for (let k = 0; k < 4; k++) b.box(sx - 1 + k * 0.65, y0 + 1.15, sz, 0.4, 0.3, 0.4, r.pick([0xe05a3a, 0xf0c040, 0x8ac04a, 0xc07a3a]));
      this.addBox(sx, sz, 3, 1.6, y0 + 1);
    }
    // windmill (rotating blades)
    const wx = V.x + 52, wz = V.z - 40, wy = this.h(wx, wz);
    b.cyl(wx, wy, wz, 3, 10, C.wall, { seg: 8 }); b.cone(wx, wy + 10, wz, 3.6, 3.5, C.roofR, { seg: 8 });
    this.addCircle(wx, wz, 3.2, wy + 12);
    const blades = new THREE.Group(); blades.position.set(wx, wy + 9, wz + 3.4);
    const bb = new Batch();
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; bb.box(Math.cos(a) * 3.5, Math.sin(a) * 3.5, 0, 0.3, 7, 0.15, C.wood, { rz: a + Math.PI / 2 }); bb.box(Math.cos(a) * 4, Math.sin(a) * 4, 0.1, 1.6, 5.2, 0.06, 0xf2ead8, { rz: a + Math.PI / 2 }); }
    blades.add(bb.build()); this.scene.add(blades);
    this.animated.push((t, dt) => { blades.rotation.z += dt * 0.6; });
    // crop fields + fences
    for (let f = 0; f < 3; f++) {
      const fx = V.x - 60 + f * 14, fz = V.z + 40;
      for (let row = 0; row < 5; row++) for (let k = 0; k < 6; k++) { const x = fx + k * 1.8, z = fz + row * 2.2; b.block(x, this.h(x, z) - 0.1, z, 1.2, 0.5 + r() * 0.4, 1.2, r.pick([0x9ac24a, 0xd9c04a, 0x7ab040])); }
    }
    this.fence(V.x - 64, V.z + 36, V.x - 18, V.z + 36);
    // lamp torches
    for (const [dx, dz] of [[-6, -6], [6, 6], [-6, 6], [6, -6], [0, 18], [0, -18]]) this.torch(V.x + dx, y0, V.z + dz);
    // cherry trees around village
    for (let i = 0; i < 14; i++) { const a = r() * 6.28, d = V.r * (0.75 + r() * 0.3); this.tree(V.x + Math.cos(a) * d, V.z + Math.sin(a) * d, r() < 0.5 ? 'cherry' : 'oak'); }
    // named spots
    const m = (k, dx, dz) => (this.markers[k] = new THREE.Vector3(V.x + dx, y0, V.z + dz));
    m('villageSquare', 0, 4); m('villageWell', 2.5, 0); m('smithy', 20, -13); m('innDoor', -22, -10); m('linaHouse', -24, 14); m('fields', -50, 46);
    m('chiefHouse', 0, -26); m('villageGate', -40, 24); m('market', 0, 8); m('villageEdge', 50, 30);
    // blacksmith anvil + forge glow
    const sm = this.markers.smithy; b.block(sm.x + 2, y0, sm.z + 2, 1, 0.8, 0.6, C.dark); b.block(sm.x - 2, y0, sm.z + 1.5, 1.6, 1.5, 1.6, C.stoneD);
    const forge = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 0.2), glowMat(0xff7733, 0.9)); forge.position.set(sm.x - 2, y0 + 0.8, sm.z + 2.31); this.scene.add(forge);
    this.animated.push((t) => { forge.material.opacity = 0.7 + Math.sin(t * 9) * 0.25; });
    this.regionLabels = this.regionLabels || [];
  }

  buildCity() {
    const Cc = LOC.city; const r = this.r; const y0 = Cc.h; const R = Cc.r;
    // walls with towers, gate facing south-west (towards crossroads)
    const gateAng = Math.atan2(LOC.crossroads.z - Cc.z, LOC.crossroads.x - Cc.x);
    const segs = 28;
    for (let i = 0; i < segs; i++) {
      const a0 = i / segs * Math.PI * 2, a1 = (i + 1) / segs * Math.PI * 2, am = (a0 + a1) / 2;
      let dg = Math.abs(((am - gateAng + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      const x = Cc.x + Math.cos(am) * R, z = Cc.z + Math.sin(am) * R;
      const b = this.batch(x, z);
      const len = 2 * R * Math.sin(Math.PI / segs) + 0.6;
      if (dg < 0.12) { this.markers.cityGate = new THREE.Vector3(x, y0, z); continue; }
      b.block(x, y0 - 1, z, 2.6, 10, len, C.stone, { ry: -am, jitter: 0.25 });
      for (let k = -2; k <= 2; k++) b.block(x + Math.cos(am) * 0.9 - Math.sin(am) * k * len / 5, y0 + 9, z + Math.sin(am) * 0.9 + Math.cos(am) * k * len / 5, 0.8, 1.2, len / 7, C.stoneL, { ry: -am });
      this.addBox(x, z, 3, len, y0 + 12, -1e4, -am);
      if (i % 4 === 0 || dg < 0.35) {
        const tx = Cc.x + Math.cos(a0) * R, tz = Cc.z + Math.sin(a0) * R;
        b.cyl(tx, y0 - 1, tz, 2.6, 15, C.stoneL, { seg: 8 }); b.cone(tx, y0 + 14, tz, 3.2, 5, C.roofB, { seg: 8 });
        this.addCircle(tx, tz, 2.8, y0 + 18);
      }
    }
    // gate arch
    const g = this.markers.cityGate; const P = new Placer(this.batch(g.x, g.z), g.x, y0, g.z, -gateAng + Math.PI / 2);
    P.block(-5, -1, 0, 3, 13, 4, C.stoneL); P.block(5, -1, 0, 3, 13, 4, C.stoneL); P.block(0, 9, 0, 13, 4, 4, C.stoneL);
    P.block(0, 12.8, 0, 10, 2, 4.5, C.roofB);
    // keep & castle at the north side
    const kx = Cc.x + 10, kz = Cc.z - 52;
    const kb = this.batch(kx, kz);
    kb.block(kx, y0, kz, 34, 4, 26, C.stoneD);
    kb.block(kx, y0 + 4, kz, 22, 18, 16, C.stoneL, { jitter: 0.3 });
    kb.prism(kx, y0 + 25, kz, 24, 6, 18, C.roofB);
    for (const [dx, dz] of [[-14, -10], [14, -10], [-14, 10], [14, 10]]) { kb.cyl(kx + dx, y0, kz + dz, 3.2, 26, C.stoneL, { seg: 8 }); kb.cone(kx + dx, y0 + 26, kz + dz, 4, 8, C.roofB, { seg: 8 }); this.addCircle(kx + dx, kz + dz, 3.4, y0 + 30); }
    kb.cyl(kx, y0 + 22, kz, 3, 14, C.stoneL, { seg: 8 }); kb.cone(kx, y0 + 36, kz, 3.8, 9, C.roofB, { seg: 8 });
    this.addBox(kx, kz, 34, 26, y0 + 4, -1e4);
    this.addPlatformBox(kx, kz, 34, 26, y0 + 4);
    // banners
    for (const dx of [-8, 8]) this.banner(kx + dx, y0 + 18, kz + 8.2, 0x2a4f9a);
    // plaza + fountain
    const fb = this.batch(Cc.x, Cc.z);
    fb.cyl(Cc.x, y0, Cc.z, 7, 0.9, C.stoneL, { seg: 8 }); fb.cyl(Cc.x, y0, Cc.z, 1, 3.2, C.stone, { seg: 8 }); fb.cyl(Cc.x, y0 + 3, Cc.z, 2.4, 0.5, C.stoneL, { seg: 8 });
    this.addCircle(Cc.x, Cc.z, 7.2, y0 + 1.2);
    const wtr = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 6.4, 0.1, 16), new THREE.MeshToonMaterial({ color: 0x4aa8e8, transparent: true, opacity: 0.85 }));
    wtr.position.set(Cc.x, y0 + 0.8, Cc.z); this.scene.add(wtr);
    this.fountain = new THREE.Vector3(Cc.x, y0 + 3.6, Cc.z);
    // houses in rings
    const roofs = [C.roofR, C.roofB, C.roofO];
    for (let ring = 0; ring < 3; ring++) {
      const rr = 26 + ring * 22; const n = 9 + ring * 5;
      for (let i = 0; i < n; i++) {
        const a = i / n * Math.PI * 2 + ring * 0.3;
        let dg = Math.abs(((a - gateAng + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (dg < 0.28) continue; // main street to the gate
        const x = Cc.x + Math.cos(a) * rr, z = Cc.z + Math.sin(a) * rr;
        if (Math.hypot(x - kx, z - kz) < 26) continue;
        if (Math.hypot(x - (Cc.x - 50), z - (Cc.z - 20)) < 14 || Math.hypot(x - (Cc.x + 52), z - (Cc.z + 12)) < 14) continue;
        this.house(x, z, -a + Math.PI / 2 + (r() - 0.5) * 0.1, { w: 6 + r() * 2, d: 5 + r() * 2, roof: roofs[(i + ring) % 3], wall: r() < 0.5 ? C.wall : C.wallB, floors: 1 + (r() < 0.5 ? 1 : 0) + (ring === 0 ? 1 : 0) });
      }
    }
    // mage tower (west) and cathedral (east)
    const mx = Cc.x - 50, mz = Cc.z - 20; const mb = this.batch(mx, mz);
    mb.cyl(mx, y0, mz, 5, 30, 0x7a6aa8, { seg: 8 }); mb.cyl(mx, y0 + 30, mz, 6, 2, 0x5a4a88, { seg: 8 }); mb.cone(mx, y0 + 32, mz, 6.5, 10, 0x3a2a6a, { seg: 8 });
    this.addCircle(mx, mz, 5.4, y0 + 42);
    this.crystal(mx, y0 + 44, mz, 1.6, 0x9a7aff);
    this.markers.mageTower = new THREE.Vector3(mx + 6.5, y0, mz + 2);
    const cx = Cc.x + 52, cz = Cc.z + 12; const cb = this.batch(cx, cz);
    cb.block(cx, y0, cz, 14, 12, 24, 0xf0ece0); cb.prism(cx, y0 + 15, cz, 15, 6, 25, 0x5a6a8a, { ry: Math.PI / 2 });
    cb.cyl(cx, y0, cz + 13, 3, 24, 0xf0ece0, { seg: 8 }); cb.cone(cx, y0 + 24, cz + 13, 3.6, 9, 0x5a6a8a, { seg: 8 });
    this.addBox(cx, cz, 14, 24, y0 + 14); this.addCircle(cx, cz + 13, 3.2, y0 + 30);
    this.crystal(cx, y0 + 33, cz + 13, 0.8, 0xffe08a);
    this.markers.cathedral = new THREE.Vector3(cx - 8, y0, cz);
    // guild hall near plaza
    const gx = Cc.x - 14, gz = Cc.z + 16;
    this.house(gx, gz, Math.PI / 4, { w: 12, d: 9, h: 4, roof: 0x8a3a2a, floors: 2 });
    this.banner(gx + 4, y0 + 7, gz + 4, 0xc8302a);
    const m = (k, dx, dz) => (this.markers[k] = new THREE.Vector3(Cc.x + dx, y0, Cc.z + dz));
    m('cityPlaza', 0, 9); m('guild', -14 + 5, 16 + 5); m('castleGate', 10, -36); m('cityMarket', 16, 12); m('tavern', 22, -14); m('cityEast', 30, 26); m('cityWest', -30, 10);
    for (const [dx, dz] of [[-9, 0], [9, 0], [0, -9], [0, 14], [-18, 20], [18, 20]]) this.torch(Cc.x + dx, y0, Cc.z + dz, 0xffc060);
    // farmland & road trees outside walls
    for (let i = 0; i < 40; i++) { const a = r() * 6.28, d = R + 16 + r() * 50; const x = Cc.x + Math.cos(a) * d, z = Cc.z + Math.sin(a) * d; if (roadDist(x, z) > 8) this.tree(x, z, r() < 0.7 ? 'oak' : 'pine'); }
  }
  banner(x, y, z, color) {
    const geo = new THREE.PlaneGeometry(2, 4, 4, 6); geo.translate(0, -2, 0);
    const m = new THREE.Mesh(geo, toon(color, { side: THREE.DoubleSide })); m.position.set(x, y, z); this.scene.add(m);
    const base = geo.attributes.position.array.slice();
    const seed = Math.random() * 10;
    this.animated.push((t) => {
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) { const by = base[i * 3 + 1]; p.setZ(i, Math.sin(t * 3 + by * 1.2 + base[i * 3] + seed) * 0.15 * (-by / 4)); }
      p.needsUpdate = true;
    });
  }

  buildRuins() {
    const R = LOC.ruins; const r = this.r; const y0 = R.h;
    const b = this.batch(R.x, R.z);
    // circle of broken pillars
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2; const x = R.x + Math.cos(a) * 30, z = R.z + Math.sin(a) * 30;
      const hh = 3 + r() * 9; if (r() < 0.2) { b.box(x + 2, y0 + 0.8, z, 1.6, 1.6, 5, C.ruin, { ry: a, rz: 0.1 }); continue; }
      b.cyl(x, y0, z, 1.1, hh, C.ruin, { seg: 8, jitter: 0.25, top: C.ruinMoss }); b.block(x, y0 + hh, z, 2.6, 0.8, 2.6, C.ruin, { ry: r(), rz: (r() - 0.5) * 0.3 });
      this.addCircle(x, z, 1.3, y0 + hh + 1);
    }
    // arches
    for (const a of [0.4, 2.2, 4.1]) {
      const x = R.x + Math.cos(a) * 46, z = R.z + Math.sin(a) * 46; const P = new Placer(this.batch(x, z), x, this.h(x, z), z, -a);
      P.block(0, 0, -4, 2, 10, 2, C.ruin); P.block(0, 0, 4, 2, 10, 2, C.ruin); P.block(0, 10, 0, 2.4, 2, 10.5, C.ruin, { rz: 0.05 });
      const [ax, az] = P.w(0, -4), [bx, bz] = P.w(0, 4); this.addCircle(ax, az, 1.3); this.addCircle(bx, bz, 1.3);
    }
    // giant statue head half buried, face of a swordsman (the player of the last cycle)
    const hx = R.x + 8, hz = R.z - 14;
    b.block(hx, y0 - 2, hz, 8, 9, 8, C.ruin, { ry: 0.5, rz: 0.15, jitter: 0.4, top: C.ruinMoss });
    b.block(hx + 1, y0 + 6, hz, 9, 3, 9, C.ruinMoss, { ry: 0.5, rz: 0.2, jitter: 0.6 });
    b.box(hx + Math.sin(0.5) * 4.2, y0 + 3.5, hz + Math.cos(0.5) * 4.2, 1.2, 0.5, 0.4, C.dark, { ry: 0.5 });
    this.addCircle(hx, hz, 5.5, y0 + 9);
    // central altar with runes
    b.cyl(R.x, y0, R.z, 8, 0.8, C.ruin, { seg: 8 }); b.cyl(R.x, y0 + 0.8, R.z, 5, 0.6, C.stoneL, { seg: 8 });
    this.addPlatformCircle(R.x, R.z, 8, y0 + 0.8); this.addPlatformCircle(R.x, R.z, 5, y0 + 1.4);
    const rune = new THREE.Mesh(new THREE.RingGeometry(3, 4.4, 6), glowMat(C.rune, 0.6)); rune.rotation.x = -Math.PI / 2; rune.position.set(R.x, y0 + 1.45, R.z); this.scene.add(rune);
    this.animated.push((t) => { rune.rotation.z = t * 0.3; rune.material.opacity = 0.35 + Math.sin(t * 2) * 0.2; });
    this.markers.ruinsAltar = new THREE.Vector3(R.x, y0 + 1.4, R.z);
    // dungeon gate (stone door into a hill)
    const gx = LOC.dungeonGate.x, gz = LOC.dungeonGate.z; const gy = this.h(gx, gz);
    const gb = this.batch(gx, gz);
    gb.block(gx, gy - 1, gz + 4, 22, 12, 10, C.stoneD, { jitter: 1, top: C.ruinMoss });
    gb.block(gx - 4, gy, gz - 1.2, 2, 8, 2, C.ruin); gb.block(gx + 4, gy, gz - 1.2, 2, 8, 2, C.ruin); gb.block(gx, gy + 7, gz - 1.2, 10, 2, 2.4, C.ruin);
    gb.block(gx, gy, gz - 0.6, 6, 7, 0.5, 0x1a1420);
    this.addBox(gx, gz + 4, 22, 10, gy + 12);
    const portal = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 6.6), glowMat(0x5fd8ff, 0.0)); portal.position.set(gx, gy + 3.4, gz - 0.9); portal.rotation.y = Math.PI; this.scene.add(portal);
    this.dungeonPortal = portal;
    this.markers.dungeonGate = new THREE.Vector3(gx, gy, gz - 3);
    for (const dx of [-5.5, 5.5]) this.torch(gx + dx, gy, gz - 3, 0x5fd8ff);
    // overgrowth
    for (let i = 0; i < 80; i++) { const a = r() * 6.28, d = 10 + r() * 70; const x = R.x + Math.cos(a) * d, z = R.z + Math.sin(a) * d; if (Math.hypot(x - gx, z - gz) < 14) continue; const k = r(); if (k < 0.4) this.rock(x, z, 0.5 + r() * 1.8, C.ruin, { top: C.ruinMoss }); else if (k < 0.7) this.bush(x, z); else this.tree(x, z, 'oak', 0.8 + r() * 0.4); }
    this.spawnZones.push({ x: R.x, z: R.z, r: 70, types: ['skeleton', 'skeleton', 'goblin'], level: [6, 10], count: 7, region: 'ruins' });
  }

  buildDesert() {
    const D = LOC.desert; const r = this.r;
    for (let i = 0; i < 380; i++) {
      const a = r() * 6.28, d = Math.sqrt(r()) * D.r; const x = D.x + Math.cos(a) * d, z = D.z + Math.sin(a) * d;
      if (biomeAt(x, z).desert < 0.6 || roadDist(x, z) < 6) continue;
      const k = r(); const y = this.h(x, z); const b = this.batch(x, z);
      if (k < 0.35) { // cactus
        b.cyl(x, y, z, 0.45, 3 + r() * 2, C.cactus, { seg: 6 }); if (r() < 0.7) { b.block(x + 0.8, y + 1.6, z, 0.9, 0.35, 0.35, C.cactus); b.block(x + 1.1, y + 1.6, z, 0.35, 1.4, 0.35, C.cactus); }
        this.addCircle(x, z, 0.5, y + 4);
      } else if (k < 0.55) this.rock(x, z, 1 + r() * 3, C.sandstone, { ay: 0.6 });
      else if (k < 0.62) { b.box(x, y + 0.3, z, 3, 0.4, 0.4, C.bone, { ry: r() * 3, rz: 0.2 }); b.ico(x + 1.5, y + 0.5, z, 0.6, C.bone); }
      else if (k < 0.66) { // mesa
        const hh = 8 + r() * 14, w = 10 + r() * 12;
        b.block(x, y - 1, z, w, hh, w * (0.6 + r() * 0.6), C.sandstone, { jitter: 1.2, ry: r() * 3, top: C.sand });
        b.block(x, y + hh - 2, z, w * 1.15, 3, w * 0.8, 0xc98a5a, { jitter: 1, ry: r() * 3 });
        this.addCircle(x, z, w * 0.5, y + hh + 1);
      }
    }
    // oasis palms
    const O = LOC.oasis;
    for (let i = 0; i < 14; i++) { const a = i / 14 * 6.28, d = O.r + 4 + r() * 6; this.tree(O.x + Math.cos(a) * d, O.z + Math.sin(a) * d, 'palm'); }
    // obelisks and sand-buried ruins
    for (const [x, z] of [[-480, -120], [-700, 40], [-560, -250], [-760, -100]]) {
      const y = this.h(x, z); const b = this.batch(x, z);
      b.block(x, y - 1, z, 2.4, 14, 2.4, C.sandstone, { jitter: 0.3 }); b.cone(x, y + 13, z, 1.8, 2.5, C.gold, { seg: 4 });
      this.addCircle(x, z, 1.8, y + 15);
    }
    // assassin camp: tents + lanterns
    const A = LOC.assassinCamp; const ab = this.batch(A.x, A.z);
    for (let i = 0; i < 4; i++) { const a = i * 1.57 + 0.4; const x = A.x + Math.cos(a) * 12, z = A.z + Math.sin(a) * 12; ab.prism(x, A.h + 1.4, z, 5, 2.8, 4, r.pick([0x6a3a5a, 0x3a3a5a, 0x8a5a3a]), { ry: -a }); this.addCircle(x, z, 2.4, A.h + 3); }
    this.torch(A.x, A.h, A.z, 0xc070ff);
    this.markers.assassinCamp = new THREE.Vector3(A.x, A.h, A.z + 3);
    // desert ruins boss-less dungeon-ish: sunken temple
    const tx = -720, tz = -320, ty = this.h(tx, tz); const tb = this.batch(tx, tz);
    tb.block(tx, ty - 2, tz, 26, 4, 26, C.sandstone); tb.block(tx, ty + 2, tz, 18, 4, 18, C.sandstone); tb.block(tx, ty + 6, tz, 10, 4, 10, C.sandstone);
    this.addPlatformBox(tx, tz, 26, 26, ty + 2); this.addPlatformBox(tx, tz, 18, 18, ty + 6); this.addPlatformBox(tx, tz, 10, 10, ty + 10);
    this.markers.sunTemple = new THREE.Vector3(tx, ty + 10, tz);
    this.spawnZones.push({ x: D.x, z: D.z, r: 240, types: ['scorpion', 'scorpion', 'skeleton', 'slime'], level: [10, 16], count: 12, region: 'desert' });
  }

  buildMountains() {
    const r = this.r;
    for (let i = 0; i < 700; i++) {
      const x = -380 + r() * 760, z = -280 - r() * 480; const b = biomeAt(x, z); if (b.mountain < 0.4 || b.demon > 0.4 || b.desert > 0.3) continue;
      const y = this.h(x, z); const k = r(); if (roadDist(x, z) < 6) continue;
      if (k < 0.55) this.tree(x, z, y > 40 || b.snowZone > 0.5 ? 'snowpine' : 'pine', 0.9 + r() * 0.6);
      else this.rock(x, z, 1 + r() * 4, C.stoneD, { top: y > 42 ? C.snow : C.ruinMoss });
    }
    // guardian fort
    const F = LOC.fort; const b = this.batch(F.x, F.z); const y = F.h;
    for (let i = 0; i < 12; i++) { const a = i / 12 * 6.28; const x = F.x + Math.cos(a) * 22, z = F.z + Math.sin(a) * 22; if (i === 4) continue; b.block(x, y - 1, z, 3, 7, 12, C.stoneD, { ry: -a }); this.addBox(x, z, 3, 12, y + 6, -1e4, -a); }
    b.block(F.x, y, F.z - 8, 14, 9, 10, C.stone); b.prism(F.x, y + 11, F.z - 8, 15, 4, 11, C.roofG); this.addBox(F.x, F.z - 8, 14, 10, y + 12);
    this.banner(F.x - 3, y + 9, F.z - 2.8, 0x4a7a4a); this.banner(F.x + 3, y + 9, F.z - 2.8, 0x4a7a4a);
    this.markers.fort = new THREE.Vector3(F.x, y, F.z);
    for (const dx of [-4, 4]) this.torch(F.x + dx, y, F.z + 2);
    // hidden cave entrance: crack in a cliff behind boulders
    const hc = LOC.hiddenCave; const hy = this.h(hc.x, hc.z); const hb = this.batch(hc.x, hc.z);
    hb.block(hc.x, hy - 2, hc.z - 6, 20, 18, 8, C.stoneD, { jitter: 1.5, top: C.snow });
    hb.block(hc.x, hy, hc.z - 1.8, 2.4, 5, 0.3, 0x0a0810);
    this.addBox(hc.x, hc.z - 6, 20, 8, hy + 16);
    this.rock(hc.x - 3, hc.z + 1, 2.2, C.stoneD); this.rock(hc.x + 3.4, hc.z + 1.5, 2.4, C.stoneD);
    this.markers.hiddenCave = new THREE.Vector3(hc.x, hy, hc.z);
    this.spawnZones.push({ x: 0, z: -380, r: 160, types: ['wolf', 'goblin', 'skeleton'], level: [12, 18], count: 9, region: 'mountain' });
  }

  buildSnow() {
    const S = LOC.snow; const r = this.r;
    for (let i = 0; i < 380; i++) {
      const a = r() * 6.28, d = Math.sqrt(r()) * S.r; const x = S.x + Math.cos(a) * d, z = S.z + Math.sin(a) * d;
      if (biomeAt(x, z).snowZone < 0.4 || roadDist(x, z) < 6) continue;
      if (Math.hypot(x - LOC.frostArena.x, z - LOC.frostArena.z) < LOC.frostArena.r + 4) continue;
      const k = r(); const y = this.h(x, z);
      if (k < 0.6) this.tree(x, z, 'snowpine', 0.9 + r() * 0.7);
      else if (k < 0.8) this.rock(x, z, 1 + r() * 2.5, 0xb8c4d4, { top: C.snow });
      else { const b = this.batch(x, z); b.cone(x, y, z, 0.6 + r(), 2 + r() * 4, C.ice, { seg: 4, jitter: 0.3 }); }
    }
    // snow camp
    const SC = LOC.snowCamp; const yb = SC.h;
    this.house(SC.x - 8, SC.z, Math.PI / 2, { w: 6, d: 5, roof: 0x6a5a4a, wall: 0x8a6a4a });
    this.house(SC.x + 8, SC.z - 4, -Math.PI / 2, { w: 5, d: 5, roof: 0x6a5a4a, wall: 0x8a6a4a });
    this.torch(SC.x, yb, SC.z + 4);
    this.markers.snowCamp = new THREE.Vector3(SC.x, yb, SC.z + 2);
    // frost arena: ring of ice spires
    const FA = LOC.frostArena; const fb = this.batch(FA.x, FA.z);
    for (let i = 0; i < 18; i++) { const a = i / 18 * 6.28; const x = FA.x + Math.cos(a) * FA.r, z = FA.z + Math.sin(a) * FA.r; fb.cone(x, FA.h - 1, z, 2 + r() * 1.5, 10 + r() * 10, C.ice, { seg: 4, jitter: 0.6 }); }
    this.markers.frostArena = new THREE.Vector3(FA.x, FA.h, FA.z);
    this.spawnZones.push({ x: S.x, z: S.z, r: 200, types: ['frostwolf', 'frostwolf', 'skeleton'], level: [16, 22], count: 10, region: 'snow' });
  }

  buildDemon() {
    const D = LOC.demon; const r = this.r;
    for (let i = 0; i < 360; i++) {
      const a = r() * 6.28, d = Math.sqrt(r()) * D.r; const x = D.x + Math.cos(a) * d, z = D.z + Math.sin(a) * d;
      if (biomeAt(x, z).demon < 0.55 || roadDist(x, z) < 6) continue;
      if (Math.hypot(x - LOC.demonCastle.x, z - LOC.demonCastle.z) < LOC.demonCastle.r + 6) continue;
      const k = r(); const y = this.h(x, z); const b = this.batch(x, z);
      if (k < 0.35) { b.cone(x, y - 0.5, z, 0.8 + r() * 1.4, 5 + r() * 12, r.pick([C.demonRock, C.demonRock2]), { seg: 4, jitter: 0.6, rz: (r() - 0.5) * 0.4 }); this.addCircle(x, z, 1.2, y + 8); }
      else if (k < 0.55) this.tree(x, z, 'dead', 1 + r() * 0.6);
      else if (k < 0.65 && i % 3 === 0) this.crystal(x, y, z, 0.5 + r() * 0.8, C.crystalR, i % 6 === 0);
      else if (k < 0.8) { b.box(x, y + 0.2, z, 2.4, 0.3, 0.3, C.bone, { ry: r() * 3 }); b.ico(x + 1, y + 0.4, z, 0.5, C.bone); }
      else this.rock(x, z, 1 + r() * 2, C.demonRock2);
    }
    // demon castle
    const DC = LOC.demonCastle; const b = this.batch(DC.x, DC.z); const y = DC.h;
    for (let i = 0; i < 20; i++) {
      const a = i / 20 * 6.28; const x = DC.x + Math.cos(a) * DC.r, z = DC.z + Math.sin(a) * DC.r;
      if (i === 15) { this.markers.demonGate = new THREE.Vector3(x, y, z); continue; }
      b.block(x, y - 1, z, 3, 14, 18, C.demonRock, { ry: -a, jitter: 0.6 });
      this.addBox(x, z, 3, 18, y + 14, -1e4, -a);
      if (i % 3 === 0) { b.cone(x, y + 13, z, 2, 9, C.demonRock2, { seg: 4 }); }
    }
    const kx = DC.x, kz = DC.z - DC.r + 10;
    b.block(kx, y, kz, 30, 30, 12, C.demonRock, { jitter: 1 });
    for (const dx of [-15, 0, 15]) b.cone(kx + dx, y + 30, kz, 4, 22, C.demonRock2, { seg: 4 });
    this.addBox(kx, kz, 30, 12, y + 30);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(3, 8, 6), glowMat(0xff2244, 0.9)); eye.position.set(kx, y + 22, kz + 6.2); eye.scale.z = 0.4; this.scene.add(eye);
    this.animated.push((t) => { eye.scale.y = 0.4 + Math.abs(Math.sin(t * 0.5)) * 0.6; });
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28; this.torch(DC.x + Math.cos(a) * 34, y, DC.z + Math.sin(a) * 34, 0xff3020); }
    this.markers.demonArena = new THREE.Vector3(DC.x, y, DC.z);
    this.spawnZones.push({ x: D.x - 40, z: D.z + 60, r: 170, types: ['demon', 'demon', 'skeleton', 'frostwolf'], level: [22, 28], count: 12, region: 'demon' });
  }

  buildSkyStone() {
    const S = LOC.skyStone; const b = this.batch(S.x, S.z); const y = S.h;
    b.cyl(S.x, y, S.z, 5, 0.8, C.stoneL, { seg: 8 });
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; b.block(S.x + Math.cos(a) * 4.2, y, S.z + Math.sin(a) * 4.2, 0.8, 3 + (i % 2) * 2, 0.8, C.ruin); this.addCircle(S.x + Math.cos(a) * 4.2, S.z + Math.sin(a) * 4.2, 0.6); }
    this.addPlatformCircle(S.x, S.z, 5, y + 0.8);
    const c = this.crystal(S.x, y + 1, S.z, 1.2, 0x7fe9ff);
    this.skyCrystal = c;
    this.markers.skyStone = new THREE.Vector3(S.x, y + 0.8, S.z);
  }

  buildWaystones() {
    // fast travel / save points
    const pts = { wakeStone: [LOC.wake.x - 8, LOC.wake.z + 6], villageStone: [LOC.village.x + 6, LOC.village.z - 6], cityStone: [LOC.city.x + 4, LOC.city.z + 24],
      ruinsStone: [LOC.ruins.x + 16, LOC.ruins.z + 12], oasisStone: [LOC.oasis.x + 38, LOC.oasis.z], fortStone: [LOC.fort.x, LOC.fort.z + 30],
      snowStone: [LOC.snowCamp.x, LOC.snowCamp.z + 14], demonStone: [LOC.demonCastle.x - 70, LOC.demonCastle.z + 80] };
    this.waystones = {};
    for (const [k, [x, z]] of Object.entries(pts)) {
      const y = this.h(x, z); const b = this.batch(x, z);
      b.block(x, y - 0.3, z, 1.6, 0.6, 1.6, C.stoneD); b.block(x, y + 0.3, z, 0.9, 2.6, 0.9, C.stoneL, { jitter: 0.12 });
      this.addCircle(x, z, 0.8, y + 3);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), glowMat(0x5fd8ff, 0.95)); gem.position.set(x, y + 3.4, z); this.scene.add(gem);
      this.animated.push((t) => { gem.rotation.y = t * 1.5; gem.position.y = y + 3.4 + Math.sin(t * 2) * 0.1; });
      this.waystones[k] = { pos: new THREE.Vector3(x, y, z), gem };
      this.markers[k] = new THREE.Vector3(x, y, z + 1.4);
    }
  }

  buildTreasure() {
    // chests & memory fragments scattered in hidden spots
    const r = this.r;
    const chestSpots = [
      [LOC.wake.x + 40, LOC.wake.z + 50, 'potion'], [-150, 520, 'gold'], [-60, 300, 'potion'], [190, 140, 'gold'], [-330, 200, 'katana'],
      [-560, 130, 'potion'], [-720, -320, 'dualblades', 10], [180, -360, 'greatsword'], [-420, -540, 'potion'], [560, -380, 'gold'],
      [420, 60, 'gold'], [-700, 150, 'potion'], [0, -360, 'elixir'],
    ];
    for (const [x, z, item, yy] of chestSpots) {
      const y = yy != null ? this.h(x, z) + yy : this.h(x, z);
      this.chests.push({ pos: new THREE.Vector3(x, y, z), item, opened: false, id: 'chest_' + Math.round(x) + '_' + Math.round(z) });
    }
    const frags = [
      [LOC.ruins.x + 9, LOC.ruins.z - 9], [-40, 255], [-700, 40], [LOC.fort.x - 18, LOC.fort.z - 18], [-430, -640], [700, -400], [LOC.city.x - 56, LOC.city.z - 24], [LOC.oasis.x, LOC.oasis.z - 34],
    ];
    frags.forEach(([x, z], i) => this.fragments.push({ pos: new THREE.Vector3(x, this.h(x, z), z), id: 'frag' + i, index: i, taken: false }));
    void r;
  }

  // ------------------------------------------------------------ interiors
  buildDungeon() {
    const I = INTERIOR.dungeon; const b = new Batch(); const r = this.r;
    const floor = (cx, cz, w, d, col = 0x5a5560) => { b.block(cx, -1, cz, w, 1, d, col, { jitter: 0.2 }); this.addPlatformBox(cx, cz, w, d, 0); };
    const wallBox = (cx, cz, w, d, h = 9, col = 0x6a6470) => { b.block(cx, 0, cz, w, h, d, col, { jitter: 0.4 }); this.addBox(cx, cz, w, d, h); };
    const room = (cx, cz, w, d, doors = {}) => {
      floor(cx, cz, w, d);
      const t = 1.5;
      const side = (dir, len, ax, az, horiz) => {
        const gap = doors[dir] ? 6 : 0;
        if (!gap) { wallBox(ax, az, horiz ? len : t, horiz ? t : len); return; }
        const seg = (len - gap) / 2;
        if (horiz) { wallBox(ax - gap / 2 - seg / 2, az, seg, t); wallBox(ax + gap / 2 + seg / 2, az, seg, t); }
        else { wallBox(ax, az - gap / 2 - seg / 2, t, seg); wallBox(ax, az + gap / 2 + seg / 2, t, seg); }
      };
      side('n', w, cx, cz - d / 2, true); side('s', w, cx, cz + d / 2, true); side('w', d, cx - w / 2, cz, false); side('e', d, cx + w / 2, cz, false);
      b.block(cx, 9, cz, w + 2, 1.2, d + 2, 0x3a3540);
    };
    // Entry hall -> corridor -> mural room -> corridor -> golem arena
    room(I.x, I.z, 24, 24, { n: 1 });
    floor(I.x, I.z - 22, 6, 20); wallBox(I.x - 4, I.z - 22, 1.5, 20); wallBox(I.x + 4, I.z - 22, 1.5, 20); b.block(I.x, 9, I.z - 22, 10, 1.2, 20, 0x3a3540);
    room(I.x, I.z - 46, 30, 28, { s: 1, n: 1 });
    floor(I.x, I.z - 70, 6, 20); wallBox(I.x - 4, I.z - 70, 1.5, 20); wallBox(I.x + 4, I.z - 70, 1.5, 20); b.block(I.x, 9, I.z - 70, 10, 1.2, 20, 0x3a3540);
    // round arena
    const ax = I.x, az = I.z - 112, AR = 30;
    b.cyl(ax, -1, az, AR + 2, 1, 0x4a4550, { seg: 8 }); this.addPlatformCircle(ax, az, AR + 2, 0);
    for (let i = 0; i < 24; i++) {
      const a = i / 24 * 6.28; const x = ax + Math.cos(a) * AR, z = az + Math.sin(a) * AR;
      if (Math.abs(a - Math.PI / 2) < 0.15) continue; // entrance (south)
      b.block(x, 0, z, 3, 16, 8.5, 0x5a5460, { ry: -a, jitter: 0.6 }); this.addBox(x, z, 3, 8.5, 16, -1e4, -a);
      if (i % 3 === 0) { b.cyl(x * 0.92 + ax * 0.08, 0, z * 0.92 + az * 0.08, 1.4, 16, 0x7a7480, { seg: 6 }); }
    }
    for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; this.crystal(ax + Math.cos(a) * (AR - 4), 8, az + Math.sin(a) * (AR - 4), 0.7, 0x5fd8ff, false); }
    // mural (story) in middle room
    const muralTex = this.muralTexture();
    const mural = new THREE.Mesh(new THREE.PlaneGeometry(14, 7), new THREE.MeshBasicMaterial({ map: muralTex }));
    mural.position.set(I.x - 14.2, 4.5, I.z - 46); mural.rotation.y = Math.PI / 2; this.scene.add(mural);
    this.markers.mural = new THREE.Vector3(I.x - 11, 0, I.z - 46);
    this.markers.dungeonEntry = new THREE.Vector3(I.x, 0, I.z + 6);
    this.markers.dungeonExit = new THREE.Vector3(I.x, 0, I.z + 10);
    this.markers.golemArena = new THREE.Vector3(ax, 0, az);
    // torches & pillars
    for (const [dx, dz] of [[-10, -10], [10, -10], [-10, 10], [10, 10], [-13, -40], [13, -40], [-13, -52], [13, -52]]) this.torch(I.x + dx, 0, I.z + dz, 0x5fd8ff);
    // rubble
    for (let i = 0; i < 30; i++) b.rock(I.x + (r() - 0.5) * 26, 0.2, I.z - 46 + (r() - 0.5) * 24, 0.3 + r() * 0.6, 0x6a6470);
    const mesh = b.build(); this.scene.add(mesh);
    this.dungeonSpawns = [
      { pos: new THREE.Vector3(I.x - 6, 0, I.z - 40), type: 'skeleton', level: 9 }, { pos: new THREE.Vector3(I.x + 6, 0, I.z - 50), type: 'skeleton', level: 9 },
      { pos: new THREE.Vector3(I.x, 0, I.z - 56), type: 'skeleton', level: 10 }, { pos: new THREE.Vector3(I.x + 8, 0, I.z - 6), type: 'slime', level: 8 },
    ];
  }
  muralTexture() {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const g = c.getContext('2d');
    g.fillStyle = '#6b5e4e'; g.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(${40 + Math.random() * 40},${30 + Math.random() * 30},20,0.15)`; g.fillRect(Math.random() * 1024, Math.random() * 512, 3, 3); }
    g.strokeStyle = '#2a2018'; g.lineWidth = 10; g.strokeRect(10, 10, 1004, 492);
    // panels: a swordsman facing a great eye; a world circle with 7 marks; the same swordsman again.
    const fig = (x, y, s, col) => {
      g.fillStyle = col; g.beginPath(); g.arc(x, y - 70 * s, 22 * s, 0, 7); g.fill();
      g.fillRect(x - 18 * s, y - 50 * s, 36 * s, 70 * s); g.fillRect(x - 16 * s, y + 20 * s, 12 * s, 50 * s); g.fillRect(x + 4 * s, y + 20 * s, 12 * s, 50 * s);
      g.save(); g.translate(x + 20 * s, y - 30 * s); g.rotate(-0.8); g.fillRect(0, -4 * s, 90 * s, 8 * s); g.restore();
      // spiky hair
      g.beginPath(); for (let i = 0; i < 6; i++) { g.lineTo(x - 26 * s + i * 10 * s, y - 92 * s - (i % 2) * 18 * s); } g.lineTo(x + 26 * s, y - 70 * s); g.fill();
    };
    fig(150, 330, 1.4, '#2a2018');
    g.strokeStyle = '#2a2018'; g.lineWidth = 8; g.beginPath(); g.arc(512, 250, 120, 0, 7); g.stroke();
    for (let i = 0; i < 7; i++) { const a = i / 7 * 6.28 - 1.57; g.fillStyle = i === 6 ? '#b02020' : '#2a2018'; g.beginPath(); g.arc(512 + Math.cos(a) * 120, 250 + Math.sin(a) * 120, 14, 0, 7); g.fill(); }
    g.fillStyle = '#2a2018'; g.beginPath(); g.ellipse(512, 250, 50, 24, 0, 0, 7); g.fill(); g.fillStyle = '#d0c0a0'; g.beginPath(); g.arc(512, 250, 14, 0, 7); g.fill();
    fig(870, 330, 1.4, '#2a2018');
    g.fillStyle = '#2a2018'; g.font = 'bold 34px serif'; g.textAlign = 'center';
    g.fillText('ᚱᛖ · ᚹᛟᚱᛚᛞ · ᛁ · ᛞᚲ · ᛗ', 512, 460);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  buildCave() {
    const I = INTERIOR.cave; const b = new Batch(); const r = this.r;
    // irregular cave: floor disk + rock walls + stalagmites; arena at the far end
    const pts = [[0, 0, 14], [0, -24, 12], [-10, -46, 13], [0, -78, 26]];
    for (const [dx, dz, rr] of pts) { b.cyl(I.x + dx, -1, I.z + dz, rr + 2, 1, 0x3a3440, { seg: 8 }); this.addPlatformCircle(I.x + dx, I.z + dz, rr + 2, 0); }
    // corridor floors
    b.block(I.x - 5, -1, I.z - 36, 10, 1, 24, 0x3a3440); this.addPlatformBox(I.x - 5, I.z - 36, 10, 24, 0);
    b.block(I.x, -1, I.z - 12, 10, 1, 24, 0x3a3440); this.addPlatformBox(I.x, I.z - 12, 10, 24, 0);
    b.block(I.x - 5, -1, I.z - 60, 12, 1, 22, 0x3a3440); this.addPlatformBox(I.x - 5, I.z - 60, 12, 22, 0);
    // walls: ring rocks around everything walkable
    const walk = (x, z) => this.groundAt(x, z, 1, 1) > -1;
    for (let gx = -40; gx <= 40; gx += 4) for (let gz = -112; gz <= 20; gz += 4) {
      const x = I.x + gx, z = I.z + gz;
      if (walk(x, z)) continue;
      let near = false; for (const [ox, oz] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) if (walk(x + ox, z + oz)) near = true;
      if (!near) continue;
      b.rock(x, 2, z, 3 + r() * 2.5, 0x4a4250, { ay: 2.4 }); this.addCircle(x, z, 3.2, 20);
    }
    b.block(I.x, 12, I.z - 45, 90, 2, 140, 0x2a2430);
    for (let i = 0; i < 26; i++) { const x = I.x + (r() - 0.5) * 30, z = I.z - r() * 100; if (!walk(x, z) || Math.hypot(x - I.x, z - (I.z - 78)) < 18) continue; b.cone(x, 0, z, 0.6 + r() * 0.8, 2 + r() * 4, 0x5a5262, { seg: 4 }); }
    for (let i = 0; i < 12; i++) { const a = r() * 6.28; this.crystal(I.x + Math.cos(a) * 22, 0, I.z - 78 + Math.sin(a) * 22, 0.6 + r() * 0.5, r() < 0.5 ? 0xb06aff : 0x5fd8ff, i % 3 === 0); }
    const mesh = b.build(); this.scene.add(mesh);
    // grave of an old blade
    const gb = new Batch(); gb.block(I.x, 0, I.z - 96, 3, 1, 2, 0x5a5262); gb.box(I.x, 2.2, I.z - 96, 0.2, 3, 0.5, 0x6a3a8a, { rz: 0.1 }); this.scene.add(gb.build());
    this.markers.caveEntry = new THREE.Vector3(I.x, 0, I.z + 4);
    this.markers.caveArena = new THREE.Vector3(I.x, 0, I.z - 78);
    this.markers.caveGhost = new THREE.Vector3(I.x - 12, 0, I.z - 44);
  }

  buildIslands() {
    const L = LOC.islands; const r = this.r; const b = new Batch();
    const islands = [
      { x: 0, z: 0, r: 16, y: 0 }, { x: 34, z: -22, r: 11, y: 8 }, { x: 6, z: -52, r: 13, y: 16 }, { x: -34, z: -34, r: 10, y: 10 },
      { x: -18, z: -84, r: 9, y: 24 }, { x: 20, z: -100, r: 30, y: 34 }, // herald arena
    ];
    this.islandList = [];
    for (const is of islands) {
      const x = L.x + is.x, z = L.z + is.z, y = L.y + is.y;
      b.cyl(x, y - 2, z, is.r, 2, 0x6fae4a, { seg: 8, jitter: 0.6, top: 0x86c25a });
      b.cone(x, y - 2 - is.r * 1.6, z, is.r * 0.95, is.r * 1.6, 0x8a7a6a, { seg: 8, jitter: 1.4, rx: Math.PI });
      this.addPlatformCircle(x, z, is.r * 0.97, y);
      this.islandList.push({ x, z, y, r: is.r });
      for (let i = 0; i < Math.floor(is.r / 4); i++) { const a = r() * 6.28, d = r() * is.r * 0.7; const tx = x + Math.cos(a) * d, tz = z + Math.sin(a) * d; if (is.r > 20) break; b.cyl(tx, y, tz, 0.3, 2.5, C.trunk); b.ico(tx, y + 3.2, tz, 1.6, r.pick([C.leaf, C.leafL]), { ay: 0.8 }); this.addCircle(tx, tz, 0.4, y + 5, y - 1); }
      // falling waterfall from island edge
      if (is.r > 10 && is.r < 20) {
        const wf = new THREE.Mesh(new THREE.PlaneGeometry(3, 40), new THREE.MeshBasicMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
        wf.position.set(x + is.r * 0.9, y - 20, z); wf.rotation.y = Math.PI / 2; this.scene.add(wf);
      }
    }
    // bridges (platform boxes) between consecutive islands
    const link = (a, c) => {
      const A = this.islandList[a], B = this.islandList[c];
      const dx = B.x - A.x, dz = B.z - A.z, len = Math.hypot(dx, dz); const ang = Math.atan2(dx, dz);
      const n = Math.ceil(len / 2.5);
      for (let i = 0; i <= n; i++) {
        const t = i / n; const x = A.x + dx * t, z = A.z + dz * t, y = lerp(A.y, B.y, t);
        b.box(x, y - 0.25, z, 3, 0.4, 2.4, 0x9a7a5a, { ry: ang, jitter: 0.1 });
        this.addPlatformBox(x, z, 3.2, 3.2, y);
      }
    };
    link(0, 1); link(1, 2); link(0, 3); link(3, 2); link(2, 4); link(4, 5);
    // arena: broken ring of pillars & halo ring overhead
    const H = this.islandList[5];
    for (let i = 0; i < 10; i++) { const a = i / 10 * 6.28; b.cyl(H.x + Math.cos(a) * (H.r - 3), H.y, H.z + Math.sin(a) * (H.r - 3), 1, 6 + r() * 8, 0xe0e4f0, { seg: 6 }); this.addCircle(H.x + Math.cos(a) * (H.r - 3), H.z + Math.sin(a) * (H.r - 3), 1.1, H.y + 15, H.y - 1); }
    const halo = new THREE.Mesh(new THREE.TorusGeometry(18, 0.6, 6, 48), glowMat(0xfff0a0, 0.7)); halo.position.set(H.x, H.y + 40, H.z); halo.rotation.x = Math.PI / 2.4; this.scene.add(halo);
    this.animated.push((t) => { halo.rotation.z = t * 0.2; });
    const mesh = b.build(); this.scene.add(mesh);
    this.markers.islandArrive = new THREE.Vector3(L.x, L.y, L.z + 6);
    this.markers.heraldArena = new THREE.Vector3(H.x, H.y, H.z);
    this.markers.islandReturn = new THREE.Vector3(L.x - 6, L.y, L.z + 8);
    const rb = new Batch(); rb.block(L.x - 6, L.y, L.z + 10, 1.6, 0.6, 1.6, C.stoneD); rb.block(L.x - 6, L.y + 0.6, L.z + 10, 0.9, 2.4, 0.9, C.stoneL); this.scene.add(rb.build());
    this.islandSpawns = [
      { pos: new THREE.Vector3(H.x - 30, 0, H.z + 60), type: 'sentinel' }, { pos: new THREE.Vector3(L.x + 34, L.y + 8, L.z - 22), type: 'sentinel' },
      { pos: new THREE.Vector3(L.x + 6, L.y + 16, L.z - 52), type: 'sentinel' }, { pos: new THREE.Vector3(L.x - 34, L.y + 10, L.z - 34), type: 'sentinel' },
    ];
  }

  // ------------------------------------------------------------ sky, light, atmosphere
  buildSky() {
    const geo = new THREE.SphereGeometry(1400, 24, 16);
    this.skyU = { top: { value: new THREE.Color(0x3a78d8) }, horizon: { value: new THREE.Color(0xbfe4ff) }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, night: { value: 0 }, sunColor: { value: new THREE.Color(0xfff0c0) } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.skyU, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }',
      fragmentShader: /* glsl */`
        uniform vec3 top, horizon, sunDir, sunColor; uniform float night; varying vec3 vP;
        float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9,78.2,37.7))) * 43758.5); }
        void main(){
          float h = max(vP.y, 0.0);
          vec3 c = mix(horizon, top, pow(h, 0.55));
          // anime-style stepped gradient bands
          c = mix(c, floor(c * 14.0) / 14.0, 0.35);
          float sd = dot(normalize(vP), normalize(sunDir));
          c += sunColor * (smoothstep(0.9975, 0.999, sd) * 1.5 + pow(max(sd, 0.0), 32.0) * 0.25) * (1.0 - night);
          // moon
          c += vec3(0.9, 0.95, 1.0) * smoothstep(0.9985, 0.9992, dot(normalize(vP), -normalize(sunDir))) * night;
          // stars
          vec3 q = floor(vP * 300.0);
          float s = step(0.9975, hash(q)) * night * smoothstep(0.0, 0.3, vP.y);
          c += vec3(s);
          if (vP.y < 0.0) c = mix(horizon, horizon * 0.6, min(-vP.y * 3.0, 1.0));
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(geo, mat); this.sky.renderOrder = -10; this.sky.frustumCulled = false;
    this.scene.add(this.sky);
    // blocky clouds
    const cb = new Batch(); const r = this.r;
    for (let i = 0; i < 70; i++) {
      const x = (r() - 0.5) * 2400, z = (r() - 0.5) * 2400, y = 230 + r() * 80;
      for (let k = 0; k < 4 + r() * 4; k++) cb.box(x + (r() - 0.5) * 50, y + r() * 8, z + (r() - 0.5) * 30, 18 + r() * 30, 6 + r() * 8, 14 + r() * 20, 0xffffff, { jitter: 3, shade: 0.04 });
    }
    this.clouds = cb.build(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, fog: false }), { castShadow: false, receiveShadow: false });
    this.scene.add(this.clouds);
    // lights
    this.sun = new THREE.DirectionalLight(0xfff2d8, 2.4);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 300;
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun); this.scene.add(this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xcfe8ff, 0x5a6a3a, 1.1); this.scene.add(this.hemi);
    this.scene.fog = new THREE.Fog(0xbfe4ff, 80, 700);
  }

  /** Region name + key for music/ambience/tint at a position. */
  regionAt(p) {
    if (this.interior === 'dungeon') return { key: 'dungeon', name: 'Ruins of the First Cycle — Depths' };
    if (this.interior === 'cave') return { key: 'cave', name: '??? — Forgotten Hollow' };
    if (this.interior === 'throne') return { key: 'throne', name: 'Throne of Eternity' };
    if (p.y > LOC.islands.y - 30) return { key: 'sky', name: 'Floating Isles of Aster' };
    const d = (L, k = 1) => Math.hypot(p.x - L.x, p.z - L.z) < L.r * k;
    if (d(LOC.city, 1.15)) return { key: 'city', name: 'Royal Capital Astera' };
    if (d(LOC.village, 1.2)) return { key: 'village', name: 'Elmbrook Village' };
    if (d(LOC.demonCastle, 1.4)) return { key: 'demon', name: 'Castle of the Demon General' };
    if (d(LOC.ruins, 1.3)) return { key: 'ruins', name: 'Ruins of the First Cycle' };
    if (d(LOC.fort, 1.6)) return { key: 'mountain', name: 'Ironspine Watch' };
    const b = biomeAt(p.x, p.z);
    if (b.demon > 0.5) return { key: 'demon', name: 'Demon Territory — Ashen Maw' };
    if (b.desert > 0.5) return { key: 'desert', name: 'Sun Scar Desert' };
    if (b.snowZone > 0.5) return { key: 'snow', name: 'Frostveil Wastes' };
    if (b.mountain > 0.5) return { key: 'mountain', name: 'Ironspine Mountains' };
    if (d(LOC.forest, 1.15)) return { key: 'forest', name: 'Whisperwood Forest' };
    return { key: 'forest', name: 'Verdant Plains' };
  }

  /** hours: 0..24. Region tint blends fog/sky. */
  updateAtmosphere(hours, playerPos, region, dt) {
    const sunAng = (hours - 6) / 24 * Math.PI * 2; // 6h sunrise, 18h sunset
    const sy = Math.sin(sunAng), sx = Math.cos(sunAng);
    const day = smooth(clamp(sy * 3 + 0.3, 0, 1));
    const dusk = clamp(1 - Math.abs(sy) * 4, 0, 1) * (sy > -0.2 ? 1 : 0);
    const sunDir = new THREE.Vector3(sx * 0.8, Math.max(sy, -0.3), 0.45).normalize();
    this.skyU.sunDir.value.copy(sunDir);
    this.skyU.night.value = 1 - day;
    const P = {
      top: new THREE.Color(0x2f6fd6), hor: new THREE.Color(0xc4e6ff), fogNear: 90, fogFar: 650,
    };
    const tints = {
      desert: [0xd99a4a, 0xffd9a0, 80, 520], snow: [0x7aa6d8, 0xe8f2ff, 40, 330], demon: [0x3a0a1a, 0xa83a3a, 40, 340], ruins: [0x4a7ab8, 0xcfe0d0, 70, 500],
      sky: [0x4a8af0, 0xffffff, 120, 900], mountain: [0x4a7ad0, 0xd0e4f4, 80, 600], city: [0x3a78d8, 0xd4ecff, 100, 700],
    };
    const tk = tints[region];
    if (tk) { P.top.lerp(new THREE.Color(tk[0]), 0.6); P.hor.lerp(new THREE.Color(tk[1]), 0.6); P.fogNear = tk[2]; P.fogFar = tk[3]; }
    const nightTop = new THREE.Color(0x060a1c), nightHor = new THREE.Color(0x1a2448);
    if (region === 'demon') { nightTop.set(0x14030a); nightHor.set(0x3a0a12); }
    const duskHor = new THREE.Color(0xff9a5a);
    const top = P.top.clone().lerp(nightTop, 1 - day);
    const hor = P.hor.clone().lerp(duskHor, dusk * 0.6).lerp(nightHor, 1 - day);
    const k = 1 - Math.exp(-dt * 1.5);
    this.skyU.top.value.lerp(top, k); this.skyU.horizon.value.lerp(hor, k);
    if (this.interior) {
      this.scene.fog.color.set(0x07060c); this.scene.fog.near = 10; this.scene.fog.far = 90;
      this.sky.visible = false; this.clouds.visible = false;
      const tint = { dungeon: [0xa8d0f4, 0x3a4a5a, 1.6], cave: [0xc8a8f8, 0x403050, 1.5], throne: [0xd0b0ff, 0x4a2a50, 1.9] }[this.interior] || [0x8090c0, 0x201a28, 0.6];
      this.sun.intensity = this.interior === 'throne' ? 1.6 : 0.35; this.hemi.intensity = tint[2]; this.hemi.color.set(tint[0]); this.hemi.groundColor.set(tint[1]);
    } else {
      this.sky.visible = true; this.clouds.visible = true;
      this.scene.fog.color.copy(this.skyU.horizon.value);
      this.scene.fog.near = lerp(this.scene.fog.near, P.fogNear * (0.6 + day * 0.4), k); this.scene.fog.far = lerp(this.scene.fog.far, P.fogFar * (0.55 + day * 0.45), k);
      this.sun.intensity = 0.25 + day * 2.4;
      this.sun.color.set(0xfff2d8).lerp(new THREE.Color(0xff9a5a), dusk * 0.7).lerp(new THREE.Color(0x8aa0ff), 1 - day);
      this.hemi.intensity = 0.45 + day * 0.75;
      this.hemi.color.set(0xcfe8ff).lerp(new THREE.Color(0x4a5a9a), 1 - day);
      this.hemi.groundColor.set(region === 'demon' ? 0x5a1a2a : region === 'snow' ? 0x9aaac0 : 0x5a6a3a);
    }
    // sun follows the player for crisp shadows (moon light at night uses opposite dir)
    const ld = day > 0.1 ? sunDir : sunDir.clone().multiplyScalar(-1).setY(0.6).normalize();
    this.sun.position.copy(playerPos).addScaledVector(ld, 120);
    this.sun.target.position.copy(playerPos);
    this.sky.position.copy(playerPos);
    this.clouds.position.x = (this.clouds.position.x + dt * 2) % 600;
    return { day, dusk };
  }

  // ------------------------------------------------------------ build all
  build(progress = () => {}) {
    buildHeights(); progress('Raising terrain…');
    this.terrain = buildTerrainMeshes(this.scene);
    this.buildSky();
    this.buildForest(); progress('Growing forests…');
    this.buildVillage(); this.buildCity(); progress('Building kingdoms…');
    this.buildRuins(); this.buildDesert(); this.buildMountains(); this.buildSnow(); this.buildDemon(); progress('Corrupting the demon lands…');
    this.buildSkyStone(); this.buildWaystones(); this.buildTreasure();
    for (const [, b] of this.batches) { const m = b.build(); if (m) this.scene.add(m); }
    this.batches.clear();
    // interiors use their own batches
    this.buildDungeon(); this.buildCave(); this.buildIslands();
    // lava glow particles anchors
    this.lavaSpots = this.terrain.lavaSpots;
  }
  update(t, dt) { for (const f of this.animated) f(t, dt); }
  surface(p) { if (this.interior) return 'stone'; if (p.y > LOC.islands.y - 30) return 'grass'; return surfaceAt(p.x, p.z); }
}

export { terrainHeight, WORLD };
