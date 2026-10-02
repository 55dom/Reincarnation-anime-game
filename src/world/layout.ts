// Authoritative layout of the Veyr Marches: site positions, roads, and the terrain height field.
// Everything that needs to stand on the ground (props, NPCs, spawns) queries heightAt().
import { fbm, smooth, clamp } from '../core/util';

export const WORLD_SIZE = 640;
export const CITY_RADIUS = 46;

export const SITES = {
  spawn: { x: 0, z: 60 },
  cityGate: { x: 0, z: 46 },
  guild: { x: 0, z: -18 },
  guildDoor: { x: 0, z: -9.6 },
  clerk: { x: 0, z: -22.6 },
  board: { x: -9.2, z: -18 },
  quartermaster: { x: 8.6, z: -15 },
  trainingYard: { x: 22, z: -18 },
  gateCamp: { x: 9, z: 64 },
  scrub: { x: 150, z: -120 },
  scrubCamp: { x: 118, z: -92 },
  rattlejaw: { x: 170, z: -150 },
  tower: { x: -150, z: 40 },
  fort: { x: 0, z: -230 },
  fortEntrance: { x: 0, z: -196 },
} as const;

export const FORT_RADIUS = 30;
export const FORT_DEPTH = 7;
export const CITY_H = 0;

/** Roads as polylines (x,z pairs). */
export const ROADS: [number, number][][] = [
  [[0, 40], [0, 70], [4, 110], [-6, 160], [0, 200]],
  [[0, 46], [0, -5]],
  [[4, 90], [50, 70], [100, -40], [118, -92], [150, -120]],
  [[-4, 80], [-60, 70], [-120, 50], [-150, 40]],
  [[0, -40], [0, -120], [0, -196]],
];

function distToSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number) {
  const dx = bx - ax, dz = bz - az;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

export function roadDistance(x: number, z: number): number {
  let d = 1e9;
  for (const r of ROADS) for (let i = 0; i < r.length - 1; i++) {
    d = Math.min(d, distToSeg(x, z, r[i][0], r[i][1], r[i + 1][0], r[i + 1][1]));
  }
  return d;
}

/** 0..1, 1 on the packed road surface. */
export function pathMask(x: number, z: number): number {
  const d = roadDistance(x, z);
  return 1 - smooth(clamp((d - 2.2) / 2.0, 0, 1));
}

function duneHeight(x: number, z: number): number {
  // Long wind-carved dune ridges + broad swells.
  const warp = fbm(x * 0.004, z * 0.004, 3, 7) * 60;
  const ridge = 1 - Math.abs(fbm((x + warp) * 0.012, (z * 0.6 + warp) * 0.012, 4, 3) * 2 - 1);
  const swell = fbm(x * 0.003, z * 0.003, 3, 11);
  return ridge * ridge * 9 + swell * 10 - 5;
}

const heightCache = new Map<number, number>();

export function heightAt(x: number, z: number): number {
  // Small cache keyed on quantized coords: AI and props hit the same spots constantly.
  const key = Math.round(x * 4) * 100003 + Math.round(z * 4);
  const c = heightCache.get(key);
  if (c !== undefined) return c;
  let h = duneHeight(x, z);

  // City plateau
  const dc = Math.hypot(x, z);
  const cityT = smooth(clamp((dc - CITY_RADIUS - 4) / 34, 0, 1));
  h = CITY_H + (h - CITY_H) * cityT;

  // Roads flatten toward a low, gentle surface
  const rd = roadDistance(x, z);
  const rt = smooth(clamp((rd - 3) / 10, 0, 1));
  const roadH = Math.min(h, fbm(x * 0.01, z * 0.01, 2, 5) * 3 - 0.5) * (dc < CITY_RADIUS + 10 ? 0 : 1);
  h = roadH + (h - roadH) * rt;

  // Flatten the scrub hunting ground a bit, and the tower knoll
  const ds = Math.hypot(x - SITES.scrub.x, z - SITES.scrub.z);
  h = h * (0.4 + 0.6 * smooth(clamp((ds - 30) / 60, 0, 1)));
  const dtw = Math.hypot(x - SITES.tower.x, z - SITES.tower.z);
  const towerH = 1.5;
  h = towerH + (h - towerH) * smooth(clamp((dtw - 14) / 20, 0, 1));

  // Sunken fort basin
  const df = Math.hypot(x - SITES.fort.x, z - SITES.fort.z);
  if (df < FORT_RADIUS + 26) {
    const floor = -FORT_DEPTH;
    const inner = smooth(clamp((df - FORT_RADIUS) / 24, 0, 1));
    h = floor + (h - floor) * inner;
  }
  // Ramp into the fort from the south road
  if (Math.abs(x - SITES.fort.x) < 4.5 && z > SITES.fort.z + FORT_RADIUS - 2 && z < SITES.fort.z + FORT_RADIUS + 26) {
    const t = clamp((z - (SITES.fort.z + FORT_RADIUS - 2)) / 28, 0, 1);
    const rampH = -FORT_DEPTH + t * (FORT_DEPTH - 0.5);
    const edge = smooth(clamp((Math.abs(x - SITES.fort.x) - 3) / 1.5, 0, 1));
    h = rampH + (h - rampH) * edge;
  }

  // Map edge: rising walls of dune so you cannot fall off
  const edgeD = Math.max(Math.abs(x), Math.abs(z));
  if (edgeD > WORLD_SIZE / 2 - 50) h += Math.pow((edgeD - (WORLD_SIZE / 2 - 50)) / 50, 2) * 40;

  if (heightCache.size > 400000) heightCache.clear();
  heightCache.set(key, h);
  return h;
}

export function normalAt(x: number, z: number): [number, number, number] {
  const e = 0.6;
  const dx = heightAt(x + e, z) - heightAt(x - e, z);
  const dz = heightAt(x, z + e) - heightAt(x, z - e);
  const l = Math.hypot(dx, 2 * e, dz);
  return [-dx / l, (2 * e) / l, -dz / l];
}
