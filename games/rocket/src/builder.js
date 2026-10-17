import { H, Sfx, W, button, clamp, ctx, game, goTo, keys, mouse, panel, rr, text, toast, ui } from './core.js';
import { ENGINE_NAMES, GRID_H, GRID_W, PARTS, PART_ORDER, PLANETS, ROCKET_COLORS, addPart, isEngine, partCount } from './data.js';
import { cellKey, designBounds, drawPart, parseKey } from './art.js';
import { drawInventoryBar } from './house.js';
import { Coop, flightSpeed } from './coop.js';
/* Rocket Builder: put parts anywhere on a grid. analyzeRocket() decides if it flies, wobbles... or goes BOOM. */

// Looks at a design and returns { boom: 'reason' | null, warnings, stats... }.
function analyzeRocket(design) {
  const cells = design.cells, keys = Object.keys(cells);
  const out = { boom: null, warnings: [], tier: 0, thrust: 0, weight: 0, speed: 0, steer: 0, wingsL: 0, wingsR: 0, wobble: 1 };
  if (!keys.length) { out.boom = 'There was no rocket! Put some parts on the grid.'; return out; }
  let comX = 0;
  for (const k of keys) {
    const t = cells[k], { c } = parseKey(k);
    out.weight += PARTS[t].weight;
    comX += c * PARTS[t].weight;
    if (isEngine(t)) { out.thrust += PARTS[t].thrust; out.tier = Math.max(out.tier, PARTS[t].tier); }
    if (t === 'thruster') out.steer++;
  }
  comX /= out.weight;
  // the middle of the rocket = average column of the tube parts (or everything if there are none)
  const core = keys.filter(k => ['body', 'cockpit', 'nose'].includes(cells[k]) || isEngine(cells[k]));
  const mid = (core.length ? core : keys).reduce((a, k) => a + parseKey(k).c, 0) / (core.length || keys.length);
  for (const k of keys) {
    if (cells[k] !== 'wing') continue;
    const { c } = parseKey(k);
    if (c < mid - 0.1) out.wingsL++; else if (c > mid + 0.1) out.wingsR++;
  }
  const engines = keys.filter(k => isEngine(cells[k]));
  // ----- really wrong = BOOM -----
  const seen = new Set([keys[0]]), queue = [keys[0]];
  while (queue.length) {
    const { c, r } = parseKey(queue.shift());
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = cellKey(c + dc, r + dr);
      if (cells[n] && !seen.has(n)) { seen.add(n); queue.push(n); }
    }
  }
  if (!engines.length) out.boom = 'No engine! Rockets need an engine at the bottom to fly.';
  else if (!keys.some(k => cells[k] === 'cockpit')) out.boom = 'No cockpit! Your llama needs a seat to ride in.';
  else if (seen.size < keys.length) out.boom = 'Some parts were not attached! Every part has to touch another part.';
  else if (engines.some(k => { const { c, r } = parseKey(k); return keys.some(o => { const p = parseKey(o); return p.c === c && p.r > r; }); }))
    out.boom = 'Something was under the engine fire! Engines go at the very bottom.';
  else if (keys.some(k => { const { c, r } = parseKey(k); return cells[k] === 'nose' && cells[cellKey(c, r - 1)]; }))
    out.boom = 'The nose cone was upside down! Nose cones go on the very top.';
  else if (out.thrust < out.weight) out.boom = 'Too heavy! Use fewer parts or a stronger engine.';
  // ----- a bit wrong = wobbly -----
  const pairs = Math.min(out.wingsL, out.wingsR), lopsided = Math.abs(out.wingsL - out.wingsR);
  let wob = 1 - Math.min(2, pairs) * 0.4 + lopsided * 0.25 + Math.min(1, Math.abs(comX - mid)) * 0.3;
  if (!keys.some(k => cells[k] === 'nose')) { wob += 0.2; out.warnings.push('No nose cone: a bit wobbly'); }
  if (lopsided) out.warnings.push('Wings are lopsided: wobbly!');
  if (!pairs) out.warnings.push('No wing pair: very wobbly!');
  out.wobble = clamp(wob, 0.15, 1.3);
  out.speed = out.weight ? out.thrust / out.weight : 0;
  return out;
}
function stars3(n) { n = clamp(Math.round(n), 0, 3); return '★'.repeat(n) + '☆'.repeat(3 - n); }

