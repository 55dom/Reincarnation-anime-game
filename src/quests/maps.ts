// Continent map data. Veyr Marches is playable; the others are stubs with authored data
// (biomes, sites, fauna, weather profile) ready for later milestones.
export interface ContinentDef {
  id: string;
  name: string;
  status: 'playable' | 'charted' | 'locked';
  biome: string;
  weather: { clear: number; rain: number; storm: number };
  fauna: string[];
  sites: { name: string; x: number; y: number; kind: 'city' | 'dungeon' | 'camp' | 'ruin' | 'gate' }[];
  boss: string;
  shape: [number, number][]; // normalized outline for the world map
  center: [number, number];
  note: string;
}

export const CONTINENTS: ContinentDef[] = [
  {
    id: 'veyr', name: 'Veyr Marches', status: 'playable', biome: 'Crimson desert — dunes, guild city, ruined watchtowers',
    weather: { clear: 0.65, rain: 0.35, storm: 0 }, fauna: ['wolf', 'dune hare', 'deserter'],
    sites: [{ name: 'Veyr', x: 0.5, y: 0.55, kind: 'city' }, { name: 'Sunken Fort', x: 0.5, y: 0.2, kind: 'dungeon' }, { name: 'Cistern Scrub', x: 0.72, y: 0.36, kind: 'camp' }],
    boss: 'Dune Warden', center: [0.36, 0.56],
    shape: [[0.22, 0.42], [0.34, 0.36], [0.46, 0.4], [0.5, 0.52], [0.47, 0.66], [0.36, 0.74], [0.25, 0.7], [0.19, 0.56]],
    note: 'Starting zone. The Red Ledger’s home.',
  },
  {
    id: 'ashwood', name: 'Ashwood Verge', status: 'charted', biome: 'Twisted Ashthorn forest, limestone caves, game trails',
    weather: { clear: 0.5, rain: 0.4, storm: 0.1 }, fauna: ['grey wolf', 'warren hare', 'cave stag', 'ash bear'],
    sites: [{ name: 'Hollowmere Lodge', x: 0.4, y: 0.5, kind: 'camp' }, { name: 'The Rootcaves', x: 0.6, y: 0.3, kind: 'dungeon' }],
    boss: 'The Antlered Widow', center: [0.6, 0.3],
    shape: [[0.5, 0.18], [0.64, 0.12], [0.76, 0.2], [0.74, 0.36], [0.62, 0.42], [0.52, 0.36]],
    note: 'Hunt-and-skin country. Contracts open after the Warden falls.',
  },
  {
    id: 'stormglass', name: 'Stormglass Coast', status: 'charted', biome: 'Rain-lashed cliffs, mudflats, glass-sand beaches',
    weather: { clear: 0.15, rain: 0.6, storm: 0.25 }, fauna: ['cliff gull', 'mud crawler', 'wreck-scavenger'],
    sites: [{ name: 'Port Sallow', x: 0.4, y: 0.6, kind: 'city' }, { name: 'The Drowned Bell', x: 0.7, y: 0.4, kind: 'dungeon' }],
    boss: 'Bellwright Maev', center: [0.66, 0.68],
    shape: [[0.56, 0.56], [0.68, 0.5], [0.8, 0.58], [0.82, 0.74], [0.7, 0.84], [0.58, 0.78]],
    note: 'Mud slows everything. The ships that will not sail east are docked here.',
  },
  {
    id: 'demon', name: 'The Demon Continent', status: 'locked', biome: 'Unknown. The sky above it is the colour of the March.',
    weather: { clear: 0, rain: 0, storm: 1 }, fauna: ['—'],
    sites: [{ name: 'Where the March was aimed', x: 0.5, y: 0.5, kind: 'gate' }],
    boss: '— unrecorded —', center: [0.84, 0.3],
    shape: [[0.82, 0.16], [0.92, 0.2], [0.95, 0.34], [0.88, 0.44], [0.8, 0.38], [0.78, 0.26]],
    note: 'Locked. The only place the Deep Pocket relic is known to drop: a chest at the bottom of its deepest dungeon. Every pack in Veyr is the size it is because of that chest.',
  },
];
