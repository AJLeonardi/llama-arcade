// Planet Smash: pick a planet, spin it with a swipe, pick a weapon, tap where it hits.
import * as THREE from 'three';
import { BUILD, startPwa, reloadForUpdate } from '../../../shared/pwa';
import { gameStorage } from '../../../shared/storage';
import { goToArcade } from '../../../shared/home';
import { BODIES, Body, Tab, WEAPONS, Weapon, bodyById, healthPercent, endingFor, heat, hit, weaponById } from './sim/game';
import { loadAll, thumbUrl } from './view/textures';
import { Planet } from './view/planet';
import { makeSpace } from './view/space';
import { Fx } from './view/fx';
import { Shot, blackHole, fire } from './view/weapons';
import { sfx, unlock } from './sfx';

const store = gameStorage('planet-smash');

// ---------- 3D ----------
const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000004);
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 2000);
const lightDir = new THREE.Vector3(-1, 0.45, 0.75).normalize();
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.copy(lightDir).multiplyScalar(10);
const ambient = new THREE.AmbientLight(0x6070a0, 0.5);
scene.add(sun, ambient);
const pull = new THREE.Group(); // holds the planet (the black hole moves and stretches this)
scene.add(pull);

let fx: Fx;
let space: { update(t: number): void };
let planet: Planet | null = null;

// ---------- state ----------
type Mode = 'loading' | 'title' | 'pick' | 'smash';
let mode: Mode = 'loading';
let body: Body = bodyById('earth');
let hp = body.hp;
let ended = false;
let weapon: Weapon = weaponById(store.load<string>('weapon') ?? 'laser');
let tab: Tab = 'planets';
const smashed: Record<string, number> = store.load<Record<string, number>>('smashed') ?? {};
let shownHealth = 100;
let heatShown = 0;
let zoomOut = 1;
let inFlight = 0;
let swallowed = false; // a black hole took it (it doesn't get fiery)
let updateReady = false;

// ---------- screens ----------
const ui = document.getElementById('ui')!;
function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}
function button(cls: string, html: string, onTap: () => void): HTMLButtonElement {
  const b = el('button', cls, html);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    unlock();
    onTap();
  });
  return b;
}

const loading = el('div', 'screen loading', '<div class="big-title">PLANET SMASH</div><div class="sub" id="load-msg">Loading planets…</div>');
const title = el('div', 'screen title hidden');
title.append(
  el('div', 'big-title', 'PLANET<br>SMASH'),
  el('div', 'sub', 'Lasers, asteroids, the Moon and black holes'),
  button('play-btn', '▶ Play', () => { sfx.click(); show('pick'); }),
  button('corner-btn left', '🏠 Arcade', goToArcade),
);
const updateBtn = button('update-btn hidden', '✨ New version! Tap to get it', reloadForUpdate);
const buildTag = el('div', 'build', `build ${BUILD}`);

const pick = el('div', 'screen pick hidden');
const tabs = el('div', 'tabs');
const tabPlanets = button('tab', '🪨<span>Planets</span>', () => { tab = 'planets'; fillCards(); });
const tabGiants = button('tab', '🔥<span>Gas Giants<br>&amp; Stars</span>', () => { tab = 'giants'; fillCards(); });
tabs.append(tabPlanets, tabGiants);
const cards = el('div', 'cards');
const pickHead = el('div', 'pick-head', '<h1>Pick what to smash</h1>');
pickHead.prepend(button('back-btn', '←', () => show('title')));
pick.append(pickHead, tabs, cards);

function fillCards() {
  tabPlanets.classList.toggle('on', tab === 'planets');
  tabGiants.classList.toggle('on', tab === 'giants');
  cards.innerHTML = '';
  for (const b of BODIES.filter((b) => b.tab === tab)) {
    const card = button(`card ${b.kind === 'giant' ? 'giant' : ''}`, '', () => { sfx.click(); startSmash(b); });
    const ball = el('div', `ball ${b.kind === 'star' || b.kind === 'giant' ? 'star' : ''}`);
    ball.style.backgroundImage = `url(${thumbUrl(b.tex)})`;
    if (b.rings) card.append(el('div', 'ring'));
    card.append(ball, el('div', 'name', b.name));
    if (smashed[b.id]) card.append(el('div', 'badge', `💥×${smashed[b.id]}`));
    cards.append(card);
  }
}

