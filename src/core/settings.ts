// Player settings: persisted per device (localStorage, failure-tolerant), applied live.
export type GraphicsPreset = 'ultra' | 'high' | 'medium' | 'low';

export interface ControlPos { x: number; y: number; s: number } // centre in % of viewport, scale

export interface Settings {
  master: number;      // 0..1
  sfx: number;
  ambience: number;
  brightness: number;  // exposure multiplier 0.6..1.6
  darkness: number;    // 0 = flat/bright shadows .. 1 = deep, inky shadows
  sensitivity: number; // camera multiplier 0.3..2.5
  invertY: boolean;
  graphics: GraphicsPreset;
  autoQuality: boolean;
  controlsOpacity: number; // 0.2..1
  controlsScale: number;   // 0.7..1.4 global multiplier
  showTouchControls: boolean; // force on-screen controls on desktop
  stickMode: 'floating' | 'fixed';
  layout: Record<string, ControlPos>; // custom positions of on-screen controls
}

const KEY = 'ashveil.settings.v1';

export function defaultSettings(mobile: boolean): Settings {
  return {
    master: 0.8, sfx: 0.8, ambience: 0.6,
    brightness: 1, darkness: 0.5, sensitivity: 1, invertY: false,
    graphics: mobile ? 'medium' : 'high', autoQuality: true,
    controlsOpacity: 0.85, controlsScale: 1, showTouchControls: false, stickMode: 'floating', layout: {},
  };
}

export function loadSettings(mobile: boolean): Settings {
  const d = defaultSettings(mobile);
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const s = JSON.parse(raw) as Partial<Settings>;
    return { ...d, ...s, layout: { ...(s.layout ?? {}) } };
  } catch { return d; }
}

export function saveSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode / blocked storage: settings stay for this session */ }
}

export interface PresetSpec { pixelRatio: number; shadow: number; grass: number; grassDist: number; grassLod: number; particles: number; fogMul: number }
export function presetSpec(p: GraphicsPreset, dpr: number): PresetSpec {
  switch (p) {
    case 'ultra': return { pixelRatio: Math.min(dpr, 2), shadow: 4096, grass: 1.6, grassDist: 140, grassLod: 40, particles: 1, fogMul: 1.15 };
    case 'high': return { pixelRatio: Math.min(dpr, 1.5), shadow: 2048, grass: 1.0, grassDist: 100, grassLod: 22, particles: 1, fogMul: 1 };
    case 'medium': return { pixelRatio: Math.min(dpr, 1), shadow: 1024, grass: 0.45, grassDist: 60, grassLod: 4, particles: 0.6, fogMul: 0.9 };
    case 'low': return { pixelRatio: Math.min(dpr, 0.75), shadow: 0, grass: 0.2, grassDist: 40, grassLod: 0, particles: 0.3, fogMul: 0.8 };
  }
}
