# ASHVEIL: CRIMSON MARCH

A mobile-first, browser-based third-person action-RPG prototype. Built with Vite, TypeScript and Three.js (WebGL).
All geometry, textures, animation and UI are generated in code. There are no external models, images, music or fonts.

```bash
npm install
npm run dev      # http://localhost:5173 (also served on your LAN for phone testing)
npm run build    # typecheck + production bundle in dist/
```

## The playable loop

1. You spawn outside the south gate of **Veyr**. The compass marks the Guild of the Red Ledger.
2. Walk in, go to Maro at the desk, and **hold Interact** to sign. A short covenant cinematic plays (over-the-shoulder shots, letterbox, the ledger glowing red).
3. **Pick a path**: Bounty Hunter, Wayfarer, Oathbound or Shadebound. Your path sets your stats, weapon, armor silhouette, combos and special. **Iven Ashcourt** joins your contract party (blue nameplate).
4. *Optional:* the training yard east of the guild has a red post that takes damage and a blue party ward. Your hits on the ward are hard-blocked.
5. Read the **contract board** (west wall) and take *Rattlejaw of the Cistern Scrub*. Rattlejaw and his pack spawn north-east of the city. Rattlejaw has a gold nameplate.
6. Track him. As a Bounty Hunter, **T** lays a trail of paw prints toward the target. Fight with lock-on, in sun or rain.
7. **Hold Interact** on the carcass to skin it (Rattlejaw's hide is the proof), and again to butcher it for meat, fang and bone.
8. Return to Maro. The ledger opens and your line is inked in. You get paid, and a sanctioned hunt is unlocked.

After that, the Garran Vell deserter contract (ruined watchtower, west) and **The Warden Below** (Sunken Fort, north) are both playable. The Dune Warden fight has 3 phases. Killing it drops the **Warden's Sand-Heart** relic, which you socket from the Pack: your armor is rebuilt in sand-gold, with more poise and health and less damage taken. Behind the boss is a sealed chest whose note points to the Demon Continent and the Deep Pocket.

## Controls

| Action | Keyboard / mouse | Touch |
|---|---|---|
| Move / camera | WASD / mouse (click to capture) | Floating stick on the left; drag on the right |
| Sprint | Shift | Push the stick all the way |
| Roll (i-frames) / backstep | Space (no direction = backstep) | Roll |
| Jump / crouch | F / C | Jump / Crouch |
| Light / heavy / charged | LMB / RMB / hold RMB | Strike / Heavy / hold Heavy |
| Roll attack | Light during the end of a roll | Same |
| Special (weapon art) | Q | Art |
| Lock-on | R, Tab or MMB | Lock |
| Interact (some are held) | E | Use |
| Track (Hunter) / eat / pitch camp (Wayfarer) | T / 1 / B | via the Pack |
| Pack / map / ledger / help | I / M / J / H | Top-right buttons |
| Debug: toggle rain / skip 3h | K / N | — |

## How fights read

- **Windup:** the enemy glows orange and a ground marker (cone, line or circle) fills in. Markers are drawn large so they read at phone size.
- **Active:** red flash. The hit is live.
- **Recovery:** a faint cool tint, and the wolf backs off after a lunge. This is your punish window.
- Swings are committed. Your character can only turn toward the target during the windup. Combo chaining and buffered inputs open only late in a move's recovery.
- Poise and stagger work both ways. Oathbound attacks have hyper-armor. Hit-stop and camera punch are kept small.
- **Nameplates:** red = hostile, gold = contract target, blue = party. Damage between party members is rejected in `canDamage()` before any numbers are applied.

## Architecture (`src/`)

| Module | Contents |
|---|---|
| `core/` | Input (keyboard, mouse, touch stick, buttons, buffering), math, RNG, noise |
| `render/` | Canvas-painted textures with derived normal maps, material factory |
| `world/` | Layout and heightfield (`layout.ts`), terrain shader (sand/road blend, wetness, puddles), sky and day cycle, grass/trees/rocks, city, guild and dungeon geometry, static collision (boxes, cylinders, camera raycast) |
| `player/` | Procedural rigs (`rig.ts`), the shared `ProcAnimator`, player controller |
| `camera/` | Spring-arm third-person camera: collision pull-in, lock-on orbit, punch, cinematic blend |
| `combat/` | Factions and hit resolution, moves/poses, class definitions, telegraph and particle FX |
| `ai/` | Actor base (committed telegraphed attacks), wolves, hares, deserter, party ally, dummies, townsfolk, Dune Warden |
| `weather/` | Clear/rain state, wetness, mud slow, wind, rain streaks, footprint decals |
| `inventory/` | 20-slot / 30-weight pack, item table, recipes |
| `quests/` | Contracts and story text, ledger, continent map data |
| `ui/` | HUD (vitals, compass, nameplates, reticle, boss bar, prompts, letterbox) and modal panels |

### Animation without mocap

Every character uses one `ProcAnimator`. Humanoids, wolves, hares and the boss share it. The animator handles:

- stride phase tied to distance travelled (no foot sliding)
- arm counter-swing and hip bob
- lean into acceleration and turns
- spring-based landing compression
- small steps when turning in place
- keyframed action poses (anticipation, strike, follow-through) timed to each move's real windup, active and recovery windows

### Mobile performance

- Each character's ~60 shaped parts are merged per joint into 2 vertex-coloured materials.
- Vegetation is instanced and chunked for culling. Static city geometry is merged by material.
- Distant actors are hidden and stop updating.
- Phones get a smaller shadow map, a lower pixel ratio, less grass and fewer particles.
- At runtime the game watches FPS and steps down in order: pixel ratio, then shadows, then particles.

## Milestone status

- **M1** Controller, camera, desert, day/night sun, animated humanoid, walk/sprint/jump/roll/crouch: done
- **M2** Guild interior, in-world signing with cinematic, class select, party ward you cannot damage: done
- **M3** Lock-on combat vs wolves and the deserter; stamina, light and heavy combos, charged, roll attack, per-class special: done
- **M4** Clear/rain weather, wet shading, mud slow on roads, wind on grass and Ashthorn trees, footprints: done
- **M5** Hunting, skinning, butchering, hunger, slot/weight limit, campfire cooking and crafting, selling at the guild: done
- **M6** Contract board, Sunken Fort dungeon, 3-phase Dune Warden, relic drop that rebuilds your armor: done
- **M7** Continent data for Ashwood Verge, Stormglass Coast and the locked Demon Continent; world map; Deep Pocket chest note: done (stubs by design)

## Known limitations

- No audio.
- Performance has only been checked in a headless software renderer: draw calls are about 330 at spawn with shadows on. It has not been profiled on real phones yet.
- Animation is procedural, so attacks read clearly but don't have the weight of authored animation.
- The respec relic and the other continents are data only.
