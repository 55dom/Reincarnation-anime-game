// Procedural audio (WebAudio, no files): wind and rain beds, footsteps, swings, hits, rolls,
// finisher booms, campfire crackle and UI clicks. Three buses: master → sfx / ambience.
export class GameAudio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private amb!: GainNode;
  private noise!: AudioBuffer;
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private rainGain!: GainNode;
  private rainFilter!: BiquadFilterNode;
  private fireGain!: GainNode;
  private vol = { master: 0.8, sfx: 0.8, amb: 0.6 };
  private crackleT = 0;

  /** Must be called from a user gesture (browser autoplay policy). Safe to call repeatedly. */
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.sfx = ctx.createGain();
    this.amb = ctx.createGain();
    this.sfx.connect(this.master);
    this.amb.connect(this.master);
    this.master.connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = w * 0.5 + b * 2.5; }
    // Wind bed: looping noise through a wandering band-pass
    const wind = this.loop();
    this.windFilter = ctx.createBiquadFilter(); this.windFilter.type = 'bandpass'; this.windFilter.frequency.value = 420; this.windFilter.Q.value = 0.7;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    wind.connect(this.windFilter).connect(this.windGain).connect(this.amb);
    // Rain bed: bright hiss
    const rain = this.loop();
    this.rainFilter = ctx.createBiquadFilter(); this.rainFilter.type = 'highpass'; this.rainFilter.frequency.value = 1400;
    this.rainGain = ctx.createGain(); this.rainGain.gain.value = 0;
    rain.connect(this.rainFilter).connect(this.rainGain).connect(this.amb);
    // Fire bed: low roar (crackles are one-shots)
    const fire = this.loop();
    const ff = ctx.createBiquadFilter(); ff.type = 'lowpass'; ff.frequency.value = 300;
    this.fireGain = ctx.createGain(); this.fireGain.gain.value = 0;
    fire.connect(ff).connect(this.fireGain).connect(this.amb);
    this.setVolumes(this.vol.master, this.vol.sfx, this.vol.amb);
  }

  private loop() {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.loopStart = Math.random();
    src.start(0, Math.random() * 1.5);
    return src;
  }

  setVolumes(master: number, sfx: number, amb: number) {
    this.vol = { master, sfx, amb };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(master, t, 0.05);
    this.sfx.gain.setTargetAtTime(sfx, t, 0.05);
    this.amb.gain.setTargetAtTime(amb, t, 0.05);
  }

  /** Ambience follows the world: wind strength, rain, shelter, nearby fire, pause. */
  update(dt: number, wind: number, rain: number, indoor: boolean, fireNear: number, paused: boolean) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const duck = paused ? 0.35 : 1;
    const shelter = indoor ? 0.25 : 1;
    this.windGain.gain.setTargetAtTime((0.05 + wind * 0.09) * shelter * duck, t, 0.4);
    this.windFilter.frequency.setTargetAtTime(300 + wind * 260 + Math.sin(t * 0.3) * 80, t, 0.6);
    this.rainGain.gain.setTargetAtTime(rain * 0.16 * (indoor ? 0.35 : 1) * duck, t, 0.5);
    this.rainFilter.frequency.setTargetAtTime(indoor ? 500 : 1400, t, 0.3);
    this.fireGain.gain.setTargetAtTime(fireNear * 0.12 * duck, t, 0.3);
    if (fireNear > 0.05 && !paused) {
      this.crackleT -= dt;
      if (this.crackleT <= 0) { this.crackleT = 0.05 + Math.random() * 0.35; this.burst({ dur: 0.02 + Math.random() * 0.03, freq: 1800 + Math.random() * 2500, type: 'bandpass', gain: 0.25 * fireNear, bus: 'amb' }); }
    }
  }

  private burst(o: { dur: number; freq: number; type: BiquadFilterType; gain: number; sweepTo?: number; q?: number; bus?: 'sfx' | 'amb'; attack?: number }) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = o.type; f.frequency.setValueAtTime(o.freq, t); f.Q.value = o.q ?? 1;
    if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(o.sweepTo, t + o.dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), t + (o.attack ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f).connect(g).connect(o.bus === 'amb' ? this.amb : this.sfx);
    src.start(t, Math.random() * 1.5, o.dur + 0.05);
  }

  private thump(freq: number, dur: number, gain: number) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.45, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfx);
    o.start(t); o.stop(t + dur + 0.02);
  }

  footstep(wet: number, sprint: boolean, grass: number) {
    const v = sprint ? 0.32 : 0.22;
    this.burst({ dur: 0.07, freq: 500 + Math.random() * 300, type: 'lowpass', gain: v * (1 - wet * 0.4) });
    if (wet > 0.3) this.burst({ dur: 0.09, freq: 2600, type: 'bandpass', gain: v * wet * 0.6, q: 0.8 });
    if (grass > 0.2) this.burst({ dur: 0.16, freq: 3200, type: 'highpass', gain: v * grass * 0.35, attack: 0.03 });
  }
  swing(heavy: boolean) { this.burst({ dur: heavy ? 0.32 : 0.2, freq: heavy ? 500 : 800, sweepTo: heavy ? 1800 : 2800, type: 'bandpass', gain: heavy ? 0.4 : 0.3, q: 1.4, attack: 0.04 }); }
  roll() { this.burst({ dur: 0.35, freq: 350, sweepTo: 180, type: 'lowpass', gain: 0.35, attack: 0.05 }); }
  hit(heavy: boolean) {
    this.thump(heavy ? 95 : 140, heavy ? 0.28 : 0.16, heavy ? 0.7 : 0.45);
    this.burst({ dur: 0.1, freq: 1200, type: 'bandpass', gain: heavy ? 0.45 : 0.3, q: 0.7 });
  }
  hurt() { this.thump(80, 0.25, 0.6); this.burst({ dur: 0.12, freq: 700, type: 'lowpass', gain: 0.4 }); }
  finisher(big: boolean) { this.thump(big ? 55 : 70, big ? 1.4 : 0.7, 0.9); this.burst({ dur: big ? 1.2 : 0.5, freq: 3000, sweepTo: 400, type: 'bandpass', gain: 0.35, attack: 0.01 }); }
  click() { if (!this.ctx) return; this.burst({ dur: 0.03, freq: 2400, type: 'bandpass', gain: 0.18, q: 3 }); }
}
