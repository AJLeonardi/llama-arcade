import { BUILD, startPwa, reloadForUpdate } from '../../../shared/pwa';
import { goToArcade } from '../../../shared/home';
import { CW, DPR, H, SCENES, Sfx, W, beginInputFrame, button, ctx, drawFloaters, drawParticles, drawToasts, endInputFrame, fitCanvas, game, goTo, loadSave, pressed, rand, saveGame, setLayer, text, toast, ui, updateParticles } from './core.js';
import { PLANETS, PLAYER_SCARF, newSave } from './data.js';
import { drawLlama, drawPlanet, drawRocketDesign, drawStars } from './art.js';
import { House } from './house.js';
import { Bay } from './bay.js';
import { Builder, startFlight } from './builder.js';
import { Launch, Space } from './flight.js';
import { PlanetScene, Win } from './planet.js';
import { Net, Pair } from './net.js';
import { Coop } from './coop.js';
/* Title screen and the main game loop. */

const Title = {
  wide: true,
  enter() { this.t = 0; this.confirmReset = 0; },
  update(dt) {
    this.t += dt;
    this.confirmReset = Math.max(0, this.confirmReset - dt);
    if (pressed.Enter || pressed.Space) goTo('house', { from: 'start' });
  },
  draw() {
    const t = this.t;
    ctx.fillStyle = '#070a22'; ctx.fillRect(0, 0, W, H);
    drawStars(t * 40);
    PLANETS.forEach((p, i) => drawPlanet(W / 2 - 240 + i * 120, 560 + Math.sin(t + i) * 5, 22 + i * 3, i));
    drawPlanet(110, 120, 40, -1);
    const demo = { cells: { '1,0': 'nose', '1,1': 'cockpit', '1,2': 'body', '0,2': 'wing', '2,2': 'wing', '1,3': 'engine2' }, color: 0 };
    drawRocketDesign(demo, W / 2 + Math.sin(t * 0.8) * 320, 360 + Math.sin(t * 1.6) * 16, { s: 24, flame: 1, tilt: Math.cos(t * 0.8) * 0.3 });
    text('LLAMA', W / 2, 105, { size: 76, color: '#ffe066', stroke: '#3a1d00', strokeW: 10 });
    text('ROCKET BUILDER', W / 2, 178, { size: 58, color: '#ff8a1f', stroke: '#3a1d00', strokeW: 10 });
    drawLlama(W / 2 - 330, 330, { s: 1.6, scarf: PLAYER_SCARF[0], t, moving: true });
    drawLlama(W / 2 + 330, 330, { s: 1.6, scarf: PLAYER_SCARF[1], t: t + 0.3, moving: true, face: -1 });
    if (button('▶ Play', W / 2 - 270, 400, 250, 66, { size: 26 })) goTo('house', { from: 'start' });
    if (button(Net.connected ? '✅ Connected!' : '🦙🦙 Play Together', W / 2 + 20, 400, 250, 66, { size: 22, color: '#9fd3ff' })) Pair.open();
    text(Net.connected ? `You are ${Net.role === 'host' ? 'Llama 1 🧡' : 'Llama 2 💙'} · tap Play!` : 'Play Together = two iPads/iPhones on the same Wi-Fi', W / 2, 490, { size: 15, color: '#aab4d4' });
    if (button(this.confirmReset ? 'Tap again to erase!' : 'New game', 16, 16, 180, 36, { size: 14, color: this.confirmReset ? '#ff6b6b' : '#59607a', textColor: '#fff' })) {
      if (this.confirmReset) { game.save = newSave(); saveGame(); toast('Started a brand new game!', '#ffe066'); this.confirmReset = 0; }
      else this.confirmReset = 3;
    }
    if (button('🏠 Arcade', 16, H - 52, 150, 36, { size: 14, color: '#59607a', textColor: '#fff' })) { saveGame(); goToArcade(); }
    if (game.save.won) text('🏆 You beat Planet Evil!', W - 20, 34, { size: 16, align: 'right', color: '#ffe066' });
  },
};

Object.assign(SCENES, { title: Title, house: House, bay: Bay, builder: Builder, launch: Launch, space: Space, planet: PlanetScene, win: Win });
game.save = loadSave() || newSave();
fitCanvas();
goTo('title');

// Scenes marked `wide` use the whole (possibly wider) canvas. Others are drawn on the 960-wide stage in the middle,
// with `bg` (a colour, or a function drawing on the full canvas) filling the sides.
function drawSceneBg(scene) {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (typeof scene.bg === 'function') scene.bg();
  else { ctx.fillStyle = scene.bg || '#070917'; ctx.fillRect(0, 0, CW, H); }
}

let last = performance.now(), saveT = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  game.t += dt;
  ui.consumed = false;
  beginInputFrame();
  setLayer(!!game.scene.wide);
  if (pressed.KeyM) { Sfx.muted = !Sfx.muted; toast(Sfx.muted ? '🔇 Sound off' : '🔊 Sound on'); }
  if (pressed.Escape && game.modal && game.modal.closable !== false) { game.modal = null; delete pressed.Escape; }
  if (!game.modal || game.modal.live) game.scene.update(dt);   // 'live' menus (pause while flying together) don't stop the game
  updateParticles(dt);
  Net.tick();
  const sceneNow = game.scene;
  drawSceneBg(sceneNow);
  setLayer(!!sceneNow.wide);
  ctx.save();
  if (game.shake > 0) { ctx.translate(rand(-1, 1) * game.shake, rand(-1, 1) * game.shake); game.shake = Math.max(0, game.shake - dt * 30); }
  ui.locked = !!game.modal;
  sceneNow.draw(dt);
  ctx.restore();
  ui.locked = false;
  if (game.modal) {
    setLayer(true);
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(0, 0, CW, H);
    setLayer(false);                 // menus are laid out on the 960 stage
    game.modal.draw(dt);
  }
  setLayer(!!game.scene.wide);
  drawParticles();
  drawFloaters(dt);
  setLayer(true);
  drawToasts(dt);
  drawBuildNumber();
  if (game.fade > 0) { ctx.fillStyle = `rgba(0,0,0,${game.fade})`; ctx.fillRect(0, 0, CW, H); game.fade = Math.max(0, game.fade - dt * 2.5); }
  saveT += dt;
  if (saveT > 2) { saveT = 0; saveGame(); }
  endInputFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__rocket = { game, goTo, Net, Coop, Space, startFlight };   // for tests/pairing-test.html
window.addEventListener('pagehide', saveGame);

// ---------- Build number + "new version" button ----------
function drawBuildNumber() {
  text(`build ${BUILD}`, CW - 8, H - 8, { size: 11, align: 'right', color: 'rgba(255,255,255,.4)', bold: false });
}
startPwa({ onUpdate: () => { document.getElementById('update').hidden = false; } });
document.getElementById('update').addEventListener('click', () => { saveGame(); reloadForUpdate(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) saveGame(); });

