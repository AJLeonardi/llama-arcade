import { CW, H, R, Sfx, W, burst, button, circle, ctx, drawTouchControls, ellipse, floatText, game, goTo, panel, pick, rand, rr, seeded, text, toast, tri, wrapText } from './core.js';
import { ENGINE_NAMES, MAT_BY_ID, PLANETS } from './data.js';
import { drawLlama, drawMat, drawPlanet, drawRocketDesign, drawStars } from './art.js';
import { drawInventoryBar, drawMe, makeWalker, moveWalker } from './house.js';
import { analyzeRocket } from './builder.js';
import { Space, canFlyTo } from './flight.js';
import { Net } from './net.js';
import { Coop, flightSpeed } from './coop.js';
/* Planet surfaces (walk around, grab loot, meet your friend) and the Planet Evil finish. */

const PlanetScene = {
  stick: true,
  bg() {   // sky + ground across the full screen width
    const P = PLANETS[this.idx], g = ctx.createLinearGradient(0, 0, 0, 260);
    g.addColorStop(0, P.sky[0]); g.addColorStop(1, P.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, CW, 260);
    ctx.fillStyle = P.ground; ctx.fillRect(0, 240, CW, H);
  },
  ROCKET: { x: 170, y: 330 },
  enter(arg) {
    const idx = this.idx = arg.idx, P = PLANETS[idx];
    if (!game.save.visited.includes(idx)) game.save.visited.push(idx);
    this.solids = [R(this.ROCKET.x - 45, this.ROCKET.y - 20, 90, 22)];
    this.me = makeWalker(this.ROCKET.x + 90, 420);
    this.picks = [];
    for (const [id, n] of Object.entries(P.loot)) for (let i = 0; i < n; i++) this.picks.push(this.spot(id));
    const rnd = seeded(idx * 31 + 5);
    this.deco = Array.from({ length: 14 }, () => ({ x: 40 + rnd() * 880, y: 260 + rnd() * 300, k: rnd(), s: 0.7 + rnd() * 0.6 }))
      .filter(d => !(d.x < 300 && d.y < 380)).sort((a, b) => a.y - b.y);
    this.allDone = false;
    this.metToast = false;
    Sfx.win();
    toast(`You landed on ${P.name}! 🎉 Grab all the stuff!`, '#ffe066');
  },
  spot(id) {
    let x, y, tries = 0;
    do { x = rand(60, 900); y = rand(280, 560); tries++; } while (tries < 30 && ((x < 320 && y < 440) || (x > 600 && y > 440)));
    return { id, x, y, b: rand(0, 6) };
  },
  update(dt) {
    const w = this.me;
    moveWalker(w, dt, this.solids, R(30, 250, 900, 340));
    for (const p of this.picks) {
      p.b += dt * 3;
      if (p.dead || Math.hypot(w.x - p.x, w.y - 15 - p.y) > 30) continue;
      p.dead = true;
      game.save.inv[p.id]++;
      Sfx.coin();
      floatText('+1 ' + MAT_BY_ID[p.id].icon, p.x, p.y - 20, MAT_BY_ID[p.id].color);
      burst(p.x, p.y, 8, [MAT_BY_ID[p.id].color, '#fff']);
    }
    if (!this.allDone && this.picks.every(p => p.dead)) { this.allDone = true; toast('You got everything! ⭐', '#7bdc6b'); Sfx.craft(); }
    const f = Net.friend;
    if (Net.connected && f && f.scene === 'planet' && f.planet === this.idx && !this.metToast) {
      this.metToast = true;
      toast(`You met ${Net.friendName()} on ${PLANETS[this.idx].name}! 🎉`, '#ffe066');
      Sfx.win();
    }
    Net.sendPos({ scene: 'planet', planet: this.idx, x: w.x, y: w.y, face: w.face, moving: w.moving });
  },
  draw() {
    const P = PLANETS[this.idx], t = game.t;
    const g = ctx.createLinearGradient(0, 0, 0, 250);
    g.addColorStop(0, P.sky[0]); g.addColorStop(1, P.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 260);
    drawStars(0, 0.6);
    drawSkyThings(this.idx, t);
    drawPlanet(830, 120, 20, -1);
    ctx.fillStyle = P.ground;
    ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 20) ctx.lineTo(x, 238 + Math.sin(x * 0.02 + this.idx) * 8);
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
    ctx.fillStyle = P.ground2;
    const rnd = seeded(this.idx + 99);
    for (let i = 0; i < 40; i++) ellipse(rnd() * W, 260 + rnd() * 340, 6 + rnd() * 18, 3 + rnd() * 6);
    for (const d of this.deco) drawDeco(this.idx, d, t);
    // depth-sorted: rocket, friend, me
    const things = [{ y: this.ROCKET.y, draw: () => drawRocketDesign(game.save.design, this.ROCKET.x, this.ROCKET.y, { s: 22 }) }];
    const f = Net.friend;
    if (Net.connected && f && f.scene === 'planet' && f.planet === this.idx) {
      things.push({ y: f.y, draw: () => drawLlama(f.x, f.y, { face: f.face, moving: f.moving, t, scarf: Net.friendScarf(), label: Net.friendName() }) });
      if (f.design) things.push({ y: this.ROCKET.y - 1, draw: () => drawRocketDesign(f.design, this.ROCKET.x + 150, this.ROCKET.y, { s: 22 }) });
    }
    things.push({ y: this.me.y, draw: () => drawMe(this.me) });
    things.sort((a, b) => a.y - b.y).forEach(o => o.draw());
    for (const p of this.picks) if (!p.dead) drawMat(p.id, p.x, p.y + Math.sin(p.b) * 3, 1.3);
    text(P.name, W / 2, 84, { size: 34, stroke: '#000', strokeW: 7 });
    text(P.about, W / 2, 118, { size: 16, stroke: '#000', strokeW: 4 });
    const left = this.picks.filter(p => !p.dead).length;
    text(left ? `Stuff left to grab: ${left}` : 'You got everything! ⭐', W / 2, 144, { size: 15, color: '#ffe066', stroke: '#000', strokeW: 4 });
    drawInventoryBar('🪐 ' + P.name);
    const next = this.idx + 1, tier = analyzeRocket(game.save.design).tier, ok = canFlyTo(next, tier);
    if (button(ok ? `🚀 Fly to ${PLANETS[next].name}` : `🔒 Needs ${ENGINE_NAMES[PLANETS[next].need]}`, W - 330, 470, 310, 52, { enabled: ok, size: 18 })) {
      Coop.ready({ from: 'planet', leg: next, speed: flightSpeed(analyzeRocket(game.save.design)) }, (l, speed) => goTo('space', { leg: l, speed }));
    }
    if (button('🏠 Fly home', W - 330, 530, 310, 48, { color: '#9fd3ff', size: 18 })) Space.flyHome();
    drawTouchControls();
  },
};

