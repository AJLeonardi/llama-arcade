// A tiny 2D game to start from: a llama you move with the arrow keys or by dragging, collecting stars.
// It shows the arcade plumbing every game uses: offline + updates, saving, and the way back to the arcade.
import { BUILD, startPwa, reloadForUpdate } from '../../../shared/pwa';
import { gameStorage } from '../../../shared/storage';
import { goToArcade } from '../../../shared/home';

const store = gameStorage('GAME_ID'); // GAME_ID = this game's folder name under games/

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
let width = 0, height = 0;
function fit() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', fit);
fit();

// ---- state ----
const llama = { x: 200, y: 200 };
let star = { x: 400, y: 300 };
let best = store.load<number>('best') ?? 0;
let score = 0;
let updateReady = false;

// ---- input: keys, or drag anywhere to steer ----
const keys: Record<string, boolean> = {};
window.addEventListener('keydown', (e) => (keys[e.code] = true));
window.addEventListener('keyup', (e) => (keys[e.code] = false));
let drag: { x: number; y: number } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  if (e.clientX < 120 && e.clientY < 60) return goToArcade(); // the 🏠 button
  if (updateReady && e.clientY < 60 && Math.abs(e.clientX - width / 2) < 150) return reloadForUpdate();
  drag = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointermove', (e) => drag && (drag = { x: e.clientX, y: e.clientY }));
canvas.addEventListener('pointerup', () => (drag = null));
canvas.addEventListener('pointercancel', () => (drag = null));

// ---- game loop ----
const SPEED = 260; // pixels per second
let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  let dx = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
  let dy = (keys.ArrowDown || keys.KeyS ? 1 : 0) - (keys.ArrowUp || keys.KeyW ? 1 : 0);
  if (drag) {
    const ox = drag.x - llama.x, oy = drag.y - llama.y, d = Math.hypot(ox, oy);
    if (d > 10) { dx = ox / d; dy = oy / d; }
  }
  llama.x = Math.max(30, Math.min(width - 30, llama.x + dx * SPEED * dt));
  llama.y = Math.max(30, Math.min(height - 30, llama.y + dy * SPEED * dt));

  if (Math.hypot(llama.x - star.x, llama.y - star.y) < 50) {
    score++;
    if (score > best) { best = score; store.save('best', best); }
    star = { x: 60 + Math.random() * (width - 120), y: 90 + Math.random() * (height - 150) };
  }

  ctx.fillStyle = '#10202a';
  ctx.fillRect(0, 0, width, height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '48px sans-serif';
  ctx.fillText('⭐', star.x, star.y);
  ctx.font = '64px sans-serif';
  ctx.fillText('🦙', llama.x, llama.y);

  ctx.font = 'bold 22px sans-serif';
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'left';
  ctx.fillText('🏠 Arcade', 16, 30);
  ctx.textAlign = 'right';
  ctx.fillText(`Stars: ${score}   Best: ${best}`, width - 16, 30);
  if (updateReady) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe066';
    ctx.fillText('✨ New version! Tap here', width / 2, 30);
  }
  ctx.font = '11px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,.4)';
  ctx.textAlign = 'right';
  ctx.fillText(`build ${BUILD}`, width - 8, height - 10);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

startPwa({ onUpdate: () => (updateReady = true) });
