// Game orchestrator: boots the world, runs the loop, wires player/AI/combat/weather/inventory/quests/UI.
import * as THREE from 'three';
import { Input } from './core/input';
import { isTouchDevice, clamp, damp } from './core/util';
import { Collision } from './world/collision';
import { buildTerrain, timeUniform } from './world/terrain';
import { buildGrass, buildTrees, buildRocks } from './world/vegetation';
import { buildWorld, type WorldProps, type Campfire } from './world/veyr';
import { SITES, heightAt, FORT_DEPTH } from './world/layout';
import { Sky } from './world/sky';
import { Weather } from './weather/weather';
import { ThirdPersonCamera } from './camera/camera';
import { Player, type AttackCtx } from './player/player';
import { CombatWorld, type Combatant } from './combat/combat';
import { FX } from './combat/fx';
import { CLASSES, type ClassId } from './combat/classes';
import { Actor, type AICtx } from './ai/actor';
import { Wolf, Rabbit } from './ai/beasts';
import { Deserter, PartyAlly, Dummy, TownNPC } from './ai/humans';
import { DuneWarden } from './ai/boss';
import { Inventory, ITEMS, type ItemId } from './inventory/inventory';
import { CONTRACTS, COVENANT_LINES, CLERK_IDLE, LEDGER_HEAD, type Contract, type LedgerLine } from './quests/contracts';
import { HUD, type PlateInfo, type CompassMark } from './ui/hud';
import * as Panels from './ui/panels';

interface Interactable {
  id: string;
  pos: THREE.Vector3;
  radius: number;
  hold: number;
  label: () => string | null;
  action: () => void;
  key?: string;
}

interface CineShot { pos: THREE.Vector3; look: THREE.Vector3; dur: number; who?: string; text?: string; onStart?: () => void }

