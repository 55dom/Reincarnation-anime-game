// Combat readability effects: ground telegraphs (windup fill → active flash), hit sparks,
// ash bursts, mark sigils and snare rings. All pooled; particle counts scale with quality.
import * as THREE from 'three';
import { radialTexture } from '../render/textures';
import { heightAt } from '../world/layout';

const teleVert = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const teleFrag = `
  uniform float uFill, uActive, uAlpha, uArc; uniform vec3 uColA, uColB; uniform int uShape; varying vec2 vUv;
  void main(){
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float inside;
    float edge;
    if (uShape == 0) { // circle
      inside = step(r, 1.0);
      edge = smoothstep(0.86, 0.95, r) * inside;
      float fill = step(r, uFill);
      float a = (edge * 0.9 + fill * 0.35 + inside * 0.08) * uAlpha;
      vec3 c = mix(uColA, uColB, uActive);
      gl_FragColor = vec4(c, a * inside);
    } else if (uShape == 1) { // cone sector, apex at center, facing +Y of uv
      float ang = abs(atan(p.x, p.y));
      inside = step(r, 1.0) * step(ang, uArc);
      edge = max(smoothstep(0.86, 0.95, r), smoothstep(uArc - 0.08, uArc, ang)) * inside;
      float fill = step(r, uFill);
      float a = (edge * 0.9 + fill * 0.35 + inside * 0.08) * uAlpha;
      gl_FragColor = vec4(mix(uColA, uColB, uActive), a * inside);
    } else { // rect: uv.y is length
      inside = 1.0;
      edge = max(step(0.9, abs(p.x)), step(0.96, abs(p.y)));
      float fill = step(vUv.y, uFill);
      float a = (edge * 0.9 + fill * 0.35 + 0.08) * uAlpha;
      gl_FragColor = vec4(mix(uColA, uColB, uActive), a);
    }
  }`;

export interface Telegraph {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  t: number;
  windup: number;
  active: number;
  follow?: () => { x: number; z: number; yaw: number } | null;
  done: boolean;
}

interface Particle { s: THREE.Sprite; v: THREE.Vector3; life: number; max: number; grow: number; grav: number }

export class FX {
  private teles: Telegraph[] = [];
  private parts: Particle[] = [];
  private pool: THREE.Sprite[] = [];
  private sparkTex = radialTexture('rgba(255,240,200,1)', 'rgba(255,120,40,0)');
  private puffTex = radialTexture('rgba(255,255,255,0.8)', 'rgba(255,255,255,0)');
  markSprites = new Map<number, THREE.Sprite>();
  glints = new Map<number, THREE.Sprite>();
  snareRings = new Map<number, THREE.Mesh>();
  private markTex: THREE.Texture;
  particleScale = 1;

