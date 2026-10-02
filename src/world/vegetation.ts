// Instanced dry grass tufts (vertex wind), the twisted Ashthorn tree species (canopy wind) and rocks.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { heightAt, pathMask, SITES, FORT_RADIUS, WORLD_SIZE } from './layout';
import { addWind } from './terrain';
import { mulberry32, fbm } from '../core/util';
import { mat } from '../render/materials';
import type { Collision } from './collision';

function tuftGeometry(): THREE.BufferGeometry {
  const blades: THREE.BufferGeometry[] = [];
  const rnd = mulberry32(5);
  for (let i = 0; i < 7; i++) {
    const h = 0.35 + rnd() * 0.35, w = 0.05 + rnd() * 0.03;
    const g = new THREE.BufferGeometry();
    const lean = (rnd() - 0.5) * 0.3;
    const verts = new Float32Array([
      -w, 0, 0, w, 0, 0, w * 0.5 + lean * 0.5, h * 0.55, 0,
      -w, 0, 0, w * 0.5 + lean * 0.5, h * 0.55, 0, -w * 0.5 + lean * 0.5, h * 0.55, 0,
      -w * 0.5 + lean * 0.5, h * 0.55, 0, w * 0.5 + lean * 0.5, h * 0.55, 0, lean, h, 0,
    ]);
    g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    // Vertex colour: dark root -> pale sun-bleached tip
    const col = new Float32Array(27);
    for (let v = 0; v < 9; v++) {
      const t = verts[v * 3 + 1] / h;
      col[v * 3] = 0.45 + t * 0.5; col[v * 3 + 1] = 0.36 + t * 0.4; col[v * 3 + 2] = 0.18 + t * 0.2;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.rotateY(rnd() * Math.PI);
    g.translate((rnd() - 0.5) * 0.15, 0, (rnd() - 0.5) * 0.15);
    blades.push(g);
  }
  const m = mergeGeometries(blades)!;
  m.computeVertexNormals();
  // Point normals up so cards light like a tuft, not like flat planes
  const n = m.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i) * 0.3, 0.9, n.getZ(i) * 0.3);
  return m;
}

export function buildGrass(scene: THREE.Scene, density: number) {
  const geo = tuftGeometry();
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, color: 0xe8d8a0 });
  addWind(material, 0.35, 2.2);
  const chunk = 80;
  const half = WORLD_SIZE / 2 - 60;
  const rnd = mulberry32(12);
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  let total = 0;
  for (let cx = -half; cx < half; cx += chunk) {
    for (let cz = -half; cz < half; cz += chunk) {
      const mats: THREE.Matrix4[] = [];
      const cols: THREE.Color[] = [];
      const tries = Math.floor(chunk * chunk * 0.09 * density);
      for (let i = 0; i < tries; i++) {
        const x = cx + rnd() * chunk, z = cz + rnd() * chunk;
        const dc = Math.hypot(x, z);
        if (dc < 50) continue;
        if (pathMask(x, z) > 0.2) continue;
        if (Math.hypot(x - SITES.fort.x, z - SITES.fort.z) < FORT_RADIUS + 4) continue;
        const scrub = Math.max(0, 1 - Math.hypot(x - SITES.scrub.x, z - SITES.scrub.z) / 110);
        const patch = fbm(x * 0.03, z * 0.03, 3, 4);
        if (patch < 0.52 - scrub * 0.35) continue;
        const y = heightAt(x, z);
        dummy.position.set(x, y - 0.03, z);
        dummy.rotation.set(0, rnd() * Math.PI * 2, 0);
        dummy.scale.setScalar(0.7 + rnd() * 0.8 + scrub * 0.4);
        dummy.updateMatrix();
        mats.push(dummy.matrix.clone());
        color.setRGB(0.9 + rnd() * 0.2 - scrub * 0.2, 0.85 + rnd() * 0.15 + scrub * 0.05, 0.7 + scrub * 0.1);
        cols.push(color.clone());
      }
      if (!mats.length) continue;
      const im = new THREE.InstancedMesh(geo, material, mats.length);
      mats.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, cols[i]); });
      im.computeBoundingSphere();
      im.receiveShadow = true;
      scene.add(im);
      total += mats.length;
    }
  }
  return total;
}