function drawSkyThings(idx, t) {
  const name = PLANETS[idx].name;
  if (name === 'Mercury') {
    ctx.fillStyle = 'rgba(255,200,80,.25)'; circle(140, 120, 95);
    ctx.fillStyle = '#ffd23f'; circle(140, 120, 70);
  } else if (name === 'Planet Choco') {
    ctx.fillStyle = 'rgba(255,190,220,.85)';
    for (let i = 0; i < 4; i++) { const x = (i * 260 + t * 12) % (W + 200) - 100; ellipse(x, 180 + i % 2 * 30, 60, 20); ellipse(x + 40, 172 + i % 2 * 30, 40, 18); }
  } else if (name === 'Planet Video Games') {
    for (let i = 0; i < 5; i++) {
      const x = (i * 210 + t * 20) % (W + 100) - 50;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(x, 170 + (i % 2) * 30, 60, 16); ctx.fillRect(x + 12, 158 + (i % 2) * 30, 36, 12);
    }
  } else if (name === 'Mars') {
    ctx.fillStyle = '#e8d4c0'; circle(700, 150, 10); circle(560, 110, 6);
  }
}

function drawDeco(idx, d, t) {
  const name = PLANETS[idx].name, { x, y, k, s } = d;
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,.3)';
  if (name === 'Mercury' || (name === 'Mars' && k < 0.5)) {
    if (k < 0.3) { ctx.fillStyle = 'rgba(0,0,0,.25)'; ellipse(0, 0, 40, 14); ctx.fillStyle = 'rgba(255,255,255,.1)'; ellipse(0, 4, 32, 9); }
    else { ctx.fillStyle = name === 'Mars' ? '#8f3418' : '#7d6b5c'; ellipse(0, -10, 22, 16); ctx.fillStyle = 'rgba(255,255,255,.15)'; ellipse(-6, -16, 8, 5); }
  } else if (name === 'Mars') {
    if (k > 0.85) { // little rover
      ctx.fillStyle = '#ddd'; ctx.fillRect(-26, -30, 52, 18);
      ctx.fillStyle = '#333'; circle(-18, -8, 8); circle(0, -8, 8); circle(18, -8, 8);
      ctx.fillStyle = '#aaa'; ctx.fillRect(14, -48, 4, 18); ctx.fillStyle = '#4fc3ff'; circle(16, -50, 6);
    } else { ctx.fillStyle = '#a8441f'; tri(-24, 0, 0, -36, 22, 0); }
  } else if (name === 'Planet Choco') {
    if (k < 0.35) { // chocolate bar
      ctx.fillStyle = '#4a2410'; rr(-30, -40, 60, 40, 4); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#6b3b1e'; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 20, -40); ctx.lineTo(i * 20, 0); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(-30, -20); ctx.lineTo(30, -20); ctx.stroke();
    } else if (k < 0.7) { // lollipop tree
      ctx.fillStyle = '#fff'; ctx.fillRect(-3, -60, 6, 60);
      ctx.fillStyle = pick(['#ff4f8b']); circle(0, -70, 24);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, -70, 13, 0, Math.PI * 1.5); ctx.stroke();
    } else { // wrapped candy
      ctx.fillStyle = '#ffe14f'; ellipse(0, -12, 16, 11); tri(-14, -12, -30, -24, -30, 0); tri(14, -12, 30, -24, 30, 0);
    }
  } else if (name === 'Planet Video Games') {
    if (k < 0.4) { // ? block
      const bob = Math.sin(t * 2 + x) * 3;
      ctx.fillStyle = '#ffb31f'; rr(-22, -50 + bob, 44, 44, 4); ctx.fill(); ctx.stroke();
      text('?', 0, -27 + bob, { size: 30, color: '#fff', stroke: '#8a4b00', strokeW: 4 });
    } else if (k < 0.75) { // arcade machine
      ctx.fillStyle = '#3b1fa0'; ctx.fillRect(-20, -70, 40, 70);
      ctx.fillStyle = `hsl(${(t * 80 + x) % 360},90%,60%)`; ctx.fillRect(-14, -62, 28, 22);
      ctx.fillStyle = '#ff4f6a'; circle(-6, -28, 4); ctx.fillStyle = '#4fffd2'; circle(6, -28, 4);
    } else { // pixel mushroom
      ctx.fillStyle = '#ff4f6a'; ctx.fillRect(-20, -36, 40, 18); ctx.fillStyle = '#fff'; ctx.fillRect(-8, -36, 8, 8); ctx.fillRect(-12, -18, 24, 18);
    }
  }
  ctx.restore();
}

