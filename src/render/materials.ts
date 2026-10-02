// Shared material factory: painted texture + normal map, tinted per character/prop.
import * as THREE from 'three';
import { clothTex, leatherTex, metalTex, skinTex, furTex, woodTex, stoneTex, barkTex } from './textures';

const pool = new Map<string, THREE.MeshStandardMaterial>();

export type Surface = 'cloth' | 'leather' | 'metal' | 'skin' | 'fur' | 'wood' | 'stone' | 'bark' | 'plain';

export function mat(surface: Surface, color: number, opts: { rough?: number; metal?: number; flat?: boolean; emissive?: number; unique?: boolean; side?: THREE.Side } = {}): THREE.MeshStandardMaterial {
  const key = `${surface}|${color}|${opts.rough}|${opts.metal}|${opts.flat}|${opts.emissive}|${opts.side}`;
  if (!opts.unique) {
    const m = pool.get(key);
    if (m) return m;
  }
  const set = surface === 'cloth' ? clothTex() : surface === 'leather' ? leatherTex() : surface === 'metal' ? metalTex()
    : surface === 'skin' ? skinTex() : surface === 'fur' ? furTex() : surface === 'wood' ? woodTex()
    : surface === 'stone' ? stoneTex() : surface === 'bark' ? barkTex() : null;
  const defaults: Record<Surface, [number, number]> = {
    cloth: [0.95, 0], leather: [0.75, 0], metal: [0.38, 0.85], skin: [0.7, 0], fur: [0.95, 0],
    wood: [0.85, 0], stone: [0.92, 0], bark: [0.95, 0], plain: [0.8, 0],
  };
  const m = new THREE.MeshStandardMaterial({
    color,
    map: set?.map ?? null,
    normalMap: set?.normalMap ?? null,
    roughness: opts.rough ?? defaults[surface][0],
    metalness: opts.metal ?? defaults[surface][1],
    flatShading: opts.flat ?? (surface === 'metal' || surface === 'stone'),
    emissive: opts.emissive ?? 0x000000,
    side: opts.side ?? THREE.FrontSide,
  });
  if (m.normalMap) m.normalScale.set(0.8, 0.8);
  if (!opts.unique) pool.set(key, m);
  return m;
}