const hud = el('div', 'hud hidden');
const backBtn = button('corner-btn left', '← Planets', () => show('pick'));
const nameBox = el('div', 'name-box');
const meter = el('div', 'meter', '<div class="label">❤️ Planet health</div><div class="bar"><div class="fill"></div></div><div class="pct"></div>');
const meterFill = meter.querySelector('.fill') as HTMLDivElement;
const meterPct = meter.querySelector('.pct') as HTMLDivElement;
const toast = el('div', 'toast hidden');
const hint = el('div', 'hint', 'Swipe to spin · Tap to fire');
const camBtn = button('cam-btn', '📸', () => takePhoto());
const weaponsBox = el('div', 'weapons');
const weaponBtns = new Map<string, HTMLButtonElement>();
WEAPONS.forEach((w, i) => {
  const b = button('weapon', `<span class="em">${w.emoji}</span><span class="wn">${w.name}</span><span class="key">${i + 1}</span>`, () => chooseWeapon(w));
  weaponBtns.set(w.id, b);
  weaponsBox.append(b);
});
const done = el('div', 'done hidden');
const doneTitle = el('div', 'done-title');
done.append(
  doneTitle,
  button('done-btn', '🔁 Smash it again', () => startSmash(body)),
  button('done-btn', '🪐 Pick another', () => show('pick')),
  button('done-btn', '📸 Take a picture', () => takePhoto()),
);
hud.append(backBtn, nameBox, meter, hint, camBtn, weaponsBox, done, toast);

const photo = el('div', 'photo hidden');
const photoImg = el('img');
const photoTip = el('div', 'tip', 'Press and hold the picture to save it');
photo.append(
  photoImg,
  photoTip,
  el('div', 'photo-btns'),
);
const photoBtns = photo.querySelector('.photo-btns')!;
photoBtns.append(
  button('done-btn', '💾 Save / Share', () => savePhoto()),
  button('done-btn', '✖ Close', () => photo.classList.add('hidden')),
);
const flashEl = el('div', 'cam-flash');

ui.append(loading, title, pick, hud, photo, flashEl, updateBtn, buildTag);

function chooseWeapon(w: Weapon) {
  weapon = w;
  store.save('weapon', w.id);
  for (const [id, b] of weaponBtns) b.classList.toggle('on', id === w.id);
  sfx.click();
}
chooseWeapon(weapon);

function show(m: Mode) {
  mode = m;
  loading.classList.toggle('hidden', m !== 'loading');
  title.classList.toggle('hidden', m !== 'title');
  pick.classList.toggle('hidden', m !== 'pick');
  hud.classList.toggle('hidden', m !== 'smash');
  buildTag.classList.toggle('hidden', m === 'smash');
  if (m === 'pick') {
    fillCards();
    if (ended || body.id !== 'earth') setBody(bodyById('earth'));
  }
  if (m === 'title' && updateReady) reloadForUpdate();
  fit();
}

let toastTimer = 0;
function say(msg: string, secs = 2.5) {
  toast.textContent = msg;
  toast.classList.remove('hidden');
  toastTimer = secs;
}

function updateMeter(instant = false) {
  const target = healthPercent(body, hp);
  if (instant) shownHealth = target;
  meterFill.style.width = `${shownHealth}%`;
  // green when healthy, yellow in the middle, red when it's about to go
  meterFill.style.background = `hsl(${Math.round(shownHealth * 1.2)}, 85%, 50%)`;
  meterPct.textContent = `${Math.round(shownHealth)}%`;
}