export class Game {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  input: Input;
  col = new Collision();
  props!: WorldProps;
  sky!: Sky;
  weather!: Weather;
  cam!: ThirdPersonCamera;
  player!: Player;
  combat = new CombatWorld();
  fx!: FX;
  hud!: HUD;
  inv = new Inventory();
  actors: Actor[] = [];
  contracts: Contract[] = CONTRACTS.map((c) => ({ ...c }));
  ledger: LedgerLine[] = LEDGER_HEAD.map((l) => ({ ...l }));
  quality: 1 | 2;
  mobile: boolean;
  time = 0;
  private clock = new THREE.Timer();
  private hitstop = 0;
  private interactables: Interactable[] = [];
  private focusInter: Interactable | null = null;
  private holdProg = 0;
  private cine: { shots: CineShot[]; i: number; t: number; done: () => void } | null = null;
  started = false;
  flags = { signed: false, metIven: false, trainingTip: false, sealTaken: false, relicTaken: false, chestRead: false, wardenSeen: false };
  ally!: PartyAlly;
  clerk!: TownNPC;
  rattlejaw: Wolf | null = null;
  garran: Deserter | null = null;
  warden!: DuneWarden;
  respawnPoint = new THREE.Vector3(SITES.guildDoor.x, 0, SITES.guildDoor.z + 3);
  private deadT = 0;
  private partyToastT = 0;
  private fpsAcc = { t: 0, n: 0, low: 0 };
  private pixelRatio: number;
  private ambientT = 0;
  private wayCamp: Campfire | null = null;
  private clerkLine = 0;
  hasKnife = false;
  hasBedroll = false;
  private lastFoot = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.mobile = isTouchDevice() && Math.min(screen.width, screen.height) < 900;
    this.quality = this.mobile ? 1 : 2;
    this.pixelRatio = Math.min(window.devicePixelRatio, this.mobile ? 1.5 : 2);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.mobile, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 520);
    this.input = new Input(canvas);
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  async boot() {
    this.hud = new HUD(this.input);
    const s = this.scene;
    s.fog = new THREE.Fog(0xd8a888, 70, 300);
    this.sky = new Sky(s, this.quality === 2 ? 2048 : 1024);
    s.add(buildTerrain(this.quality === 2 ? 220 : 150));
    this.props = buildWorld(s, this.col);
    buildTrees(s, this.col);
    buildRocks(s, this.col);
    buildGrass(s, this.quality === 2 ? 1.0 : 0.45);
    this.weather = new Weather(s, this.quality);
    this.weather.onChange = (k) => this.hud.toast(k === 'rain' ? '<i>The wind turns. Rain on the dunes.</i>' : '<i>The rain thins. The sand begins to steam.</i>');
    this.fx = new FX(s);
    this.fx.particleScale = this.quality === 2 ? 1 : 0.55;
    this.cam = new ThirdPersonCamera(this.camera, this.col);
    this.player = new Player(s, this.col);
    this.player.teleport(SITES.spawn.x, heightAt(SITES.spawn.x, SITES.spawn.z), SITES.spawn.z, Math.PI);
    this.cam.yaw = 0;
    this.cam.pivot.set(this.player.pos.x, this.player.pos.y + 1.55, this.player.pos.z);
    this.combat.add(this.player);
    this.inv.add('waterskin');
    this.inv.add('hareMeat', 1);
    this.wireCombat();
    this.spawnNPCs();
    this.setupInteractables();
    this.hud.menuHandlers = {
      inv: () => Panels.inventory(this), map: () => Panels.map(this), ledger: () => Panels.ledgerView(this), help: () => Panels.help(this),
    };
    this.player.onFootstep = (p, yaw) => {
      this.weather.footprint(p, yaw + Math.PI);
      if (this.weather.wet < 0.3 && this.player.sprinting) this.fx.dust(p, 2);
    };
    this.player.onLand = (impact) => { this.fx.dust(this.player.pos.clone(), 6); if (impact > 9) this.cam.addShake(0.15); };
    this.player.onAttackActive = (ctx) => this.playerSwing(ctx);
    this.player.onSpecial = (ctx) => this.playerSpecial(ctx);
    this.loop();
    this.hud.showTitle(() => this.start());
  }

  private start() {
    this.started = true;
    this.hud.letterbox(true);
    this.hud.subtitle('', '<i>Veyr. The ash-desert city. Nobody here feeds an unsigned drifter.</i>');
    setTimeout(() => { this.hud.letterbox(false); this.hud.subtitle(null); }, 4200);
    this.setObjectiveText();
  }

  // ---------------- Spawning ----------------
  private addActor(a: Actor, x: number, z: number, yaw = 0, y?: number) {
    const gy = y ?? this.col.groundAt(x, z);
    a.spawn(this.scene, x, gy, z, yaw);
    this.col.resolve(a.pos, a.radius, a.height);
    this.actors.push(a);
    this.combat.add(a);
    return a;
  }

  private spawnNPCs() {
    this.clerk = this.addActor(new TownNPC('Maro, Ledger Clerk', { cloth: 0x3a1a14, cloth2: 0x6a2a1c, leather: 0x2a1a10, hair: 0x9a9088, beard: true, build: 'medium', weapon: 'none', skin: 0xc09070 }, 0), SITES.clerk.x, SITES.clerk.z, 0) as TownNPC;
    this.addActor(new TownNPC('Hesk, Quartermaster', { cloth: 0x4a3a2a, cloth2: 0x8a6a4a, leather: 0x3a2618, hair: 0x2a1a10, build: 'heavy', weapon: 'none', skin: 0x9a6a48 }, -Math.PI / 2), SITES.quartermaster.x, SITES.quartermaster.z, -Math.PI / 2);
    this.ally = this.addActor(new PartyAlly(), 3.5, -12.5, Math.PI) as PartyAlly;
    for (const [x, z] of [[-4, 50], [4, 50]]) this.addActor(new TownNPC('Gate Warden', { cloth: 0x5a2a1c, cloth2: 0x8a7a5a, metal: 0x8a8278, helmet: 'open', weapon: 'spear', build: 'medium' }, 0), x, z, 0);
    const citizen = [0x7a5a3a, 0x5a4a6a, 0x8a3a2a, 0x4a5a3a];
    citizen.forEach((c, i) => this.addActor(new TownNPC('Veyri', { cloth: c, cloth2: 0xb89a6a, hood: i % 2 === 0, hair: 0x2a1a10, weapon: 'none', build: 'light' }, 0, true), -6 + i * 4, 18 - i * 6, 0));
    // Training yard: red post (takes damage) and blue ward (party — hits are hard-blocked)
    this.addActor(new Dummy('Training Post', false), SITES.trainingYard.x - 2, SITES.trainingYard.z, -Math.PI / 2);
    this.addActor(new Dummy('Ledger Ward (party)', true), SITES.trainingYard.x + 2, SITES.trainingYard.z, -Math.PI / 2);
    // Scrub fauna
    for (let i = 0; i < 3; i++) this.spawnWolf();
    for (let i = 0; i < 7; i++) this.spawnRabbit();
    // Fort gatekeepers + the Warden
    for (const sx of [-4, 4]) this.addActor(new Wolf('Fort Jackal'), SITES.fort.x + sx, SITES.fortEntrance.z + 6, Math.PI);
    this.warden = this.addActor(new DuneWarden(), SITES.fort.x, SITES.fort.z - 8, 0, -FORT_DEPTH) as DuneWarden;
    this.warden.arenaCenter.set(SITES.fort.x, -FORT_DEPTH, SITES.fort.z);
    this.warden.onPhase = (p) => {
      if (p === 1) { this.hud.toast('DUNE WARDEN', 'big', 3); this.flags.wardenSeen = true; }
      else this.hud.toast(p === 2 ? '<i>The sand rises to answer it.</i>' : '<i>The Warden’s seal cracks. Something red breathes out.</i>', '', 3);
    };
  }

  private spawnWolf() {
    const a = Math.random() * Math.PI * 2, r = 10 + Math.random() * 25;
    this.addActor(new Wolf('Scrub Wolf'), SITES.scrub.x + Math.cos(a) * r, SITES.scrub.z + Math.sin(a) * r, Math.random() * 6);
  }
  private spawnRabbit() {
    const a = Math.random() * Math.PI * 2, r = 15 + Math.random() * 45;
    this.addActor(new Rabbit(), SITES.scrub.x - 20 + Math.cos(a) * r, SITES.scrub.z + 25 + Math.sin(a) * r, Math.random() * 6);
  }

  // ---------------- Combat wiring ----------------
  private wireCombat() {
    this.combat.listeners.push((ev) => {
      if (ev.type === 'party-block' && ev.a === this.player) {
        if (this.partyToastT <= 0) { this.hud.toast(`${ev.b!.name} is in your contract party — the blow is withheld.`, 'party', 2.2); this.partyToastT = 2.5; }
        this.fx.spark(ev.b!.pos.clone().setY(ev.b!.pos.y + 1.2), new THREE.Vector3(0, 1, 0), 0x5aa0e8, 5);
      }
      if (ev.type === 'hit' && ev.b === this.player) {
        this.hud.hurt();
        this.cam.addPunch(ev.info!.dir.clone().multiplyScalar(0.6), 1);
        this.fx.blood(this.player.pos.clone().setY(this.player.pos.y + 1.2), ev.info!.dir, 5);
        if (ev.res?.killed) this.onPlayerDeath();
      }
      if (ev.type === 'evade' && ev.b === this.player) this.fx.dust(this.player.pos.clone(), 3, 0xd8c8a0);
      if (ev.type === 'hit' && ev.a === this.player && ev.b) {
        const t = ev.b;
        const p = t.pos.clone().setY(t.pos.y + t.height * 0.6);
        this.fx.spark(p, ev.info!.dir, 0xffc070, 7);
        if (t.faction !== 'party') this.fx.blood(p, ev.info!.dir, t.rig.kind === 'quad' ? 6 : 4);
        this.hitstop = ev.res?.staggered ? 0.09 : 0.045;
        this.cam.addPunch(ev.info!.dir.clone().multiplyScalar(0.25), 1);
        if (ev.res?.staggered) this.cam.addShake(0.12);
        if (ev.res?.bleedBurst) { this.fx.blood(p, new THREE.Vector3(0, 1, 0), 18); this.hud.toast('<i>Bleed-ash bursts.</i>', '', 1.4); }
        if (ev.res?.killed) this.onKill(t as Actor);
      }
    });
  }

  private playerSwing(ctx: AttackCtx) {
    const bleed = this.player.cls?.id === 'shadebound' ? 14 : 0;
    this.combat.sweep(this.player, ctx.move, ctx.hitSet, bleed ? { bleed } : {});
  }

  private frontTarget(range: number, arc = 0.8): Combatant | null {
    if (this.player.lockTarget && this.player.lockTarget.alive) return this.player.lockTarget;
    let best: Combatant | null = null, bd = range;
    for (const a of this.actors) {
      if (!a.alive || a.faction !== 'hostile' || !a.lockable) continue;
      const dx = a.pos.x - this.player.pos.x, dz = a.pos.z - this.player.pos.z;
      const d = Math.hypot(dx, dz);
      const ang = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - this.player.yaw), Math.cos(Math.atan2(dx, dz) - this.player.yaw)));
      if (d < bd && ang < arc) { bd = d; best = a; }
    }
    return best;
  }

  private playerSpecial(ctx: AttackCtx) {
    const cls = this.player.cls!;
    const once = !ctx.hitSet.has(-1);
    switch (cls.id) {
      case 'hunter': {
        if (!once) return;
        ctx.hitSet.add(-1);
        const t = this.frontTarget(14);
        if (!t) { this.hud.toast('<i>No quarry in sight to mark.</i>', '', 1.4); return; }
        const d = Math.hypot(t.pos.x - this.player.pos.x, t.pos.z - this.player.pos.z) - t.radius;
        const executable = t.marked > 0 && d < 3.2 && (t.staggered > 0 || t.hp / t.maxHp < 0.3);
        if (executable) {
          const dmg = t instanceof DuneWarden ? t.maxHp * 0.12 : Math.max(160, t.maxHp * 0.5);
          this.player.yaw = Math.atan2(t.pos.x - this.player.pos.x, t.pos.z - this.player.pos.z);
          this.combat.resolve(t, { attacker: this.player, damage: dmg, poise: 200, dir: new THREE.Vector3(Math.sin(this.player.yaw), 0, Math.cos(this.player.yaw)), kind: 'execute' });
          t.marked = 0;
          this.fx.ash(t.pos.clone(), 1.2, 18, 0xe3b04b);
          this.cam.addShake(0.35);
          this.hitstop = 0.16;
          this.hud.toast('<i>Executed on the mark.</i>', '', 1.6);
        } else {
          t.marked = 25;
          this.hud.toast(`<i>${t.name} marked. Stagger it or wound it below a third, then Execute.</i>`, '', 2.4);
        }
        break;
      }
      case 'wayfarer': {
        if (!once) return;
        ctx.hitSet.add(-1);
        const t = this.frontTarget(12, 0.9);
        if (!t) { this.hud.toast('<i>The snare falls on empty sand.</i>', '', 1.4); return; }
        t.snared = t instanceof DuneWarden ? 1.5 : 4;
        if (t instanceof Actor) { t.cancelAttack(); t.cooldown = Math.max(t.cooldown, 2); }
        this.combat.resolve(t, { attacker: this.player, damage: 4, poise: 10, dir: new THREE.Vector3(), kind: 'special' });
        this.fx.dust(t.pos.clone(), 6, 0xc8a060);
        break;
      }
      case 'oathbound': {
        if (once) {
          ctx.hitSet.add(-1);
          this.fx.ash(this.player.pos.clone(), cls.special.range * 0.55, 34, 0x9a8a7a);
          this.cam.addShake(0.4);
        }
        this.combat.sweep(this.player, cls.special, ctx.hitSet);
        break;
      }
      case 'shadebound': {
        const since = ctx.t - cls.special.windup;
        const tick = Math.floor(since / 0.15);
        if (tick !== ctx.flurryTick) {
          ctx.flurryTick = tick;
          ctx.hitSet.clear();
          this.combat.sweep(this.player, cls.special, ctx.hitSet, { bleed: 22 });
          this.player.anim.play(tick % 2 ? cls.light[0].keys : cls.light[1].keys, 0.3);
        }
        break;
      }
    }
  }

  private onKill(t: Actor) {
    if (t === this.rattlejaw) {
      this.hud.toast('<i>Rattlejaw falls. Take the hide for the ledger.</i>', '', 3);
    } else if (t === this.garran) {
      this.hud.toast('<i>Garran Vell is still. His seal hangs at his belt.</i>', '', 3);
    } else if (t === this.warden) {
      this.hud.toast('HUNT CLOSED', 'big', 4);
      this.player.lockTarget = null;
      setTimeout(() => this.hud.toast('<i>Where the Warden fell, a heart of packed sand still beats.</i>', '', 4), 3500);
    }
    if (this.player.lockTarget === t) this.player.lockTarget = null;
  }

  private onPlayerDeath() {
    this.deadT = 0.001;
    this.player.lockTarget = null;
    this.hud.death(true);
  }

  private respawn() {
    this.hud.fade(true);
    setTimeout(() => {
      this.hud.death(false);
      this.player.revive();
      this.player.hunger = Math.max(this.player.hunger, 40);
      const rp = this.respawnPoint;
      this.player.teleport(rp.x, this.col.groundAt(rp.x, rp.z), rp.z);
      this.cam.pivot.set(rp.x, this.player.pos.y + 1.55, rp.z);
      // Reset aggro; the Warden mends itself between attempts
      for (const a of this.actors) { a.aggro = false; a.cancelAttack(); }
      if (this.warden.alive) {
        this.warden.hp = this.warden.maxHp; this.warden.phase = 1; this.warden.awake = false;
        this.warden.pos.set(SITES.fort.x, -FORT_DEPTH, SITES.fort.z - 8);
      }
      this.deadT = 0;
      this.hud.fade(false);
    }, 1000);
  }

  // ---------------- Interactions ----------------
  private setupInteractables() {
    const I = (o: Interactable) => this.interactables.push(o);
    I({
      id: 'clerk', pos: new THREE.Vector3(SITES.clerk.x, 0, -19.9), radius: 2.0, hold: 0,
      label: () => {
        if (!this.flags.signed) return 'Sign the Red Ledger (hold)';
        if (this.contracts.some((c) => c.state === 'ready')) return 'Present proof to Maro';
        return 'Speak with Maro';
      },
      action: () => this.clerkAction(),
    });
    const clerk = this.interactables[0];
    // Signing requires a deliberate hold
    Object.defineProperty(clerk, 'hold', { get: () => (this.flags.signed ? 0 : 1.6) });
    I({ id: 'board', pos: new THREE.Vector3(SITES.board.x, 0, SITES.board.z), radius: 2.2, hold: 0, label: () => 'Read the contract board', action: () => {
      if (!this.flags.signed) { this.hud.toast('<i>Slips nailed over slips. The ink means nothing until you have signed.</i>'); return; }
      Panels.board(this);
    } });
    I({ id: 'qm', pos: new THREE.Vector3(SITES.quartermaster.x - 1.8, 0, SITES.quartermaster.z), radius: 2.0, hold: 0, label: () => 'Trade with Hesk', action: () => {
      if (!this.flags.signed) { this.hud.toast('<i>“The guild buys from hunters. Sign, then sell.”</i>'); return; }
      Panels.trade(this);
    } });
    I({ id: 'iven', pos: new THREE.Vector3(3.5, 0, -12.5), radius: 1.8, hold: 0, label: () => (this.ally.following ? null : 'Speak with the spear-carrier'), action: () => {
      this.hud.subtitle('Iven Ashcourt', this.flags.signed ? 'Signed? Good. Then I walk with you.' : 'Sign the ledger first, drifter. Unsigned, you are just another mouth.');
      setTimeout(() => this.hud.subtitle(null), 3200);
    } });
    for (const cf of this.props.campfires) this.addCampInteract(cf);
    for (const pl of this.props.plaques) I({ id: 'plaque', pos: pl.pos, radius: 2.2, hold: 0, label: () => 'Read', action: () => Panels.note(this, pl.title, pl.text) });
    I({
      id: 'chest', pos: this.props.demonChest.position.clone().add(new THREE.Vector3(0, 0, 1.2)), radius: 2.0, hold: 0, label: () => 'Inspect the sealed chest',
      action: () => {
        this.flags.chestRead = true;
        Panels.note(this, 'A chest that does not belong here', 'The lock is shaped like a lung, and it is warm. A tag of guild paper is tied to the hasp:<br><br><i>“The Deep Pocket is not kept here. It is kept where the March was aimed. When you find the Demon Continent’s last door, you will understand why every pack in Veyr is exactly this size.”</i><br><br><span style="color:#b8a684">Inventory expansion: only the Deep Pocket relic (Demon Continent) raises your slot and weight limits.</span>');
      },
    });
    I({ id: 'relic', pos: new THREE.Vector3(), radius: 2.0, hold: 1.0, label: () => (this.warden && !this.warden.alive && !this.flags.relicTaken ? 'Take the Sand-Heart (hold)' : null), action: () => {
      if (this.inv.add('sandHeart') === 0) { this.hud.toast('<i>Your pack is full.</i>'); return; }
      this.flags.relicTaken = true;
      const c = this.contracts.find((c) => c.id === 'c_warden')!;
      if (c.state === 'active') c.state = 'ready';
      this.hud.toast('<i>Warden’s Sand-Heart — a relic. Socket it into your armor from the Pack.</i>', '', 4);
      this.setObjectiveText();
    } });
    I({ id: 'training', pos: new THREE.Vector3(SITES.trainingYard.x, 0, SITES.trainingYard.z + 5.5), radius: 2.0, hold: 0, label: () => (this.flags.signed ? null : 'Read the yard notice'), action: () => Panels.note(this, 'Training yard notice', 'Signed hunters may test their path on the post. The blue ward wears guild colours: it stands in your party, and the ledger forbids you to wound your own. Try it.') });
  }

  private addCampInteract(cf: Campfire) {
    this.interactables.push({ id: 'camp', pos: cf.pos, radius: 2.6, hold: 0, label: () => `Rest at ${cf.name}`, action: () => { this.respawnPoint.copy(cf.pos).add(new THREE.Vector3(1.5, 0, 1.5)); Panels.camp(this, cf); } });
  }

  /** Dead harvestable creatures and the deserter's body become temporary interactables. */
  private dynamicInteract(): Interactable | null {
    const p = this.player.pos;
    let best: Interactable | null = null, bd = 2.2;
    for (const a of this.actors) {
      if (a.alive) continue;
      const d = Math.hypot(a.pos.x - p.x, a.pos.z - p.z);
      if (d > bd) continue;
      if (a.harvest.harvestable && !a.harvest.butchered) {
        const skinned = a.harvest.skinned;
        const isRabbit = a instanceof Rabbit;
        bd = d;
        best = {
          id: 'harvest', pos: a.pos, radius: 2.2, hold: (skinned ? 1.6 : 2.2) * (this.hasKnife ? 0.5 : 1) * (isRabbit ? 0.6 : 1),
          label: () => (skinned ? `Butcher ${a.name} (hold)` : `Skin ${a.name} (hold)`),
          action: () => this.harvest(a),
        };
      } else if (a === this.garran && !this.flags.sealTaken) {
        bd = d;
        best = { id: 'seal', pos: a.pos, radius: 2.2, hold: 0.8, label: () => 'Take the banner seal (hold)', action: () => {
          if (!this.inv.add('deserterSeal')) { this.hud.toast('<i>Your pack is full.</i>'); return; }
          this.flags.sealTaken = true;
          this.inv.add('cloth', 2); this.inv.add('ironScrap', 1);
          const c = this.contracts.find((c) => c.id === 'c_deserter')!;
          if (c.state === 'active') c.state = 'ready';
          Panels.note(this, 'Letters in Garran’s coat', '<i>“…they told us the red in the sky was the enemy’s fires. Callan said it was coming from behind our own line. From the guild tents. They were singing. On the twelfth day we were told to march toward the sea and keep marching. I did not.”</i><br><br>The rest is scraped out with a knife.');
          this.setObjectiveText();
        } };
      }
    }
    return best;
  }

  private harvest(a: Actor) {
    const isWolf = a instanceof Wolf;
    const bonus = this.hasKnife ? 1 : 0;
    if (!a.harvest.skinned) {
      const got = this.inv.add(isWolf ? 'hide' : 'pelt', 1 + (isWolf ? 0 : bonus));
      if (!got) { this.hud.toast('<i>Your pack is full — sell or drop something.</i>'); return; }
      a.harvest.skinned = true;
      this.hud.toast(`<i>${isWolf ? 'Wolf Hide' : 'Hare Pelt'} taken.</i>`, '', 1.6);
      if (a === this.rattlejaw) {
        const c = this.contracts.find((c) => c.id === 'c_wolf')!;
        if (c.state === 'active') { c.state = 'ready'; this.hud.toast('<i>Rattlejaw’s hide — proof for the ledger. Return to Maro.</i>', '', 3.5); }
        this.setObjectiveText();
      }
      // Pelt removed: darken carcass
      for (const m of a.rig.flashMats) m.color.multiplyScalar(0.55);
    } else {
      const meat = isWolf ? 'meat' : 'hareMeat';
      const got = this.inv.add(meat as ItemId, isWolf ? 1 + bonus : 1);
      if (!got) { this.hud.toast('<i>Your pack is full.</i>'); return; }
      if (isWolf) { this.inv.add('fang', 1); this.inv.add('bone', 1); }
      a.harvest.butchered = true;
      this.hud.toast(`<i>${ITEMS[meat as ItemId].name}${isWolf ? ', fang, bone' : ''} taken.</i>`, '', 1.6);
      a.deadT = Math.max(a.deadT, 150); // remove soon
    }
  }

  private clerkAction() {
    if (!this.flags.signed) { this.covenant(); return; }
    const ready = this.contracts.filter((c) => c.state === 'ready');
    if (ready.length) {
      for (const c of ready) {
        if (c.id === 'c_deserter') this.inv.remove('deserterSeal');
        c.state = 'closed';
        this.inv.coin += c.reward;
        this.ledger.push({ name: c.closingNote, note: `${this.player.cls?.name ?? 'hunter'} — you`, pay: c.reward, isNew: true });
      }
      const warden = this.contracts.find((c) => c.id === 'c_warden')!;
      if (warden.state === 'locked' && this.contracts.some((c) => c.state === 'closed' && c.id !== 'c_warden')) {
        warden.state = 'available';
        setTimeout(() => this.hud.toast('<i>A new slip is pinned to the board: a sanctioned hunt.</i>', '', 3.5), 1200);
      }
      Panels.ledgerView(this, true);
      this.setObjectiveText();
      return;
    }
    this.hud.subtitle('Maro, clerk', CLERK_IDLE[this.clerkLine++ % CLERK_IDLE.length]);
    setTimeout(() => this.hud.subtitle(null), 3200);
  }

  // ---------------- Covenant cinematic ----------------
  private covenant() {
    const P = this.player;
    P.teleport(SITES.clerk.x, 0, -19.5, Math.PI);
    P.state = 'busy';
    this.player.lockTarget = null;
    this.hud.letterbox(true);
    const book = this.props.ledgerBook;
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const lines = COVENANT_LINES;
    const shots: CineShot[] = [
      { pos: v(1.3, 1.95, -17.4), look: v(0, 1.55, -22.6), dur: lines[0].dur, who: lines[0].who, text: lines[0].text },
      { pos: v(-1.6, 1.75, -18.6), look: v(0.1, 1.45, -21.6), dur: lines[1].dur, who: lines[1].who, text: lines[1].text,
        onStart: () => P.anim.play([{ t: 0, pose: {} }, { t: 0.35, pose: { armR: [-1.25, 0, 0], foreR: [-0.35, 0, 0], spine: [0.3, 0, 0], neck: [0.3, 0, 0] }, ease: 'out' }, { t: 0.9, pose: { armR: [-1.25, 0, 0], foreR: [-0.35, 0, 0], spine: [0.3, 0, 0], neck: [0.3, 0, 0] } }, { t: 1, pose: {} }], 7.6) },
      { pos: v(0.9, 1.6, -19.7), look: v(0, 1.2, -20.9), dur: lines[2].dur, who: lines[2].who, text: lines[2].text, onStart: () => { this.cam.addShake(0.08); } },
      { pos: v(0, 2.7, -15.6), look: v(0, 1.5, -21.0), dur: lines[3].dur, who: lines[3].who, text: lines[3].text },
    ];
    let glowT = 0;
    const glow = () => {
      if (!this.cine) { this.props.ledgerGlow.intensity = 0; (book.material as THREE.MeshStandardMaterial).emissive.setHex(0); return; }
      glowT += 0.016;
      const k = this.cine.i >= 2 ? Math.min(1, glowT * 0.4) : 0;
      this.props.ledgerGlow.intensity = k * (6 + Math.sin(glowT * 9) * 1.5);
      (book.material as THREE.MeshStandardMaterial).emissive.setRGB(k * 0.5, 0.02 * k, 0);
      requestAnimationFrame(glow);
    };
    this.cine = { shots, i: -1, t: 0, done: () => {
      this.hud.letterbox(false);
      this.hud.subtitle(null);
      this.flags.signed = true;
      Panels.classSelect(this, (id) => this.chooseClass(id));
    } };
    requestAnimationFrame(glow);
  }

  chooseClass(id: ClassId) {
    const P = this.player;
    P.setClass(id);
    P.state = 'move';
    this.hud.setClassLabel(`<span class="cls">${CLASSES[id].name}</span> · Red Ledger`);
    this.ally.following = true;
    this.inv.coin += 10;
    this.hud.toast('<i>Iven Ashcourt joins your contract party.</i>', 'party', 3.5);
    setTimeout(() => this.hud.toast(`<i>${CLASSES[id].specialName}: ${CLASSES[id].specialDesc}</i>`, '', 6), 3800);
    setTimeout(() => this.hud.toast('<i>Optional: the training yard east of the guild has a post — and a party ward you cannot harm.</i>', '', 5), 10500);
    this.setObjectiveText();
  }

  // ---------------- Objectives ----------------
  objective(): { text: string; pos: THREE.Vector3 | null; exact: boolean } {
    const v = (x: number, z: number, y = 0) => new THREE.Vector3(x, y, z);
    if (!this.flags.signed) {
      const inside = this.isInsideGuild();
      return { text: inside ? 'Sign the Red Ledger — the clerk’s desk' : 'Find the Guild of the Red Ledger', pos: inside ? v(SITES.clerk.x, -20) : v(SITES.guildDoor.x, SITES.guildDoor.z), exact: true };
    }
    const ready = this.contracts.find((c) => c.state === 'ready');
    if (ready) return { text: `Return to Maro with proof — ${ready.title}`, pos: v(SITES.clerk.x, -20), exact: true };
    const active = this.contracts.find((c) => c.state === 'active');
    if (active) {
      if (active.id === 'c_wolf' && this.rattlejaw) {
        const hunter = this.player.cls?.id === 'hunter';
        if (!this.rattlejaw.alive) return { text: 'Skin Rattlejaw', pos: this.rattlejaw.pos, exact: true };
        return { text: hunter ? 'Hunt Rattlejaw — T to read tracks' : 'Hunt Rattlejaw at the Cistern Scrub', pos: hunter || this.distToP(this.rattlejaw.pos) < 30 ? this.rattlejaw.pos : v(SITES.scrub.x, SITES.scrub.z), exact: hunter };
      }
      if (active.id === 'c_deserter' && this.garran) {
        if (!this.garran.alive) return { text: 'Take Garran’s banner seal', pos: this.garran.pos, exact: true };
        return { text: 'Find Garran Vell at the ruined watchtower', pos: this.player.cls?.id === 'hunter' ? this.garran.pos : v(SITES.tower.x, SITES.tower.z), exact: true };
      }
      if (active.id === 'c_warden') {
        if (!this.warden.alive) return { text: 'Take the Sand-Heart', pos: this.warden.pos, exact: true };
        return { text: 'Descend into the Sunken Fort', pos: this.distToP(v(SITES.fort.x, SITES.fort.z)) < 40 ? this.warden.pos : v(SITES.fortEntrance.x, SITES.fortEntrance.z), exact: true };
      }
    }
    if (this.contracts.some((c) => c.state === 'available')) return { text: 'Take a contract from the board (west wall)', pos: v(SITES.board.x, SITES.board.z), exact: true };
    return { text: 'The ledger is quiet. Hunt, cook, explore.', pos: null, exact: false };
  }
  setObjectiveText() { /* refreshed every frame from objective() */ }
  private distToP(p: THREE.Vector3) { return Math.hypot(p.x - this.player.pos.x, p.z - this.player.pos.z); }
  isInsideGuild() { const p = this.player.pos; return p.x > -11 && p.x < 11 && p.z > -26 && p.z < -10; }

  acceptContract(c: Contract) {
    if (this.contracts.some((x) => x.state === 'active')) { this.hud.toast('<i>One contract at a time. Close the one you carry.</i>'); return; }
    c.state = 'active';
    if (c.id === 'c_wolf' && !this.rattlejaw) {
      this.rattlejaw = this.addActor(new Wolf('Rattlejaw', true), SITES.rattlejaw.x, SITES.rattlejaw.z, 0) as Wolf;
      this.rattlejaw.contractTarget = true;
      // His pack
      for (let i = 0; i < 2; i++) this.addActor(new Wolf('Rattlejaw’s Pack'), SITES.rattlejaw.x + 4 + i * 3, SITES.rattlejaw.z - 3, 0);
    }
    if (c.id === 'c_deserter' && !this.garran) {
      this.garran = this.addActor(new Deserter('Garran Vell'), SITES.tower.x + 6, SITES.tower.z + 4, 0) as Deserter;
      this.garran.contractTarget = true;
    }
    this.hud.toast(`<i>Contract taken: ${c.title}</i>`, '', 3);
  }

  // ---------------- Survival ----------------
  eat(id?: ItemId) {
    const order: ItemId[] = id ? [id] : ['cookedMeat', 'meat', 'hareMeat'];
    for (const it of order) {
      if (!this.inv.has(it)) continue;
      const def = ITEMS[it];
      this.inv.remove(it);
      this.player.hunger = Math.min(100, this.player.hunger + (def.food ?? 0));
      if (it === 'cookedMeat') this.player.hp = Math.min(this.player.maxHp, this.player.hp + 20);
      else { this.player.hp = Math.max(1, this.player.hp - (it === 'meat' ? 5 : 3)); }
      this.hud.toast(it === 'cookedMeat' ? '<i>Warm food. Strength returns.</i>' : '<i>Raw and sour. It stays down, mostly.</i>', '', 1.8);
      return true;
    }
    this.hud.toast('<i>Nothing to eat.</i>', '', 1.4);
    return false;
  }

  pitchCamp() {
    if (this.player.cls?.id !== 'wayfarer') { this.hud.toast('<i>Only a Wayfarer carries a camp kit.</i>', '', 1.6); return; }
    const p = this.player.pos;
    const x = p.x + Math.sin(this.player.yaw) * 1.8, z = p.z + Math.cos(this.player.yaw) * 1.8;
    if (this.wayCamp) { this.scene.remove(this.wayCamp.flame); this.props.campfires = this.props.campfires.filter((c) => c !== this.wayCamp); this.interactables = this.interactables.filter((i) => i.pos !== this.wayCamp!.pos); }
    const y = this.col.groundAt(x, z);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.7, 6), (this.props.braziers[0].material as THREE.Material));
    flame.position.set(x, y + 0.4, z);
    this.scene.add(flame);
    this.wayCamp = { pos: new THREE.Vector3(x, y, z), flame, name: 'Wayfarer’s Camp' };
    this.props.campfires.push(this.wayCamp);
    this.addCampInteract(this.wayCamp);
    this.hud.toast('<i>Flint, tinder, a ring of stones. Camp is pitched.</i>', '', 2);
  }

  // ---------------- Lock-on ----------------
  private toggleLock() {
    if (this.player.lockTarget) { this.player.lockTarget = null; return; }
    const fwd = this.cam.basis().fwd;
    let best: Combatant | null = null, score = Infinity;
    for (const a of this.actors) {
      if (!a.alive || !a.lockable) continue;
      const dx = a.pos.x - this.player.pos.x, dz = a.pos.z - this.player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 20) continue;
      const ang = Math.acos(clamp((dx * fwd.x + dz * fwd.z) / Math.max(d, 1e-3), -1, 1));
      if (ang > 1.2) continue;
      const s = d * 0.5 + ang * 8 - (a.faction === 'hostile' ? 4 : 0) - (a.contractTarget ? 3 : 0);
      if (s < score) { score = s; best = a; }
    }
    this.player.lockTarget = best;
    if (!best) this.cam.yaw = this.player.yaw + Math.PI; // recenter like a soulslike when nothing to lock
  }

  // ---------------- Main loop ----------------
  private loop = () => {
    requestAnimationFrame(this.loop);
    this.clock.update();
    let dt = Math.min(this.clock.getDelta(), 1 / 20);
    const realDt = dt;
    if (this.hitstop > 0) { this.hitstop -= dt; dt *= 0.08; }
    this.time += dt;
    timeUniform.value = this.time;
    this.input.update(realDt);
    this.update(dt, realDt);
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
    this.adaptQuality(this.clock.getDelta());
  };

  /** Test hook: advance the simulation without rendering (fixed timestep). */
  step(frames: number, dt = 1 / 30) {
    for (let i = 0; i < frames; i++) {
      this.time += dt;
      timeUniform.value = this.time;
      this.input.update(dt);
      this.update(dt, dt);
      this.input.endFrame();
    }
  }

  private update(dt: number, realDt: number) {
    const inp = this.input;
    const P = this.player;
    const controls = this.started && !this.cine && !this.hud.panelOpen && P.state !== 'busy' && P.alive;
    if (this.partyToastT > 0) this.partyToastT -= dt;

    // Global keys
    if (this.started && !this.cine) {
      if (inp.pressed('menuBack') && this.hud.panelOpen) this.hud.closePanel();
      else if (!this.hud.panelOpen) {
        if (inp.pressed('inv')) Panels.inventory(this);
        if (inp.pressed('map')) Panels.map(this);
        if (inp.pressed('ledger')) Panels.ledgerView(this);
        if (inp.pressed('help')) Panels.help(this);
      } else if (inp.pressed('inv') || inp.pressed('map') || inp.pressed('ledger') || inp.pressed('help')) this.hud.closePanel();
      if (controls) {
        if (inp.pressed('lock')) this.toggleLock();
        if (inp.pressed('eat')) this.eat();
        if (inp.pressed('weather')) this.weather.toggle();
        if (inp.pressed('skip')) { this.sky.hour = (this.sky.hour + 3) % 24; this.hud.toast(`<i>Time passes… ${Math.floor(this.sky.hour)}:00</i>`, '', 1.4); }
        if (inp.pressed('camp')) this.pitchCamp();
        if (inp.pressed('track')) this.track();
      }
    }

    // Lock validity
    const lt = P.lockTarget;
    if (lt && (!lt.alive || this.distToP(lt.pos) > 26)) P.lockTarget = null;
    this.cam.lockTarget = P.lockTarget ? P.lockTarget.pos.clone().setY(P.lockTarget.pos.y + P.lockTarget.height * 0.6) : null;

    // Mud / terrain speed
    const mud = this.weather.mudAt(P.pos.x, P.pos.z);
    P.speedMul = 1 - mud * 0.38;

    // Player
    const basis = this.cam.basis();
    P.update(dt, inp, basis, controls);

    // Hunger
    if (this.started && P.alive && !this.cine) {
      P.hunger = Math.max(0, P.hunger - dt * (100 / 720) * (P.sprinting ? 1.8 : 1));
      if (P.hunger <= 0) { P.hp -= dt * 1.2; if (P.hp <= 0 && P.alive) { P.die(); this.onPlayerDeath(); } }
      if (P.hunger < 20 && Math.floor(this.time) % 40 === 0 && Math.floor(this.time - dt) % 40 !== 0) this.hud.toast('<i>Your stomach knots. Eat something (1 / Pack).</i>', '', 2.4);
    }
    if (this.deadT > 0) { this.deadT += realDt; if (this.deadT > 2.6 && this.deadT < 100) { this.deadT = 100; this.respawn(); } }

    // AI
    const ctx: AICtx = { dt, time: this.time, player: P, combat: this.combat, fx: this.fx, col: this.col, actors: this.actors, onCamShake: (a) => this.cam.addShake(a) };
    for (const a of this.actors) {
      const d = this.distToP(a.pos);
      a.rig.root.visible = d < 110;
      if (d > 140 && !a.attack) continue; // sleep distant actors
      a.update(ctx);
      if (a.marked > 0) this.fx.setMark(a.id, a.alive, a.pos, a.height); else this.fx.setMark(a.id, false);
      if (a.snared > 0) this.fx.setSnare(a.id, a.alive, a.pos, a.radius + 0.25); else this.fx.setSnare(a.id, false);
      // Separation from the player (no walking through bodies)
      if (a.alive && P.alive) {
        const dx = P.pos.x - a.pos.x, dz = P.pos.z - a.pos.z;
        const dd = Math.hypot(dx, dz), min = P.radius + a.radius;
        if (dd < min && dd > 1e-4 && Math.abs(P.pos.y - a.pos.y) < 1.5) {
          const push = (min - dd) / dd;
          const w = a instanceof DuneWarden ? 1 : 0.5;
          P.pos.x += dx * push * w; P.pos.z += dz * push * w;
          a.pos.x -= dx * push * (1 - w); a.pos.z -= dz * push * (1 - w);
        }
      }
    }
    for (let i = 0; i < this.actors.length; i++) for (let j = i + 1; j < this.actors.length; j++) {
      const a = this.actors[i], b = this.actors[j];
      if (!a.alive || !b.alive) continue;
      const dx = a.pos.x - b.pos.x, dz = a.pos.z - b.pos.z;
      const min = a.radius + b.radius;
      if (Math.abs(dx) > min || Math.abs(dz) > min) continue;
      const dd = Math.hypot(dx, dz);
      if (dd < min && dd > 1e-4) { const k = (min - dd) / dd * 0.5; a.pos.x += dx * k; a.pos.z += dz * k; b.pos.x -= dx * k; b.pos.z -= dz * k; }
    }
    this.combat.tickStatus(dt);
    this.cleanupAndRespawn(dt);
    this.fx.update(dt);

    // Footprints for beasts (paw)
    this.lastFoot += dt;
    if (this.lastFoot > 0.35) {
      this.lastFoot = 0;
      for (const a of this.actors) if (a.alive && a.rig.kind === 'quad' && this.distToP(a.pos) < 30 && Math.hypot(a.vel.x, a.vel.z) > 1) this.weather.footprint(a.pos.clone(), a.yaw, true);
    }

    // Interactions
    this.updateInteraction(dt, controls);

    // Cinematic
    if (this.cine) this.updateCine(realDt);

    // Environment
    const indoor = this.isInsideGuild();
    this.weather.update(dt, this.camera.position, this.time);
    this.sky.overcast = damp(this.sky.overcast, this.weather.kind === 'rain' ? 1 : 0, 0.4, dt);
    this.sky.update(dt, this.camera.position, P.pos, this.time);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(this.sky.fogColor);
    fog.near = indoor ? 120 : 60 - this.weather.rainAmt * 35;
    fog.far = indoor ? 400 : 300 - this.weather.rainAmt * 150;
    this.renderer.toneMappingExposure = indoor ? 1.25 : this.sky.isNight ? 1.25 : 1.05;
    this.updateFires(dt);

    // Camera
    this.cam.update(realDt, P.pos, controls ? inp.look : new THREE.Vector2(), { sprint: P.sprinting, moving: Math.hypot(P.vel.x, P.vel.z) > 1, playerYaw: P.yaw, indoor });

    this.updateHUD(dt);
  }

  private track() {
    const P = this.player;
    if (P.cls?.id !== 'hunter') { this.hud.toast('<i>The sand says nothing you can read. Follow the compass.</i>', '', 2); return; }
    const o = this.objective();
    if (!o.pos) { this.hud.toast('<i>No quarry on your ledger.</i>', '', 1.6); return; }
    const dir = new THREE.Vector3(o.pos.x - P.pos.x, 0, o.pos.z - P.pos.z);
    const len = Math.min(dir.length(), 60);
    dir.normalize();
    const yaw = Math.atan2(dir.x, dir.z);
    for (let d = 2; d < len; d += 1.6) {
      const side = (Math.floor(d / 1.6) % 2 ? 0.18 : -0.18);
      const p = new THREE.Vector3(P.pos.x + dir.x * d + Math.cos(yaw) * side + Math.sin(d * 0.3) * 0.5, 0, P.pos.z + dir.z * d - Math.sin(yaw) * side);
      p.y = heightAt(p.x, p.z);
      this.weather.footprint(p, yaw, true);
    }
    this.hud.toast('<i>Fresh tracks — pressed deep, heading that way.</i>', '', 2);
  }

  private updateInteraction(dt: number, controls: boolean) {
    const p = this.player.pos;
    let best: Interactable | null = null, bd = Infinity;
    if (controls && this.player.state === 'move') {
      const dyn = this.dynamicInteract();
      if (dyn) { best = dyn; bd = 0; }
      for (const it of this.interactables) {
        if (it.id === 'relic') it.pos.copy(this.warden.pos);
        const d = Math.hypot(it.pos.x - p.x, it.pos.z - p.z);
        if (d < it.radius && d < bd && Math.abs(it.pos.y - p.y) < 2.5 && it.label()) { bd = d; best = it; }
      }
    }
    if (best?.id !== this.focusInter?.id || best?.pos !== this.focusInter?.pos) this.holdProg = 0;
    this.focusInter = best;
    if (!best) { this.hud.prompt(null); this.player.busyPose = null; return; }
    const label = best.label()!;
    if (best.hold <= 0) {
      this.hud.prompt(label, 0);
      if (this.input.pressed('interact')) best.action();
    } else {
      if (this.input.isDown('interact')) {
        this.holdProg += dt / best.hold;
        if (best.id === 'harvest' || best.id === 'seal') this.player.busyPose = 'kneel';
        if (this.holdProg >= 1) { this.holdProg = 0; this.player.busyPose = null; best.action(); this.input.release('interact'); }
      } else { this.holdProg = Math.max(0, this.holdProg - dt * 2); this.player.busyPose = null; }
      this.hud.prompt(label, this.holdProg);
    }
  }

  private updateCine(dt: number) {
    const c = this.cine!;
    c.t += dt;
    if (c.i < 0 || c.t >= c.shots[c.i].dur) {
      c.i++; c.t = 0;
      if (c.i >= c.shots.length) {
        this.cam.cinematic = null;
        const done = c.done;
        this.cine = null;
        done();
        return;
      }
      const s = c.shots[c.i];
      s.onStart?.();
      this.hud.subtitle(s.who ?? '', s.text ?? '');
    }
    const s = c.shots[c.i];
    // Slow push-in on each shot
    const k = c.t / s.dur;
    const pos = s.pos.clone().lerp(s.look, 0.06 * k);
    this.cam.cinematic = { pos, look: s.look, blend: 1 };
  }

  private updateFires(dt: number) {
    const t = this.time;
    let nearest: Campfire | null = null, nd = 45;
    for (const cf of this.props.campfires) {
      const s = 1 + Math.sin(t * 13 + cf.pos.x) * 0.08 + Math.sin(t * 7.3) * 0.06;
      cf.flame.scale.set(s, s * (1 + Math.sin(t * 9) * 0.1), s);
      const d = this.distToP(cf.pos);
      if (d < nd) { nd = d; nearest = cf; }
      if (d < 40) this.fx.embers(cf.pos.clone().setY(cf.pos.y + 0.6));
    }
    for (const b of this.props.braziers) { const s = 1 + Math.sin(t * 11 + b.position.x) * 0.1; b.scale.set(s, s, s); }
    const fl = this.props.fireLight;
    if (nearest) {
      fl.position.copy(nearest.pos).setY(nearest.pos.y + 1.2);
      fl.intensity = (this.sky.isNight ? 9 : 5) * (1 + Math.sin(t * 17) * 0.12 + Math.sin(t * 5.1) * 0.08);
    } else fl.intensity = 0;
  }

  private cleanupAndRespawn(dt: number) {
    this.ambientT += dt;
    // Remove harvested or long-dead bodies when out of sight
    for (const a of [...this.actors]) {
      if (!a.alive && a.deadT > 160 && this.distToP(a.pos) > 25 && a !== this.warden) {
        this.scene.remove(a.rig.root);
        this.actors = this.actors.filter((x) => x !== a);
        this.combat.remove(a);
        this.fx.setMark(a.id, false); this.fx.setSnare(a.id, false);
      }
    }
    if (this.ambientT > 60) {
      this.ambientT = 0;
      const far = this.distToP(new THREE.Vector3(SITES.scrub.x, 0, SITES.scrub.z)) > 90;
      if (far) {
        const wolves = this.actors.filter((a) => a instanceof Wolf && a.alive && a.name === 'Scrub Wolf').length;
        const rabbits = this.actors.filter((a) => a instanceof Rabbit && a.alive).length;
        if (wolves < 3) this.spawnWolf();
        if (rabbits < 7) this.spawnRabbit();
      }
    }
  }

  private updateHUD(dt: number) {
    const P = this.player;
    const h = this.hud;
    h.tick(dt);
    h.vitals(P.hp, P.maxHp, P.stamina, P.maxStamina, P.hunger);
    const w = window.innerWidth, hh = window.innerHeight;
    // Compass: camera facing world yaw
    const facing = this.cam.yaw + Math.PI;
    const marks: CompassMark[] = [];
    const o = this.started ? this.objective() : { text: '', pos: null, exact: false };
    if (o.pos) marks.push({ yawWorld: Math.atan2(o.pos.x - P.pos.x, o.pos.z - P.pos.z), kind: 'obj' });
    for (const cf of this.props.campfires) if (this.distToP(cf.pos) < 160) marks.push({ yawWorld: Math.atan2(cf.pos.x - P.pos.x, cf.pos.z - P.pos.z), kind: 'camp' });
    h.updateCompass(facing, marks);
    h.setObjective(this.cine ? '' : o.text, o.pos ? this.distToP(o.pos) : undefined);

    // Nameplates
    const plates: PlateInfo[] = [];
    for (const a of this.actors) {
      const d = this.distToP(a.pos);
      const isBoss = a === this.warden;
      if (!a.alive || d > (a.contractTarget ? 45 : 28) || (isBoss && this.warden.awake)) continue;
      if (a.faction === 'neutral' && !(a instanceof Rabbit) && d > 9) continue;
      const active = a.contractTarget && this.contracts.some((c) => c.state === 'active');
      const kind: PlateInfo['kind'] = a.faction === 'party' ? 'blue' : active ? 'gold' : a.faction === 'hostile' ? 'red' : 'neutral';
      const tag = a.faction === 'party' ? 'party' : active ? 'contract' : a.marked > 0 ? 'marked' : undefined;
      plates.push({ id: a.id, name: a.name, pos: a.pos, h: a.height, hp: a.hp, max: a.maxHp, kind, tag: a.marked > 0 && tag !== 'marked' ? `${tag} · marked` : tag, bleed: a.bleed, show: !this.cine && a.faction !== 'neutral' || d < 9 });
    }
    h.plates_(this.camera, plates, w, hh);
    const lt = P.lockTarget;
    h.reticle_(this.camera, lt ? lt.pos.clone().setY(lt.pos.y + lt.height * 0.6) : null, !!lt?.contractTarget, w, hh);
    if (this.warden.awake && this.warden.alive && this.distToP(this.warden.pos) < 50) h.boss('Dune Warden', this.warden.hp, this.warden.maxHp, ['', 'I', 'II — the sand answers', 'III — the seal is broken'][this.warden.phase]);
    else h.boss(null);
  }

  private adaptQuality(dt: number) {
    const f = this.fpsAcc;
    f.t += dt; f.n++;
    if (f.t >= 2) {
      const fps = f.n / f.t;
      this.hud.fps(`${fps.toFixed(0)} fps · ${this.weather.kind} · ${Math.floor(this.sky.hour)}:${String(Math.floor((this.sky.hour % 1) * 60)).padStart(2, '0')}`);
      if (fps < 45) f.low++; else f.low = Math.max(0, f.low - 1);
      if (f.low >= 2) {
        f.low = 0;
        if (this.pixelRatio > 0.8) { this.pixelRatio = Math.max(0.75, this.pixelRatio - 0.25); this.renderer.setPixelRatio(this.pixelRatio); }
        else if (this.renderer.shadowMap.enabled) { this.renderer.shadowMap.enabled = false; this.sky.sun.castShadow = false; this.scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; }); }
        else this.fx.particleScale = 0.3;
      }
      f.t = 0; f.n = 0;
    }
  }
}
