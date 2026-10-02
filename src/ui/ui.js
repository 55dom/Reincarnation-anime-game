// HUD, "System" windows, dialogue, menus (status / quests / class & fusion / map / weapons / shop),
// boss bars, enemy plates, minimap, prompts, title card and screen fades.
import * as THREE from 'three';
import { Input } from '../core/input.js';
import { Audio } from '../core/audio.js';
import { Time } from '../core/time.js';
import { FX } from '../render/fx.js';
import { SKILLS } from '../combat/moves.js';
import { WEAPONS } from '../combat/weapons.js';
import { CORES, FUSIONS, fusionKey } from '../entities/player.js';
import { LOC, WORLD } from '../world/world.js';
import { biomeAt, terrainHeight } from '../world/terrain.js';

const $ = (id) => document.getElementById(id);
const _v = new THREE.Vector3();
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class UI {
  constructor(G) {
    this.G = G;
    this.el = { hud: $('hud'), hpFill: $('hpFill'), hpLag: $('hpLag'), hpText: $('hpText'), mpFill: $('mpFill'), mpText: $('mpText'), exFill: $('exFill'), limFill: $('limFill'),
      level: $('hudLevel'), name: $('hudName'), cls: $('hudClass'), weapon: $('weaponName'), combo: $('combo'), comboNum: $('comboNum'), comboRank: $('comboRank'),
      bossBar: $('bossBar'), bossName: $('bossName'), bossFill: $('bossFill'), bossLag: $('bossLag'), bossPosture: $('bossPosture'), prompt: $('prompt'), reticle: $('lockReticle'),
      sys: $('sysLayer'), toast: $('toastLayer'), dlg: $('dialogue'), dName: $('dName'), dText: $('dText'), dChoices: $('dChoices'), menu: $('menu'), title: $('titleCard'), titlePrompt: $('titlePrompt'),
      fade: $('fade'), letterbox: $('letterbox'), minimap: $('minimap'), region: $('regionName'), clock: $('clock'), objective: $('objective'), skillBar: $('skillBar') };
    this.mm = this.el.minimap.getContext('2d');
    this.dialogueOpen = false; this.menuOpen = null;
    this.plates = []; this.plateLayer = document.createElement('div'); this.plateLayer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9'; document.body.appendChild(this.plateLayer);
    this.buildSkillBar();
    this.mapImage = null;
    this.fadeA = 0;
    this.sub = document.createElement('div'); this.sub.id = 'subtitle'; document.body.appendChild(this.sub);
  }
  /** Non-blocking subtitle line (combat barks, radio chatter). */
  subtitle(name, text, dur = 2.6, color = '#9fe8ff') {
    if (this.G.cutscene || this.dialogueOpen) return;
    this.sub.innerHTML = `<b style="color:${color}">${esc(name)}</b> ${esc(text)}`;
    this.sub.classList.add('on'); clearTimeout(this._subT);
    this._subT = setTimeout(() => this.sub.classList.remove('on'), dur * 1000);
    if (!/^\[/.test(text)) Audio.say('talk', name === 'You' || name === this.G.player.name ? 200 : 260);
  }

  // ------------------------------------------------------------------ HUD
  showHUD(v) { this.el.hud.classList.toggle('hidden', !v); this.hudOn = v; }
  buildSkillBar() {
    const keys = [['E', 'SKILL', 'skill'], ['R', 'ULT', 'ultimate'], ['Q', 'PARRY', 'parry'], ['⏎', 'POTION', null]];
    this.el.skillBar.innerHTML = keys.map(([k, n, id]) => `<div class="sk" data-skill="${id || ''}"><b>${k}</b>${n}<span class="cnt"></span></div>`).join('');
  }
  update(dt) {
    const G = this.G, P = G.player;
    if (this.hudOn) {
      const hpK = Math.max(0, P.hp / P.maxHp);
      this.el.hpFill.style.width = hpK * 100 + '%'; this.el.hpLag.style.width = hpK * 100 + '%';
      this.el.hpText.textContent = `${Math.ceil(P.hp)}/${P.maxHp}`;
      this.el.mpFill.style.width = (P.mp / P.maxMp) * 100 + '%'; this.el.mpText.textContent = `${Math.floor(P.mp)}/${P.maxMp}`;
      this.el.exFill.style.width = (P.exp / P.expToNext()) * 100 + '%';
      this.el.limFill.style.width = P.limit + '%'; this.el.limFill.parentElement.classList.toggle('full', P.limit >= 100);
      this.el.level.textContent = P.level; this.el.name.textContent = P.name;
      const cls = P.classLabel || (P.classId === 'ERROR' ? 'ERROR' : (P.fusion ? FUSIONS[P.fusion].name : 'Reincarnator'));
      if (this.el.cls.textContent !== cls) { this.el.cls.textContent = cls; this.el.cls.dataset.text = cls; this.el.cls.classList.toggle('ok', cls !== 'ERROR'); }
      for (const sk of this.el.skillBar.children) {
        const id = sk.dataset.skill; sk.classList.toggle('locked', id ? !P.hasSkill(id) : P.potions <= 0);
        if (!id) sk.querySelector('.cnt').textContent = ' ×' + P.potions;
      }
      this.updateMinimap();
      this.updatePlates();
      // lock reticle
      if (P.lock?.alive) {
        _v.copy(P.lock.pos); _v.y += P.lock.height * 0.6; _v.project(G.camera);
        this.el.reticle.classList.toggle('hidden', _v.z > 1);
        this.el.reticle.style.left = (_v.x * 0.5 + 0.5) * innerWidth + 'px'; this.el.reticle.style.top = (-_v.y * 0.5 + 0.5) * innerHeight + 'px';
      } else this.el.reticle.classList.add('hidden');
      // boss bar
      const B = this.boss;
      if (B) {
        const k = Math.max(0, B.hp / B.maxHp);
        this.el.bossFill.style.width = k * 100 + '%'; this.el.bossLag.style.width = k * 100 + '%';
        this.el.bossPosture.style.width = (B.posture / B.maxPosture) * 100 + '%';
        if (!B.alive) this.bossBar(null);
      }
      // interaction / finisher prompt
      const fin = P.finisherCandidate();
      if (fin && P.alive && !this.dialogueOpen) this.prompt('<b>F</b> FINISHER', 'finisher');
      else if (G.nearInteract && !this.dialogueOpen && !P.cinematic) this.prompt(`<b>F</b> ${G.nearInteract.label}`);
      else this.prompt(null);
      // clock
      const h = G.hours; const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
      this.el.clock.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${h > 5.5 && h < 18.5 ? '☀' : '☾'}  ·  Day ${G.day}`;
    }
    if (this.dialogueOpen) this.updateDialogue(dt);
    if (this.menuOpen) this.updateMenu(dt);
  }
  weapon(name) { this.el.weapon.textContent = name; }
  combo(n) {
    const c = this.el.combo;
    if (n < 2) { c.classList.remove('on'); return; }
    c.classList.add('on');
    this.el.comboNum.textContent = n;
    this.el.comboNum.classList.remove('pop'); void this.el.comboNum.offsetWidth; this.el.comboNum.classList.add('pop');
    const ranks = [[60, 'SSS'], [40, 'SS'], [25, 'S'], [15, 'A'], [8, 'B'], [4, 'C'], [0, 'D']];
    this.el.comboRank.textContent = ranks.find(([m]) => n >= m)[1];
  }
  damage(pos, text, cls = '') { FX.damageNumber(pos, String(text), cls); }
  toast(text, cls = '') {
    const d = document.createElement('div'); d.className = 'toast ' + cls; d.textContent = text; this.el.toast.appendChild(d);
    while (this.el.toast.children.length > 5) this.el.toast.firstChild.remove();
    setTimeout(() => d.remove(), 3200);
  }
  prompt(html, kind = '') {
    const p = this.el.prompt;
    if (!html) { p.classList.add('hidden'); return; }
    p.classList.remove('hidden'); if (p.innerHTML !== html) p.innerHTML = html; p.className = kind ? kind : '';
  }
  region(name) {
    if (this.lastRegion === name) return; this.lastRegion = name;
    this.el.region.textContent = name;
    const b = document.createElement('div'); b.className = 'sys'; b.style.cssText = 'font-family:var(--title-font);font-size:28px;letter-spacing:6px;background:transparent;border:none;box-shadow:none;text-shadow:0 0 12px #000';
    b.textContent = name; this.el.sys.appendChild(b);
    setTimeout(() => { b.classList.add('out'); setTimeout(() => b.remove(), 400); }, 2600);
  }
  objective(title, text) { this.el.objective.innerHTML = title ? `<span class="q">${title}</span>${text || ''}` : ''; }
  bossBar(boss) {
    this.boss = boss;
    this.el.bossBar.classList.toggle('hidden', !boss);
    if (boss) this.el.bossName.textContent = `${boss.name.toUpperCase()}  ·  Lv ${boss.level}`;
  }

  // ------------------------------------------------------------------ system windows
  /** Show a System window. lines: array of strings. Returns a promise resolved when it closes. */
  system(lines, { style = '', sound = 'system', time = 2.6, glitch = false, html = false } = {}) {
    if (!Array.isArray(lines)) lines = [lines];
    const d = document.createElement('div');
    d.className = 'sys ' + style + (glitch ? ' glitchy' : '');
    d.innerHTML = lines.map((l, i) => `<div style="${i === 0 ? '' : 'font-size:0.85em;opacity:0.9;margin-top:4px'}">${html ? l : esc(l)}</div>`).join('');
    this.el.sys.appendChild(d);
    if (sound) Audio.play(sound);
    if (glitch) { Audio.play('glitch'); this.G.post.glitchFor(0.6); }
    return new Promise((res) => setTimeout(() => { d.classList.add('out'); setTimeout(() => { d.remove(); res(); }, 320); }, time * 1000));
  }
  statusWindow(P, { time = 5, reveal = true } = {}) {
    const rows = [['NAME', P.name], ['LEVEL', P.level], ['CLASS', `<span class="err glitch" data-text="${P.classId === 'ERROR' ? 'ERROR' : 'Reincarnator'}">${P.classId === 'ERROR' ? 'ERROR' : 'Reincarnator'}</span>`],
      ['HP', `${Math.ceil(P.hp)}/${P.maxHp}`], ['MP', `${Math.floor(P.mp)}/${P.maxMp}`], ['SKILL', P.level <= 1 && P.classId === 'ERROR' ? 'UNKNOWN' : SKILLS.filter((s) => P.hasSkill(s.id)).map((s) => s.name).join(', ')]];
    const d = document.createElement('div'); d.className = 'sys statusWin';
    d.innerHTML = `<div class="hdr">STATUS</div>` + rows.map(([k, v]) => `<div class="row" style="opacity:0"><span class="k">${k}:</span> ${v}</div>`).join('');
    this.el.sys.appendChild(d); Audio.play('system');
    const rowsEl = [...d.querySelectorAll('.row')];
    rowsEl.forEach((r, i) => setTimeout(() => { r.style.opacity = 1; Audio.play('ui'); if (i === 2) { Audio.play('glitch'); this.G.post.glitchFor(0.4); } }, reveal ? 300 + i * 380 : 0));
    return new Promise((res) => setTimeout(() => { d.classList.add('out'); setTimeout(() => { d.remove(); res(); }, 320); }, time * 1000));
  }

  // ------------------------------------------------------------------ dialogue
  /** speaker, text → Promise<choiceIndex|undefined> */
  say(name, text, { choices = null, pitch = 220, sys = false, auto = 0 } = {}) {
    return new Promise((resolve) => {
      this.dialogueOpen = true; this.G.setControl(false);
      this.el.dlg.classList.remove('hidden');
      this.el.dName.textContent = name || ''; this.el.dName.classList.toggle('sysname', !!sys); this.el.dName.style.display = name ? '' : 'none';
      this.el.dText.textContent = ''; this.el.dChoices.innerHTML = '';
      this.dlg = { text, i: 0, t: 0, choices, resolve, pitch, sel: 0, auto, autoT: 0, sys };
    });
  }
  updateDialogue(dt) {
    const D = this.dlg; if (!D) return;
    const rdt = Time.rdt;
    D.t += rdt;
    const speed = 55;
    const advance = Input.pressed('interact') || Input.pressed('confirm') || Input.pressed('jump') || Input.pressed('light');
    if (D.i < D.text.length) {
      const n = Math.min(D.text.length, Math.floor(D.t * speed));
      if (n > D.i) {
        if (Math.floor(n / 3) !== Math.floor(D.i / 3) && D.text[n - 1] !== ' ') { if (D.sys) Audio.play('ui'); else Audio.voice.talk ? Audio.say('talk', D.pitch) : 0; }
        D.i = n; this.el.dText.textContent = D.text.slice(0, D.i);
      }
      if (advance) { D.i = D.text.length; this.el.dText.textContent = D.text; Input.consume('light'); Input.consume('interact'); return; }
      return;
    }
    if (D.choices && !this.el.dChoices.children.length) {
      this.el.dChoices.innerHTML = D.choices.map((c, i) => `<button data-i="${i}">${i + 1}. ${esc(c)}</button>`).join('');
      [...this.el.dChoices.children].forEach((b) => b.addEventListener('click', () => this.closeDialogue(+b.dataset.i)));
      Input.releaseLock();
      this.highlightChoice();
    }
    if (D.choices) {
      for (let i = 0; i < D.choices.length; i++) if (Input.pressed('w' + (i + 1))) { this.closeDialogue(i); return; }
      if (Input.pressed('down')) { D.sel = (D.sel + 1) % D.choices.length; this.highlightChoice(); }
      if (Input.pressed('up')) { D.sel = (D.sel + D.choices.length - 1) % D.choices.length; this.highlightChoice(); }
      if (Input.pressed('confirm') || Input.pressed('interact')) { this.closeDialogue(D.sel); }
      return;
    }
    if (D.auto) { D.autoT += rdt; if (D.autoT > D.auto) { this.closeDialogue(); return; } }
    if (advance) { Input.consume('light'); Input.consume('interact'); this.closeDialogue(); }
  }
  highlightChoice() { [...this.el.dChoices.children].forEach((b, i) => b.classList.toggle('sel', i === this.dlg.sel)); }
  closeDialogue(choice) {
    const D = this.dlg; this.dlg = null;
    this.el.dlg.classList.add('hidden'); this.dialogueOpen = false;
    Audio.play('ui');
    if (!this.G.cutscene) this.G.setControl(true);
    if (D?.choices && this.G.state === 'play') Input.requestLock();
    D?.resolve(choice);
  }
  /** Convenience: a sequence of [speaker, text] lines. */
  async talk(lines, opts = {}) { for (const l of lines) await this.say(l[0], l[1], { ...opts, ...(l[2] || {}) }); }

  // ------------------------------------------------------------------ screen
  fade(to, dur = 0.6) {
    const el = this.el.fade; const from = this.fadeA;
    return new Promise((res) => {
      const t0 = performance.now();
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / (dur * 1000));
        this.fadeA = from + (to - from) * k; el.style.opacity = this.fadeA;
        if (k < 1) requestAnimationFrame(step); else res();
      };
      step();
    });
  }
  letterbox(on) { this.el.letterbox.classList.toggle('on', on); }
  titleCard(on, prompt = '') { this.el.title.classList.toggle('hidden', !on); this.el.titlePrompt.textContent = prompt; }
  async bossIntro(name, title) {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:0;right:0;top:58%;text-align:center;z-index:31;pointer-events:none';
    d.innerHTML = `<div style="font-family:var(--title-font);font-size:min(9vw,74px);font-weight:900;letter-spacing:10px;color:#fff;text-shadow:0 0 24px #f00,4px 4px 0 #000;animation:titleIn 1.2s ease-out">${esc(name.toUpperCase())}</div><div style="font-size:22px;letter-spacing:6px;color:#fcc;text-shadow:0 0 8px #000">${esc(title)}</div>`;
    document.body.appendChild(d);
    await wait(2600); d.style.transition = 'opacity .5s'; d.style.opacity = 0; await wait(500); d.remove();
  }

  // ------------------------------------------------------------------ enemy name plates
  updatePlates() {
    const G = this.G; const cam = G.camera;
    let n = 0;
    for (const e of G.enemies) {
      if (!e.alive || e.boss || e.hideBar) continue;
      if (e.state === 'idle' && e.hp >= e.maxHp) continue;
      const d = e.pos.distanceTo(G.player.pos); if (d > 30) continue;
      _v.copy(e.pos); _v.y += e.height + 0.45; _v.project(cam);
      if (_v.z > 1) continue;
      let p = this.plates[n];
      if (!p) { p = document.createElement('div'); p.style.cssText = 'position:absolute;transform:translate(-50%,-50%);text-align:center;font-size:12px;font-weight:700;text-shadow:0 0 3px #000;white-space:nowrap'; p.innerHTML = '<div class="n"></div><div style="width:70px;height:5px;background:rgba(0,0,0,.6);border:1px solid rgba(255,255,255,.4);margin:1px auto"><div class="f" style="height:100%;background:#ff4d6d"></div></div><div style="width:50px;height:2px;margin:0 auto;background:rgba(0,0,0,.5)"><div class="p" style="height:100%;background:#ffcc33"></div></div>'; this.plateLayer.appendChild(p); this.plates.push(p); }
      p.style.display = 'block';
      p.style.left = (_v.x * 0.5 + 0.5) * innerWidth + 'px'; p.style.top = (-_v.y * 0.5 + 0.5) * innerHeight + 'px';
      const lvDiff = e.level - G.player.level;
      p.querySelector('.n').innerHTML = `<span style="color:${lvDiff > 4 ? '#ff5577' : lvDiff > 1 ? '#ffcc66' : '#fff'}">${esc(e.name)} Lv${e.level}</span>`;
      p.querySelector('.f').style.width = (e.hp / e.maxHp) * 100 + '%';
      p.querySelector('.p').style.width = (e.posture / e.maxPosture) * 100 + '%';
      n++;
    }
    for (let i = n; i < this.plates.length; i++) this.plates[i].style.display = 'none';
  }

  // ------------------------------------------------------------------ minimap & world map
  buildMapImage() {
    const S = 256; const c = document.createElement('canvas'); c.width = S; c.height = S; const g = c.getContext('2d');
    const img = g.createImageData(S, S);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const x = -WORLD.half + (i + 0.5) / S * WORLD.size, z = -WORLD.half + (j + 0.5) / S * WORLD.size;
      const h = terrainHeight(x, z); const b = biomeAt(x, z);
      let r = 90, gg = 160, bb = 80;
      if (h < 0.3) { r = 50; gg = 120; bb = 190; }
      else if (b.demon > 0.5) { r = 80; gg = 40; bb = 60; }
      else if (b.desert > 0.5) { r = 220; gg = 190; bb = 130; }
      else if (h > 46 || b.snowZone > 0.6) { r = 235; gg = 240; bb = 250; }
      else if (b.mountain > 0.5) { r = 130; gg = 125; bb = 115; }
      const sh = Math.min(1.2, 0.75 + h / 120);
      const k = (j * S + i) * 4; img.data[k] = r * sh; img.data[k + 1] = gg * sh; img.data[k + 2] = bb * sh; img.data[k + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    this.mapImage = c;
  }
  w2m(x, z, S) { return [(x + WORLD.half) / WORLD.size * S, (z + WORLD.half) / WORLD.size * S]; }
  updateMinimap() {
    const G = this.G, P = G.player, g = this.mm; if (!this.mapImage) return;
    const S = 180; g.clearRect(0, 0, S, S);
    g.save(); g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 2, 0, 7); g.clip();
    if (G.world.interior) { g.fillStyle = '#111'; g.fillRect(0, 0, S, S); }
    else {
      const scale = 1024 / WORLD.size * 1.2; // map pixels per world unit at minimap scale
      const [mx, mz] = this.w2m(P.pos.x, P.pos.z, 256);
      g.translate(S / 2, S / 2); g.rotate(G.cam.yaw - Math.PI);
      g.imageSmoothingEnabled = false;
      const zoom = 4; g.drawImage(this.mapImage, -mx * zoom, -mz * zoom, 256 * zoom, 256 * zoom);
      // markers
      const mark = (x, z, color, r = 4) => { const [a, b] = this.w2m(x, z, 256); g.fillStyle = color; g.beginPath(); g.arc((a - mx) * zoom, (b - mz) * zoom, r, 0, 7); g.fill(); };
      for (const e of G.enemies) if (e.alive && e.pos.distanceTo(P.pos) < 60) mark(e.pos.x, e.pos.z, e.boss ? '#ff2244' : '#ff6677', e.boss ? 6 : 2.5);
      for (const n of G.npcs) if (n.visible && n.pos.distanceTo(P.pos) < 60) mark(n.pos.x, n.pos.z, n.questMark ? '#ffd34d' : '#9fe8ff', n.questMark ? 4 : 2.5);
      const obj = G.story.objectivePos?.();
      if (obj) { const [a, b] = this.w2m(obj.x, obj.z, 256); const dx = (a - mx) * zoom, dz = (b - mz) * zoom; const d = Math.hypot(dx, dz); const k = d > S / 2 - 10 ? (S / 2 - 10) / d : 1; g.fillStyle = '#ffd34d'; g.save(); g.translate(dx * k, dz * k); g.rotate(Math.PI / 4); g.fillRect(-5, -5, 10, 10); g.restore(); }
      void scale;
      g.setTransform(1, 0, 0, 1, 0, 0);
    }
    g.restore();
    // player arrow (map rotates with camera so the arrow shows facing relative to camera)
    g.save(); g.translate(S / 2, S / 2); g.rotate(-(P.yaw - G.cam.yaw) + Math.PI);
    g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -8); g.lineTo(6, 6); g.lineTo(0, 3); g.lineTo(-6, 6); g.closePath(); g.stroke(); g.fill();
    g.restore();
  }

  // ------------------------------------------------------------------ menus
  openMenu(tab = 'status') {
    if (this.dialogueOpen) return;
    this.menuOpen = tab; Time.paused = true; Input.releaseLock();
    this.el.menu.classList.remove('hidden');
    this.renderMenu();
    Audio.play('system');
  }
  closeMenu() {
    if (!this.menuOpen) return;
    this.menuOpen = null; Time.paused = false; this.el.menu.classList.add('hidden');
    if (this.G.state === 'play') Input.requestLock();
    Audio.play('ui');
  }
  updateMenu() {
    if (Input.pressed('pause')) { this.closeMenu(); return; }
    const map = { status: 'status', quests: 'quests', classes: 'classes', map: 'map' };
    for (const k in map) if (Input.pressed(k)) { if (this.menuOpen === map[k]) this.closeMenu(); else { this.menuOpen = map[k]; this.renderMenu(); } return; }
  }
  renderMenu() {
    const G = this.G, P = G.player; const tab = this.menuOpen;
    const tabs = [['status', 'STATUS'], ['skills', 'SKILLS'], ['weapons', 'WEAPONS'], ['classes', 'CLASS'], ['quests', 'QUESTS'], ['map', 'MAP'], ['lore', 'MEMORIES'], ['system', 'SYSTEM']];
    let body = '';
    if (tab === 'shop') body = this.shopBody();
    else if (tab === 'status') {
      const s = P.stats;
      body = `<div class="grid2"><div class="card"><div class="t">${esc(P.name)}</div><div class="d" style="font-size:17px;line-height:1.8">
        LEVEL ${P.level} &nbsp; EXP ${P.exp}/${P.expToNext()}<br>CLASS: <span class="${P.classId === 'ERROR' ? 'err glitch' : ''}" data-text="ERROR" style="color:${P.classId === 'ERROR' ? '#ff3355' : '#b38cff'}">${P.classId === 'ERROR' ? 'ERROR' : (P.fusion ? FUSIONS[P.fusion].name + ' (Reincarnator)' : 'Reincarnator')}</span><br>
        HP ${Math.ceil(P.hp)}/${P.maxHp} &nbsp; MP ${Math.floor(P.mp)}/${P.maxMp}<br>ATK ${s.atk.toFixed(0)} &nbsp; DEF ${s.def.toFixed(0)} &nbsp; CRIT ${(s.crit * 100).toFixed(0)}%<br>
        GOLD ${P.gold} &nbsp; POTIONS ${P.potions}<br>BEST COMBO ${P.bestCombo}</div></div>
        <div class="card"><div class="t">MEMORY SYNCHRONIZATION</div><div style="font-size:46px;font-weight:700;color:#5fd8ff">${P.memorySync}%</div><div class="d">Fragments recovered: ${G.flags.fragments?.length || 0} / ${G.world.fragments.length}</div>
        <div class="d" style="margin-top:8px">${P.memorySync < 25 ? '[Most memories are still sealed.]' : P.memorySync < 75 ? '[The cycle is becoming clearer.]' : '[You remember. All of it.]'}</div></div></div>
        <h3>CONTROLS</h3><div class="d" style="opacity:.8;line-height:1.7">${G.mobile ? 'Left thumb move · swipe to look · ATK light · HVY heavy · DASH dodge · JUMP · GUARD block (tap = parry) · SKILL weapon skill · ULT ultimate · ◎ lock-on · F talk/finisher · ⇄ switch weapon · ✚ potion · ☰ menu · ⛶ fullscreen' : `LMB light · RMB heavy · Shift dodge/dash · Space jump · Q block (tap = parry) · E skill · R ultimate · Tab lock-on · F interact/finisher · 1-6 weapons · Enter potion`}</div>`;
    } else if (tab === 'skills') {
      body = '<div class="grid2">' + SKILLS.map((s) => `<div class="card ${P.hasSkill(s.id) ? 'on' : 'locked'}"><div class="t">${s.name} <span style="opacity:.6;font-size:13px">Lv ${s.lv}</span></div><div class="d">${s.desc}</div></div>`).join('') + '</div>' +
        `<h3>COMBO EXAMPLE</h3><div class="d">LIGHT → LIGHT → HEAVY (launch) → DASH (pursue) → AIR ATTACK ×3 → SPECIAL (Skyfall finale)</div>`;
    } else if (tab === 'weapons') {
      body = '<div class="grid2">' + P.weapons.map((id, i) => { const W = WEAPONS[id]; return `<div class="card ${id === P.weaponId ? 'on' : ''}"><div class="t">[${i + 1}] ${W.name}</div><div class="d">${W.desc}<br>DMG ×${W.dmg} · SPD ×${W.speed} · Reach ${W.reach}</div><button class="act" data-equip="${id}">${id === P.weaponId ? 'EQUIPPED' : 'EQUIP'}</button></div>`; }).join('') + '</div>';
    } else if (tab === 'classes') body = this.classBody();
    else if (tab === 'quests') {
      const Q = G.story.questList();
      body = Q.length ? Q.map((q) => `<div class="quest ${q.done ? 'done' : ''}"><div class="qt">${esc(q.title)}</div><div class="d">${esc(q.desc)}</div>${q.progress ? `<div class="d" style="color:#5fd8ff">${esc(q.progress)}</div>` : ''}</div>`).join('') : '<div class="d">No quests.</div>';
    } else if (tab === 'map') body = `<canvas class="mapCanvas" id="bigMap" width="640" height="640"></canvas><div class="d" id="mapMsg" style="text-align:center;margin-top:6px">${this.G.mobile ? 'Tap' : 'Click'} a discovered waystone (◆) to fast travel.</div>`;
    else if (tab === 'lore') {
      const frags = G.flags.fragments || [];
      body = frags.length ? frags.map((i) => `<div class="card" style="margin-bottom:8px"><div class="t">Memory Fragment #${i + 1}</div><div class="d" style="white-space:pre-line">${esc(G.story.fragmentText(i))}</div></div>`).join('') : '<div class="d">No memories recovered yet. Look for glowing fragments in hidden places.</div>';
    } else if (tab === 'system') {
      const S = G.settings, canSave = G.story.has('prologueDone');
      const qDesc = { high: 'Full resolution, sharp soft shadows, anti-aliasing', medium: 'Balanced resolution, shadows, anti-aliasing', low: 'Lower resolution, no shadows or anti-aliasing — fastest' }[S.quality];
      body = `<div class="d">Game is auto-saved at waystones and after story events. Settings are remembered on this device.</div><br>
        <button class="act" data-act="save" ${canSave ? '' : 'disabled'}>${this.savedFlash ? 'SAVED ✓' : canSave ? 'SAVE NOW' : 'SAVE (after prologue)'}</button> <button class="act" data-act="resume">RESUME</button> <button class="act" data-act="title">${this.quitArmed ? 'TAP AGAIN TO QUIT' : 'QUIT TO TITLE'}</button>
        <h3>AUDIO</h3><button class="act" data-act="music">MUSIC: ${S.music ? 'ON' : 'OFF'}</button>
        <h3>ANIMATION & GRAPHICS</h3><button class="act" data-act="anim">ANIMATION: ${S.anim === 'smooth' ? 'SMOOTH' : 'ANIME (STEPPED)'}</button> <button class="act" data-act="quality">RENDER QUALITY: ${S.quality.toUpperCase()}</button>
        <div class="d" style="opacity:.75;margin-top:4px">${S.anim === 'smooth' ? 'Smooth: fluid in-between frames.' : 'Anime: held, snappy key poses like hand-drawn animation.'} · ${qDesc}</div>
        <h3>ACCESSIBILITY</h3><button class="act" data-act="shake">SCREEN SHAKE: ${S.shake ? 'ON' : 'OFF'}</button> <button class="act" data-act="flash">IMPACT FLASHES: ${S.flash ? 'ON' : 'OFF'}</button>
        <div class="d" style="opacity:.75;margin-top:4px">Flashes = white screen flashes and inverted impact frames on big hits.</div>`;
    }
    const tabHtml = tab === 'shop' ? '' : `<div class="tabs">${tabs.map(([k, n]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${n}</button>`).join('')}</div>`;
    this.el.menu.innerHTML = `<div class="panel"><div class="close">${this.G.mobile ? "✕ CLOSE" : "[Esc] close"}</div><h2>${tab === 'shop' ? esc(this.shop?.title || 'SHOP') : 'SYSTEM MENU'}</h2>${tabHtml}${body}</div>`;
    this.el.menu.querySelector('.close').addEventListener('click', () => this.closeMenu());
    this.el.menu.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { this.menuOpen = b.dataset.tab; this.renderMenu(); Audio.play('ui'); }));
    this.el.menu.querySelectorAll('[data-equip]').forEach((b) => b.addEventListener('click', () => { P.equip(b.dataset.equip); this.renderMenu(); }));
    this.el.menu.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => this.menuAction(b.dataset.act, b)));
    this.el.menu.querySelectorAll('[data-core]').forEach((b) => b.addEventListener('click', () => this.toggleCore(b.dataset.core)));
    this.el.menu.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => this.buy(+b.dataset.buy)));
    if (tab === 'map') this.drawBigMap();
  }
  menuAction(a) {
    const G = this.G, S = G.settings;
    if (a !== 'title') this.quitArmed = false;
    if (a === 'save') {
      if (G.save()) { this.savedFlash = true; Audio.play('levelUp'); clearTimeout(this._savedT); this._savedT = setTimeout(() => { this.savedFlash = false; if (this.menuOpen === 'system') this.renderMenu(); }, 1500); }
      this.renderMenu(); return;
    }
    if (a === 'resume') { this.closeMenu(); return; }
    if (a === 'title') {
      if (!this.quitArmed) { this.quitArmed = true; this.renderMenu(); return; }
      G.save(); location.reload(); return;
    }
    if (a === 'music') S.music = !S.music;
    if (a === 'anim') S.anim = S.anim === 'smooth' ? 'anime' : 'smooth';
    if (a === 'quality') { const order = ['high', 'medium', 'low']; S.quality = order[(order.indexOf(S.quality) + 1) % 3]; }
    if (a === 'shake') { S.shake = !S.shake; if (!S.shake) G.cam.trauma = 0; }
    if (a === 'flash') S.flash = !S.flash;
    G.applySettings(); this.renderMenu();
  }
  classBody() {
    const P = this.G.player;
    if (P.classId === 'ERROR') {
      return `<div class="card" style="text-align:center;padding:30px"><div class="t err glitch" data-text="CLASS: ERROR" style="font-size:40px;color:#ff3355">CLASS: ERROR</div>
        <div class="d" style="margin-top:12px">[The System cannot read your class data.]<br>[Classes available in this world: Swordsman · Archer · Mage · Priest · Assassin · Guardian · Beast Tamer · ???]</div>
        <div class="d" style="margin-top:12px;opacity:.7">Hint: the Ruins of the First Cycle hold the answer.</div></div>`;
    }
    const all = Object.keys(CORES);
    const cards = all.map((k) => {
      const C = CORES[k]; const has = P.cores.includes(k); const on = P.activeCores?.includes(k);
      return `<div class="card ${on ? 'on' : has ? '' : 'locked'}"><div class="t" style="color:#${new THREE.Color(C.color).getHexString()}">${C.name} Core</div><div class="d">${has ? C.desc : '[Not absorbed — find the ' + C.name + ' master]'}</div>${has ? `<button class="act" data-core="${k}">${on ? 'UNSLOT' : 'SLOT'}</button>` : ''}</div>`;
    }).join('');
    const fk = P.activeCores?.length === 2 ? fusionKey(...P.activeCores) : null;
    const F = fk && FUSIONS[fk];
    const fusionList = Object.entries(FUSIONS).map(([k, f]) => `<div class="d">${k.split('+').map((c) => CORES[c].name).join(' + ')} = <b style="color:#ffd34d">${f.name}</b></div>`).join('');
    return `<div class="card on" style="margin-bottom:12px"><div class="t" style="color:#b38cff;font-size:22px">REINCARNATOR</div><div class="d">Slot two absorbed class cores to fuse them.<br>Current fusion: <b style="color:#ffd34d">${F ? F.name : (fk ? 'Unstable (no known fusion)' : 'none')}</b>${F ? '<br>' + F.desc : ''}</div></div>
      <div class="grid2">${cards}</div><h3>KNOWN FUSIONS</h3>${fusionList}`;
  }
  toggleCore(k) {
    const P = this.G.player;
    P.activeCores = P.activeCores || [];
    if (P.activeCores.includes(k)) P.activeCores = P.activeCores.filter((x) => x !== k);
    else { P.activeCores.push(k); if (P.activeCores.length > 2) P.activeCores.shift(); }
    const fk = P.activeCores.length === 2 ? fusionKey(...P.activeCores) : null;
    const newF = fk && FUSIONS[fk] ? fk : null;
    if (newF && newF !== P.fusion) { this.system(['[CLASS FUSION]', FUSIONS[newF].name.toUpperCase(), FUSIONS[newF].desc], { style: 'gold', sound: 'levelUp', time: 3 }); this.G.story.onFusion?.(newF); }
    P.fusion = newF; P.recalc();
    this.renderMenu(); Audio.play('magic', 'arcane');
  }
  drawBigMap() {
    const cv = document.getElementById('bigMap'); if (!cv) return; const g = cv.getContext('2d'); const S = 640;
    g.imageSmoothingEnabled = false; g.drawImage(this.mapImage, 0, 0, S, S);
    const G = this.G;
    const pt = (x, z) => this.w2m(x, z, S);
    g.font = 'bold 13px Rajdhani, sans-serif'; g.textAlign = 'center';
    const labels = [['Elmbrook', LOC.village], ['Astera', LOC.city], ['Whisperwood', LOC.forest], ['Ruins', LOC.ruins], ['Sun Scar', LOC.desert], ['Frostveil', LOC.snow], ['Ironspine', LOC.mountain], ['Ashen Maw', LOC.demon]];
    for (const [n, L] of labels) { const [x, y] = pt(L.x, L.z); g.fillStyle = '#000'; g.fillText(n, x + 1, y + 1); g.fillStyle = '#fff'; g.fillText(n, x, y); }
    const ws = G.world.waystones; this.mapWaystones = [];
    for (const [k, w] of Object.entries(ws)) {
      const found = G.flags.waystones?.includes(k); const [x, y] = pt(w.pos.x, w.pos.z);
      g.fillStyle = found ? '#5fd8ff' : 'rgba(255,255,255,.25)'; g.save(); g.translate(x, y); g.rotate(Math.PI / 4); g.fillRect(-5, -5, 10, 10); g.restore();
      if (found) this.mapWaystones.push({ k, x, y });
    }
    const obj = G.story.objectivePos?.(); if (obj) { const [x, y] = pt(obj.x, obj.z); g.strokeStyle = '#ffd34d'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, 9, 0, 7); g.stroke(); }
    if (!G.world.interior) { const [x, y] = pt(G.player.pos.x, G.player.pos.z); g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); g.strokeStyle = '#f33'; g.lineWidth = 2; g.stroke(); }
    cv.onclick = (e) => {
      const r = cv.getBoundingClientRect(); const mx = (e.clientX - r.left) / r.width * S, my = (e.clientY - r.top) / r.height * S;
      const radius = Math.max(14, 30 * S / r.width); // ~30 css px finger target however small the map is drawn
      let hit = null, best = radius;
      for (const w of this.mapWaystones) { const d = Math.hypot(w.x - mx, w.y - my); if (d < best) { best = d; hit = w; } }
      const msg = document.getElementById('mapMsg');
      if (!hit) { if (msg) msg.textContent = this.mapWaystones.length ? 'No discovered waystone there — tap a bright ◆.' : 'No waystones discovered yet. Touch one in the world to unlock fast travel.'; return; }
      if (G.world.interior) { if (msg) msg.textContent = "Can't fast travel from inside a dungeon or cave."; return; }
      if (G.ui.boss) { if (msg) msg.textContent = "Can't fast travel during a boss fight."; return; }
      if (G.cutscene) return;
      this.closeMenu(); G.fastTravel(hit.k);
    };
  }
  // shop
  openShop(title, items) { this.shop = { title, items }; this.openMenu('shop'); }
  shopBody() {
    const P = this.G.player;
    return `<div class="d" style="margin-bottom:10px">Gold: <b style="color:#ffd34d">${P.gold}</b></div><div class="grid2">` + this.shop.items.map((it, i) => {
      const owned = it.weapon && P.weapons.includes(it.weapon);
      return `<div class="card ${owned ? 'locked' : ''}"><div class="t">${esc(it.name)}</div><div class="d">${esc(it.desc || '')}</div><button class="act" data-buy="${i}" ${owned || P.gold < it.price ? 'disabled' : ''}>${owned ? 'OWNED' : 'BUY — ' + it.price + 'G'}</button></div>`;
    }).join('') + '</div>';
  }
  buy(i) {
    const it = this.shop.items[i]; const P = this.G.player;
    if (P.gold < it.price) return;
    P.gold -= it.price; Audio.play('coin');
    if (it.weapon) { P.giveWeapon(it.weapon); this.G.story.onBuy?.(it.weapon); }
    if (it.potion) P.potions += it.potion;
    if (it.elixir) { P.elixirs++; P.limit = 100; }
    this.renderMenu();
  }
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
export { wait };
