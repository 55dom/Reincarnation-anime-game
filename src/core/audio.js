// Fully procedural WebAudio: sword impacts, metal clashes, footsteps, wind, magic,
// monster roars, synthesized voice grunts and an adaptive orchestral-ish score.
import { clamp } from './util.js';

let ctx = null, master, sfxBus, musicBus, ambBus, comp, verb, verbSend;
let noiseBuf = null;

function makeNoise(seconds = 2) {
  const b = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
function makeImpulse(sec = 2.4, decay = 2.5) {
  const len = ctx.sampleRate * sec;
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return b;
}

const now = () => ctx.currentTime;

function env(g, t, a, peak, d, sustain = 0, r = 0.05) {
  g.gain.cancelScheduledValues(t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t + a + d);
  if (!sustain) return t + a + d;
  g.gain.setValueAtTime(sustain, t + a + d);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d + r);
  return t + a + d + r;
}

function osc(type, freq, t, dur, { gain = 0.3, a = 0.005, d = dur, dest = sfxBus, pitchTo = null, pitchTime = dur, detune = 0, sendVerb = 0 } = {}) {
  const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
  if (pitchTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, pitchTo), t + pitchTime);
  const g = ctx.createGain();
  const end = env(g, t, a, gain, d);
  o.connect(g); g.connect(dest);
  if (sendVerb) { const s = ctx.createGain(); s.gain.value = sendVerb; g.connect(s); s.connect(verbSend); }
  o.start(t); o.stop(end + 0.05);
  return { o, g };
}

function noise(t, dur, { gain = 0.3, a = 0.002, type = 'bandpass', freq = 1000, q = 1, freqTo = null, dest = sfxBus, sendVerb = 0 } = {}) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (freqTo) f.frequency.exponentialRampToValueAtTime(freqTo, t + dur);
  const g = ctx.createGain(); const end = env(g, t, a, gain, dur);
  s.connect(f); f.connect(g); g.connect(dest);
  if (sendVerb) { const sv = ctx.createGain(); sv.gain.value = sendVerb; g.connect(sv); sv.connect(verbSend); }
  s.start(t, Math.random() * 1.5); s.stop(end + 0.05);
}

