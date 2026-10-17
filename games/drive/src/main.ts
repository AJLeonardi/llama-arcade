import { startPwa } from '../../../shared/pwa';
import { Game } from './game/Game';

// Block Safari gestures that get in the way of play (pinch-zoom, double-tap zoom, long-press menus).
for (const type of ['gesturestart', 'gesturechange', 'dblclick', 'contextmenu'])
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });

const game = new Game(document.getElementById('game') as HTMLCanvasElement);
game.init().catch((err) => {
  console.error(err);
  document.getElementById('ui')!.innerHTML = `<div class="screen on dim"><h2>Oops, the game could not start.</h2><div>${String(err)}</div></div>`;
});

// Offline support, and checks for a newer deploy (see shared/pwa.ts).
startPwa({ onUpdate: () => game.offerUpdate() });
