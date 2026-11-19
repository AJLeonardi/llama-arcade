// I Need Money: start with $5 and build a theme park. You walk around in first person with a builder arm on
// your right hand. Guests pay for rides; walk up to a ride (or hire workers) to collect the cash.
import * as THREE from 'three';
import { BUILD, startPwa, reloadForUpdate } from '../../../shared/pwa';
import { gameStorage } from '../../../shared/storage';
import { goToArcade } from '../../../shared/home';
import { Controls } from '../../../shared/controls';
import { Confetti } from '../../../shared/confetti';
import { unlock, tone } from '../../../shared/sfx';
import { RIDES, RIDE_BY_ID, biggerCost, dropHeight, hireCost, money } from './sim/catalog';
import { GATE_Z, HALF, Park, ParkEvent, Ride, Save } from './sim/park';
import { RideModel, buildRide, disposeModel } from './view/rides';
import { Guests, Helpers, Puffs, emojiTex, labelSprite, makeWorld } from './view/world';
import { Arm } from './view/arm';

const store = gameStorage('i-need-money');
let park = Park.load(store.load<Save>('save'));

// ---------------------------------------------------------------- three.js

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 3000);
camera.rotation.order = 'YXZ';
scene.add(camera);
let fitW = 0, fitH = 0;
function fit() {
  const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
  if (w === fitW && h === fitH) return;
  (fitW = w), (fitH = h);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
makeWorld(scene);
const guestView = new Guests(scene);
const helperView = new Helpers(scene);
const puffs = new Puffs(scene);
const arm = new Arm(camera, scene);
const confetti = new Confetti(scene);

// ---------------------------------------------------------------- sounds

const sfx = {
  cash: () => {
    tone(1318, 0.08, { type: 'square', vol: 0.06 });
    tone(1760, 0.25, { type: 'square', vol: 0.06, at: 0.08 });
  },
  build: () => tone(160, 1.4, { to: 1400, type: 'sawtooth', vol: 0.035 }),
  done: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.09, at: i * 0.09 })),
  broke: () => {
    tone(300, 0.35, { to: 70, type: 'sawtooth', vol: 0.07 });
    tone(200, 0.3, { to: 60, type: 'square', vol: 0.05, at: 0.25 });
  },
  click: () => tone(700, 0.05, { type: 'triangle', vol: 0.06 }),
  nope: () => tone(180, 0.2, { type: 'square', vol: 0.05 }),
  jump: () => tone(400, 0.15, { to: 700, type: 'triangle', vol: 0.05 }),
};

// ---------------------------------------------------------------- the rides' 3D models

interface View {
  holder: THREE.Group;
  model: RideModel;
  level: number;
  sign: THREE.Sprite;
  signKey: string;
  cash: THREE.Sprite;
  smoke: number;
}
const views = new Map<number, View>();
const cashMat = new THREE.SpriteMaterial({ map: emojiTex('💵'), depthWrite: false });

function syncViews() {
  for (const r of park.rides) {
    let v = views.get(r.id);
    if (v && v.level !== r.level) {
      v.holder.remove(v.model.group);
      disposeModel(v.model.group);
      v.model = buildRide(RIDE_BY_ID[r.type], r.level);
      v.holder.add(v.model.group);
      v.level = r.level;
      v.signKey = '';
    }
    if (!v) {
      const holder = new THREE.Group();
      holder.position.set(r.x, 0, r.z);
      holder.rotation.y = r.rot;
      const model = buildRide(RIDE_BY_ID[r.type], r.level);
      holder.add(model.group);
      const cash = new THREE.Sprite(cashMat);
      cash.scale.setScalar(1.6);
      scene.add(holder);
      scene.add(cash);
      v = { holder, model, level: r.level, sign: new THREE.Sprite(), signKey: '', cash, smoke: 0 };
      views.set(r.id, v);
    }
    if (v.model.lap) r.cycle = v.model.lap;
    else if (r.type !== 'drop') r.cycle = RIDE_BY_ID[r.type].cycle;
  }
  for (const [id, v] of views) {
    if (park.ride(id)) continue;
    scene.remove(v.holder, v.sign, v.cash);
    disposeModel(v.holder);
    v.sign.material.map?.dispose();
    v.sign.material.dispose();
    views.delete(id);
  }
}