// ---------------------------------------------------------------- SFX
const SFX = {
  swing(power = 1) {
    const t = now();
    noise(t, 0.12 + power * 0.08, { gain: 0.16 + power * 0.1, type: 'bandpass', freq: 600 + power * 300, freqTo: 3200, q: 1.4 });
    if (power > 1.2) osc('sawtooth', 180, t, 0.18, { gain: 0.05, pitchTo: 60 });
  },
  hit(power = 1) {
    const t = now();
    // thump + crunchy slice + tonal body
    osc('sine', 140 + Math.random() * 30, t, 0.18 + power * 0.1, { gain: 0.5 * Math.min(power, 1.8), pitchTo: 40 });
    noise(t, 0.08 + power * 0.06, { gain: 0.35, type: 'highpass', freq: 1800, q: 0.7 });
    noise(t, 0.15 + power * 0.1, { gain: 0.25 * power, type: 'lowpass', freq: 900, freqTo: 120 });
    if (power >= 1.5) {
      osc('square', 70, t, 0.4, { gain: 0.18, pitchTo: 30, sendVerb: 0.4 });
      noise(t + 0.01, 0.5, { gain: 0.25, type: 'lowpass', freq: 400, freqTo: 60, sendVerb: 0.5 });
    }
  },
  clang(power = 1) {
    const t = now();
    const base = 900 + Math.random() * 400;
    [1, 2.76, 5.4, 8.9].forEach((m, i) => osc(i % 2 ? 'square' : 'triangle', base * m, t, 0.5 + power * 0.4, { gain: 0.08 / (i + 1) * power, d: 0.6 + power * 0.3, sendVerb: 0.5 }));
    noise(t, 0.06, { gain: 0.5, type: 'highpass', freq: 3000 });
  },
  parry() {
    const t = now();
    SFX.clang(1.8);
    osc('sine', 1760, t, 1.2, { gain: 0.12, sendVerb: 0.8 });
    osc('sine', 2637, t + 0.02, 1.0, { gain: 0.07, sendVerb: 0.8 });
    noise(t, 0.3, { gain: 0.2, type: 'bandpass', freq: 5000, q: 3, sendVerb: 0.6 });
  },
  block() { const t = now(); SFX.clang(0.6); osc('sine', 120, t, 0.12, { gain: 0.3, pitchTo: 60 }); },
  dodge() { const t = now(); noise(t, 0.2, { gain: 0.15, type: 'bandpass', freq: 400, freqTo: 1400, q: 0.8 }); },
  dash() { const t = now(); noise(t, 0.35, { gain: 0.22, type: 'bandpass', freq: 300, freqTo: 2400, q: 1 }); osc('sine', 300, t, 0.25, { gain: 0.06, pitchTo: 900 }); },
  jump() { noise(now(), 0.1, { gain: 0.08, type: 'lowpass', freq: 600 }); },
  land(h = 1) { const t = now(); noise(t, 0.12, { gain: 0.12 * h, type: 'lowpass', freq: 500, freqTo: 100 }); osc('sine', 90, t, 0.1, { gain: 0.15 * h, pitchTo: 40 }); },
  step(surface = 'grass') {
    const t = now();
    const f = { grass: 900, sand: 1500, snow: 2200, stone: 2600, wood: 700, demon: 500 }[surface] || 900;
    noise(t, 0.05, { gain: 0.05, type: 'bandpass', freq: f * (0.8 + Math.random() * 0.4), q: 1.2 });
    if (surface === 'stone') osc('sine', 120, t, 0.04, { gain: 0.04 });
  },
  explosion(size = 1) {
    const t = now();
    osc('sine', 80, t, 0.8 * size, { gain: 0.6, pitchTo: 25 });
    noise(t, 0.9 * size, { gain: 0.5, type: 'lowpass', freq: 2000, freqTo: 80, sendVerb: 0.6 });
    noise(t, 0.2, { gain: 0.3, type: 'highpass', freq: 2500 });
  },
  magic(kind = 'arcane') {
    const t = now();
    const base = { arcane: 660, holy: 880, shadow: 220, fire: 330, ice: 990, data: 1320 }[kind] || 660;
    for (let i = 0; i < 5; i++) osc('sine', base * (1 + i * 0.5), t + i * 0.03, 0.5, { gain: 0.06, sendVerb: 0.7, pitchTo: base * (1.5 + i * 0.5) });
    noise(t, 0.4, { gain: 0.1, type: 'bandpass', freq: base * 3, q: 4, sendVerb: 0.5 });
  },
  charge() { const t = now(); osc('sawtooth', 110, t, 0.7, { gain: 0.08, pitchTo: 880, pitchTime: 0.7, d: 0.7, sendVerb: 0.3 }); noise(t, 0.7, { gain: 0.1, type: 'bandpass', freq: 400, freqTo: 4000, q: 3 }); },
  ultimate() {
    const t = now();
    SFX.explosion(2);
    [261.6, 329.6, 392, 523.2].forEach((f, i) => osc('sawtooth', f, t + 0.05, 1.6, { gain: 0.06, d: 1.6, sendVerb: 0.9, detune: i * 4 }));
  },
  growl(pitch = 1, len = 0.6) {
    const t = now();
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(70 * pitch, t);
    o.frequency.linearRampToValueAtTime(95 * pitch, t + len * 0.4); o.frequency.linearRampToValueAtTime(60 * pitch, t + len);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 28; const lg = ctx.createGain(); lg.gain.value = 18 * pitch; lfo.connect(lg); lg.connect(o.frequency);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700; f.Q.value = 4;
    const g = ctx.createGain(); env(g, t, 0.05, 0.3, len);
    o.connect(f); f.connect(g); g.connect(sfxBus);
    o.start(t); lfo.start(t); o.stop(t + len + 0.1); lfo.stop(t + len + 0.1);
    noise(t, len, { gain: 0.12, type: 'bandpass', freq: 300 * pitch, q: 2 });
  },
  roar(pitch = 1) {
    const t = now();
    const len = 1.4;
    [1, 1.5, 2.02].forEach((m, i) => osc('sawtooth', 55 * pitch * m, t, len, { gain: 0.12 / (i + 1), a: 0.15, d: len, pitchTo: 35 * pitch * m, pitchTime: len, sendVerb: 0.6 }));
    noise(t, len, { gain: 0.35, type: 'bandpass', freq: 500 * pitch, freqTo: 200, q: 1.5, a: 0.1, sendVerb: 0.5 });
  },
  howl() {
    const t = now();
    const o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(320, t); o.frequency.linearRampToValueAtTime(620, t + 0.5); o.frequency.linearRampToValueAtTime(560, t + 1.4); o.frequency.linearRampToValueAtTime(380, t + 1.9);
    const g = ctx.createGain(); env(g, t, 0.2, 0.18, 1.8);
    const s = ctx.createGain(); s.gain.value = 0.6;
    o.connect(g); g.connect(sfxBus); g.connect(s); s.connect(verbSend);
    o.start(t); o.stop(t + 2.1);
  },
  squish() { const t = now(); osc('sine', 300, t, 0.15, { gain: 0.2, pitchTo: 120 }); noise(t, 0.1, { gain: 0.1, type: 'lowpass', freq: 800 }); },
  bones() { const t = now(); for (let i = 0; i < 4; i++) noise(t + i * 0.04, 0.03, { gain: 0.2, type: 'bandpass', freq: 2000 + Math.random() * 2000, q: 6 }); },
  glitch() {
    const t = now();
    for (let i = 0; i < 8; i++) osc('square', 100 + Math.random() * 2000, t + i * 0.04, 0.04, { gain: 0.08, a: 0.001 });
    noise(t, 0.35, { gain: 0.15, type: 'highpass', freq: 4000 });
  },
  system() { const t = now(); osc('sine', 1318, t, 0.12, { gain: 0.1, sendVerb: 0.4 }); osc('sine', 1975, t + 0.07, 0.25, { gain: 0.08, sendVerb: 0.5 }); },
  danger() { const t = now(); for (let i = 0; i < 3; i++) { osc('square', 440, t + i * 0.22, 0.12, { gain: 0.07 }); osc('square', 415, t + i * 0.22 + 0.11, 0.1, { gain: 0.07 }); } },
  levelUp() {
    const t = now();
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => osc('triangle', f, t + i * 0.07, 0.6, { gain: 0.12, sendVerb: 0.6 }));
    osc('sine', 2093, t + 0.4, 1.2, { gain: 0.06, sendVerb: 0.9 });
  },
  pickup() { const t = now(); osc('triangle', 880, t, 0.1, { gain: 0.1 }); osc('triangle', 1320, t + 0.06, 0.2, { gain: 0.1, sendVerb: 0.4 }); },
  ui() { osc('sine', 1000, now(), 0.05, { gain: 0.05 }); },
  heartbeat() { const t = now(); osc('sine', 60, t, 0.15, { gain: 0.6, pitchTo: 35 }); osc('sine', 55, t + 0.22, 0.18, { gain: 0.45, pitchTo: 30 }); },
  flatline() { osc('sine', 1000, now(), 3.0, { gain: 0.06, a: 0.01, d: 3 }); },
  shatter() { const t = now(); for (let i = 0; i < 14; i++) osc('triangle', 2000 + Math.random() * 4000, t + Math.random() * 0.3, 0.3, { gain: 0.04, sendVerb: 0.6 }); noise(t, 0.4, { gain: 0.2, type: 'highpass', freq: 3000, sendVerb: 0.5 }); },
  whoosh() { noise(now(), 0.6, { gain: 0.2, type: 'bandpass', freq: 200, freqTo: 3000, q: 0.7, a: 0.2 }); },
  laser() { const t = now(); osc('sawtooth', 1800, t, 0.6, { gain: 0.08, pitchTo: 200 }); osc('square', 900, t, 0.6, { gain: 0.04, pitchTo: 100 }); },
  coin() { const t = now(); osc('square', 1975, t, 0.05, { gain: 0.05 }); osc('square', 2637, t + 0.05, 0.15, { gain: 0.05 }); },
};

