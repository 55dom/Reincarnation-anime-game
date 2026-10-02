// Weather: clear ↔ rain transitions driving sky overcast, surface wetness (shader), mud slow on
// roads, wind strength for grass/trees, rain streaks around the camera, and footprint decals.
import * as THREE from 'three';
import { wetUniform, windUniform } from '../world/terrain';
import { pathMask, heightAt, normalAt } from '../world/layout';
import { footprintTexture, pawprintTexture } from '../render/textures';
import { clamp, damp } from '../core/util';

export type WeatherKind = 'clear' | 'rain';

export class Weather {
  kind: WeatherKind = 'clear';
  rainAmt = 0;  // 0..1 visual intensity
  wet = 0;      // surface wetness lags behind rain
  private nextChange = 240 + Math.random() * 180;
  private rain: THREE.LineSegments;
  private rainPos: Float32Array;
  private count: number;
  private prints: { m: THREE.Mesh; life: number }[] = [];
  private printIdx = 0;
  private printMatBoot: THREE.MeshBasicMaterial;
  private printMatPaw: THREE.MeshBasicMaterial;
  private printGeo: THREE.PlaneGeometry;
  private pawGeo: THREE.PlaneGeometry;
  windDir = new THREE.Vector2(1, 0.25).normalize();
  windStrength = 0.6;
  onChange: (k: WeatherKind) => void = () => {};

  constructor(private scene: THREE.Scene, quality: number) {
    this.count = quality >= 2 ? 2400 : 1200;
    this.rainPos = new Float32Array(this.count * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
    this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xaab4c8, transparent: true, opacity: 0, depthWrite: false }));
    this.rain.frustumCulled = false;
    scene.add(this.rain);
    for (let i = 0; i < this.count; i++) this.resetDrop(i, new THREE.Vector3(), true);

    this.printMatBoot = new THREE.MeshBasicMaterial({ map: footprintTexture(), transparent: true, depthWrite: false, opacity: 0.5, polygonOffset: true, polygonOffsetFactor: -2 });
    this.printMatPaw = new THREE.MeshBasicMaterial({ map: pawprintTexture(), transparent: true, depthWrite: false, opacity: 0.5, polygonOffset: true, polygonOffsetFactor: -2 });
    this.printGeo = new THREE.PlaneGeometry(0.16, 0.3).rotateX(-Math.PI / 2);
    this.pawGeo = new THREE.PlaneGeometry(0.14, 0.14).rotateX(-Math.PI / 2);
    const max = quality >= 2 ? 160 : 80;
    for (let i = 0; i < max; i++) {
      const m = new THREE.Mesh(this.printGeo, this.printMatBoot.clone());
      m.visible = false;
      m.renderOrder = 1;
      scene.add(m);
      this.prints.push({ m, life: 0 });
    }
  }

  set(kind: WeatherKind) {
    if (this.kind === kind) return;
    this.kind = kind;
    this.nextChange = 240 + Math.random() * 240;
    this.onChange(kind);
  }
  toggle() { this.set(this.kind === 'clear' ? 'rain' : 'clear'); }

  private resetDrop(i: number, c: THREE.Vector3, randomY = false) {
    const x = c.x + (Math.random() - 0.5) * 50, z = c.z + (Math.random() - 0.5) * 50;
    const y = c.y + (randomY ? Math.random() * 30 - 5 : 22 + Math.random() * 6);
    const o = i * 6;
    this.rainPos[o] = x; this.rainPos[o + 1] = y; this.rainPos[o + 2] = z;
    this.rainPos[o + 3] = x - this.windDir.x * 0.15; this.rainPos[o + 4] = y + 0.7; this.rainPos[o + 5] = z - this.windDir.y * 0.15;
  }

  /** Surface mud factor at a point (0..1) — slows movement on soaked roads. */
  mudAt(x: number, z: number) { return this.wet * pathMask(x, z); }

  footprint(p: THREE.Vector3, yaw: number, paw = false) {
    const slot = this.prints[this.printIdx];
    this.printIdx = (this.printIdx + 1) % this.prints.length;
    const m = slot.m;
    m.geometry = paw ? this.pawGeo : this.printGeo;
    const mat = m.material as THREE.MeshBasicMaterial;
    mat.map = paw ? this.printMatPaw.map : this.printMatBoot.map;
    const gy = heightAt(p.x, p.z);
    if (p.y > gy + 0.3) { m.position.set(p.x, p.y + 0.035, p.z); m.rotation.set(0, yaw, 0); }
    else {
      m.position.set(p.x, gy + 0.035, p.z);
      const n = normalAt(p.x, p.z);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(n[0], n[1], n[2]));
      m.rotateY(yaw);
    }
    m.visible = true;
    slot.life = 1;
  }

  update(dt: number, camPos: THREE.Vector3, time: number) {
    this.nextChange -= dt;
    if (this.nextChange <= 0) this.toggle();
    const target = this.kind === 'rain' ? 1 : 0;
    this.rainAmt = damp(this.rainAmt, target, 0.5, dt);
    this.wet = damp(this.wet, target, this.kind === 'rain' ? 0.12 : 0.05, dt);
    wetUniform.value = this.wet;
    this.windStrength = 0.6 + this.rainAmt * 0.9 + Math.sin(time * 0.05) * 0.2;
    windUniform.value.set(this.windDir.x * this.windStrength, this.windDir.y * this.windStrength);

    const rm = this.rain.material as THREE.LineBasicMaterial;
    rm.opacity = this.rainAmt * 0.55;
    this.rain.visible = this.rainAmt > 0.02;
    if (this.rain.visible) {
      const fall = 22 * dt;
      const active = Math.floor(this.count * clamp(this.rainAmt * 1.2, 0, 1));
      for (let i = 0; i < this.count; i++) {
        const o = i * 6;
        if (i >= active) { this.rainPos[o + 1] = this.rainPos[o + 4] = -1000; continue; }
        this.rainPos[o + 1] -= fall; this.rainPos[o + 4] -= fall;
        this.rainPos[o] += this.windDir.x * fall * 0.12; this.rainPos[o + 3] += this.windDir.x * fall * 0.12;
        this.rainPos[o + 2] += this.windDir.y * fall * 0.12; this.rainPos[o + 5] += this.windDir.y * fall * 0.12;
        const x = this.rainPos[o], z = this.rainPos[o + 2];
        if (this.rainPos[o + 1] < camPos.y - 8 || this.rainPos[o + 1] < heightAt(x, z) || Math.abs(x - camPos.x) > 26 || Math.abs(z - camPos.z) > 26) this.resetDrop(i, camPos);
      }
      (this.rain.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }

    // Footprints: deeper/longer-lived in wet sand, fade over time
    const lifeRate = 1 / (this.wet > 0.4 ? 40 : 22);
    for (const p of this.prints) {
      if (!p.m.visible) continue;
      p.life -= dt * lifeRate;
      (p.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, p.life) * (0.28 + this.wet * 0.45);
      if (p.life <= 0) p.m.visible = false;
    }
  }
}
