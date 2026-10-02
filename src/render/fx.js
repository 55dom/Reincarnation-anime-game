// Visual effects: GPU billboard particles (sparks, dust, glows), debris cubes, slash arcs,
// shockwaves, impact stars, weapon trails, anime speed lines and damage numbers.
import * as THREE from 'three';
import { Time } from '../core/time.js';
import { canvasTex, glowMat } from './toon.js';
import { clamp, lerp } from '../core/util.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _c = new THREE.Color();

// ------------------------------------------------------------ billboard particle system
class Billboards {
  constructor(scene, max, texture, blending) {
    this.max = max; this.count = 0;
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index; g.attributes.position = base.attributes.position; g.attributes.uv = base.attributes.uv;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.dat = new Float32Array(max * 4);
    g.setAttribute('iPos', new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iVel', new THREE.InstancedBufferAttribute(this.vel, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iCol', new THREE.InstancedBufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('iDat', new THREE.InstancedBufferAttribute(this.dat, 4).setUsage(THREE.DynamicDrawUsage));
    g.instanceCount = 0;
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: texture } },
      vertexShader: /* glsl */`
        attribute vec3 iPos; attribute vec3 iVel; attribute vec3 iCol; attribute vec4 iDat;
        varying vec2 vUv; varying vec3 vCol; varying float vA;
        void main(){
          vUv = uv; vCol = iCol; vA = iDat.y;
          vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
          vec2 p = position.xy * iDat.x;
          float c = cos(iDat.z), s = sin(iDat.z);
          p = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
          if (iDat.w > 0.0) {
            vec3 vv = (modelViewMatrix * vec4(iVel, 0.0)).xyz;
            vec2 d = normalize(vv.xy + vec2(0.0001));
            vec2 n = vec2(-d.y, d.x);
            float len = iDat.x * (1.0 + iDat.w * length(iVel));
            p = d * position.y * len + n * position.x * iDat.x * 0.25;
          }
          mv.xy += p;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D map; varying vec2 vUv; varying vec3 vCol; varying float vA;
        void main(){ vec4 t = texture2D(map, vUv); gl_FragColor = vec4(vCol * t.rgb, t.a * vA); if (gl_FragColor.a < 0.01) discard; }`,
      transparent: true, depthWrite: false, blending,
    });
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 5;
    scene.add(this.mesh);
    this.p = []; // particle state objects
  }
  spawn(o) {
    if (this.p.length >= this.max) this.p.shift();
    this.p.push({
      x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, life: o.life || 0.5, max: o.life || 0.5,
      size: o.size || 0.3, grow: o.grow ?? 0, r: o.r ?? 1, g: o.g ?? 1, b: o.b ?? 1, a: o.a ?? 1, grav: o.grav ?? 0, drag: o.drag ?? 0,
      rot: o.rot ?? Math.random() * 6.28, spin: o.spin ?? 0, stretch: o.stretch ?? 0, fadeIn: o.fadeIn ?? 0, real: !!o.real,
    });
  }
  update() {
    const dtg = Time.dt, dtr = Time.rdt;
    let n = 0;
    for (let i = this.p.length - 1; i >= 0; i--) {
      const p = this.p[i]; const dt = p.real ? dtr : dtg;
      p.life -= dt;
      if (p.life <= 0) { this.p.splice(i, 1); continue; }
      p.vy -= p.grav * dt; const dr = Math.exp(-p.drag * dt); p.vx *= dr; p.vy *= dr; p.vz *= dr;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rot += p.spin * dt; p.size += p.grow * dt;
    }
    for (const p of this.p) {
      const t = 1 - p.life / p.max;
      const fade = p.fadeIn > 0 && t < p.fadeIn ? t / p.fadeIn : 1 - Math.max(0, (t - 0.5) / 0.5);
      const j = n * 3, k = n * 4;
      this.pos[j] = p.x; this.pos[j + 1] = p.y; this.pos[j + 2] = p.z;
      this.vel[j] = p.vx; this.vel[j + 1] = p.vy; this.vel[j + 2] = p.vz;
      this.col[j] = p.r; this.col[j + 1] = p.g; this.col[j + 2] = p.b;
      this.dat[k] = Math.max(0.001, p.size); this.dat[k + 1] = p.a * fade; this.dat[k + 2] = p.rot; this.dat[k + 3] = p.stretch;
      n++;
    }
    this.geo.instanceCount = n;
    for (const name of ['iPos', 'iVel', 'iCol', 'iDat']) this.geo.attributes[name].needsUpdate = true;
  }
}

