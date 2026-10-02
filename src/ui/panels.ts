// Modal panels: pack/inventory (with relic socketing + crafting), map (local + world), contract
// board, ledger, trade, camp, class select, notes and help.
import type { Game } from '../game';
import { ITEMS, RECIPES, type ItemId } from '../inventory/inventory';
import { CLASSES, type ClassId } from '../combat/classes';
import { CONTINENTS } from '../quests/maps';
import { heightAt, ROADS, SITES, WORLD_SIZE } from '../world/layout';
import type { Campfire } from '../world/veyr';

const esc = (s: string) => s;

export function inventory(g: Game) {
  const inv = g.inv;
  let sel = -1;
  const render = (root: HTMLElement) => {
    const slots = Array.from({ length: inv.maxSlots }, (_, i) => inv.slots[i]);
    const s = sel >= 0 ? inv.slots[sel] : undefined;
    const def = s ? ITEMS[s.id] : null;
    const craftable = RECIPES.filter((r) => r.where === 'any');
    root.querySelector('.body')!.innerHTML = `
      <div class="sub">${inv.slots.length}/${inv.maxSlots} slots · ${inv.weight.toFixed(1)}/${inv.maxWeight} weight · ${inv.coin} marks${inv.socketed ? ` · Socketed: <span style="color:var(--gold)">${ITEMS[inv.socketed].name}</span>` : ''}</div>
      <div class="grid">${slots.map((x, i) => x ? `<div class="slot ${i === sel ? 'sel' : ''}" data-i="${i}">${ITEMS[x.id].icon}<span class="n">${x.n > 1 ? x.n : ''}</span></div>` : '<div class="slot empty"></div>').join('')}</div>
      <div class="detail">${def ? `<b>${def.name}</b>${def.desc}<br>
        ${def.food ? '<button class="act" data-a="eat">Eat</button>' : ''}
        ${def.relic && s!.id === 'sandHeart' ? '<button class="act" data-a="socket">Socket into armor</button>' : ''}
        ${!def.relic && s!.id !== 'deserterSeal' ? '<button class="act" data-a="drop">Drop one</button>' : ''}` : 'Select an item. Pack limits only grow with the Deep Pocket — a relic of the Demon Continent.'}</div>
      <div style="margin-top:10px"><div class="sub" style="margin-bottom:4px">Craft on the trail</div>${craftable.map((r, i) => recipeBtn(g, r, i)).join('')}</div>
      <div class="sub" style="margin-top:8px">Hunger ${g.player.hunger.toFixed(0)}% · Press 1 to eat the best food you carry.</div>`;
    root.querySelectorAll<HTMLElement>('.slot[data-i]').forEach((e) => e.addEventListener('click', () => { sel = +e.dataset.i!; render(root); }));
    root.querySelector('[data-a=eat]')?.addEventListener('click', () => { g.eat(s!.id); sel = -1; render(root); });
    root.querySelector('[data-a=drop]')?.addEventListener('click', () => { inv.remove(s!.id); sel = -1; render(root); });
    root.querySelector('[data-a=socket]')?.addEventListener('click', () => {
      inv.remove('sandHeart'); inv.socketed = 'sandHeart'; g.player.socketRelic();
      g.hud.toast('<i>The Sand-Heart sinks into your armor. Sand-gold plates knit over leather.</i>', '', 4);
      sel = -1; render(root);
    });
    bindRecipes(g, root, () => render(root));
  };
  g.hud.openPanel('<h2>Pack</h2><div class="body"></div>', render);
}

function recipeBtn(g: Game, r: typeof RECIPES[number], i: number) {
  const ok = Object.entries(r.needs).every(([k, n]) => g.inv.has(k as ItemId, n!));
  const needs = Object.entries(r.needs).map(([k, n]) => `${n}× ${ITEMS[k as ItemId].name}`).join(', ');
  return `<button class="act" data-r="${RECIPES.indexOf(r)}" ${ok ? '' : 'disabled'} title="${r.note}">${ITEMS[r.id].name} <span style="opacity:.6">(${needs})</span></button>`;
}
function bindRecipes(g: Game, root: HTMLElement, rerender: () => void) {
  root.querySelectorAll<HTMLElement>('[data-r]').forEach((b) => b.addEventListener('click', () => {
    const r = RECIPES[+b.dataset.r!];
    for (const [k, n] of Object.entries(r.needs)) g.inv.remove(k as ItemId, n!);
    if (r.id === 'boneKnife') g.hasKnife = true;
    if (r.id === 'bedroll') g.hasBedroll = true;
    if (r.id === 'hideWraps') { g.player.maxHp += 10; g.player.hp += 10; g.hud.toast('<i>Hide wraps bound under your armor. +10 health.</i>'); }
    else if (!g.inv.add(r.id)) g.hud.toast('<i>No room in the pack.</i>');
    rerender();
  }));
}

