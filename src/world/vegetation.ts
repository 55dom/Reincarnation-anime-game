// Instanced dry grass tufts (vertex wind), the twisted Ashthorn tree species (canopy wind) and rocks.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { heightAt, pathMask, fieldMask, SITES, FORT_RADIUS, WORLD_SIZE } from './layout';
import { addWind, windUniform, timeUniform, wetUniform } from './terrain';
import { mulberry32, fbm } from '../core/util';
import { mat } from '../render/materials';
import type { Collision } from './collision';

/** A tall tuft: blades of 3 segments (5 tris) with root-dark → sun-bleached tip colouring, plus a seed head. */
function tuftGeometry(seed: number, blades: number, hMin: number, hMax: number, segs = 3, spread = 0.55): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const rnd = mulberry32(seed);
  for (let i = 0; i < blades; i++) {
    const h = hMin + rnd() * (hMax - hMin), w = 0.025 + rnd() * 0.02;
    const lean = (rnd() - 0.5) * 0.45;
    const pts: number[][] = [];
    for (let k = 0; k <= segs; k++) {
      const t = k / segs;
      const bend = lean * t * t;
      const ww = w * (1 - t * 0.85);
      pts.push([-ww + bend, h * t, bend * 0.3], [ww + bend, h * t, bend * 0.3]);
    }
    const verts: number[] = [], cols: number[] = [];
    const push = (p: number[]) => {
      verts.push(p[0], p[1], p[2]);
      const t = p[1] / hMax;
      cols.push(0.36 + t * 0.62, 0.3 + t * 0.48, 0.14 + t * 0.24);
    };
    for (let k = 0; k < segs; k++) {
      const a = pts[k * 2], b = pts[k * 2 + 1], c = pts[k * 2 + 2], d = pts[k * 2 + 3];
      if (k === segs - 1) { push(a); push(b); push([(c[0] + d[0]) / 2, c[1], c[2]]); }
      else { push(a); push(b); push(d); push(a); push(d); push(c); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.rotateY(rnd() * Math.PI);
    g.translate((rnd() - 0.5) * spread, 0, (rnd() - 0.5) * spread);
    parts.push(g);
  }
  const m = mergeGeometries(parts)!;
  m.computeVertexNormals();
  // Up-facing normals so cards light like a soft field, not like flat planes
  const n = m.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i) * 0.25, 0.95, n.getZ(i) * 0.25);
  return m;
}

export const TRAIL_LEN = 24;

/**
 * Wind-swept grass fields. Chunked instancing with draw-distance culling. The shader parts the
 * grass around the player, dithers it see-through where you stand (and right in front of the lens),
 * and flattens a trail behind you that springs back up over ~15s.
 */
export class GrassField {
  private meshes: THREE.InstancedMesh[] = [];
  private material: THREE.MeshLambertMaterial;
  private geos: THREE.BufferGeometry[];
  private geosFar: THREE.BufferGeometry[];
  lodDist = 34;
  readonly uniforms = {
    uPlayer: { value: new THREE.Vector3(0, -999, 0) },
    uCam: { value: new THREE.Vector3() },
    uFar: { value: 100 },
    uTrail: { value: Array.from({ length: TRAIL_LEN }, () => new THREE.Vector4(0, -999, 0, 0)) },
  };
  private trailIdx = 0;
  private lastTrail = new THREE.Vector3(1e9, 0, 0);
  count = 0;
  drawDist = 100;