// ------------------------------------------------------------ debris cubes
class Debris {
  constructor(scene, max = 300) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff }), max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.count = 0; this.mesh.castShadow = true; this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, _c.set(0xffffff));
    scene.add(this.mesh);
    this.p = [];
  }
  spawn(o) {
    if (this.p.length >= this.max) this.p.shift();
    this.p.push({ ...o, rx: Math.random() * 6, ry: Math.random() * 6, life: o.life || 1.5, max: o.life || 1.5, sx: (Math.random() - 0.5) * 12, sy: (Math.random() - 0.5) * 12 });
  }
  update(getHeight) {
    const dt = Time.dt;
    let n = 0;
    for (let i = this.p.length - 1; i >= 0; i--) {
      const p = this.p[i]; p.life -= dt;
      if (p.life <= 0) { this.p.splice(i, 1); continue; }
      p.vy -= 22 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rx += p.sx * dt; p.ry += p.sy * dt;
      const gh = getHeight ? getHeight(p.x, p.z) : 0;
      if (p.y < gh + p.size * 0.5) { p.y = gh + p.size * 0.5; p.vy *= -0.35; p.vx *= 0.6; p.vz *= 0.6; p.sx *= 0.5; p.sy *= 0.5; }
    }
    for (const p of this.p) {
      const s = p.size * Math.min(1, p.life / (p.max * 0.3));
      _q.setFromEuler(new THREE.Euler(p.rx, p.ry, 0));
      _m.compose(_v.set(p.x, p.y, p.z), _q, _v2.set(s, s, s));
      this.mesh.setMatrixAt(n, _m); this.mesh.setColorAt(n, _c.set(p.color)); n++;
    }
    this.mesh.count = n; this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

// ------------------------------------------------------------ slash arcs
const arcVS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const arcFS = /* glsl */`
  uniform vec3 color; uniform vec3 core; uniform float progress; uniform float fade; varying vec2 vUv;
  void main(){
    float a = vUv.x; // 0..1 along arc
    float head = progress;
    if (a > head) discard;
    float tail = smoothstep(head - 0.85, head, a);
    float w = vUv.y; // 0 inner .. 1 outer
    float thick = sin(a * 3.14159);
    float edge = smoothstep(1.0 - thick, 1.0, w);
    float coreMask = smoothstep(0.75, 0.97, w) * thick;
    vec3 c = mix(color, core, coreMask);
    float alpha = edge * tail * fade;
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(c, alpha);
  }`;
function crescentGeo(radius = 1.6, inner = 0.6, arc = Math.PI * 1.1, seg = 28) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg; const ang = -arc / 2 + arc * t;
    const c = Math.cos(ang), s = Math.sin(ang);
    pos.push(c * radius * inner, 0, s * radius * inner, c * radius, 0, s * radius);
    uv.push(t, 0, t, 1);
    if (i < seg) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  return g;
}

