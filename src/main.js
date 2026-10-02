// RE:WORLD — The Forgotten Player. Game bootstrap & main loop.
import * as THREE from 'three';
import { Time } from './core/time.js';
import { Input } from './core/input.js';
import { Audio } from './core/audio.js';
import { CameraRig } from './core/camera.js';
import { Post } from './render/post.js';
import { FX } from './render/fx.js';
import { World, LOC } from './world/world.js';
import { Combat } from './combat/combat.js';
import { Player } from './entities/player.js';
import { Enemy, TYPES } from './entities/enemy.js';
import { Boss } from './entities/boss.js';
import { UI } from './ui/ui.js';
import { Story } from './story/story.js';
import { rng } from './core/util.js';
import { Animator } from './chars/anim.js';
import { Grass } from './world/grass.js';
import { TouchControls, isTouchDevice, goFullscreenLandscape } from './ui/touch.js';

const SAVE_KEY = 'reworld_save_v1';
const R = rng(4321);
const params = new URLSearchParams(location.search);

class Game {
  constructor() {
    this.state = 'boot';
    this.flags = {};
    this.enemies = []; this.npcs = []; this.interactables = [];
    this.attackTokens = 0; this.maxTokens = 2;
    this.hours = 8; this.day = 1; this.musicOn = true; this.freezeEnemies = 0;
    this.zoneState = [];
    this.inCombat = false; this.combatT = 0;
  }

