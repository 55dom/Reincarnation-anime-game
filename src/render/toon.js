// Toon materials, inverted-hull outlines and small geometry helpers for characters.
import * as THREE from 'three';

let gradient3 = null, gradient2 = null;
export function gradientMap(steps = 3) {
  if (steps === 3 && gradient3) return gradient3;
  if (steps === 2 && gradient2) return gradient2;
  const data = steps === 3 ? new Uint8Array([90, 170, 255]) : new Uint8Array([155, 255]);
  const tex = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false; tex.needsUpdate = true;
  if (steps === 3) gradient3 = tex; else gradient2 = tex;
  return tex;
}

const matCache = new Map();
/** Shared toon material per color. */
export function toon(color, opts = {}) {
  const key = `${color}|${opts.emissive || 0}|${opts.steps || 3}|${opts.transparent ? opts.opacity : 1}|${opts.side || 0}`;
  if (!opts.unique && matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshToonMaterial({
    color, gradientMap: gradientMap(opts.steps || 3),
    emissive: opts.emissive || 0x000000, emissiveIntensity: opts.emissiveIntensity ?? 1,
    transparent: !!opts.transparent, opacity: opts.opacity ?? 1, side: opts.side ?? THREE.FrontSide,
  });
  if (!opts.unique) matCache.set(key, m);
  return m;
}

export function envMaterial() {
  return new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientMap(3) });
}

// Outline shader: push vertices out along the normal, render back faces in solid ink.
const outlineMats = new Map();
export function outlineMaterial(thickness = 0.018, color = 0x15101a) {
  const key = thickness + '|' + color;
  if (outlineMats.has(key)) return outlineMats.get(key);
  const m = new THREE.ShaderMaterial({
    uniforms: { thickness: { value: thickness }, color: { value: new THREE.Color(color) } },
    vertexShader: /* glsl */`
      uniform float thickness;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        vec3 p = position + normal * thickness;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 color;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        gl_FragColor = vec4(color, 1.0);
        #include <fog_fragment>
      }`,
    side: THREE.BackSide, fog: true,
  });
  m.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, m.uniforms]);
  outlineMats.set(key, m);
  return m;
}

/** Create a toon mesh with an ink outline child. */
export function inked(geo, color, thickness = 0.018, matOpts) {
  const mesh = new THREE.Mesh(geo, typeof color === 'object' && color.isMaterial ? color : toon(color, { steps: 2, ...matOpts }));
  mesh.castShadow = true;
  if (thickness > 0) {
    const o = new THREE.Mesh(geo, outlineMaterial(thickness));
    o.raycast = () => {};
    o.userData.isOutline = true;
    mesh.add(o);
  }
  return mesh;
}

// Geometry helpers -----------------------------------------------------------
/** Box whose pivot sits at its top (for limbs hanging down). */
export function limbGeo(w, h, d, taper = 1, seg = 1) {
  const g = new THREE.CylinderGeometry(w * taper * 0.5, w * 0.5, h, 8, seg);
  g.translate(0, -h / 2, 0);
  g.scale(1, 1, d / w);
  return g;
}
export function roundBox(w, h, d, r = 0.2, seg = 2) {
  // cheap rounded box via sphere-ish subdivided box normals
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg);
  const p = g.attributes.position; const v = new THREE.Vector3();
  const hw = w / 2, hh = h / 2, hd = d / 2;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const ix = Math.max(-hw + r, Math.min(hw - r, v.x)), iy = Math.max(-hh + r, Math.min(hh - r, v.y)), iz = Math.max(-hd + r, Math.min(hd - r, v.z));
    const dx = v.x - ix, dy = v.y - iy, dz = v.z - iz; const l = Math.hypot(dx, dy, dz) || 1;
    p.setXYZ(i, ix + dx / l * r, iy + dy / l * r, iz + dz / l * r);
  }
  g.computeVertexNormals();
  return g;
}
export function cone(r, h, seg = 6) { const g = new THREE.ConeGeometry(r, h, seg); return g; }

/** Shared canvas texture helper. */
export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// Additive glow material cache
const glowCache = new Map();
export function glowMat(color, opacity = 0.9) {
  const key = color + '|' + opacity;
  if (glowCache.has(key)) return glowCache.get(key);
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  glowCache.set(key, m);
  return m;
}