// ------------------------------------------------------------ weapon trail ribbon
export class Trail {
  constructor(scene, { length = 18, color = 0x9fe8ff, core = 0xffffff, life = 0.16 } = {}) {
    this.n = length; this.life = life; this.pts = [];
    this.geo = new THREE.BufferGeometry();
    this.posArr = new Float32Array(this.n * 2 * 3); this.uvArr = new Float32Array(this.n * 2 * 2);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.posArr, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(this.uvArr, 2).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < this.n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    this.geo.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color(color) }, core: { value: new THREE.Color(core) }, opacity: { value: 1 } },
      vertexShader: arcVS,
      fragmentShader: /* glsl */`uniform vec3 color; uniform vec3 core; uniform float opacity; varying vec2 vUv;
        void main(){ float age = vUv.x; float w = vUv.y; float a = (1.0 - age) * smoothstep(0.0, 0.5, w) * opacity;
        vec3 c = mix(color, core, smoothstep(0.7, 1.0, w) * (1.0 - age)); if (a < 0.02) discard; gl_FragColor = vec4(c, a); }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 6;
    scene.add(this.mesh);
    this.active = false;
  }
  setColor(c, core = 0xffffff) { this.mat.uniforms.color.value.set(c); this.mat.uniforms.core.value.set(core); }
  /** Push a (base, tip) segment. */
  push(base, tip) {
    this.pts.unshift({ b: base.clone(), t: tip.clone(), time: Time.game });
    if (this.pts.length > this.n) this.pts.length = this.n;
  }
  clear() { this.pts.length = 0; }
  update() {
    const now = Time.game;
    while (this.pts.length && now - this.pts[this.pts.length - 1].time > this.life) this.pts.pop();
    const n = this.pts.length;
    this.mesh.visible = n > 1;
    if (n < 2) return;
    for (let i = 0; i < this.n; i++) {
      const p = this.pts[Math.min(i, n - 1)];
      const age = clamp((now - p.time) / this.life, 0, 1);
      const j = i * 6;
      this.posArr[j] = p.b.x; this.posArr[j + 1] = p.b.y; this.posArr[j + 2] = p.b.z;
      this.posArr[j + 3] = p.t.x; this.posArr[j + 4] = p.t.y; this.posArr[j + 5] = p.t.z;
      const u = i >= n - 1 ? 1 : age;
      this.uvArr[i * 4] = u; this.uvArr[i * 4 + 1] = 0; this.uvArr[i * 4 + 2] = u; this.uvArr[i * 4 + 3] = 1;
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.uv.needsUpdate = true;
    this.geo.computeBoundingSphere();
  }
}

// ------------------------------------------------------------ main FX facade
export const FX = {
  init(scene, camera) {
    this.scene = scene; this.camera = camera;
    const soft = canvasTex(64, 64, (g, w, h) => {
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    const puffTex = canvasTex(64, 64, (g, w, h) => {
      // chunky cel-shaded dust puff
      g.fillStyle = 'rgba(255,255,255,1)';
      for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28; g.beginPath(); g.arc(w / 2 + Math.cos(a) * 12, h / 2 + Math.sin(a) * 12, 13, 0, 7); g.fill(); }
      g.beginPath(); g.arc(w / 2, h / 2, 16, 0, 7); g.fill();
      g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.arc(w / 2 + 8, h / 2 + 10, 24, 0, 7); g.fill();
    });
    const starTex = canvasTex(128, 128, (g, w, h) => {
      const spikes = 12; g.translate(w / 2, h / 2);
      g.beginPath();
      for (let i = 0; i < spikes * 2; i++) { const r = i % 2 ? 16 : (i % 4 === 0 ? 62 : 44); const a = i / (spikes * 2) * Math.PI * 2; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      g.closePath(); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,0.0)'; g.stroke();
    });
    const sparkTex = canvasTex(32, 64, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(w / 2, h / 2, w / 2.5, h / 2, 0, 0, 7); g.fill();
    });
    this.glow = new Billboards(scene, 1500, soft, THREE.AdditiveBlending);
    this.dust = new Billboards(scene, 600, puffTex, THREE.NormalBlending);
    this.stars = new Billboards(scene, 60, starTex, THREE.AdditiveBlending);
    this.sparks = new Billboards(scene, 800, sparkTex, THREE.AdditiveBlending);
    this.debris = new Debris(scene);
    // slash arcs pool
    this.arcs = [];
    const arcGeo = crescentGeo();
    for (let i = 0; i < 16; i++) {
      const mat = new THREE.ShaderMaterial({ uniforms: { color: { value: new THREE.Color() }, core: { value: new THREE.Color(0xffffff) }, progress: { value: 0 }, fade: { value: 1 } },
        vertexShader: arcVS, fragmentShader: arcFS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
      const m = new THREE.Mesh(arcGeo, mat); m.visible = false; m.renderOrder = 7; m.frustumCulled = false; scene.add(m);
      this.arcs.push({ mesh: m, t: 0, dur: 0.2, active: false });
    }
    // shock rings / flashes
    this.rings = [];
    const ringGeo = new THREE.RingGeometry(0.8, 1, 40); ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 12; i++) {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.visible = false; m.renderOrder = 6; scene.add(m); this.rings.push({ mesh: m, active: false });
    }
    this.pillars = [];
    const pg = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true); pg.translate(0, 0.5, 0);
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.visible = false; scene.add(m); this.pillars.push({ mesh: m, active: false });
    }
    this.lights = [];
    for (let i = 0; i < 1; i++) { const l = new THREE.PointLight(0xffffff, 0, 14, 1.5); scene.add(l); this.lights.push({ l, t: 0, dur: 1, peak: 0 }); }
    this.speed = 0; this.speedT = 0;
    this.c2d = document.getElementById('fx2d'); this.g2d = this.c2d.getContext('2d');
    this.dmgLayer = document.getElementById('dmgLayer'); this.dmgs = [];
    this.flashEl = document.getElementById('flash'); this.flashA = 0; this.flashColor = '#fff';
    this.trails = [];
  },
  trail(opts) { const t = new Trail(this.scene, opts); this.trails.push(t); return t; },

  sparksAt(p, dir, { count = 14, color = [1, 0.85, 0.4], speed = 10, size = 0.12, spread = 1 } = {}) {
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.4 - 0.2, (Math.random() - 0.5) * 2).multiplyScalar(spread);
      if (dir) v.add(dir.clone().multiplyScalar(1.2));
      v.normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      this.sparks.spawn({ x: p.x, y: p.y, z: p.z, vx: v.x, vy: v.y, vz: v.z, life: 0.2 + Math.random() * 0.3, size: size * (0.6 + Math.random()), r: color[0], g: color[1], b: color[2], grav: 18, drag: 3, stretch: 0.08 });
    }
  },
  glowBurst(p, { count = 10, color = [0.6, 0.9, 1], speed = 4, size = 0.5, life = 0.5, grav = 0, up = 0 } = {}) {
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5) + up, (Math.random() - 0.5)).normalize().multiplyScalar(speed * Math.random());
      this.glow.spawn({ x: p.x, y: p.y, z: p.z, vx: v.x, vy: v.y, vz: v.z, life: life * (0.5 + Math.random()), size: size * (0.5 + Math.random()), r: color[0], g: color[1], b: color[2], drag: 2, grav, grow: -size * 0.5 });
    }
  },
  dustAt(p, { count = 8, color = [0.75, 0.68, 0.55], speed = 3, size = 0.8, up = 0.3, life = 0.8 } = {}) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * 6.28; const s = speed * (0.5 + Math.random() * 0.6);
      this.dust.spawn({ x: p.x + Math.cos(a) * 0.3, y: p.y + 0.1, z: p.z + Math.sin(a) * 0.3, vx: Math.cos(a) * s, vy: up * s * Math.random(), vz: Math.sin(a) * s, life: life * (0.7 + Math.random() * 0.6), size: size * (0.6 + Math.random() * 0.6), grow: size * 1.2, r: color[0], g: color[1], b: color[2], a: 0.85, drag: 3.5, spin: (Math.random() - 0.5) * 2 });
    }
  },
  debrisAt(p, { count = 8, color = 0x7a6a55, speed = 7, size = 0.25 } = {}) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * 6.28, s = speed * (0.3 + Math.random() * 0.7);
      this.debris.spawn({ x: p.x, y: p.y + 0.2, z: p.z, vx: Math.cos(a) * s, vy: 4 + Math.random() * speed, vz: Math.sin(a) * s, size: size * (0.5 + Math.random()), color, life: 1.2 + Math.random() });
    }
  },
  impactStar(p, { size = 2.2, color = [1, 1, 1], life = 0.12 } = {}) {
    this.stars.spawn({ x: p.x, y: p.y, z: p.z, life, size, r: color[0], g: color[1], b: color[2], grow: size * 6, rot: Math.random() * 6 });
    this.stars.spawn({ x: p.x, y: p.y, z: p.z, life: life * 1.4, size: size * 0.6, r: 1, g: 1, b: 1, grow: size * 3, rot: Math.random() * 6 });
  },
  /** Crescent slash. `quat` orients the arc plane, `color` hex. */
  slash(pos, quat, { color = 0x8fe3ff, core = 0xffffff, scale = 1, dur = 0.16, flip = false, life = 0.3 } = {}) {
    const a = this.arcs.find((x) => !x.active) || this.arcs[0];
    a.active = true; a.t = 0; a.dur = dur; a.life = life;
    a.mesh.position.copy(pos); a.mesh.quaternion.copy(quat); a.mesh.scale.set(scale * (flip ? -1 : 1), scale, scale);
    a.mesh.material.uniforms.color.value.set(color); a.mesh.material.uniforms.core.value.set(core);
    a.mesh.material.uniforms.progress.value = 0; a.mesh.material.uniforms.fade.value = 1;
    a.mesh.visible = true;
  },
  ring(pos, { color = 0xffffff, from = 0.5, to = 6, dur = 0.4, y = 0.15, opacity = 0.9, vertical = null } = {}) {
    const r = this.rings.find((x) => !x.active) || this.rings[0];
    r.active = true; r.t = 0; r.dur = dur; r.from = from; r.to = to; r.opacity = opacity;
    r.mesh.position.set(pos.x, pos.y + y, pos.z); r.mesh.material.color.set(color); r.mesh.visible = true;
    r.mesh.quaternion.identity();
    if (vertical) r.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), vertical);
  },
  pillar(pos, { color = 0xffe08a, radius = 1.2, height = 20, dur = 0.8 } = {}) {
    const p = this.pillars.find((x) => !x.active) || this.pillars[0];
    p.active = true; p.t = 0; p.dur = dur; p.radius = radius; p.height = height;
    p.mesh.position.copy(pos); p.mesh.material.color.set(color); p.mesh.visible = true;
  },
  light(pos, color = 0xffffff, intensity = 30, dur = 0.25) {
    const L = this.lights.reduce((a, b) => (a.t / a.dur > b.t / b.dur ? a : b));
    L.l.position.copy(pos); L.l.color.set(color); L.t = 0; L.dur = dur; L.peak = intensity; L.l.intensity = intensity;
  },
  flash(a = 0.6, color = '#fff') { this.flashA = Math.max(this.flashA, a); this.flashEl.style.background = color; },
  speedLines(amount = 1, dur = 0.3) { this.speed = Math.max(this.speed, amount); this.speedT = Math.max(this.speedT, dur); },

  damageNumber(pos, text, cls = '') {
    let el = this.dmgs.find((d) => !d.active);
    if (!el) { const e = document.createElement('div'); this.dmgLayer.appendChild(e); el = { e }; this.dmgs.push(el); }
    el.active = true; el.t = 0; el.pos = pos.clone(); el.pos.x += (Math.random() - 0.5) * 0.6; el.e.className = 'dmg ' + cls; el.e.textContent = text; el.e.style.display = 'block';
    el.vx = (Math.random() - 0.5) * 40;
  },

  update(getHeight) {
    const dt = Time.dt, rdt = Time.rdt;
    this.glow.update(); this.dust.update(); this.stars.update(); this.sparks.update(); this.debris.update(getHeight);
    for (const t of this.trails) t.update();
    for (const a of this.arcs) {
      if (!a.active) continue;
      a.t += dt;
      const u = a.mesh.material.uniforms;
      u.progress.value = Math.min(1.25, a.t / a.dur * 1.25);
      u.fade.value = a.t < a.dur ? 1 : Math.max(0, 1 - (a.t - a.dur) / (a.life - a.dur));
      if (a.t > a.life) { a.active = false; a.mesh.visible = false; }
    }
    for (const r of this.rings) {
      if (!r.active) continue;
      r.t += dt; const k = r.t / r.dur;
      const s = lerp(r.from, r.to, 1 - Math.pow(1 - k, 3)); r.mesh.scale.set(s, s, s);
      r.mesh.material.opacity = r.opacity * (1 - k);
      if (k >= 1) { r.active = false; r.mesh.visible = false; }
    }
    for (const p of this.pillars) {
      if (!p.active) continue;
      p.t += dt; const k = p.t / p.dur;
      const w = p.radius * (k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85 * 0.8);
      p.mesh.scale.set(w, p.height, w); p.mesh.material.opacity = 0.45 * (1 - k);
      if (k >= 1) { p.active = false; p.mesh.visible = false; }
    }
    for (const L of this.lights) {
      if (L.l.intensity <= 0) continue;
      L.t += rdt; L.l.intensity = Math.max(0, L.peak * (1 - L.t / L.dur));
    }
    // flash
    if (this.flashA > 0) { this.flashA = Math.max(0, this.flashA - rdt * 4); }
    this.flashEl.style.opacity = this.flashA.toFixed(3);
    // damage numbers
    const cam = this.camera; const W = innerWidth, H = innerHeight;
    for (const d of this.dmgs) {
      if (!d.active) continue;
      d.t += rdt;
      _v.copy(d.pos); _v.y += d.t * 1.2; _v.project(cam);
      if (_v.z > 1 || d.t > 0.9) { d.active = false; d.e.style.display = 'none'; continue; }
      const pop = d.t < 0.08 ? 1.6 - d.t / 0.08 * 0.6 : 1;
      d.e.style.left = ((_v.x * 0.5 + 0.5) * W + d.vx * d.t) + 'px'; d.e.style.top = ((-_v.y * 0.5 + 0.5) * H) + 'px';
      d.e.style.opacity = d.t > 0.6 ? 1 - (d.t - 0.6) / 0.3 : 1;
      d.e.style.transform = `translate(-50%,-50%) scale(${pop})`;
    }
    this.drawSpeedLines(rdt);
  },
  drawSpeedLines(rdt) {
    const c = this.c2d, g = this.g2d;
    if (c.width !== innerWidth || c.height !== innerHeight) { c.width = innerWidth; c.height = innerHeight; }
    g.clearRect(0, 0, c.width, c.height);
    if (this.speedT > 0) this.speedT -= rdt; else this.speed = Math.max(0, this.speed - rdt * 5);
    if (this.speed <= 0.01) return;
    const cx = c.width / 2, cy = c.height / 2, R = Math.hypot(cx, cy);
    g.save(); g.translate(cx, cy);
    const n = Math.floor(70 * this.speed);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r0 = R * (0.45 + Math.random() * 0.35 * (1.2 - this.speed * 0.5));
      const w = (2 + Math.random() * 6) * this.speed;
      g.fillStyle = Math.random() < 0.85 ? `rgba(255,255,255,${0.35 * this.speed})` : `rgba(0,0,0,${0.3 * this.speed})`;
      g.beginPath();
      g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      g.lineTo(Math.cos(a + w / R) * R * 1.1, Math.sin(a + w / R) * R * 1.1);
      g.lineTo(Math.cos(a - w / R) * R * 1.1, Math.sin(a - w / R) * R * 1.1);
      g.fill();
    }
    g.restore();
  },
};
