// Static collision: axis-aligned boxes (optionally yaw-rotated) and vertical cylinders on top of the height field.
// Used by the character mover and by the camera spring-arm to avoid clipping through walls.
import * as THREE from 'three';
import { heightAt } from './layout';

export interface Box { cx: number; cz: number; hx: number; hz: number; y0: number; y1: number; cos: number; sin: number; walkable: boolean }
export interface Cyl { x: number; z: number; r: number; y0: number; y1: number }

export class Collision {
  boxes: Box[] = [];
  cyls: Cyl[] = [];
  private grid = new Map<number, (Box | Cyl)[]>();
  private cell = 16;

  addBox(cx: number, cz: number, w: number, d: number, y0: number, y1: number, yaw = 0, walkable = false) {
    const b: Box = { cx, cz, hx: w / 2, hz: d / 2, y0, y1, cos: Math.cos(yaw), sin: Math.sin(yaw), walkable };
    this.boxes.push(b);
    const r = Math.hypot(b.hx, b.hz);
    this.insert(b, cx, cz, r);
    return b;
  }
  addCyl(x: number, z: number, r: number, y0: number, y1: number) {
    const c: Cyl = { x, z, r, y0, y1 };
    this.cyls.push(c);
    this.insert(c, x, z, r);
  }
  private key(ix: number, iz: number) { return ix * 73856093 ^ iz * 19349663; }
  private insert(o: Box | Cyl, x: number, z: number, r: number) {
    const c = this.cell;
    for (let ix = Math.floor((x - r) / c); ix <= Math.floor((x + r) / c); ix++)
      for (let iz = Math.floor((z - r) / c); iz <= Math.floor((z + r) / c); iz++) {
        const k = this.key(ix, iz);
        let l = this.grid.get(k);
        if (!l) { l = []; this.grid.set(k, l); }
        l.push(o);
      }
  }
  private near(x: number, z: number, r: number): Set<Box | Cyl> {
    const out = new Set<Box | Cyl>();
    const c = this.cell;
    for (let ix = Math.floor((x - r) / c); ix <= Math.floor((x + r) / c); ix++)
      for (let iz = Math.floor((z - r) / c); iz <= Math.floor((z + r) / c); iz++) {
        const l = this.grid.get(this.key(ix, iz));
        if (l) for (const o of l) out.add(o);
      }
    return out;
  }

  /** Ground height under a point: terrain or the top of a walkable box we're above. */
  groundAt(x: number, z: number, feetY = 1e9): number {
    let g = heightAt(x, z);
    for (const o of this.near(x, z, 0.5)) {
      if ('hx' in o && o.walkable) {
        const lx = (x - o.cx) * o.cos - (z - o.cz) * o.sin;
        const lz = (x - o.cx) * o.sin + (z - o.cz) * o.cos;
        if (Math.abs(lx) <= o.hx && Math.abs(lz) <= o.hz && o.y1 <= feetY + 0.45) g = Math.max(g, o.y1);
      }
    }
    return g;
  }

  /** Push a vertical capsule (x,z,radius, y range) out of all static colliders. Mutates pos. */
  resolve(pos: THREE.Vector3, radius: number, height: number) {
    const near = this.near(pos.x, pos.z, radius + 1);
    for (let iter = 0; iter < 2; iter++) {
      for (const o of near) {
        if (pos.y + height < o.y0 || pos.y > o.y1 - 0.01) continue;
        if ('hx' in o) {
          if (o.walkable && pos.y >= o.y1 - 0.45) continue;
          const dx = pos.x - o.cx, dz = pos.z - o.cz;
          // three.js yaw: local X = (cos, -sin), local Z = (sin, cos)
          const lx = dx * o.cos - dz * o.sin;
          const lz = dx * o.sin + dz * o.cos;
          const qx = Math.max(-o.hx, Math.min(o.hx, lx));
          const qz = Math.max(-o.hz, Math.min(o.hz, lz));
          const ex = lx - qx, ez = lz - qz;
          const d = Math.hypot(ex, ez);
          if (d >= radius) continue;
          if (d < 1e-5) {
            // Inside: push out along least penetration axis
            const px = o.hx - Math.abs(lx), pz = o.hz - Math.abs(lz);
            if (px < pz) { const wx = (Math.sign(lx) || 1) * (px + radius); pos.x += wx * o.cos; pos.z += -wx * o.sin; }
            else { const wz = (Math.sign(lz) || 1) * (pz + radius); pos.x += wz * o.sin; pos.z += wz * o.cos; }
            continue;
          }
          const push = radius - d;
          const nx = ex / d, nz = ez / d;
          pos.x += (nx * o.cos + nz * o.sin) * push;
          pos.z += (-nx * o.sin + nz * o.cos) * push;
        } else {
          const dx = pos.x - o.x, dz = pos.z - o.z;
          const d = Math.hypot(dx, dz);
          const min = radius + o.r;
          if (d < min && d > 1e-5) { pos.x += (dx / d) * (min - d); pos.z += (dz / d) * (min - d); }
        }
      }
    }
  }

  /** Ray march for camera: returns fraction [0..1] of the segment that is free. */
  raycast(from: THREE.Vector3, to: THREE.Vector3, pad = 0.25): number {
    let best = 1;
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    if (len < 1e-4) return 1;
    // terrain
    const steps = Math.ceil(len / 0.5);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = from.x + dir.x * t, y = from.y + dir.y * t, z = from.z + dir.z * t;
      if (y < heightAt(x, z) + 0.3) { best = Math.min(best, (i - 1) / steps); break; }
    }
    const mx = (from.x + to.x) / 2, mz = (from.z + to.z) / 2;
    for (const o of this.near(mx, mz, len / 2 + 1)) {
      if ('hx' in o) {
        // Transform to box space and slab-test against inflated box
        const ox = from.x - o.cx, oz = from.z - o.cz;
        const lox = ox * o.cos - oz * o.sin, loz = ox * o.sin + oz * o.cos;
        const ldx = dir.x * o.cos - dir.z * o.sin, ldz = dir.x * o.sin + dir.z * o.cos;
        const t = slab([lox, from.y, loz], [ldx, dir.y, ldz], [-o.hx - pad, o.y0 - pad, -o.hz - pad], [o.hx + pad, o.y1 + pad, o.hz + pad]);
        if (t !== null) best = Math.min(best, t);
      } else {
        // Cylinder approx as box
        const t = slab([from.x - o.x, from.y, from.z - o.z], [dir.x, dir.y, dir.z], [-o.r - pad, o.y0, -o.r - pad], [o.r + pad, o.y1 + pad, o.r + pad]);
        if (t !== null) best = Math.min(best, t);
      }
    }
    return best;
  }
}

function slab(o: number[], d: number[], mn: number[], mx: number[]): number | null {
  // Origin inside the (padded) box: ignore it, otherwise the camera would collapse onto the pivot.
  if (o[0] > mn[0] && o[0] < mx[0] && o[1] > mn[1] && o[1] < mx[1] && o[2] > mn[2] && o[2] < mx[2]) return null;
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-8) {
      if (o[i] < mn[i] || o[i] > mx[i]) return null;
    } else {
      let a = (mn[i] - o[i]) / d[i], b = (mx[i] - o[i]) / d[i];
      if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
      if (t0 > t1) return null;
    }
  }
  return t0;
}
