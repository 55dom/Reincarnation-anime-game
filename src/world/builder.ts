// Static geometry batcher: collects transformed primitives per material and merges them into
// a handful of draw calls, registering colliders as it goes.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Collision } from './collision';

export class StaticBuilder {
  private buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  constructor(public col: Collision) {}

  add(geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, yaw = 0, rx = 0, rz = 0) {
    const g = (geo.index ? geo.toNonIndexed() : geo.clone());
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    const mtx = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, yaw, rz)), new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(mtx);
    // keep only attributes all geometries share
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    let l = this.buckets.get(m);
    if (!l) { l = []; this.buckets.set(m, l); }
    l.push(g);
  }

  /** Box with world-scaled UVs (so textures don't stretch on long walls). base y = bottom. */
  box(x: number, y: number, z: number, w: number, h: number, d: number, m: THREE.Material, opts: { yaw?: number; collide?: boolean; walkable?: boolean; uvScale?: number } = {}) {
    const g = new THREE.BoxGeometry(w, h, d);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const nrm = g.attributes.normal as THREE.BufferAttribute;
    const s = opts.uvScale ?? 0.4;
    for (let i = 0; i < uv.count; i++) {
      const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i));
      const su = nx > 0.5 ? d : w;
      const sv = ny > 0.5 ? d : h;
      uv.setXY(i, uv.getX(i) * su * s, uv.getY(i) * sv * s);
    }
    this.add(g, m, x, y + h / 2, z, opts.yaw ?? 0);
    if (opts.collide !== false) this.col.addBox(x, z, w, d, y, y + h, opts.yaw ?? 0, opts.walkable ?? false);
  }

  cyl(x: number, y: number, z: number, rTop: number, rBot: number, h: number, m: THREE.Material, segs = 8, collide = true) {
    const g = new THREE.CylinderGeometry(rTop, rBot, h, segs);
    this.add(g, m, x, y + h / 2, z);
    if (collide) this.col.addCyl(x, z, Math.max(rTop, rBot), y, y + h);
  }

  flush(scene: THREE.Scene, castShadow = true) {
    for (const [m, list] of this.buckets) {
      const merged = mergeGeometries(list, false);
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, m);
      mesh.castShadow = castShadow;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
    this.buckets.clear();
  }
}
