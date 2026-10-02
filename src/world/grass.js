// Stylized grass & flower clumps that live in a window around the player. Positions come from
// a world-space hash so the field is stable as you walk; blades sway in a stepped wind shader.
import * as THREE from 'three';
import { gradientMap } from '../render/toon.js';
import { biomeAt, roadDist, terrainHeight } from './terrain.js';

const CELL = 3; let RADIUS = 14; // cells
const PER_CELL = 5;

function hash(x, z, k) { const h = Math.sin(x * 127.1 + z * 311.7 + k * 74.7) * 43758.5453; return h - Math.floor(h); }

export class Grass {
  constructor(scene, radius = 14) {
    RADIUS = radius;
    // one clump = three crossed tapered blades
    const pos = [], col = [];
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * Math.PI;
      const c = Math.cos(a) * 0.12, s = Math.sin(a) * 0.12, ox = Math.cos(a + 1.3) * 0.08, oz = Math.sin(a + 1.3) * 0.08;
      pos.push(ox - c, 0, oz - s, ox + c, 0, oz + s, ox * 2.5, 0.55, oz * 2.5);
      col.push(0.45, 0.45, 0.45, 0.45, 0.45, 0.45, 1.05, 1.05, 1.05);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradientMap(2), side: THREE.DoubleSide });
    this.uniforms = { uTime: { value: 0 } };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uniforms.uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float t = floor(uTime * 10.0) / 10.0; // stepped wind, like hand-drawn foliage
        float sway = sin(t * 2.2 + wp.x * 0.35 + wp.z * 0.25) * 0.18 + sin(t * 5.1 + wp.x) * 0.05;
        transformed.x += sway * position.y; transformed.z += sway * 0.6 * position.y;`);
    };
    this.max = (RADIUS * 2 + 1) ** 2 * PER_CELL;
    this.mesh = new THREE.InstancedMesh(g, mat, this.max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; this.mesh.receiveShadow = true;
    this.mesh.setColorAt(0, new THREE.Color());
    scene.add(this.mesh);
    this.cx = null; this.cz = null;
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._p = new THREE.Vector3(); this._c = new THREE.Color();
  }
  update(t, playerPos, interior, aboveIslands) {
    this.uniforms.uTime.value = t;
    this.mesh.visible = !interior && !aboveIslands;
    if (!this.mesh.visible) return;
    const cx = Math.floor(playerPos.x / CELL), cz = Math.floor(playerPos.z / CELL);
    if (cx === this.cx && cz === this.cz) return;
    this.cx = cx; this.cz = cz;
    let n = 0;
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = -RADIUS; i <= RADIUS; i++) for (let j = -RADIUS; j <= RADIUS; j++) {
      if (i * i + j * j > RADIUS * RADIUS) continue;
      const gx = cx + i, gz = cz + j;
      for (let k = 0; k < PER_CELL; k++) {
        const x = (gx + hash(gx, gz, k)) * CELL, z = (gz + hash(gz, gx, k + 7)) * CELL;
        const b = biomeAt(x, z);
        if (b.desert > 0.45 || b.demon > 0.45 || b.snowZone > 0.4) continue;
        const y = terrainHeight(x, z);
        if (y < 0.5 || y > 44) continue;
        if (roadDist(x, z) < 4.5) continue;
        const flower = hash(gx, gz, k + 31) < 0.08;
        const s = flower ? 0.6 : 0.55 + hash(gx, gz, k + 13) * 0.6;
        this._q.setFromAxisAngle(up, hash(gx, gz, k + 3) * 6.28);
        this._m.compose(this._p.set(x, y - 0.05, z), this._q, this._s.set(s, s * (0.8 + hash(gz, gx, k) * 0.6), s));
        this.mesh.setMatrixAt(n, this._m);
        if (flower) this._c.set([0xffd94a, 0xff8fb0, 0xffffff, 0x9fd8ff][Math.floor(hash(gx, gz, k + 5) * 4)]);
        else this._c.setHSL(0.25 + hash(gx, gz, k + 9) * 0.05 - b.mountain * 0.03, 0.5, 0.27 + hash(gz, gx, k + 2) * 0.08);
        this.mesh.setColorAt(n, this._c);
        n++;
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true;
  }
}