// ---------------------------------------------------------------- Voice grunts
// Formant-filtered pulse wave with a pitch contour – reads as an anime "Hah!" / "Tch" / "Haaaa!".
const VOWELS = { a: [800, 1150, 2900], e: [400, 2000, 2550], i: [300, 2300, 3000], o: [450, 800, 2830], u: [325, 700, 2530] };
function voice(pitch, vowel, len, { rise = 1.2, fall = 0.7, gain = 0.22, breath = 0.3 } = {}) {
  const t = now();
  const o = ctx.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(pitch, t);
  o.frequency.linearRampToValueAtTime(pitch * rise, t + len * 0.25);
  o.frequency.linearRampToValueAtTime(pitch * fall, t + len);
  const vib = ctx.createOscillator(); vib.frequency.value = 6; const vg = ctx.createGain(); vg.gain.value = pitch * 0.02; vib.connect(vg); vg.connect(o.frequency);
  const out = ctx.createGain(); env(out, t, 0.015, gain, len);
  const f = VOWELS[vowel] || VOWELS.a;
  f.forEach((ff, i) => {
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = ff; bp.Q.value = 9 + i * 3;
    const fg = ctx.createGain(); fg.gain.value = [1, 0.6, 0.25][i] * 3;
    o.connect(bp); bp.connect(fg); fg.connect(out);
  });
  out.connect(sfxBus);
  o.start(t); vib.start(t); o.stop(t + len + 0.1); vib.stop(t + len + 0.1);
  if (breath) noise(t, len * 0.8, { gain: 0.05 * breath * 3, type: 'bandpass', freq: f[1], q: 2 });
}
const VOICES = {
  hero: { p: 190, attack: [['a', 0.16], ['e', 0.13], ['a', 0.2]], big: ['a', 0.6], hurt: ['u', 0.25], effort: ['o', 0.3] },
  heroine: { p: 330, attack: [['a', 0.14], ['e', 0.12]], big: ['a', 0.5], hurt: ['i', 0.22], effort: ['a', 0.25] },
  boss: { p: 85, attack: [['o', 0.3], ['a', 0.3]], big: ['a', 0.9], hurt: ['u', 0.4], effort: ['o', 0.5] },
  goblin: { p: 300, attack: [['e', 0.12], ['i', 0.1]], big: ['i', 0.3], hurt: ['i', 0.15], effort: ['e', 0.2] },
};
const Voice = {
  attack(who = 'hero', i = 0) { const v = VOICES[who]; const [vw, l] = v.attack[i % v.attack.length]; voice(v.p * (0.95 + Math.random() * 0.1), vw, l, { rise: 1.25, fall: 0.8 }); },
  big(who = 'hero') { const v = VOICES[who]; voice(v.p * 1.05, v.big[0], v.big[1], { rise: 1.35, fall: 0.85, gain: 0.3 }); },
  hurt(who = 'hero') { const v = VOICES[who]; voice(v.p * 1.2, v.hurt[0], v.hurt[1], { rise: 1.1, fall: 0.6, gain: 0.25 }); },
  effort(who = 'hero') { const v = VOICES[who]; voice(v.p, v.effort[0], v.effort[1], { rise: 1.05, fall: 0.9, gain: 0.15 }); },
  gasp(who = 'hero') { const v = VOICES[who]; voice(v.p * 1.3, 'a', 0.35, { rise: 1.3, fall: 1.1, gain: 0.12, breath: 1 }); },
  talk(pitch = 220) { // short syllable blips for dialogue
    const vs = 'aeiou'; voice(pitch * (0.9 + Math.random() * 0.25), vs[Math.floor(Math.random() * 5)], 0.07, { rise: 1.05, fall: 0.95, gain: 0.06, breath: 0 });
  },
};

