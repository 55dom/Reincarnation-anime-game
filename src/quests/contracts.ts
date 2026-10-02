// Red Ledger contracts. Story is carried by the slips themselves: short, dated, increasingly wrong.
export type ContractState = 'locked' | 'available' | 'active' | 'ready' | 'closed';

export interface Contract {
  id: 'c_wolf' | 'c_deserter' | 'c_warden' | 'c_saint';
  title: string;
  kind: string;
  where: string;
  reward: number;
  slip: string;
  proof: string;
  closingNote: string; // what the clerk writes in the ledger
  state: ContractState;
  lockedNote?: string;
}

export const CONTRACTS: Contract[] = [
  {
    id: 'c_wolf', title: 'Rattlejaw of the Cistern Scrub', kind: 'Beast', where: 'Cistern Scrub, north-east of Veyr', reward: 40,
    slip: 'Alpha wolf, scarred jaw, taking pilgrims at the old cistern. Pack of three, maybe more since the March. Bring the hide; the ledger pays on proof.<br><i>— Maro, clerk of the Red Ledger</i>',
    proof: 'Rattlejaw’s hide', closingNote: 'Rattlejaw — beast — hide received', state: 'available',
  },
  {
    id: 'c_deserter', title: 'Garran Vell, Ninth Banner', kind: 'Deserter', where: 'Ruined watchtower, west road', reward: 65,
    slip: 'Garran Vell, sworn to the Ninth, walked off the line on the twelfth day of the March. Bring his banner seal.<br>Do not read his letters. If you have read his letters, do not repeat them.<br><i>— Maro</i>',
    proof: 'Ninth Banner Seal', closingNote: 'Garran Vell — deserter — seal received, letters burned', state: 'available',
  },
  {
    id: 'c_warden', title: 'The Warden Below', kind: 'Sanctioned Hunt', where: 'Sunken Fort, north of Veyr', reward: 220,
    slip: 'The sunken fort is held by a thing in plate that will not answer to its name. The guild requires what it guards — a heart of packed sand. Bring it to the ledger.<br>You will see a face in the stone down there. It is not anyone you know.<br><i>— by order of the Ledger Above</i>',
    proof: 'Warden’s Sand-Heart (keep it — socket it; the guild only needs the ledger line)', closingNote: 'The Warden — saint-of-record — struck from the ledger', state: 'locked',
    lockedNote: 'Close one contract to be trusted with a sanctioned hunt.',
  },
  {
    id: 'c_saint', title: 'The Lung of Saint Ysolde', kind: '— sealed —', where: 'Demon Continent', reward: 0,
    slip: 'This slip is pinned face-down. The wax seal is the guild’s drop of red, pressed twice.',
    proof: '—', closingNote: '', state: 'locked',
    lockedNote: 'Sealed. The road is across the Crimson Strait, which no ship in Veyr will sail.',
  },
];

export interface LedgerLine { name: string; note: string; pay: number; isNew?: boolean }
export const LEDGER_HEAD: LedgerLine[] = [
  { name: 'Sun-glass vipers ×6', note: 'beast — Hessa D.', pay: 18 },
  { name: 'Brother Callan of the Third', note: 'deserter — Hessa D.', pay: 70 },
  { name: 'The Choir at Dry Well', note: 'sanctioned — signature smeared', pay: 300 },
];

export const COVENANT_LINES: { who: string; text: string; dur: number }[] = [
  { who: 'Maro, clerk', text: 'Veyr feeds the signed. Veyr does not feed drifters.', dur: 3.6 },
  { who: 'Maro, clerk', text: 'Your name goes in the Red Ledger. Your thumb goes in the ink. The ink is not ink.', dur: 4.2 },
  { who: '', text: '<i>The page drinks. For a moment the hall is very quiet, and very red.</i>', dur: 3.6 },
  { who: 'Maro, clerk', text: 'There. You are a hunter of the Red Ledger. Choose how you will earn your bread.', dur: 3.8 },
];

export const CLERK_IDLE = [
  'The board is on the west wall. Read the slips, not the rumors.',
  'Proof first. Pay second. Questions never.',
  'The Ninth Banner? Gone. All of it. Ask the ledger, not me.',
];
