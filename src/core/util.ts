// Small math helpers + deterministic RNG + value noise used across modules.

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const damp = (a: number, b: number, lambda: number, dt: number) => lerp(a, b, 1 - Math.exp(-lambda * dt));

/** Shortest signed angle from a to b. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
export function dampAngle(a: number, b: number, lambda: number, dt: number): number {
  return a + angleDelta(a, b) * (1 - Math.exp(-lambda * dt));
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

export function valueNoise(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = smooth(xf), v = smooth(yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

export function fbm(x: number, y: number, oct = 4, seed = 0): number {
  let amp = 0.5, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) {
    s += valueNoise(x * f, y * f, seed + i * 17) * amp;
    n += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return s / n;
}

/** Tileable value noise on a period grid (for seamless textures). */
export function tileNoise(x: number, y: number, period: number, seed = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = smooth(xf), v = smooth(yf);
  const m = (n: number) => ((n % period) + period) % period;
  const a = hash2(m(xi), m(yi), seed), b = hash2(m(xi + 1), m(yi), seed);
  const c = hash2(m(xi), m(yi + 1), seed), d = hash2(m(xi + 1), m(yi + 1), seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}
export function tileFbm(x: number, y: number, period: number, oct = 4, seed = 0): number {
  let amp = 0.5, f = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) {
    s += tileNoise(x * f, y * f, period * f, seed + i * 31) * amp;
    n += amp;
    amp *= 0.5;
    f *= 2;
  }
  return s / n;
}

export const isTouchDevice = () =>
  typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
