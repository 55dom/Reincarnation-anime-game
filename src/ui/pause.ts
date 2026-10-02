// Pause menu: Game tab (resume, field notes, controls layout, return to title) and a Settings tab
// (audio, display, camera, HUD/controls, graphics presets). Every change applies live and persists.
import type { Game } from '../game';
import type { GraphicsPreset, Settings } from '../core/settings';
import * as Panels from './panels';

type Tab = 'game' | 'settings';

export function openPause(g: Game, tab: Tab = 'game') {
  g.paused = true;
  const s = g.settings;
  const slider = (key: keyof Settings, label: string, hint: string, min: number, max: number, step: number, fmt: (v: number) => string) =>
    `<div class="set-row"><span class="lbl">${label}<small>${hint}</small></span><input type="range" data-k="${key}" min="${min}" max="${max}" step="${step}" value="${s[key] as number}"><span class="val" data-v="${key}">${fmt(s[key] as number)}</span></div>`;
  const pct = (v: number) => Math.round(v * 100) + '%';
  const fmts: Partial<Record<keyof Settings, (v: number) => string>> = {
    master: pct, sfx: pct, ambience: pct, brightness: pct, darkness: pct, sensitivity: (v) => v.toFixed(2) + '×', controlsOpacity: pct, controlsScale: (v) => v.toFixed(2) + '×',
  };
  const check = (key: keyof Settings, label: string, hint: string) =>
    `<div class="set-row"><span class="lbl">${label}<small>${hint}</small></span><input type="checkbox" data-c="${key}" ${s[key] ? 'checked' : ''}></div>`;
  const presets: GraphicsPreset[] = ['ultra', 'high', 'medium', 'low'];

  const render = (root: HTMLElement) => {
    const body = root.querySelector('.body') as HTMLElement;
    root.querySelectorAll<HTMLElement>('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
    if (tab === 'game') {
      body.innerHTML = `<div class="menu-list">
        <button class="act" data-a="resume">Resume</button>
        <button class="act" data-a="settings">Settings</button>
        <button class="act" data-a="layout">Customize on-screen controls</button>
        <button class="act" data-a="help">Field notes &amp; controls</button>
        <button class="act" data-a="title">Return to title</button></div>
        <div class="pause-hint">The world waits while this page is open. ${Math.floor(g.sky.hour)}:${String(Math.floor((g.sky.hour % 1) * 60)).padStart(2, '0')} · ${g.weather.kind}</div>`;
      body.querySelector('[data-a=resume]')!.addEventListener('click', () => g.hud.closePanel());
      body.querySelector('[data-a=settings]')!.addEventListener('click', () => { tab = 'settings'; render(root); });
      body.querySelector('[data-a=layout]')!.addEventListener('click', () => { g.hud.closePanel(); g.layout.enter(); });
      body.querySelector('[data-a=help]')!.addEventListener('click', () => { g.paused = false; Panels.help(g); });
      body.querySelector('[data-a=title]')!.addEventListener('click', () => { if (confirm('Return to the title screen? Progress in this prototype is not saved.')) location.reload(); });
      return;
    }
    body.innerHTML = `
      <div class="set-sec">Audio</div>
      ${slider('master', 'Master volume', 'Everything', 0, 1, 0.05, pct)}
      ${slider('sfx', 'Effects', 'Steps, blades, impacts', 0, 1, 0.05, pct)}
      ${slider('ambience', 'Ambience', 'Wind, rain, fire', 0, 1, 0.05, pct)}
      <div class="set-sec">Display</div>
      ${slider('brightness', 'Brightness', 'Overall exposure', 0.6, 1.6, 0.05, pct)}
      ${slider('darkness', 'Darkness', 'How deep shadows and nights get', 0, 1, 0.05, pct)}
      <div class="set-sec">Camera</div>
      ${slider('sensitivity', 'Sensitivity', 'Mouse and touch camera speed', 0.3, 2.5, 0.05, fmts.sensitivity!)}
      ${check('invertY', 'Invert vertical look', 'Push up to look down')}
      <div class="set-sec">HUD &amp; on-screen controls</div>
      ${slider('controlsOpacity', 'Controls opacity', 'Touch buttons and stick', 0.2, 1, 0.05, pct)}
      ${slider('controlsScale', 'Controls size', 'Scales every on-screen control', 0.7, 1.4, 0.05, fmts.controlsScale!)}
      ${check('showTouchControls', 'Show on-screen controls', 'Also on desktop / with a mouse')}
      <div class="set-row"><span class="lbl">Joystick<small>Floating follows your thumb; fixed stays put</small></span><span class="seg">${(['floating', 'fixed'] as const).map((m) => `<button data-stick="${m}" class="${s.stickMode === m ? 'on' : ''}">${m}</button>`).join('')}</span></div>
      <div class="set-row"><span class="lbl">Layout<small>Drag, resize and place every control</small></span><span><button class="act" data-a="layout">Edit layout</button><button class="act" data-a="resetLayout">Reset</button></span></div>
      <div class="set-sec">Graphics</div>
      <div class="set-row"><span class="lbl">Quality<small>Resolution, shadows, grass density &amp; distance, particles</small></span><span class="seg">${presets.map((p) => `<button data-g="${p}" class="${s.graphics === p ? 'on' : ''}">${p[0].toUpperCase() + p.slice(1)}</button>`).join('')}</span></div>
      ${check('autoQuality', 'Auto-adjust quality', 'Steps down a preset when frame rate drops')}
      <div class="pause-hint">Grass instances: ${g.grass.count.toLocaleString()} · draw distance ${g.grass.drawDist}m</div>`;
    body.querySelectorAll<HTMLInputElement>('input[type=range]').forEach((inp) => inp.addEventListener('input', () => {
      const k = inp.dataset.k as keyof Settings;
      (s as unknown as Record<string, number>)[k] = +inp.value;
      const v = body.querySelector(`[data-v=${k}]`);
      if (v) v.textContent = (fmts[k] ?? pct)(+inp.value);
      g.applySettings(false);
    }));
    body.querySelectorAll<HTMLInputElement>('input[type=checkbox]').forEach((inp) => inp.addEventListener('change', () => {
      (s as unknown as Record<string, boolean>)[inp.dataset.c!] = inp.checked;
      g.applySettings(false);
    }));
    body.querySelectorAll<HTMLElement>('[data-stick]').forEach((b) => b.addEventListener('click', () => { s.stickMode = b.dataset.stick as Settings['stickMode']; g.applySettings(false); render(root); }));
    body.querySelectorAll<HTMLElement>('[data-g]').forEach((b) => b.addEventListener('click', () => {
      s.graphics = b.dataset.g as GraphicsPreset;
      s.autoQuality = false; // an explicit pick is respected
      g.applySettings(true);
      render(root);
    }));
    body.querySelector('[data-a=layout]')!.addEventListener('click', () => { g.hud.closePanel(); g.layout.enter(); });
    body.querySelector('[data-a=resetLayout]')!.addEventListener('click', () => { s.layout = {}; s.controlsScale = 1; s.stickMode = 'floating'; g.applySettings(false); render(root); });
  };

  g.hud.openPanel('<h2>Paused</h2><div class="tabs"><button data-t="game">Game</button><button data-t="settings">Settings</button></div><div class="body"></div>', (root) => {
    root.classList.add('pause');
    root.querySelectorAll<HTMLElement>('.tabs button').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.t as Tab; render(root); }));
    render(root);
  }, () => { g.paused = false; });
}
