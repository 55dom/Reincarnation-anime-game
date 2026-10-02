// The people of the world. In Eternal Realms they were NPCs with one line each.
// Here they have homes, routines, opinions — and they remember things they shouldn't.
import { Audio } from '../core/audio.js';

const me = (G) => (G.player.name === 'UNKNOWN' ? 'You' : G.player.name);
const think = (G, t) => [me(G), `(${t})`];
const L = (G, n, t) => [n.name, t, { pitch: n.def.pitch }];

export function npcDefs(G) {
  const S = G.story;
  const looks = {
    lina: { build: 'female', skin: 0xffe4d4, hair: 0x8a4a2a, hairStyle: 'pony', eye: 0x3aa86a, faceStyle: 'heroine', top: 0xf4f0e4, bottom: 0x4a7a5a, skirt: 0x4a7a5a, apron: 0xffffff, accent: 0xc84a4a, boots: 0x6a4a32, gloves: 0xffe4d4, sleeves: true, blush: true },
    borin: { build: 'big', skin: 0xe8b890, hair: 0x6a3a1a, hairStyle: 'short', eye: 0x4a3a2a, faceStyle: 'stern', top: 0x8a6a4a, bottom: 0x4a3a2a, apron: 0x3a2a1a, accent: 0x9a9aa0, boots: 0x2a1a10, gloves: 0x3a2a1a, sleeves: false },
    maren: { build: 'female', skin: 0xf0d0b8, hair: 0xe8e8e8, hairStyle: 'bob', eye: 0x6a5a8a, faceStyle: 'old', top: 0x6a4a7a, bottom: 0x4a3a5a, skirt: 0x4a3a5a, accent: 0xd8c070, boots: 0x3a2a2a, height: 0.95 },
    pip: { build: 'small', height: 0.7, skin: 0xffe0c8, hair: 0xe8b040, hairStyle: 'spiky', eye: 0x4a8ad8, faceStyle: 'cute', top: 0xd84a3a, bottom: 0x3a5a8a, accent: 0xffffff, boots: 0x5a3a2a, blush: true },
    hollis: { skin: 0xd8a880, hair: 0x5a4a3a, hairStyle: 'short', eye: 0x5a4a3a, faceStyle: 'hero', top: 0x7a8a4a, bottom: 0x5a4a3a, accent: 0xc8b070, boots: 0x3a2a1a, hood: 0xd8c08a },
    teo: { skin: 0xf0c8a8, hair: 0x2a2a2a, hairStyle: 'short', eye: 0x2a5a8a, faceStyle: 'hero', top: 0x4a5a7a, bottom: 0x3a3a48, armor: 0xa0a8b4, accent: 0xc8302a, boots: 0x2a2a30, hat: 'helm' },
    garrick: { build: 'big', skin: 0xd8a070, hair: 0x9a9a9a, hairStyle: 'messy', eye: 0x8a6a3a, faceStyle: 'stern', top: 0x5a3a2a, bottom: 0x3a2a20, armor: 0x7a6a5a, cape: 0x8a2a1a, accent: 0xd8b04a, boots: 0x2a1a10 },
    mira: { build: 'female', skin: 0xffe8dc, hair: 0x5a8ad8, hairStyle: 'twin', eye: 0x3a6ad8, faceStyle: 'heroine', top: 0xffffff, bottom: 0x2a3a6a, skirt: 0x2a3a6a, accent: 0xd8b04a, boots: 0x2a2a3a, blush: true },
    selene: { build: 'female', skin: 0xf8e4f0, hair: 0xb8a8ff, hairStyle: 'long', eye: 0x9a6aff, faceStyle: 'heroine', top: 0x3a2a6a, bottom: 0x2a1a4a, skirt: 0x2a1a4a, coat: 0x2a1a5a, hat: 'witch', hatColor: 0x2a1a5a, accent: 0xd8b04a, boots: 0x1a1030 },
    aria: { build: 'female', skin: 0xfff0e8, hair: 0xf8e8a8, hairStyle: 'long', eye: 0x5a9ad8, faceStyle: 'heroine', top: 0xf8f8ff, bottom: 0xf0f0f8, skirt: 0xf0f0f8, hood: 0xf0f0ff, accent: 0xd8b04a, boots: 0xd8d0c0 },
    fenn: { skin: 0xe0b088, hair: 0x3a2a1a, hairStyle: 'messy', eye: 0x6a8a3a, faceStyle: 'hero', top: 0xb88a3a, bottom: 0x5a4a3a, scarf: 0x3a8a6a, accent: 0xffd34d, boots: 0x4a3a2a, backpack: true },
    lio: { skin: 0xffe0c8, hair: 0xd85a8a, hairStyle: 'messy', eye: 0xd8a03a, faceStyle: 'hero', top: 0x6a3a8a, bottom: 0x3a2a4a, cape: 0xd8a03a, accent: 0xffffff, boots: 0x3a2a3a, ahoge: true },
    rowan: { skin: 0xd8b090, hair: 0x3a5a2a, hairStyle: 'messy', eye: 0x5ab04a, faceStyle: 'hero', top: 0x4a6a3a, bottom: 0x3a4a2a, hood: 0x3a5a2a, quiver: true, accent: 0xa08a5a, boots: 0x3a2a1a, ears: 'elf' },
    nala: { build: 'female', skin: 0xc89070, hair: 0x1a1a1a, hairStyle: 'pony', eye: 0xd8a03a, faceStyle: 'heroine', top: 0x8a5a3a, bottom: 0x5a3a2a, scarf: 0xd85a3a, accent: 0xe8d0a0, boots: 0x3a2a1a, sleeves: false },
    shade: { skin: 0xd8c0b0, hair: 0x2a2a3a, hairStyle: 'messy', eye: 0xb04aff, faceStyle: 'stern', top: 0x1a1a24, bottom: 0x1a1a24, scarf: 0x4a1a5a, hood: 0x1a1a24, accent: 0x6a3a8a, boots: 0x101018 },
    brann: { build: 'big', skin: 0xc89070, hair: 0xb04a2a, hairStyle: 'short', eye: 0x4a6a8a, faceStyle: 'stern', top: 0x4a5a4a, bottom: 0x3a3a30, armor: 0x8a9488, cape: 0x3a5a3a, accent: 0xd8b04a, boots: 0x2a2a20 },
    yuki: { build: 'female', skin: 0xfff4f4, hair: 0xe8f4ff, hairStyle: 'bob', eye: 0x5ac8ff, faceStyle: 'heroine', top: 0xd8e8f8, bottom: 0x8aa8c8, coat: 0xa8c8e8, scarf: 0x5a8ad8, accent: 0xffffff, boots: 0x5a6a8a },
    ghost: { skin: 0xc8d8ff, hair: 0x9ab0ff, hairStyle: 'spiky', eye: 0xffffff, faceStyle: 'hero', top: 0x8aa0e0, bottom: 0x6a80c0, coat: 0x5a70b0, scarf: 0xe0e8ff, accent: 0xffffff, boots: 0x4a5a90 },
    echo: { skin: 0xf0f0f0, hair: 0x2a2a2a, hairStyle: 'short', eye: 0x5fd8ff, faceStyle: 'hero', top: 0xf4f4f4, bottom: 0x2a2a34, coat: 0xffffff, accent: 0x5fd8ff, boots: 0x1a1a20 },
    cat: { build: 'small', height: 0.5, skin: 0xf0a050, hair: 0xf0a050, hairStyle: 'short', eye: 0x8ad83a, faceStyle: 'cute', top: 0xf0a050, bottom: 0xf0a050, ears: 'elf', accent: 0xffffff, boots: 0xf0a050, gloves: 0xffffff },
  };

  return [
    // ---------------------------------------------------------------- ELMBROOK
    { id: 'lina', name: 'Lina', look: looks.lina, pitch: 330, home: 'linaHouse', schedule: [[0, 'linaHouse', 'sleep'], [6.5, 'villageWell', 'work'], [10, 'market', 'talk'], [13, 'fields', 'work'], [17, 'villageSquare', 'idle'], [21, 'linaHouse', 'sleep']],
      greet: (G) => (S.has('metLina') ? 'Ah! ' + (G.player.name === 'UNKNOWN' ? 'Traveler!' : G.player.name + '!') : null),
      barks: ['Grandma\'s cough is getting worse...', 'The well water tastes like iron lately.', (G) => (S.has('metLina') ? 'Don\'t push yourself too hard, okay?' : 'Have I... seen you somewhere?')],
      questMark: () => S.has('metLina') && !S.q('herbs'),
      talk: async (G, n) => {
        if (!S.q('herbs')) {
          await G.ui.talk([L(G, n, 'Um... could I ask you a favor? Grandma\'s medicine needs slime jelly — it soothes the lungs.'), L(G, n, 'But the slimes in Whisperwood have gotten so aggressive. Nobody wants to go near the forest anymore.')]);
          const c = await G.ui.say(n.name, 'If you could bring back 5 jellies... I can\'t pay much, but I\'ll make you dinner!', { choices: ['Leave it to me.', 'Slimes? Easy. I\'ve killed thousands.', 'Maybe later.'], pitch: 330 });
          if (c === 0 || c === 1) {
            if (c === 1) { await G.ui.talk([L(G, n, '...Thousands? You say the strangest things.'), think(G, 'In the game, slimes were XP fodder. Here she looks genuinely scared of them.')]); }
            S.start('herbs'); n.addAffinity(1);
          }
          return;
        }
        const q = S.q('herbs');
        if (!q.done && q.count >= 5) {
          await G.ui.talk([L(G, n, 'You got them all?! Thank you, thank you!'), L(G, n, 'Here — Grandma insists you take these. And... come by for dinner sometime, okay?')]);
          S.complete('herbs', { exp: 120, gold: 60, potions: 3 }); n.addAffinity(3); return;
        }
        const topics = ['How is your grandma?', 'Tell me about Elmbrook.', 'Do you know the legend of the Hero?', 'You look nice today.', 'Bye.'];
        const c = await G.ui.say(n.name, q.done ? 'Grandma is sleeping peacefully thanks to you. What\'s on your mind?' : `Any luck with the slimes? (${Math.min(5, q.count)}/5)`, { choices: topics, pitch: 330 });
        if (c === 0) await G.ui.talk([L(G, n, 'She raised me after my parents left for the capital. She tells the oddest stories — about the sky "resetting" when she was a girl.'), think(G, 'Resetting...?')]);
        if (c === 1) await G.ui.talk([L(G, n, 'Elmbrook has been here for three hundred years! Founded by settlers who fled the Ash War.'), think(G, 'In Eternal Realms this was "Elm Village": three houses and a well. Now there\'s a windmill, fields, a whole history.')]);
        if (c === 2) await G.ui.talk([L(G, n, 'Every child knows it! A hero with no class who appears from nowhere... and saves the world before it ends.'), L(G, n, 'Grandma says the hero always comes back. Every thousand years. Isn\'t that romantic?'), think(G, 'A hero with no class... [CLASS: ERROR]. That can\'t be a coincidence.')]);
        if (c === 3) {
          if (S.dayFlag('lina_compliment')) await G.ui.talk([L(G, n, 'Y-you already said that today! Stop teasing me...')]);
          else { await G.ui.talk([L(G, n, 'Wh— what?! I-I\'m covered in flour! ...Thank you.')]); n.char.setExpression('happy', 3); n.addAffinity(1); }
        }
        if (n.affinity >= 6 && !S.has('linaGift')) {
          S.set('linaGift'); await G.ui.talk([L(G, n, 'Wait! I made this charm for you. It\'s silly, but... it\'s supposed to bring travelers home.'), ['SYSTEM', '[ITEM: Lina\'s Charm — Max HP +20]', { sys: true }]]);
          G.flags.charm = true; G.player.recalc();
        }
      } },
    { id: 'borin', name: 'Borin', look: looks.borin, pitch: 120, prop: 'hammer', home: 'smithy', schedule: [[0, 'innDoor', 'sleep'], [7, 'smithy', 'hammer'], [19, 'innDoor', 'talk'], [23, 'innDoor', 'sleep']], faceYaw: Math.PI / 2,
      greet: 'Oi. Need steel?', barks: ['*CLANG* *CLANG*', 'Hah! Good iron sings.', 'Ore from Ironspine has gone scarce.'],
      talk: async (G, n) => {
        if (!S.has('borinIntro')) { S.set('borinIntro'); await G.ui.talk([L(G, n, 'A broken blade? Hah! You fought something with THAT?'), L(G, n, 'A dire wolf... in Whisperwood? Those beasts never came south of the mountains before. Something\'s changing.')]); }
        const c = await G.ui.say(n.name, 'Well? Buying or chatting?', { choices: ['Show me your wares.', 'What\'s changing in the world?', 'Bye.'], pitch: 120 });
        if (c === 0) G.ui.openShop('Borin\'s Smithy', [{ name: 'Iron Sword', desc: 'Elmbrook steel. DMG ×1.0, Reach 2.4', price: 120, weapon: 'iron' }, { name: 'Healing Potion ×2', desc: 'Restores 45% HP.', price: 40, potion: 2 }, { name: 'Healing Potion ×5', desc: 'Bulk discount.', price: 90, potion: 5 }]);
        if (c === 1) await G.ui.talk([L(G, n, 'New monsters. Ruins that glow at night. And the stars... my old man swore the constellations were different when he was young.'), L(G, n, 'Folks say the Administrator is watching. Ghost stories. Probably.')]);
      } },
    { id: 'maren', name: 'Elder Maren', look: looks.maren, pitch: 200, home: 'chiefHouse', schedule: [[0, 'chiefHouse', 'sleep'], [7, 'chiefHouse', 'idle'], [11, 'villageSquare', 'talk'], [15, 'chiefHouse', 'cross'], [21, 'chiefHouse', 'sleep']],
      greet: 'Welcome, child.', barks: ['The wind smells of ash today.', 'Hmph. My knees predict rain.'],
      questMark: () => S.q('elmbrook') && !S.q('elmbrook').done,
      talk: async (G, n) => S.elderTalk(n) },
    { id: 'pip', name: 'Pip', look: looks.pip, pitch: 420, home: 'villageSquare', speed: 4, schedule: [[0, 'chiefHouse', 'sleep'], [8, 'villageSquare', 'wander'], [12, 'fields', 'cheer'], [15, 'villageWell', 'wander'], [20, 'chiefHouse', 'sleep']],
      greet: 'Whoa, a real sword!', barks: ['Tag! You\'re it!', 'I\'m gonna be a hero when I grow up!', 'Did you see the glowing ruins?!'],
      talk: async (G, n) => {
        const lines = [[L(G, n, 'Are you an adventurer? What\'s your class? Mine\'s gonna be Swordsman!'), think(G, 'He\'d be disappointed if I told him.')],
          [L(G, n, 'Granny Maren says if you stare at the sky long enough you can see it flicker. Like a candle!')],
          [L(G, n, 'There\'s a cave in the mountains nobody comes back from. My cousin says a ghost knight lives there!')]];
        await G.ui.talk(lines[Math.floor(Math.random() * lines.length)]);
      } },
    { id: 'hollis', name: 'Farmer Hollis', look: looks.hollis, pitch: 160, prop: 'broom', home: 'fields', schedule: [[0, 'innDoor', 'sleep'], [5.5, 'fields', 'work'], [18, 'innDoor', 'talk'], [22, 'innDoor', 'sleep']],
      greet: 'Mornin\'.', barks: ['Goblins trampled my wheat again!', 'Rain soon, I hope.'],
      talk: async (G, n) => G.ui.talk([L(G, n, 'Goblins come down from the hills every night now. Used to be once a season.'), L(G, n, 'If you\'re handy with that blade, the Elder could use you.')]) },
    { id: 'teo', name: 'Guard Teo', look: looks.teo, pitch: 180, prop: 'spear', home: 'villageGate', schedule: [[0, 'villageGate', 'guard'], [12, 'villageEdge', 'guard'], [18, 'villageGate', 'guard']], brave: true,
      greet: 'Halt— oh, you\'re fine.', barks: ['All quiet.', 'I should\'ve joined the Royal Guard...'],
      talk: async (G, n) => G.ui.talk([L(G, n, 'The road east leads to the crossroads, then north to the capital, Astera.'), L(G, n, 'Southwest are the old ruins. Stay away from those — they started glowing about a week ago.'), think(G, 'About a week ago... when I died?')]) },

    // ---------------------------------------------------------------- ASTERA
    { id: 'garrick', name: 'Guildmaster Garrick', look: looks.garrick, pitch: 110, home: 'guild', offset: [-2, 1], schedule: [[0, 'guild', 'cross']], brave: true,
      greet: 'Another hopeful, eh?', barks: ['The board\'s full of jobs nobody can finish.'], questMark: () => S.guildMark(),
      talk: async (G, n) => S.guildTalk(n) },
    { id: 'mira', name: 'Mira', look: looks.mira, pitch: 360, home: 'guild', offset: [3, -1.5], schedule: [[0, 'guild', 'idle']],
      greet: 'Welcome to the Adventurer\'s Guild!', barks: ['Please form an orderly line!', 'Rank D quests are on the left board~'],
      talk: async (G, n) => {
        if (S.has('guildCrystal')) await G.ui.talk([L(G, n, 'Th-the crystal is still cracked... Twenty years and I\'ve never seen it do that. What ARE you?'), L(G, n, 'Ah! I mean— good luck out there!')]);
        else await G.ui.talk([L(G, n, 'Registration? Please speak with the Guildmaster — he insists on testing newcomers personally.')]);
      } },
    { id: 'selene', name: 'Archmage Selene', look: looks.selene, pitch: 300, prop: 'staff', home: 'mageTower', schedule: [[0, 'mageTower', 'cast']], brave: true,
      greet: 'Your mana signature is... wrong.', barks: ['The ley lines hum in a key I don\'t recognize.'], questMark: () => S.coreMark('mage'),
      talk: async (G, n) => S.masterTalk(n, 'mage', { intro: ['I study the structure of this world, little anomaly. And lately the structure is... shifting. Like a page being rewritten.', 'You read as a blank space in the weave. No class. That should be impossible.'], shop: [{ name: 'Magic Sword — Astral Arc', desc: 'Swings release starlight waves.', price: 600, weapon: 'magic' }, { name: 'Ether Elixir', desc: 'Fills LIMIT gauge instantly.', price: 150, elixir: true }] }) },
    { id: 'aria', name: 'Sister Aria', look: looks.aria, pitch: 340, home: 'cathedral', schedule: [[0, 'cathedral', 'pray'], [10, 'cityPlaza', 'talk'], [13, 'cathedral', 'pray']],
      greet: 'May the light guide you.', barks: ['The Goddess has been silent for so long.'], questMark: () => S.coreMark('priest'),
      talk: async (G, n) => S.masterTalk(n, 'priest', { intro: ['Our scriptures speak of the Long Night that comes every thousand years. The faithful are reborn; the rest... forget.', 'Some call the one who brings the Night "the Administrator". I pray it is only a myth.'] }) },
    { id: 'fenn', name: 'Merchant Fenn', look: looks.fenn, pitch: 210, home: 'cityMarket', schedule: [[0, 'tavern', 'sleep'], [7, 'cityMarket', 'talk'], [20, 'tavern', 'talk'], [24, 'tavern', 'sleep']],
      greet: 'Best prices in Astera!', barks: ['Potions! Fresh potions!', 'Imported from the Sun Scar, guaranteed!'],
      talk: async (G, n) => {
        const c = await G.ui.say(n.name, 'What\'ll it be, friend?', { choices: ['Shop', 'Any rumors?', 'Bye'], pitch: 210 });
        if (c === 0) G.ui.openShop('Fenn\'s Emporium', [{ name: 'Healing Potion ×3', desc: 'Restores 45% HP each.', price: 55, potion: 3 }, { name: 'Healing Potion ×10', desc: 'For heroes who get hit a lot.', price: 170, potion: 10 }, { name: 'Ether Elixir', desc: 'Fills your LIMIT gauge.', price: 160, elixir: true }]);
        if (c === 1) await G.ui.talk([L(G, n, 'Rumor is there\'s a hidden blade in the Sun Scar\'s sunken temple — at the very top. Assassins guard the desert, though.'), L(G, n, 'And a fella swore he saw a sword buried in the Ruins of the First Cycle, near the east arches. A katana, he said!')]);
      } },
    { id: 'lio', name: 'Bard Lio', look: looks.lio, pitch: 250, home: 'cityPlaza', schedule: [[0, 'tavern', 'sit'], [9, 'cityPlaza', 'cheer'], [19, 'tavern', 'cheer']],
      greet: '♪ A traveler! A tale! ♪', barks: ['♪ When the sky goes white, the world forgets~ ♪', '♪ Seven cycles, seven heroes, seven graves~ ♪'],
      talk: async (G, n) => G.ui.talk([L(G, n, 'Want a song? This one\'s ancient. Nobody knows who wrote it.'), L(G, n, '♪ He came with no name and no class to his name, he fought the White King, and nothing was the same... ♪'), L(G, n, '♪ ...and when the world ended, he wept, for he remembered it all. ♪'), think(G, 'The White King... Varkas wore white in the final battle.')]) },

    // ---------------------------------------------------------------- CLASS MASTERS ELSEWHERE
    { id: 'rowan', name: 'Hunter Rowan', look: looks.rowan, pitch: 190, prop: 'bow', home: 'beastCamp', schedule: [[0, 'beastCamp', 'bow']], brave: true,
      greet: 'Quiet. You\'ll scare the deer.', barks: ['The wolves are fleeing south. Something drives them.'], questMark: () => S.coreMark('archer'),
      talk: async (G, n) => S.masterTalk(n, 'archer', { intro: ['I\'ve hunted Whisperwood forty years. Never saw a dire wolf until last week.', 'Something north is pushing the beasts out. Something that wasn\'t there before.'] }) },
    { id: 'nala', name: 'Nala', look: looks.nala, pitch: 300, home: 'beastCamp', schedule: [[0, 'beastCamp', 'kneel']], brave: true,
      greet: 'The forest spirits are whispering about you.', barks: ['Easy, easy... nobody will hurt you.'], questMark: () => S.coreMark('beast'),
      talk: async (G, n) => S.masterTalk(n, 'beast', { intro: ['Beasts remember things people forget. They remember the last Long Night.', 'They\'re afraid of you. No — they\'re afraid of what follows you.'] }) },
    { id: 'shade', name: 'Shade', look: looks.shade, pitch: 150, home: 'assassinCamp', schedule: [[0, 'assassinCamp', 'cross']], brave: true,
      greet: '...', barks: ['...'], questMark: () => S.coreMark('assassin'),
      talk: async (G, n) => S.masterTalk(n, 'assassin', { intro: ['You walked past my sentries without a sound. They didn\'t even see a class tag above you.', 'The Order of the Veil has a word for people like you. "Glitch."'] }) },
    { id: 'brann', name: 'Commander Brann', look: looks.brann, pitch: 100, home: 'fort', schedule: [[0, 'fort', 'guard']], brave: true,
      greet: 'State your business.', barks: ['Hold the line!'], questMark: () => S.coreMark('guardian'),
      talk: async (G, n) => S.masterTalk(n, 'guardian', { intro: ['Ironspine Watch has stood for eight hundred years. Its records only go back nine hundred and ninety.', 'Before that? Nothing. Blank pages. As if the world began mid-sentence.'] }) },
    { id: 'yuki', name: 'Yuki', look: looks.yuki, pitch: 380, home: 'snowCamp', schedule: [[0, 'snowCamp', 'idle']], brave: true,
      greet: 'You\'ll freeze dressed like that!', barks: ['The Behemoth\'s howl shook the whole valley last night.'], questMark: () => S.q('threats') && !S.has('behemothDown'),
      talk: async (G, n) => G.ui.talk(S.has('behemothDown') ? [L(G, n, 'The valley\'s so quiet now. Thank you. Grandpa says the snow even tastes sweeter.')] :
        [L(G, n, 'The Frost Behemoth appeared out of nowhere. No legend, no record — it\'s just... new.'), L(G, n, 'Its den is past the ice spires to the southwest. Please... be careful.'), think(G, 'A Frost Behemoth? That monster never existed in Eternal Realms.')]) },

    // ---------------------------------------------------------------- HIDDEN
    { id: 'cat', name: 'Mysterious Cat', look: looks.cat, pitch: 500, home: 'oasisStone', schedule: [[0, 'oasisStone', 'sit']], brave: true,
      greet: 'Nya.', barks: ['Nya~'],
      talk: async (G, n) => G.ui.talk([L(G, n, 'Nya. You came back again, nya.'), L(G, n, 'Last time you were taller. The time before, you were a girl. The time before THAT you cried a lot, nya.'), L(G, n, 'Fragments of you are scattered everywhere. Find them, nya.'), think(G, '...Did that cat just talk?')]) },
  ];
}

export { me, think, L, Audio };
