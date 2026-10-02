# RE:WORLD — The Forgotten Player

A 3D anime-inspired open-world reincarnation action RPG that runs in the browser
(Three.js + WebAudio, no external assets — every model, face, sound and song is procedural).

You beat the final boss of *Eternal Realms*, die at your desk at 3:47 AM, and wake up in its
starting forest. The status window reads **CLASS: ERROR**. The world is not the one you remember.

## Run it

```bash
npm install
npm run dev        # open the printed URL (http://localhost:5173)
npm run build      # production build into dist/
```

Use a desktop browser with WebGL2. Headphones recommended. Click **NEW GAME** to play the
cinematic prologue, or **SKIP PROLOGUE** to start in the forest. Progress auto-saves at
waystones and after story events (**CONTINUE** appears on the title screen).

## Controls

| Action | Keyboard / Mouse | Gamepad |
| --- | --- | --- |
| Move / camera | WASD / mouse | Left / right stick |
| Light / heavy attack | LMB / RMB | X / Y |
| Dodge · dash · air dash | Shift | B |
| Jump | Space | A |
| Block (hold) · **Parry** (tap just before a hit) | Q | LB |
| Weapon skill · in the air: *Skyfall* finale | E | RB |
| Ultimate (LIMIT full) | R | RT |
| Lock-on | Tab / middle mouse | LT / R3 |
| Interact · **Finisher** on staggered enemies | F | L3 |
| Switch weapon | 1–6 / mouse wheel | D-pad |
| Potion | Enter | — |
| Status · Quests · Class · Map · Menu | C · J · K · M · Esc | Back / Start |

**Signature combo:** `LIGHT → LIGHT → HEAVY` (Rising Slash launches) `→ SHIFT` (pursue into the
air) `→ LIGHT ×3` (aerial combo) `→ E` (Skyfall: huge impact + slow motion).

## What's in it

- **Combat** — stepped 12–24 fps keyframe animation with held anticipation poses, snap impact
  frames and overshooting follow-through; hit-stop (0.03–0.25 s), trauma camera shake, FOV punches,
  inverted "impact frames", radial motion blur, chromatic aberration, speed lines, weapon trails
  with arc-filled smear frames, slash crescents, sparks, dust, debris, afterimages.
  Dodge-cancels, input buffering, perfect dodges (slow-mo + counter window), block, parry,
  posture breaks and cinematic finishers, launchers, juggles, aerial combos, ground slams,
  per-weapon skills, ultimate with time-stop, and attack tokens so enemies take turns.
- **Swordsman progression** — Basic Slash, Heavy Slash, Dash Slash, Rising Slash, Aerial Combo,
  Counter, Parry, Weapon Skill, Ultimate unlock with levels.
- **Weapons** — Broken Sword, Iron Sword, Katana (iaido), Dual Blades, Greatsword (super armor),
  Magic Sword (starlight waves), Cursed Sword (life drain) — switchable mid-combo.
- **Classes** — Swordsman, Archer, Mage, Priest, Assassin, Guardian, Beast Tamer and the hidden
  **Reincarnator**, which absorbs class cores from masters and fuses two: Spellblade, Holy Knight,
  Shadow Mage, Beast Ranger, Phantom Blade, Bastion Knight, Sage, Wild Blade, Arcane Archer.
- **World** — chunky terraced terrain and hand-built-looking blocky architecture: Whisperwood forest,
  Elmbrook village, the walled capital Astera, the Ruins of the First Cycle and their dungeon,
  Sun Scar desert, Ironspine mountains, Frostveil snowfields, the demon territory Ashen Maw,
  floating islands, a hidden cave, boss arenas, chests, waystones (fast travel) and memory fragments.
  Day/night cycle, region-tinted skies and fog, ambient particles.
- **People** — NPCs with daily schedules, activities, greetings and barks, fear reactions,
  relationships (affinity), shops, quests and class training.
- **Bosses** — Ruin Golem, Frost Behemoth, Demon General Azgaroth (blade-clash QTE),
  the secret Forgotten Knight, the Herald of the Administrator, and Varkas in the prologue.
- **Audio** — procedural orchestral-style score per region/battle/boss, layered impacts, metal
  clashes, footsteps per surface, wind/ambience, magic, monster roars and synthesized voice grunts.

## Code map

```
src/core      time (hit-stop/slow-mo), input, audio + music, camera director, utils
src/render    toon materials & outlines, post-processing, particles/trails/slashes
src/world     chunky geometry builder, terrain, world regions/interiors/sky
src/chars     anime humanoid builder, drawn faces, creatures, animator & poses, baking
src/combat    weapons, move list, hit resolution / projectiles / hazards
src/entities  player, enemies, bosses, NPCs
src/story     NPC cast & dialogue, quests, cutscenes, prologue
src/ui        HUD, System windows, dialogue, menus
```

## Settings (Esc → SYSTEM)

- **Animation: Smooth / Anime (stepped)** — Smooth (default) interpolates every frame with eased
  in-betweens and keeps impact snaps as ultra-fast strikes; Anime samples poses on 12–24 fps for the
  classic choppy look.
- **Render quality: High / Medium / Low** — High renders at up to 2× pixel density with 4× MSAA through
  the post-processing chain and 4096² shadow maps. `?lowgfx=1` forces Low.

## Story beats

Prologue (Varkas and the throne, 3:47 AM, a message from your sister Mio) → waking in Whisperwood →
Lina and Elmbrook → the Guild's shattered Crest Crystal → the Ruins of the First Cycle and the
Reincarnator reveal → **The Night Elmbrook Burned** (demon raid, Moloch the Hound, Lina's memory of
a previous cycle) → class masters → the Frost Behemoth and Demon General → the Floating Isles, Echo's
confession → the Herald and the Administrator → post-credits.
Optional: Lina's night conversation after the raid, the Forgotten Knight's hollow, memory fragments.