/** Twisted Ashthorn: spiralling trunk tube, forked limbs, clumped faceted canopy. */
function ashthornVariant(seed: number) {
  const rnd = mulberry32(seed);
  const trunkParts: THREE.BufferGeometry[] = [];
  const leafParts: THREE.BufferGeometry[] = [];
  const pts: THREE.Vector3[] = [];
  const H = 4.5 + rnd() * 2.5;
  let tw = rnd() * 6;
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    tw += 0.7;
    pts.push(new THREE.Vector3(Math.sin(tw) * 0.35 * t + t * t * (rnd() - 0.5) * 1.5, t * H, Math.cos(tw) * 0.35 * t));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const trunk = new THREE.TubeGeometry(curve, 10, 0.28, 6, false);
  // taper
  const tp = trunk.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < tp.count; i++) {
    const y = tp.getY(i) / H;
    const c = curve.getPointAt(Math.min(1, Math.max(0, y)));
    const k = 1.25 - y * 0.85;
    tp.setX(i, c.x + (tp.getX(i) - c.x) * k);
    tp.setZ(i, c.z + (tp.getZ(i) - c.z) * k);
  }
  trunk.computeVertexNormals();
  trunkParts.push(trunk);
  // Root flare
  const flare = new THREE.ConeGeometry(0.6, 0.8, 6);
  flare.translate(0, 0.3, 0);
  trunkParts.push(flare);
  const branches = 3 + Math.floor(rnd() * 2);
  for (let b = 0; b < branches; b++) {
    const start = curve.getPointAt(0.55 + rnd() * 0.35);
    const a = rnd() * Math.PI * 2;
    const len = 1.4 + rnd() * 1.2;
    const end = start.clone().add(new THREE.Vector3(Math.cos(a) * len, 0.6 + rnd() * 0.8, Math.sin(a) * len));
    const mid = start.clone().lerp(end, 0.5).add(new THREE.Vector3(0, 0.4, 0));
    const bc = new THREE.QuadraticBezierCurve3(start, mid, end);
    const bg = new THREE.TubeGeometry(bc, 5, 0.1, 5, false);
    trunkParts.push(bg);
    // Canopy clump at branch end
    for (let k = 0; k < 3; k++) {
      const cg = new THREE.IcosahedronGeometry(0.8 + rnd() * 0.6, 0);
      cg.scale(1.2, 0.6, 1.2);
      cg.translate(end.x + (rnd() - 0.5) * 0.8, end.y + rnd() * 0.4, end.z + (rnd() - 0.5) * 0.8);
      leafParts.push(cg);
    }
  }
  const top = curve.getPointAt(1);
  for (let k = 0; k < 3; k++) {
    const cg = new THREE.IcosahedronGeometry(1.0 + rnd() * 0.5, 0);
    cg.scale(1.3, 0.65, 1.3);
    cg.translate(top.x + (rnd() - 0.5), top.y + rnd() * 0.5, top.z + (rnd() - 0.5));
    leafParts.push(cg);
  }
  const t = mergeGeometries(trunkParts.map((g) => g.index ? g.toNonIndexed() : g))!;
  const l = mergeGeometries(leafParts.map((g) => g.index ? g.toNonIndexed() : g))!;
  t.computeVertexNormals(); l.computeVertexNormals();
  return { trunk: t, leaves: l };
}

