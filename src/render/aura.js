// Anime battle aura: two layered flame shells (stepped, hand-drawn timing), a spinning ground
// sigil and rising motes/streaks. Driven by a 0..1+ intensity that eases toward a target.
import * as THREE from 'three';
import { FX } from './fx.js';
import { Time } from '../core/time.js';
import { damp } from '../core/util.js';
import { Audio } from '../core/audio.js';

const flameVS = /* glsl */`
  varying vec2 vUv; varying vec3 vN; varying vec3 vView;
  void main(){
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vView = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const flameFS = /* glsl */`
  uniform float time, intensity, speed, steps, seed;
  uniform vec3 color, core;
  varying vec2 vUv; varying vec3 vN; varying vec3 vView;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
  }
  void main(){
    float t = floor(time * steps) / steps; // held frames, like drawn effects animation
    vec2 p = vec2(vUv.x * 7.0 + seed, vUv.y * 2.6 - t * speed);
    float n = vnoise(p) * 0.6 + vnoise(p * 2.1 + 3.7) * 0.3 + vnoise(p * 4.3 - 1.3) * 0.1;
    // tongues of flame: taller in a few columns, licking upward
    float tongues = 0.55 + 0.45 * sin(vUv.x * 6.2831 * 4.0 + seed + floor(time * steps * 0.5));
    float h = 1.0 - vUv.y;
    float shape = n * (0.55 + 0.6 * tongues) * pow(h, 0.9) + h * 0.35 - 0.25;
    float rim = 1.0 - abs(dot(normalize(vN), vView));
    float a = smoothstep(0.18, 0.42, shape) * (0.35 + rim * 0.9);
    float hot = smoothstep(0.42, 0.7, shape);
    vec3 c = mix(color, core, hot);
    a *= intensity * smoothstep(0.0, 0.08, vUv.y + 0.02);
    if (a < 0.01) discard;
    gl_FragColor = vec4(c * a * 1.6, a);
  }`;
const sigilFS = /* glsl */`
  uniform float time, intensity; uniform vec3 color; varying vec2 vUv;
  void main(){
    vec2 p = vUv - 0.5; float r = length(p) * 2.0; float ang = atan(p.y, p.x);
    float ring = smoothstep(0.08, 0.0, abs(r - 0.82)) + smoothstep(0.05, 0.0, abs(r - 0.62)) * 0.7;
    float ticks = step(0.7, fract(ang * 3.8197 + time * 0.5)) * smoothstep(0.06, 0.0, abs(r - 0.72));
    float glow = smoothstep(1.0, 0.2, r) * 0.25;
    float a = (ring + ticks + glow) * intensity * (0.8 + 0.2 * sin(time * 6.0));
    if (a < 0.01) discard;
    gl_FragColor = vec4(color * a * 1.5, a);
  }`;
const plainVS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

function flameMat(color, { speed = 2.2, steps = 12, seed = 0 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, intensity: { value: 0 }, speed: { value: speed }, steps: { value: steps }, seed: { value: seed }, color: { value: new THREE.Color(color) }, core: { value: new THREE.Color(0xffffff) } },
    vertexShader: flameVS, fragmentShader: flameFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

export class Aura {
  constructor(scene, { color = 0x7fdcff, height = 1.9, radius = 0.7 } = {}) {
    this.scene = scene; this.height = height; this.radius = radius;
    this.group = new THREE.Group(); this.group.visible = false; scene.add(this.group);
    const outerG = new THREE.CylinderGeometry(radius * 0.55, radius, height * 1.45, 24, 6, true); outerG.translate(0, height * 0.72, 0);
    const innerG = new THREE.CylinderGeometry(radius * 0.4, radius * 0.75, height * 1.15, 20, 4, true); innerG.translate(0, height * 0.57, 0);
    this.outer = new THREE.Mesh(outerG, flameMat(color, { speed: 2.4, steps: 12, seed: 1.3 }));
    this.inner = new THREE.Mesh(innerG, flameMat(color, { speed: 3.4, steps: 16, seed: 7.9 }));
    this.sigil = new THREE.Mesh(new THREE.PlaneGeometry(radius * 3.6, radius * 3.6), new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, intensity: { value: 0 }, color: { value: new THREE.Color(color) } },
      vertexShader: plainVS, fragmentShader: sigilFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    this.sigil.rotation.x = -Math.PI / 2; this.sigil.position.y = 0.06;
    for (const m of [this.outer, this.inner, this.sigil]) { m.renderOrder = 5; m.frustumCulled = false; this.group.add(m); }
    this.level = 0; this.target = 0; this.color = new THREE.Color(color); this.flicker = 0;
    this.moteT = 0; this.streakT = 0;
  }
  setColor(c) {
    this.color.set(c);
    this.outer.material.uniforms.color.value.copy(this.color); this.inner.material.uniforms.color.value.copy(this.color);
    this.sigil.material.uniforms.color.value.copy(this.color);
  }
  /** Ignite with a shockwave ring, motes and a flare sound. */
  burst(pos, power = 1) {
    this.level = Math.max(this.level, 1.1 * power);
    const c = this.color.toArray();
    FX.ring(pos, { color: this.color.getHex(), from: 0.5, to: 6 * power, dur: 0.45, y: 0.1 });
    const mid = pos.clone().setY(pos.y + this.height * 0.55);
    FX.ring(mid, { color: 0xffffff, from: 0.3, to: 3.5 * power, dur: 0.3, y: 0, vertical: FX.camera.position.clone().sub(mid).normalize(), opacity: 0.6 });
    FX.glowBurst(pos.clone().setY(pos.y + 1), { count: 18, color: c, speed: 6 * power, size: 0.5, life: 0.6, up: 3 });
    FX.dustAt(pos, { count: 10, speed: 6, size: 1, up: 0.2 });
    Audio.play('auraFlare', power);
  }
  update(pos, yaw = 0) {
    const rdt = Time.rdt;
    this.level = damp(this.level, this.target, this.target > this.level ? 6 : 3, rdt);
    const lv = this.level * (this.flicker ? 0.7 + 0.3 * Math.sin(Time.real * 23) * Math.sin(Time.real * 7) : 1);
    const on = lv > 0.02; this.group.visible = on;
    if (!on) return;
    this.group.position.copy(pos);
    const t = Time.real;
    for (const m of [this.outer, this.inner]) { m.material.uniforms.time.value = t; m.material.uniforms.intensity.value = Math.min(1.4, lv); }
    this.inner.material.uniforms.intensity.value = Math.min(1.2, lv * 0.9);
    this.sigil.material.uniforms.time.value = t; this.sigil.material.uniforms.intensity.value = Math.min(1, lv * 0.8);
    this.sigil.rotation.z = t * 0.8;
    const pulse = 1 + Math.sin(t * 9) * 0.03 * lv;
    this.outer.scale.set(pulse, 0.85 + lv * 0.15, pulse); this.inner.rotation.y = -t * 1.5; this.outer.rotation.y = t * 0.9;
    // rising motes and occasional upward streaks
    this.moteT -= rdt; this.streakT -= rdt;
    const c = this.color.toArray();
    if (this.moteT <= 0) {
      this.moteT = 0.09 / Math.max(0.3, lv);
      const a = Math.random() * 6.283, r = this.radius * (0.4 + Math.random() * 0.7);
      FX.glow.spawn({ x: pos.x + Math.cos(a) * r, y: pos.y + Math.random() * this.height, z: pos.z + Math.sin(a) * r, vx: 0, vy: 2 + Math.random() * 2.5 * lv, vz: 0, life: 0.5 + Math.random() * 0.5, size: 0.18 + Math.random() * 0.2, r: c[0], g: c[1], b: c[2], grav: -1, drag: 0.5 });
    }
    if (lv > 0.6 && this.streakT <= 0) {
      this.streakT = 0.12 / lv;
      const a = Math.random() * 6.283, r = this.radius * 0.8;
      FX.sparks.spawn({ x: pos.x + Math.cos(a) * r, y: pos.y + 0.2, z: pos.z + Math.sin(a) * r, vx: 0, vy: 8 + Math.random() * 6, vz: 0, life: 0.25, size: 0.1, r: Math.min(1, c[0] + 0.4), g: Math.min(1, c[1] + 0.4), b: Math.min(1, c[2] + 0.4), grav: -4, drag: 1, stretch: 0.12 });
    }
  }
  dispose() { this.scene.remove(this.group); }
}
