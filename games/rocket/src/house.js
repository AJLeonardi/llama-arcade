import { CW, H, R, Sfx, W, burst, circle, clickIn, ctx, drawTouchControls, ellipse, floatText, game, goTo, moveAxis, rand, rectsOverlap, rr, text, toast, view } from './core.js';
import { INV_ITEMS } from './data.js';
import { drawLlama, drawToken } from './art.js';
import { Net } from './net.js';
/* The house: walk around, collect tokens, and find the Rocket Bay door next to the stove. */

function footRect(x, y) { return R(x - 13, y - 8, 26, 10); }
function makeWalker(x, y) { return { x, y, face: 1, moving: false, t: 0 }; }
function moveWalker(w, dt, solids, bounds, speed = 220) {
  const a = moveAxis();
  const len = Math.hypot(a.x, a.y);
  w.moving = len > 0.1;
  if (!w.moving) return;
  const k = Math.min(1, len) / len;
  if (Math.abs(a.x) > 0.1) w.face = a.x > 0 ? 1 : -1;
  w.t += dt;
  const nx = w.x + a.x * k * speed * dt;
  if (nx > bounds.x && nx < bounds.x + bounds.w && !solids.some(s => rectsOverlap(footRect(nx, w.y), s))) w.x = nx;
  const ny = w.y + a.y * k * speed * dt;
  if (ny > bounds.y && ny < bounds.y + bounds.h && !solids.some(s => rectsOverlap(footRect(w.x, ny), s))) w.y = ny;
}
function drawMe(w) { drawLlama(w.x, w.y, { face: w.face, t: w.t, moving: w.moving, scarf: Net.myScarf() }); }

function drawInventoryBar(title) {
  const inv = game.save.inv;
  ctx.fillStyle = 'rgba(8,10,28,.88)'; ctx.fillRect(-view.ox, 0, CW, 50);
  ctx.fillStyle = 'rgba(255,191,31,.6)'; ctx.fillRect(-view.ox, 50, CW, 2);
  let x = 14;
  for (const m of INV_ITEMS) {
    text(m.icon, x + 14, 26, { size: 24 });
    text(String(inv[m.id]), x + 32, 27, { size: 20, align: 'left', color: m.color });
    x += 98;
  }
  const fr = Net.friendLabel();
  if (fr) text(fr, x + 10, 27, { size: 14, align: 'left', color: '#9fd3ff' });
  if (title) text(title, W - 16, 27, { size: 18, align: 'right', color: '#ffe066' });
}