  constructor(private scene: THREE.Scene) {
    this.geos = [tuftGeometry(5, 12, 0.6, 1.15), tuftGeometry(9, 14, 0.8, 1.45), tuftGeometry(13, 8, 0.35, 0.7)];
    // Distant LOD: fewer, single-segment blades (same silhouette from afar, ~1/6 the triangles)
    this.geosFar = [tuftGeometry(5, 6, 0.6, 1.15, 1), tuftGeometry(9, 7, 0.8, 1.45, 1), tuftGeometry(13, 4, 0.35, 0.7, 1)];
    const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, color: 0xf0dca0 });
    const U = this.uniforms;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uWind = windUniform;
      sh.uniforms.uTime = timeUniform;
      sh.uniforms.uWet = wetUniform;
      sh.uniforms.uPlayer = U.uPlayer;
      sh.uniforms.uCam = U.uCam;
      sh.uniforms.uFar = U.uFar;
      sh.uniforms.uTrail = U.uTrail;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          uniform vec2 uWind; uniform float uTime; uniform vec3 uPlayer; uniform vec3 uCam; uniform float uFar;
          uniform vec4 uTrail[${TRAIL_LEN}];
          varying float vFade;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec4 base = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          mat3 im = mat3(instanceMatrix);
          float sc = length(im[0]);
          float hn = clamp(position.y / 1.2, 0.0, 1.4);
          // Wind: travelling gusts + flutter
          float gust = sin(uTime * 1.3 + base.x * 0.08 + base.z * 0.06) * 0.5 + 0.5;
          float flutter = sin(uTime * 6.0 + base.x * 1.9 + base.z * 1.4 + position.y * 3.0) * 0.12;
          vec2 push = uWind * (gust * 0.85 + 0.15 + flutter) * 0.32 * hn * hn;
          // Player: part the grass around the body
          vec2 dp = base.xz - uPlayer.xz;
          float d = length(dp);
          float near = (1.0 - smoothstep(0.15, 1.35, d)) * step(abs(base.y - uPlayer.y), 2.5);
          vec2 away = d > 0.001 ? dp / d : vec2(1.0, 0.0);
          push += away * near * 0.85 * hn;
          float flatten = near * 0.45;
          // Trail: trampled path behind the player, recovering as w fades
          for (int i = 0; i < ${TRAIL_LEN}; i++) {
            vec4 t = uTrail[i];
            if (t.w <= 0.0) continue;
            vec2 dt2 = base.xz - t.xz;
            float dd = length(dt2);
            float k = (1.0 - smoothstep(0.05, 0.85, dd)) * t.w;
            push += (dd > 0.001 ? dt2 / dd : vec2(1.0, 0.0)) * k * 0.45 * hn;
            flatten = max(flatten, k * 0.7);
          }
          transformed.y *= 1.0 - flatten;
          transformed += transpose(im) * vec3(push.x, -length(push) * 0.35 * hn, push.y) / (sc * sc);
          // See-through fades: where you stand, right in front of the lens, and at draw distance
          vec4 wp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
          float dc = distance(wp.xyz, uCam);
          vFade = mix(0.28, 1.0, smoothstep(0.25, 1.6, d));
          vFade = min(vFade, smoothstep(0.6, 2.4, dc));
          vFade *= 1.0 - smoothstep(uFar * 0.72, uFar, distance(base.xz, uCam.xz));
        }`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uWet; varying float vFade;')
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          // Dithered (alpha-hashed) transparency: no sorting cost, reads as translucency at speed
          float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          if (ign > vFade) discard;`)
        .replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb *= mix(1.0, 0.68, uWet);')
        // Light both faces of a blade like a soft canopy (no black back-faces on DoubleSide)
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize((viewMatrix * vec4(0.15, 1.0, 0.1, 0.0)).xyz);');
    };
    m.customProgramCacheKey = () => 'grassfield-v3';
    this.material = m;
  }

  /** (Re)build instances for a density multiplier. Fields are broad patches with dune gaps. */
  build(density: number, drawDist: number, lodDist = 22) {
    this.lodDist = lodDist;
    for (const m of this.meshes) { this.scene.remove(m); m.dispose(); }
    this.meshes = [];
    this.drawDist = drawDist;
    this.uniforms.uFar.value = drawDist;
    const chunk = 40;
    const half = WORLD_SIZE / 2 - 55;
    const rnd = mulberry32(12);
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let total = 0;
    for (let cx = -half; cx < half; cx += chunk) {
      for (let cz = -half; cz < half; cz += chunk) {
        const per: THREE.Matrix4[][] = [[], [], []];
        const cols: THREE.Color[][] = [[], [], []];
        const tries = Math.floor(chunk * chunk * 1.9 * density);
        for (let i = 0; i < tries; i++) {
          const x = cx + rnd() * chunk, z = cz + rnd() * chunk;
          if (Math.hypot(x, z) < 50) continue;
          if (pathMask(x, z) > 0.25) continue;
          if (Math.hypot(x - SITES.fort.x, z - SITES.fort.z) < FORT_RADIUS + 4) continue;
          const scrub = Math.max(0, 1 - Math.hypot(x - SITES.scrub.x, z - SITES.scrub.z) / 140);
          // Field mask: large rolling patches; near the scrub it becomes a continuous meadow
          const field = fbm(x * 0.012, z * 0.012, 3, 4) + fbm(x * 0.05, z * 0.05, 2, 8) * 0.25;
          if (field < 0.62 - scrub * 0.45) continue;
          const edge = Math.min(1, (field - (0.62 - scrub * 0.45)) * 6); // thin out at patch edges
          if (rnd() > edge * 0.8 + 0.2) continue;
          const y = heightAt(x, z);
          dummy.position.set(x, y - 0.04, z);
          dummy.rotation.set(0, rnd() * Math.PI * 2, 0);
          dummy.scale.setScalar((0.75 + rnd() * 0.55) * (0.7 + edge * 0.3) + scrub * 0.25);
          dummy.updateMatrix();
          const v = rnd() < 0.15 ? 2 : rnd() < 0.5 ? 1 : 0;
          per[v].push(dummy.matrix.clone());
          const tone = rnd();
          color.setRGB(0.95 + tone * 0.15 - scrub * 0.15, 0.82 + tone * 0.12 + scrub * 0.08, 0.62 + scrub * 0.1 - tone * 0.05);
          cols[v].push(color.clone());
        }
        per.forEach((mats, v) => {
          if (!mats.length) return;
          const im = new THREE.InstancedMesh(this.geos[v], this.material, mats.length);
          mats.forEach((mm, i) => { im.setMatrixAt(i, mm); im.setColorAt(i, cols[v][i]); });
          im.computeBoundingSphere();
          im.receiveShadow = true;
          im.userData.center = new THREE.Vector2(cx + chunk / 2, cz + chunk / 2);
          im.userData.v = v;
          this.scene.add(im);
          this.meshes.push(im);
          total += mats.length;
        });
      }
    }
    this.count = total;
    return total;
  }

  /** Per-frame: interaction uniforms, trail upkeep and chunk draw-distance culling. */
  update(dt: number, player: THREE.Vector3, cam: THREE.Vector3, moving: boolean) {
    const U = this.uniforms;
    U.uPlayer.value.copy(player);
    U.uCam.value.copy(cam);
    if (moving && player.distanceToSquared(this.lastTrail) > 0.36) {
      this.lastTrail.copy(player);
      const t = U.uTrail.value[this.trailIdx];
      t.set(player.x, player.y, player.z, 1);
      this.trailIdx = (this.trailIdx + 1) % TRAIL_LEN;
    }
    for (const t of U.uTrail.value) if (t.w > 0) t.w = Math.max(0, t.w - dt / 15);
    const lim = this.drawDist + 30;
    for (const m of this.meshes) {
      const c = m.userData.center as THREE.Vector2;
      const d = Math.hypot(c.x - cam.x, c.y - cam.z);
      m.visible = d < lim;
      // Chunk LOD: full blades near the camera, cheap blades beyond
      const g = d < this.lodDist + 20 ? this.geos[m.userData.v] : this.geosFar[m.userData.v];
      if (m.geometry !== g) m.geometry = g;
    }
  }

  /** 0..1 how deep in grass a point is (for footstep rustle). */
  densityAt(x: number, z: number) { return fieldMask(x, z); }
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