// ---------- Planet Evil: you win! ----------
const Win = {
  stick: true,
  bg() {
    const P = PLANETS[PLANETS.length - 1];
    ctx.fillStyle = P.sky[0]; ctx.fillRect(0, 0, CW, 320);
    ctx.fillStyle = P.ground; ctx.fillRect(0, 320, CW, H);
  },
  enter() {
    game.save.won = true;
    const last = PLANETS.length - 1;
    if (!game.save.visited.includes(last)) game.save.visited.push(last);
    this.me = makeWalker(330, 480);
    this.fw = 0.5;
    Sfx.win();
  },
  update(dt) {
    moveWalker(this.me, dt, [], R(30, 300, 900, 290));
    this.fw -= dt;
    if (this.fw <= 0) {
      this.fw = rand(0.3, 0.7);
      burst(rand(100, 860), rand(80, 240), 40, [pick(['#ff4f6a', '#ffe14f', '#4fffd2', '#b46bff', '#fff'])], { speed: 240, g: 60, life: 1.4 });
      Sfx.tone(rand(500, 900), 0.3, 'triangle', 0.04, 1600);
    }
    Net.sendPos({ scene: 'win', x: this.me.x, y: this.me.y });
  },
  draw() {
    const P = PLANETS[PLANETS.length - 1], t = game.t;
    const g = ctx.createLinearGradient(0, 0, 0, 300);
    g.addColorStop(0, P.sky[0]); g.addColorStop(1, P.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    drawStars(0, 0.7);
    ctx.fillStyle = '#ff3a3a'; circle(820, 110, 50);
    // castle
    ctx.fillStyle = '#12000a';
    ctx.fillRect(560, 160, 240, 160); ctx.fillRect(540, 120, 50, 200); ctx.fillRect(770, 120, 50, 200); ctx.fillRect(650, 90, 60, 230);
    tri(540, 120, 565, 70, 590, 120); tri(770, 120, 795, 70, 820, 120); tri(650, 90, 680, 30, 710, 90);
    ctx.fillStyle = `rgba(255,200,0,${0.6 + Math.sin(t * 3) * 0.3})`;
    [[570, 170], [790, 170], [670, 130], [610, 220], [740, 220]].forEach(([a, b]) => ctx.fillRect(a, b, 14, 20));
    ctx.fillStyle = P.ground; ctx.fillRect(0, 320, W, H);
    ctx.strokeStyle = '#ff7a00'; ctx.lineWidth = 3;
    const rnd = seeded(77);
    for (let i = 0; i < 8; i++) { let x = rnd() * W, y = 340 + rnd() * 240; ctx.beginPath(); ctx.moveTo(x, y); for (let j = 0; j < 4; j++) { x += (rnd() - 0.5) * 80; y += (rnd() - 0.5) * 30; ctx.lineTo(x, y); } ctx.stroke(); }
    drawRocketDesign(game.save.design, 150, 440, { s: 22 });
    drawLlama(500, 440, { s: 1.8, face: -1, fur: '#6b4a7e', fur2: '#523863', crown: true, t, moving: Math.sin(t * 2) > 0.6 });
    panel(330, 232, 320, 74, { r: 14, fill: 'rgba(255,255,255,.95)', stroke: '#6b4a7e' });
    wrapText('"Nooo! You actually made it?! ...Okay fine. YOU WIN!" 👑', 490, 254, 290, 22, { size: 15, color: '#3a1d4a' });
    const f = Net.friend;
    if (Net.connected && f && f.scene === 'win' && f.x != null) drawLlama(f.x, f.y, { t, moving: true, scarf: Net.friendScarf(), label: Net.friendName() });
    drawMe(this.me);
    text('YOU MADE IT TO PLANET EVIL!', W / 2, 60, { size: 42, color: '#ffe066', stroke: '#000', strokeW: 8 });
    text('You finished the game! 🏆', W / 2, 108, { size: 26, stroke: '#000', strokeW: 6 });
    // buttons stay on the right so the touch joystick (bottom-left) doesn't cover them
    if (button('🏠 Fly home & keep building', 600, 470, 330, 50, { size: 18 })) Space.flyHome();
    if (button('Title screen', 600, 530, 330, 44, { size: 18, color: '#9fd3ff' })) goTo('title');
    drawTouchControls();
  },
};

export { PlanetScene, Win, drawDeco, drawSkyThings };