const Builder = {
  bg: '#1d2238',
  CS: 52, GX: 282, GY: 72,
  enter() {
    this.drag = null;
    this.sel = null;
    if (!game.save.seenBuilder) {
      game.save.seenBuilder = true;
      toast('Drag parts onto the grid to build your rocket!', '#ffe066');
    }
  },
  update() {},
  cellAt(x, y) {
    const c = Math.floor((x - this.GX) / this.CS), r = Math.floor((y - this.GY) / this.CS);
    return c >= 0 && c < GRID_W && r >= 0 && r < GRID_H ? { c, r } : null;
  },
  place(type, cell) {
    const k = cellKey(cell.c, cell.r), cells = game.save.design.cells;
    if (cells[k] || partCount(type) <= 0) return false;
    addPart(type, -1); cells[k] = type; Sfx.place();
    return true;
  },
  remove(cell) {
    const k = cellKey(cell.c, cell.r), cells = game.save.design.cells;
    if (!cells[k]) return null;
    const t = cells[k];
    delete cells[k]; addPart(t, 1);
    return t;
  },
  handlePointer() {
    if (game.modal) return;
    // start a drag
    if (mouse.clicked && !ui.consumed) {
      const trayI = this.trayIndexAt(mouse.x, mouse.y), cell = this.cellAt(mouse.x, mouse.y);
      if (trayI >= 0) {
        const t = PART_ORDER[trayI];
        ui.consumed = true;
        if (partCount(t) > 0) { this.drag = { type: t, from: 'tray', sx: mouse.x, sy: mouse.y }; this.sel = t; Sfx.click(); }
        else toast(`No ${PARTS[t].name} left. Make one at the Workbench 🔧`, '#ffb3b3');
      } else if (cell && game.save.design.cells[cellKey(cell.c, cell.r)]) {
        ui.consumed = true;
        const t = this.remove(cell);
        this.drag = { type: t, from: 'grid', cell, sx: mouse.x, sy: mouse.y };
      } else if (cell && this.sel) {
        ui.consumed = true;
        if (!this.place(this.sel, cell)) toast(`No ${PARTS[this.sel].name} left!`, '#ffb3b3');
      }
    }
    // drop
    if (mouse.released && this.drag) {
      const d = this.drag, moved = Math.hypot(mouse.ux - d.sx, mouse.uy - d.sy) > 10, cell = this.cellAt(mouse.ux, mouse.uy);
      if (d.from === 'grid' && !moved) { Sfx.click(); } // a tap on a part takes it off the rocket
      else if (cell && !game.save.design.cells[cellKey(cell.c, cell.r)]) this.place(d.type, cell);
      this.drag = null;
    }
  },
  trayIndexAt(x, y) {
    if (x < 18 || x > 262 || y < 72) return -1;
    const i = Math.floor((y - 72) / 56);
    return i < PART_ORDER.length ? i : -1;
  },
  draw() {
    const d = game.save.design, a = analyzeRocket(d);
    ctx.fillStyle = '#1d2238'; ctx.fillRect(0, 0, W, H);
    drawInventoryBar('🚀 Rocket Builder');
    // ---- parts tray ----
    text('PARTS', 140, 62, { size: 14, color: '#9fd3ff' });
    PART_ORDER.forEach((k, i) => {
      const y = 72 + i * 56, n = partCount(k);
      rr(18, y, 244, 50, 10);
      ctx.fillStyle = this.sel === k ? 'rgba(255,224,102,.25)' : 'rgba(255,255,255,.07)'; ctx.fill();
      if (this.sel === k) { ctx.lineWidth = 3; ctx.strokeStyle = '#ffe066'; ctx.stroke(); }
      ctx.globalAlpha = n ? 1 : 0.35;
      drawPart(k, 28, y + 5, 40, k === 'wing' ? { '1,0': 'body' } : null, 0, 0, d.color);
      ctx.globalAlpha = 1;
      text(PARTS[k].name, 78, y + 18, { size: 15, align: 'left', color: n ? '#fff' : '#8d93ab' });
      text(`× ${n}`, 78, y + 37, { size: 15, align: 'left', color: n ? '#ffe066' : '#8d93ab' });
    });
    // ---- grid ----
    const { CS, GX, GY } = this;
    rr(GX - 8, GY - 8, GRID_W * CS + 16, GRID_H * CS + 16, 14); ctx.fillStyle = '#0f1326'; ctx.fill();
    ctx.strokeStyle = 'rgba(120,170,255,.25)'; ctx.lineWidth = 1;
    for (let c = 0; c <= GRID_W; c++) { ctx.beginPath(); ctx.moveTo(GX + c * CS, GY); ctx.lineTo(GX + c * CS, GY + GRID_H * CS); ctx.stroke(); }
    for (let r = 0; r <= GRID_H; r++) { ctx.beginPath(); ctx.moveTo(GX, GY + r * CS); ctx.lineTo(GX + GRID_W * CS, GY + r * CS); ctx.stroke(); }
    text('▲ TOP', GX + GRID_W * CS / 2, GY + 12, { size: 12, color: 'rgba(255,255,255,.3)' });
    text('BOTTOM ▼', GX + GRID_W * CS / 2, GY + GRID_H * CS - 12, { size: 12, color: 'rgba(255,255,255,.3)' });
    for (const k in d.cells) {
      const { c, r } = parseKey(k);
      drawPart(d.cells[k], GX + c * CS, GY + r * CS, CS, d.cells, c, r, d.color);
    }
    const hc = this.drag && this.cellAt(mouse.x, mouse.y);
    if (hc && !d.cells[cellKey(hc.c, hc.r)]) { ctx.fillStyle = 'rgba(255,224,102,.25)'; ctx.fillRect(GX + hc.c * CS, GY + hc.r * CS, CS, CS); }
    // ---- right side: stats + buttons ----
    const X = 690;
    rr(X - 10, 62, 268, 300, 14); ctx.fillStyle = 'rgba(255,255,255,.06)'; ctx.fill();
    text('YOUR ROCKET', X + 124, 82, { size: 16, color: '#9fd3ff' });
    const rows = [
      ['🔥 Power', ENGINE_NAMES[a.tier]],
      ['💨 Speed', stars3(a.speed * 1.6)],
      ['🕹️ Steering', stars3(1 + a.steer)],
      ['🪽 Steady', stars3((1.3 - a.wobble) * 3)],
    ];
    rows.forEach(([l, v], i) => {
      text(l, X, 112 + i * 30, { size: 15, align: 'left' });
      text(v, X + 248, 112 + i * 30, { size: 15, align: 'right', color: '#ffe066' });
    });
    text(`Weight ${a.weight} · Lift ${a.thrust}`, X + 124, 236, { size: 13, color: a.thrust >= a.weight ? '#aab4d4' : '#ff9a9a' });
    const reach = ['Nowhere yet!', 'Mercury & Mars', 'up to Video Games', 'ALL the way to Planet Evil!'][a.tier];
    text('Can reach: ' + reach, X + 124, 258, { size: 13, color: '#7bdc6b' });
    a.warnings.slice(0, 2).forEach((wn, i) => text('⚠️ ' + wn, X + 124, 284 + i * 22, { size: 13, color: '#ffb3b3' }));
    text('Tip: nose on top, engine on the bottom!', X + 124, 340, { size: 12, color: 'rgba(255,255,255,.55)', bold: false });
    if (button('🎨 Paint', X, 376, 120, 44, { size: 17, color: ROCKET_COLORS[d.color], textColor: '#1a1a1a' })) d.color = (d.color + 1) % ROCKET_COLORS.length;
    if (button('🧹 Clear', X + 128, 376, 120, 44, { size: 17, color: '#9aa3c0' })) {
      for (const k in d.cells) { addPart(d.cells[k], 1); delete d.cells[k]; }
    }
    if (button('🚀 LAUNCH!', X, 432, 248, 64, { size: 26, color: '#ff6b4e', hot: '#ff9178', textColor: '#fff' })) this.launch();
    if (button('← Back to Bay', X, 508, 248, 44, { size: 17, color: '#9fd3ff' })) goTo('bay', {});
    // ---- dragged part follows the finger ----
    if (this.drag) drawPart(this.drag.type, mouse.x - CS / 2, mouse.y - CS / 2, CS, null, 0, 0, d.color);
    this.handlePointer();
  },
  launch() {
    if (!designBounds(game.save.design.cells)) { toast('Put some parts on the grid first!', '#ffb3b3'); return; }
    const starts = launchStarts();
    if (starts.length > 1) game.modal = makeStartModal(starts);
    else startFlight(0);
  },
};