  async init(progress) {
    const renderer = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.lowgfx = params.has('lowgfx');
    this.loadSettings();
    if (this.lowgfx) this.settings.quality = 'low';
    Animator.STYLE = this.settings.anim;
    renderer.setPixelRatio(this.pixelRatio());
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = this.settings.quality !== 'low'; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.getElementById('game').appendChild(renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 3200);
    this.post = new Post(renderer, this.scene, this.camera, { msaa: this.settings.quality === 'low' ? 0 : 4 }); this.post.setSize(innerWidth, innerHeight);
    FX.init(this.scene, this.camera);
    progress('Generating world…'); await frame();
    this.world = new World(this.scene);
    this.world.build((m) => progress(m));
    if (this.settings.quality === 'high') { const sh = this.world.sun.shadow; sh.mapSize.set(4096, 4096); const sc = sh.camera; sc.left = sc.bottom = -55; sc.right = sc.top = 55; sc.updateProjectionMatrix(); }
    await frame();
    this.grass = new Grass(this.scene, this.mobile ? 9 : 14);
    this.cam = new CameraRig(this.camera, this.world);
    this.combat = new Combat(this);
    this.ui = new UI(this);
    this.ui.buildMapImage();
    this.player = new Player(this);
    this.story = new Story(this);
    progress('Waking the villagers…'); await frame();
    this.story.init();
    // accessibility wrappers
    const shake = this.cam.shake.bind(this.cam); this.cam.shake = (a) => { if (!this.flags.noShake) shake(a); };
    const imp = this.post.impactFrame.bind(this.post); this.post.impactFrame = (f, m) => { if (!this.flags.noFlash) imp(f, m); };
    const fl = FX.flash.bind(FX); FX.flash = (a, c) => { if (!this.flags.noFlash) fl(a, c); };
    Input.attach(renderer.domElement);
    if (this.mobile) { this.touch = new TouchControls(this); document.body.classList.add('touch'); }
    addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); this.post.setSize(innerWidth, innerHeight); this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); });
    // warm up shaders
    this.player.pos.set(LOC.wake.x, this.world.groundAt(LOC.wake.x, LOC.wake.z), LOC.wake.z);
    this.cam.update(this.player);
    this.world.updateAtmosphere(this.hours, this.player.pos, 'forest', 10);
    renderer.compile(this.scene, this.camera);
    this.last = performance.now();
    renderer.setAnimationLoop(() => this.loop());
  }

  // ------------------------------------------------------------------ settings
  loadSettings() {
    this.mobile = isTouchDevice();
    // phones default to a balanced preset; adaptive resolution then keeps the frame rate smooth
    this.settings = { anim: 'smooth', quality: this.mobile ? 'medium' : 'high' };
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem('reworld_settings') || '{}')); } catch (e) { /* defaults */ }
  }
  saveSettings() { try { localStorage.setItem('reworld_settings', JSON.stringify(this.settings)); } catch (e) { /* ignore */ } }
  pixelRatio() {
    const base = { high: Math.min(devicePixelRatio, 2), medium: this.mobile ? Math.min(devicePixelRatio, 1.5) : 1, low: this.mobile ? 1 : 0.6 }[this.settings.quality] || 1;
    return base * (this.resScale || 1);
  }
  /** Dynamic resolution: drop render scale when frames get slow, raise it back when there's headroom. */
  adaptResolution(raw) {
    this.frameEMA = this.frameEMA ? this.frameEMA * 0.95 + raw * 0.05 : raw;
    this.adaptT = (this.adaptT || 0) + raw;
    if (this.adaptT < 2.5 || this.state !== 'play') return;
    this.adaptT = 0;
    const prev = this.resScale || 1;
    if (this.frameEMA > 1 / 40 && prev > 0.55) this.resScale = Math.max(0.55, prev - 0.1);
    else if (this.frameEMA < 1 / 56 && prev < 1) this.resScale = Math.min(1, prev + 0.05);
    if (this.resScale !== prev) { this.renderer.setPixelRatio(this.pixelRatio()); this.renderer.setSize(innerWidth, innerHeight); this.post.setSize(innerWidth, innerHeight); }
  }
  applySettings() {
    Animator.STYLE = this.settings.anim;
    this.renderer.setPixelRatio(this.pixelRatio()); this.renderer.setSize(innerWidth, innerHeight); this.post.setSize(innerWidth, innerHeight);
    this.saveSettings();
  }

  // ------------------------------------------------------------------ api used by systems
  setControl(v) { this.player.controlEnabled = v; Input.enabled = true; }
  music(name) { this.currentMusic = name; Audio.music.play(name); }
  spawnEnemy(type, level, pos, opts = {}) { const e = new Enemy(this, type, level, pos, opts); this.enemies.push(e); return e; }
  spawnBoss(kind, pos, opts = {}) { const b = new Boss(this, kind, pos, opts); this.enemies.push(b); return b; }
  removeEnemy(e) { e.dispose(); const i = this.enemies.indexOf(e); if (i >= 0) this.enemies.splice(i, 1); if (this.player.lock === e) { this.player.lock = null; this.cam.lock = null; } }
  onEnemyKilled(e) {
    const P = this.player;
    if (e.token) { e.token = false; this.attackTokens = Math.max(0, this.attackTokens - 1); }
    if (!e.boss && e.def.exp) {
      const exp = Math.round(e.def.exp[0] + e.def.exp[1] * e.level);
      const gold = Math.round(e.def.gold[0] + e.def.gold[1] * e.level * (0.6 + R() * 0.8));
      P.gainExp(exp); P.gold += gold;
      setTimeout(() => Audio.play('coin'), 300);
      const from = e.pos.clone(); from.y += 1;
      for (let i = 0; i < 8; i++) { const d = P.pos.clone().sub(from); d.y += 1; FX.glow.spawn({ x: from.x, y: from.y, z: from.z, vx: d.x * 1.6 + (R() - 0.5) * 4, vy: d.y * 1.6 + 4, vz: d.z * 1.6 + (R() - 0.5) * 4, life: 0.6, size: 0.25, r: 1, g: 0.85, b: 0.3, drag: 1 }); }
      if (R() < 0.12) { P.potions++; this.ui.toast('Found a Healing Potion'); }
    }
    this.story.onKill(e);
  }
  async onPlayerDeath() {
    const ui = this.ui;
    await new Promise((r) => setTimeout(r, 1800));
    await ui.system(['[HP: 0]', 'Respawning at the last waystone...'], { style: 'danger', time: 2.6, sound: 'danger' });
    await ui.fade(1, 0.8);
    for (const e of this.enemies.slice()) { if (e.boss) { e.hp = e.maxHp; e.dormant = true; e.act = null; e.state = 'idle'; } }
    // bosses reset: remove them so their trigger re-fires
    for (const e of this.enemies.slice()) if (e.boss) { const k = e.kind; this.removeEnemy(e); this.story[k] = null; }
    ui.bossBar(null); this.cam.boss = null; this.combat.clear();
    const P = this.player; P.revive(); P.gold = Math.floor(P.gold * 0.9);
    const ws = this.lastWaystone && this.world.waystones[this.lastWaystone];
    const target = ws ? ws.pos.clone().add(new THREE.Vector3(0, 0, 2)) : new THREE.Vector3(LOC.wake.x, 0, LOC.wake.z);
    this.world.interior = null; this.lastRegionKey = null;
    P.pos.copy(target); P.pos.y = this.world.groundAt(target.x, target.z);
    this.cam.smoothTarget.copy(P.pos);
    await ui.fade(0, 0.8);
  }
  respawnFromFall() {
    const P = this.player;
    const isl = this.world.markers.islandArrive;
    if (this.story.q('sky')) { P.pos.copy(isl); } else { P.pos.set(LOC.skyStone.x, 0, LOC.skyStone.z + 4); P.pos.y = this.world.groundAt(P.pos.x, P.pos.z); }
    P.vel.set(0, 0, 0); P.hp = Math.max(1, P.hp - P.maxHp * 0.1); this.ui.toast('You fell... (-10% HP)');
  }
  async fastTravel(k) {
    const w = this.world.waystones[k]; if (!w) return;
    await this.ui.fade(1, 0.4);
    for (const e of this.enemies.slice()) if (!e.boss) this.removeEnemy(e);
    this.zoneState = [];
    const P = this.player; P.pos.copy(w.pos).add(new THREE.Vector3(0, 0, 2)); P.pos.y = this.world.groundAt(P.pos.x, P.pos.z); P.vel.set(0, 0, 0);
    this.cam.smoothTarget.copy(P.pos); this.lastWaystone = k;
    await this.ui.fade(0, 0.6);
  }
  tryInteract() {
    const n = this.nearInteract; if (!n || this.ui.dialogueOpen || this.cutscene) return;
    Audio.play('ui');
    n.action();
  }

  // ------------------------------------------------------------------ save / load
  save() {
    if (!this.story.has('prologueDone')) return;
    const data = { v: 1, player: this.player.serialize(), flags: this.flags, hours: this.hours, day: this.day, lastWaystone: this.lastWaystone, interior: null, activeCores: this.player.activeCores };
    if (this.world.interior) data.player.pos = (this.world.markers[this.world.interior === 'dungeon' ? 'dungeonGate' : 'hiddenCave']).toArray();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch (e) { /* storage unavailable */ }
  }
  hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
  load() {
    let d; try { d = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { return false; }
    if (!d) return false;
    Object.assign(this.flags, d.flags); this.hours = d.hours ?? 9; this.day = d.day ?? 1; this.lastWaystone = d.lastWaystone;
    const P = this.player; P.deserialize(d.player); P.activeCores = d.activeCores || (P.classId === 'REINCARNATOR' ? ['swordsman'] : []);
    P.pos.y = this.world.groundAt(P.pos.x, P.pos.z, P.pos.y + 2);
    // restore world state from flags
    for (const c of this.world.chests) if (this.flags.chests?.includes(c.id)) { c.opened = true; if (c.lid) c.lid.rotation.x = -1.9; }
    for (const f of this.world.fragments) if (this.flags.fragments?.includes(f.index)) { f.taken = true; if (f.mesh) f.mesh.visible = false; }
    this.story.stage = 'free';
    this.story.refreshObjective();
    return true;
  }

  // ------------------------------------------------------------------ start modes
  async start(mode) {
    Audio.init();
    document.getElementById('boot').classList.add('hidden');
    this.state = 'play';
    if (this.mobile) goFullscreenLandscape();
    Input.requestLock();
    if (mode === 'continue' && this.load()) {
      this.ui.showHUD(true); this.player.state = 'move'; this.cam.orbitTo(this.player.yaw + Math.PI, 0.3);
      this.ui.fade(1, 0.01); await this.ui.fade(0, 1);
      this.ui.system(['[WELCOME BACK, PLAYER.]'], { time: 2.2 });
      return;
    }
    if (mode === 'skip') {
      const P = this.player; const w = LOC.wake;
      this.story.stage = 'free'; this.story.set('prologueDone');
      P.pos.set(w.x, this.world.groundAt(w.x, w.z), w.z); P.state = 'move'; P.setArmed(true); P.equip('broken', false); P.memorySync = 1;
      this.ui.showHUD(true); this.music('forest');
      this.ui.fade(1, 0.01); await this.ui.fade(0, 1);
      await this.ui.system(['[WELCOME BACK, PLAYER.]'], { time: 2.2 });
      await this.ui.system(['[WORLD DATA HAS BEEN ALTERED.]'], { time: 2.2, glitch: true });
      await this.ui.system(['[PRIMARY OBJECTIVE: DISCOVER WHO CHANGED THE WORLD.]'], { style: 'gold', time: 3 });
      this.story.start('awakening');
      return;
    }
    if (mode === 'wake') { await this.story.prologueWake(); return; }
    await this.story.prologue();
  }

  // ------------------------------------------------------------------ frame
  updateInteract() {
    const P = this.player; let best = null, bd = 1e9;
    if (this.cutscene || !P.alive) { this.nearInteract = null; return; }
    for (const it of this.interactables) {
      if (it.enabled && !it.enabled()) continue;
      const d = Math.hypot(it.pos.x - P.pos.x, it.pos.z - P.pos.z);
      if (d < it.r && Math.abs(it.pos.y - P.pos.y) < 4 && d < bd) { bd = d; best = it; }
    }
    for (const n of this.npcs) {
      if (!n.visible || !n.def.talk || this.inCombat || n.scriptAnim) continue;
      const d = n.pos.distanceTo(P.pos);
      if (d < 2.8 && d < bd) { bd = d; best = { label: `Talk to ${n.name}`, action: () => n.interact() }; }
    }
    this.nearInteract = best;
  }
  updateZones(dt) {
    if (this.world.interior || this.cutscene || this.story.stage !== 'free') return;
    const P = this.player;
    this.world.spawnZones.forEach((z, i) => {
      const st = this.zoneState[i] || (this.zoneState[i] = { list: [], t: 0 });
      st.list = st.list.filter((e) => e.alive || !e.remove);
      const d = Math.hypot(P.pos.x - z.x, P.pos.z - z.z);
      if (d > z.r + 160) { for (const e of st.list) if (e.state === 'idle' || e.state === 'return') { this.removeEnemy(e); } st.list = st.list.filter((e) => this.enemies.includes(e)); return; }
      if (d > z.r + 70) return;
      st.t -= dt;
      const alive = st.list.filter((e) => e.alive).length;
      if (alive < z.count && st.t <= 0) {
        st.t = alive < z.count / 2 ? 1 : 6;
        for (let tries = 0; tries < 6; tries++) {
          const a = R() * 6.28, r = Math.sqrt(R()) * z.r;
          const x = z.x + Math.cos(a) * r, zz = z.z + Math.sin(a) * r;
          if (Math.hypot(x - P.pos.x, zz - P.pos.z) < 22) continue;
          const y = this.world.groundAt(x, zz);
          if (y < 0.3) continue;
          const type = z.types[Math.floor(R() * z.types.length)];
          const lv = Math.floor(z.level[0] + R() * (z.level[1] - z.level[0] + 1));
          st.list.push(this.spawnEnemy(type, lv, new THREE.Vector3(x, y, zz), { region: z.region }));
          break;
        }
      }
    });
  }
  updateMusic() {
    if (this.cutscene || this.ui.boss || this.state !== 'play' || this.story.stage !== 'free') return;
    const theme = this.inCombat ? 'battle' : (this.regionKey || 'forest');
    const map = { cave: 'ruins', plains: 'forest' };
    const t = map[theme] || theme;
    if (t !== this.currentMusic) this.music(t);
    if (!this.inCombat) this.lastMusicRegion = t;
  }

  loop() {
    const now = performance.now();
    const raw = (now - this.last) / 1000; this.last = now;
    Time.update(raw);
    Input.poll();
    const dt = Time.dt, rdt = Time.rdt;
    if (this.state === 'play') {
      // menus
      if (!this.cutscene && !this.ui.dialogueOpen && !this.ui.menuOpen) {
        if (Input.pressed('pause')) this.ui.openMenu('system');
        else if (Input.pressed('status')) this.ui.openMenu('status');
        else if (Input.pressed('quests')) this.ui.openMenu('quests');
        else if (Input.pressed('classes')) this.ui.openMenu('classes');
        else if (Input.pressed('map')) this.ui.openMenu('map');
      }
      // clock: 1 game hour = 30s
      if (!Time.paused && !this.cutscene) { this.hours += rdt / 30; if (this.hours >= 24) { this.hours -= 24; this.day++; } }
      this.world.update(Time.game, dt);
      this.player.update(dt);
      if (this.freezeEnemies > 0) this.freezeEnemies -= rdt;
      const edt = this.freezeEnemies > 0 ? 0 : dt;
      let combat = false;
      for (let i = this.enemies.length - 1; i >= 0; i--) {
        const e = this.enemies[i];
        e.update(edt);
        if (e.alive && (e.state === 'chase' || e.state === 'windup' || e.state === 'attack' || e.state === 'strafe' || e.state === 'act') && e.pos.distanceTo(this.player.pos) < 35 && !e.dormant) combat = true;
        if (e.remove) this.removeEnemy(e);
      }
      this.combatT = combat ? 1.5 : this.combatT - rdt;
      this.inCombat = this.combatT > 0;
      for (const n of this.npcs) n.update(dt);
      this.story.update(dt); this.story.updateAllies(dt);
      this.combat.update(dt);
      this.updateZones(dt);
      this.updateInteract();
      // region
      const reg = this.world.regionAt(this.player.pos);
      if (reg.key !== this.lastRegionKey && !this.cutscene && this.story.stage === 'free') { this.lastRegionKey = reg.key; this.regionKey = reg.key; this.ui.region(reg.name); Audio.amb.set(reg.key, 1, this.hours < 6 || this.hours > 19); }
      this.regionKey = reg.key;
      this.updateMusic();
    }
    this.cam.update(this.player);
    const regKey = this.world.interior ? this.world.interior : (this.regionKey || 'forest');
    this.world.updateAtmosphere(this.hours, this.player.pos, regKey, rdt);
    if (this.flags.whiteSky) { this.world.skyU.top.value.set(0xffffff); this.world.skyU.horizon.value.set(0xf0f8ff); this.scene.fog.color.set(0xf0f8ff); }
    if (this.world.interior === 'throne') { this.scene.fog.color.set(0x140a20); this.scene.fog.near = 20; this.scene.fog.far = 120; }
    this.grass.update(Time.game, this.player.pos, this.world.interior, this.player.pos.y > LOC.islands.y - 30);
    // ambient particles: lava embers, snow, sky motes
    this.ambientParticles(rdt);
    FX.update((x, z) => this.world.groundAt(x, z));
    this.ui.update(rdt);
    this.touch?.update();
    if (!this.lowgfx) this.adaptResolution(raw);
    Audio.update(rdt);
    this.post.render(rdt);
    Input.endFrame();
  }
  ambientParticles() {
    const P = this.player.pos; const k = this.regionKey;
    if (this.world.interior === 'throne') { if (Math.random() < 0.5) FX.glow.spawn({ x: P.x + (R() - 0.5) * 30, y: P.y + R() * 2, z: P.z + (R() - 0.5) * 30, vy: 1 + R(), life: 3, size: 0.25, r: 0.7, g: 0.4, b: 1, fadeIn: 0.3 }); return; }
    if (this.world.interior) { if (Math.random() < 0.2) FX.glow.spawn({ x: P.x + (R() - 0.5) * 20, y: P.y + R() * 5, z: P.z + (R() - 0.5) * 20, vy: 0.3, life: 3, size: 0.15, r: 0.4, g: 0.8, b: 1, fadeIn: 0.3 }); return; }
    if (k === 'snow') for (let i = 0; i < 3; i++) FX.dust.spawn({ x: P.x + (R() - 0.5) * 40, y: P.y + 12, z: P.z + (R() - 0.5) * 40, vx: 2, vy: -3, vz: 0.5, life: 4, size: 0.18, r: 1, g: 1, b: 1, a: 0.9, fadeIn: 0.2 });
    else if (k === 'demon') { if (Math.random() < 0.8) FX.glow.spawn({ x: P.x + (R() - 0.5) * 40, y: P.y + R() * 2, z: P.z + (R() - 0.5) * 40, vx: (R() - 0.5), vy: 2 + R() * 2, vz: (R() - 0.5), life: 3, size: 0.2, r: 1, g: 0.35, b: 0.1, fadeIn: 0.2 }); }
    else if (k === 'desert') { if (Math.random() < 0.3) FX.dust.spawn({ x: P.x + (R() - 0.5) * 30, y: P.y + 0.5 + R(), z: P.z + (R() - 0.5) * 30, vx: 6, vy: 0, vz: 1, life: 2, size: 1.2, grow: 2, r: 0.95, g: 0.85, b: 0.65, a: 0.3, fadeIn: 0.3 }); }
    else if (k === 'sky') { if (Math.random() < 0.4) FX.glow.spawn({ x: P.x + (R() - 0.5) * 40, y: P.y - 2 + R() * 8, z: P.z + (R() - 0.5) * 40, vy: 0.5, life: 4, size: 0.2, r: 1, g: 1, b: 0.8, fadeIn: 0.3 }); }
    else if (k === 'forest' && (this.hours > 19 || this.hours < 5)) { if (Math.random() < 0.3) FX.glow.spawn({ x: P.x + (R() - 0.5) * 30, y: P.y + 0.5 + R() * 2, z: P.z + (R() - 0.5) * 30, vx: (R() - 0.5), vy: (R() - 0.5) * 0.5, vz: (R() - 0.5), life: 3, size: 0.18, r: 0.8, g: 1, b: 0.4, fadeIn: 0.3 }); }
    else if (k === 'forest' && Math.random() < 0.08) FX.dust.spawn({ x: P.x + (R() - 0.5) * 30, y: P.y + 6 + R() * 4, z: P.z + (R() - 0.5) * 30, vx: 1, vy: -1, vz: 0.3, life: 5, size: 0.2, r: 0.5, g: 0.8, b: 0.3, a: 0.9, spin: 2, fadeIn: 0.2 });
  }
}

const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

// ------------------------------------------------------------------ boot
const G = new Game();
window.GAME = G; G.input = Input;
const loading = document.getElementById('loading');
const btns = ['btnNew', 'btnSkip', 'btnContinue'].map((id) => document.getElementById(id));
btns.forEach((b) => (b.disabled = true));
G.init((m) => (loading.textContent = m)).then(() => {
  loading.textContent = 'Ready.';
  btns.forEach((b) => (b.disabled = false));
  if (G.hasSave()) document.getElementById('btnContinue').classList.remove('hidden');
  document.getElementById('btnNew').onclick = () => G.start('new');
  document.getElementById('btnSkip').onclick = () => G.start('skip');
  document.getElementById('btnContinue').onclick = () => G.start('continue');
  const auto = params.get('autostart');
  if (auto) G.start(auto);
  window.__done = true;
}).catch((e) => { loading.textContent = 'Error: ' + e.message; console.error(e); });
export { G, TYPES };