export function buildTrees(scene: THREE.Scene, col: Collision) {
  const variants = [ashthornVariant(1), ashthornVariant(2), ashthornVariant(3)];
  const barkM = mat('bark', 0xb08a74);
  const leafM = new THREE.MeshStandardMaterial({ color: 0xc0743a, roughness: 0.9, flatShading: true });
  addWind(leafM, 0.06, 0.6);
  const barkW = barkM.clone();
  addWind(barkW, 0.012, 0.6);
  const rnd = mulberry32(77);
  const placements: THREE.Matrix4[][] = [[], [], []];
  const dummy = new THREE.Object3D();
  const place = (x: number, z: number, s: number) => {
    if (pathMask(x, z) > 0.05 || Math.hypot(x, z) < 54) return;
    const y = heightAt(x, z);
    dummy.position.set(x, y - 0.2, z);
    dummy.rotation.set(0, rnd() * Math.PI * 2, 0);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    placements[Math.floor(rnd() * 3)].push(dummy.matrix.clone());
    col.addCyl(x, z, 0.35 * s, y - 1, y + 4 * s);
  };
  // Grove at the scrub (hunt grounds) + scattered lone trees across the marches
  for (let i = 0; i < 70; i++) {
    const a = rnd() * Math.PI * 2, r = 12 + Math.sqrt(rnd()) * 70;
    place(SITES.scrub.x + Math.cos(a) * r, SITES.scrub.z + Math.sin(a) * r, 0.8 + rnd() * 0.5);
  }
  for (let i = 0; i < 40; i++) {
    const x = (rnd() - 0.5) * 480, z = (rnd() - 0.5) * 480;
    if (Math.hypot(x - SITES.fort.x, z - SITES.fort.z) < 60) continue;
    place(x, z, 0.7 + rnd() * 0.4);
  }
  // A few by the gate camp and tower
  place(SITES.gateCamp.x + 5, SITES.gateCamp.z + 4, 0.9);
  place(SITES.tower.x + 12, SITES.tower.z - 6, 1.0);
  variants.forEach((v, i) => {
    const n = placements[i].length;
    if (!n) return;
    const it = new THREE.InstancedMesh(v.trunk, barkW, n);
    const il = new THREE.InstancedMesh(v.leaves, leafM, n);
    placements[i].forEach((m, k) => { it.setMatrixAt(k, m); il.setMatrixAt(k, m); });
    it.castShadow = il.castShadow = true;
    it.receiveShadow = il.receiveShadow = true;
    it.computeBoundingSphere(); il.computeBoundingSphere();
    scene.add(it, il);
  });
}

export function buildRocks(scene: THREE.Scene, col: Collision) {
  const rnd = mulberry32(31);
  const base = new THREE.DodecahedronGeometry(1, 0);
  const p = base.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.8 + Math.abs(Math.sin(i * 1.3)) * 0.4), p.getY(i) * 0.7, p.getZ(i) * (0.9 + Math.abs(Math.cos(i * 2.1)) * 0.3));
  base.computeVertexNormals();
  const m = mat('stone', 0x9a6a50, { flat: true });
  const mats: THREE.Matrix4[] = [];
  const d = new THREE.Object3D();
  for (let i = 0; i < 160; i++) {
    const x = (rnd() - 0.5) * 520, z = (rnd() - 0.5) * 520;
    if (Math.hypot(x, z) < 60 || pathMask(x, z) > 0.05) continue;
    if (Math.hypot(x - SITES.fort.x, z - SITES.fort.z) < FORT_RADIUS + 8) continue;
    const s = 0.5 + rnd() * rnd() * 3;
    const y = heightAt(x, z);
    d.position.set(x, y - s * 0.25, z);
    d.rotation.set(rnd(), rnd() * 6, rnd() * 0.3);
    d.scale.set(s, s * (0.6 + rnd() * 0.6), s);
    d.updateMatrix();
    mats.push(d.matrix.clone());
    if (s > 0.9) col.addCyl(x, z, s * 0.8, y - 2, y + s * 0.6);
  }
  const im = new THREE.InstancedMesh(base, m, mats.length);
  mats.forEach((mm, i) => im.setMatrixAt(i, mm));
  im.castShadow = true; im.receiveShadow = true;
  im.computeBoundingSphere();
  scene.add(im);
}
