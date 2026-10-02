// Procedurally drawn anime faces (big glossy eyes, brows, tiny nose, expressive mouths)
// rendered into canvas textures and swapped per expression.
import * as THREE from 'three';

const cache = new Map();
export const EXPRESSIONS = ['neutral', 'blink', 'happy', 'angry', 'shout', 'hurt', 'surprised', 'determined', 'sad', 'smug', 'pain', 'dead'];

function rgba(hex, a = 1) { const c = new THREE.Color(hex); return `rgba(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0},${a})`; }
function shade(hex, k) { const c = new THREE.Color(hex); c.multiplyScalar(k); return `#${c.getHexString()}`; }

/**
 * def: { eye: hex, brow: hex, style: 'hero'|'heroine'|'cute'|'stern'|'monster'|'skull'|'demon'|'old', blush }
 */
export function faceTexture(def, expr = 'neutral') {
  const key = JSON.stringify(def) + expr;
  if (cache.has(key)) return cache.get(key);
  const S = 256;
  const c = document.createElement('canvas'); c.width = S; c.height = S;
  const g = c.getContext('2d');
  g.lineCap = 'round'; g.lineJoin = 'round';
  const style = def.style || 'hero';
  const ink = '#1d1420';
  if (style === 'skull') drawSkull(g, def, expr);
  else if (style === 'monster') drawMonster(g, def, expr);
  else {
    const fem = style === 'heroine' || style === 'cute';
    const eyeW = fem ? 36 : 33, eyeH = fem ? 44 : 37;
    const ey = fem ? 124 : 122;
    const ex = [84, 172];
    // brows
    const browY = ey - eyeH - (expr === 'surprised' ? 14 : 4);
    g.strokeStyle = def.brow || ink; g.lineWidth = fem ? 4 : 6;
    for (let s = 0; s < 2; s++) {
      const dir = s === 0 ? -1 : 1; // -1 = viewer-left eye
      const cx = ex[s];
      let inner = 0, outer = 0;
      if (expr === 'angry' || expr === 'shout' || expr === 'determined') { inner = 12; outer = -6; }
      if (expr === 'sad' || expr === 'hurt' || expr === 'pain') { inner = -10; outer = 4; }
      if (expr === 'smug') { inner = s === 0 ? 8 : -4; }
      if (style === 'stern' || style === 'demon') { inner += 6; }
      g.beginPath();
      g.moveTo(cx - dir * eyeW * 0.9, browY + inner * 0.8 + 4);
      g.quadraticCurveTo(cx, browY - 6 + (inner + outer) * 0.3, cx + dir * eyeW * 1.05, browY + outer);
      g.stroke();
    }
    for (let s = 0; s < 2; s++) drawEye(g, ex[s], ey, eyeW, eyeH, s === 0 ? -1 : 1, def, expr, fem, style);
    // nose
    g.strokeStyle = rgba(0x8a4a3a, 0.6); g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(130, 160); g.lineTo(126, 168); g.stroke();
    // blush
    if (def.blush || expr === 'happy' || (fem && expr !== 'angry')) {
      g.fillStyle = 'rgba(255,110,130,0.28)';
      for (const x of [74, 182]) { g.beginPath(); g.ellipse(x, ey + 36, 18, 7, 0, 0, 7); g.fill(); }
      g.strokeStyle = 'rgba(230,80,100,0.5)'; g.lineWidth = 1.5;
      for (const x of [74, 182]) for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(x + i * 7 - 2, ey + 40); g.lineTo(x + i * 7 + 3, ey + 32); g.stroke(); }
    }
    drawMouth(g, 128, 186, expr, style);
    if (style === 'demon') { // facial marks
      g.strokeStyle = '#b0103a'; g.lineWidth = 4;
      for (const x of [62, 194]) { g.beginPath(); g.moveTo(x, ey + 10); g.lineTo(x + (x < 128 ? 10 : -10), ey + 34); g.stroke(); }
    }
    if (style === 'old') { g.strokeStyle = rgba(0x6a4a3a, 0.5); g.lineWidth = 2; for (const x of [70, 186]) { g.beginPath(); g.moveTo(x, ey + 22); g.lineTo(x + (x < 128 ? 8 : -8), ey + 30); g.stroke(); } }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

function drawEye(g, cx, cy, w, h, dir, def, expr, fem, style) {
  const ink = '#1d1420';
  const eye = def.eye || 0x3a7ad8;
  if (expr === 'blink' || expr === 'dead') {
    g.strokeStyle = ink; g.lineWidth = 6;
    g.beginPath(); g.moveTo(cx - w, cy + 2); g.quadraticCurveTo(cx, cy + 10, cx + w, cy + 2); g.stroke();
    if (expr === 'dead') { g.lineWidth = 5; g.beginPath(); g.moveTo(cx - 14, cy - 12); g.lineTo(cx + 14, cy + 12); g.moveTo(cx + 14, cy - 12); g.lineTo(cx - 14, cy + 12); g.stroke(); }
    return;
  }
  if (expr === 'happy') {
    g.strokeStyle = ink; g.lineWidth = 7;
    g.beginPath(); g.moveTo(cx - w, cy + 6); g.quadraticCurveTo(cx, cy - 22, cx + w, cy + 6); g.stroke();
    return;
  }
  if (expr === 'hurt' || expr === 'pain') {
    g.strokeStyle = ink; g.lineWidth = 7;
    g.beginPath(); g.moveTo(cx - dir * w * 0.8, cy - 14); g.lineTo(cx + dir * w * 0.7, cy); g.lineTo(cx - dir * w * 0.8, cy + 14); g.stroke();
    if (expr === 'pain') { g.fillStyle = 'rgba(140,200,255,0.8)'; g.beginPath(); g.ellipse(cx + dir * w, cy + 22, 5, 9, 0, 0, 7); g.fill(); }
    return;
  }
  // lid height factor
  let lid = 0; // how much upper lid comes down (0..1)
  if (expr === 'angry' || expr === 'shout') lid = 0.35;
  if (expr === 'determined' || style === 'stern') lid = 0.22;
  if (expr === 'smug') lid = 0.45;
  if (expr === 'sad') lid = 0.25;
  const top = cy - h + lid * h * 0.9;
  const bot = cy + h * 0.55;
  // sclera
  g.save();
  g.beginPath();
  g.moveTo(cx - w, cy - 2);
  g.bezierCurveTo(cx - w * 0.7, top - 4, cx + w * 0.7, top - 4, cx + w, cy - 6 + (dir > 0 ? 0 : 0));
  g.bezierCurveTo(cx + w * 0.8, bot + 2, cx - w * 0.8, bot + 2, cx - w, cy - 2);
  g.closePath();
  g.fillStyle = '#ffffff'; g.fill();
  g.clip();
  // iris
  const small = expr === 'surprised';
  const iw = small ? w * 0.45 : w * 0.72, ih = small ? h * 0.5 : h * 0.95;
  const ix = cx + dir * 1, iy = cy + h * 0.08;
  const grd = g.createLinearGradient(0, iy - ih, 0, iy + ih);
  grd.addColorStop(0, shade(eye, 0.35)); grd.addColorStop(0.5, shade(eye, 0.85)); grd.addColorStop(1, shade(eye, 1.45));
  g.fillStyle = grd; g.beginPath(); g.ellipse(ix, iy, iw, ih, 0, 0, 7); g.fill();
  g.strokeStyle = shade(eye, 0.3); g.lineWidth = 2.5; g.stroke();
  // pupil
  if (style !== 'demon') { g.fillStyle = shade(eye, 0.18); g.beginPath(); g.ellipse(ix, iy + 2, iw * 0.45, ih * 0.5, 0, 0, 7); g.fill(); }
  else { g.fillStyle = '#100008'; g.beginPath(); g.ellipse(ix, iy, iw * 0.16, ih * 0.75, 0, 0, 7); g.fill(); }
  // shading under lid
  g.fillStyle = 'rgba(40,20,60,0.25)'; g.fillRect(cx - w * 1.2, top - 10, w * 2.4, h * 0.45);
  // highlights
  g.fillStyle = '#ffffff';
  g.beginPath(); g.ellipse(ix - dir * iw * 0.35 - 3, iy - ih * 0.42, iw * 0.34, ih * 0.24, -0.4, 0, 7); g.fill();
  g.beginPath(); g.arc(ix + dir * iw * 0.3, iy + ih * 0.45, iw * 0.13, 0, 7); g.fill();
  g.restore();
  // upper lash (thick)
  g.strokeStyle = '#1d1420'; g.lineWidth = fem ? 8 : 7;
  g.beginPath();
  g.moveTo(cx - w * 1.05, cy + 0 - (dir < 0 ? 2 : -2) * 0);
  g.bezierCurveTo(cx - w * 0.7, top - 6, cx + w * 0.7, top - 6, cx + w * 1.08, cy - 8);
  g.stroke();
  // outer flick
  const ox = dir > 0 ? cx + w * 1.05 : cx - w * 1.05;
  g.lineWidth = fem ? 5 : 4; g.beginPath(); g.moveTo(ox, dir > 0 ? cy - 8 : cy); g.lineTo(ox + dir * (fem ? 9 : 5), (dir > 0 ? cy - 8 : cy) - (fem ? 8 : 3)); g.stroke();
  // lower lash
  g.lineWidth = 2.5; g.beginPath(); g.moveTo(cx - w * 0.6, bot); g.quadraticCurveTo(cx, bot + 4, cx + w * 0.75, bot - 2); g.stroke();
}

function drawMouth(g, cx, cy, expr, style) {
  const ink = '#3a1420';
  g.strokeStyle = ink; g.lineWidth = 3.5;
  switch (expr) {
    case 'happy':
      g.fillStyle = '#7a1e2e'; g.beginPath(); g.moveTo(cx - 14, cy - 2); g.quadraticCurveTo(cx, cy + 16, cx + 14, cy - 2); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#ff7a8a'; g.beginPath(); g.ellipse(cx, cy + 6, 6, 3, 0, 0, 7); g.fill(); break;
    case 'shout':
      g.fillStyle = '#5a0e1e'; g.beginPath(); g.moveTo(cx - 16, cy - 6); g.lineTo(cx + 16, cy - 6); g.lineTo(cx + 6, cy + 18); g.lineTo(cx - 6, cy + 18); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.fillRect(cx - 14, cy - 6, 28, 4); break;
    case 'angry':
      g.fillStyle = '#fff'; g.beginPath(); g.rect(cx - 13, cy - 4, 26, 8); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(cx - 13, cy); g.lineTo(cx + 13, cy); g.stroke(); break;
    case 'hurt': case 'pain':
      g.fillStyle = '#5a0e1e'; g.beginPath(); g.moveTo(cx - 12, cy); for (let i = 0; i <= 4; i++) g.lineTo(cx - 12 + i * 6, cy + (i % 2 ? -4 : 3)); g.lineTo(cx + 10, cy + 10); g.lineTo(cx - 10, cy + 10); g.closePath(); g.fill(); g.stroke(); break;
    case 'surprised':
      g.fillStyle = '#5a0e1e'; g.beginPath(); g.ellipse(cx, cy + 4, 7, 10, 0, 0, 7); g.fill(); g.stroke(); break;
    case 'sad':
      g.beginPath(); g.moveTo(cx - 10, cy + 4); g.quadraticCurveTo(cx, cy - 4, cx + 10, cy + 4); g.stroke(); break;
    case 'smug':
      g.beginPath(); g.moveTo(cx - 10, cy + 2); g.quadraticCurveTo(cx + 2, cy + 6, cx + 12, cy - 4); g.stroke(); break;
    case 'determined':
      g.beginPath(); g.moveTo(cx - 9, cy + 2); g.lineTo(cx + 9, cy + 1); g.stroke(); break;
    case 'dead':
      g.beginPath(); g.moveTo(cx - 8, cy + 4); g.lineTo(cx + 8, cy + 4); g.stroke(); break;
    default:
      if (style === 'demon') { g.beginPath(); g.moveTo(cx - 10, cy); g.lineTo(cx + 10, cy - 2); g.stroke(); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(cx + 4, cy - 1); g.lineTo(cx + 8, cy + 7); g.lineTo(cx + 10, cy - 1); g.fill(); }
      else { g.beginPath(); g.moveTo(cx - 7, cy); g.quadraticCurveTo(cx, cy + 3, cx + 7, cy); g.stroke(); }
  }
}

function drawSkull(g, def, expr) {
  g.fillStyle = '#120a10';
  for (const x of [90, 166]) { g.beginPath(); g.ellipse(x, 128, 26, 30, 0, 0, 7); g.fill(); }
  const glow = def.eye || 0xff3355;
  for (const x of [90, 166]) { const gr = g.createRadialGradient(x, 132, 0, x, 132, 16); gr.addColorStop(0, '#fff'); gr.addColorStop(0.3, rgba(glow)); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, 132, expr === 'hurt' ? 6 : 14, 0, 7); g.fill(); }
  g.fillStyle = '#120a10'; g.beginPath(); g.moveTo(128, 160); g.lineTo(118, 182); g.lineTo(138, 182); g.fill();
  g.strokeStyle = '#120a10'; g.lineWidth = 3; for (let i = 0; i < 7; i++) { g.beginPath(); g.moveTo(98 + i * 10, 200); g.lineTo(98 + i * 10, 218); g.stroke(); }
  g.beginPath(); g.moveTo(92, 208); g.lineTo(164, 208); g.stroke();
}

