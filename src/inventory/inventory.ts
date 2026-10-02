// Pack: slot + weight limited. Only the Deep Pocket relic (Demon Continent) raises the limits.
export type ItemId = 'hide' | 'pelt' | 'meat' | 'hareMeat' | 'cookedMeat' | 'fang' | 'bone' | 'cloth' | 'ironScrap'
  | 'resin' | 'hideWraps' | 'boneKnife' | 'bedroll' | 'sandHeart' | 'deserterSeal' | 'waterskin' | 'deepPocket';

export interface ItemDef { id: ItemId; name: string; weight: number; stack: number; value: number; desc: string; food?: number; relic?: boolean; icon: string }

export const ITEMS: Record<ItemId, ItemDef> = {
  hide: { id: 'hide', name: 'Wolf Hide', weight: 2.0, stack: 5, value: 14, desc: 'Coarse, thick hide. Tanners and the guild buy it.', icon: '▤' },
  pelt: { id: 'pelt', name: 'Hare Pelt', weight: 0.4, stack: 10, value: 4, desc: 'Soft pelt from a dune hare.', icon: '▫' },
  meat: { id: 'meat', name: 'Raw Wolf Meat', weight: 1.0, stack: 5, value: 6, desc: 'Stringy. Eat raw if you must; better cooked at a camp.', food: 12, icon: '◖' },
  hareMeat: { id: 'hareMeat', name: 'Raw Hare', weight: 0.5, stack: 8, value: 3, desc: 'Lean meat. Cook it.', food: 7, icon: '◗' },
  cookedMeat: { id: 'cookedMeat', name: 'Fire-Seared Meat', weight: 0.8, stack: 8, value: 12, desc: 'Charred outside, warm through. Restores hunger and some health.', food: 35, icon: '◉' },
  fang: { id: 'fang', name: 'Wolf Fang', weight: 0.1, stack: 20, value: 5, desc: 'Ledger proof of a wolf kill.', icon: '▲' },
  bone: { id: 'bone', name: 'Bone', weight: 0.5, stack: 10, value: 2, desc: 'For tools and camp frames.', icon: '╪' },
  cloth: { id: 'cloth', name: 'Banner Cloth', weight: 0.3, stack: 10, value: 3, desc: 'Red cloth cut from a deserter’s banner.', icon: '≋' },
  ironScrap: { id: 'ironScrap', name: 'Iron Scrap', weight: 1.0, stack: 10, value: 6, desc: 'Bent rivets and buckles.', icon: '⚙' },
  resin: { id: 'resin', name: 'Ash Resin', weight: 0.2, stack: 10, value: 8, desc: 'Weeps from Ashthorn bark. Burns hot.', icon: '◆' },
  hideWraps: { id: 'hideWraps', name: 'Hide Wraps', weight: 1.5, stack: 1, value: 30, desc: 'Crafted. Worn under armor: +10 max health.', icon: '▥' },
  boneKnife: { id: 'boneKnife', name: 'Bone Skinning Knife', weight: 0.3, stack: 1, value: 12, desc: 'Crafted. Skinning and butchering take half as long, and yield more.', icon: '⟋' },
  bedroll: { id: 'bedroll', name: 'Hide Bedroll', weight: 2.0, stack: 1, value: 25, desc: 'Camp upgrade. Resting at camp restores full health and passes the night.', icon: '▭' },
  sandHeart: { id: 'sandHeart', name: 'Warden’s Sand-Heart', weight: 0.5, stack: 1, value: 0, desc: 'Boss relic. Socket into armor: the armor is re-forged in sand-gold. +poise, +health, −12% damage taken.', relic: true, icon: '✹' },
  deserterSeal: { id: 'deserterSeal', name: 'Ninth Banner Seal', weight: 0.1, stack: 1, value: 0, desc: 'Proof for the ledger. The wax is guild red.', icon: '◎' },
  waterskin: { id: 'waterskin', name: 'Waterskin', weight: 0.5, stack: 1, value: 2, desc: 'Every drifter has one.', icon: '♁' },
  deepPocket: { id: 'deepPocket', name: 'Deep Pocket', weight: 0, stack: 1, value: 0, desc: 'It breathes when you are not looking.', relic: true, icon: '✺' },
};

export interface Slot { id: ItemId; n: number }

export class Inventory {
  slots: Slot[] = [];
  maxSlots = 20;
  maxWeight = 30;
  coin = 6;
  socketed: ItemId | null = null;
  onChange: () => void = () => {};

  get weight() { return this.slots.reduce((s, x) => s + ITEMS[x.id].weight * x.n, 0); }
  count(id: ItemId) { return this.slots.filter((s) => s.id === id).reduce((a, s) => a + s.n, 0); }
  has(id: ItemId, n = 1) { return this.count(id) >= n; }

  /** Adds up to n; returns how many fit. Refuses on slot or weight limit. */
  add(id: ItemId, n = 1): number {
    const def = ITEMS[id];
    let added = 0;
    for (let i = 0; i < n; i++) {
      if (this.weight + def.weight > this.maxWeight + 1e-6) break;
      const s = this.slots.find((x) => x.id === id && x.n < def.stack);
      if (s) { s.n++; added++; continue; }
      if (this.slots.length >= this.maxSlots) break;
      this.slots.push({ id, n: 1 });
      added++;
    }
    if (added) this.onChange();
    return added;
  }

  remove(id: ItemId, n = 1): boolean {
    if (!this.has(id, n)) return false;
    let left = n;
    for (let i = this.slots.length - 1; i >= 0 && left > 0; i--) {
      const s = this.slots[i];
      if (s.id !== id) continue;
      const take = Math.min(s.n, left);
      s.n -= take; left -= take;
      if (s.n <= 0) this.slots.splice(i, 1);
    }
    this.onChange();
    return true;
  }
}

export interface Recipe { id: ItemId; needs: Partial<Record<ItemId, number>>; where: 'camp' | 'any'; note: string }
export const RECIPES: Recipe[] = [
  { id: 'cookedMeat', needs: { meat: 1 }, where: 'camp', note: 'Cook over a campfire.' },
  { id: 'cookedMeat', needs: { hareMeat: 2 }, where: 'camp', note: 'Two hares make a meal.' },
  { id: 'boneKnife', needs: { bone: 2, fang: 1 }, where: 'any', note: 'Lash a fang to bone.' },
  { id: 'hideWraps', needs: { hide: 2, pelt: 1 }, where: 'camp', note: 'Stitch hide by firelight.' },
  { id: 'bedroll', needs: { hide: 1, pelt: 2, bone: 1 }, where: 'camp', note: 'A frame and a hide. Sleep.' },
];