// ---------------------------------------------------------------- Music
// A tiny step sequencer that writes "orchestral" layers: strings pad, choir, harp arpeggio,
// brass stabs, taiko/timpani percussion. Each theme picks chords, tempo, intensity.
const THEMES = {
  prologue: { bpm: 70, key: 50, prog: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -1, 2]], minor: true, layers: ['pad', 'choir'], drums: 0 },
  finalboss: { bpm: 150, key: 45, prog: [[0, 3, 7], [1, 5, 8], [-2, 2, 5], [-1, 3, 6]], layers: ['pad', 'brass', 'arp', 'choir'], drums: 3 },
  forest: { bpm: 84, key: 55, prog: [[0, 4, 7], [-3, 0, 4], [-7, -3, 0], [-5, -1, 2]], layers: ['pad', 'arp'], drums: 0 },
  village: { bpm: 100, key: 60, prog: [[0, 4, 7], [5, 9, 12], [-3, 0, 4], [7, 11, 14]], layers: ['pad', 'arp', 'flute'], drums: 1 },
  city: { bpm: 108, key: 58, prog: [[0, 4, 7], [-5, -1, 2], [-3, 0, 4], [5, 9, 12]], layers: ['pad', 'brass', 'arp'], drums: 1 },
  desert: { bpm: 92, key: 52, prog: [[0, 3, 7], [1, 5, 8], [0, 3, 7], [-2, 1, 5]], minor: true, layers: ['pad', 'flute'], drums: 1 },
  snow: { bpm: 72, key: 62, prog: [[0, 3, 7], [-4, 0, 3], [-7, -4, 0], [-2, 2, 5]], minor: true, layers: ['pad', 'arp', 'choir'], drums: 0 },
  mountain: { bpm: 88, key: 50, prog: [[0, 4, 7], [-2, 2, 5], [-4, 0, 3], [-5, -1, 2]], layers: ['pad', 'brass'], drums: 1 },
  ruins: { bpm: 76, key: 48, prog: [[0, 3, 7], [-1, 3, 6], [-4, 0, 3], [-5, -2, 2]], minor: true, layers: ['pad', 'choir'], drums: 0 },
  demon: { bpm: 96, key: 43, prog: [[0, 3, 6], [1, 4, 8], [0, 3, 7], [-1, 2, 6]], minor: true, layers: ['pad', 'choir', 'brass'], drums: 2 },
  sky: { bpm: 80, key: 64, prog: [[0, 4, 7, 11], [-3, 0, 4, 7], [-7, -3, 0, 4], [-5, -1, 2, 5]], layers: ['pad', 'arp', 'choir'], drums: 0 },
  battle: { bpm: 140, key: 52, prog: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -1, 2]], minor: true, layers: ['pad', 'brass', 'arp'], drums: 2 },
  boss: { bpm: 156, key: 47, prog: [[0, 3, 7], [1, 4, 8], [-4, 0, 3], [-1, 2, 6]], minor: true, layers: ['pad', 'brass', 'arp', 'choir'], drums: 3 },
  dungeon: { bpm: 70, key: 45, prog: [[0, 3, 7], [1, 4, 8], [-2, 1, 5], [0, 3, 6]], minor: true, layers: ['pad'], drums: 0 },
  silence: { bpm: 60, key: 50, prog: [[0]], layers: [], drums: 0 },
  title: { bpm: 76, key: 52, prog: [[0, 3, 7], [-4, 0, 3, 7], [-2, 2, 5], [-5, -1, 2, 7]], minor: true, layers: ['pad', 'choir', 'arp'], drums: 0 },
};

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