export function camp(g: Game, cf: Campfire) {
  const render = (root: HTMLElement) => {
    const recipes = RECIPES.filter((r) => r.where === 'camp');
    root.querySelector('.body')!.innerHTML = `
      <div class="sub">The fire cracks. Wind pulls sparks toward the dunes. (${Math.floor(g.sky.hour)}:00 · ${g.weather.kind})</div>
      <div class="row"><span>Cook & craft</span></div><div>${recipes.map((r, i) => recipeBtn(g, r, i)).join('')}</div>
      <div class="row"><span>Eat</span><span><button class="act" data-a="eat">Eat best food</button></span></div>
      <div class="row"><span>${g.hasBedroll ? 'Sleep on the hide bedroll (full health, until morning)' : 'Sit by the fire (heal 40%, 2 hours pass)'}</span><span><button class="act" data-a="rest">Rest</button></span></div>
      <div class="sub" style="margin-top:8px">You will return here if you fall.</div>`;
    bindRecipes(g, root, () => render(root));
    root.querySelector('[data-a=eat]')!.addEventListener('click', () => { g.eat(); render(root); });
    root.querySelector('[data-a=rest]')!.addEventListener('click', () => {
      const P = g.player;
      g.hud.closePanel();
      g.hud.fade(true);
      setTimeout(() => {
        if (g.hasBedroll) { P.hp = P.maxHp; g.sky.hour = g.sky.hour > 7 ? 7 : 7; }
        else { P.hp = Math.min(P.maxHp, P.hp + P.maxHp * 0.4); g.sky.hour = (g.sky.hour + 2) % 24; }
        P.stamina = P.maxStamina;
        P.hunger = Math.max(0, P.hunger - 8);
        g.hud.fade(false);
      }, 900);
    });
  };
  g.hud.openPanel(`<h2>${esc(cf.name)}</h2><div class="body"></div>`, render);
}

export function trade(g: Game) {
  const render = (root: HTMLElement) => {
    const sellable = g.inv.slots.map((s) => s.id).filter((v, i, a) => a.indexOf(v) === i && ITEMS[v].value > 0 && !ITEMS[v].relic && v !== 'deserterSeal');
    root.querySelector('.body')!.innerHTML = `
      <div class="sub">“Hides, fangs, meat. The guild eats what you kill.” · You carry ${g.inv.coin} marks.</div>
      ${sellable.length ? sellable.map((id) => `<div class="row"><span>${ITEMS[id].icon} ${ITEMS[id].name} ×${g.inv.count(id)}</span><span class="meta">${ITEMS[id].value} each <button class="act" data-s="${id}">Sell 1</button><button class="act" data-sa="${id}">Sell all</button></span></div>`).join('') : '<div class="row"><span class="meta">Nothing Hesk wants.</span></div>'}
      <div class="row"><span>◉ Trail ration (cooked meat)</span><span class="meta">16 marks <button class="act" data-b="cookedMeat" ${g.inv.coin >= 16 ? '' : 'disabled'}>Buy</button></span></div>`;
    root.querySelectorAll<HTMLElement>('[data-s]').forEach((b) => b.addEventListener('click', () => { const id = b.dataset.s as ItemId; g.inv.remove(id); g.inv.coin += ITEMS[id].value; render(root); }));
    root.querySelectorAll<HTMLElement>('[data-sa]').forEach((b) => b.addEventListener('click', () => { const id = b.dataset.sa as ItemId; const n = g.inv.count(id); g.inv.remove(id, n); g.inv.coin += ITEMS[id].value * n; render(root); }));
    root.querySelector('[data-b]')?.addEventListener('click', () => { if (g.inv.add('cookedMeat')) g.inv.coin -= 16; else g.hud.toast('<i>No room in the pack.</i>'); render(root); });
  };
  g.hud.openPanel('<h2>Hesk — Quartermaster</h2><div class="body"></div>', render);
}

