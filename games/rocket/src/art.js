import { H, W, circle, ctx, ellipse, pick, rand, rr, seeded, star, text, tri } from './core.js';
import { EARTH, PARTS, PLANETS, ROCKET_COLORS, isEngine } from './data.js';
/* Art: everything is drawn with code — llamas, rocket parts, planets, asteroids, stars, pickups. */

// ---------- Llama ----------
function drawLlama(x, y, o = {}) {
  const face = o.face || 1, s = o.s || 1, t = o.t || 0;
  const fur = o.fur || '#f7ecd9', fur2 = o.fur2 || '#e3d2b6';
  const step = o.moving ? Math.sin(t * 14) : 0;
  const bob = o.moving ? Math.abs(Math.sin(t * 14)) * 2 : 0;
  ctx.save();
  ctx.translate(x, y); ctx.scale(s, s);
  if (o.alpha != null) ctx.globalAlpha = o.alpha;
  ctx.fillStyle = 'rgba(0,0,0,.22)'; ellipse(0, 1, 19, 5);
  ctx.scale(face, 1);
  ctx.translate(0, -bob);
  ctx.fillStyle = fur2;
  [-12, -6, 6, 12].forEach((lx, i) => ctx.fillRect(lx - 2 + (i % 2 ? 1 : -1) * step * 3, -13, 4.5, 13 + bob));
  ctx.fillStyle = fur;
  ellipse(-17, -22, 5, 4);            // tail
  ellipse(0, -19, 17, 10);            // body
  rr(6, -44, 9, 26, 4); ctx.fill();   // neck
  ellipse(14, -45, 8.5, 6.5);         // head
  ctx.fillStyle = fur2; ellipse(21, -43, 4.5, 3.8);
  ctx.fillStyle = fur;
  tri(8, -49, 9, -59, 13, -50); tri(13, -50, 16, -59, 18, -49);
  ctx.fillStyle = '#ffb3c1';
  tri(9.5, -50, 10, -56, 12, -50);
  ctx.fillStyle = '#1d1d1d'; circle(15.5, -47, 1.9);
  ctx.fillStyle = '#fff'; circle(16.1, -47.7, 0.6);
  ctx.fillStyle = 'rgba(255,120,140,.5)'; circle(17, -43, 1.8);
  if (o.scarf) {
    ctx.fillStyle = o.scarf;
    rr(4.5, -30, 12, 6, 2); ctx.fill();
    ctx.fillRect(4.5, -27, 4, 10);
  }
  if (o.crown) {
    ctx.fillStyle = '#ffd21f';
    ctx.beginPath();
    ctx.moveTo(6, -51); ctx.lineTo(7, -62); ctx.lineTo(11, -56); ctx.lineTo(14, -64); ctx.lineTo(17, -56);
    ctx.lineTo(21, -62); ctx.lineTo(22, -51); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
  if (o.label) text(o.label, x, y - 72 * s, { size: 13, color: o.scarf || '#fff', stroke: '#000', strokeW: 3 });
}

// ---------- Rocket (drawn from a builder design) ----------
const cellKey = (c, r) => c + ',' + r;
function parseKey(k) { const [c, r] = k.split(',').map(Number); return { c, r }; }

function designBounds(cells) {
  let minC = 99, maxC = -99, minR = 99, maxR = -99;
  for (const k in cells) {
    const { c, r } = parseKey(k);
    minC = Math.min(minC, c); maxC = Math.max(maxC, c); minR = Math.min(minR, r); maxR = Math.max(maxR, r);
  }
  if (minC === 99) return null;
  return { minC, maxC, minR, maxR, w: maxC - minC + 1, h: maxR - minR + 1 };
}

// Draws one rocket part in a cell at (px,py) of size s. `cells` lets parts look at neighbours.
function drawPart(type, px, py, s, cells, c, r, color, o = {}) {
  const has = (dc, dr) => cells && cells[cellKey(c + dc, r + dr)];
  const body = ROCKET_COLORS[color % ROCKET_COLORS.length];
  ctx.lineWidth = Math.max(1.5, s * 0.06);
  ctx.strokeStyle = 'rgba(0,0,0,.4)';
  if (type === 'body' || type === 'cockpit') {
    rr(px + s * 0.12, py, s * 0.76, s, s * 0.08);
    ctx.fillStyle = body; ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(px + s * 0.2, py + s * 0.05, s * 0.12, s * 0.9);
    if (type === 'body') { ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.fillRect(px + s * 0.12, py + s * 0.42, s * 0.76, s * 0.14); }
    else {
      ctx.fillStyle = '#bfe9ff'; circle(px + s / 2, py + s / 2, s * 0.27);
      ctx.lineWidth = s * 0.07; ctx.strokeStyle = '#5a5f6e';
      ctx.beginPath(); ctx.arc(px + s / 2, py + s / 2, s * 0.27, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#f7ecd9';
      ellipse(px + s * 0.52, py + s * 0.56, s * 0.13, s * 0.11);
      tri(px + s * 0.42, py + s * 0.5, px + s * 0.43, py + s * 0.33, px + s * 0.5, py + s * 0.48);
      tri(px + s * 0.55, py + s * 0.48, px + s * 0.6, py + s * 0.33, px + s * 0.63, py + s * 0.5);
      ctx.fillStyle = '#222'; circle(px + s * 0.56, py + s * 0.54, s * 0.03);
    }
  } else if (type === 'nose') {
    const down = !has(0, 1) && has(0, -1); // only attached above it = upside down
    ctx.fillStyle = '#eef2f8';
    ctx.beginPath();
    if (down) { ctx.moveTo(px + s * 0.12, py); ctx.lineTo(px + s * 0.88, py); ctx.quadraticCurveTo(px + s * 0.8, py + s * 0.6, px + s / 2, py + s * 0.97); ctx.quadraticCurveTo(px + s * 0.2, py + s * 0.6, px + s * 0.12, py); }
    else { ctx.moveTo(px + s * 0.12, py + s); ctx.lineTo(px + s * 0.88, py + s); ctx.quadraticCurveTo(px + s * 0.8, py + s * 0.4, px + s / 2, py + s * 0.03); ctx.quadraticCurveTo(px + s * 0.2, py + s * 0.4, px + s * 0.12, py + s); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = body;
    if (down) ellipse(px + s / 2, py + s * 0.85, s * 0.08, s * 0.1); else ellipse(px + s / 2, py + s * 0.15, s * 0.08, s * 0.1);
  } else if (type === 'wing') {
    ctx.fillStyle = '#ffd23f';
    const left = has(1, 0) && !has(-1, 0), right = has(-1, 0) && !has(1, 0);
    ctx.beginPath();
    if (left) { ctx.moveTo(px + s, py + s * 0.02); ctx.lineTo(px + s, py + s); ctx.lineTo(px + s * 0.02, py + s); ctx.lineTo(px + s * 0.1, py + s * 0.62); }
    else if (right) { ctx.moveTo(px, py + s * 0.02); ctx.lineTo(px, py + s); ctx.lineTo(px + s * 0.98, py + s); ctx.lineTo(px + s * 0.9, py + s * 0.62); }
    else { ctx.moveTo(px + s / 2, py); ctx.lineTo(px + s * 0.95, py + s * 0.75); ctx.lineTo(px + s / 2, py + s); ctx.lineTo(px + s * 0.05, py + s * 0.75); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    if (left) tri(px + s * 0.95, py + s * 0.2, px + s * 0.95, py + s * 0.8, px + s * 0.4, py + s * 0.85);
    if (right) tri(px + s * 0.05, py + s * 0.2, px + s * 0.05, py + s * 0.8, px + s * 0.6, py + s * 0.85);
  } else if (type === 'thruster') {
    ctx.fillStyle = '#b8c2cc';
    rr(px + s * 0.25, py + s * 0.15, s * 0.5, s * 0.7, s * 0.12); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#4df0ff';
    const side = has(1, 0) ? -1 : 1; // nozzle points away from what it is attached to
    ctx.fillRect(side < 0 ? px + s * 0.08 : px + s * 0.75, py + s * 0.35, s * 0.17, s * 0.3);
    if (o.puff && o.puff * side > 0) {
      ctx.fillStyle = 'rgba(200,240,255,.8)';
      circle(side < 0 ? px - s * 0.05 : px + s * 1.05, py + s / 2, s * 0.18);
    }
  } else if (isEngine(type)) {
    const tier = PARTS[type].tier;
    ctx.fillStyle = ['#000', '#8a8f99', '#ff8c1a', '#a64dff'][tier];
    ctx.beginPath();
    ctx.moveTo(px + s * 0.22, py); ctx.lineTo(px + s * 0.78, py); ctx.lineTo(px + s * 0.95, py + s); ctx.lineTo(px + s * 0.05, py + s);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(px + s * 0.2, py + s * 0.3, s * 0.6, s * 0.12);
    if (tier === 3) { ctx.fillStyle = '#6ff0ff'; star(px + s / 2, py + s * 0.66, s * 0.15, s * 0.07, 4); }
    if (o.flame) {
      const f = o.flame * (1 + tier * 0.25) * rand(0.85, 1.15);
      const g = ctx.createLinearGradient(0, py + s, 0, py + s + s * 1.6 * f);
      g.addColorStop(0, '#fff6c0'); g.addColorStop(0.35, tier === 3 ? '#c77dff' : '#ffb020'); g.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(px + s * 0.12, py + s);
      ctx.quadraticCurveTo(px + s * 0.25, py + s + s * 0.8 * f, px + s / 2, py + s + s * 1.6 * f);
      ctx.quadraticCurveTo(px + s * 0.75, py + s + s * 0.8 * f, px + s * 0.88, py + s);
      ctx.fill();
    }
  }
}

// Draws a whole rocket design with its bottom-centre at (x, y). s = size of one grid square.
function drawRocketDesign(design, x, y, o = {}) {
  const cells = design.cells, b = designBounds(cells);
  if (!b) return;
  const s = o.s || 20;
  ctx.save();
  if (o.alpha != null) ctx.globalAlpha = o.alpha;
  ctx.translate(x, y);
  ctx.rotate(o.tilt || 0);
  const ox = -b.w * s / 2, oy = -b.h * s;
  // flames first so they sit behind the rocket
  for (const k in cells) {
    if (!isEngine(cells[k])) continue;
    const { c, r } = parseKey(k);
    if (o.flame && !cells[cellKey(c, r + 1)]) drawPart(cells[k], ox + (c - b.minC) * s, oy + (r - b.minR) * s, s, cells, c, r, design.color, { flame: o.flame });
  }
  for (const k in cells) {
    const { c, r } = parseKey(k);
    drawPart(cells[k], ox + (c - b.minC) * s, oy + (r - b.minR) * s, s, cells, c, r, design.color, { puff: o.puff });
  }
  ctx.restore();
}

function rocketSize(design, s) {
  const b = designBounds(design.cells);
  return b ? { w: b.w * s, h: b.h * s } : { w: 0, h: 0 };
}

// ---------- Space things ----------
const STARS = Array.from({ length: 250 }, () => ({ x: Math.random() * 1400, y: Math.random() * H, z: Math.random() }));
function drawStars(scroll = 0, alpha = 1, streak = 0) {
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#fff';
  for (const st of STARS) {
    if (st.x > W) continue;
    const y = (((st.y + scroll * (0.2 + st.z * 0.8)) % H) + H) % H;
    ctx.globalAlpha = alpha * (0.3 + st.z * 0.7);
    if (streak) {
      ctx.lineWidth = 1 + st.z;
      ctx.beginPath(); ctx.moveTo(st.x, y); ctx.lineTo(st.x, y - streak * (0.3 + st.z)); ctx.stroke();
    } else ctx.fillRect(st.x, y, 1 + st.z * 1.6, 1 + st.z * 1.6);
  }
  ctx.globalAlpha = 1;
}

function makeAsteroid(x, y, r, rnd = Math.random) {
  const pts = [];
  for (let i = 0; i < 9; i++) pts.push(0.75 + rnd() * 0.35);
  const craters = [0, 1, 2].map(() => [(rnd() - 0.5) * 0.8, (rnd() - 0.5) * 0.8, 0.12 + rnd() * 0.12]);
  return { x, y, r, pts, craters, rot: rnd() * 6, vr: (rnd() - 0.5) * 3 };
}
function drawAsteroid(a) {
  ctx.save();
  ctx.translate(a.x, a.y); ctx.rotate(a.rot);
  ctx.fillStyle = '#7a6a5c'; ctx.strokeStyle = '#4a3e34'; ctx.lineWidth = 3;
  ctx.beginPath();
  a.pts.forEach((k, i) => { const an = i / a.pts.length * Math.PI * 2; ctx.lineTo(Math.cos(an) * a.r * k, Math.sin(an) * a.r * k); });
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#5e5046';
  a.craters.forEach(c => circle(c[0] * a.r, c[1] * a.r, c[2] * a.r));
  ctx.fillStyle = 'rgba(255,255,255,.12)';
  circle(-a.r * 0.3, -a.r * 0.3, a.r * 0.25);
  ctx.restore();
}

// ---------- Pickups ----------
function drawToken(x, y, r = 11) {
  ctx.fillStyle = '#c2185b'; circle(x, y + 2, r);
  ctx.fillStyle = '#ff6fb5'; circle(x, y, r);
  ctx.fillStyle = '#ffe3f1'; star(x, y, r * 0.55, r * 0.25, 5);
}
function drawMat(id, x, y, s = 1) {
  if (id === 'tokens') { drawToken(x, y, 11 * s); return; }
  ctx.save();
  ctx.translate(x, y); ctx.scale(s, s);
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.4)';
  ctx.beginPath();
  if (id === 'stone') {
    ctx.fillStyle = '#9b9b9b';
    [[-10, 6], [-11, -3], [-4, -10], [6, -9], [11, 0], [8, 7]].forEach(([a, b]) => ctx.lineTo(a, b));
  } else if (id === 'metal') {
    ctx.fillStyle = '#cfd8e3';
    for (let i = 0; i < 6; i++) ctx.lineTo(Math.cos(i * Math.PI / 3) * 10, Math.sin(i * Math.PI / 3) * 10);
  } else if (id === 'gold') {
    ctx.fillStyle = '#ffc928';
    [[-11, 4], [-7, -6], [2, -9], [10, -3], [9, 6], [-2, 9]].forEach(([a, b]) => ctx.lineTo(a, b));
  } else {
    ctx.fillStyle = '#6ff0ff';
    [[-10, -3], [-5, -9], [5, -9], [10, -3], [0, 10]].forEach(([a, b]) => ctx.lineTo(a, b));
  }
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = id === 'metal' ? '#6b7785' : 'rgba(255,255,255,.6)';
  if (id === 'metal') circle(0, 0, 4); else ellipse(-3, -3, 3.5, 2.2);
  ctx.restore();
}

// ---------- Planets ----------
function drawPlanet(x, y, r, idx) {
  const P = idx < 0 ? EARTH : PLANETS[idx];
  const rnd = seeded(idx + 11);
  ctx.save();
  if (P.name === 'Planet Evil') {
    ctx.fillStyle = '#5a0010';
    tri(x - r * 0.75, y - r * 0.45, x - r * 0.95, y - r * 1.3, x - r * 0.3, y - r * 0.85);
    tri(x + r * 0.75, y - r * 0.45, x + r * 0.95, y - r * 1.3, x + r * 0.3, y - r * 0.85);
  }
  ctx.fillStyle = 'rgba(255,255,255,.07)'; circle(x, y, r * 1.12);
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, P.c1); g.addColorStop(1, P.c2);
  ctx.fillStyle = g; circle(x, y, r);
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
  const at = () => [x + (rnd() - 0.5) * 1.6 * r, y + (rnd() - 0.5) * 1.6 * r];
  switch (P.name) {
    case 'Earth':
      ctx.fillStyle = '#4fbf5a';
      for (let i = 0; i < 6; i++) { const [a, b] = at(); ellipse(a, b, r * (0.15 + rnd() * 0.25), r * (0.1 + rnd() * 0.2)); }
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      for (let i = 0; i < 4; i++) { const [a, b] = at(); ellipse(a, b, r * 0.3, r * 0.06); }
      break;
    case 'Mercury':
      ctx.fillStyle = 'rgba(60,45,35,.35)';
      for (let i = 0; i < 10; i++) { const [a, b] = at(); circle(a, b, r * (0.06 + rnd() * 0.14)); }
      break;
    case 'Mars':
      ctx.fillStyle = 'rgba(90,20,10,.35)';
      for (let i = 0; i < 7; i++) { const [a, b] = at(); circle(a, b, r * (0.05 + rnd() * 0.12)); }
      ctx.fillStyle = '#fff'; ellipse(x, y - r * 0.93, r * 0.45, r * 0.18);
      break;
    case 'Planet Choco':
      ctx.fillStyle = '#ff8fc7';
      ctx.fillRect(x - r, y - r, r * 2, r * 0.6);
      for (let i = 0; i <= 8; i++) {
        circle(x - r + i * r / 4, y - r * 0.4, r * (0.08 + rnd() * 0.08));
        if (rnd() < 0.4) ellipse(x - r + i * r / 4, y - r * 0.3, r * 0.05, r * 0.18);
      }
      for (let i = 0; i < 26; i++) {
        const [a, b] = at();
        ctx.fillStyle = pick(['#fff', '#ffe14f', '#4fffd2', '#ff4f6a', '#6fa8ff']);
        ctx.fillRect(a, b, r * 0.09, r * 0.035);
      }
      break;
    case 'Planet Video Games': {
      const px = r / 5;
      for (let gx = x - r; gx < x + r; gx += px) for (let gy = y - r; gy < y + r; gy += px) {
        if (rnd() < 0.3) { ctx.fillStyle = pick(['#ff4fd8', '#4fffd2', '#ffe14f', '#4f8bff']); ctx.fillRect(gx, gy, px - 1, px - 1); }
      }
      break;
    }
    case 'Planet Evil':
      ctx.strokeStyle = '#ff7a00'; ctx.lineWidth = Math.max(1, r * 0.03);
      for (let i = 0; i < 5; i++) {
        let [a, b] = at();
        ctx.beginPath(); ctx.moveTo(a, b);
        for (let j = 0; j < 4; j++) { a += (rnd() - 0.5) * r * 0.5; b += (rnd() - 0.5) * r * 0.5; ctx.lineTo(a, b); }
        ctx.stroke();
      }
      ctx.fillStyle = '#ffde3a';
      ctx.beginPath(); ctx.moveTo(x - r * 0.55, y - r * 0.25); ctx.lineTo(x - r * 0.1, y - r * 0.05); ctx.lineTo(x - r * 0.45, y + r * 0.08); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + r * 0.55, y - r * 0.25); ctx.lineTo(x + r * 0.1, y - r * 0.05); ctx.lineTo(x + r * 0.45, y + r * 0.08); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#1a0003';
      ctx.beginPath(); ctx.moveTo(x - r * 0.45, y + r * 0.35);
      for (let i = 0; i <= 6; i++) ctx.lineTo(x - r * 0.45 + i * r * 0.15, y + r * (i % 2 ? 0.48 : 0.32));
      ctx.lineTo(x + r * 0.45, y + r * 0.58); ctx.lineTo(x - r * 0.45, y + r * 0.58); ctx.closePath(); ctx.fill();
      break;
  }
  ctx.restore();
  if (P.name === 'Planet Video Games') {
    ctx.strokeStyle = 'rgba(79,255,210,.7)'; ctx.lineWidth = Math.max(2, r * 0.06);
    ctx.beginPath(); ctx.ellipse(x, y, r * 1.5, r * 0.28, -0.2, 0, Math.PI * 2); ctx.stroke();
  }
}

export { STARS, cellKey, designBounds, drawAsteroid, drawLlama, drawMat, drawPart, drawPlanet, drawRocketDesign, drawStars, drawToken, makeAsteroid, parseKey, rocketSize };
