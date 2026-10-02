// Terrain mesh with sand/road blending, rain wetness and mud puddles injected into the standard PBR shader.
import * as THREE from 'three';
import { heightAt, pathMask, fieldMask, WORLD_SIZE, SITES, FORT_RADIUS } from './layout';
import { sandTex, pathTex } from '../render/textures';
import { fbm } from '../core/util';

export const wetUniform = { value: 0 };   // 0 dry .. 1 soaked (shared by props)
export const windUniform = { value: new THREE.Vector2(1, 0.3) };
export const timeUniform = { value: 0 };

export function buildTerrain(segments: number): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const pathA = new Float32Array(pos.count);
  const tint = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, heightAt(x, z));
    let pm = pathMask(x, z);
    // City streets: a paved disc
    const dc = Math.hypot(x, z);
    if (dc < 44) pm = Math.max(pm, 0.75);
    // Fort floor: packed stone dust
    if (Math.hypot(x - SITES.fort.x, z - SITES.fort.z) < FORT_RADIUS) pm = Math.max(pm, 0.9);
    pathA[i] = pm;
    // Painted colour variation: redder crests, paler hollows
    const n = fbm(x * 0.02, z * 0.02, 3, 77);
    let r = 1.0 + (n - 0.5) * 0.25, g = 0.95 + (n - 0.5) * 0.15, b = 0.92 + (n - 0.5) * 0.1;
    // Under grass fields the ground turns olive-gold (thatch and dry roots), so gaps never read as bare sand
    const f = Math.min(1, fieldMask(x, z) * 1.6);
    r *= 1 - f * 0.22; g *= 1 + f * 0.02; b *= 1 - f * 0.45;
    tint[i * 3] = r; tint[i * 3 + 1] = g; tint[i * 3 + 2] = b;
  }
  geo.setAttribute('aPath', new THREE.BufferAttribute(pathA, 1));
  geo.setAttribute('color', new THREE.BufferAttribute(tint, 3));
  geo.computeVertexNormals();

  const sand = sandTex();
  const road = pathTex();
  const rep = WORLD_SIZE / 9;
  sand.map.repeat.set(rep, rep);
  sand.normalMap.repeat.set(rep, rep);
  const m = new THREE.MeshStandardMaterial({ map: sand.map, normalMap: sand.normalMap, roughness: 0.95, metalness: 0, vertexColors: true });
  m.normalScale.set(0.6, 0.6);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWet = wetUniform;
    sh.uniforms.uRoad = { value: road.map };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aPath; varying float vPath; varying vec3 vWPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPath = aPath; vWPos = (modelMatrix * vec4(position,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uWet; uniform sampler2D uRoad; varying float vPath; varying vec3 vWPos;\nfloat wetMask = 0.0;')
      .replace('#include <map_fragment>', `
        vec4 sandC = texture2D(map, vMapUv);
        vec4 roadC = texture2D(uRoad, vWPos.xz / 5.0);
        float pm = smoothstep(0.15, 0.85, vPath + (sandC.r - 0.5) * 0.4);
        vec4 baseC = mix(sandC, roadC, pm);
        // Rain: everything darkens; roads collect mud puddles
        float puddle = smoothstep(0.55, 0.75, roadC.g * 1.4 - 0.2 + sin(vWPos.x * 0.7) * 0.05) * pm;
        wetMask = uWet * (0.6 + 0.4 * pm);
        baseC.rgb *= mix(1.0, 0.55, wetMask);
        baseC.rgb = mix(baseC.rgb, vec3(0.16, 0.1, 0.07), puddle * uWet * 0.75);
        diffuseColor *= baseC;
      `)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.28, wetMask);
      `);
  };
  const mesh = new THREE.Mesh(geo, m);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

/** Applies vertex wind to any standard/lambert material whose geometry is instanced. Height factor from local y. */
export function addWind(m: THREE.Material, strength = 0.25, heightScale = 1) {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = windUniform;
    sh.uniforms.uTime = timeUniform;
    sh.uniforms.uWet = wetUniform;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform vec2 uWind; uniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec4 wp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            wp = instanceMatrix * wp;
          #endif
          wp = modelMatrix * wp;
          float hgt = max(position.y, 0.0) * ${heightScale.toFixed(3)};
          float gust = sin(uTime * 1.6 + wp.x * 0.15 + wp.z * 0.11) * 0.5 + 0.5;
          float flutter = sin(uTime * 7.0 + wp.x * 1.7 + wp.z * 1.3) * 0.15;
          vec2 w = uWind * (gust * 0.8 + 0.2 + flutter) * ${strength.toFixed(3)} * hgt * hgt;
          #ifdef USE_INSTANCING
            // convert world-space push into instance-local space (uniform scale + yaw only)
            mat3 im = mat3(instanceMatrix);
            vec3 lw = transpose(im) * vec3(w.x, 0.0, w.y) / max(dot(im[0], im[0]), 1e-4);
            transformed += lw;
          #else
            transformed.xz += w;
          #endif
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uWet;')
      .replace('#include <map_fragment>', '#include <map_fragment>\n diffuseColor.rgb *= mix(1.0, 0.7, uWet);');
  };
  m.customProgramCacheKey = () => 'wind' + strength + heightScale;
}