export function board(g: Game) {
  const render = (root: HTMLElement) => {
    root.querySelector('.body')!.innerHTML = g.contracts.map((c) => `
      <div class="slip ${c.state === 'locked' ? 'locked' : ''}">
        ${c.state === 'closed' ? '<span class="stamp">CLOSED</span>' : c.state === 'active' ? '<span class="stamp">TAKEN</span>' : c.state === 'ready' ? '<span class="stamp">PROOF HELD</span>' : ''}
        <h4>${c.title}</h4>
        <div style="font-size:11px;letter-spacing:.1em;opacity:.7">${c.kind.toUpperCase()} · ${c.where}</div>
        <div style="margin-top:6px">${c.state === 'locked' && c.id === 'c_saint' ? c.slip : c.state === 'locked' ? '<i>Pinned face-down.</i>' : c.slip}</div>
        ${c.state === 'locked' ? `<div class="rw">${c.lockedNote}</div>` : `<div class="rw">Proof: ${c.proof} · Pay: ${c.reward} marks</div>`}
        ${c.state === 'available' ? `<button class="act" data-c="${c.id}">Take this contract</button>` : ''}
      </div>`).join('');
    root.querySelectorAll<HTMLElement>('[data-c]').forEach((b) => b.addEventListener('click', () => {
      const c = g.contracts.find((x) => x.id === b.dataset.c)!;
      g.acceptContract(c);
      g.hud.closePanel();
    }));
  };
  g.hud.openPanel('<h2>Contract Board</h2><div class="sub">Slips over slips. Some of the old ones have names you can almost read.</div><div class="body"></div>', render);
}

export function ledgerView(g: Game, fresh = false) {
  const html = `<h2>The Red Ledger</h2><div class="sub">${fresh ? 'Maro dips the pen. The line goes in red, and the pay goes in your hand.' : 'Every closed contract, every name. Yours are at the bottom.'}</div>
    <div class="ledger">${g.ledger.map((l) => `<div class="ln ${l.isNew && fresh ? 'new' : ''}"><span>${l.name} <span class="sig">— ${l.note}</span></span><span>${l.pay}</span></div>`).join('')}</div>
    <div class="sub" style="margin-top:8px">Purse: ${g.inv.coin} marks</div>`;
  g.hud.openPanel(html, undefined, () => { for (const l of g.ledger) l.isNew = false; });
}

export function note(g: Game, title: string, text: string) {
  g.hud.openPanel(`<h2>${title}</h2><div class="slip" style="font-size:14px">${text}</div>`);
}

export function classSelect(g: Game, onPick: (id: ClassId) => void) {
  let sel: ClassId = 'hunter';
  const render = (root: HTMLElement) => {
    root.querySelector('.body')!.innerHTML = `<div class="classes">${(Object.keys(CLASSES) as ClassId[]).map((id) => {
      const c = CLASSES[id];
      return `<button class="ccard ${id === sel ? 'sel' : ''}" data-id="${id}"><h3>${c.name}</h3><p>${c.blurb}</p>
        <p class="st">HP ${c.maxHp} · Stamina ${c.maxStamina} · Poise ${c.poise} · Speed ${c.speed}</p>
        <p class="st">${c.armor}</p><p><span style="color:var(--gold)">${c.specialName}</span> — ${c.specialDesc}</p></button>`;
    }).join('')}</div>
      <div style="margin-top:12px;display:flex;justify-content:space-between;align-items:center"><span class="sub" style="margin:0">Paths lock until a respec relic is found.</span><button class="act" data-go>Walk the ${CLASSES[sel].name}’s path</button></div>`;
    root.querySelectorAll<HTMLElement>('.ccard').forEach((b) => b.addEventListener('click', () => { sel = b.dataset.id as ClassId; render(root); }));
    root.querySelector('[data-go]')!.addEventListener('click', () => { g.hud.closePanel(true); onPick(sel); });
  };
  g.hud.openPanel('<h2>Choose your path</h2><div class="sub">Paths are not coats. They change how you fight, what you carry, and what the guild sends you after.</div><div class="body"></div>', render, undefined, false);
}