function updateViews(dt: number, time: number) {
  for (const r of park.rides) {
    const v = views.get(r.id)!;
    const grow = Math.min(1, r.age / 1.5);
    const s = grow < 1 ? 1 - Math.pow(1 - grow, 3) : 1;
    v.holder.scale.set(s, s, s);
    v.model.update(r.phase, r.running && !r.broken, dt);
    // The sign over the ride.
    const t = RIDE_BY_ID[r.type];
    const key = r.broken ? 'broken' : `${r.level}`;
    if (key !== v.signKey) {
      v.signKey = key;
      scene.remove(v.sign);
      v.sign.material.map?.dispose();
      v.sign.material.dispose();
      const name = r.type === 'drop' && r.level ? `${t.emoji} ${t.name} ×${r.level + 1}` : `${t.emoji} ${t.name}`;
      v.sign = r.broken ? labelSprite('🔧 BROKEN! 🔧', '#fff', 'rgba(220,30,30,0.85)') : labelSprite(name);
      scene.add(v.sign);
    }
    v.sign.position.set(r.x, v.model.top * s + 1.5, r.z);
    const big = Math.max(1, v.model.top / 12);
    v.sign.scale.set(8 * big, 1.5 * big, 1);
    // Money waiting at the entrance.
    const e = park.entrance(r);
    v.cash.visible = r.cash > 0;
    v.cash.position.set(e.x, 2.2 + Math.sin(time * 3 + r.id) * 0.25, e.z);
    // Smoke from broken rides.
    if (r.broken) {
      v.smoke -= dt;
      if (v.smoke <= 0) {
        v.smoke = 0.25;
        puffs.smoke(new THREE.Vector3(r.x, Math.min(v.model.top, 20) * 0.6, r.z));
      }
    }
  }
}

// ---------------------------------------------------------------- you

const you = { x: 0, z: GATE_Z - 22, y: 0, vy: 0, yaw: 0, pitch: -0.05 };
const EYE = 1.7;
let riding: Ride | null = null;
let playing = false;

// ---------------------------------------------------------------- the screen (DOM)

const ui = document.getElementById('ui')!;
ui.innerHTML = `
  <div class="money" id="money">$5</div>
  <div class="top-btns" id="topBtns">
    <button class="big-btn green" id="buildBtn">🏗️ Build</button>
    <button class="big-btn blue" id="hireBtn">👷 Hire</button>
    <button class="icon-btn" id="pauseBtn">⏸️</button>
  </div>
  <div class="crosshair" id="cross"></div>
  <button class="jump" id="jump">⬆️</button>
  <div class="panel hidden" id="panel"></div>
  <div class="toast hidden" id="toast"></div>
  <div class="screen hidden" id="menu"></div>
  <div class="screen title" id="title">
    <h1>💵 I NEED MONEY 💵</h1>
    <p>You start with only <b>$5</b>. Build rides and roller coasters with your builder arm. Guests pay to ride. Get rich!</p>
    <div class="row">
      <button class="big-btn green" id="play">▶️ Play</button>
      <button class="big-btn grey" id="arcade">🏠 Arcade</button>
    </div>
  </div>
  <button class="update hidden" id="update">✨ New version! Tap to get it</button>
  <div class="build-no">build ${BUILD}</div>
`;
const $ = (id: string) => document.getElementById(id)!;
const controls = new Controls(canvas, $('jump'));

let shownMoney = -1;
function showMoney() {
  const m = Math.floor(park.money);
  if (m === shownMoney) return;
  const up = m > shownMoney && shownMoney >= 0;
  shownMoney = m;
  $('money').textContent = money(m);
  if (up) {
    $('money').classList.add('bump');
    setTimeout(() => $('money').classList.remove('bump'), 150);
  }
}

function gain(n: number) {
  const d = document.createElement('div');
  d.className = 'gain';
  d.textContent = `+${money(n)}`;
  ui.append(d);
  setTimeout(() => d.remove(), 1200);
}

let toastTimer = 0;
function toast(text: string, secs = 2.5) {
  $('toast').textContent = text;
  $('toast').classList.remove('hidden');
  toastTimer = secs;
}

function setPlaying(on: boolean) {
  playing = on;
  controls.reset();
  controls.enabled = on;
}

$('play').onclick = () => {
  unlock();
  sfx.click();
  $('title').classList.add('hidden');
  setPlaying(true);
  if (!park.rides.length) toast('Tap 🏗️ Build to make your first ride!', 6);
};
$('arcade').onclick = () => goToArcade();

// ---- menus ----