// Take off from Earth: right away when playing alone, or together once the friend presses LAUNCH too.
function startFlight(leg) {
  game.modal = null;
  Coop.ready({ from: 'earth', leg, speed: flightSpeed(analyzeRocket(game.save.design)) },
    (l, speed, together) => goTo('launch', { startLeg: l, speed, together }));
}

// Places you can start a flight from: Earth, or any planet you've landed on.
function launchStarts() {
  const list = [{ leg: 0, label: '🌍 Start from Earth' }];
  const tier = analyzeRocket(game.save.design).tier;
  [...game.save.visited].sort((a, b) => a - b).forEach(j => {
    if (j >= PLANETS.length - 1) return;
    const ok = tier >= PLANETS[j + 1].need;
    list.push({ leg: j + 1, ok, label: ok ? `🪐 Start near ${PLANETS[j].name}` : `🔒 ${PLANETS[j].name} (needs ${ENGINE_NAMES[PLANETS[j + 1].need]})` });
  });
  return list;
}
function makeStartModal(starts) {
  return {
    draw() {
      const h = 130 + starts.length * 56, y0 = (H - h) / 2;
      panel(250, y0, 460, h);
      text('Where do you want to start?', 480, y0 + 36, { size: 24, color: '#ffe066' });
      starts.forEach((s, i) => {
        if (button(s.label, 290, y0 + 66 + i * 56, 380, 46, { enabled: s.ok !== false, size: 18 })) startFlight(s.leg);
      });
      if (button('Cancel', 400, y0 + h - 52, 160, 38, { color: '#9aa3c0', size: 16 })) game.modal = null;
    },
  };
}

export { Builder, analyzeRocket, launchStarts, makeStartModal, stars3, startFlight };