function drawMonster(g, def, expr) {
  const glow = def.eye || 0xffcc33;
  for (const [x, dir] of [[86, -1], [170, 1]]) {
    g.fillStyle = '#100808'; g.beginPath(); g.moveTo(x - 24, 120 - dir * 0); g.lineTo(x + 24, 120 + (dir > 0 ? -10 : 10) * (expr === 'angry' ? 1 : 0.4)); g.lineTo(x + 18 * dir * 0, 146); g.closePath(); g.fill();
    g.fillStyle = rgba(glow); g.beginPath(); g.ellipse(x, 130, 13, expr === 'hurt' ? 3 : 9, 0, 0, 7); g.fill();
    g.fillStyle = '#100808'; g.beginPath(); g.ellipse(x, 130, 3, 8, 0, 0, 7); g.fill();
  }
  g.strokeStyle = '#100808'; g.lineWidth = 4;
  if (expr === 'angry' || expr === 'shout') { g.fillStyle = '#3a0808'; g.beginPath(); g.moveTo(96, 186); g.lineTo(160, 186); g.lineTo(140, 214); g.lineTo(116, 214); g.closePath(); g.fill(); g.fillStyle = '#fff'; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(100 + i * 12, 186); g.lineTo(106 + i * 12, 198); g.lineTo(112 + i * 12, 186); g.fill(); } }
  else { g.beginPath(); g.moveTo(104, 194); g.quadraticCurveTo(128, 204, 152, 192); g.stroke(); }
}
