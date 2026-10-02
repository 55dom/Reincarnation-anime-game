// Global game clock: hit-stop, slow motion and real/scaled delta time.
import { clamp } from './util.js';

export const Time = {
  real: 0,          // seconds since start (unscaled)
  game: 0,          // scaled game seconds
  dt: 0,            // scaled delta this frame
  rdt: 0,           // real delta this frame
  scale: 1,
  hitstop: 0,       // remaining real seconds of freeze
  slowmo: 0,        // remaining real seconds of slow motion
  slowmoScale: 1,
  slowmoTotal: 0,
  paused: false,

  update(rawDt) {
    this.rdt = clamp(rawDt, 0, 1 / 20);
    this.real += this.rdt;
    let s = 1;
    if (this.slowmo > 0) {
      this.slowmo -= this.rdt;
      // ease back to normal speed during the last 30% of the slowmo window
      const k = this.slowmoTotal > 0 ? clamp(this.slowmo / (this.slowmoTotal * 0.3), 0, 1) : 0;
      s = this.slowmoScale + (1 - this.slowmoScale) * (1 - k);
    }
    if (this.hitstop > 0) { this.hitstop -= this.rdt; s = 0; }
    if (this.paused) s = 0;
    this.scale = s;
    this.dt = this.rdt * s;
    this.game += this.dt;
  },

  /** Freeze gameplay for `sec` real seconds (classic hit-stop). */
  hitStop(sec) { this.hitstop = Math.max(this.hitstop, sec); },

  /** Slow time to `scale` for `sec` real seconds. */
  slowMo(sec, scale = 0.25) {
    if (this.slowmo > 0 && this.slowmoScale < scale) { this.slowmo = Math.max(this.slowmo, sec); return; }
    this.slowmo = sec; this.slowmoTotal = sec; this.slowmoScale = scale;
  },
  clearEffects() { this.hitstop = 0; this.slowmo = 0; },
};
