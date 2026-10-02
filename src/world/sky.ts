// Day/night cycle: sun path drives the directional light, sky gradient, fog, stars and god-ray streaks.
import * as THREE from 'three';
import { clamp, lerp, mulberry32 } from '../core/util';

interface Palette { zen: THREE.Color; hor: THREE.Color; sun: THREE.Color; amb: THREE.Color; ground: THREE.Color; fog: THREE.Color; sunI: number; ambI: number }
const C = (h: number) => new THREE.Color(h);
const PALETTES: [number, Palette][] = [
  [0, { zen: C(0x05070f), hor: C(0x1a1420), sun: C(0x6070a0), amb: C(0x303a5a), ground: C(0x1a1010), fog: C(0x141018), sunI: 0.5, ambI: 0.75 }],
  [5.2, { zen: C(0x101530), hor: C(0x3a2030), sun: C(0x806080), amb: C(0x403050), ground: C(0x201410), fog: C(0x2a1a22), sunI: 0.4, ambI: 0.75 }],
  [6.3, { zen: C(0x3a4a78), hor: C(0xe0784a), sun: C(0xff9a5a), amb: C(0x806070), ground: C(0x4a2a18), fog: C(0xb06a4a), sunI: 1.8, ambI: 0.9 }],
  [8, { zen: C(0x5a82b8), hor: C(0xe8b088), sun: C(0xffd8a8), amb: C(0x9aa0b0), ground: C(0x6a3a22), fog: C(0xd8a888), sunI: 2.8, ambI: 1.1 }],
  [12, { zen: C(0x4a7ab8), hor: C(0xe0c0a0), sun: C(0xfff0d8), amb: C(0xa8b0c0), ground: C(0x7a4428), fog: C(0xe0bc98), sunI: 3.2, ambI: 1.2 }],
  [16.5, { zen: C(0x5878a8), hor: C(0xe8a878), sun: C(0xffd0a0), amb: C(0x9a98a8), ground: C(0x6a3a22), fog: C(0xd8a080), sunI: 2.8, ambI: 1.1 }],
  [18.2, { zen: C(0x4a3a68), hor: C(0xff6a3a), sun: C(0xff7a40), amb: C(0x805060), ground: C(0x4a2010), fog: C(0xb0583a), sunI: 1.8, ambI: 0.9 }],
  [19.4, { zen: C(0x151a38), hor: C(0x5a2838), sun: C(0x806080), amb: C(0x403050), ground: C(0x201010), fog: C(0x2a1820), sunI: 0.45, ambI: 0.75 }],
  [24, { zen: C(0x05070f), hor: C(0x1a1420), sun: C(0x6070a0), amb: C(0x303a5a), ground: C(0x1a1010), fog: C(0x141018), sunI: 0.5, ambI: 0.75 }],
];

function samplePalette(h: number): Palette {
  for (let i = 0; i < PALETTES.length - 1; i++) {
    const [ta, a] = PALETTES[i], [tb, b] = PALETTES[i + 1];
    if (h >= ta && h <= tb) {
      const t = (h - ta) / (tb - ta);
      return {
        zen: a.zen.clone().lerp(b.zen, t), hor: a.hor.clone().lerp(b.hor, t), sun: a.sun.clone().lerp(b.sun, t),
        amb: a.amb.clone().lerp(b.amb, t), ground: a.ground.clone().lerp(b.ground, t), fog: a.fog.clone().lerp(b.fog, t),
        sunI: lerp(a.sunI, b.sunI, t), ambI: lerp(a.ambI, b.ambI, t),
      };
    }
  }
  return PALETTES[0][1];
}

export class Sky {
  hour = 8.6;
  dayLengthSec = 16 * 60; // a full 24h cycle in 16 real minutes
  sunDir = new THREE.Vector3();
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  dome: THREE.Mesh;
  rays: THREE.Sprite;
  private uni: Record<string, THREE.IUniform>;
  overcast = 0; // 0 clear .. 1 storm (set by weather)
  isNight = false;
  fogColor = new THREE.Color();

