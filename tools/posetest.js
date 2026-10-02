import * as THREE from 'three';
import { Humanoid } from '../src/chars/humanoid.js';
import { POSE } from '../src/chars/anim.js';
const q = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setSize(innerWidth, innerHeight); renderer.shadowMap.enabled = true;
renderer.setClearColor(0x9ab8d8);
document.getElementById('game').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.add(new THREE.HemisphereLight(0xffffff, 0x666655, 1.2)); const d = new THREE.DirectionalLight(0xffffff, 2); d.position.set(3, 6, 5); scene.add(d);
const poses = (q.get('poses') || 'rest,guard,l1Wind,l1Hit,l2Wind,l2Hit,hWind,hHit,rWind,rHit,block,runSwordA').split(',');
const cam = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 100);
const view = q.get('view') || 'front';
const looks = [
  { hair: 0x2a2a3a, hairStyle: 'spiky', eye: 0x3a9ad8, top: 0x23324f, bottom: 0x2e2e3a, coat: 0x1d2740, scarf: 0xc8302a, accent: 0xd8c8a0 },
  { build: 'female', hair: 0xe8a0c8, hairStyle: 'long', eye: 0x5ac88a, faceStyle: 'heroine', top: 0xf0f0f8, bottom: 0x6a8ad8, skirt: 0x6a8ad8, accent: 0xd8b04a, ahoge: true },
];
const L = looks[+(q.get('look') || 0)];
poses.forEach((p, i) => {
  const h = new Humanoid(L); h.attachWeapon(q.get('w') || 'iron');
  h.applyPose(POSE[p]);
  const cols = Math.min(poses.length, 6);
  h.root.position.set((i % cols - (cols - 1) / 2) * 1.3, -Math.floor(i / cols) * 2.2, 0);
  if (view === 'side') h.root.rotation.y = -Math.PI / 2; if (view === 'q') h.root.rotation.y = -0.7;
  scene.add(h.root);
});
const rows = Math.ceil(poses.length / 6);
const zoom = +(q.get('zoom') || 1);
const ty = +(q.get('ty') || (1 - (rows - 1) * 1.1)); cam.position.set(0, ty, 9 * Math.max(1, rows * 0.75) / zoom); cam.lookAt(0, ty, 0);
renderer.render(scene, cam);
window.__done = true;