let mapBase: HTMLCanvasElement | null = null;
function buildMapBase() {
  const N = 200;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const wx = (x / N - 0.5) * WORLD_SIZE, wz = (y / N - 0.5) * WORLD_SIZE;
    const h = heightAt(wx, wz);
    const hx = heightAt(wx + 3, wz) - h;
    const shade = Math.max(0.5, Math.min(1.3, 1 - hx * 0.15));
    const t = Math.max(0, Math.min(1, (h + 8) / 22));
    const i = (y * N + x) * 4;
    img.data[i] = (110 + t * 90) * shade; img.data[i + 1] = (58 + t * 52) * shade; img.data[i + 2] = (36 + t * 30) * shade; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function map(g: Game) {
  let tab: 'local' | 'world' = 'local';
  const draw = (cv: HTMLCanvasElement, root: HTMLElement) => {
    const ctx = cv.getContext('2d')!;
    const S = cv.width;
    ctx.clearRect(0, 0, S, S);
    const info = root.querySelector('.mapinfo') as HTMLElement;
    if (tab === 'local') {
      if (!mapBase) mapBase = buildMapBase();
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(mapBase, 0, 0, S, S);
      const m = (x: number, z: number): [number, number] => [(x / WORLD_SIZE + 0.5) * S, (z / WORLD_SIZE + 0.5) * S];
      ctx.strokeStyle = 'rgba(60,30,15,0.8)'; ctx.lineWidth = 3;
      for (const r of ROADS) { ctx.beginPath(); r.forEach(([x, z], i) => { const [a, b] = m(x, z); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); ctx.stroke(); }
      ctx.strokeStyle = '#3a1a10'; ctx.lineWidth = 2;
      const [cx, cz] = m(0, 0); ctx.beginPath(); ctx.arc(cx, cz, (46 / WORLD_SIZE) * S, 0, Math.PI * 2); ctx.stroke();
      ctx.font = '13px Georgia, serif'; ctx.textAlign = 'center';
      const label = (x: number, z: number, t: string, col = '#efe2c8') => { const [a, b] = m(x, z); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(a, b, 3.5, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#1a0d08'; ctx.fillText(t, a + 1, b - 7); ctx.fillStyle = col; ctx.fillText(t, a, b - 8); };
      label(0, 0, 'Veyr');
      label(SITES.guild.x, SITES.guild.z, 'Red Ledger', '#e3b04b');
      label(SITES.fort.x, SITES.fort.z, 'Sunken Fort', '#e8644a');
      label(SITES.scrub.x, SITES.scrub.z, 'Cistern Scrub');
      label(SITES.tower.x, SITES.tower.z, 'Ruined Watchtower');
      for (const cf of g.props.campfires) { const [a, b] = m(cf.pos.x, cf.pos.z); ctx.fillStyle = '#ff8a3a'; ctx.fillRect(a - 3, b - 3, 6, 6); }
      const o = g.objective();
      if (o.pos) { const [a, b] = m(o.pos.x, o.pos.z); ctx.save(); ctx.translate(a, b); ctx.rotate(Math.PI / 4); ctx.fillStyle = '#e3b04b'; ctx.fillRect(-5, -5, 10, 10); ctx.restore(); }
      const [px, pz] = m(g.player.pos.x, g.player.pos.z);
      ctx.save(); ctx.translate(px, pz); ctx.rotate(-g.player.yaw + Math.PI); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill(); ctx.restore();
      ctx.fillStyle = '#efe2c8'; ctx.textAlign = 'left'; ctx.fillText('N ↑', 8, 18);
      info.innerHTML = `<i>${o.text}</i>`;
    } else {
      ctx.fillStyle = '#1a2a34'; ctx.fillRect(0, 0, S, S);
      for (const c of CONTINENTS) {
        ctx.beginPath();
        c.shape.forEach(([x, y], i) => (i ? ctx.lineTo(x * S, y * S) : ctx.moveTo(x * S, y * S)));
        ctx.closePath();
        ctx.fillStyle = c.status === 'playable' ? '#9a5a34' : c.status === 'charted' ? '#5a4a3a' : '#4a1010';
        ctx.fill();
        ctx.strokeStyle = c.status === 'locked' ? '#b8321e' : '#2a1a10'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = c.status === 'locked' ? '#e8644a' : '#efe2c8';
        ctx.font = '13px Georgia, serif'; ctx.textAlign = 'center';
        ctx.fillText(c.name + (c.status === 'locked' ? ' ⛓' : ''), c.center[0] * S, c.center[1] * S);
      }
      ctx.fillStyle = 'rgba(184,50,30,0.25)'; ctx.font = 'italic 11px Georgia, serif';
      ctx.fillText('the Crimson Strait', 0.7 * S, 0.47 * S);
      info.innerHTML = CONTINENTS.map((c) => `<div class="row"><span>${c.name} <span class="meta">— ${c.status}${c.status !== 'playable' ? '' : ' (you are here)'}</span><br><span class="meta">${c.biome}. Fauna: ${c.fauna.join(', ')}. Boss: ${c.boss}.</span><br><span class="meta"><i>${c.note}</i></span></span></div>`).join('');
    }
  };
  const render = (root: HTMLElement) => {
    root.querySelector('.body')!.innerHTML = `<div class="tabs"><button data-t="local" class="${tab === 'local' ? 'on' : ''}">Veyr Marches</button><button data-t="world" class="${tab === 'world' ? 'on' : ''}">The Known World</button></div><div class="mapwrap"><canvas width="520" height="520"></canvas></div><div class="mapinfo detail"></div>`;
    root.querySelectorAll<HTMLElement>('[data-t]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.t as 'local' | 'world'; render(root); }));
    draw(root.querySelector('canvas')!, root);
  };
  g.hud.openPanel('<h2>Map</h2><div class="body"></div>', render);
}

export function help(g: Game) {
  const c = g.player.cls;
  g.hud.openPanel(`<h2>Field Notes</h2><div class="help"><table>
    <tr><td><kbd>WASD</kbd><kbd>Mouse</kbd></td><td>Move · camera (click to capture mouse)</td></tr>
    <tr><td><kbd>Shift</kbd></td><td>Sprint (stamina)</td></tr>
    <tr><td><kbd>Space</kbd></td><td>Roll / dodge (i-frames). With no direction: backstep</td></tr>
    <tr><td><kbd>F</kbd> <kbd>C</kbd></td><td>Jump · crouch (hares notice you less)</td></tr>
    <tr><td><kbd>LMB</kbd> <kbd>RMB</kbd></td><td>Light · heavy (hold heavy to charge). Light out of a roll = roll attack</td></tr>
    <tr><td><kbd>Q</kbd></td><td>Weapon art / signature special</td></tr>
    <tr><td><kbd>R</kbd>/<kbd>Tab</kbd>/<kbd>MMB</kbd></td><td>Lock-on (press again to release; with nothing in view it recenters the camera)</td></tr>
    <tr><td><kbd>E</kbd></td><td>Interact (some actions are held)</td></tr>
    <tr><td><kbd>T</kbd> <kbd>1</kbd> <kbd>B</kbd></td><td>Track (Bounty Hunter) · eat · pitch camp (Wayfarer)</td></tr>
    <tr><td><kbd>I</kbd> <kbd>M</kbd> <kbd>J</kbd></td><td>Pack · map · ledger</td></tr>
    <tr><td><kbd>K</kbd> <kbd>N</kbd></td><td>Debug: toggle rain · skip 3 hours</td></tr>
    <tr><td>Touch</td><td>Left side: floating stick (push fully to sprint). Right side: drag camera. Buttons bottom-right.</td></tr>
  </table>
  <p class="sub" style="margin-top:10px">Reading a fight: <span style="color:#ffa040">orange glow + filling ground mark</span> = windup, <span style="color:#ff2a10">red flash</span> = the hit is live, <span style="color:#8ab0d0">cool grey</span> = recovery: punish now. Gold nameplates are contract targets, blue are your party (you cannot harm them), red are hostile.</p>
  ${c ? `<p class="sub" style="color:var(--ink)">${c.name} combos:<br>${c.combos.join('<br>')}</p>` : ''}</div>`);
}