const House = {
  stick: true,
  bg: '#1c1626',
  walls: [
    R(20, 70, 920, 12), R(20, 573, 920, 12), R(20, 70, 12, 515), R(928, 70, 12, 515),
    R(354, 70, 12, 120), R(354, 250, 12, 56),
    R(20, 294, 110, 12), R(220, 294, 146, 12),
    R(554, 70, 12, 270), R(554, 440, 12, 145),
  ],
  furniture: [
    { kind: 'rug', ...R(60, 330, 260, 80), solid: false },
    { kind: 'bed', ...R(46, 96, 72, 112), color: '#ff8a1f' },
    { kind: 'bed', ...R(140, 96, 72, 112), color: '#2ad0ff' },
    { kind: 'toybox', ...R(284, 100, 56, 40) },
    { kind: 'tv', ...R(400, 88, 120, 30) },
    { kind: 'beanbag', ...R(395, 175, 50, 40), solid: false, color: '#ff5a8a' },
    { kind: 'beanbag', ...R(475, 175, 50, 40), solid: false, color: '#5ad1ff' },
    { kind: 'couch', ...R(70, 505, 230, 54) },
    { kind: 'coffee', ...R(130, 420, 110, 44) },
    { kind: 'plant', ...R(500, 520, 40, 40) },
    { kind: 'fridge', ...R(578, 88, 52, 66) },
    { kind: 'counter', ...R(630, 88, 150, 46) },
    { kind: 'stove', ...R(780, 88, 64, 52) },
    { kind: 'chair', ...R(670, 352, 18, 36), solid: false },
    { kind: 'chair', ...R(822, 352, 18, 36), solid: false },
    { kind: 'table', ...R(690, 330, 130, 80) },
  ],
  door: R(852, 84, 70, 60),

  enter(arg) {
    this.solids = this.walls.concat(this.furniture.filter(f => f.solid !== false));
    this.me = arg.from === 'bay' ? makeWalker(887, 205) : makeWalker(400, 420);
    this.tokens = [];
    this.spawnT = 0;
    for (let i = 0; i < 4; i++) this.spawnToken();
    if (arg.from !== 'bay') toast('Find the ROCKET BAY door in the kitchen, next to the stove!', '#ffe066');
  },
  spawnToken() {
    for (let i = 0; i < 25; i++) {
      const x = rand(50, 910), y = rand(110, 560), box = R(x - 14, y - 14, 28, 28);
      if (this.solids.some(s => rectsOverlap(box, s)) || rectsOverlap(box, this.door)) continue;
      this.tokens.push({ x, y, b: rand(0, 6) });
      return;
    }
  },
  update(dt) {
    const w = this.me;
    moveWalker(w, dt, this.solids, R(30, 80, 900, 500));
    if (rectsOverlap(footRect(w.x, w.y), this.door)) { Sfx.whoosh(); goTo('bay', { from: 'house' }); return; }
    Net.sendPos({ scene: 'house', x: w.x, y: w.y, face: w.face, moving: w.moving });
    this.spawnT -= dt;
    if (this.spawnT <= 0 && this.tokens.length < 6) { this.spawnT = 2.5; this.spawnToken(); }
    for (let i = this.tokens.length - 1; i >= 0; i--) {
      const tk = this.tokens[i];
      tk.b += dt * 3;
      if (Math.hypot(w.x - tk.x, w.y - 15 - tk.y) < 28) {
        this.tokens.splice(i, 1);
        game.save.inv.tokens++;
        Sfx.coin();
        floatText('+1 🎟️', tk.x, tk.y - 20, '#ff6fb5');
        burst(tk.x, tk.y, 10, ['#ff6fb5', '#fff']);
      }
    }
  },
  draw() {
    const t = game.t;
    ctx.fillStyle = '#1c1626'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#b07a48'; ctx.fillRect(20, 70, 920, 515);
    ctx.fillStyle = '#5b76d1'; ctx.fillRect(32, 82, 322, 212);
    ctx.fillStyle = '#8a69c9'; ctx.fillRect(366, 82, 188, 224);
    ctx.fillStyle = '#c48a55'; ctx.fillRect(32, 306, 522, 267);
    ctx.strokeStyle = 'rgba(90,50,20,.25)'; ctx.lineWidth = 2;
    for (let y = 328; y < 573; y += 22) { ctx.beginPath(); ctx.moveTo(32, y); ctx.lineTo(554, y); ctx.stroke(); }
    ctx.save();
    ctx.beginPath(); ctx.rect(566, 82, 362, 491); ctx.clip();
    for (let x = 566; x < 928; x += 30) for (let y = 82; y < 573; y += 30) {
      ctx.fillStyle = ((x - 566) / 30 + (y - 82) / 30) % 2 ? '#e2d6bf' : '#f3ebdb';
      ctx.fillRect(x, y, 30, 30);
    }
    ctx.restore();
    const lab = { size: 15, color: 'rgba(255,255,255,.55)' };
    text('Bedroom', 270, 270, lab); text('Game Room', 460, 240, lab); text('Living Room', 440, 330, lab);
    text('Kitchen', 740, 540, { ...lab, color: 'rgba(80,60,40,.5)' });
    for (const f of this.furniture) drawFurniture(f, t);
    ctx.fillStyle = '#4b3b63';
    for (const wl of this.walls) ctx.fillRect(wl.x, wl.y, wl.w, wl.h);
    ctx.fillStyle = '#6a5688';
    for (const wl of this.walls) ctx.fillRect(wl.x, wl.y, wl.w, 3);
    this.drawDoor(t);
    for (const tk of this.tokens) drawToken(tk.x, tk.y + Math.sin(tk.b) * 3, 11);
    const f = Net.friend, fHere = Net.connected && f && f.scene === 'house' && f.x != null;
    const friend = () => drawLlama(f.x, f.y, { face: f.face, moving: f.moving, t: game.t, scarf: Net.friendScarf(), label: Net.friendName() });
    if (fHere && f.y < this.me.y) friend();
    drawMe(this.me);
    if (fHere && f.y >= this.me.y) friend();
    drawInventoryBar('🏠 Home');
    drawTouchControls();
    if (clickIn(this.door.x, this.door.y, this.door.w, this.door.h)) goTo('bay', { from: 'house' });
  },
  drawDoor(t) {
    const d = this.door, pulse = 0.5 + Math.sin(t * 4) * 0.5, cx = d.x + d.w / 2;
    ctx.save();
    ctx.shadowColor = '#ffbf1f'; ctx.shadowBlur = 15 + pulse * 25;
    ctx.fillStyle = '#ffbf1f'; rr(d.x, d.y, d.w, d.h, 6); ctx.fill();
    ctx.restore();
    ctx.save();
    rr(d.x, d.y, d.w, d.h, 6); ctx.clip();
    ctx.fillStyle = '#222';
    for (let i = -6; i < 14; i += 2) {
      ctx.beginPath();
      ctx.moveTo(d.x + i * 10, d.y); ctx.lineTo(d.x + i * 10 + 10, d.y);
      ctx.lineTo(d.x + i * 10 + 10 - d.h, d.y + d.h); ctx.lineTo(d.x + i * 10 - d.h, d.y + d.h);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = '#6d7a8c'; rr(d.x + 7, d.y + 7, d.w - 14, d.h - 14, 4); ctx.fill();
    text('🚀', cx, d.y + d.h / 2 + 1, { size: 24 });
    text('ROCKET BAY', cx, d.y + d.h + 14, { size: 13, color: '#ffe066', stroke: '#000', strokeW: 4 });
    text('▲', cx, d.y + d.h + 36 + pulse * 6, { size: 22, color: '#ffe066', stroke: '#000', strokeW: 4 });
  },
};

function drawFurniture(f, t) {
  const { x, y, w, h } = f;
  ctx.lineWidth = 2;
  switch (f.kind) {
    case 'rug':
      ctx.fillStyle = '#e8735a'; rr(x, y, w, h, 20); ctx.fill();
      ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 4; rr(x + 8, y + 8, w - 16, h - 16, 14); ctx.stroke();
      break;
    case 'bed':
      ctx.fillStyle = '#8b5a2b'; rr(x, y, w, h, 8); ctx.fill();
      ctx.fillStyle = '#fff'; rr(x + 8, y + 6, w - 16, 22, 6); ctx.fill();
      ctx.fillStyle = f.color; rr(x + 4, y + 34, w - 8, h - 40, 6); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(x + 4, y + 50, w - 8, 6);
      break;
    case 'toybox':
      ctx.fillStyle = '#e85d5d'; rr(x, y, w, h, 6); ctx.fill();
      ctx.fillStyle = '#ffd23f'; ctx.fillRect(x, y + 10, w, 5);
      text('🧸', x + w / 2, y + h / 2 + 6, { size: 18 });
      break;
    case 'tv':
      ctx.fillStyle = '#222'; rr(x, y, w, h, 4); ctx.fill();
      ctx.fillStyle = `hsl(${(t * 60) % 360},80%,60%)`; ctx.fillRect(x + 6, y + 4, w - 12, h - 8);
      text('🎮', x + w / 2, y + h / 2 + 1, { size: 16 });
      break;
    case 'beanbag':
      ctx.fillStyle = f.color; ellipse(x + w / 2, y + h / 2, w / 2, h / 2);
      ctx.fillStyle = 'rgba(255,255,255,.25)'; ellipse(x + w / 2 - 6, y + h / 2 - 6, w / 4, h / 5);
      break;
    case 'couch':
      ctx.fillStyle = '#2f6b4a'; rr(x, y, w, h, 12); ctx.fill();
      ctx.fillStyle = '#3f8a60';
      for (let i = 0; i < 3; i++) { rr(x + 10 + i * ((w - 20) / 3), y + 8, (w - 20) / 3 - 6, h - 20, 8); ctx.fill(); }
      break;
    case 'coffee':
      ctx.fillStyle = '#7a4a25'; rr(x, y, w, h, 8); ctx.fill();
      ctx.fillStyle = '#9a6235'; rr(x + 5, y + 5, w - 10, h - 10, 6); ctx.fill();
      text('📚', x + 30, y + h / 2, { size: 16 }); text('🍪', x + 80, y + h / 2, { size: 16 });
      break;
    case 'plant':
      ctx.fillStyle = '#b5651d'; rr(x + 8, y + 16, w - 16, h - 16, 4); ctx.fill();
      ctx.fillStyle = '#3fae4a'; circle(x + w / 2, y + 12, 14); circle(x + w / 2 - 10, y + 20, 10); circle(x + w / 2 + 10, y + 20, 10);
      break;
    case 'fridge':
      ctx.fillStyle = '#e8eef5'; rr(x, y, w, h, 6); ctx.fill();
      ctx.strokeStyle = '#9aa7b5'; ctx.beginPath(); ctx.moveTo(x, y + 24); ctx.lineTo(x + w, y + 24); ctx.stroke();
      ctx.fillStyle = '#9aa7b5'; ctx.fillRect(x + w - 10, y + 8, 3, 12); ctx.fillRect(x + w - 10, y + 32, 3, 20);
      break;
    case 'counter':
      ctx.fillStyle = '#b07a4a'; rr(x, y, w, h, 4); ctx.fill();
      ctx.fillStyle = '#e0e0e0'; ctx.fillRect(x, y, w, 10);
      ctx.fillStyle = '#9fb3c8'; rr(x + 50, y + 14, 48, 26, 6); ctx.fill();
      break;
    case 'stove':
      ctx.fillStyle = '#3d3d44'; rr(x, y, w, h, 4); ctx.fill();
      [[16, 14], [48, 14], [16, 36], [48, 36]].forEach(([a, b], i) => {
        ctx.fillStyle = i === 1 ? `rgba(255,${90 + Math.sin(t * 4) * 40},0,.95)` : '#222';
        circle(x + a, y + b, 9);
      });
      break;
    case 'chair':
      ctx.fillStyle = '#8a5a30'; rr(x, y, w, h, 4); ctx.fill();
      break;
    case 'table':
      ctx.fillStyle = '#a0683a'; rr(x, y, w, h, 10); ctx.fill();
      text('🍎', x + w / 2, y + h / 2, { size: 22 });
      break;
  }
}

export { House, drawFurniture, drawInventoryBar, drawMe, footRect, makeWalker, moveWalker };
