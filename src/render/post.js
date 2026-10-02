// Post-processing: radial motion blur, chromatic aberration, impact frames (inverted / ink),
// digital glitch for the "System", vignette and grading.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { damp } from '../core/util.js';

const AnimeShader = {
  uniforms: {
    tDiffuse: { value: null }, time: { value: 0 }, radial: { value: 0 }, center: { value: new THREE.Vector2(0.5, 0.5) },
    chroma: { value: 0 }, impact: { value: 0 }, glitch: { value: 0 }, vignette: { value: 0.35 }, sat: { value: 1.08 },
    tint: { value: new THREE.Vector3(1, 1, 1) }, desat: { value: 0 }, aspect: { value: 1 }, grain: { value: 0 }, cine: { value: 0 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float time, radial, chroma, impact, glitch, vignette, sat, desat, aspect, grain, cine;
    uniform vec2 center; uniform vec3 tint; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      // glitch: horizontal block displacement
      if (glitch > 0.0) {
        float row = floor(uv.y * 24.0 + floor(time * 18.0));
        float h = hash(vec2(row, floor(time * 30.0)));
        if (h < glitch * 0.6) uv.x += (hash(vec2(row, 3.1)) - 0.5) * 0.12 * glitch;
        float blk = hash(floor(uv * vec2(12.0, 8.0)) + floor(time * 12.0));
        if (blk < glitch * 0.08) uv = floor(uv * 40.0) / 40.0;
      }
      vec2 dir = uv - center;
      vec3 col = vec3(0.0);
      if (radial > 0.001) {
        float w = 0.0;
        for (int i = 0; i < 10; i++) {
          float s = 1.0 - radial * float(i) / 10.0 * 0.12;
          float ww = 1.0 - float(i) / 10.0;
          col += texture2D(tDiffuse, center + dir * s).rgb * ww; w += ww;
        }
        col /= w;
      } else {
        col = texture2D(tDiffuse, uv).rgb;
      }
      float ca = chroma * 0.012 + glitch * 0.01;
      if (ca > 0.0001) {
        col.r = mix(col.r, texture2D(tDiffuse, uv + dir * ca).r, 0.85);
        col.b = mix(col.b, texture2D(tDiffuse, uv - dir * ca).b, 0.85);
      }
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, sat);
      col = mix(col, vec3(l), desat);
      col *= tint;
      // impact frame: 0..1 inverted high-contrast ink, 1..2 white silhouette
      if (impact > 0.0) {
        float ink = step(0.32, l);
        vec3 inv = vec3(1.0 - ink);
        if (impact > 1.0) inv = mix(vec3(1.0 - ink), vec3(ink) * vec3(1.0, 0.95, 0.9), impact - 1.0);
        col = mix(col, inv, clamp(impact, 0.0, 1.0));
      }
      if (glitch > 0.0) {
        float scan = step(0.5, fract(vUv.y * 180.0 + time * 40.0)) * 0.08 * glitch;
        col -= scan; col += vec3(0.0, 0.2, 0.35) * glitch * hash(vec2(floor(time * 20.0), floor(vUv.y * 30.0))) * 0.4;
      }
      // cinematic grade: lifted blacks with a cool shadow / warm highlight split, plus film grain
      if (cine > 0.0) {
        float lum = dot(col, vec3(0.299, 0.587, 0.114));
        vec3 graded = col * 0.94 + 0.02 + mix(vec3(-0.01, 0.0, 0.03), vec3(0.03, 0.015, -0.01), lum);
        col = mix(col, graded, cine);
      }
      if (grain > 0.0) col += (hash(vUv * vec2(1920.0, 1080.0) + fract(time * 24.0) * 91.7) - 0.5) * grain;
      vec2 vv = vUv - 0.5; vv.x *= aspect;
      col *= 1.0 - vignette * smoothstep(0.35, 0.95, length(vv));
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Post {
  constructor(renderer, scene, camera, { msaa = 4 } = {}) {
    // multisampled HDR target so edges stay clean through the post chain
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: msaa });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.pass = new ShaderPass(AnimeShader);
    this.composer.addPass(this.pass);
    this.composer.addPass(new OutputPass());
    this.u = this.pass.uniforms;
    this.radialT = 0; this.chromaT = 0; this.glitchT = 0; this.impactFrames = 0; this.impactMode = 1;
    this.radial = 0; this.chroma = 0; this.glitch = 0; this.desatT = 0;
    this.baseVignette = 0.35;
  }
  /** Change MSAA sample count live (the targets are re-allocated on next render). */
  setSamples(n) {
    for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) if (rt.samples !== n) { rt.samples = n; rt.dispose(); }
  }
  setSize(w, h) { this.composer.setSize(w, h); this.u.aspect.value = w / h; }
  /** Strong one/two frame "impact frame" in anime style. */
  impactFrame(frames = 2, mode = 1) { this.impactFrames = Math.max(this.impactFrames, frames); this.impactMode = mode; }
  blur(amount = 1, center) { this.radial = Math.max(this.radial, amount); if (center) this.u.center.value.copy(center); else this.u.center.value.set(0.5, 0.5); }
  aberrate(a = 1) { this.chroma = Math.max(this.chroma, a); }
  glitchFor(a = 1) { this.glitch = Math.max(this.glitch, a); }
  render(rdt) {
    const u = this.u;
    u.time.value += rdt;
    this.radial = Math.max(this.radialT, damp(this.radial, 0, 7, rdt));
    this.chroma = Math.max(this.chromaT, damp(this.chroma, 0, 6, rdt));
    this.glitch = Math.max(this.glitchT, damp(this.glitch, 0, 5, rdt));
    u.radial.value = this.radial; u.chroma.value = this.chroma; u.glitch.value = this.glitch;
    u.desat.value = damp(u.desat.value, this.desatT, 5, rdt);
    if (this.impactFrames > 0) { u.impact.value = this.impactMode; this.impactFrames--; } else u.impact.value = 0;
    this.cine = damp(this.cine || 0, this.cineT || 0, 3, rdt);
    u.cine.value = this.cine; u.grain.value = this.cine * 0.016;
    u.vignette.value = this.baseVignette + this.radial * 0.2 + this.cine * 0.22;
    this.composer.render(rdt);
  }
}