function openMenu(html: string) {
  setPlaying(false);
  $('menu').innerHTML = html;
  $('menu').classList.remove('hidden');
  $('menu').scrollTop = 0;
}
function closeMenu() {
  $('menu').classList.add('hidden');
  setPlaying(true);
}

function openBuild() {
  if (placing) cancelPlace();
  sfx.click();
  const cards = RIDES.map((t) => {
    const ok = park.money >= t.cost;
    const what = t.kind === 'stand' ? `sells for ${money(t.ticket)}` : `ticket ${money(t.ticket)}`;
    return `<button class="card ${ok ? '' : 'locked'}" data-id="${t.id}">
      <div class="e">${t.emoji}</div><div class="n">${t.name}</div>
      <div class="p">${money(t.cost)}</div><div class="t">${what}${t.grows ? ' • grows BIGGER!' : ''}</div></button>`;
  }).join('');
  openMenu(`<button class="big-btn red close" id="x">✖</button><h2>🏗️ What do you want to build?</h2>
    <p>You have <b>${money(park.money)}</b></p><div class="cards">${cards}</div>`);
  $('x').onclick = () => (sfx.click(), closeMenu());
  $('menu').querySelectorAll<HTMLButtonElement>('.card').forEach((b) => {
    b.onclick = () => {
      const t = RIDE_BY_ID[b.dataset.id!];
      if (park.money < t.cost) {
        sfx.nope();
        toast(`You need ${money(t.cost - park.money)} more!`);
        return;
      }
      closeMenu();
      startPlace(t.id);
    };
  });
}

function openHire() {
  sfx.click();
  const card = (kind: 'worker' | 'mechanic', e: string, name: string, what: string) => {
    const cost = hireCost(kind, park.count(kind));
    return `<button class="card ${park.money >= cost ? '' : 'locked'}" data-k="${kind}">
      <div class="e">${e}</div><div class="n">${name}</div><div class="t">${what}</div>
      <div class="p">${money(cost)}</div><div class="t">You have ${park.count(kind)}</div></button>`;
  };
  openMenu(`<button class="big-btn red close" id="x">✖</button><h2>👷 Hire helpers</h2>
    <p>You have <b>${money(park.money)}</b></p>
    <div class="hire">
      ${card('worker', '👷', 'Worker', 'Collects money from your rides and gives it to you')}
      ${card('mechanic', '🔧', 'Mechanic', 'Runs to broken rides and fixes them')}
    </div>`);
  $('x').onclick = () => (sfx.click(), closeMenu());
  $('menu').querySelectorAll<HTMLButtonElement>('.card').forEach((b) => {
    b.onclick = () => {
      const k = b.dataset.k as 'worker' | 'mechanic';
      if (!park.hire(k)) {
        sfx.nope();
        toast(`You need ${money(hireCost(k, park.count(k)) - park.money)} more!`);
        return;
      }
      sfx.done();
      save();
      openHire();
      toast(k === 'worker' ? 'You hired a worker! 👷' : 'You hired a mechanic! 🔧');
    };
  });
}

let resetArmed = false;
function openPause() {
  sfx.click();
  resetArmed = false;
  openMenu(`<h2>⏸️ Paused</h2>
    <p>Walk: left thumb (or WASD). Look: drag on the right (or the mouse). Walk up to a ride to collect its money,
    ride it, fix it, or make it bigger. Rides break sometimes: fix them yourself or hire a mechanic.</p>
    <p>Total money earned: <b>${money(park.earned)}</b> • Rides: <b>${park.rides.length}</b></p>
    <div class="row">
      <button class="big-btn green" id="resume">▶️ Keep playing</button>
      <button class="big-btn grey" id="home">🏠 Arcade</button>
      <button class="big-btn red" id="reset">🔄 Start over</button>
    </div><p style="font-size:12px;opacity:.6">build ${BUILD}</p>`);
  $('resume').onclick = () => (sfx.click(), closeMenu());
  $('home').onclick = () => (save(), goToArcade());
  $('reset').onclick = () => {
    if (!resetArmed) {
      resetArmed = true;
      $('reset').textContent = '😮 Really? Tap again';
      return;
    }
    park = new Park();
    store.save('save', park.save());
    getOff();
    syncViews();
    Object.assign(you, { x: 0, z: GATE_Z - 22, y: 0, vy: 0, yaw: 0, pitch: -0.05 });
    closeMenu();
    toast('A brand new park! You have $5.', 4);
  };
}