class Music {
  constructor() { this.theme = null; this.next = 0; this.step = 0; this.gain = null; this.pending = null; }
  init() { this.gain = ctx.createGain(); this.gain.gain.value = 0; this.gain.connect(musicBus); }
  play(name) {
    if (!ctx || this.themeName === name) return;
    this.themeName = name;
    const g = this.gain; const t = now();
    g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0.0001, t + 0.8);
    // fade into a fresh gain node
    this.gain = ctx.createGain(); this.gain.gain.setValueAtTime(0.0001, t + 0.6); this.gain.gain.linearRampToValueAtTime(1, t + 2.2); this.gain.connect(musicBus);
    setTimeout(() => g.disconnect(), 1500);
    this.theme = THEMES[name]; this.step = 0; this.next = t + 0.7;
  }
  update() {
    if (!ctx || !this.theme) return;
    const th = this.theme; if (!th.layers.length && !th.drums) return;
    const spb = 60 / th.bpm / 2; // eighth notes
    while (this.next < now() + 0.25) { this.schedule(this.next, this.step, th, spb); this.next += spb; this.step++; }
  }
  schedule(t, step, th, spb) {
    const bar = Math.floor(step / 8), s = step % 8;
    const chord = th.prog[bar % th.prog.length];
    const root = th.key;
    const dest = this.gain;
    const L = th.layers;
    if (s === 0 && L.includes('pad')) {
      chord.forEach((iv, i) => {
        const f = mtof(root + iv + (i === 0 ? -12 : 0));
        [-7, 7].forEach((dt) => {
          const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = dt + Math.random() * 4;
          const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900 + (th.drums * 300); lp.Q.value = 0.5;
          const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.022, t + spb * 2); g.gain.setValueAtTime(0.022, t + spb * 6.5); g.gain.linearRampToValueAtTime(0.0001, t + spb * 8.4);
          o.connect(lp); lp.connect(g); g.connect(dest); const sv = ctx.createGain(); sv.gain.value = 0.35; g.connect(sv); sv.connect(verbSend);
          o.start(t); o.stop(t + spb * 8.6);
        });
      });
      // bass
      osc('triangle', mtof(root + chord[0] - 24), t, spb * 8, { gain: 0.09, a: 0.05, d: spb * 7.5, dest });
    }
    if (L.includes('choir') && s === 0 && bar % 2 === 0) {
      chord.slice(0, 3).forEach((iv) => {
        const f = mtof(root + iv + 12);
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
        const vib = ctx.createOscillator(); vib.frequency.value = 5; const vg = ctx.createGain(); vg.gain.value = f * 0.006; vib.connect(vg); vg.connect(o.frequency);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.025, t + spb * 4); g.gain.linearRampToValueAtTime(0.0001, t + spb * 16);
        const sv = ctx.createGain(); sv.gain.value = 0.9;
        o.connect(g); g.connect(dest); g.connect(sv); sv.connect(verbSend);
        o.start(t); vib.start(t); o.stop(t + spb * 16.2); vib.stop(t + spb * 16.2);
      });
    }
    if (L.includes('arp')) {
      const pattern = [0, 1, 2, 1, 3, 2, 1, 2];
      const iv = chord[pattern[s] % chord.length] + (pattern[s] >= chord.length ? 12 : 0);
      osc('triangle', mtof(root + iv + 12), t, spb * 1.8, { gain: 0.045, a: 0.003, d: spb * 1.8, dest, sendVerb: 0.4 });
    }
    if (L.includes('flute') && (s === 0 || s === 3 || s === 6) && Math.random() < 0.8) {
      const scale = th.minor ? [0, 2, 3, 5, 7, 8, 10, 12] : [0, 2, 4, 5, 7, 9, 11, 12];
      const n = root + 12 + scale[Math.floor(Math.random() * scale.length)];
      osc('sine', mtof(n), t, spb * 2.5, { gain: 0.05, a: 0.04, d: spb * 2.5, dest, sendVerb: 0.6 });
    }
    if (L.includes('brass') && (s === 0 || (th.drums >= 2 && s === 6))) {
      chord.forEach((iv) => {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(root + iv);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(300, t); lp.frequency.linearRampToValueAtTime(1800, t + 0.08); lp.frequency.linearRampToValueAtTime(600, t + spb * 1.5);
        const g = ctx.createGain(); env(g, t, 0.03, 0.035, spb * 1.6);
        o.connect(lp); lp.connect(g); g.connect(dest); o.start(t); o.stop(t + spb * 2);
      });
    }
    if (th.drums) {
      const d = th.drums;
      const taiko = (tt, v) => { osc('sine', 95, tt, 0.35, { gain: 0.35 * v, pitchTo: 45, dest }); noise(tt, 0.08, { gain: 0.08 * v, type: 'lowpass', freq: 600, dest }); };
      const hat = (tt, v) => noise(tt, 0.04, { gain: 0.03 * v, type: 'highpass', freq: 7000, dest });
      const snare = (tt, v) => { noise(tt, 0.15, { gain: 0.12 * v, type: 'bandpass', freq: 1800, q: 0.8, dest }); osc('triangle', 200, tt, 0.08, { gain: 0.08 * v, pitchTo: 120, dest }); };
      if (d >= 1) { if (s === 0 || s === 5) taiko(t, 0.8); if (s % 2 === 1) hat(t, 0.6); }
      if (d >= 2) { if (s === 4) snare(t, 1); if (s === 3 || s === 7) taiko(t, 0.5); hat(t, 0.4); }
      if (d >= 3) { if (s === 6) taiko(t + spb / 2, 0.6); if (bar % 4 === 3 && s >= 4) snare(t + spb / 2, 0.7); }
    }
  }
}

