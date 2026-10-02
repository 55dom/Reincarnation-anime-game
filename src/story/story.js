// Narrative engine: flags & quests, interactables, the cinematic prologue, story cutscenes,
// boss encounters, class reveal, fusion specials, ultimate/finisher cinematics and blade clashes.
import * as THREE from 'three';
import { Time } from '../core/time.js';
import { Audio } from '../core/audio.js';
import { Input } from '../core/input.js';
import { FX } from '../render/fx.js';
import { Batch } from '../world/builder.js';
import { LOC, INTERIOR } from '../world/world.js';
import { PLAYER_LOOK, AVATAR_LOOK, CORES, FUSIONS } from '../entities/player.js';
import { WEAPONS, makeWeapon } from '../combat/weapons.js';
import { Boss } from '../entities/boss.js';
import { NPC } from '../entities/npc.js';
import { npcDefs, think, L } from './npcs.js';
import { makeWolf } from '../chars/creatures.js';
import { glowMat, toon } from '../render/toon.js';
import { slashQuat } from '../combat/combat.js';
import { rng } from '../core/util.js';

const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const R = rng(31);
const THRONE = { x: 3000, z: -1400 };

export const QUESTS = {
  awakening: { title: 'Awakening', desc: 'You woke up inside Eternal Realms... or something like it. Follow the road east and find people.', pos: () => LOC.village },
  herbs: { title: 'Medicine for Grandma', desc: 'Lina needs 5 slime jellies from slimes in Whisperwood.', progress: (q) => `Slime jelly: ${Math.min(5, q.count || 0)}/5`, pos: (G, q) => (q.count >= 5 ? G.world.markers.linaHouse : { x: 60, z: 330 }) },
  elmbrook: { title: 'A Village That Shouldn\'t Exist', desc: 'Speak with Elder Maren of Elmbrook.', pos: (G) => G.world.markers.chiefHouse },
  goblins: { title: 'Goblin Trouble', desc: 'Goblins raid the fields at night. Defeat 6 goblins on the plains near the crossroads.', progress: (q) => `Goblins: ${Math.min(6, q.count || 0)}/6`, pos: (G, q) => (q.count >= 6 ? G.world.markers.chiefHouse : { x: 150, z: 120 }) },
  capital: { title: 'The Capital Has Changed', desc: 'Register at the Adventurer\'s Guild in the Royal Capital, Astera (north of the crossroads).', pos: (G) => G.world.markers.guild },
  ruins: { title: 'Ruins of the First Cycle', desc: 'The ruins southwest began glowing the day you arrived. Enter the depths through the stone gate.', pos: (G) => (G.world.interior === 'dungeon' ? G.world.markers.golemArena : G.world.markers.dungeonGate) },
  cores: { title: 'The Hidden Class', desc: 'As a Reincarnator you can absorb class cores. Find two class masters (Mage & Priest in Astera, Archer & Beast Tamer at the forest camp, Assassin in the desert, Guardian at Ironspine Watch). Then fuse two cores in the Class menu (K).', progress: (q, G) => `Cores: ${G.player.cores.length - 1}/2`, pos: (G) => G.world.markers.mageTower },
  threats: { title: 'World Data Anomalies', desc: 'Monsters that never existed in Eternal Realms. Defeat the Frost Behemoth (Frostveil, northwest) and the Demon General (Ashen Maw, northeast).', progress: (q, G) => `${G.story.has('behemothDown') ? '✔' : '✘'} Frost Behemoth   ${G.story.has('generalDown') ? '✔' : '✘'} Demon General`, pos: (G) => (!G.story.has('behemothDown') ? G.world.markers.frostArena : G.world.markers.demonArena) },
  sky: { title: 'Beyond the Sky', desc: 'The Sky Waystone east of the crossroads has awakened. Ascend to the Floating Isles and find who is watching.', pos: (G) => (G.player.pos.y > LOC.islands.y - 30 ? G.world.markers.heraldArena : G.world.markers.skyStone) },
  cycle: { title: 'Stop the Reset', desc: 'The Administrator will reset the world in 312 days. Grow stronger. Find the remaining memories. (End of Part I — free exploration)' },
  knight: { title: '??? The Forgotten Hollow', desc: 'A crack in the Ironspine cliffs hides a cave nobody returns from.', pos: (G) => G.world.markers.hiddenCave, hidden: true },
};

export const FRAGMENTS = [
  'DEV LOG 001\nThe signal repeats every 31.5 billion seconds. One thousand years, almost exactly. It isn\'t noise.\nIt\'s a world.',
  'MEMORY — Cycle 3\nI stood in this same forest. The wolf was white then. I didn\'t remember a thing until the very end, and then I remembered everything at once.',
  'DEV LOG 014\nWe can\'t reach it. We can only watch. So we built Eternal Realms — a simulation precise enough to train a mind for that place.',
  'MEMORY — Cycle 5\nThe Administrator spoke to me. "Without the reset, this world decays. I am not cruelty. I am maintenance." I believed it. I let it happen.',
  'DEV LOG 027\nPlayers who finish the game show abnormal neural synchronization. One of them might carry memory across the boundary. One of them might survive the reset.',
  'MEMORY — Cycle 6\nI made it to the sky. I lost. What was left of my body became a knight with no name. My memories scattered like glass.',
  'DEV LOG 031\nIt noticed us. The final boss data rewrote itself overnight. Varkas\'s last line — "remember the cycle" — wasn\'t written by any of us.',
  'MEMORY — ???\nIf you\'re reading this, you are me. Seventh time. Listen: the Administrator isn\'t a god.\nIt was the first player.',
];

export class Story {
  constructor(G) {
    this.G = G;
    G.flags.quests = G.flags.quests || {};
    this.chestMeshes = []; this.fragMeshes = [];
  }
  // ------------------------------------------------------------------ flags & quests
  has(k) { return !!this.G.flags[k]; }
  set(k, v = true) { this.G.flags[k] = v; }
  dayFlag(k) { const key = k + '_d' + this.G.day; if (this.G.flags[key]) return true; this.G.flags[key] = true; return false; }
  q(id) { return this.G.flags.quests[id]; }
  start(id) {
    if (this.q(id)) return;
    this.G.flags.quests[id] = { count: 0, done: false, t: Date.now() };
    this.G.ui.system(['[QUEST ACCEPTED]', QUESTS[id].title], { style: 'gold', time: 2.6 });
    this.active = id; this.refreshObjective();
  }
  complete(id, rw = {}) {
    const q = this.q(id); if (!q || q.done) return;
    q.done = true;
    this.G.ui.system(['[QUEST COMPLETE]', QUESTS[id].title, [rw.exp && `+${rw.exp} EXP`, rw.gold && `+${rw.gold} G`, rw.potions && `+${rw.potions} Potions`].filter(Boolean).join('   ')], { style: 'gold', sound: 'levelUp', time: 3 });
    const P = this.G.player;
    if (rw.gold) P.gold += rw.gold; if (rw.potions) P.potions += rw.potions;
    if (rw.exp) setTimeout(() => P.gainExp(rw.exp), 1200);
    if (this.active === id) this.active = this.pickActive();
    this.refreshObjective(); this.G.save();
  }
  pickActive() {
    const order = ['awakening', 'elmbrook', 'goblins', 'capital', 'ruins', 'cores', 'threats', 'sky', 'cycle', 'herbs', 'knight'];
    for (const id of order) { const q = this.q(id); if (q && !q.done) return id; }
    return null;
  }
  refreshObjective() {
    const id = this.active || this.pickActive(); this.active = id;
    if (!id) { this.G.ui.objective(null); return; }
    const Q = QUESTS[id]; const q = this.q(id);
    this.G.ui.objective(Q.title, Q.progress ? Q.progress(q, this.G) : '');
  }
  objectivePos() { const id = this.active; if (!id) return null; const Q = QUESTS[id]; return Q.pos ? Q.pos(this.G, this.q(id)) : null; }
  questList() {
    return Object.entries(this.G.flags.quests).map(([id, q]) => ({ title: QUESTS[id].title, desc: QUESTS[id].desc, progress: QUESTS[id].progress && !q.done ? QUESTS[id].progress(q, this.G) : '', done: q.done, t: q.t })).sort((a, b) => (a.done - b.done) || (b.t - a.t));
  }
  fragmentText(i) { return FRAGMENTS[i]; }

