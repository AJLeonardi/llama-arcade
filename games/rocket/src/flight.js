import { CW, H, R, Sfx, W, burst, button, clamp, ctx, drawTouchControls, easeOut, ellipse, fixPressed, floatText, game, goTo, lerp, lerpColor, moveAxis, panel, particles, pick, pressed, rand, rr, seeded, text, toast, tri, wrapText } from './core.js';
import { MAT_BY_ID, PARTS, PLANETS, ROCKET_COLORS, addPart, partCount } from './data.js';
import { designBounds, drawAsteroid, drawMat, drawPart, drawPlanet, drawRocketDesign, drawStars, makeAsteroid, parseKey, rocketSize } from './art.js';
import { analyzeRocket } from './builder.js';
import { Net } from './net.js';
import { Coop, flightSpeed } from './coop.js';
/* Takeoff (or BOOM!), space flight through the asteroids, and the yes/no planet prompt. */

function legLength(leg) { return 5200 + leg * 900; }
function canFlyTo(idx, tier) { return idx < PLANETS.length && tier >= PLANETS[idx].need; }

// ---------- Takeoff ----------
const Launch = {
  wide: true,
  enter(arg) {
    this.startLeg = arg.startLeg || 0;
    this.speed = arg.speed;
    this.together = !!arg.together;
    this.a = analyzeRocket(game.save.design);
    this.t = 0; this.alt = 0; this.vel = 0; this.beeps = {};
    this.exploded = false;
    this.clouds = Array.from({ length: 14 }, (_, i) => ({ x: rand(-50, CW), h: 420 + i * 260 + rand(0, 120), w: rand(90, 180) }));
    if (!this.a.boom && this.a.wobble > 0.7) toast('This rocket looks wobbly... hold on! 🪽', '#ffb3b3');
  },
  rocketY() { return 505 - Math.min(this.alt, 180); },
  // taking off together: Llama 1 on the left, Llama 2 on the right
  myX() { return this.together ? W / 2 + (Net.role === 'guest' ? 100 : -100) : W / 2; },
  friendX() { return W / 2 + (Net.role === 'guest' ? -100 : 100); },
  cam() { return Math.max(0, this.alt - 180); },
  update(dt) {
    this.t += dt;
    const T = this.t;
    [0, 1, 2].forEach(n => { if (T >= n + 0.3 && !this.beeps[n]) { this.beeps[n] = 1; Sfx.beep(); } });
    if (T >= 3.3 && !this.beeps.go) {
      this.beeps.go = 1;
      if (this.a.boom) { this.explode(); return; }
      Sfx.go(); Sfx.launch(); game.shake = 8;
    }
    if (this.a.boom) {
      if (T > 5.2 && !game.modal) game.modal = makeBoomModal(this.a.boom);
      return;
    }
    const before = this.cam();
    if (T > 3.3) {
      const lt = T - 3.3;
      this.vel = (90 + 40 * this.a.tier) * lt * lt * 0.5 + 20;
      this.alt += this.vel * dt;
      if (lt < 2.5) game.shake = Math.max(game.shake, 4);
    }
    const camDelta = this.cam() - before;
    for (const p of particles) if (p.smoke) p.y += camDelta;
    if (T > 2.6) {
      const sy = this.rocketY() + 6;
      for (const x of this.together ? [this.myX(), this.friendX()] : [this.myX()]) particles.push({ x: x + rand(-24, 24), y: sy, vx: rand(-140, 140), vy: rand(-10, 60), life: rand(0.8, 1.6), max: 1.6, size: rand(8, 18), color: pick(['#ddd', '#bbb', '#fff']), g: -20, smoke: true });
    }
    if (this.alt > 9000 || T > 12) goTo('space', { leg: this.startLeg, warp: this.startLeg > 0, speed: this.speed });
  },
  explode() {
    this.exploded = true;
    Net.send({ t: 'pos', scene: 'boom' });   // so a friend taking off with us stops drawing our rocket
    Sfx.boom(); game.shake = 22;
    const y = this.rocketY() - 60;
    burst(this.myX(), y, 70, ['#ff5a4e', '#ffd23f', '#ff8c1a', '#fff', '#888'], { speed: 420, life: 1.5 });
    burst(this.myX(), y, 30, [ROCKET_COLORS[game.save.design.color], '#ffd23f'], { speed: 260, size: 2.5, life: 1.8 });
    for (let i = 0; i < 20; i++) particles.push({ x: this.myX() + rand(-40, 40), y: y + rand(-40, 40), vx: rand(-80, 80), vy: rand(-80, -20), life: 2.5, max: 2.5, size: rand(14, 26), color: '#555', g: -10, smoke: true });
  },
  draw() {
    const T = this.t, f = clamp(this.alt / 4500, 0, 1), cam = this.cam();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, lerpColor('#5fb8ff', '#05051a', f)); g.addColorStop(1, lerpColor('#bfe6ff', '#0b0b2e', f));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    drawStars(0, f);
    ctx.fillStyle = `rgba(255,255,255,${0.85 - f * 0.5})`;
    for (const c of this.clouds) {
      const sy = 505 - c.h + cam;
      if (sy < -60 || sy > H + 60) continue;
      ellipse(c.x, sy, c.w * 0.5, 22); ellipse(c.x - c.w * 0.25, sy + 6, c.w * 0.3, 18); ellipse(c.x + c.w * 0.3, sy + 4, c.w * 0.3, 16);
    }
    const gy = 520 + cam;
    if (gy < H + 120) {
      ctx.fillStyle = '#4caf50'; ctx.fillRect(0, gy - 10, W, H);
      ctx.fillStyle = '#5cc35f'; ellipse(150, gy - 5, 260, 40); ellipse(800, gy, 300, 34);
      // the house with the rocket bay
      ctx.fillStyle = '#f0d9b5'; ctx.fillRect(70, gy - 100, 140, 92);
      ctx.fillStyle = '#d9483b'; tri(55, gy - 98, 140, gy - 160, 225, gy - 98);
      ctx.fillStyle = '#7ec8ff'; ctx.fillRect(90, gy - 80, 30, 26); ctx.fillRect(160, gy - 80, 30, 26);
      ctx.fillStyle = '#8b5a2b'; ctx.fillRect(126, gy - 52, 26, 44);
      ctx.fillStyle = '#5a6278'; ctx.fillRect(W / 2 - 180, gy - 16, 360, 18);
      ctx.fillStyle = '#ffbf1f'; ctx.fillRect(W / 2 - 180, gy - 16, 360, 4);
      ctx.strokeStyle = '#8a92a8'; ctx.lineWidth = 4;
      for (const tx of [W / 2 + 195, W / 2 + 220]) { ctx.beginPath(); ctx.moveTo(tx, gy - 300); ctx.lineTo(tx, gy - 16); ctx.stroke(); }
    }
    if (!this.exploded) {
      const tilt = T > 3.3 ? Math.sin(T * 6) * 0.09 * this.a.wobble : 0;
      drawRocketDesign(game.save.design, this.myX(), this.rocketY(), { s: 26, flame: T > 2.8 ? (T > 3.3 ? 1.4 : 0.5) : 0, tilt });
    }
    const fd = Net.friend && Net.friend.design;
    if (this.together && fd && designBounds(fd.cells) && Net.friend.scene !== 'boom') {
      drawRocketDesign(fd, this.friendX(), this.rocketY(), { s: 26, flame: T > 2.8 ? (T > 3.3 ? 1.4 : 0.5) : 0, tilt: T > 3.3 ? Math.sin(T * 6 + 1) * 0.05 : 0 });
      text(Net.friendName(), this.friendX(), this.rocketY() + 26, { size: 15, color: Net.friendScarf(), stroke: '#000', strokeW: 4 });
    }
    if (T < 3.3 && T >= 0.3) text(String(3 - Math.floor(T - 0.3)), W / 2, 190, { size: 120, color: '#ffe066', stroke: '#000', strokeW: 9 });
    else if (T >= 3.3 && T < 4.8) text(this.a.boom ? 'BOOM!' : 'LIFTOFF!', W / 2, 180, { size: 84, color: this.a.boom ? '#ff5a4e' : '#ffe066', stroke: '#000', strokeW: 9 });
    if (this.alt > 3000 && this.alt < 8000) text("Leaving Earth's atmosphere! 🌍", W / 2, 110, { size: 30, stroke: '#000', strokeW: 6 });
    if (!this.a.boom) {
      panel(16, 16, 230, 96, { r: 12 });
      text(`Altitude: ${Math.floor(this.alt / 12)} km`, 32, 40, { size: 17, align: 'left' });
      text(`Speed: ${Math.floor(this.vel * 3)} km/h`, 32, 64, { size: 17, align: 'left' });
      const wob = Math.abs(Math.sin(T * 6)) * this.a.wobble;
      text('Wobble', 32, 89, { size: 14, align: 'left', color: '#aab4d4' });
      ctx.fillStyle = '#333'; ctx.fillRect(100, 82, 130, 12);
      ctx.fillStyle = wob > 0.6 ? '#ff5a4e' : '#7bdc6b'; ctx.fillRect(100, 82, 130 * clamp(wob, 0, 1), 12);
    }
  },
};