// ---------------------------------------------------------------- Ambience
class Ambience {
  constructor() { this.nodes = {}; }
  init() {
    const mk = (type, freq, q) => {
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain(); g.gain.value = 0;
      s.connect(f); f.connect(g); g.connect(ambBus); s.start();
      return { s, f, g };
    };
    this.nodes.wind = mk('bandpass', 400, 0.6);
    this.nodes.leaves = mk('highpass', 5000, 0.5);
    this.nodes.rumble = mk('lowpass', 120, 1);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.13; const lg = ctx.createGain(); lg.gain.value = 250; lfo.connect(lg); lg.connect(this.nodes.wind.f.frequency); lfo.start();
    this.birdT = 0;
  }
  set(region, intensity = 1, night = false) {
    if (!ctx) return;
    const t = now();
    const cfg = {
      forest: [0.05, 0.03, 0], village: [0.03, 0.015, 0], city: [0.02, 0, 0.03], desert: [0.12, 0, 0], snow: [0.2, 0, 0],
      mountain: [0.16, 0, 0], ruins: [0.06, 0, 0.04], demon: [0.06, 0, 0.18], sky: [0.22, 0, 0], dungeon: [0.02, 0, 0.12], cave: [0.02, 0, 0.1],
    }[region] || [0.05, 0, 0];
    const set = (n, v) => this.nodes[n].g.gain.setTargetAtTime(v * intensity, t, 1.2);
    set('wind', cfg[0]); set('leaves', cfg[1]); set('rumble', cfg[2]);
    this.region = region; this.night = night;
  }
  update(dt) {
    if (!ctx) return;
    this.birdT -= dt;
    if (this.birdT < 0) {
      this.birdT = 2 + Math.random() * 6;
      if ((this.region === 'forest' || this.region === 'village') && !this.night) {
        const t = now(); const f = 2500 + Math.random() * 1500;
        for (let i = 0; i < 3; i++) osc('sine', f, t + i * 0.12, 0.08, { gain: 0.02, pitchTo: f * 1.3, dest: ambBus });
      } else if (this.night && (this.region === 'forest' || this.region === 'village')) {
        const t = now(); for (let i = 0; i < 6; i++) osc('square', 4200, t + i * 0.05, 0.02, { gain: 0.006, dest: ambBus });
      }
    }
  }
}

