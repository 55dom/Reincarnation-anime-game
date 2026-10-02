// Chunky geometry builder. Accumulates rough, hand-made looking primitives (jittered boxes,
// prisms, low-poly cylinders...) with per-face color, then merges them into a few big meshes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { envMaterial } from '../render/toon.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _c = new THREE.Color();

function hash3(x, y, z) {
  let h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

export class Batch {
  constructor() { this.geos = []; }
  /**
   * Add a geometry transformed and colored. opts: x,y,z, rx,ry,rz, sx,sy,sz, color, jitter, shade (random tint)
   */
  add(geo, o = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0);
    _q.setFromEuler(_e);
    _s.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
    _p.set(o.x || 0, o.y || 0, o.z || 0);
    _m.compose(_p, _q, _s);
    g.applyMatrix4(_m);
    const pos = g.attributes.position;
    const j = o.jitter ?? 0.08;
    if (j > 0) {
      // position-hashed jitter keeps shared corners welded so faces never crack apart
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const kx = Math.round(x * 50) / 50, ky = Math.round(y * 50) / 50, kz = Math.round(z * 50) / 50;
        pos.setXYZ(i, x + (hash3(kx, ky, kz) - 0.5) * j, y + (hash3(ky, kz, kx) - 0.5) * j * 0.7, z + (hash3(kz, kx, ky) - 0.5) * j);
      }
    }
    // per-face flat color with slight random variation
    const colors = new Float32Array(pos.count * 3);
    const base = _c.set(o.color ?? 0xffffff);
    const br = base.r, bg = base.g, bb = base.b;
    const shade = o.shade ?? 0.08;
    const topColor = o.top != null ? new THREE.Color(o.top) : null;
    for (let i = 0; i < pos.count; i += 3) {
      const v = 1 + (Math.random() - 0.5) * shade * 2;
      let r = br, gg = bg, b = bb;
      if (topColor) {
        // faces pointing up get the top color (grass on cliffs, snow on roofs)
        const ay = pos.getY(i + 1) - pos.getY(i), az = pos.getZ(i + 1) - pos.getZ(i), ax = pos.getX(i + 1) - pos.getX(i);
        const by = pos.getY(i + 2) - pos.getY(i), bz = pos.getZ(i + 2) - pos.getZ(i), bx = pos.getX(i + 2) - pos.getX(i);
        const ny = az * bx - ax * bz; const nl = Math.hypot(ay * bz - az * by, ny, ax * by - ay * bx) || 1;
        if (ny / nl > 0.6) { r = topColor.r; gg = topColor.g; b = topColor.b; }
      }
      for (let k = 0; k < 3; k++) { colors[(i + k) * 3] = r * v; colors[(i + k) * 3 + 1] = gg * v; colors[(i + k) * 3 + 2] = b * v; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'color') g.deleteAttribute(name);
    this.geos.push(g);
    return this;
  }
  box(x, y, z, w, h, d, color, o = {}) { return this.add(BOX, { ...o, x, y, z, sx: w, sy: h, sz: d, color, jitter: o.jitter ?? Math.min(w, h, d) * 0.12 }); }
  /** Box sitting on y (bottom at y). */
  block(x, y, z, w, h, d, color, o = {}) { return this.box(x, y + h / 2, z, w, h, d, color, o); }
  prism(x, y, z, w, h, d, color, o = {}) { return this.add(PRISM, { ...o, x, y, z, sx: w, sy: h, sz: d, color, jitter: o.jitter ?? 0.1 }); }
  cyl(x, y, z, r, h, color, o = {}) { return this.add(o.seg === 8 ? CYL8 : CYL6, { ...o, x, y: y + h / 2, z, sx: r, sy: h, sz: r, color, jitter: o.jitter ?? r * 0.15 }); }
  cone(x, y, z, r, h, color, o = {}) { return this.add(o.seg === 4 ? CONE4 : CONE6, { ...o, x, y: y + h / 2, z, sx: r, sy: h, sz: r, color, jitter: o.jitter ?? r * 0.15 }); }
  rock(x, y, z, s, color, o = {}) { return this.add(ROCK, { ...o, x, y, z, sx: s * (o.ax || 1), sy: s * (o.ay || 0.8), sz: s * (o.az || 1), color, jitter: o.jitter ?? s * 0.35, ry: o.ry ?? Math.random() * 6 }); }
  ico(x, y, z, s, color, o = {}) { return this.add(ICO, { ...o, x, y, z, sx: s, sy: s * (o.ay || 1), sz: s, color, jitter: o.jitter ?? s * 0.2 }); }
  build(material = envMaterial(), { castShadow = true, receiveShadow = true } = {}) {
    if (!this.geos.length) return null;
    const g = mergeGeometries(this.geos, false);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    this.geos = [];
    const mesh = new THREE.Mesh(g, material);
    mesh.castShadow = castShadow; mesh.receiveShadow = receiveShadow;
    return mesh;
  }
}

const BOX = new THREE.BoxGeometry(1, 1, 1);
const PRISM = (() => { // triangular roof prism, ridge along X (outward CCW winding)
  const A = [-0.5, -0.5, -0.5], B = [0.5, -0.5, -0.5], C = [0.5, -0.5, 0.5], D = [-0.5, -0.5, 0.5], E = [-0.5, 0.5, 0], F = [0.5, 0.5, 0];
  const tris = [A, E, F, A, F, B, D, C, F, D, F, E, A, D, E, B, F, C, A, B, C, A, C, D];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
  return g;
})();
const CYL6 = new THREE.CylinderGeometry(1, 1, 1, 6);
const CYL8 = new THREE.CylinderGeometry(1, 1, 1, 8);
const CONE6 = new THREE.ConeGeometry(1, 1, 6);
const CONE4 = new THREE.ConeGeometry(1, 1, 4);
const ROCK = new THREE.DodecahedronGeometry(1, 0);
const ICO = new THREE.IcosahedronGeometry(1, 0);

export const GEO = { BOX, PRISM, CYL6, CYL8, CONE6, CONE4, ROCK, ICO };
