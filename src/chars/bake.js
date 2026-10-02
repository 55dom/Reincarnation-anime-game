// Merges the rigid toon parts attached to each rig group into one vertex-colored mesh (+ one
// outline), cutting a character from ~150 draw calls to ~30 without changing how it looks.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { gradientMap, outlineMaterial } from '../render/toon.js';

const mats = {};
function bakedMat(steps) {
  if (!mats[steps]) mats[steps] = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: gradientMap(steps) });
  return mats[steps];
}

export function bakeGroups(root, { outline = 0.011 } = {}) {
  root.updateMatrixWorld(true);
  const groups = [];
  root.traverse((o) => { if (o.isGroup || o === root) groups.push(o); });
  for (const g of groups) {
    const parts = g.children.filter((m) => m.isMesh && !m.userData.isOutline && !m.userData.keep && m.material?.isMeshToonMaterial && !m.material.transparent && m.material.side === THREE.FrontSide && !m.material.vertexColors && !m.material.emissive?.getHex());
    if (parts.length < 2) continue;
    const bySteps = {};
    for (const m of parts) { const s = m.material.gradientMap === gradientMap(3) ? 3 : 2; (bySteps[s] = bySteps[s] || []).push(m); }
    for (const [steps, list] of Object.entries(bySteps)) {
      const geos = [];
      let olw = 0;
      for (const m of list) {
        m.updateMatrix();
        let geo = m.geometry.clone();
        if (!geo.index) geo = mergeIndexed(geo);
        for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
        if (!geo.attributes.normal) geo.computeVertexNormals();
        geo.applyMatrix4(m.matrix);
        const c = m.material.color;
        const n = geo.attributes.position.count; const col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        geos.push(geo);
        const ol = m.children.find((x) => x.userData.isOutline);
        if (ol) olw = Math.max(olw, ol.material.uniforms?.thickness?.value || outline);
      }
      let merged;
      try { merged = mergeGeometries(geos, false); } catch (e) { merged = null; }
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, bakedMat(+steps));
      mesh.castShadow = true;
      if (olw > 0) { const o = new THREE.Mesh(merged, outlineMaterial(olw)); o.userData.isOutline = true; o.raycast = () => {}; mesh.add(o); }
      mesh.userData.baked = true;
      for (const m of list) g.remove(m);
      g.add(mesh);
    }
  }
}

function mergeIndexed(geo) {
  const n = geo.attributes.position.count; const idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  return geo;
}