function makeBoomModal(reason) {
  return {
    closable: false,
    draw() {
      panel(200, 170, 560, 270);
      text('💥 KA-BOOM! 💥', 480, 212, { size: 34, color: '#ff8a5a' });
      text('Your rocket blew up because...', 480, 256, { size: 17, color: '#aab4d4' });
      wrapText(reason, 480, 292, 500, 26, { size: 21, color: '#ffe066' });
      text("Don't worry, all your parts are safe!", 480, 354, { size: 16, color: '#7bdc6b' });
      if (button('🔧 Fix my rocket', 330, 378, 300, 48, { size: 20 })) goTo('builder');
    },
  };
}

// ---------- Space flight ----------
const Space = {
  stick: true,
  wide: true,
  BASE_Y: 470,
  enter(arg) {
    this.leg = arg.leg || 0;
    this.design = game.save.design;
    this.a = analyzeRocket(this.design);
    this.speed = arg.speed || flightSpeed(this.a);   // flying together: both use the slower rocket's speed
    const startX = Coop.together ? CW / 2 + (Net.role === 'guest' ? 120 : -120) : CW / 2;
    this.r = { x: startX, y: this.BASE_Y, vx: 0, vy: 0, hull: 3, inv: 1.5, crashed: 0, tilt: 0, wt: rand(0, 10), flash: 0 };
    this.lost = [];
    this.debris = [];
    this.shieldFlash = [0, 0];
    this.startLeg(this.leg);
    this.state = arg.warp ? 'warp' : 'fly';
    this.st = 0;
    this.scroll = 0;
    if (arg.warp) { Sfx.whoosh(); toast(`WARP to ${PLANETS[this.leg - 1].name}! ✨`, '#9fd3ff'); }
    toast(`Dodge the asteroids! Next stop: ${PLANETS[this.leg].name}`, '#ffe066');
  },
  // Every player flying the same leg gets the same asteroids (shared seed + leg number).
  startLeg(leg) {
    this.leg = leg;
    this.dist = 0;
    this.len = legLength(leg);
    const rnd = seeded(Net.seed * 7 + leg * 1013 + 1);
    this.ast = [];
    for (let d = 700; d < this.len - 300;) {
      const nx = rnd();   // 0..1 across the screen, so every screen width (and both devices) get the same field
      const a = makeAsteroid(0, 0, 14 + rnd() * 18 + leg * 2, rnd);
      a.wd = d; a.nx = nx; a.drift = (rnd() - 0.5) * 0.25;
      this.ast.push(a);
      d += (90 + rnd() * 170) / (1 + leg * 0.3);
    }
    this.picks = [];
    for (let d = 500; d < this.len - 300; d += 260 + rnd() * 260) {
      this.picks.push({ wd: d, nx: rnd(), x: 0, kind: rnd() < 0.5 ? 'tokens' : ['stone', 'metal', 'gold', 'diamond'][Math.floor(rnd() * rnd() * 4)], b: rnd() * 6 });
    }
  },
  screenY(wd) { return this.BASE_Y - (wd - this.dist); },
  update(dt) {
    this.st += dt;
    if (pressed.Escape && !game.modal) { game.modal = makePauseModal(); return; }
    this.scroll += (this.state === 'warp' ? 2500 : this.speed) * dt;
    if (this.state === 'warp' && this.st > 1.5) { this.state = 'fly'; this.st = 0; }
    if (this.state === 'fly' || this.state === 'leave') {
      this.dist += this.speed * dt;
      // flying together: Llama 2 gently follows Llama 1's distance so the two rockets stay side by side
      const f = Net.friend;
      if (Coop.together && Net.role === 'guest' && f && f.scene === 'space' && f.leg === this.leg && f.d != null && this.state === 'fly') {
        const diff = f.d - this.dist;
        if (Math.abs(diff) < 1500) this.dist += diff * Math.min(1, dt * 2);
      }
      if (this.state === 'leave' && this.st > 1.6) { this.state = 'fly'; this.st = 0; }
      if (this.dist >= this.len) { this.state = 'arrive'; this.st = 0; }
    }
    if (this.state === 'arrive' && this.st > 2.2) { this.state = 'prompt'; game.modal = makePlanetPrompt(this.leg); }
    this.updateRocket(dt);
    this.updateThings(dt);
    Net.sendPos({ scene: 'space', leg: this.leg, d: this.dist, dist: this.dist + (this.BASE_Y - this.r.y), nx: this.r.x / W, tilt: this.r.tilt });
  },
  updateRocket(dt) {
    const r = this.r;
    r.inv -= dt; r.flash -= dt;
    this.shieldFlash = this.shieldFlash.map(v => Math.max(0, v - dt));
    if (r.crashed > 0) {
      r.crashed -= dt;
      if (r.crashed <= 0) { r.hull = 3; r.inv = 2.5; r.vx = r.vy = 0; r.y = this.BASE_Y; toast('Rescue Llama fixed your rocket! Go go go! 🦙', '#7bdc6b'); }
      return;
    }
    const a = moveAxis();
    const acc = 1200 + this.a.steer * 600, max = 270 + this.a.steer * 110;
    r.wt += dt;
    const wf = (Math.sin(r.wt * 2.1) + Math.sin(r.wt * 3.7 + 1.3)) * 0.5 * this.a.wobble * 600;
    r.vx += (a.x * acc + wf) * dt;
    r.vy += a.y * acc * 0.8 * dt;
    r.vx -= r.vx * 4.2 * dt; r.vy -= r.vy * 4.2 * dt;
    r.vx = clamp(r.vx, -max, max); r.vy = clamp(r.vy, -max, max);
    r.x += r.vx * dt;
    r.y = clamp(r.y + r.vy * dt, 200, H - 20);
    // the shield keeps you on course: bounce off the edges
    const half = this.halfWidth();
    if (r.x - half < 26) { r.x = 26 + half; r.vx = Math.abs(r.vx) * 0.9 + 220; this.bounce(0); }
    if (r.x + half > W - 26) { r.x = W - 26 - half; r.vx = -Math.abs(r.vx) * 0.9 - 220; this.bounce(1); }
    r.tilt = r.vx / max * 0.3 + wf / 600 * 0.15;
    if (fixPressed()) this.fixWing();
    if (Math.random() < 0.7) particles.push({ x: r.x + rand(-5, 5), y: r.y + 10, vx: rand(-20, 20), vy: rand(120, 200), life: rand(0.2, 0.45), max: 0.45, size: rand(3, 6), color: pick(['#ffd23f', '#ff8c1a', '#fff3b0']), g: 0 });
  },
  S: 18,
  halfWidth() { return rocketSize(this.design, this.S).w / 2; },
  bounce(side) {
    if (this.shieldFlash[side] > 0.3) return;
    this.shieldFlash[side] = 0.6;
    Sfx.bounce();
    burst(side ? W - 20 : 20, this.r.y - 30, 12, ['#7fe8ff', '#fff'], { speed: 160, g: 0 });
  },
  hitBox() {
    const sz = rocketSize(this.design, this.S), r = this.r;
    return R(r.x - sz.w * 0.35, r.y - sz.h, sz.w * 0.7, sz.h);
  },
  updateThings(dt) {
    const r = this.r;
    for (const a of this.ast) { a.rot += a.vr * dt; a.x = 60 + a.nx * (W - 120) + a.drift * (this.dist - a.wd + 600); a.y = this.screenY(a.wd); }
    for (const p of this.picks) p.x = 70 + p.nx * (W - 140);
    for (const d of this.debris) { d.x += d.vx * dt; d.y += d.vy * dt; d.rot += d.vr * dt; d.vy += 200 * dt; }
    this.debris = this.debris.filter(d => d.y < H + 80);
    if (r.crashed > 0) return;
    const hb = this.hitBox();
    for (const p of this.picks) {
      if (p.dead) continue;
      const y = this.screenY(p.wd);
      if (y > -20 && y < H + 20 && Math.hypot(p.x - r.x, y - (r.y - hb.h / 2)) < 30 + hb.w / 3) {
        p.dead = true;
        game.save.inv[p.kind]++;
        Sfx.coin();
        floatText('+1 ' + MAT_BY_ID[p.kind].icon, p.x, y - 10, MAT_BY_ID[p.kind].color);
      }
    }
    if (r.inv > 0) return;
    for (const a of this.ast) {
      if (a.dead || a.y < -50 || a.y > H + 50) continue;
      const nx = clamp(a.x, hb.x, hb.x + hb.w), ny = clamp(a.y, hb.y, hb.y + hb.h);
      if (Math.hypot(a.x - nx, a.y - ny) < a.r * 0.8) {
        a.dead = true;
        burst(a.x, a.y, 16, ['#7a6a5c', '#a08c7a', '#ffb020'], { speed: 220 });
        this.hit();
        break;
      }
    }
  },
  hit() {
    const r = this.r, cells = this.design.cells;
    r.inv = 1.6; r.flash = 1.6; game.shake = 10; Sfx.hit();
    const wings = Object.keys(cells).filter(k => cells[k] === 'wing');
    if (wings.length) {
      const k = pick(wings), { c } = parseKey(k), b = designBounds(cells);
      const side = c < (b.minC + b.maxC) / 2 ? -1 : 1;
      delete cells[k];
      this.lost.push(k);
      this.a = analyzeRocket(this.design);
      this.debris.push({ x: r.x + side * 20, y: r.y - 30, vx: side * rand(120, 220), vy: rand(-180, -60), rot: 0, vr: side * rand(4, 8), side });
      floatText('Lost a wing! 🪽', r.x, r.y - 110, '#ffb3b3');
      if (partCount('wing') > 0) toast(game.touch ? 'Tap 🔧 to put on a spare wing!' : 'Press R to put on a spare wing!', '#ffe066');
      return;
    }
    r.hull--;
    floatText('Ouch! ❤️ -1', r.x, r.y - 110, '#ff8a8a');
    if (r.hull <= 0) {
      r.crashed = 2.5;
      burst(r.x, r.y - 30, 40, ['#ff5a4e', '#ffd23f', '#fff', '#888'], { speed: 320 });
      Sfx.boom();
      toast('Crash! Rescue Llama is fixing your rocket... 🦙🔧', '#ffb3b3');
    }
  },
  fixWing() {
    const r = this.r, cells = this.design.cells;
    if (r.crashed > 0) return;
    if (!this.lost.length) { floatText('Your wings are fine!', r.x, r.y - 110, '#cfe'); return; }
    if (partCount('wing') <= 0) { floatText('No spare wings! 🪽', r.x, r.y - 110, '#ffb3b3'); return; }
    const k = this.lost.pop();
    if (cells[k]) return;
    addPart('wing', -1);
    cells[k] = 'wing';
    this.a = analyzeRocket(this.design);
    Sfx.fix();
    burst(r.x, r.y - 30, 12, ['#ffd23f', '#fff']);
    floatText('Wing fixed! 🔧', r.x, r.y - 110, '#7bdc6b');
  },
  land(idx) {
    if (idx === PLANETS.length - 1) goTo('win');
    else goTo('planet', { idx });
  },
  skip() {
    game.modal = null;
    this.startLeg(this.leg + 1);
    this.state = 'leave';
    this.st = 0;
    toast(`Next stop: ${PLANETS[this.leg].name}!`, '#ffe066');
  },
  flyHome() {
    Coop.cancel();
    Coop.together = false;
    goTo('bay', { from: 'space' });
    toast('Home sweet home! 🏠', '#ffe066');
  },
  draw() {
    const r = this.r;
    ctx.fillStyle = '#05061a'; ctx.fillRect(0, 0, W, H);
    if (this.state === 'warp') drawStars(this.scroll, 1, 80); else drawStars(this.scroll * 0.3);
    this.drawPlanets();
    for (const p of this.picks) {
      if (p.dead) continue;
      const y = this.screenY(p.wd);
      if (y > -30 && y < H + 30) { p.b += 0.05; drawMat(p.kind, p.x, y + Math.sin(p.b) * 4, 1.1); }
    }
    for (const a of this.ast) if (!a.dead && a.y > -50 && a.y < H + 50) drawAsteroid(a);
    for (const d of this.debris) {
      ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(d.rot);
      drawPart('wing', -this.S / 2, -this.S / 2, this.S, d.side < 0 ? { '1,0': 'body' } : { '-1,0': 'body' }, 0, 0, 0);
      ctx.restore();
    }
    this.drawFriend();
    if (r.crashed > 0) {
      text('🦙🔧', r.x, r.y - 40, { size: 36 });
      text('Fixing...', r.x, r.y, { size: 16, color: '#ffe066', stroke: '#000', strokeW: 4 });
    } else {
      const blink = r.flash > 0 && Math.floor(r.flash * 10) % 2 === 0;
      drawRocketDesign(this.design, r.x, r.y, { s: this.S, flame: 1, tilt: r.tilt, alpha: blink ? 0.4 : 1, puff: r.vx });
    }
    this.drawShields();
    this.drawHud();
    drawTouchControls({ fix: true });
  },
  drawShields() {
    for (const side of [0, 1]) {
      const x = side ? W - 26 : 0, fl = this.shieldFlash[side];
      const g = ctx.createLinearGradient(side ? W : 0, 0, side ? W - 26 : 26, 0);
      g.addColorStop(0, `rgba(110,220,255,${0.45 + fl})`); g.addColorStop(1, 'rgba(110,220,255,0)');
      ctx.fillStyle = g; ctx.fillRect(x, 0, 26, H);
      ctx.strokeStyle = `rgba(160,240,255,${0.3 + fl})`; ctx.lineWidth = 2;
      for (let y = (this.scroll * 0.5) % 40 - 40; y < H; y += 40) {
        ctx.beginPath(); ctx.moveTo(side ? W - 6 : 6, y); ctx.lineTo(side ? W - 18 : 18, y + 20); ctx.lineTo(side ? W - 6 : 6, y + 40); ctx.stroke();
      }
    }
  },
  drawPlanets() {
    const p = clamp(this.dist / this.len, 0, 1);
    if (this.state === 'fly' || this.state === 'warp') drawPlanet(W / 2, 90, 10 + 45 * p, this.leg);
    else if (this.state === 'arrive' || this.state === 'prompt') {
      const k = this.state === 'prompt' ? 1 : easeOut(clamp(this.st / 2.2, 0, 1));
      drawPlanet(W / 2, lerp(90, 210, k), lerp(55, 230, k), this.leg);
    } else if (this.state === 'leave') {
      const k = clamp(this.st / 1.6, 0, 1);
      drawPlanet(W / 2, 90, 10, this.leg);
      drawPlanet(W / 2, lerp(210, H + 320, k * k), 230 + k * 60, this.leg - 1);
    }
  },
  drawFriend() {
    const f = Net.friend;
    if (!Net.connected || !f || f.scene !== 'space' || f.leg !== this.leg) return;
    const y = this.BASE_Y - (f.dist - this.dist);
    const scarf = Net.friendScarf(), fx = (f.nx || 0.5) * W;
    if (y < 40) { text(`▲ ${Net.friendName()} is ahead!`, clamp(fx, 90, W - 90), 130, { size: 14, color: scarf, stroke: '#000', strokeW: 4 }); return; }
    if (y > H + 20) { text(`▼ ${Net.friendName()} is behind`, clamp(fx, 90, W - 90), H - 20, { size: 14, color: scarf, stroke: '#000', strokeW: 4 }); return; }
    if (f.design) drawRocketDesign(f.design, fx, y, { s: this.S, flame: 1, tilt: f.tilt || 0, alpha: 0.7 });
    text(Net.friendName(), fx, y + 22, { size: 13, color: scarf, stroke: '#000', strokeW: 3 });
  },
  drawHud() {
    const r = this.r;
    panel(38, 10, 270, 62, { r: 12 });
    text('❤️'.repeat(Math.max(0, r.hull)) + '🤍'.repeat(3 - Math.max(0, r.hull)), 52, 30, { size: 16, align: 'left' });
    text(`🪽 Wings on: ${this.a.wingsL + this.a.wingsR}   Spares: ${partCount('wing')}`, 52, 55, { size: 14, align: 'left' });
    if (button('⏸', W - 82, 12, 44, 38, { size: 18, color: '#9aa3c0' }) && !game.modal) game.modal = makePauseModal();
    if (!game.touch && button(`🔧 Fix (R)`, 208, 16, 92, 26, { size: 13, enabled: this.lost.length > 0 && partCount('wing') > 0 })) this.fixWing();
    // progress to the next planet
    const p = clamp(this.dist / this.len, 0, 1), x0 = W / 2 - 140, x1 = W / 2 + 280;
    rr(x0, 20, x1 - x0, 14, 7); ctx.fillStyle = 'rgba(255,255,255,.15)'; ctx.fill();
    rr(x0, 20, (x1 - x0) * p, 14, 7); ctx.fillStyle = '#ffe066'; ctx.fill();
    text(this.leg === 0 ? '🌍' : '🪐', x0 - 14, 27, { size: 16 });
    text(PLANETS[this.leg].name, x1 + 8, 27, { size: 14, align: 'left', color: '#ffe066' });
    text('🚀', x0 + (x1 - x0) * p, 47, { size: 16 });
    const fr = Net.friendLabel();
    if (fr) text(fr, W / 2, 66, { size: 13, color: '#9fd3ff' });
    if (!game.touch) text('Move: W A S D / arrows · Fix wing: R · Pause: ESC', W / 2, H - 12, { size: 13, color: 'rgba(255,255,255,.5)' });
  },
};