$('buildBtn').onclick = openBuild;
$('hireBtn').onclick = openHire;
$('pauseBtn').onclick = openPause;

// ---- placing a new ride ----

let placing: { type: string; model: RideModel; ring: THREE.Mesh; x: number; z: number; rot: number; ok: boolean } | null = null;
const ringOk = new THREE.MeshBasicMaterial({ color: '#40c057', transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
const ringBad = new THREE.MeshBasicMaterial({ color: '#fa5252', transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });

function startPlace(type: string) {
  const t = RIDE_BY_ID[type];
  const model = buildRide(t, 0);
  const ring = new THREE.Mesh(new THREE.RingGeometry(t.r - 0.6, t.r, 48).rotateX(-Math.PI / 2), ringOk);
  scene.add(model.group, ring);
  placing = { type, model, ring, x: 0, z: 0, rot: 0, ok: false };
  if (riding) getOff();
  toast('Look where you want it, then tap ✅', 3);
  panelKey = '?';
}

function cancelPlace() {
  if (!placing) return;
  scene.remove(placing.model.group, placing.ring);
  disposeModel(placing.model.group);
  placing.ring.geometry.dispose();
  placing = null;
  panelKey = '?';
}

function updatePlace(time: number) {
  if (!placing) return;
  const t = RIDE_BY_ID[placing.type];
  const d = t.r + 4;
  placing.x = Math.round(you.x - Math.sin(you.yaw) * d);
  placing.z = Math.round(you.z - Math.cos(you.yaw) * d);
  placing.rot = you.yaw;
  placing.ok = !park.blocked(placing.type, placing.x, placing.z);
  placing.model.group.position.set(placing.x, 0.3 + Math.sin(time * 3) * 0.2, placing.z);
  placing.model.group.rotation.y = placing.rot;
  placing.ring.position.set(placing.x, 0.08, placing.z);
  placing.ring.material = placing.ok ? ringOk : ringBad;
}

function confirmPlace() {
  if (!placing) return;
  const why = park.blocked(placing.type, placing.x, placing.z);
  if (why) {
    sfx.nope();
    toast(`${why}! Turn to find a free spot.`);
    return;
  }
  const t = RIDE_BY_ID[placing.type];
  const r = park.build(placing.type, placing.x, placing.z, placing.rot);
  if (!r) {
    sfx.nope();
    toast(`You need ${money(t.cost)}!`);
    return;
  }
  const at = new THREE.Vector3(placing.x, 2, placing.z);
  cancelPlace();
  syncViews();
  arm.zap(at, 1.5);
  sfx.build();
  setTimeout(() => {
    sfx.done();
    confetti.burst(at.clone().setY(views.get(r.id)?.model.top ?? 5));
  }, 1500);
  toast(`You built the ${t.name}! ${t.emoji}`);
  save();
}

// ---- the panel at the bottom: placing, riding, or the ride you're next to ----

let panelKey = '?';
let sellArmed = -1;
function updatePanel() {
  const p = $('panel');
  let key = '';
  let html = '';
  const near = !riding && !placing ? park.near(you) : undefined;
  if (sellArmed >= 0 && (!near || near.id !== sellArmed)) sellArmed = -1;
  if (placing) {
    const t = RIDE_BY_ID[placing.type];
    key = `place|${placing.type}|${placing.ok}`;
    html = `<div class="name">${t.emoji} ${t.name} ${money(t.cost)}</div>
      <div class="info">${placing.ok ? 'Point your arm where it goes' : 'Something is in the way: turn or walk'}</div>
      <div class="row"><button class="big-btn green" data-a="place" ${placing.ok ? '' : 'disabled'}>✅ Build it!</button>
      <button class="big-btn red" data-a="cancel">❌</button></div>`;
  } else if (riding) {
    const t = RIDE_BY_ID[riding.type];
    key = `ride|${riding.id}`;
    html = `<div class="name">${t.emoji} Wheee!</div><div class="row"><button class="big-btn red" data-a="off">🚪 Get off</button></div>`;
  } else if (near) {
    const t = RIDE_BY_ID[near.type];
    const fixing = park.youFixing === near.id;
    const bc = biggerCost(near.level);
    key = `near|${near.id}|${near.broken}|${fixing}|${near.level}|${park.money >= bc}|${sellArmed === near.id}`;
    const info = near.broken
      ? 'It broke! Fix it, or hire a mechanic.'
      : t.kind === 'stand'
        ? `Sells for ${money(park.ticket(near))}`
        : `Ticket ${money(park.ticket(near))} • ${park.seats(near)} seats${t.grows ? ` • ${dropHeight(near.level)} m tall` : ''}`;
    const btns: string[] = [];
    if (near.broken) {
      btns.push(fixing ? `<div style="width:220px"><div class="bar"><div id="fixbar"></div></div>🔧 Fixing…</div>` : `<button class="big-btn" data-a="fix">🔧 Fix it!</button>`);
    } else if (t.kind !== 'stand') btns.push(`<button class="big-btn purple" data-a="ride">🎢 Ride it!</button>`);
    if (t.grows) btns.push(`<button class="big-btn green" data-a="bigger" ${park.money >= bc ? '' : 'disabled'}>⬆️ BIGGER! ${money(bc)}</button>`);
    btns.push(`<button class="big-btn grey" data-a="sell">${sellArmed === near.id ? 'Sure? Tap again' : `💰 Sell ${money(park.sellPrice(near))}`}</button>`);
    html = `<div class="name">${t.emoji} ${t.name}${near.level ? ` ×${near.level + 1}` : ''}</div><div class="info">${info}</div><div class="row">${btns.join('')}</div>`;
  }
  if (key !== panelKey) {
    panelKey = key;
    p.classList.toggle('hidden', !key);
    p.innerHTML = html;
    p.querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.onclick = () => panelAction(b.dataset.a!, near)));
  }
  const bar = document.getElementById('fixbar');
  if (bar && near) bar.style.width = `${Math.round(near.fix * 100)}%`;
}