  // ------------------------------------------------------------------ setup
  init() {
    const G = this.G;
    this.npcs = npcDefs(G).map((d) => new NPC(G, d));
    G.npcs.push(...this.npcs);
    this.buildInteractables();
    this.buildThrone();
  }
  buildInteractables() {
    const G = this.G, W = G.world;
    // chests
    for (const c of W.chests) {
      const g = new THREE.Group(); g.position.copy(c.pos);
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.6, 0.7), toon(0x8a5a2a)); b.position.y = 0.3; g.add(b);
      const lid = new THREE.Group(); lid.position.set(0, 0.6, -0.35); g.add(lid);
      const lm = new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.25, 0.74), toon(0xa86a32)); lm.position.set(0, 0.12, 0.35); lid.add(lm);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.1, 0.1), toon(0xe8c04a)); trim.position.set(0, 0.3, 0.36); g.add(trim);
      g.rotation.y = R() * 6; G.scene.add(g); c.mesh = g; c.lid = lid;
      if (G.flags.chests?.includes(c.id)) { c.opened = true; lid.rotation.x = -1.9; }
      G.interactables.push({ pos: c.pos, r: 2.2, label: 'Open chest', enabled: () => !c.opened, action: () => this.openChest(c) });
    }
    // memory fragments
    for (const f of W.fragments) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), glowMat(0x9fe8ff, 0.95)); m.position.copy(f.pos); m.position.y += 1.3; G.scene.add(m);
      const halo = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.6, 16), glowMat(0x5fd8ff, 0.5)); m.add(halo);
      f.mesh = m;
      if (G.flags.fragments?.includes(f.index)) { f.taken = true; m.visible = false; }
      W.animated.push((t) => { m.rotation.y = t * 2; halo.rotation.x = t; m.position.y = f.pos.y + 1.3 + Math.sin(t * 2 + f.index) * 0.15; });
      G.interactables.push({ pos: f.pos, r: 2, label: 'Touch memory fragment', enabled: () => !f.taken, action: () => this.takeFragment(f) });
    }
    // waystones
    for (const [k, w] of Object.entries(W.waystones)) G.interactables.push({ pos: w.pos, r: 2.4, label: 'Waystone — rest & save', action: () => this.useWaystone(k) });
    G.interactables.push({ pos: W.markers.brokenSword, r: 2.2, label: 'Pick up the broken sword', enabled: () => this.stage === 'sword', action: () => this.prologuePickup() });
    G.interactables.push({ pos: W.markers.dungeonGate, r: 3.5, label: 'Enter the Ruins Depths', action: () => this.enterDungeon() });
    G.interactables.push({ pos: W.markers.dungeonExit, r: 2.5, label: 'Leave the depths', enabled: () => G.world.interior === 'dungeon', action: () => this.leaveInterior(W.markers.dungeonGate.clone().add(V(0, 0, -3))) });
    G.interactables.push({ pos: W.markers.mural, r: 4, label: 'Examine the mural', enabled: () => G.world.interior === 'dungeon', action: () => this.examineMural() });
    G.interactables.push({ pos: W.markers.hiddenCave, r: 3, label: 'Squeeze through the crack', action: () => this.enterCave() });
    G.interactables.push({ pos: W.markers.caveEntry, r: 2.5, label: 'Leave the hollow', enabled: () => G.world.interior === 'cave', action: () => this.leaveInterior(W.markers.hiddenCave.clone().add(V(0, 0, 3))) });
    G.interactables.push({ pos: W.markers.skyStone, r: 4, label: 'Ascend to the Floating Isles', enabled: () => this.has('skyOpen'), action: () => this.ascend() });
    G.interactables.push({ pos: W.markers.islandReturn, r: 2.5, label: 'Descend to the surface', enabled: () => G.player.pos.y > LOC.islands.y - 30, action: () => this.descend() });
    G.interactables.push({ pos: W.markers.sunTemple, r: 3, label: 'Read the inscription', action: () => G.ui.talk([['Inscription', '"The sun rises seven times over a world that forgets. The eighth dawn belongs to the one who remembers."']]) });
    G.interactables.push({ pos: W.markers.ruinsAltar, r: 4, label: 'Touch the altar', action: () => this.altar() });
  }
  buildThrone() {
    const G = this.G; const b = new Batch(); const X = THRONE.x, Z = THRONE.z;
    b.cyl(X, -1, Z, 34, 1, 0x2a2232, { seg: 8 }); G.world.addPlatformCircle(X, Z, 34, 0);
    b.block(X, -0.02, Z, 5, 0.06, 50, 0x8a1a2a, { jitter: 0 });
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * 6.28; const x = X + Math.cos(a) * 30, z = Z + Math.sin(a) * 30;
      b.cyl(x, 0, z, 1.6, 26, 0x3a3044, { seg: 8 }); G.world.addCircle(x, z, 1.8, 30);
      b.block(x, 0, z, 4, 1, 4, 0x4a4054);
    }
    b.block(X, 0, Z - 26, 12, 3, 6, 0x3a3044); b.block(X, 3, Z - 27, 6, 9, 2, 0xc8a040); b.block(X, 3, Z - 26, 5, 1.2, 3, 0x6a1a3a);
    b.cyl(X, 30, Z, 36, 2, 0x1a1420, { seg: 8 });
    this.throneMesh = b.build(); G.scene.add(this.throneMesh);
    const win = new THREE.Mesh(new THREE.CircleGeometry(9, 24), glowMat(0x9a6aff, 0.5)); win.position.set(X, 18, Z - 29.5); G.scene.add(win);
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28 + 0.2; G.world.crystal(X + Math.cos(a) * 24, 2, Z + Math.sin(a) * 24, 0.8, 0xb06aff, true); }
  }

  // ------------------------------------------------------------------ cinematic helpers
  cine(on) {
    const G = this.G; G.cutscene = on; G.setControl(!on); this.G.ui.letterbox(on);
    if (on) { this.hudWas = G.ui.hudOn; G.ui.showHUD(false); } else if (this.hudWas) G.ui.showHUD(true);
    if (on) { G.player.vel.set(0, 0, 0); G.player.lock = null; G.cam.lock = null; }
  }
  shot(keys, opts = {}) { return new Promise((res) => this.G.cam.play(keys, { ...opts, onEnd: res })); }
  /** camera keys relative to player facing */
  around(P, keys) { return keys.map((k) => ({ ...k, pos: k.pos, look: k.look })); }
  face(actor, target) { actor.yaw = Math.atan2(target.x - actor.pos.x, target.z - actor.pos.z); }

  // ------------------------------------------------------------------ PROLOGUE
  async prologue() {
    const G = this.G, P = G.player, ui = G.ui;
    this.stage = 'finalboss';
    G.world.interior = 'throne';
    G.flags.allSkills = true; G.flags.cannotDie = true;
    P.name = 'PLAYER'; P.classLabel = 'Sword Saint';
    P.level = 99; P.recalc(); P.hp = P.maxHp; P.mp = P.maxMp; P.limit = 100;
    P.weapons = ['magic', 'katana', 'great', 'dual', 'cursed']; P.buildModel(AVATAR_LOOK); P.equip('magic', false);
    P.pos.set(THRONE.x, 0, THRONE.z + 14); P.yaw = Math.PI;
    const boss = G.spawnBoss('varkas', V(THRONE.x, 0, THRONE.z - 10), { arena: V(THRONE.x, 0, THRONE.z), arenaR: 28 });
    boss.dmgTakenMult = 0.16; boss.yaw = 0; this.varkas = boss;
    G.music('finalboss');
    await ui.fade(1, 0.01);
    this.cine(true); ui.showHUD(false);
    const X = THRONE.x, Z = THRONE.z;
    const s1 = this.shot([
      { t: 0, pos: [X + 18, 22, Z + 30], look: [X, 4, Z - 10], fov: 45 },
      { t: 5, pos: [X - 6, 4, Z + 22], look: [X, 3, Z - 6], fov: 50 },
    ]);
    ui.fade(0, 2);
    ui.system(['ETERNAL REALMS', 'FINAL CHAPTER — THE THRONE OF ETERNITY'], { style: 'gold', time: 4, sound: null });
    await s1;
    await this.shot([{ t: 0, pos: [X - 3.5, 3.6, Z - 1.5], look: [X, 3.7, Z - 10], fov: 34 }, { t: 1.8, pos: [X - 3, 3.5, Z - 2.5], look: [X, 3.9, Z - 10], fov: 30 }], { holdLast: true });
    boss.char.setExpression('smug', 6);
    await ui.talk([['Varkas', 'So... the Player arrives at last. One thousand hours. One thousand deaths. And still you return.', { pitch: 90 }]]);
    await this.shot([{ t: 0, pos: [X - 1.5, 2.2, Z + 11.2], look: [X, 1.6, Z + 14], fov: 38 }, { t: 1.5, pos: [X - 1.2, 2.0, Z + 11.6], look: [X, 1.6, Z + 14], fov: 34 }], { holdLast: true });
    P.char.setExpression('determined', 6);
    await ui.talk([[P.name, 'Your HP is at 3%, Varkas. This is the last fight. Let\'s finish it!']]);
    G.cam.stop(); G.cam.orbitTo(0, 0.25);
    this.cine(false); ui.showHUD(true);
    ui.bossBar(boss); boss.dormant = false; boss.hp = boss.maxHp;
    ui.system(['[FINAL BOSS]', 'VARKAS, THE ETERNAL KING', 'LMB light · RMB heavy · Shift dodge · Space jump · E skill · R ULTIMATE'], { style: 'danger', time: 4.5, sound: 'danger' });
    Input.requestLock();
    G.cam.boss = boss;
    const start = performance.now();
    await new Promise((res) => {
      const iv = setInterval(() => { if (boss.hp <= boss.maxHp * 0.02 + 1 || performance.now() - start > 75000) { clearInterval(iv); res(); } }, 100);
    });
    await this.prologueFinalBlow(boss);
  }
  async prologueFinalBlow(boss) {
    const G = this.G, P = G.player, ui = G.ui;
    this.cine(true); boss.act = null; boss.dormant = true; boss.state = 'finished'; G.combat.clear();
    P.state = 'scripted'; P.move = null;
    ui.bossBar(null); G.cam.boss = null;
    const X = boss.pos.x, Z = boss.pos.z;
    P.pos.set(X, 0, Z + 7); P.yaw = Math.PI; boss.yaw = 0;
    boss.anim.play('kneel'); boss.char.setExpression('pain');
    P.anim.play('ultRaise', { restart: true }); P.char.setExpression('shout', 4);
    Audio.play('charge'); FX.pillar(P.pos, { color: 0xffe08a, radius: 2, height: 30, dur: 2.5 });
    await this.shot([{ t: 0, pos: [X + 4, 1, Z + 9], look: [X, 3, Z + 7], fov: 40 }, { t: 1.6, pos: [X + 2.5, 0.6, Z + 10], look: [X, 4.5, Z + 7], fov: 34 }]);
    Audio.say('big', 'hero');
    P.anim.play('mv_dash', { clip: P.moves.dashSlash.clip, restart: true });
    P.afterimageBurst(4, 0xffe08a);
    const startP = P.pos.clone();
    const cam = this.shot([{ t: 0, pos: [X - 6, 2, Z + 2], look: [X, 2, Z + 2], fov: 50 }, { t: 0.3, pos: [X - 6, 2, Z - 1], look: [X, 2, Z - 1], fov: 50, cut: true }]);
    for (let i = 0; i <= 10; i++) { P.pos.lerpVectors(startP, V(X, 0, Z - 5), i / 10); await wait(0.02); }
    await cam;
    // the cut
    Time.hitStop(0.25); G.post.impactFrame(4, 2); FX.flash(1);
    FX.slash(V(X, 3, Z), slashQuat(0, 0.1), { color: 0xffe08a, scale: 6, flip: true, dur: 0.12, life: 0.5 });
    FX.impactStar(V(X, 3, Z), { size: 6 }); Audio.play('ultimate'); G.cam.shake(1);
    await wait(0.3);
    Time.slowMo(3, 0.12);
    await this.shot([{ t: 0, pos: [X + 5, 1.5, Z - 9], look: [X, 2.5, Z - 2], fov: 40 }, { t: 3, pos: [X + 3.5, 1.2, Z - 8], look: [X, 2.5, Z - 2], fov: 34 }], { holdLast: true });
    boss.anim.play('death', { restart: true });
    for (let i = 0; i < 8; i++) FX.glowBurst(V(X, 2 + i * 0.3, Z), { count: 12, color: [1, 0.9, 0.6], speed: 4, size: 0.6 });
    await ui.talk([['Varkas', '...Remember... the cycle... Player...', { pitch: 80 }]]);
    Audio.play('explosion', 2); FX.flash(1);
    boss.root.visible = false; boss.alive = false; boss.remove = true;
    G.cam.stop();
    await ui.system(['[CONGRATULATIONS]', 'ETERNAL REALMS — COMPLETE', 'Thank you for playing.'], { style: 'gold', time: 3.4, sound: 'levelUp' });
    G.music('silence');
    await ui.fade(1, 1.5);
    ui.letterbox(false); ui.showHUD(false);
    // real world interlude
    const card = document.createElement('div');
    card.style.cssText = 'position:fixed;inset:0;z-index:41;display:flex;align-items:center;justify-content:center;flex-direction:column;font-size:22px;letter-spacing:2px;color:#cfd8e0;text-align:center;line-height:2';
    document.body.appendChild(card);
    const line = async (t, d = 2.6) => { card.innerHTML = `<div style="opacity:0;transition:opacity .8s">${t}</div>`; requestAnimationFrame(() => (card.firstChild.style.opacity = 1)); await wait(d); card.firstChild.style.opacity = 0; await wait(0.8); };
    await line('3:47 AM.<br><span style="font-size:16px;opacity:.7">A dark bedroom. The glow of a monitor. Ending credits scroll.</span>', 3.4);
    await line('"Finally... I did it."', 2.4);
    Audio.play('heartbeat'); await wait(0.9); Audio.play('heartbeat');
    await line('Your chest tightens.<br>The room tilts.', 2.6);
    Audio.play('heartbeat'); await wait(0.6); Audio.play('heartbeat'); await wait(0.4);
    Audio.play('flatline');
    card.innerHTML = ''; await wait(3.4);
    await line('...', 1.6);
    await line('...hey.', 1.8);
    card.remove();
    await this.prologueWake();
  }
  async prologueWake() {
    const G = this.G, P = G.player, ui = G.ui;
    this.stage = 'wake';
    for (const e of G.enemies.slice()) G.removeEnemy(e);
    G.world.interior = null;
    G.flags.allSkills = false;
    P.name = 'UNKNOWN'; P.classLabel = null; P.classId = 'ERROR';
    P.level = 1; P.exp = 0; P.recalc(); P.hp = P.maxHp; P.mp = P.maxMp; P.limit = 0;
    P.weapons = ['broken']; P.weaponId = 'broken';
    P.buildModel(PLAYER_LOOK); P.setArmed(false);
    const w = LOC.wake; const y = G.world.groundAt(w.x, w.z);
    P.pos.set(w.x, y, w.z); P.yaw = -2.4; P.vel.set(0, 0, 0);
    P.state = 'scripted'; P.anim.play('lie', { restart: true }); P.char.setExpression('blink', 99);
    G.hours = 7.5; G.music('silence');
    this.cine(true); ui.letterbox(true);
    const px = P.pos.x, pz = P.pos.z;
    const hx = -Math.sin(P.yaw), hz = -Math.cos(P.yaw); // the head lies toward the character's back
    G.cam.play([{ t: 0, pos: [px - hx * 0.6, y + 4.5, pz - hz * 0.6], look: [px + hx * 0.8, y + 0.2, pz + hz * 0.8], fov: 30 }, { t: 6, pos: [px - hx * 0.4, y + 1.9, pz - hz * 0.4], look: [px + hx * 0.85, y + 0.25, pz + hz * 0.85], fov: 32 }], { holdLast: true });
    await ui.fade(0, 3);
    Audio.amb.set('forest', 1, false);
    await wait(2.5);
    P.char.setExpression('neutral'); await wait(0.25); P.char.setExpression('blink'); await wait(0.15); P.char.setExpression('surprised', 3);
    Audio.say('gasp', 'hero');
    await wait(0.8);
    P.anim.play('wakeUp', { restart: true });
    const c2 = this.shot([{ t: 0, pos: [px + 3, y + 1.4, pz + 3], look: [px, y + 0.6, pz], fov: 40 }, { t: 3.5, pos: [px + 2.5, y + 1.6, pz - 2.5], look: [px, y + 1.1, pz], fov: 40 }]);
    await wait(1.6);
    await ui.say(P.name === 'UNKNOWN' ? 'You' : P.name, 'Where... am I? I was just... at my desk...', { auto: 2.4 });
    await c2;
    // slow orbit around the player while he stands
    P.anim.play('idle'); P.char.setExpression('surprised', 4);
    G.music('forest');
    const orbit = [];
    for (let i = 0; i <= 8; i++) { const a = -0.8 + i / 8 * Math.PI * 1.6; orbit.push({ t: i * 0.9, pos: [px + Math.sin(a) * 4, y + 1.7 - i * 0.05, pz + Math.cos(a) * 4], look: [px, y + 1.25, pz], fov: 42 }); }
    const orb = this.shot(orbit);
    await wait(1.2);
    await ui.statusWindow(P, { time: 5.5 });
    await orb;
    P.anim.play('lookAround', { restart: true });
    G.cam.play([{ t: 0, pos: [px - 3.5, y + 1.8, pz + 2], look: [px, y + 1.3, pz], fov: 45 }, { t: 6, pos: [px - 4.5, y + 2.4, pz + 3], look: [px, y + 1.3, pz], fov: 45 }], { holdLast: true });
    await ui.talk([['You', 'Level 1... Class: ERROR? This status screen... it\'s Eternal Realms\' UI.'], ['You', 'These trees — this is Whisperwood. The starting forest. But... it\'s so real. I can smell the grass.'], think(G, 'Did I... get pulled into the game?')]);
    // the wolf
    Audio.play('howl'); await wait(1.2);
    P.char.setExpression('surprised', 3); P.anim.play('shock', { restart: true });
    const wp = V(px - 14, 0, pz - 10); wp.y = G.world.groundAt(wp.x, wp.z);
    const wolf = G.spawnEnemy('wolf', 7, wp, { name: 'Dire Wolf', scale: 1.35, hpMult: 0.75, region: 'prologue' });
    wolf.hideBar = true; wolf.state = 'alert'; wolf.stateT = -99; this.wolf = wolf; this.face(wolf, P.pos);
    this.face(P, wolf.pos);
    await this.shot([{ t: 0, pos: [wp.x + 3, wp.y + 1.2, wp.z + 4], look: [wp.x, wp.y + 0.9, wp.z], fov: 38 }, { t: 1.6, pos: [wp.x + 2.2, wp.y + 0.8, wp.z + 3.2], look: [wp.x, wp.y + 1, wp.z], fov: 32 }]);
    Audio.play('growl', 1, 1.2); G.cam.shake(0.2);
    ui.system(['[DANGER]', '[DIRE WOLF — LEVEL 7]'], { style: 'danger', sound: 'danger', time: 3 });
    G.music('battle');
    await this.shot([{ t: 0, pos: [px + 1.5, y + 1.7, pz + 1.8], look: [px, y + 1.5, pz], fov: 38 }, { t: 1.4, pos: [px + 1.2, y + 1.6, pz + 1.5], look: [px, y + 1.5, pz], fov: 34 }], { holdLast: true });
    await ui.talk([['You', 'A dire wolf?! Those don\'t spawn here! I\'m level ONE!'], think(G, 'There — something shining in the grass. A sword!')]);
    G.cam.stop(); G.cam.orbitTo(P.yaw + Math.PI, 0.3);
    this.cine(false); ui.showHUD(true); ui.letterbox(false);
    P.state = 'move'; G.flags.walkOnly = false;
    this.stage = 'sword';
    this.swordGlint = new THREE.Mesh(new THREE.OctahedronGeometry(0.25, 0), glowMat(0xffffff, 1)); this.swordGlint.position.copy(G.world.markers.brokenSword).add(V(0, 0.4, 0)); G.scene.add(this.swordGlint);
    const prop = makeWeapon('broken'); if (prop) { prop.group.position.copy(G.world.markers.brokenSword).add(V(0, 0.08, 0)); prop.group.rotation.set(Math.PI / 2, 0, 0.6); G.scene.add(prop.group); this.swordProp = prop.group; }
    ui.objective('Survive', 'Grab the broken sword! [F]');
    Input.requestLock();
    // wolf circles but waits until the sword is grabbed
    wolf.state = 'strafe'; wolf.stateT = -999;
  }
  async prologuePickup() {
    const G = this.G, P = G.player, ui = G.ui; this.stage = 'fight';
    G.scene.remove(this.swordGlint); if (this.swordProp) G.scene.remove(this.swordProp);
    this.cine(true); P.state = 'scripted';
    P.anim.play('pickUp', { restart: true });
    await wait(1.2); P.setArmed(true); P.equip('broken', false); Audio.play('pickup');
    await wait(0.6);
    // the wolf attacks immediately — the player barely survives
    const wolf = this.wolf; this.face(wolf, P.pos);
    wolf.state = 'windup'; wolf.atk_ = wolf.def.attacks[2]; wolf.stateT = 0; Audio.play('growl', 1, 0.6);
    await this.shot([{ t: 0, pos: [P.pos.x + 3, P.pos.y + 1.5, P.pos.z + 3], look: [wolf.pos.x, wolf.pos.y + 1, wolf.pos.z], fov: 45 }, { t: 0.8, pos: [P.pos.x + 2.5, P.pos.y + 1.2, P.pos.z + 2.5], look: [wolf.pos.x, wolf.pos.y + 1, wolf.pos.z], fov: 40 }]);
    wolf.pos.copy(P.pos).add(V(Math.sin(P.yaw) * 2, 0, Math.cos(P.yaw) * 2)); this.face(wolf, P.pos);
    wolf.state = 'attack'; wolf.stateT = 0; wolf.hitDone = true;
    P.hp = Math.round(P.maxHp * 0.18); P.lastDamage = P.maxHp * 0.82;
    Time.hitStop(0.2); G.post.impactFrame(2, 1); FX.flash(0.4, '#f33'); G.cam.shake(0.6); Audio.play('hit', 1.8); Audio.say('hurt', 'hero');
    P.state = 'knockdown'; P.stateT = 0; P.anim.play('knockdown', { restart: true }); P.vel.set(-Math.sin(P.yaw) * 7, 5, -Math.cos(P.yaw) * 7); P.inAir = true;
    ui.damage(P.pos.clone().add(V(0, 1.6, 0)), Math.round(P.lastDamage), 'player');
    wolf.state = 'recover'; wolf.recoverT = 2.5; wolf.stateT = 0;
    await wait(1.4);
    P.anim.play('getup', { restart: true }); await wait(0.9);
    P.char.setExpression('pain', 2);
    await ui.talk([['You', 'Gh... HP 18... One more hit and I\'m dead...'], think(G, 'Wait. Dire Wolf... I fought these a thousand times. Bite after one growl. Pounce after two. I REMEMBER its pattern.')]);
    G.cam.stop();
    this.cine(false); P.state = 'move';
    ui.system(['[COMBAT]', 'LMB: Attack  ·  Shift: Dodge  ·  Q (hold): Block  ·  Tab: Lock-on'], { time: 4.5 });
    ui.objective('Survive', 'Defeat the Dire Wolf');
    wolf.state = 'chase'; wolf.cooldowns.pounce = 2; G.attackTokens = 0;
    ui.bossBar(wolf);
    G.flags.cannotDie = true; // he "barely survives"
  }
  onEnemyWindup(e, atk) {
    if (e !== this.wolf || this.stage !== 'fight') return;
    if (!this.memPounce && atk.name === 'pounce') {
      this.memPounce = true;
      Time.slowMo(2.2, 0.07); this.G.post.glitchFor(0.8); Audio.play('glitch');
      this.G.ui.system(['[MEMORY RECALL]', 'DIRE WOLF — "POUNCE"', 'Crouch + double growl → leap. DODGE (Shift) just before it lands!'], { style: '', time: 3.2, glitch: true });
    } else if (!this.memBite && atk.name === 'bite') {
      this.memBite = true; Time.slowMo(1.2, 0.15);
      this.G.ui.system(['[MEMORY RECALL]', 'DIRE WOLF — "BITE"', 'Single growl → lunge. Sidestep, then punish!'], { time: 2.6 });
    }
  }
  onPerfectDodge() {
    if (this.stage === 'fight' && !this.memDodge) { this.memDodge = true; this.G.ui.system(['[PERFECT DODGE]', 'Your body moved before you thought. Counter-attack window open — attack now!'], { style: 'gold', time: 2.6 }); }
  }
  async prologueWolfDown() {
    const G = this.G, P = G.player, ui = G.ui; this.stage = 'after';
    G.flags.cannotDie = false;
    Time.slowMo(2, 0.12); G.cam.critical(0.8); FX.speedLines(1, 0.8);
    await wait(2.2);
    this.cine(true); P.state = 'scripted'; P.vel.set(0, 0, 0);
    P.anim.play('guard');
    await wait(0.6);
    await ui.system(['[LEVEL UP]', `LEVEL 1 → ${P.level}`], { style: 'gold', sound: 'levelUp', time: 2.2 });
    P.memorySync = 1;
    await ui.system(['[MEMORY SYNCHRONIZATION: 1%]'], { time: 2.4 });
    P.anim.play('lookSword', { restart: true }); P.char.setExpression('sad', 6);
    const px = P.pos.x, py = P.pos.y, pz = P.pos.z, fy = P.yaw;
    const fx = Math.sin(fy), fz = Math.cos(fy);
    await this.shot([{ t: 0, pos: [px + fx * 1.4 + fz * 0.6, py + 1.5, pz + fz * 1.4 - fx * 0.6], look: [px + fx * 0.4, py + 1.35, pz + fz * 0.4], fov: 35 }, { t: 3, pos: [px + fx * 1.1 + fz * 0.4, py + 1.45, pz + fz * 1.1 - fx * 0.4], look: [px + fx * 0.4, py + 1.4, pz + fz * 0.4], fov: 30 }], { holdLast: true });
    await ui.talk([['You', 'This sword... it\'s the Broken Blade of the Wanderer. A starter item.'], think(G, 'But in the game, the wolf would have dropped loot. It just... died. Its blood is still on my hands.')]);
    // the world glitches
    G.post.glitchT = 1; Audio.play('glitch'); G.cam.shake(0.4);
    await ui.system(['[WARNING]'], { style: 'danger', glitch: true, time: 1.6, sound: 'danger' });
    await ui.system(['[THIS WORLD IS NOT THE WORLD YOU REMEMBER.]'], { style: 'danger', glitch: true, time: 3 });
    G.post.glitchT = 0;
    // cut to black → title
    ui.fade(1, 0.05); G.music('silence'); Audio.play('explosion', 0.6);
    await wait(1.2);
    G.cam.stop(); ui.letterbox(false);
    G.music('title');
    ui.titleCard(true, '');
    await wait(3.6);
    ui.titleCard(true, 'PRESS ANY KEY');
    await new Promise((res) => { const f = () => { removeEventListener('keydown', f); removeEventListener('mousedown', f); res(); }; addEventListener('keydown', f); addEventListener('mousedown', f); });
    Audio.play('system');
    ui.titleCard(false);
    this.cine(false); P.state = 'move';
    ui.fade(0, 1.2);
    this.stage = 'free';
    this.set('prologueDone');
    await wait(1.4);
    await ui.system(['[WELCOME BACK, PLAYER.]'], { time: 2.2 });
    await ui.system(['[WORLD DATA HAS BEEN ALTERED.]'], { time: 2.4, glitch: true });
    await ui.system(['[PRIMARY OBJECTIVE: DISCOVER WHO CHANGED THE WORLD.]'], { style: 'gold', time: 3 });
    this.start('awakening');
    G.music('forest');
    Input.requestLock();
    G.save();
  }

  // ------------------------------------------------------------------ hooks
  onKill(e) {
    const G = this.G;
    if (e === this.wolf && this.stage === 'fight') { this.prologueWolfDown(); return; }
    const inc = (id, type, cap) => { const q = this.q(id); if (q && !q.done && (e.type === type)) { q.count = (q.count || 0) + 1; if (q.count <= cap) G.ui.toast(`${QUESTS[id].title}: ${Math.min(cap, q.count)}/${cap}`); if (q.count === cap) G.ui.system(['[OBJECTIVE COMPLETE]', 'Return to the quest giver.'], { time: 2.2 }); this.refreshObjective(); } };
    inc('herbs', 'slime', 5); inc('goblins', 'goblin', 6);
    if (e.boss) this.onBossDown(e);
  }
  onLevel(lv) { if (lv === 3 || lv === 5 || lv === 7) this.G.ui.toast('New skills — check the Skills tab (C)', 'gold'); }
  onParry() { if (!this.has('firstParry')) { this.set('firstParry'); this.G.ui.toast('PARRY! Attack right after a parry to COUNTER.', 'gold'); } }
  onStagger(e) { if (!this.has('firstBreak')) { this.set('firstBreak'); this.G.ui.system(['[POSTURE BROKEN]', 'Press F near a staggered enemy to perform a FINISHER.'], { style: 'gold', time: 3 }); } void e; }
  onFusion(k) { if (this.q('cores') && !this.q('cores').done) this.refreshObjective(); void k; }
  onBuy() {}
  update(dt) {
    const G = this.G, P = G.player;
    if (this.stage !== 'free') return;
    // region triggers
    const p = P.pos;
    if (!this.has('metLina') && Math.hypot(p.x - LOC.village.x, p.z - LOC.village.z) < LOC.village.r * 0.9 && !G.cutscene) this.meetLina();
    if (this.q('ruins') && !this.has('golemDown') && G.world.interior === 'dungeon' && !this.golem && p.distanceTo(G.world.markers.golemArena) < 24) this.golemIntro();
    if (this.q('threats') && !this.has('behemothDown') && !this.behemoth && p.distanceTo(G.world.markers.frostArena) < LOC.frostArena.r - 4) this.bossEncounter('behemoth');
    if (this.q('threats') && !this.has('generalDown') && !this.general && p.distanceTo(G.world.markers.demonArena) < LOC.demonCastle.r - 6) this.bossEncounter('general');
    if (G.world.interior === 'cave' && !this.has('knightDown') && !this.knight && p.distanceTo(G.world.markers.caveArena) < 20) this.bossEncounter('knight');
    if (this.q('sky') && !this.has('heraldDown') && !this.herald && p.y > LOC.islands.y + 20 && p.distanceTo(G.world.markers.heraldArena) < 24) this.bossEncounter('herald');
    if (this.q('cores') && !this.q('cores').done && P.cores.length >= 3) this.complete('cores', { exp: 400, gold: 200 }), this.afterCores();
    if (this.q('threats') && !this.q('threats').done && this.has('behemothDown') && this.has('generalDown')) { this.complete('threats', { exp: 800, gold: 500 }); this.openSky(); }
    if (this.dungeonPortalMesh) this.dungeonPortalMesh.material.opacity = 0.3 + Math.sin(Time.real * 3) * 0.15;
    if (G.world.dungeonPortal) G.world.dungeonPortal.material.opacity = this.q('ruins') ? 0.35 + Math.sin(Time.real * 2) * 0.15 : 0;
    void dt;
  }

  // ------------------------------------------------------------------ chapter 1: Elmbrook
  async meetLina() {
    const G = this.G, P = G.player, ui = G.ui; this.set('metLina');
    const lina = this.npcs.find((n) => n.id === 'lina');
    this.cine(true);
    lina.pos.copy(P.pos).add(V(Math.sin(P.yaw) * 3, 0, Math.cos(P.yaw) * 3)); lina.pos.y = G.world.groundAt(lina.pos.x, lina.pos.z);
    lina.talking = true; this.face(lina, P.pos); this.face(P, lina.pos);
    const mx = (P.pos.x + lina.pos.x) / 2, mz = (P.pos.z + lina.pos.z) / 2, my = P.pos.y;
    const sx = Math.cos(P.yaw) * 3.5, sz = -Math.sin(P.yaw) * 3.5;
    G.cam.play([{ t: 0, pos: [mx + sx, my + 1.7, mz + sz], look: [mx, my + 1.4, mz], fov: 40 }, { t: 8, pos: [mx + sx * 0.8, my + 1.6, mz + sz * 0.8], look: [mx, my + 1.45, mz], fov: 38 }], { holdLast: true });
    lina.char.setExpression('surprised', 4);
    await ui.talk([L(G, lina, 'Ah— are you alright?! You\'re covered in... is that wolf blood?!'), L(G, lina, 'You came out of Whisperwood alone? With a BROKEN sword?'),
      think(G, 'This girl... she\'s "Village Girl" — the NPC by the well. In the game she only ever said one line.'), think(G, 'But her eyes are moving. She\'s breathing. She\'s scared for me.')]);
    const c = await ui.say(lina.name, 'I\'m Lina. What\'s your name, traveler?', { choices: ['Kai.', 'Ren.', 'Sora.', '...I don\'t remember.'], pitch: 330 });
    const names = ['Kai', 'Ren', 'Sora', '???'];
    P.name = names[c ?? 0];
    ui.system(['[NAME REGISTERED]', `NAME: ${P.name}`], { time: 2.2 });
    lina.char.setExpression('happy', 3);
    await ui.talk([L(G, lina, c === 3 ? 'You don\'t remember your own name? ...Then I\'ll call you "Question Mark" until you do!' : `${P.name}... That\'s a nice name. It feels... familiar, somehow.`),
      L(G, lina, 'Come on, the Elder needs to hear about the wolf. Dire wolves never come this far south!'), think(G, 'In the game this was Elm Village. Three houses. Now there\'s a windmill... a whole town.')]);
    G.cam.stop(); this.cine(false); lina.talking = false;
    this.complete('awakening', { exp: 40 });
    this.start('elmbrook');
  }
  async elderTalk(n) {
    const G = this.G, ui = G.ui;
    if (this.q('elmbrook') && !this.q('elmbrook').done) {
      n.char.setExpression('determined', 3);
      await ui.talk([L(G, n, 'So you\'re the one Lina found. A dire wolf, slain by a classless wanderer with a broken blade.'), L(G, n, 'Yes, child — I can see it. Every person carries a class crest in their aura. Yours is... a scratch. A smudge. An error.'),
        think(G, 'She can see the ERROR?'), L(G, n, 'Strange things have happened this past week. The ruins glow. Beasts flee the north. And goblins raid our fields every night.'), L(G, n, 'Prove your blade to Elmbrook. Drive back the goblins on the plains — six should send them a message.')]);
      this.complete('elmbrook', { exp: 30 }); this.start('goblins'); return;
    }
    const g = this.q('goblins');
    if (g && !g.done && g.count >= 6) {
      await ui.talk([L(G, n, 'Six goblins! The fields will sleep soundly tonight.'), L(G, n, 'Take this — and take my advice. Go to Astera, the capital. The Adventurer\'s Guild can read class crests properly.'), L(G, n, 'Perhaps they can tell you what you are. Borin has decent steel if that broken blade won\'t do.')]);
      this.complete('goblins', { exp: 180, gold: 150 }); this.start('capital'); return;
    }
    if (g && !g.done) { await ui.talk([L(G, n, `The goblins gather on the plains near the crossroads, east of here. (${Math.min(6, g.count)}/6)`)]); return; }
    const lines = [[L(G, n, 'When I was a girl, my grandmother told me of the Long Night. The sky turned white, and the world was born again.'), L(G, n, 'She said she was there the time before, too. Everyone thought she was senile.'), think(G, 'Unless... she remembered a previous cycle?')],
      [L(G, n, 'The founders of Elmbrook wrote: "We do not know where we came from. We woke here with tools in our hands."'), think(G, 'Like NPCs spawned at the start of a game...')]];
    await ui.talk(lines[Math.floor(Math.random() * lines.length)]);
  }

  // ------------------------------------------------------------------ chapter 2: Astera
  guildMark() { return (this.q('capital') && !this.q('capital').done) || (this.q('cores')?.done && !this.q('threats')); }
  async guildTalk(n) {
    const G = this.G, ui = G.ui, P = G.player;
    if (this.q('capital') && !this.q('capital').done) {
      this.cine(true);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), glowMat(0x9fe8ff, 0.9));
      orb.position.copy(n.pos).add(V(Math.sin(n.yaw) * 0.9, 1.2, Math.cos(n.yaw) * 0.9)); G.scene.add(orb);
      this.face(P, n.pos);
      this.face(n, P.pos); n.talking = true;
      const mx = (P.pos.x + n.pos.x) / 2, mz = (P.pos.z + n.pos.z) / 2;
      const dx = n.pos.x - P.pos.x, dz = n.pos.z - P.pos.z, dl = Math.hypot(dx, dz) || 1;
      const sx = -dz / dl * 4, sz = dx / dl * 4; // perpendicular to the line between them
      G.cam.play([{ t: 0, pos: [mx + sx, P.pos.y + 1.9, mz + sz], look: [mx, P.pos.y + 1.3, mz], fov: 42 }, { t: 8, pos: [mx + sx * 0.7, P.pos.y + 1.6, mz + sz * 0.7], look: [orb.position.x, orb.position.y, orb.position.z], fov: 36 }], { holdLast: true });
      await ui.talk([L(G, n, 'A registration, eh? Put your hand on the Crest Crystal. It reads your class, level, and talent.'), L(G, n, 'Every living soul in Astera has touched it. Takes a second.')]);
      Audio.play('magic', 'data'); await wait(0.8);
      G.post.glitchFor(1); Audio.play('glitch');
      await ui.system(['[CLASS: ERROR]'], { style: 'danger', glitch: true, time: 1.4 });
      await ui.system(['[ERROR] [ERROR] [ERROR]', '[CLASS DATA DOES NOT EXIST IN THIS CYCLE]'], { style: 'danger', glitch: true, time: 2 });
      Audio.play('shatter'); FX.glowBurst(orb.position, { count: 40, color: [0.6, 0.9, 1], speed: 6, size: 0.4 }); FX.debrisAt(orb.position, { count: 14, color: 0x9fe8ff, size: 0.12 }); G.scene.remove(orb);
      G.cam.shake(0.4); FX.flash(0.5);
      n.char.setExpression('surprised', 4);
      const mira = this.npcs.find((x) => x.id === 'mira'); mira.char.setExpression('surprised', 4); mira.say('Th-the crystal!!', 2);
      await ui.talk([L(G, n, '...The crystal shattered. In thirty years I\'ve never—'), L(G, n, 'Listen. A week ago the Ruins of the First Cycle began to glow. Same day you say you "woke up" in the forest.'),
        L(G, n, 'Nobody has gone deeper than the gate and come back. Maybe the ruins know what you are.'), think(G, 'The Ruins of the First Cycle... that dungeon was never finished in the game. It was locked behind a "Coming Soon" sign.')]);
      this.set('guildCrystal'); G.cam.stop(); this.cine(false); n.talking = false;
      this.complete('capital', { exp: 150 }); this.start('ruins');
      return;
    }
    if (this.q('cores')?.done && !this.q('threats')) { await ui.talk([L(G, n, 'Two monsters appeared that no bestiary records. The Frost Behemoth in Frostveil. A Demon General in the Ashen Maw.'), L(G, n, 'They don\'t belong in our world. Maybe you\'re the only one who can tell.')]); this.start('threats'); return; }
    const c = await ui.say(n.name, 'What do you need, ERROR?', { choices: ['Any work?', 'What do you know about the Administrator?', 'Nothing.'], pitch: 110 });
    if (c === 0) await ui.talk([L(G, n, 'Monsters are thick everywhere. Goblins and wolves near Elmbrook, skeletons in the ruins, scorpions in the Sun Scar, demons up in the Ashen Maw.'), L(G, n, 'Kill what you can. The stronger ones carry more gold.')]);
    if (c === 1) await ui.talk([L(G, n, '...Where did you hear that name? It\'s in the oldest records. "The Administrator watches the cycle." That\'s all anybody knows.')]);
  }

  // ------------------------------------------------------------------ chapter 3: ruins & the hidden class
  async enterDungeon() {
    const G = this.G;
    if (!this.q('ruins')) { await G.ui.talk([['You', 'The stone door won\'t budge. There\'s a faint hum behind it.'], think(G, 'Maybe someone in the capital knows about this place.')]); return; }
    await this.toInterior('dungeon', G.world.markers.dungeonEntry, Math.PI);
    if (!this.has('dungeonCleared')) for (const s of G.world.dungeonSpawns) G.spawnEnemy(s.type, s.level, s.pos.clone(), { region: 'dungeon' });
    G.ui.system(['RUINS OF THE FIRST CYCLE — DEPTHS'], { time: 2.4 });
  }
  async enterCave() {
    const G = this.G;
    if (!this.q('knight')) this.start('knight');
    await this.toInterior('cave', G.world.markers.caveEntry, Math.PI);
    if (!this.ghost) {
      const ghost = new NPC(G, { id: 'ghost', name: '??? (Faded Player)', pitch: 200, look: { skin: 0xc8d8ff, hair: 0x9ab0ff, hairStyle: 'spiky', eye: 0xffffff, faceStyle: 'hero', top: 0x8aa0e0, bottom: 0x6a80c0, coat: 0x5a70b0, scarf: 0xe0e8ff, accent: 0xffffff, boots: 0x4a5a90 }, home: 'caveGhost', schedule: [[0, 'caveGhost', 'kneel']], brave: true,
        talk: async (G2, n) => G2.ui.talk(this.has('knightDown') ? [L(G2, n, 'Thank you. He was me... the part of me that couldn\'t let go.'), L(G2, n, 'Go to the sky. And this time — don\'t trust the voice that sounds kind.')] :
          [L(G2, n, 'Another one... You can see me? Then you\'re like me. A player.'), L(G2, n, 'I was the sixth. I reached the sky, and I lost. The reset tore me apart.'), L(G2, n, 'My body still walks in there. The Forgotten Knight. It attacks anything that remembers.'), L(G2, n, 'Free him... and take the sword. It was mine. It remembers how to kill gods.')]) });
      ghost.root.traverse((o) => { if (o.isMesh && !o.userData.isOutline) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.5; } });
      this.ghost = ghost; G.npcs.push(ghost);
    }
  }
  async toInterior(kind, pos, yaw = 0) {
    const G = this.G, P = G.player;
    G.setControl(false); await G.ui.fade(1, 0.5);
    for (const e of G.enemies.slice()) if (!e.boss) G.removeEnemy(e);
    G.world.interior = kind; P.pos.copy(pos); P.vel.set(0, 0, 0); P.yaw = yaw; G.cam.orbitTo(yaw + Math.PI, 0.3); G.cam.smoothTarget.copy(P.pos);
    G.music(kind === 'dungeon' ? 'dungeon' : 'ruins');
    await G.ui.fade(0, 0.6); G.setControl(true);
  }
  async leaveInterior(pos) {
    const G = this.G, P = G.player;
    G.setControl(false); await G.ui.fade(1, 0.5);
    for (const e of G.enemies.slice()) G.removeEnemy(e);
    G.world.interior = null; P.pos.copy(pos); P.pos.y = G.world.groundAt(pos.x, pos.z); P.vel.set(0, 0, 0); G.cam.smoothTarget.copy(P.pos);
    G.lastRegionKey = null;
    await G.ui.fade(0, 0.6); G.setControl(true);
  }
  async examineMural() {
    const G = this.G, ui = G.ui, P = G.player;
    this.cine(true);
    const m = G.world.markers.mural;
    G.cam.play([{ t: 0, pos: [m.x + 6, 4.2, m.z + 3], look: [m.x - 3.2, 4.5, m.z], fov: 56 }, { t: 6, pos: [m.x + 5, 4.5, m.z + 0.5], look: [m.x - 3.2, 4.5, m.z], fov: 50 }], { holdLast: true });
    await ui.talk([think(G, 'A mural... a swordsman facing a great eye. A circle with seven marks — the seventh painted red.'), think(G, 'And the swordsman on the right... that\'s MY face. My avatar\'s face. Carved into a wall that\'s a thousand years old.')]);
    G.post.glitchFor(1.2); Audio.play('glitch'); FX.flash(0.4);
    await ui.system(['[MEMORY FRAGMENT DETECTED]', '"...not again... please... not again..."'], { glitch: true, time: 3 });
    if (P.memorySync < 10) P.memorySync = 10;
    await ui.talk([think(G, 'That voice... was mine.')]);
    G.cam.stop(); this.cine(false);
  }
  async altar() {
    const G = this.G;
    if (this.has('golemDown')) await G.ui.talk([think(G, 'The runes respond to my touch now. They spell a word in a language I somehow know: "AGAIN."')]);
    else await G.ui.talk([think(G, 'Runes, pulsing like a heartbeat. The light flows down — toward the gate to the depths.')]);
  }
  async golemIntro() {
    const G = this.G, ui = G.ui;
    const A = G.world.markers.golemArena;
    const golem = G.spawnBoss('golem', A.clone().add(V(0, 0, -10)), { arena: A, arenaR: 29 }); this.golem = golem; golem.yaw = 0;
    const gp = golem.pos;
    await this.bossIntroCinematic(golem, [[0, 'pos', [gp.x + 7, 1.2, gp.z + 9], [gp.x, 4, gp.z]], [3.5, 'pos', [gp.x + 2.5, 0.8, gp.z + 6.5], [gp.x, 5.2, gp.z]]]);
    void ui;
  }
  async bossEncounter(kind) {
    const G = this.G;
    const spots = { behemoth: G.world.markers.frostArena, general: G.world.markers.demonArena, knight: G.world.markers.caveArena, herald: G.world.markers.heraldArena };
    const A = spots[kind];
    const pos = A.clone().add(V(0, 0, -8)); pos.y = G.world.groundAt(pos.x, pos.z, A.y + 2);
    const arenaR = { behemoth: LOC.frostArena.r - 2, general: LOC.demonCastle.r - 4, knight: 24, herald: 28 }[kind];
    const boss = G.spawnBoss(kind, pos, { arena: A, arenaR });
    this[kind] = boss; boss.yaw = Math.atan2(G.player.pos.x - pos.x, G.player.pos.z - pos.z);
    const h = boss.height;
    await this.bossIntroCinematic(boss, [[0, 'pos', [pos.x + h * 1.6, pos.y + h * 0.4, pos.z + h * 1.8], [pos.x, pos.y + h * 0.6, pos.z]], [3.5, 'pos', [pos.x + h * 0.5, pos.y + 0.8, pos.z + h * 1.1], [pos.x, pos.y + h * 0.75, pos.z]]]);
  }
  async bossIntroCinematic(boss, keys) {
    const G = this.G, ui = G.ui;
    this.cine(true); ui.showHUD(false);
    G.music('silence');
    const shot = this.shot(keys.map(([t, , p, l]) => ({ t, pos: p, look: l, fov: 42 })), { holdLast: true });
    await wait(0.8);
    const lines = {
      golem: [['Ruin Golem', '[INTRUDER... MEMORY SIGNATURE... MATCH. CYCLE SEVEN.]', { pitch: 70 }]],
      behemoth: [],
      general: [['Azgaroth', 'So the glitch crawls out of its hole. The Administrator promised me your head, little player.', { pitch: 80 }]],
      knight: [['The Forgotten Knight', '...Remember... nothing... Forget... everything...', { pitch: 120 }]],
      herald: [['Herald', '[UNAUTHORIZED ENTITY. CYCLE INTEGRITY: 94%. PURGING.]', { pitch: 300 }]],
      varkas: [],
    }[boss.kind] || [];
    Audio.play('roar', boss.kind === 'herald' ? 1.8 : boss.kind === 'behemoth' ? 0.9 : 0.7); G.cam.shake(0.7);
    if (boss.char) { boss.char.setExpression('shout', 2); boss.anim.play('cheer', { restart: true }); }
    ui.bossIntro(boss.B.name, boss.B.title);
    await wait(1.6);
    if (lines.length) await ui.talk(lines);
    await shot; await wait(0.8);
    G.cam.stop(); this.cine(false); ui.showHUD(true);
    G.music(boss.B.music);
    boss.dormant = false; ui.bossBar(boss); G.cam.boss = boss;
    Input.requestLock();
  }
  async onBossDown(boss) {
    const G = this.G, ui = G.ui, P = G.player;
    G.cam.boss = null; ui.bossBar(null);
    Time.slowMo(2.5, 0.1); FX.flash(0.6); G.post.impactFrame(3, 2); Audio.play('explosion', 2); G.cam.shake(1);
    for (let i = 0; i < 6; i++) setTimeout(() => { FX.glowBurst(boss.pos.clone().add(V(0, boss.height * Math.random(), 0)), { count: 20, color: [1, 0.9, 0.6], speed: 7, size: 0.8 }); Audio.play('explosion', 0.8); }, i * 220);
    G.music('silence');
    await wait(2.6);
    await ui.system(['[BOSS DEFEATED]', boss.B.name.toUpperCase(), `+${boss.expReward} EXP`], { style: 'gold', sound: 'levelUp', time: 3 });
    P.gainExp(boss.expReward); P.gold += Math.round(boss.expReward / 2);
    const k = boss.kind;
    if (k === 'golem') { this.set('golemDown'); this.set('dungeonCleared'); await this.reincarnatorReveal(); }
    if (k === 'behemoth') { this.set('behemothDown'); P.memorySync = Math.max(P.memorySync, P.memorySync + 10); ui.system(['[MEMORY SYNCHRONIZATION: ' + P.memorySync + '%]', '"The winter that remembers" — it was guarding something. Someone put it here.'], { time: 3.4 }); }
    if (k === 'general') { this.set('generalDown'); P.memorySync += 10; await ui.talk([['Azgaroth', '...The Administrator... will simply... make another... Every cycle... a new general...', { pitch: 80 }], think(G, 'A new general every cycle. Like a boss that respawns.')]); }
    if (k === 'knight') { this.set('knightDown'); P.memorySync += 12; this.complete('knight', { exp: 300 }); P.giveWeapon('cursed'); await ui.talk([think(G, 'The knight\'s armor crumbles. Inside, there\'s nothing. Only the sword remains — warm, like it\'s glad to see me.')]); }
    if (k === 'herald') { this.set('heraldDown'); await this.ending(); }
    G.music(G.lastMusicRegion || 'forest');
    G.save();
  }
  async reincarnatorReveal() {
    const G = this.G, ui = G.ui, P = G.player;
    this.cine(true);
    const p = P.pos; const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
    G.cam.play([{ t: 0, pos: [p.x + fx * 3.2 + fz * 1.5, p.y + 1.5, p.z + fz * 3.2 - fx * 1.5], look: [p.x, p.y + 1.2, p.z], fov: 40 }, { t: 12, pos: [p.x + fx * 4 - fz * 2, p.y + 2.2, p.z + fz * 4 + fx * 2], look: [p.x, p.y + 1.5, p.z], fov: 36 }], { holdLast: true });
    P.anim.play('kneelSword', { restart: true }); P.char.setExpression('pain', 3);
    G.post.glitchFor(1.5); Audio.play('glitch');
    await ui.system(['[MEMORY SYNCHRONIZATION: 25%]'], { glitch: true, time: 2 });
    P.memorySync = Math.max(25, P.memorySync);
    await ui.system(['[ERROR]', '[UNAUTHORIZED MEMORY DETECTED.]'], { style: 'danger', glitch: true, time: 2.4 });
    await ui.system(['[REINCARNATED PLAYER IDENTIFIED.]'], { style: 'danger', glitch: true, time: 2.4 });
    FX.pillar(p, { color: 0xb38cff, radius: 2, height: 30, dur: 3 }); Audio.play('ultimate'); G.cam.shake(0.6);
    P.anim.play('ultRaise', { restart: true }); P.char.setExpression('determined', 6);
    await ui.system(['[CLASS DATA RECOVERED]', 'CLASS: ERROR  →  REINCARNATOR'], { style: 'gold', sound: 'levelUp', time: 3.2 });
    P.classId = 'REINCARNATOR'; P.activeCores = ['swordsman']; P.recalc();
    await ui.system(['[HIDDEN CLASS: REINCARNATOR]', 'Absorb the cores of other classes. Slot two to FUSE them into new classes.', 'Swordsman + Mage = Spellblade · Swordsman + Priest = Holy Knight · Assassin + Mage = Shadow Mage · Archer + Beast Tamer = Beast Ranger'], { style: 'gold', time: 6 });
    await ui.system(['[SWORDSMAN CORE: ABSORBED]'], { style: 'gold', time: 2 });
    await ui.talk([think(G, 'Reincarnator... A class that never existed in Eternal Realms.'), think(G, 'No — a class that was never ALLOWED to exist.')]);
    G.cam.stop(); this.cine(false);
    this.complete('ruins', { exp: 200 }); this.start('cores');
    ui.toast('Open the Class menu with K', 'gold');
  }
  coreMark(core) { return this.G.player.classId === 'REINCARNATOR' && !this.G.player.cores.includes(core); }
  async masterTalk(n, core, { intro = [], shop = null } = {}) {
    const G = this.G, ui = G.ui, P = G.player;
    const key = 'intro_' + core;
    if (!this.has(key)) { this.set(key); await ui.talk(intro.map((t) => L(G, n, t))); }
    if (P.classId !== 'REINCARNATOR') { await ui.talk([L(G, n, CORES[core].name + 's train for years to earn their crest. You have none. Come back when you know what you are.')]); if (shop) { const c = await ui.say(n.name, 'Unless you\'re buying?', { choices: ['Browse', 'Leave'], pitch: n.def.pitch }); if (c === 0) ui.openShop(n.name, shop); } return; }
    if (!P.cores.includes(core)) {
      await ui.talk([L(G, n, 'Your crest... it\'s no longer blank. "Reincarnator"? Then try to take what I know. Give me your hand.')]);
      Audio.play('magic', core === 'priest' ? 'holy' : core === 'assassin' ? 'shadow' : 'arcane');
      FX.pillar(P.pos, { color: CORES[core].color, radius: 1.4, height: 12, dur: 1.5 });
      P.cores.push(core); P.recalc();
      await ui.system([`[${CORES[core].name.toUpperCase()} CORE: ABSORBED]`, CORES[core].desc], { style: 'gold', sound: 'levelUp', time: 3 });
      if (core !== 'swordsman') await ui.talk([L(G, n, '...You took it in an instant. What took me twenty years. Use it well, Reincarnator.')]);
      n.addAffinity(2); this.refreshObjective();
      return;
    }
    const opts = shop ? ['Browse your wares', 'Talk', 'Leave'] : ['Talk', 'Leave'];
    const c = await ui.say(n.name, 'Back again?', { choices: opts, pitch: n.def.pitch });
    if (shop && c === 0) ui.openShop(n.name, shop);
    else if (c === (shop ? 1 : 0)) await ui.talk(intro.slice(-1).map((t) => L(G, n, t)));
  }
  afterCores() { this.G.ui.system(['[WORLD DATA ANOMALIES DETECTED: 2]', 'Report to Guildmaster Garrick in Astera.'], { time: 3.4 }); setTimeout(() => { if (!this.q('threats')) this.start('threats'); }, 4000); }

  // ------------------------------------------------------------------ chapter 4: sky & the truth
  async openSky() {
    const G = this.G; this.set('skyOpen');
    await wait(3.5);
    await G.ui.system(['[SKY WAYSTONE: ACTIVATED]', 'Something above the clouds is calling you.'], { style: 'gold', time: 3.4 });
    this.start('sky');
    if (G.world.skyCrystal) G.world.skyCrystal.scale.setScalar(2);
  }
  async ascend() {
    const G = this.G, P = G.player;
    this.cine(true);
    FX.pillar(P.pos, { color: 0x7fe9ff, radius: 2.5, height: 60, dur: 2 }); Audio.play('whoosh'); Audio.play('magic', 'data');
    P.anim.play('jump', { restart: true });
    for (let i = 0; i < 30; i++) { P.pos.y += 0.6; await wait(0.016); }
    await G.ui.fade(1, 0.4);
    P.pos.copy(G.world.markers.islandArrive); P.vel.set(0, 0, 0); G.cam.smoothTarget.copy(P.pos);
    G.music('sky');
    await G.ui.fade(0, 0.8); this.cine(false);
    if (!this.has('metEcho')) this.meetEcho();
  }
  async descend() {
    const G = this.G, P = G.player;
    await G.ui.fade(1, 0.5);
    P.pos.copy(G.world.markers.skyStone).add(V(0, 0, 4)); P.vel.set(0, 0, 0); G.cam.smoothTarget.copy(P.pos);
    await G.ui.fade(0, 0.6);
  }
  async meetEcho() {
    const G = this.G, ui = G.ui, P = G.player; this.set('metEcho');
    const pos = P.pos.clone().add(V(0, 0, -4));
    const echo = new NPC(G, { id: 'echo', name: 'Echo', pitch: 230, look: { skin: 0xf0f0f0, hair: 0x2a2a2a, hairStyle: 'short', eye: 0x5fd8ff, faceStyle: 'hero', top: 0xf4f4f4, bottom: 0x2a2a34, coat: 0xffffff, accent: 0x5fd8ff, boots: 0x1a1a20 }, home: 'islandArrive', brave: true,
      talk: async (G2, n) => G2.ui.talk([L(G2, n, 'The Herald waits at the highest island. Beat it, and the Administrator will have to show itself.'), L(G2, n, 'I\'m only an echo. A save file of a man who died years ago. Don\'t worry about me.')]) });
    echo.pos.copy(pos); echo.offset.set(0, 0, -4); G.npcs.push(echo); this.echo = echo;
    this.cine(true); this.face(P, echo.pos); echo.talking = true;
    G.post.glitchFor(0.6); Audio.play('glitch');
    const mx = (P.pos.x + pos.x) / 2, mz = (P.pos.z + pos.z) / 2;
    G.cam.play([{ t: 0, pos: [mx + 4, P.pos.y + 2, mz], look: [mx, P.pos.y + 1.5, mz], fov: 42 }, { t: 20, pos: [mx + 3, P.pos.y + 1.7, mz + 1], look: [mx, P.pos.y + 1.5, mz], fov: 38 }], { holdLast: true });
    await ui.talk([L(G, echo, 'Ha... it actually worked. You made it all the way here. Player number seven.'), L(G, echo, 'My name doesn\'t matter. I was a developer of Eternal Realms. Lead world designer.'),
      L(G, echo, 'Here\'s the truth: we didn\'t create this world. We FOUND it. A signal from somewhere — a world that loops every thousand years.'),
      L(G, echo, 'Civilizations rise, the sky turns white, everyone is reborn with their memories wiped. Over and over. Run by something we called the Administrator.'),
      L(G, echo, 'We couldn\'t reach it. So we built a game — a perfect simulation of this world — and waited for someone to finish it. Someone whose mind could survive the crossing.'),
      think(G, 'Eternal Realms... was a training simulation?'), L(G, echo, 'You died at your desk the night you beat Varkas. I\'m sorry. That was the price of crossing.'),
      L(G, echo, 'But the Administrator noticed. It changed the world to stop you: new monsters, new bosses, a final boss that isn\'t Varkas anymore.'),
      L(G, echo, 'The Herald guards the gate. Break it, and the Administrator will have to face you. Go, Player.')]);
    G.cam.stop(); this.cine(false); echo.talking = false;
    P.memorySync = Math.max(P.memorySync, 60);
    ui.system(['[MEMORY SYNCHRONIZATION: ' + P.memorySync + '%]'], { time: 2.4 });
  }
  async ending() {
    const G = this.G, ui = G.ui, P = G.player;
    this.cine(true); ui.showHUD(false);
    for (const e of G.enemies.slice()) G.removeEnemy(e);
    G.post.glitchFor(1); Audio.play('glitch');
    G.flags.whiteSky = true;
    const p = P.pos;
    G.cam.play([{ t: 0, pos: [p.x + 4, p.y + 2, p.z + 6], look: [p.x, p.y + 8, p.z - 10], fov: 50 }, { t: 30, pos: [p.x + 2, p.y + 1.2, p.z + 4], look: [p.x, p.y + 14, p.z - 20], fov: 46 }], { holdLast: true });
    const eye = new THREE.Mesh(new THREE.SphereGeometry(10, 24, 16), glowMat(0xffffff, 0.9)); eye.position.set(p.x, p.y + 30, p.z - 50); eye.scale.y = 0.4; G.scene.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(4, 16, 12), new THREE.MeshBasicMaterial({ color: 0x5fd8ff })); pupil.position.copy(eye.position).add(V(0, 0, 4)); G.scene.add(pupil);
    G.music('prologue');
    await wait(1.5);
    await ui.system(['[ADMINISTRATOR ACCESS GRANTED]'], { glitch: true, time: 2 });
    await ui.talk([['THE ADMINISTRATOR', 'You again.', { sys: true, pitch: 140 }], ['THE ADMINISTRATOR', 'Seven cycles. Seven players. Each one convinced they are the hero.', { sys: true, pitch: 140 }],
      ['THE ADMINISTRATOR', 'Without the reset, this world rots. Memory is weight. Memory is decay. I am the only reason anyone here is alive.', { sys: true, pitch: 140 }],
      [P.name, 'Lina. Borin. The Elder. They\'re not data. They\'re people. You don\'t get to erase them.'],
      ['THE ADMINISTRATOR', 'We will see what you remember when the sky turns white.', { sys: true, pitch: 140 }]]);
    Audio.play('explosion', 2); FX.flash(1); G.cam.shake(1);
    await ui.system(['[WORLD RESET IN: 312 DAYS]'], { style: 'danger', glitch: true, time: 3 });
    await ui.system(['[PRIMARY OBJECTIVE UPDATED]', 'STOP THE RESET.'], { style: 'gold', time: 3 });
    P.memorySync = 100;
    await ui.system(['[MEMORY SYNCHRONIZATION: 100%]', '[UNAUTHORIZED MEMORY DETECTED.]'], { glitch: true, time: 3 });
    G.scene.remove(eye); G.scene.remove(pupil); G.flags.whiteSky = false;
    await ui.fade(1, 1.5);
    const card = document.createElement('div'); card.style.cssText = 'position:fixed;inset:0;z-index:51;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center';
    card.innerHTML = '<div style="font-family:var(--title-font);font-size:min(10vw,90px);font-weight:900;letter-spacing:8px;text-shadow:0 0 30px rgba(95,216,255,.7)">RE<span style="color:#ff3355">:</span>WORLD</div><div style="font-family:var(--title-font);letter-spacing:10px;font-size:22px;margin-top:8px">END OF PART I — THE FORGOTTEN PLAYER</div><div style="margin-top:40px;opacity:.8;letter-spacing:3px">The world remains open. 312 days remain.<br>Find the remaining memories. Grow stronger. Remember.</div><div style="margin-top:40px;font-size:14px;opacity:.6;animation:blink .8s infinite alternate">PRESS ANY KEY</div>';
    document.body.appendChild(card);
    await wait(2);
    await new Promise((res) => { const f = () => { removeEventListener('keydown', f); removeEventListener('mousedown', f); res(); }; addEventListener('keydown', f); addEventListener('mousedown', f); });
    card.remove();
    G.cam.stop(); this.cine(false); ui.showHUD(true);
    this.complete('sky', { exp: 1000 }); this.start('cycle');
    await ui.fade(0, 1.2);
    G.music('sky');
  }

  // ------------------------------------------------------------------ interactions
  openChest(c) {
    const G = this.G, P = G.player;
    c.opened = true; G.flags.chests = G.flags.chests || []; G.flags.chests.push(c.id);
    Audio.play('pickup'); FX.glowBurst(c.pos.clone().add(V(0, 0.8, 0)), { count: 20, color: [1, 0.9, 0.5], speed: 4, up: 1 });
    const anim = () => { c.lid.rotation.x -= 0.15; if (c.lid.rotation.x > -1.9) requestAnimationFrame(anim); };
    anim();
    const it = c.item;
    if (it === 'potion') { P.potions += 2; G.ui.system(['[TREASURE]', 'Healing Potion ×2'], { style: 'gold', sound: 'coin', time: 2 }); }
    else if (it === 'gold') { const g = 60 + Math.floor(R() * 120); P.gold += g; G.ui.system(['[TREASURE]', `${g} Gold`], { style: 'gold', sound: 'coin', time: 2 }); }
    else if (it === 'elixir') { P.elixirs++; P.limit = 100; G.ui.system(['[TREASURE]', 'Ether Elixir — LIMIT filled!'], { style: 'gold', time: 2 }); }
    else { const map = { katana: 'katana', dualblades: 'dual', greatsword: 'great' }; P.giveWeapon(map[it]); }
    G.save();
  }
  takeFragment(f) {
    const G = this.G, P = G.player;
    f.taken = true; f.mesh.visible = false;
    G.flags.fragments = G.flags.fragments || []; G.flags.fragments.push(f.index);
    P.memorySync = Math.min(100, P.memorySync + 4);
    G.post.glitchFor(0.8); Audio.play('glitch'); FX.glowBurst(f.pos.clone().add(V(0, 1.3, 0)), { count: 30, color: [0.6, 0.9, 1], speed: 5 });
    G.ui.system(['[MEMORY FRAGMENT RECOVERED]', ...FRAGMENTS[f.index].split('\n')], { glitch: true, time: 5.5 });
    setTimeout(() => G.ui.toast(`Memory Synchronization: ${P.memorySync}%`, 'gold'), 5600);
    G.save();
  }
  useWaystone(k) {
    const G = this.G, P = G.player;
    G.flags.waystones = G.flags.waystones || [];
    if (!G.flags.waystones.includes(k)) { G.flags.waystones.push(k); G.ui.system(['[WAYSTONE ATTUNED]', 'Fast travel from the Map (M).'], { style: 'gold', time: 2.4 }); }
    P.hp = P.maxHp; P.mp = P.maxMp; G.lastWaystone = k;
    FX.pillar(P.pos, { color: 0x5fd8ff, radius: 1.2, height: 10, dur: 1 }); Audio.play('magic', 'holy');
    G.save(); G.ui.toast('HP/MP restored · Game saved');
  }

  // ------------------------------------------------------------------ cinematics in combat
  ultimateCinematic(P) {
    const G = this.G;
    G.freezeEnemies = 1.7;
    G.ui.letterbox(true);
    const p = P.pos.clone(); const fy = P.yaw;
    const k = (a, d, h) => [p.x + Math.sin(fy + a) * d, p.y + h, p.z + Math.cos(fy + a) * d];
    G.cam.play([{ t: 0, pos: k(0.6, 3.5, 1.2), look: [p.x, p.y + 1.5, p.z], fov: 40 }, { t: 1.5, pos: k(2.4, 3, 0.5), look: [p.x, p.y + 2.2, p.z], fov: 34 }, { t: 1.75, pos: k(0.3, 9, 5), look: [p.x, p.y + 1, p.z], fov: 55, cut: true }, { t: 2.8, pos: k(0.3, 11, 6), look: [p.x, p.y + 1, p.z], fov: 58 }], { onEnd: () => G.ui.letterbox(false) });
    Audio.play('charge'); Audio.duck(0.3, 3);
    FX.pillar(p, { color: P.weaponDef.trail, radius: 1.6, height: 40, dur: 1.8 });
    G.post.desatT = 0.7;
    const iv = setInterval(() => FX.glowBurst(p.clone().add(V(0, 1.5, 0)), { count: 6, color: new THREE.Color(P.weaponDef.trail).toArray(), speed: -5, size: 0.6, life: 0.4 }), 60);
    setTimeout(() => { clearInterval(iv); G.post.desatT = 0; Audio.play('ultimate'); FX.flash(0.9); G.post.impactFrame(3, 2); }, 1800);
  }
  finisherCinematic(P, target) {
    const G = this.G; if (!target) return;
    target.state = 'finished'; target.act = null;
    G.freezeEnemies = 1.9; G.ui.letterbox(true);
    const p = P.pos.clone(); const fy = P.yaw;
    const side = [p.x + Math.cos(fy) * 3.6, p.y + 1.3, p.z - Math.sin(fy) * 3.6];
    G.cam.play([{ t: 0, pos: side, look: [p.x + Math.sin(fy) * 1.2, p.y + 1.2, p.z + Math.cos(fy) * 1.2], fov: 38 }, { t: 1.0, pos: [side[0], side[1] - 0.3, side[2]], look: [p.x + Math.sin(fy) * 1.2, p.y + 1.4, p.z + Math.cos(fy) * 1.2], fov: 32 }, { t: 1.9, pos: [p.x - Math.sin(fy) * 5, p.y + 2.5, p.z - Math.cos(fy) * 5], look: [target.pos.x, target.pos.y + 1, target.pos.z], fov: 45 }],
      { onEnd: () => { G.ui.letterbox(false); if (target.alive && target.state === 'finished') { target.state = 'down'; target.stateT = 0; target.posture = 0; } } });
    if (target.boss) target.dmgTakenMult = 1;
    // finishers deal a chunk of max HP
    setTimeout(() => { if (target.alive) { const chunk = target.boss ? target.maxHp * 0.12 : target.maxHp * 0.6; target.hp -= chunk; G.ui.damage(target.pos.clone().add(V(0, target.height, 0)), Math.round(chunk), 'crit'); if (target.hp <= 0) target.die({ dir: V(Math.sin(fy), 0, Math.cos(fy)) }); } }, 1150);
  }
  async bladeClash(boss) {
    const G = this.G, P = G.player, ui = G.ui;
    if (this.clashing) return; this.clashing = true;
    boss.state = 'clash'; boss.act = null; P.state = 'scripted'; P.vel.set(0, 0, 0); boss.vel.set(0, 0, 0);
    G.freezeEnemies = 3.2; G.combat.clear();
    this.face(P, boss.pos); this.face(boss, P.pos);
    P.anim.play('block', { restart: true }); boss.anim.play('b_clash', { clip: { fps: 12, loop: true, keys: [[0, 'hHit'], [1, 'hHit']] }, restart: true });
    // pull the fighters blade-to-blade
    const dir = boss.pos.clone().sub(P.pos).setY(0).normalize();
    boss.pos.copy(P.pos).addScaledVector(dir, 1.2 + boss.radius);
    const mid = P.pos.clone().lerp(boss.pos, 0.45); mid.y += 1.7;
    const fy = P.yaw;
    G.cam.play([{ t: 0, pos: [mid.x + Math.cos(fy) * 6, mid.y + 0.6, mid.z - Math.sin(fy) * 6], look: [mid.x, mid.y + 0.4, mid.z], fov: 40 }, { t: 3, pos: [mid.x + Math.cos(fy) * 4.5, mid.y + 0.2, mid.z - Math.sin(fy) * 4.5], look: [mid.x, mid.y + 0.6, mid.z], fov: 36 }], { holdLast: true });
    ui.letterbox(true);
    const meter = document.createElement('div');
    meter.style.cssText = 'position:fixed;left:50%;top:72%;transform:translateX(-50%);z-index:32;text-align:center;font-weight:700;font-size:28px;letter-spacing:4px;text-shadow:0 0 10px #f00';
    meter.innerHTML = 'BLADE CLASH! MASH <span style="color:#5fd8ff">LMB</span><div style="width:360px;height:16px;border:2px solid #fff;margin:8px auto;background:rgba(0,0,0,.6)"><div id="clashFill" style="height:100%;width:30%;background:linear-gradient(90deg,#5fd8ff,#fff)"></div></div>';
    document.body.appendChild(meter);
    let v = 0.3; const t0 = performance.now();
    Audio.play('clang', 2);
    await new Promise((res) => {
      const tick = () => {
        const el = (performance.now() - t0) / 1000;
        if (Input.pressed('light') || Input.pressed('heavy') || Input.pressed('jump')) { v += 0.075; Audio.play('clang', 0.7); G.cam.shake(0.1); FX.sparksAt(mid, null, { count: 8, speed: 10 }); }
        v -= 0.0045;
        if (Math.random() < 0.4) FX.sparksAt(mid, null, { count: 3, speed: 8, color: [1, 0.6, 0.3] });
        document.getElementById('clashFill').style.width = Math.max(0, Math.min(1, v)) * 100 + '%';
        if (v >= 1 || v <= 0 || el > 3.2) { res(); return; }
        requestAnimationFrame(tick);
      };
      tick();
    });
    meter.remove(); ui.letterbox(false); G.cam.stop();
    if (v >= 0.6) {
      FX.flash(0.8); G.post.impactFrame(3, 2); Audio.play('parry'); Time.slowMo(1.2, 0.15); FX.impactStar(mid, { size: 5 });
      ui.system(['[CLASH WON]'], { style: 'gold', time: 1.6 });
      boss.state = 'chase'; boss.stagger(); P.state = 'move'; P.counterWindow = 2;
    } else {
      boss.state = 'chase'; P.state = 'move';
      G.combat.damagePlayer(boss, { dmg: 1.5, heavy: true, unblockable: true }, V(Math.sin(boss.yaw), 0, Math.cos(boss.yaw)));
    }
    this.clashing = false;
  }
  bossPhase2(boss) {
    const lines = { golem: '[CORE OVERLOAD. MEMORY PURGE PROTOCOL.]', behemoth: null, general: 'Enough games! Burn, glitch!', knight: '...I... remember... YOU...', herald: '[CYCLE INTEGRITY CRITICAL. RELEASING LIMITERS.]' };
    const l = lines[boss.kind];
    if (l) this.G.ui.system([boss.B.name.toUpperCase(), l], { style: 'danger', time: 2.2, sound: null });
  }

  // ------------------------------------------------------------------ fusion specials
  fusionSpecial(P, kind) {
    const G = this.G; const p = P.pos.clone(); p.y += 1.1;
    P.mp -= 20;
    P.state = 'attack'; P.move = { ...P.moves.crossSlash, id: 'fusion', hits: [], mp: 0, cancel: 0.5, dodgeCancel: 0.3, next: {} }; P.moveT = 0; P.hitsDone = 0; P.hitSets = [];
    P.anim.play('cast', { restart: true }); P.moveSpeed = 1;
    Audio.say('big', 'hero'); G.cam.punch(1); FX.speedLines(0.5, 0.3);
    const enemiesNear = (r) => G.enemies.filter((e) => e.alive && e.pos.distanceTo(P.pos) < r);
    if (kind === 'spellblade') {
      for (let i = 0; i < 10; i++) setTimeout(() => { const save = P.yaw; P.yaw = save + i * (Math.PI * 2 / 10); P.fireArc(1, 1.4, 0x9a7aff); P.yaw = save; }, i * 40);
      setTimeout(() => P.fireArc(3, 1.8), 450);
      G.ui.system(['SPELLBLADE — ARCANE ARC STORM'], { style: 'gold', time: 1.4, sound: null });
    } else if (kind === 'holy') {
      P.heal(P.maxHp * 0.3);
      for (const e of enemiesNear(12)) G.combat.spawnHazard({ pos: e.pos.clone(), radius: 2.2, delay: 0.5, kind: 'pillar', color: 0xffe08a, dmg: 0, team: 'player' }), setTimeout(() => { if (e.alive) { e.receiveHit({ dmg: P.stats.atk * 3, dir: V(0, 0, 0), hit: {}, from: P, launch: 8, stun: 1, posture: 30 }); G.ui.damage(e.pos.clone().add(V(0, 2, 0)), Math.round(P.stats.atk * 3), 'crit'); } }, 500);
      FX.pillar(P.pos, { color: 0xffe08a, radius: 3, height: 25, dur: 1.2 }); Audio.play('magic', 'holy');
      G.ui.system(['HOLY KNIGHT — SANCTUARY'], { style: 'gold', time: 1.4, sound: null });
    } else if (kind === 'shadow') {
      for (let i = 0; i < 6; i++) setTimeout(() => {
        const t = G.enemies.filter((e) => e.alive)[i % Math.max(1, G.enemies.length)];
        G.combat.spawnProjectile({ pos: p.clone().add(V(Math.cos(i) * 1.2, 0.5, Math.sin(i) * 1.2)), vel: V(Math.cos(i), 1, Math.sin(i)).multiplyScalar(8), color: 0x8a2aff, radius: 0.45, dmg: P.stats.atk * 1.6, team: 'player', homing: 4, target: t, life: 3, explode: true, trailColor: 0x8a2aff, ghost: true });
      }, i * 70);
      Audio.play('magic', 'shadow');
      G.ui.system(['SHADOW MAGE — NIGHTFALL ORBS'], { style: 'gold', time: 1.4, sound: null });
    } else if (kind === 'ranger') {
      this.summonSpiritWolf(P);
      for (const e of enemiesNear(18)) for (let i = 0; i < 3; i++) setTimeout(() => { if (!e.alive) return; const from = e.pos.clone().add(V((R() - 0.5) * 2, 14, (R() - 0.5) * 2)); G.combat.spawnProjectile({ pos: from, vel: V(0, -40, 0), color: 0x8ad86a, radius: 0.6, dmg: P.stats.atk * 1.2, team: 'player', life: 1, trailColor: 0x8ad86a, ghost: true }); }, i * 150);
      G.ui.system(['BEAST RANGER — SPIRIT HUNT'], { style: 'gold', time: 1.4, sound: null });
    } else if (kind === 'phantom') {
      const targets = enemiesNear(15).slice(0, 5);
      targets.forEach((e, i) => setTimeout(() => {
        if (!e.alive) return; P.spawnAfterimage(0xb04aff);
        P.pos.copy(e.pos).add(V(Math.sin(e.yaw) * 1.5, 0, Math.cos(e.yaw) * 1.5)); P.yaw = Math.atan2(e.pos.x - P.pos.x, e.pos.z - P.pos.z);
        G.combat.playerHit(P, P.moves.l3, { ...P.moves.l3.hits[0], dmg: 2.2, range: 3, arc: 6.3 }, new Set());
        G.combat.slashFX(P, P.moves.l3.hits[0], P.weaponDef);
      }, i * 160));
      G.ui.system(['PHANTOM BLADE — THOUSAND STEPS'], { style: 'gold', time: 1.4, sound: null });
    } else if (kind === 'bastion') {
      P.armorT = 4; FX.ring(P.pos, { color: 0xd8a04a, to: 9, dur: 0.5 }); G.cam.shake(0.5); Audio.play('explosion', 1);
      for (const e of enemiesNear(8)) { const d = e.pos.clone().sub(P.pos).setY(0).normalize(); e.receiveHit({ dmg: P.stats.atk * 2, dir: d, hit: {}, from: P, kb: 14, stun: 1, posture: 40, launch: 6 }); }
      G.ui.system(['BASTION KNIGHT — AEGIS QUAKE'], { style: 'gold', time: 1.4, sound: null });
    }
    return true;
  }
  shadowClone(P) {
    const G = this.G; const pos = P.pos.clone();
    P.spawnAfterimage(0x8a2aff);
    setTimeout(() => { FX.glowBurst(pos.clone().add(V(0, 1, 0)), { count: 20, color: [0.5, 0.1, 0.9], speed: 6, size: 0.8 }); Audio.play('magic', 'shadow'); for (const e of G.enemies) if (e.alive && e.pos.distanceTo(pos) < 3) e.receiveHit({ dmg: P.stats.atk * 1.2, dir: e.pos.clone().sub(pos).setY(0).normalize(), hit: {}, from: P, kb: 4, stun: 0.5, posture: 10 }); }, 600);
  }
  summonSpiritWolf(P) {
    const G = this.G;
    if (this.spirit) { G.scene.remove(this.spirit.cr.root); }
    const cr = makeWolf({ fur: 0x7fe0a0, belly: 0xbfffd0, eye: 0xffffff, scale: 1.1 });
    cr.root.traverse((o) => { if (o.isMesh && !o.userData.isOutline) { o.material = new THREE.MeshBasicMaterial({ color: 0x7fffb0, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }); } });
    G.scene.add(cr.root);
    this.spirit = { cr, pos: P.pos.clone(), t: 0, life: 20, atkT: 0, yaw: 0 };
  }
  updateAllies(dt) {
    const S = this.spirit; if (!S) return;
    const G = this.G;
    S.t += dt; S.life -= dt; S.atkT -= dt;
    let target = null, bd = 18;
    for (const e of G.enemies) if (e.alive) { const d = e.pos.distanceTo(S.pos); if (d < bd) { bd = d; target = e; } }
    const goal = target ? target.pos : G.player.pos.clone().add(V(1.5, 0, 1.5));
    const dx = goal.x - S.pos.x, dz = goal.z - S.pos.z; const d = Math.hypot(dx, dz);
    let st = 'idle';
    if (d > (target ? 1.6 : 2.5)) { S.pos.x += dx / d * 11 * dt; S.pos.z += dz / d * 11 * dt; S.yaw = Math.atan2(dx, dz); st = 'run'; }
    else if (target && S.atkT <= 0) { S.atkT = 0.9; st = 'bite'; target.receiveHit({ dmg: G.player.stats.atk * 0.9, dir: V(dx, 0, dz).normalize(), hit: {}, from: G.player, kb: 2, stun: 0.3, posture: 6, juggle: 2 }); FX.sparksAt(target.pos.clone().add(V(0, 1, 0)), null, { count: 6, color: [0.5, 1, 0.7] }); Audio.play('growl', 1.5, 0.2); }
    S.pos.y = G.world.groundAt(S.pos.x, S.pos.z, S.pos.y + 2);
    S.cr.root.position.copy(S.pos); S.cr.root.rotation.y = S.yaw; S.cr.anim(st, S.t, { speed: 12 });
    if (S.life <= 0) { G.scene.remove(S.cr.root); FX.glowBurst(S.pos.clone().add(V(0, 1, 0)), { count: 20, color: [0.5, 1, 0.7], speed: 4 }); this.spirit = null; }
  }
}
export { WEAPONS, FUSIONS, INTERIOR };