// ---------- the planet ----------
function setBody(b: Body) {
  fx.clear(new Set([sun, ambient, pull, ...keepers]));
  if (planet) {
    pull.remove(planet.root);
    planet.dispose();
  }
  body = b;
  hp = b.hp;
  ended = false;
  inFlight = 0;
  swallowed = false;
  heatShown = 0;
  zoomOut = 1;
  spinVel.set(0, 0);
  pull.position.set(0, 0, 0);
  pull.quaternion.identity();
  pull.scale.setScalar(1);
  pull.visible = true;
  planet = new Planet(b, lightDir);
  pull.add(planet.root);
}
const keepers: THREE.Object3D[] = [];

function startSmash(b: Body) {
  setBody(b);
  nameBox.innerHTML = `<div class="nm">${b.name}</div><div class="fact">${b.fact}</div>`;
  done.classList.add('hidden');
  hint.classList.remove('hidden');
  updateMeter(true);
  show('smash');
}

function gunPosition(): THREE.Vector3 {
  // off the right edge of the screen, a little above, between the camera and the planet
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  const d = camera.position.length();
  return camera.position.clone().multiplyScalar(0.55).addScaledVector(right, d * 0.45).addScaledVector(up, d * 0.18);
}

const raycaster = new THREE.Raycaster();
function fireAt(x: number, y: number) {
  if (mode !== 'smash' || ended || !planet || inFlight >= 4) return;
  const r = canvas.getBoundingClientRect();
  raycaster.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), camera);
  const hits = raycaster.intersectObject(planet.mesh, false);
  if (!hits.length) return;
  aimAt(planet.root.worldToLocal(hits[0].point.clone()).normalize());
}

function aimAt(local: THREE.Vector3) {
  if (!planet) return;
  hint.classList.add('hidden');
  const w = weapon;
  const p = planet;
  if (w.id === 'blackhole' && body.rainbowOnly) {
    say('Too big for a black hole! Only the 🌈 Rainbow Laser can hurt it!');
    sfx.plink();
    return;
  }
  inFlight++;
  const shot: Shot = {
    weapon: w,
    planet: p,
    local,
    gun: gunPosition(),
    impact: (o) => {
      if (o.primary) inFlight = Math.max(0, inFlight - 1);
      if (ended || p !== planet) return true;
      if (body.rainbowOnly && w.id !== 'rainbow') {
        if (o.primary) say('Too big! Only the 🌈 Rainbow Laser can hurt it!');
        return false;
      }
      p.crater(o.local, o.size, o.style);
      if (o.size >= 0.08) {
        p.shockwave(o.local, o.size);
        fx.plume(p.root.localToWorld(o.local.clone()), p.root.localToWorld(o.local.clone()).sub(p.root.getWorldPosition(new THREE.Vector3())).normalize(), o.size, body.kind === 'rocky' ? 0x7a6650 : 0xb0603a);
      }
      if (o.exit) {
        p.crater(o.exit, o.size * 0.85, o.style);
        p.hole(o.local, o.size * 0.45);
        p.hole(o.exit, o.size * 0.4);
      }
      if (o.primary) {
        const res = hit(body, w, hp);
        hp = res.hp;
        if (res.destroyed) explode(w);
      }
      return true;
    },
  };
  if (w.id === 'blackhole') {
    hp = 0;
    ended = true;
    swallowed = true;
    zoomOut = 2.2;
    blackHole(fx, shot, pull, () => {
      inFlight = 0;
      finish(1500);
    });
    return;
  }
  fire(fx, shot);
}

function explode(w: Weapon) {
  if (!planet) return;
  ended = true;
  const p = planet;
  const how = endingFor(body, w);
  const center = p.root.getWorldPosition(new THREE.Vector3());
  if (how === 'rocks') {
    fx.after(0.15, () => {
      p.hide();
      fx.rocks(center, p.colorCanvas, p.root.getWorldQuaternion(new THREE.Quaternion()));
      sfx.explode();
      zoomOut = 1.9;
    });
    finish(3200);
  } else {
    // it swells up and goes white-hot, then blows
    fx.run((_, t) => {
      const k = Math.min(1, t / 0.7);
      p.uniforms.flash.value = k * k;
      p.root.scale.setScalar(1 + 0.15 * k);
      if (k < 1) return true;
      p.hide();
      fx.supernova(center, body.kind);
      sfx.supernova();
      zoomOut = 2.6;
      return false;
    });
    finish(4200);
  }
}