function panelAction(a: string, near: Ride | undefined) {
  unlock();
  if (a === 'place') return confirmPlace();
  if (a === 'cancel') return (sfx.click(), cancelPlace());
  if (a === 'off') return (sfx.click(), getOff());
  if (!near) return;
  if (a === 'fix') {
    park.youFixing = near.id;
    sfx.click();
    toast('Stay close while you fix it! 🔧');
  } else if (a === 'ride') {
    sfx.click();
    riding = near;
    // Look out, away from the middle of the ride.
    you.yaw = near.rot + Math.PI;
    you.pitch = 0;
  } else if (a === 'bigger') {
    if (park.bigger(near.id)) {
      syncViews();
      arm.zap(new THREE.Vector3(near.x, dropHeight(near.level) * 0.6, near.z), 1.2);
      sfx.build();
      setTimeout(sfx.done, 1200);
      toast(`BIGGER! Now it's ${dropHeight(near.level)} m tall! ⬆️`);
      save();
    } else sfx.nope();
  } else if (a === 'sell') {
    if (sellArmed !== near.id) {
      sellArmed = near.id;
    } else {
      const t = RIDE_BY_ID[near.type];
      park.sell(near.id);
      sellArmed = -1;
      syncViews();
      sfx.cash();
      toast(`You sold the ${t.name}.`);
      save();
    }
  }
  panelKey = '?';
}

function getOff() {
  if (!riding) return;
  // Step out by the entrance, looking back at the ride.
  const e = park.entrance(riding);
  you.x = e.x + Math.sin(riding.rot) * 2;
  you.z = e.z + Math.cos(riding.rot) * 2;
  you.yaw = riding.rot;
  you.pitch = 0.15;
  you.y = you.vy = 0;
  riding = null;
  camera.up.set(0, 1, 0);
  panelKey = '?';
}

// ---- keyboard ----

window.addEventListener('keydown', (e) => {
  if (!playing && e.code !== 'Escape') return;
  if (e.code === 'KeyB') openBuild();
  else if (e.code === 'KeyH') openHire();
  else if (e.code === 'Enter' && placing) confirmPlace();
  else if (e.code === 'Escape') {
    if (placing) cancelPlace();
    else if (!$('menu').classList.contains('hidden')) closeMenu();
    else if (playing) openPause();
  }
});
canvas.addEventListener('pointerdown', () => unlock());

// ---------------------------------------------------------------- events from the park