export const Audio = {
  ready: false, sfx: SFX, voice: Voice, music: new Music(), amb: new Ambience(),
  init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    noiseBuf = makeNoise(3);
    master = ctx.createGain(); master.gain.value = 0.8;
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp); comp.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.55; musicBus.connect(master);
    ambBus = ctx.createGain(); ambBus.gain.value = 0.8; ambBus.connect(master);
    verb = ctx.createConvolver(); verb.buffer = makeImpulse(); verbSend = ctx.createGain(); verbSend.gain.value = 0.5;
    verbSend.connect(verb); verb.connect(master);
    this.music.init(); this.amb.init();
    this.ready = true;
  },
  play(name, ...args) { if (!this.ready) return; try { SFX[name]?.(...args); } catch (e) { /* audio is best-effort */ } },
  say(kind, who, i) { if (!this.ready) return; try { Voice[kind]?.(who, i); } catch (e) { /* noop */ } },
  update(dt) { if (!this.ready) return; this.music.update(); this.amb.update(dt); },
  setMusicVolume(v) { if (musicBus) musicBus.gain.value = clamp(v, 0, 1); },
  duck(amount = 0.3, sec = 0.6) {
    if (!ctx) return; const t = now();
    musicBus.gain.cancelScheduledValues(t); musicBus.gain.setValueAtTime(0.55 * amount, t); musicBus.gain.linearRampToValueAtTime(0.55, t + sec);
  },
};
