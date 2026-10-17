import { H, R, Sfx, W, actionPressed, burst, button, circle, clickIn, ctx, drawTouchControls, ellipse, floatText, game, goTo, panel, rand, rectsOverlap, rr, text, toast } from './core.js';
import { MATS, MAT_BY_ID, PARTS, PART_ORDER, addPart, canAfford, partCount, pay, randomMaterial } from './data.js';
import { designBounds, drawRocketDesign } from './art.js';
import { drawInventoryBar, drawMe, footRect, makeWalker, moveWalker } from './house.js';
/* The Rocket Bay: mine rocks, make parts at the workbench, build the rocket and launch. */

const Bay = {
  stick: true,
  bg: '#3a4157',
  st: {
    mine:  { r: R(110, 150, 160, 84), label: '⛏️ Mine Rocks' },
    bench: { r: R(330, 150, 170, 80), label: '🔧 Workbench' },
    build: { r: R(400, 420, 130, 70), label: '🚀 Build & Launch' },
    door:  { r: R(24, 470, 76, 104), label: '🏠 House' },
  },
  pad: R(575, 492, 340, 46),
  rocketX: 745,

  enter(arg) {
    this.me = arg.from === 'space' ? makeWalker(480, 560) : makeWalker(160, 540);
    this.cool = 0;
    this.mineShake = 0;
    this.solids = [this.st.mine.r, this.st.bench.r, this.st.build.r, this.pad];
    if (!game.save.seenBay) {
      game.save.seenBay = true;
      toast('Welcome to the ROCKET BAY! 🚀', '#ffe066');
      toast('Mine rocks ⛏️, make parts 🔧, then build your rocket!', '#fff');
    }
  },
  nearStation(w) {
    const f = footRect(w.x, w.y);
    for (const k of ['mine', 'bench', 'build']) {
      const r = this.st[k].r;
      if (rectsOverlap(f, R(r.x - 30, r.y - 30, r.w + 60, r.h + 60))) return k;
    }
    return null;
  },
  update(dt) {
    this.mineShake = Math.max(0, this.mineShake - dt);
    this.cool -= dt;
    const w = this.me;
    moveWalker(w, dt, this.solids, R(30, 125, 900, 465));
    if (rectsOverlap(footRect(w.x, w.y), this.st.door.r)) { goTo('house', { from: 'bay' }); return; }
    w.near = this.nearStation(w);
    if (w.near && actionPressed()) this.use(w.near);
  },
  use(key) {
    if (key === 'mine') this.mine();
    else if (key === 'bench') game.modal = Workbench;
    else if (key === 'build') goTo('builder');
    else if (key === 'door') goTo('house', { from: 'bay' });
  },
  mine() {
    if (this.cool > 0) return;
    this.cool = 0.18;
    const m = randomMaterial();
    game.save.inv[m]++;
    const r = this.st.mine.r, cx = r.x + r.w / 2 + rand(-35, 35), cy = r.y + 30;
    floatText('+1 ' + MAT_BY_ID[m].icon, cx, cy - 20, MAT_BY_ID[m].color);
    burst(cx, cy + 10, 8, ['#9b9b9b', '#777', MAT_BY_ID[m].color], { speed: 160, up: 120 });
    this.mineShake = 0.15;
    Sfx.mine();
    if (m === 'diamond') { Sfx.coin(); toast('WOW! A diamond! 💎', '#6ff0ff'); }
  },
  draw() {
    const t = game.t;
    ctx.fillStyle = '#3a4157'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 2;
    for (let x = 0; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 118); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 118; y < H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    // back wall with windows
    ctx.fillStyle = '#262c40'; ctx.fillRect(0, 52, W, 66);
    for (let i = 0; i < 4; i++) {
      const g = ctx.createLinearGradient(0, 62, 0, 108);
      g.addColorStop(0, '#5fb8ff'); g.addColorStop(1, '#bfe6ff');
      ctx.fillStyle = g; rr(40 + i * 125, 62, 100, 44, 6); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.8)'; ellipse(70 + i * 125 + Math.sin(t * 0.3 + i) * 15, 80, 16, 6);
    }
    text('LLAMA ROCKET BAY', this.rocketX, 85, { size: 26, color: '#ffe066', stroke: '#000', strokeW: 6 });
    ctx.fillStyle = '#ffbf1f'; ctx.fillRect(0, 116, W, 4);
    // launch pad + tower
    ctx.fillStyle = '#4a5268'; ellipse(this.rocketX, 515, 170, 28);
    ctx.strokeStyle = '#ffbf1f'; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(this.rocketX, 515, 150, 22, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#8a92a8'; ctx.lineWidth = 4;
    for (const tx of [890, 920]) { ctx.beginPath(); ctx.moveTo(tx, 140); ctx.lineTo(tx, 510); ctx.stroke(); }
    for (let y = 150; y < 510; y += 30) { ctx.beginPath(); ctx.moveTo(890, y); ctx.lineTo(920, y + 30); ctx.stroke(); }
    // stations
    for (const k in this.st) this.drawStation(k, t);
    // the rocket on the pad (depth-sorted with the llama)
    const d = game.save.design, hasRocket = !!designBounds(d.cells);
    const drawRocketOnPad = () => {
      if (hasRocket) drawRocketDesign(d, this.rocketX, 510, { s: 30 });
      else {
        ctx.setLineDash([8, 8]); ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 3;
        rr(this.rocketX - 60, 250, 120, 250, 20); ctx.stroke(); ctx.setLineDash([]);
        text('Your rocket', this.rocketX, 360, { size: 18, color: 'rgba(255,255,255,.6)' });
        text('goes here!', this.rocketX, 385, { size: 18, color: 'rgba(255,255,255,.6)' });
      }
    };
    if (this.me.y < 510) { drawMe(this.me); drawRocketOnPad(); } else { drawRocketOnPad(); drawMe(this.me); }
    // prompt over the station you're next to
    const near = this.me.near;
    if (near) {
      const r = this.st[near].r;
      const label = game.touch ? 'Tap ✋' : 'Press SPACE';
      rr(r.x + r.w / 2 - 55, r.y + r.h + 6, 110, 26, 13); ctx.fillStyle = '#ffe066'; ctx.fill();
      text(label, r.x + r.w / 2, r.y + r.h + 20, { size: 14, color: '#2a1800' });
    }
    drawInventoryBar('🚀 Rocket Bay');
    if (!game.touch) text('Walk with W A S D or arrows · SPACE to use · or just click things!', W / 2, H - 12, { size: 13, color: 'rgba(255,255,255,.6)' });
    drawTouchControls({ action: near ? '✋' : null });
    // tap / click on things
    for (const k in this.st) { const r = this.st[k].r; if (clickIn(r.x, r.y - 20, r.w, r.h + 20)) this.use(k); }
    if (clickIn(this.rocketX - 90, 200, 180, 300)) goTo('builder');
  },
  drawStation(key, t) {
    const r = this.st[key].r;
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.35)';
    if (key === 'mine') {
      const sh = this.mineShake > 0 ? rand(-3, 3) : 0;
      ctx.fillStyle = '#6f6f78';
      [[40, 58, 36], [92, 52, 42], [134, 62, 28], [70, 26, 30], [112, 22, 24]].forEach(([a, b, c]) => circle(r.x + a + sh, r.y + b, c));
      ctx.fillStyle = '#8b8b95';
      [[34, 48, 14], [88, 38, 16], [70, 18, 10]].forEach(([a, b, c]) => circle(r.x + a + sh, r.y + b, c));
      ctx.fillStyle = '#ffc928'; [[50, 60], [120, 50], [80, 30]].forEach(([a, b]) => circle(r.x + a + sh, r.y + b, 4));
      ctx.fillStyle = '#6ff0ff'; [[100, 70], [64, 44]].forEach(([a, b]) => circle(r.x + a + sh, r.y + b, 3.5));
      text('⛏️', r.x + r.w - 10, r.y + 10, { size: 28 });
    } else if (key === 'bench') {
      ctx.fillStyle = '#5c3a1d'; ctx.fillRect(r.x + 12, r.y + 48, 12, 32); ctx.fillRect(r.x + r.w - 24, r.y + 48, 12, 32);
      ctx.fillStyle = '#8b5a2b'; rr(r.x, r.y + 22, r.w, 30, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#3f6fd6'; ctx.fillRect(r.x + 60, r.y + 26, 54, 22);
      text('🔧', r.x + 30, r.y + 22, { size: 24 }); text('🔨', r.x + 140, r.y + 22, { size: 24 });
    } else if (key === 'build') {
      ctx.fillStyle = '#39415a'; rr(r.x, r.y + 10, r.w, r.h - 10, 10); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#1c2a20'; rr(r.x + 12, r.y + 18, 60, 30, 4); ctx.fill();
      ctx.fillStyle = '#5bd65b'; text('READY', r.x + 42, r.y + 34, { size: 12, color: '#5bd65b' });
      ctx.fillStyle = `rgba(255,40,40,${0.7 + Math.sin(t * 5) * 0.3})`; circle(r.x + 100, r.y + 36, 16);
    } else if (key === 'door') {
      ctx.fillStyle = '#8b5a2b'; rr(r.x, r.y, r.w, r.h, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#a06a3a'; rr(r.x + 8, r.y + 8, r.w - 16, r.h - 16, 4); ctx.fill();
      ctx.fillStyle = '#ffd23f'; circle(r.x + r.w - 16, r.y + r.h / 2, 5);
    }
    text(this.st[key].label, r.x + r.w / 2, r.y - 12, { size: 16, stroke: '#000', strokeW: 4 });
  },
};

// ---------- Workbench: turn materials into parts ----------
function drawCost(cost, x, y) {
  for (const [id, n] of Object.entries(cost)) {
    text(MAT_BY_ID[id].icon, x, y, { size: 18 });
    text(String(n), x + 14, y + 1, { size: 16, align: 'left', color: game.save.inv[id] >= n ? '#fff' : '#ff7a7a' });
    x += 48;
  }
}
const Workbench = {
  draw() {
    panel(130, 40, 700, 530);
    text('🔧 WORKBENCH', 480, 74, { size: 28, color: '#ffe066' });
    if (button('✖', 774, 54, 42, 38, { color: '#ff6b6b', size: 20 })) { game.modal = null; return; }
    let ix = 190;
    for (const m of MATS) {
      text(m.icon, ix, 112, { size: 20 });
      text(String(game.save.inv[m.id]), ix + 16, 113, { size: 18, align: 'left', color: m.color });
      ix += 110;
    }
    PART_ORDER.forEach((k, i) => {
      const p = PARTS[k], y = 136 + i * 52;
      rr(150, y, 660, 46, 10); ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.fill();
      text(p.icon, 180, y + 23, { size: 24 });
      text(p.name, 206, y + 15, { size: 17, align: 'left' });
      text(p.desc, 206, y + 34, { size: 12, align: 'left', color: '#aab4d4', bold: false });
      drawCost(p.cost, 470, y + 23);
      text(`You have ${partCount(k)}`, 640, y + 23, { size: 14, color: '#ffe9c7' });
      if (button('Make', 712, y + 7, 84, 32, { size: 16, enabled: canAfford(p.cost), color: '#7bdc6b', hot: '#a4f294' })) {
        pay(p.cost); addPart(k, 1); Sfx.craft();
        burst(754, y + 23, 14, ['#ffe066', '#fff', '#7bdc6b']);
        floatText(`+1 ${p.name}`, 754, y + 6, '#7bdc6b');
      }
    });
  },
};

export { Bay, Workbench, drawCost };