function onEvent(e: ParkEvent) {
  if (e.t === 'collect') {
    if (e.by === 'you') {
      puffs.money(new THREE.Vector3(e.x, 0, e.z), arm.tip, Math.ceil(Math.log2(e.amount + 1)) + 1);
      sfx.cash();
    }
    gain(e.amount);
  } else if (e.t === 'tip') {
    sfx.cash();
    gain(e.amount);
    toast('A guest gave you a tip! 💵', 1.8);
  } else if (e.t === 'broke') {
    const r = park.ride(e.ride);
    if (r) toast(`Oh no! The ${RIDE_BY_ID[r.type].name} broke! 🔧`, 3);
    sfx.broke();
    if (riding && riding.id === e.ride) getOff();
  } else if (e.t === 'fixed') {
    const r = park.ride(e.ride);
    if (r) toast(`The ${RIDE_BY_ID[r.type].name} is fixed! ✅`);
    sfx.done();
  }
}

function save() {
  store.save('save', park.save());
}

// ---------------------------------------------------------------- the loop

const SPEED = 9;
let last = performance.now();
let time = 0;
let saveWait = 4;
const fwd = new THREE.Vector3();
syncViews();

function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;
  fit();

  // Look and walk.
  let walking = 0;
  if (playing) {
    you.yaw -= controls.lookX + controls.keyTurn() * dt * 2;
    you.pitch = Math.max(-1.3, Math.min(1.3, you.pitch - controls.lookY));
    controls.lookX = controls.lookY = 0;
    if (!riding) {
      const m = controls.moveInput();
      const len = Math.hypot(m.x, m.y);
      const k = len > 1 ? 1 / len : 1;
      const mx = m.x * k, my = m.y * k;
      const sx = Math.cos(you.yaw), sz = -Math.sin(you.yaw);
      const fx = -Math.sin(you.yaw), fz = -Math.cos(you.yaw);
      you.x += (sx * mx + fx * my) * SPEED * dt;
      you.z += (sz * mx + fz * my) * SPEED * dt;
      you.x = Math.max(-HALF + 1, Math.min(HALF - 1, you.x));
      you.z = Math.max(-HALF + 1, Math.min(HALF - 1, you.z));
      walking = Math.min(1, Math.hypot(mx, my));
      if (controls.takeJump() && you.y <= 0) {
        you.vy = 6;
        sfx.jump();
      }
    } else controls.takeJump();
  }
  you.vy -= 18 * dt;
  you.y = Math.max(0, you.y + you.vy * dt);
  if (you.y <= 0) you.vy = 0;

  // The park.
  const events = park.step(dt, playing && !riding ? you : null);
  for (const e of events) onEvent(e);
  if (riding && !park.ride(riding.id)) riding = null;
  if (riding && !riding.running && !riding.broken) {
    riding.running = true;
    riding.phase = 0;
  }
  syncViews();
  updateViews(dt, time);
  guestView.update(park.guests, dt);
  helperView.update(park.helpers, time);
  updatePlace(time);

  // The camera.
  if (riding) {
    const v = views.get(riding.id)!;
    const seat = v.model.seat();
    v.holder.updateMatrixWorld();
    if (seat) {
      const p = v.holder.localToWorld(seat.pos.clone());
      camera.position.copy(p);
      if (seat.dir) {
        const dir = seat.dir.clone().transformDirection(v.holder.matrixWorld);
        const up = (seat.up ?? new THREE.Vector3(0, 1, 0)).clone().transformDirection(v.holder.matrixWorld);
        camera.up.copy(up);
        camera.lookAt(fwd.copy(p).add(dir));
      } else {
        camera.up.set(0, 1, 0);
        camera.rotation.set(you.pitch, you.yaw, 0);
      }
    }
  } else {
    camera.position.set(you.x, EYE + you.y + Math.abs(Math.sin(time * 9)) * 0.05 * walking, you.z);
    camera.rotation.set(you.pitch, you.yaw, 0);
  }
  arm.update(dt, walking, time);
  puffs.update(dt);
  confetti.update(dt);

  // The screen.
  showMoney();
  if (playing) updatePanel();
  else if (panelKey) {
    panelKey = '';
    $('panel').classList.add('hidden');
  }
  if (toastTimer > 0 && (toastTimer -= dt) <= 0) $('toast').classList.add('hidden');
  if ((saveWait -= dt) <= 0) {
    saveWait = 4;
    save();
  }

  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

document.addEventListener('visibilitychange', () => document.hidden && save());
startPwa({
  onUpdate: () => {
    if (!$('title').classList.contains('hidden')) return reloadForUpdate();
    $('update').classList.remove('hidden');
  },
});
$('update').onclick = () => (save(), reloadForUpdate());

(window as unknown as { __money: unknown }).__money = { park: () => park, you, camera, scene, renderer, views };