function finish(ms: number) {
  smashed[body.id] = (smashed[body.id] ?? 0) + 1;
  store.save('smashed', smashed);
  setTimeout(() => {
    if (mode !== 'smash' || !ended) return;
    doneTitle.textContent = `💥 ${body.name} smashed!`;
    done.classList.remove('hidden');
  }, ms);
}

// ---------- photo ----------
let lastPhoto: HTMLCanvasElement | null = null;
function takePhoto() {
  sfx.camera();
  renderer.render(scene, camera);
  const c = document.createElement('canvas');
  c.width = canvas.width;
  c.height = canvas.height;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(canvas, 0, 0);
  const s = c.height / 800;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, c.height - 70 * s, c.width, 70 * s);
  ctx.fillStyle = '#fff';
  ctx.font = `800 ${32 * s}px "Avenir Next", system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.fillText(`💥 PLANET SMASH · ${body.name}${ended ? ' · SMASHED!' : ''}`, 24 * s, c.height - 35 * s);
  lastPhoto = c;
  photoImg.src = c.toDataURL('image/jpeg', 0.9);
  flashEl.classList.remove('go');
  void flashEl.offsetWidth;
  flashEl.classList.add('go');
  setTimeout(() => photo.classList.remove('hidden'), 250);
}

function savePhoto() {
  if (!lastPhoto) return;
  lastPhoto.toBlob(async (blob) => {
    if (!blob) return;
    const file = new File([blob], `planet-smash-${body.id}.jpg`, { type: 'image/jpeg' });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.canShare?.({ files: [file] })) {
      try { await nav.share({ files: [file], title: 'Planet Smash' }); } catch { /* closed */ }
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, 'image/jpeg', 0.92);
}

// ---------- input: swipe to spin, tap to fire ----------
const spinVel = new THREE.Vector2();
let down: { x: number; y: number; t: number; lx: number; ly: number; moved: boolean; id: number } | null = null;
canvas.addEventListener('pointerdown', (e) => {
  unlock();
  if (down) return;
  down = { x: e.clientX, y: e.clientY, t: performance.now(), lx: e.clientX, ly: e.clientY, moved: false, id: e.pointerId };
  spinVel.set(0, 0);
});
canvas.addEventListener('pointermove', (e) => {
  if (!down || e.pointerId !== down.id) return;
  const dx = e.clientX - down.lx, dy = e.clientY - down.ly;
  if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10) down.moved = true;
  if (down.moved) {
    const k = 2.4 / Math.max(300, Math.min(window.innerWidth, window.innerHeight));
    spin(dx * k, dy * k);
    spinVel.set(dx * k * 60, dy * k * 60);
  }
  down.lx = e.clientX;
  down.ly = e.clientY;
});
function endPointer(e: PointerEvent, cancel: boolean) {
  if (!down || e.pointerId !== down.id) return;
  if (!cancel && !down.moved && performance.now() - down.t < 600) fireAt(e.clientX, e.clientY);
  if (!down.moved) spinVel.set(0, 0);
  down = null;
}
canvas.addEventListener('pointerup', (e) => endPointer(e, false));
canvas.addEventListener('pointercancel', (e) => endPointer(e, true));

const qTmp = new THREE.Quaternion();
function spin(ax: number, ay: number) {
  if (!planet) return;
  qTmp.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ax);
  planet.root.quaternion.premultiply(qTmp);
  qTmp.setFromAxisAngle(new THREE.Vector3(1, 0, 0), ay);
  planet.root.quaternion.premultiply(qTmp);
}

const keys: Record<string, boolean> = {};
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  unlock();
  if (mode === 'smash') {
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= WEAPONS.length) chooseWeapon(WEAPONS[n - 1]);
    if (e.code === 'Space' || e.code === 'Enter') {
      // fire at the middle of the planet facing you
      if (planet && !ended) aimAt(planet.root.worldToLocal(camera.position.clone().normalize()).normalize());
      e.preventDefault();
    }
    if (e.code === 'KeyP') takePhoto();
    if (e.code === 'Escape') show('pick');
  } else if (mode === 'title' && (e.code === 'Space' || e.code === 'Enter')) show('pick');
});
window.addEventListener('keyup', (e) => (keys[e.code] = false));

// ---------- size and camera ----------
let baseDist = 4;
function fit() {
  const w = canvas.clientWidth || window.innerWidth, h = canvas.clientHeight || window.innerHeight;
  if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false);
  }
  camera.aspect = w / h;
  const panel = mode === 'smash' ? weaponsBox.offsetWidth + 16 : 0;
  const availW = w - panel;
  const big = body.kind === 'giant';
  const radPx = big ? 0.62 * Math.max(availW, h) : 0.36 * Math.min(availW, h);
  baseDist = h / 2 / (radPx * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  if (panel) camera.setViewOffset(w, h, panel / 2, 0, w, h);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', fit);

// ---------- loop ----------
let last = performance.now();
let time = 0;
let dist = 4;
function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  time += dt;
  fit();

  if (planet && !down) {
    if (mode !== 'smash') spin(dt * 0.12, 0);
    else if (spinVel.lengthSq() > 1e-6) {
      spin(spinVel.x * dt, spinVel.y * dt);
      spinVel.multiplyScalar(Math.exp(-dt * 3));
    }
    const kx = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
    const ky = (keys.ArrowDown || keys.KeyS ? 1 : 0) - (keys.ArrowUp || keys.KeyW ? 1 : 0);
    if (kx || ky) spin(kx * dt * 1.5, ky * dt * 1.5);
  }
  if (planet) {
    planet.setTime(time);
    if (!swallowed) heatShown += (heat(body, hp) - heatShown) * Math.min(1, dt * 3);
    planet.setHeat(heatShown);
  }
  if (fx) fx.update(dt);
  space?.update(time);

  if (mode === 'smash') {
    const target = healthPercent(body, hp);
    if (shownHealth !== target) {
      shownHealth = Math.abs(shownHealth - target) < 0.5 ? target : shownHealth + (target - shownHealth) * Math.min(1, dt * 5);
      updateMeter();
    }
  }
  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) toast.classList.add('hidden');
  }

  dist += (baseDist * zoomOut - dist) * Math.min(1, dt * (zoomOut > 1 ? 0.8 : 6));
  const shake = fx ? fx.shake : 0;
  camera.position.set(
    (Math.random() - 0.5) * shake * 0.04 * dist,
    (Math.random() - 0.5) * shake * 0.04 * dist,
    dist,
  );
  camera.lookAt(camera.position.x * 0.5, camera.position.y * 0.5, 0);
  renderer.render(scene, camera);
}

// ---------- start ----------
startPwa({
  onUpdate: () => {
    updateReady = true;
    if (mode === 'title') reloadForUpdate();
    else updateBtn.classList.remove('hidden');
  },
});
(window as unknown as Record<string, unknown>).__smash = {
  scene, camera, renderer, get planet() { return planet; }, get hp() { return hp; }, aimAt, start: (id: string) => startSmash(bodyById(id)), chooseWeapon: (id: string) => chooseWeapon(weaponById(id)),
};

loadAll((d, n) => {
  const m = document.getElementById('load-msg');
  if (m) m.textContent = `Loading planets… ${d}/${n}`;
})
  .then(() => {
    fx = new Fx(scene);
    space = makeSpace(scene);
    keepers.push(...scene.children.filter((o) => o !== pull && o !== sun && o !== ambient));
    setBody(bodyById('earth'));
    show('title');
  })
  .catch((err) => {
    const m = document.getElementById('load-msg');
    if (m) m.textContent = `Couldn't load the planets. Check the Wi-Fi and try again. (${err.message})`;
  });
fit();
requestAnimationFrame(frame);