function makePlanetPrompt(idx) {
  let choice = null;   // 'land' | 'go' | 'home' once this player has picked
  const act = c => { if (c === 'land') Space.land(idx); else if (c === 'go') Space.skip(); else Space.flyHome(); };
  return {
    closable: false,
    draw() {
      const P = PLANETS[idx], last = idx === PLANETS.length - 1, tier = Space.a.tier;
      const blocked = !last && !canFlyTo(idx + 1, tier);
      const y0 = 320;
      panel(190, y0, 580, 240);
      text(`Land on ${P.name}?`, 480, y0 + 38, { size: 32, color: '#ffe066' });
      wrapText(P.about, 480, y0 + 80, 520, 22, { size: 17 });
      if (blocked) {
        // the rocket can't keep going, so say exactly what each button does instead of a plain "No"
        const need = PLANETS[idx + 1].need, eng = PARTS['engine' + need];
        const cost = Object.entries(eng.cost).map(([k, n]) => `${n} ${MAT_BY_ID[k].icon}`).join(' + ');
        wrapText(`🔒 To fly on to ${PLANETS[idx + 1].name} you need a ${eng.name} (${cost}).`, 480, y0 + 124, 540, 20, { size: 15, color: '#ffb3b3' });
      }
      if (last) text('This is the very last planet!', 480, y0 + 124, { size: 16, color: '#ffb3b3' });
      const yesLabel = blocked ? '🛬 Land here' : 'YES! Land 🛬';
      const noLabel = blocked || last ? '🏠 Fly home' : 'No, keep going 🚀';
      const said = { land: 'wants to LAND 🛬', go: 'wants to keep going 🚀', home: 'is flying home 🏠' };
      const fa = Coop.together && Coop.friendAnswer(idx);
      if (choice) {
        const r = Coop.answer(idx, choice);
        if (r !== 'wait') { act(r); return; }
        text(`Waiting for ${Net.friendName()} to choose...`, 480, y0 + 195, { size: 20, color: '#9fd3ff' });
        return;
      }
      if (fa) text(`${Net.friendName()} ${said[fa]}`, 480, y0 + 150, { size: 16, color: Net.friendScarf() });
      const yes = button(yesLabel, 220, y0 + 168, 250, 54, { size: 22, color: '#7bdc6b', hot: '#a4f294' }) || pressed.KeyY;
      const no = button(noLabel, 490, y0 + 168, 250, 54, { size: 20, color: blocked || last ? '#9fd3ff' : '#ff8a8a', hot: '#ffb3b3' }) || pressed.KeyN;
      if (yes) choice = 'land';
      else if (no) choice = blocked || last ? 'home' : 'go';
    },
  };
}
function makePauseModal() {
  return {
    live: Coop.together,   // flying together: the game keeps going so you don't fall behind
    draw() {
      panel(300, 190, 360, 220);
      text(Coop.together ? 'MENU' : 'PAUSED', 480, 230, { size: 34, color: '#ffe066' });
      if (button('Keep flying 🚀', 340, 270, 280, 50, { size: 20 })) game.modal = null;
      else if (button('Fly home 🏠', 340, 335, 280, 50, { size: 20, color: '#9fd3ff' })) Space.flyHome();
    },
  };
}

export { Launch, Space, canFlyTo, legLength, makeBoomModal, makePauseModal, makePlanetPrompt };
