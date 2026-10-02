// ASHVEIL: CRIMSON MARCH — entry point.
import { Game } from './game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game(canvas);
game.boot().catch((e) => {
  console.error(e);
  document.getElementById('ui')!.innerHTML = `<div style="padding:20px;color:#efe2c8;font-family:Georgia">Failed to start: ${String(e)}</div>`;
});
// Expose for debugging in the console
(window as unknown as { game: Game }).game = game;
