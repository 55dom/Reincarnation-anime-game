// Procedural painted textures + matching normal maps, generated on canvas at boot.
// Everything is code-generated: no external image assets.
import * as THREE from 'three';
import { tileFbm, mulberry32 } from '../core/util';

export interface PaintedSet { map: THREE.Texture; normalMap: THREE.Texture }

type Painter = (u: number, v: number) => { h: number; r: number; g: number; b: number };

function makeSet(size: number, painter: Painter, normalStrength = 2.0, repeat = 1): PaintedSet {
  const cols = document.createElement('canvas');
  cols.width = cols.height = size;
  const ctx = cols.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const p = painter(x / size, y / size);
      const i = y * size + x;
      heights[i] = p.h;
      img.data[i * 4] = Math.max(0, Math.min(255, p.r * 255));
      img.data[i * 4 + 1] = Math.max(0, Math.min(255, p.g * 255));
      img.data[i * 4 + 2] = Math.max(0, Math.min(255, p.b * 255));
      img.data[i * 4 + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const nc = document.createElement('canvas');
  nc.width = nc.height = size;
  const nctx = nc.getContext('2d')!;
  const nimg = nctx.createImageData(size, size);
  const H = (x: number, y: number) => heights[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * normalStrength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * normalStrength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      nimg.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      nimg.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      nimg.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      nimg.data[i + 3] = 255;
    }
  }
  nctx.putImageData(nimg, 0, 0);

  const map = new THREE.CanvasTexture(cols);
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = new THREE.CanvasTexture(nc);
  for (const t of [map, normalMap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = 4;
    t.generateMipmaps = true;
  }
  return { map, normalMap };
}

const cache = new Map<string, PaintedSet>();
function cached(key: string, f: () => PaintedSet) {
  let s = cache.get(key);
  if (!s) { s = f(); cache.set(key, s); }
  return s;
}

/** Sand: ripples + grains, warm red-gold. */
export const sandTex = () => cached('sand', () => makeSet(256, (u, v) => {
  const n = tileFbm(u * 8, v * 8, 8, 4, 3);
  const ripple = Math.sin((v * 22 + tileFbm(u * 4, v * 4, 4, 2, 9) * 6) * Math.PI * 2) * 0.5 + 0.5;
  const grain = tileFbm(u * 64, v * 64, 64, 1, 5);
  const h = ripple * 0.18 + n * 0.5 + grain * 0.2;
  const t = n * 0.55 + ripple * 0.06 + grain * 0.2;
  return { h, r: 0.7 + t * 0.22, g: 0.42 + t * 0.16, b: 0.27 + t * 0.1 };
}, 1.6));

/** Packed road dirt with stones. */
export const pathTex = () => cached('path', () => makeSet(256, (u, v) => {
  const n = tileFbm(u * 6, v * 6, 6, 5, 11);
  const stones = Math.max(0, tileFbm(u * 18, v * 18, 18, 2, 12) - 0.58) * 4;
  const h = n * 0.5 + stones;
  const t = n * 0.7 + stones * 0.4;
  return { h, r: 0.45 + t * 0.25, g: 0.3 + t * 0.17, b: 0.2 + t * 0.12 };
}, 3.0));

/** Sun-baked plaster / sandstone blocks. */
export const stoneTex = () => cached('stone', () => makeSet(256, (u, v) => {
  const row = Math.floor(v * 4);
  const off = (row % 2) * 0.5;
  const bu = (u * 2 + off) % 1, bv = (v * 4) % 1;
  const mortar = Math.min(bu, 1 - bu) * 2 < 0.03 || Math.min(bv, 1 - bv) * 4 < 0.08 ? 1 : 0;
  const n = tileFbm(u * 10, v * 10, 10, 4, 21);
  const chip = tileFbm(u * 40, v * 40, 40, 2, 22);
  const h = mortar ? 0.1 : 0.6 + n * 0.3 + chip * 0.1;
  const t = n * 0.6 + chip * 0.3;
  const m = mortar ? 0.7 : 1;
  return { h, r: (0.74 + t * 0.2) * m, g: (0.64 + t * 0.17) * m, b: (0.52 + t * 0.14) * m };
}, 2.5));

/** Dark weathered timber. */
export const woodTex = () => cached('wood', () => makeSet(256, (u, v) => {
  const g = tileFbm(u * 2, v * 24, 2, 4, 31);
  const streak = Math.sin((u * 30 + g * 8) * Math.PI) * 0.5 + 0.5;
  const h = streak * 0.6 + g * 0.4;
  const t = streak * 0.3 + g * 0.5;
  return { h, r: 0.32 + t * 0.2, g: 0.2 + t * 0.12, b: 0.12 + t * 0.07 };
}, 2.0));

/** Woven cloth, tinted later with material color (kept light). */
export const clothTex = () => cached('cloth', () => makeSet(128, (u, v) => {
  const weave = (Math.sin(u * 128 * Math.PI) * Math.sin(v * 128 * Math.PI)) * 0.5 + 0.5;
  const n = tileFbm(u * 6, v * 6, 6, 3, 41);
  const dirt = tileFbm(u * 3, v * 3, 3, 3, 42);
  const h = weave * 0.5 + n * 0.3;
  const t = 0.75 + n * 0.2 - dirt * 0.2 + weave * 0.08;
  return { h, r: t, g: t * 0.97, b: t * 0.92 };
}, 1.5));

/** Leather with creases. */
export const leatherTex = () => cached('leather', () => makeSet(128, (u, v) => {
  const n = tileFbm(u * 8, v * 8, 8, 4, 51);
  const crease = Math.abs(tileFbm(u * 4, v * 4, 4, 3, 52) - 0.5) < 0.03 ? 1 : 0;
  const h = n * 0.6 - crease * 0.4;
  const t = 0.7 + n * 0.3 - crease * 0.25;
  return { h, r: t, g: t * 0.92, b: t * 0.85 };
}, 2.0));

/** Brushed / pitted metal. */
export const metalTex = () => cached('metal', () => makeSet(128, (u, v) => {
  const brush = tileFbm(u * 1, v * 64, 1, 2, 61);
  const pit = tileFbm(u * 20, v * 20, 20, 2, 62);
  const h = brush * 0.4 + (pit > 0.7 ? -0.3 : 0);
  const t = 0.75 + brush * 0.2 - (pit > 0.72 ? 0.25 : 0);
  return { h, r: t, g: t, b: t * 0.98 };
}, 1.5));

/** Fur, directional strands. */
export const furTex = () => cached('fur', () => makeSet(128, (u, v) => {
  const strand = tileFbm(u * 48, v * 4, 48, 2, 71);
  const patch = tileFbm(u * 3, v * 3, 3, 3, 72);
  const h = strand;
  const t = 0.6 + strand * 0.35 + patch * 0.15;
  return { h, r: t, g: t * 0.95, b: t * 0.9 };
}, 2.5));

/** Bark for twisted trees. */
export const barkTex = () => cached('bark', () => makeSet(128, (u, v) => {
  const ridge = Math.abs(Math.sin((u * 10 + tileFbm(u * 2, v * 6, 2, 3, 81) * 3) * Math.PI));
  const n = tileFbm(u * 12, v * 12, 12, 2, 82);
  const h = ridge * 0.7 + n * 0.3;
  const t = ridge * 0.35 + n * 0.3;
  return { h, r: 0.22 + t * 0.2, g: 0.15 + t * 0.12, b: 0.1 + t * 0.08 };
}, 3.0));

/** Skin, subtle mottling. */
export const skinTex = () => cached('skin', () => makeSet(64, (u, v) => {
  const n = tileFbm(u * 6, v * 6, 6, 3, 91);
  const t = 0.92 + n * 0.08;
  return { h: n * 0.2, r: t, g: t * 0.97, b: t * 0.95 };
}, 0.8));

/** Soft round blob used for footprints/telegraphs/glows. */
export function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, inner);
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Boot-print shaped alpha decal. */
export function footprintTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(0,0,0,0)';
  g.fillRect(0, 0, 64, 128);
  g.fillStyle = 'rgba(40,20,10,0.9)';
  g.beginPath(); g.ellipse(32, 40, 18, 30, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(32, 98, 14, 20, 0, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  return t;
}

export function pawprintTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(40,20,10,0.9)';
  g.beginPath(); g.ellipse(32, 40, 12, 10, 0, 0, Math.PI * 2); g.fill();
  const rnd = mulberry32(4);
  for (let i = 0; i < 4; i++) {
    const a = -Math.PI * 0.8 + i * 0.53;
    g.beginPath(); g.ellipse(32 + Math.cos(a) * 18, 36 + Math.sin(a) * 18, 5 + rnd(), 6, a, 0, Math.PI * 2); g.fill();
  }
  return new THREE.CanvasTexture(c);
}
