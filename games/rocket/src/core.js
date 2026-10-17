import { gameStorage } from '../../../shared/storage';
import { newSave } from './data.js';
import { Net } from './net.js';
/* Core: canvas, input (keys + touch), drawing helpers, tap-button UI, effects, sound, saving, scenes. */

// The game is laid out on a 960x600 stage. On wide screens (phones) the canvas gets wider (CW) so it fills the
// screen: "wide" scenes use the whole width, the others stay 960 wide in the middle with their background filling the sides.
const H = 600, BASE_W = 960;
let W = BASE_W;      // width of the layer being drawn right now
let CW = BASE_W;     // full canvas width
const view = { ox: 0 };
const FONT = '"Arial Rounded MT Bold", "Trebuchet MS", "Segoe UI", system-ui, sans-serif';
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const DPR = Math.min(window.devicePixelRatio || 1, 2);
let fitKey = '';
function fitCanvas() {
  const vw = document.documentElement.clientWidth || window.innerWidth, vh = window.innerHeight;
  const key = vw + 'x' + vh;
  if (key === fitKey) return;
  fitKey = key;
  CW = Math.round(clamp(H * vw / vh, BASE_W, 1400));
  canvas.width = CW * DPR;
  canvas.height = H * DPR;
  const s = Math.min(vw / CW, vh / H);
  canvas.style.width = Math.floor(CW * s) + 'px';
  canvas.style.height = Math.floor(H * s) + 'px';
}
// iPhones report the new size a moment after rotating, so check again on several events and every half second.
window.addEventListener('resize', fitCanvas);
window.addEventListener('orientationchange', () => setTimeout(fitCanvas, 300));
if (window.visualViewport) window.visualViewport.addEventListener('resize', fitCanvas);
setInterval(fitCanvas, 500);

// Switch drawing (and the mouse) to a layer: the full canvas width, or the 960-wide stage centred in it.
function setLayer(wide) {
  W = wide ? CW : BASE_W;
  view.ox = (CW - W) / 2;
  ctx.setTransform(DPR, 0, 0, DPR, view.ox * DPR, 0);
  mouse.x = mouse.rx - view.ox;
  mouse.ux = mouse.urx - view.ox;
}

// ---------- Game state + scenes ----------
const game = { scene: null, sceneName: '', modal: null, save: null, t: 0, fade: 0, shake: 0, touch: false };
const SCENES = {};
function goTo(name, arg) {
  particles.length = 0;
  floaters.length = 0;
  game.modal = null;
  game.sceneName = name;
  game.scene = SCENES[name];
  game.fade = 1;
  stick.id = null;
  touchAction = touchFix = false;
  touchButtons.length = 0;
  if (game.scene.enter) game.scene.enter(arg || {});
  if (typeof Net !== 'undefined') Net.sendStatus();
}