  constructor(private scene: THREE.Scene) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    g.strokeStyle = '#ffcf5a'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(32, 6); g.lineTo(58, 32); g.lineTo(32, 58); g.lineTo(6, 32); g.closePath(); g.stroke();
    g.fillStyle = '#ffcf5a'; g.beginPath(); g.arc(32, 32, 7, 0, Math.PI * 2); g.fill();
    this.markTex = new THREE.CanvasTexture(c);
  }

  /** Ground telegraph. shape: circle (radius), cone (radius, arc), rect (width, length). */
  telegraph(shape: 'circle' | 'cone' | 'rect', x: number, z: number, yaw: number, size: number, windup: number, active: number, opts: { arc?: number; width?: number; follow?: Telegraph['follow']; y?: number } = {}): Telegraph {
    const mat = new THREE.ShaderMaterial({
      vertexShader: teleVert, fragmentShader: teleFrag, transparent: true, depthWrite: false,
      uniforms: {
        uFill: { value: 0 }, uActive: { value: 0 }, uAlpha: { value: 0 }, uArc: { value: opts.arc ?? 0.8 },
        uColA: { value: new THREE.Color(0xffa040) }, uColB: { value: new THREE.Color(0xff2a10) },
        uShape: { value: shape === 'circle' ? 0 : shape === 'cone' ? 1 : 2 },
      },
      polygonOffset: true, polygonOffsetFactor: -4,
    });
    const geo = shape === 'rect' ? new THREE.PlaneGeometry(opts.width ?? 1.5, size, 1, 1).translate(0, size / 2, 0) : new THREE.PlaneGeometry(size * 2, size * 2, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 2;
    this.place(mesh, x, z, yaw, opts.y);
    this.scene.add(mesh);
    const t: Telegraph = { mesh, mat, t: 0, windup, active, follow: opts.follow, done: false };
    this.teles.push(t);
    return t;
  }

  private place(mesh: THREE.Mesh, x: number, z: number, yaw: number, y?: number) {
    mesh.position.set(x, (y ?? heightAt(x, z)) + 0.06, z);
    // PlaneGeometry rotated: local -Z (uv +Y) forward. Character yaw faces +Z → rotate by yaw+PI.
    mesh.rotation.y = yaw + Math.PI;
  }

  cancel(t: Telegraph) { t.done = true; }

  spark(p: THREE.Vector3, dir: THREE.Vector3, color = 0xffc070, n = 8) {
    n = Math.ceil(n * this.particleScale);
    for (let i = 0; i < n; i++) {
      const v = dir.clone().multiplyScalar(2 + Math.random() * 3).add(new THREE.Vector3((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4));
      this.emit(this.sparkTex, p, v, 0.12 + Math.random() * 0.08, 0.25 + Math.random() * 0.2, color, true, -2, 9);
    }
  }
  blood(p: THREE.Vector3, dir: THREE.Vector3, n = 6) {
    n = Math.ceil(n * this.particleScale);
    for (let i = 0; i < n; i++) {
      const v = dir.clone().multiplyScalar(1.5 + Math.random() * 2).add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2));
      this.emit(this.puffTex, p, v, 0.14, 0.5, 0x6a0a06, false, 0, 9);
    }
  }
  ash(p: THREE.Vector3, radius: number, n = 28, color = 0x8a7a6a) {
    n = Math.ceil(n * this.particleScale);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * radius * 2.2, 1 + Math.random() * 2, Math.sin(a) * radius * 2.2);
      this.emit(this.puffTex, p.clone().add(new THREE.Vector3(Math.cos(a) * 0.5, 0.2, Math.sin(a) * 0.5)), v, 0.5 + Math.random() * 0.4, 0.9 + Math.random() * 0.4, color, false, 2.2, 1.5);
    }
  }
  dust(p: THREE.Vector3, n = 4, color = 0xb08a60) {
    n = Math.ceil(n * this.particleScale);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 1.2, 0.4 + Math.random() * 0.6, (Math.random() - 0.5) * 1.2);
      this.emit(this.puffTex, p, v, 0.25, 0.7, color, false, 1.2, 0.5);
    }
  }
  embers(p: THREE.Vector3) {
    if (Math.random() > 0.3 * this.particleScale) return;
    const v = new THREE.Vector3((Math.random() - 0.5) * 0.3, 1 + Math.random(), (Math.random() - 0.5) * 0.3);
    this.emit(this.sparkTex, p, v, 0.05, 1.2, 0xff8a30, true, 0, -0.3);
  }

  private emit(tex: THREE.Texture, p: THREE.Vector3, v: THREE.Vector3, size: number, life: number, color: number, additive: boolean, grow: number, grav: number) {
    if (this.parts.length > 400) return;
    let s = this.pool.pop();
    if (!s) s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false }));
    const m = s.material as THREE.SpriteMaterial;
    m.map = tex;
    m.color.setHex(color);
    m.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    m.opacity = 1;
    m.needsUpdate = true;
    s.position.copy(p);
    s.scale.setScalar(size);
    this.scene.add(s);
    this.parts.push({ s, v, life, max: life, grow, grav });
  }

  setMark(id: number, on: boolean, pos?: THREE.Vector3, h = 2) {
    let s = this.markSprites.get(id);
    if (on && pos) {
      if (!s) {
        s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.markTex, transparent: true, depthTest: false, blending: THREE.AdditiveBlending }));
        s.scale.setScalar(0.5);
        s.renderOrder = 10;
        this.scene.add(s);
        this.markSprites.set(id, s);
      }
      s.position.set(pos.x, pos.y + h + 0.3 + Math.sin(performance.now() * 0.004) * 0.06, pos.z);
    } else if (s) { this.scene.remove(s); this.markSprites.delete(id); }
  }

  /** Staggered foe: a white glint at the chest says "critical strike is open". */
  setGlint(id: number, on: boolean, pos?: THREE.Vector3, h = 1.8) {
    let s = this.glints.get(id);
    if (on && pos) {
      if (!s) {
        s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.sparkTex, color: 0xffffff, transparent: true, depthTest: false, blending: THREE.AdditiveBlending }));
        s.renderOrder = 11;
        this.scene.add(s);
        this.glints.set(id, s);
      }
      const t = performance.now() * 0.012;
      s.scale.setScalar(0.35 + Math.abs(Math.sin(t)) * 0.25);
      s.position.set(pos.x, pos.y + h * 0.62, pos.z);
    } else if (s) { this.scene.remove(s); this.glints.delete(id); }
  }

  setSnare(id: number, on: boolean, pos?: THREE.Vector3, r = 0.6) {
    let m = this.snareRings.get(id);
    if (on && pos) {
      if (!m) {
        m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.03, 4, 18), new THREE.MeshStandardMaterial({ color: 0xc8a060, roughness: 0.9 }));
        m.rotation.x = Math.PI / 2;
        this.scene.add(m);
        this.snareRings.set(id, m);
      }
      m.position.set(pos.x, pos.y + 0.35, pos.z);
      m.rotation.z += 0.02;
    } else if (m) { this.scene.remove(m); this.snareRings.delete(id); }
  }

  update(dt: number) {
    for (const t of this.teles) {
      t.t += dt;
      if (t.follow) {
        const f = t.follow();
        if (f) this.place(t.mesh, f.x, f.z, f.yaw);
      }
      const u = t.mat.uniforms;
      if (t.t < t.windup) {
        u.uFill.value = t.t / t.windup;
        u.uAlpha.value = Math.min(1, t.t * 6);
        u.uActive.value = 0;
      } else if (t.t < t.windup + t.active) {
        u.uFill.value = 1; u.uActive.value = 1; u.uAlpha.value = 1.2;
      } else {
        u.uAlpha.value -= dt * 4;
        if (u.uAlpha.value <= 0) t.done = true;
      }
      if (t.done) { this.scene.remove(t.mesh); t.mesh.geometry.dispose(); t.mat.dispose(); }
    }
    this.teles = this.teles.filter((t) => !t.done);
    for (const p of this.parts) {
      p.life -= dt;
      p.v.y -= p.grav * dt;
      p.s.position.addScaledVector(p.v, dt);
      p.v.multiplyScalar(Math.exp(-2 * dt));
      p.s.scale.multiplyScalar(1 + p.grow * dt);
      (p.s.material as THREE.SpriteMaterial).opacity = Math.max(0, p.life / p.max);
      if (p.life <= 0) { this.scene.remove(p.s); this.pool.push(p.s); }
    }
    this.parts = this.parts.filter((p) => p.life > 0);
  }
}
