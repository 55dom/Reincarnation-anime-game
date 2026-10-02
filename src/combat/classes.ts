// The four guild paths. Paths change stats, weapon, armor silhouette, combo strings and signature art.
import { keysFor, P, type Move } from './moves';
import type { HumanoidOpts } from '../player/rig';

export type ClassId = 'hunter' | 'wayfarer' | 'oathbound' | 'shadebound';

export interface ClassDef {
  id: ClassId;
  name: string;
  blurb: string;
  armor: string;
  maxHp: number;
  maxStamina: number;
  staminaRegen: number;
  poise: number;
  speed: number;     // run speed
  rollCost: number;
  backstep?: boolean;
  look: HumanoidOpts;
  light: Move[];     // combo chain A
  heavy: Move[];     // combo chain B
  charged: Move;
  rollAttack: Move;
  special: Move;
  specialName: string;
  specialDesc: string;
  combos: string[];
}

function mv(o: Omit<Move, 'keys'> & { pose: [keyof typeof P, keyof typeof P, keyof typeof P] }): Move {
  const { pose, ...rest } = o;
  return { ...rest, keys: keysFor(rest, P[pose[0]], P[pose[1]], P[pose[2]]) };
}

export const CLASSES: Record<ClassId, ClassDef> = {
  hunter: {
    id: 'hunter', name: 'Bounty Hunter', armor: 'Medium — studded leather & mail',
    blurb: 'Reads tracks, marks a quarry, and finishes it. Paid by the ledger line.',
    maxHp: 120, maxStamina: 100, staminaRegen: 30, poise: 30, speed: 5.4, rollCost: 18,
    look: { cloth: 0x5a2a20, cloth2: 0x8a6a48, leather: 0x3a2618, metal: 0x8a8278, build: 'medium', hood: true, cloak: true, weapon: 'longsword', skin: 0xb88a68, scarf: true },
    light: [
      mv({ id: 'h_l1', name: 'Ledger Cut', stamina: 14, windup: 0.22, active: 0.12, recovery: 0.34, damage: 16, poise: 12, range: 2.3, arc: 1.0, lunge: 3, cancelAt: 0.45, pose: ['slashR_wind', 'slashR_hit', 'slashR_follow'] }),
      mv({ id: 'h_l2', name: 'Return Cut', stamina: 14, windup: 0.18, active: 0.12, recovery: 0.36, damage: 17, poise: 12, range: 2.3, arc: 1.0, lunge: 3, cancelAt: 0.45, pose: ['slashL_wind', 'slashL_hit', 'slashL_follow'] }),
      mv({ id: 'h_l3', name: 'Quarry Thrust', stamina: 18, windup: 0.3, active: 0.12, recovery: 0.5, damage: 24, poise: 22, range: 2.8, arc: 0.45, lunge: 6, pose: ['thrust_wind', 'thrust_hit', 'thrust_follow'] }),
    ],
    heavy: [
      mv({ id: 'h_h1', name: 'Writ Cleave', stamina: 26, windup: 0.5, active: 0.14, recovery: 0.55, damage: 32, poise: 34, range: 2.5, arc: 0.6, lunge: 3, cancelAt: 0.5, pose: ['over_wind', 'over_hit', 'over_follow'] }),
      mv({ id: 'h_h2', name: 'Collector\'s Spin', stamina: 28, windup: 0.4, active: 0.2, recovery: 0.6, damage: 30, poise: 30, range: 2.6, arc: 2.6, lunge: 2, pose: ['spin_wind', 'spin_hit', 'spin_follow'] }),
    ],
    charged: mv({ id: 'h_c', name: 'Charged Writ', stamina: 34, windup: 0.85, active: 0.15, recovery: 0.6, damage: 58, poise: 60, range: 2.7, arc: 0.6, lunge: 5, hyperArmor: true, pose: ['over_wind', 'over_hit', 'over_follow'] }),
    rollAttack: mv({ id: 'h_r', name: 'Low Reap', stamina: 14, windup: 0.14, active: 0.12, recovery: 0.4, damage: 18, poise: 14, range: 2.3, arc: 1.2, lunge: 4, pose: ['slashR_wind', 'slashR_hit', 'slashR_follow'] }),
    special: mv({ id: 'h_s', name: 'Mark / Execute', stamina: 20, windup: 0.35, active: 0.15, recovery: 0.45, damage: 0, poise: 0, range: 14, arc: 0.6, lunge: 0, pose: ['cast_wind', 'cast_hit', 'cast_hit'] }),
    specialName: 'Mark & Execute',
    specialDesc: 'Brand your locked target (+25% damage taken, tracked). Use again in reach of a marked, staggered or weakened quarry to execute.',
    combos: ['Light ×3: Ledger Cut → Return Cut → Quarry Thrust', 'Heavy ×2: Writ Cleave → Collector\'s Spin', 'Hold Heavy: Charged Writ', 'Light out of a roll: Low Reap', 'Q: Mark, then Execute'],
  },
  wayfarer: {
    id: 'wayfarer', name: 'Wayfarer', armor: 'Light — travel linens & hide',
    blurb: 'Walks farther than anyone. Packs the snare, the flint and the spare waterskin.',
    maxHp: 105, maxStamina: 135, staminaRegen: 38, poise: 18, speed: 5.8, rollCost: 14,
    look: { cloth: 0x6a5a3a, cloth2: 0xc8a878, leather: 0x5a3a22, metal: 0x8a8278, build: 'light', hood: false, hair: 0x2a1a10, scarf: true, cloak: true, weapon: 'spear', skin: 0xc49a78 },
    light: [
      mv({ id: 'w_l1', name: 'Reed Jab', stamina: 11, windup: 0.18, active: 0.1, recovery: 0.3, damage: 13, poise: 8, range: 3.0, arc: 0.5, lunge: 3, cancelAt: 0.4, pose: ['thrust_wind', 'thrust_hit', 'thrust_follow'] }),
      mv({ id: 'w_l2', name: 'Shaft Sweep', stamina: 12, windup: 0.2, active: 0.14, recovery: 0.32, damage: 14, poise: 12, range: 2.8, arc: 1.4, lunge: 2, cancelAt: 0.4, pose: ['slashL_wind', 'slashL_hit', 'slashL_follow'] }),
      mv({ id: 'w_l3', name: 'Long Lunge', stamina: 15, windup: 0.26, active: 0.12, recovery: 0.45, damage: 21, poise: 16, range: 3.4, arc: 0.4, lunge: 8, pose: ['thrust_wind', 'thrust_hit', 'thrust_follow'] }),
    ],
    heavy: [
      mv({ id: 'w_h1', name: 'Vault Strike', stamina: 22, windup: 0.45, active: 0.14, recovery: 0.5, damage: 26, poise: 26, range: 3.0, arc: 0.6, lunge: 4, cancelAt: 0.5, pose: ['over_wind', 'over_hit', 'over_follow'] }),
      mv({ id: 'w_h2', name: 'Dune Wheel', stamina: 24, windup: 0.35, active: 0.22, recovery: 0.55, damage: 24, poise: 22, range: 3.0, arc: 3.1, lunge: 1, pose: ['spin_wind', 'spin_hit', 'spin_follow'] }),
    ],
    charged: mv({ id: 'w_c', name: 'Skewer', stamina: 30, windup: 0.75, active: 0.14, recovery: 0.55, damage: 46, poise: 44, range: 3.8, arc: 0.35, lunge: 9, pose: ['thrust_wind', 'thrust_hit', 'thrust_follow'] }),
    rollAttack: mv({ id: 'w_r', name: 'Rising Jab', stamina: 11, windup: 0.12, active: 0.1, recovery: 0.36, damage: 15, poise: 10, range: 3.0, arc: 0.6, lunge: 5, pose: ['thrust_wind', 'thrust_hit', 'thrust_follow'] }),
    special: mv({ id: 'w_s', name: 'Snare', stamina: 22, windup: 0.3, active: 0.12, recovery: 0.4, damage: 4, poise: 10, range: 12, arc: 0.7, lunge: 0, pose: ['cast_wind', 'cast_hit', 'cast_hit'] }),
    specialName: 'Weighted Snare',
    specialDesc: 'Throw a bola at the target in front of you: it is rooted for 4s and cannot attack for the first 2s. Also: place a camp anywhere (B).',
    combos: ['Light ×3: Reed Jab → Shaft Sweep → Long Lunge', 'Heavy ×2: Vault Strike → Dune Wheel', 'Hold Heavy: Skewer', 'Light out of a roll: Rising Jab', 'Q: Snare · B: pitch camp'],
  },
  oathbound: {
    id: 'oathbound', name: 'Oathbound', armor: 'Heavy — plate over ash-grey surcoat',
    blurb: 'Swore to something that still answers in ash. Slow, sure, very hard to move.',
    maxHp: 160, maxStamina: 95, staminaRegen: 26, poise: 70, speed: 4.6, rollCost: 26,
    look: { cloth: 0x5a5650, cloth2: 0x8a2a1c, leather: 0x2a2018, metal: 0xa8a090, build: 'heavy', helmet: 'great', pauldrons: true, cloak: true, weapon: 'greatsword', skin: 0xa87a58 },
    light: [
      mv({ id: 'o_l1', name: 'Oath Hew', stamina: 20, windup: 0.38, active: 0.16, recovery: 0.5, damage: 30, poise: 30, range: 2.9, arc: 1.1, lunge: 2.5, cancelAt: 0.5, hyperArmor: true, pose: ['slashR_wind', 'slashR_hit', 'slashR_follow'] }),
      mv({ id: 'o_l2', name: 'Backhand Hew', stamina: 20, windup: 0.34, active: 0.16, recovery: 0.5, damage: 30, poise: 30, range: 2.9, arc: 1.1, lunge: 2.5, cancelAt: 0.5, hyperArmor: true, pose: ['slashL_wind', 'slashL_hit', 'slashL_follow'] }),
    ],
    heavy: [
      mv({ id: 'o_h1', name: 'Judgement', stamina: 32, windup: 0.7, active: 0.16, recovery: 0.7, damage: 52, poise: 60, range: 3.0, arc: 0.6, lunge: 2, cancelAt: 0.5, hyperArmor: true, pose: ['over_wind', 'over_hit', 'over_follow'] }),
      mv({ id: 'o_h2', name: 'Pilgrim Wheel', stamina: 34, windup: 0.6, active: 0.24, recovery: 0.75, damage: 46, poise: 50, range: 3.1, arc: 3.1, lunge: 1, hyperArmor: true, pose: ['spin_wind', 'spin_hit', 'spin_follow'] }),
    ],
    charged: mv({ id: 'o_c', name: 'Verdict', stamina: 40, windup: 1.1, active: 0.18, recovery: 0.8, damage: 90, poise: 100, range: 3.2, arc: 0.7, lunge: 3, hyperArmor: true, pose: ['over_wind', 'over_hit', 'over_follow'] }),
    rollAttack: mv({ id: 'o_r', name: 'Shoulder Rise', stamina: 18, windup: 0.22, active: 0.14, recovery: 0.5, damage: 24, poise: 30, range: 2.6, arc: 1.0, lunge: 4, pose: ['thrust_wind', 'thrust_hit', 'thrust_follow'] }),
    special: mv({ id: 'o_s', name: 'Ash Slam', stamina: 40, windup: 0.95, active: 0.18, recovery: 0.8, damage: 48, poise: 120, range: 4.2, arc: Math.PI, lunge: 0, aoe: true, hyperArmor: true, pose: ['slam_wind', 'slam_hit', 'slam_follow'] }),
    specialName: 'Ash Slam',
    specialDesc: 'A slow, unstoppable miracle: drive the blade into the ground and burst ash in a ring. Massive poise damage to everything around you.',
    combos: ['Light ×2: Oath Hew → Backhand Hew (hyper-armor)', 'Heavy ×2: Judgement → Pilgrim Wheel', 'Hold Heavy: Verdict', 'Light out of a roll: Shoulder Rise', 'Q: Ash Slam'],
  },
  shadebound: {
    id: 'shadebound', name: 'Shadebound', armor: 'Light — dyed wraps, no plate',
    blurb: 'Fast, curved, and gone before the blood lands. Breaks if it is ever caught.',
    maxHp: 95, maxStamina: 110, staminaRegen: 40, poise: 10, speed: 6.0, rollCost: 12, backstep: true,
    look: { cloth: 0x2a1a22, cloth2: 0x4a2a30, leather: 0x1a1210, metal: 0xb0a8a0, build: 'light', hood: true, scarf: true, weapon: 'curved', skin: 0xb08060 },
    light: [
      mv({ id: 's_l1', name: 'Crescent', stamina: 9, windup: 0.14, active: 0.1, recovery: 0.24, damage: 11, poise: 6, range: 2.1, arc: 1.1, lunge: 4, cancelAt: 0.35, pose: ['slashR_wind', 'slashR_hit', 'slashR_follow'] }),
      mv({ id: 's_l2', name: 'Wane', stamina: 9, windup: 0.12, active: 0.1, recovery: 0.24, damage: 11, poise: 6, range: 2.1, arc: 1.1, lunge: 4, cancelAt: 0.35, pose: ['slashL_wind', 'slashL_hit', 'slashL_follow'] }),
      mv({ id: 's_l3', name: 'Crescent', stamina: 9, windup: 0.12, active: 0.1, recovery: 0.24, damage: 12, poise: 6, range: 2.1, arc: 1.1, lunge: 4, cancelAt: 0.35, pose: ['slashR_wind', 'slashR_hit', 'slashR_follow'] }),
      mv({ id: 's_l4', name: 'Eclipse', stamina: 14, windup: 0.2, active: 0.14, recovery: 0.4, damage: 18, poise: 12, range: 2.4, arc: 2.8, lunge: 3, pose: ['spin_wind', 'spin_hit', 'spin_follow'] }),
    ],
    heavy: [
      mv({ id: 's_h1', name: 'Needle', stamina: 18, windup: 0.32, active: 0.1, recovery: 0.4, damage: 24, poise: 14, range: 2.6, arc: 0.4, lunge: 7, cancelAt: 0.4, pose: ['thrust_wind', 'thrust_hit', 'thrust_follow'] }),
      mv({ id: 's_h2', name: 'Fall of Ash', stamina: 20, windup: 0.4, active: 0.12, recovery: 0.5, damage: 28, poise: 18, range: 2.3, arc: 0.7, lunge: 3, pose: ['stab_down_wind', 'stab_down_hit', 'stab_down_hit'] }),
    ],
    charged: mv({ id: 's_c', name: 'Shade Step Cut', stamina: 26, windup: 0.6, active: 0.12, recovery: 0.45, damage: 40, poise: 24, range: 2.6, arc: 0.6, lunge: 12, pose: ['thrust_wind', 'thrust_hit', 'thrust_follow'] }),
    rollAttack: mv({ id: 's_r', name: 'Return Fang', stamina: 9, windup: 0.08, active: 0.1, recovery: 0.3, damage: 14, poise: 6, range: 2.2, arc: 1.2, lunge: 6, pose: ['slashL_wind', 'slashL_hit', 'slashL_follow'] }),
    special: mv({ id: 's_s', name: 'Bleed Flurry', stamina: 34, windup: 0.25, active: 0.9, recovery: 0.45, damage: 9, poise: 5, range: 2.4, arc: 1.3, lunge: 2.5, pose: ['spin_wind', 'slashR_hit', 'slashL_follow'] }),
    specialName: 'Bleed Flurry',
    specialDesc: 'Six cuts in under a second. Each one builds bleed-ash; when it bursts, the target loses a chunk of its health.',
    combos: ['Light ×4: Crescent → Wane → Crescent → Eclipse', 'Heavy ×2: Needle → Fall of Ash', 'Hold Heavy: Shade Step Cut', 'Space while locked & still: Backstep', 'Q: Bleed Flurry'],
  },
};