  constructor(private scene: THREE.Scene, shadowSize: number) {
    this.uni = {
      uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSun: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3() }, uSunVis: { value: 1 }, uNight: { value: 0 }, uOvercast: { value: 0 }, uTime: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uni,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: `
        uniform vec3 uZen, uHor, uSun, uSunDir; uniform float uSunVis, uNight, uOvercast, uTime; varying vec3 vDir;
        float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5); }
        float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
        void main(){
          vec3 d = normalize(vDir);
          float h = clamp(d.y, -0.2, 1.0);
          vec3 col = mix(uHor, uZen, pow(max(h, 0.0), 0.55));
          col = mix(col, uHor * 0.55, smoothstep(0.0, -0.2, d.y));
          float sd = max(dot(d, normalize(uSunDir)), 0.0);
          // horizon dust glow toward the sun
          col += uSun * pow(sd, 6.0) * 0.35 * (1.0 - uOvercast * 0.8);
          // sun disc + halo (hidden when overcast)
          float disc = smoothstep(0.9993, 0.9996, sd);
          col += uSun * (disc * 6.0 + pow(sd, 220.0) * 1.5) * uSunVis * (1.0 - uOvercast);
          // drifting high cloud streaks
          vec2 cp = d.xz / max(d.y + 0.15, 0.05) * 1.2 + vec2(uTime * 0.01, 0.0);
          float cl = smoothstep(0.45, 0.85, n2(cp * 1.3) * 0.6 + n2(cp * 3.7) * 0.4);
          cl = mix(cl * 0.5, 1.0, uOvercast) * smoothstep(0.0, 0.15, d.y);
          vec3 cloudCol = mix(uHor * 1.1 + uSun * 0.15, vec3(0.32, 0.3, 0.32) * (1.0 - uNight * 0.8), uOvercast);
          col = mix(col, cloudCol, cl * 0.75);
          // stars
          float st = step(0.9975, h21(floor(d.xz / (d.y + 1.0) * 380.0))) * smoothstep(0.05, 0.3, d.y);
          col += vec3(st) * uNight * (1.0 - uOvercast) * 0.9;
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 12), mat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    scene.add(this.dome);

    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.castShadow = shadowSize > 0;
    if (shadowSize > 0) {
      this.sun.shadow.mapSize.set(shadowSize, shadowSize);
      const sc = this.sun.shadow.camera;
      sc.left = -28; sc.right = 28; sc.top = 28; sc.bottom = -28; sc.near = 1; sc.far = 160;
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.04;
    }
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x442211, 0.6);
    scene.add(this.hemi);

    this.rays = new THREE.Sprite(new THREE.SpriteMaterial({ map: raysTexture(), color: 0xffd8a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.0 }));
    this.rays.scale.set(260, 260, 1);
    this.rays.renderOrder = -5;
    scene.add(this.rays);
  }

  update(dt: number, camPos: THREE.Vector3, focus: THREE.Vector3, time: number) {
    this.hour = (this.hour + (dt / this.dayLengthSec) * 24) % 24;
    const ang = ((this.hour - 6) / 12) * Math.PI; // 0 at sunrise, PI at sunset
    const elev = Math.sin(ang);
    // Sun travels east→south→west, tilted
    this.sunDir.set(Math.cos(ang) * 0.85, elev, -0.45 + Math.sin(ang) * 0.1).normalize();
    this.isNight = elev < -0.05;
    const pal = samplePalette(this.hour);
    const oc = this.overcast;
    const grey = new THREE.Color(0x5a5860);
    const zen = pal.zen.clone().lerp(grey.clone().multiplyScalar(this.isNight ? 0.3 : 1), oc * 0.75);
    const hor = pal.hor.clone().lerp(grey.clone().multiplyScalar(this.isNight ? 0.35 : 1.1), oc * 0.75);
    this.uni.uZen.value.copy(zen);
    this.uni.uHor.value.copy(hor);
    this.uni.uSun.value.copy(pal.sun);
    this.uni.uSunDir.value.copy(this.sunDir);
    this.uni.uSunVis.value = clamp(elev * 8 + 0.4, 0, 1);
    this.uni.uNight.value = clamp(-elev * 5, 0, 1);
    this.uni.uOvercast.value = oc;
    this.uni.uTime.value = time;
    this.dome.position.copy(camPos);

    // Light: sun by day, cool moonlight by night (moon opposite the sun)
    const lightDir = this.isNight ? this.sunDir.clone().negate().setY(Math.abs(this.sunDir.y) + 0.35).normalize() : this.sunDir.clone();
    if (!this.isNight && lightDir.y < 0.08) lightDir.y = 0.08;
    this.sun.position.copy(focus).addScaledVector(lightDir, 80);
    this.sun.target.position.copy(focus);
    this.sun.color.copy(pal.sun);
    this.sun.intensity = pal.sunI * (1 - oc * 0.7);
    this.hemi.color.copy(pal.amb).lerp(grey, oc * 0.5);
    this.hemi.groundColor.copy(pal.ground);
    this.hemi.intensity = pal.ambI * (1 + oc * 0.2);
    this.fogColor.copy(pal.fog).lerp(grey.clone().multiplyScalar(this.isNight ? 0.25 : 0.9), oc * 0.8);

    // God rays: strongest at low sun, clear sky
    const low = clamp(1 - Math.abs(elev - 0.25) * 2.2, 0, 1);
    const sm = this.rays.material as THREE.SpriteMaterial;
    sm.opacity = (this.isNight ? 0 : 1) * (1 - oc) * (0.12 + low * 0.35);
    sm.color.copy(pal.sun);
    sm.rotation = time * 0.01;
    this.rays.position.copy(camPos).addScaledVector(this.sunDir, 330);
  }
}

function raysTexture() {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const g = c.getContext('2d')!;
  const rnd = mulberry32(99);
  g.translate(s / 2, s / 2);
  for (let i = 0; i < 48; i++) {
    const a = rnd() * Math.PI * 2;
    const w = 0.02 + rnd() * 0.06;
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, s / 2);
    const al = 0.05 + rnd() * 0.12;
    grd.addColorStop(0, `rgba(255,255,255,${al})`);
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, s / 2, a, a + w); g.closePath(); g.fill();
  }
  const core = g.createRadialGradient(0, 0, 0, 0, 0, s / 2);
  core.addColorStop(0, 'rgba(255,255,255,0.6)');
  core.addColorStop(0.15, 'rgba(255,255,255,0.15)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = core; g.fillRect(-s / 2, -s / 2, s, s);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