// ---------- Math ----------
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const easeOut = t => 1 - Math.pow(1 - t, 3);
const R = (x, y, w, h) => ({ x, y, w, h });
function rectsOverlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
function inRect(px, py, r) { return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h; }
function seeded(seed) {
  let s = (Math.floor(seed) % 2147483647 + 2147483647) % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
function hexToRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function lerpColor(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], t))).join(',')})`;
}

// ---------- Keyboard ----------
const keys = {}, pressed = {};
window.addEventListener('keydown', e => {
  if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) return;
  if (!keys[e.code]) pressed[e.code] = true;
  keys[e.code] = true;
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
  Sfx.unlock();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

// ---------- Pointer (mouse + touch) ----------
// rx/ry = position on the full canvas; x/y = position in the current layer (see setLayer)
const mouse = { x: -1, y: -1, rx: -1, ry: -1, urx: 0, ux: 0, uy: 0, clicked: false, down: false, released: false };
const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
const STICK_ZONE = R(0, 300, 380, 300);
function toGame(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * CW / r.width, y: (e.clientY - r.top) * H / r.height };
}
function touchControlsOn() { return game.touch && game.scene && game.scene.stick && !game.modal; }
canvas.addEventListener('pointerdown', e => {
  if (e.pointerType === 'touch') game.touch = true;
  Sfx.unlock();
  const p = toGame(e);
  if (touchControlsOn() && stick.id === null && inRect(p.x, p.y, STICK_ZONE) && !touchButtonAt(p.x, p.y)) {
    stick.id = e.pointerId; stick.ox = p.x; stick.oy = p.y; stick.x = p.x; stick.y = p.y;
    return;
  }
  clickQueue.push({ t: 'down', ...p });   // replayed in order, one tap per frame, so quick taps aren't lost
  mouse.down = true;
  canvas.setPointerCapture(e.pointerId);
});
const clickQueue = [];
function beginInputFrame() {
  while (clickQueue.length) {
    const e = clickQueue[0];
    if (e.t === 'down') {
      if (mouse.clicked) break;
      clickQueue.shift();
      mouse.rx = e.x; mouse.y = mouse.ry = e.y; mouse.clicked = true;
    } else {
      clickQueue.shift();
      mouse.released = true; mouse.urx = e.x; mouse.uy = e.y;
      break;
    }
  }
}
canvas.addEventListener('pointermove', e => {
  const p = toGame(e);
  if (e.pointerId === stick.id) { stick.x = p.x; stick.y = p.y; return; }
  mouse.rx = p.x; mouse.y = mouse.ry = p.y;
  mouse.x = p.x - view.ox;
});
function pointerEnd(e) {
  if (e.pointerId === stick.id) { stick.id = null; return; }
  if (mouse.down) { mouse.down = false; clickQueue.push({ t: 'up', ...toGame(e) }); }
}
canvas.addEventListener('pointerup', pointerEnd);
canvas.addEventListener('pointercancel', pointerEnd);
document.addEventListener('gesturestart', e => e.preventDefault());

// Touch buttons drawn in the bottom-right corner (action, fix).
const touchButtons = [];
function touchButtonAt(x, y) { return touchButtons.some(b => Math.hypot(x - b.x, y - b.y) < b.r); }

function endInputFrame() {
  for (const k in pressed) delete pressed[k];
  mouse.clicked = false;
  mouse.released = false;
}

function moveAxis() {
  let x = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  let y = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  if (stick.id !== null) {
    const dx = stick.x - stick.ox, dy = stick.y - stick.oy, d = Math.hypot(dx, dy);
    if (d > 8) { const k = Math.min(1, d / 55) / d; x = dx * k; y = dy * k; }
  }
  return { x, y };
}
let touchAction = false, touchFix = false;
function actionPressed() { return !!(pressed.Space || pressed.Enter || touchAction); }
function fixPressed() { return !!(pressed.KeyR || touchFix); }

function drawTouchControls(opts = {}) {
  touchButtons.length = 0;
  touchAction = touchFix = false;
  if (!game.touch || game.modal) return;
  // drawn on the full canvas (not the stage) so they sit in the real screen corners
  ctx.save();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  // joystick
  const bx = stick.id !== null ? stick.ox : 110, by = stick.id !== null ? stick.oy : 490;
  ctx.globalAlpha = stick.id !== null ? 0.55 : 0.3;
  ctx.fillStyle = '#ffffff'; circle(bx, by, 60);
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = '#ffbf1f';
  const a = moveAxis();
  circle(bx + a.x * 40, by + a.y * 40, 28);
  ctx.globalAlpha = 1;
  const btns = [];
  if (opts.action) btns.push({ id: 'action', label: opts.action, x: CW - 90, y: 500, r: 52, color: '#7bdc6b' });
  if (opts.fix) btns.push({ id: 'fix', label: '🔧', x: opts.action ? CW - 200 : CW - 90, y: 520, r: 42, color: '#ffbf1f' });
  for (const b of btns) {
    touchButtons.push(b);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = b.color; circle(b.x, b.y, b.r);
    ctx.globalAlpha = 1;
    text(b.label, b.x, b.y + 2, { size: b.label.length > 2 ? 18 : 30, color: '#1a1a1a' });
    if (mouse.clicked && !ui.consumed && Math.hypot(mouse.rx - b.x, mouse.ry - b.y) < b.r) {
      ui.consumed = true;
      if (b.id === 'action') touchAction = true; else touchFix = true;
    }
  }
  ctx.restore();
}

// ---------- Drawing helpers ----------
function rr(x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}
function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2); ctx.fill(); }
function ellipse(x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), 0, 0, Math.PI * 2); ctx.fill(); }
function tri(a, b, c, d, e, f) { ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.lineTo(e, f); ctx.closePath(); ctx.fill(); }
function star(x, y, Ro, Ri, n) {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + i * Math.PI / n, rad = i % 2 ? Ri : Ro;
    ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath(); ctx.fill();
}
function text(str, x, y, o = {}) {
  ctx.font = `${o.bold === false ? '' : 'bold '}${o.size || 18}px ${FONT}`;
  ctx.textAlign = o.align || 'center';
  ctx.textBaseline = o.base || 'middle';
  if (o.stroke) { ctx.lineJoin = 'round'; ctx.lineWidth = o.strokeW || 5; ctx.strokeStyle = o.stroke; ctx.strokeText(str, x, y); }
  ctx.fillStyle = o.color || '#fff';
  ctx.fillText(str, x, y);
}
function wrapText(str, x, y, maxW, lineH, o = {}) {
  ctx.font = `bold ${o.size || 18}px ${FONT}`;
  const lines = [];
  let line = '';
  for (const w of str.split(' ')) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
  }
  if (line) lines.push(line);
  lines.forEach((l, i) => text(l, x, y + i * lineH, o));
  return lines.length;
}
function panel(x, y, w, h, o = {}) {
  rr(x, y, w, h, o.r || 18);
  ctx.fillStyle = o.fill || 'rgba(20,24,52,.95)'; ctx.fill();
  ctx.lineWidth = 4; ctx.strokeStyle = o.stroke || '#ffbf1f'; ctx.stroke();
}

// ---------- Tap-button UI (immediate mode) ----------
const ui = { locked: false, consumed: false };
function hovering(x, y, w, h) { return mouse.x >= x && mouse.x <= x + w && mouse.y >= y && mouse.y <= y + h; }
function clickIn(x, y, w, h) {
  if (ui.locked || ui.consumed || !mouse.clicked || !hovering(x, y, w, h)) return false;
  ui.consumed = true;
  return true;
}
function button(label, x, y, w, h, o = {}) {
  const enabled = o.enabled !== false;
  const hot = enabled && !ui.locked && !game.touch && hovering(x, y, w, h);
  const dy = hot ? -2 : 0;
  rr(x, y + dy, w, h, o.r ?? 12);
  ctx.fillStyle = !enabled ? '#4a4f66' : hot ? (o.hot || '#ffe066') : (o.color || '#ffbf1f');
  ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.stroke();
  text(label, x + w / 2, y + h / 2 + 1 + dy, { size: o.size || 18, color: enabled ? (o.textColor || '#2a1800') : '#8d93ab' });
  if (enabled && clickIn(x, y, w, h)) { Sfx.click(); return true; }
  return false;
}

// ---------- Effects: toasts, floating text, particles ----------
const toasts = [];
function toast(msg, color = '#fff') {
  const same = toasts.find(t => t.msg === msg);
  if (same) { same.t = 3.2; return; }
  toasts.push({ msg, color, t: 3.2 });
  if (toasts.length > 3) toasts.shift();
}
function drawToasts(dt) {
  toasts.forEach((tt, i) => {
    tt.t -= dt;
    ctx.globalAlpha = clamp(tt.t / 0.4, 0, 1);
    ctx.font = `bold 18px ${FONT}`;
    const w = ctx.measureText(tt.msg).width + 36, y = H - 70 - (toasts.length - 1 - i) * 42;  // bottom-middle, newest lowest
    rr(W / 2 - w / 2, y - 17, w, 34, 17);
    ctx.fillStyle = 'rgba(10,12,30,.85)'; ctx.fill();
    text(tt.msg, W / 2, y, { size: 18, color: tt.color });
  });
  ctx.globalAlpha = 1;
  for (let i = toasts.length - 1; i >= 0; i--) if (toasts[i].t <= 0) toasts.splice(i, 1);
}
const floaters = [];
function floatText(str, x, y, color = '#fff') { floaters.push({ str, x, y, color, t: 1.3 }); }
function drawFloaters(dt) {
  for (const f of floaters) {
    f.t -= dt; f.y -= 40 * dt;
    ctx.globalAlpha = clamp(f.t / 0.5, 0, 1);
    text(f.str, f.x, f.y, { size: 20, color: f.color, stroke: '#000', strokeW: 4 });
  }
  ctx.globalAlpha = 1;
  for (let i = floaters.length - 1; i >= 0; i--) if (floaters[i].t <= 0) floaters.splice(i, 1);
}
const particles = [];
function burst(x, y, n, colors, o = {}) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, Math.PI * 2), sp = rand(0.3, 1) * (o.speed || 150), life = rand(0.5, 1) * (o.life || 0.9);
    particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.up || 0), life, max: life,
      size: rand(3, 6) * (o.size || 1), color: pick(colors), g: o.g ?? 250 });
  }
}
function updateParticles(dt) {
  for (const p of particles) {
    p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt;
    if (p.smoke) p.vx *= 0.97;
  }
  for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1);
}
function drawParticles() {
  for (const p of particles) {
    const k = p.life / p.max;
    ctx.fillStyle = p.color;
    if (p.smoke) { ctx.globalAlpha = k * 0.6; circle(p.x, p.y, p.size * (1 + (1 - k) * 2)); }
    else { ctx.globalAlpha = clamp(k * 1.5, 0, 1); ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
  }
  ctx.globalAlpha = 1;
}

// ---------- Sound (tiny WebAudio beeps) ----------
const Sfx = {
  ac: null, muted: false,
  unlock() {
    try {
      if (!this.ac) this.ac = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ac.state === 'suspended') this.ac.resume();
    } catch (e) { /* no audio */ }
  },
  tone(f, dur, type = 'square', vol = 0.07, f2 = null, delay = 0) {
    if (this.muted || !this.ac) return;
    const t0 = this.ac.currentTime + delay;
    const o = this.ac.createOscillator(), g = this.ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.ac.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  },
  noise(dur, vol = 0.2, filt = 800, delay = 0) {
    if (this.muted || !this.ac) return;
    const len = Math.floor(this.ac.sampleRate * dur), buf = this.ac.createBuffer(1, len, this.ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = this.ac.createBufferSource(); s.buffer = buf;
    const f = this.ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filt;
    const g = this.ac.createGain(); g.gain.value = vol;
    s.connect(f).connect(g).connect(this.ac.destination); s.start(this.ac.currentTime + delay);
  },
  click() { this.tone(660, 0.06, 'square', 0.04); },
  coin() { this.tone(988, 0.07, 'square', 0.05); this.tone(1319, 0.12, 'square', 0.05, null, 0.07); },
  mine() { this.noise(0.12, 0.25, 1200); this.tone(220, 0.08, 'triangle', 0.08); },
  craft() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.12, 'square', 0.045, null, i * 0.07)); },
  place() { this.tone(330, 0.07, 'triangle', 0.1); },
  hit() { this.noise(0.3, 0.35, 500); this.tone(180, 0.25, 'sawtooth', 0.07, 60); },
  boom() { this.noise(1.4, 0.6, 400); this.tone(120, 1, 'sawtooth', 0.1, 30); },
  launch() { this.noise(3.5, 0.35, 300); },
  beep() { this.tone(880, 0.15, 'sine', 0.1); },
  go() { this.tone(1320, 0.4, 'sine', 0.1); },
  bounce() { this.tone(500, 0.15, 'sine', 0.08, 900); },
  win() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.2, 'square', 0.05, null, i * 0.13)); },
  fix() { this.tone(400, 0.08, 'square', 0.05); this.tone(800, 0.12, 'square', 0.05, null, 0.08); },
  whoosh() { this.noise(0.6, 0.2, 2000); },
};

// ---------- Saving ----------
const store = gameStorage('rocket');
function saveGame() { store.save('save', game.save); }
function loadSave() {
  try {
    const s = store.load('save');
    if (s && s.inv && s.design) {
      const base = newSave();
      return Object.assign(base, s, { inv: Object.assign(base.inv, s.inv), parts: Object.assign(base.parts, s.parts) });
    }
  } catch (e) { /* ignore */ }
  return null;
}

export { BASE_W, CW, DPR, FONT, H, R, SCENES, STICK_ZONE, Sfx, W, actionPressed, beginInputFrame, burst, button, canvas, circle, clamp, clickIn, clickQueue, ctx, drawFloaters, drawParticles, drawToasts, drawTouchControls, easeOut, ellipse, endInputFrame, fitCanvas, fitKey, fixPressed, floatText, floaters, game, goTo, hexToRgb, hovering, inRect, keys, lerp, lerpColor, loadSave, mouse, moveAxis, panel, particles, pick, pointerEnd, pressed, rand, rectsOverlap, rr, saveGame, seeded, setLayer, star, stick, store, text, toGame, toast, toasts, touchAction, touchButtonAt, touchButtons, touchControlsOn, touchFix, tri, ui, updateParticles, view, wrapText };
