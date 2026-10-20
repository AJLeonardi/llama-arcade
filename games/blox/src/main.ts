// Llama-blox: a blocky 3D world. Walk around Llama Island, jump through obbies (obstacle courses) to
// collect coins, and spend them on outfits for your llama or person in the Dress-Up Shop.
import * as THREE from 'three';
import { BUILD, startPwa, reloadForUpdate } from '../../../shared/pwa';
import { gameStorage } from '../../../shared/storage';
import { goToArcade } from '../../../shared/home';
import { LEVELS } from './sim/levels';
import { Sim, STEP, type SimEvent } from './sim/physics';
import { fixSave, pick, type Item, type Save } from './sim/shop';
import { animate, buildAvatar, type Rig } from './view/avatar';
import { Confetti } from './view/confetti';
import { WorldView } from './view/world';
import { Controls } from './ui/controls';
import { sfx, unlock } from './ui/sfx';
import { UI } from './ui/ui';

const store = gameStorage('blox');
const save: Save = fixSave(store.load<Save>('save'));
const persist = () => store.save('save', save);

// ---------------------------------------------------------------- renderer, scene, lights

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
scene.add(new THREE.HemisphereLight(0xeef8ff, 0xb0a080, 2.4));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 60 });
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);
const confetti = new Confetti(scene);

function fit() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', fit);
fit();

/** Sky: a vertical gradient as the background, with matching fog. */
function setSky(top: string, horizon: string) {
  const c = document.createElement('canvas');
  c.width = 2;
  c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top);
  grad.addColorStop(1, horizon);
  g.fillStyle = grad;
  g.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  (scene.background as THREE.Texture | null)?.dispose?.();
  scene.background = tex;
  scene.fog = new THREE.Fog(horizon, 60, 220);
}

// ---------------------------------------------------------------- game state

type Mode = 'title' | 'play' | 'pause' | 'shop' | 'finish';
let mode: Mode = 'title';
let shopFrom: Mode = 'title';
let sim!: Sim;
let view: WorldView | null = null;
let rig: Rig = buildAvatar(save.outfit);
scene.add(rig.root);
let runCoins = 0;
let updateReady = false;
let busy = false; // during a fade between levels

// Camera: orbits behind the player. yaw faces (sin, cos) like everything else.
let camYaw = 0;
let camPitch = 0.38;
let camDist = 9;
const camTarget = new THREE.Vector3();
const prevPos = new THREE.Vector3();

function loadLevel(id: string) {
  view?.dispose();
  const level = LEVELS[id];
  sim = new Sim(level); // the island always starts you facing the doorways
  view = new WorldView(level, save.done);
  scene.add(view.group);
  setSky(...level.sky);
  camYaw = sim.yaw;
  camTarget.set(sim.pos[0], sim.pos[1] + 1.6, sim.pos[2]);
  prevPos.set(...sim.pos);
  runCoins = 0;
  ui.setCoins(save.coins);
}

function rebuildAvatar() {
  rig.dispose();
  rig = buildAvatar(save.outfit);
  scene.add(rig.root);
}

// ---------------------------------------------------------------- UI

const ui = new UI({
  pause: () => openPause(),
  shop: () => openShop(),
  update: () => reloadForUpdate(),
});
const controls = new Controls(canvas, ui.jumpBtn);
window.addEventListener('pointerdown', unlock, { capture: true });

function setMode(m: Mode) {
  mode = m;
  controls.reset();
  controls.enabled = m === 'play';
  const inHub = sim.level.id === 'hub';
  ui.showHud(m === 'play', `${sim.level.emoji} ${sim.level.name}`, inHub);
  ui.showUpdate(updateReady && m !== 'title');
  if (m === 'play') ui.showScreen(null);
}

function openTitle() {
  if (updateReady) return reloadForUpdate(); // nothing to lose on the title screen
  if (sim.level.id !== 'hub') loadLevel('hub');
  setMode('title');
  ui.title(
    () => {
      setMode('play');
      ui.levelCard('🏝️ Llama Island');
    },
    () => openShop(),
    () => goToArcade(),
  );
}

function openPause() {
  if (mode !== 'play') return;
  setMode('pause');
  ui.pause(sim.level.id === 'hub', {
    resume: () => setMode('play'),
    hub: () => goTo('hub'),
    dress: () => openShop(),
    title: () => openTitle(),
  });
}

function openShop() {
  shopFrom = mode === 'title' ? 'title' : 'play';
  setMode('shop');
  ui.showScreen(null);
  drawShop();
}

function drawShop() {
  ui.shop(save, {
    pick: (item: Item) => {
      const r = pick(save, item);
      if (r === 'too-pricey') {
        sfx.nope();
        ui.toast(`Need 🪙 ${item.price - save.coins} more!`);
        return;
      }
      if (r === 'bought') {
        sfx.buy();
        ui.toast(`🎉 New ${item.name}!`);
      }
      persist();
      rebuildAvatar();
      drawShop();
      ui.setCoins(save.coins);
    },
    body: (b) => {
      save.outfit.body = b;
      persist();
      rebuildAvatar();
      drawShop();
    },
    done: () => {
      ui.closeShop();
      if (shopFrom === 'title') openTitle();
      else setMode('play');
    },
  });
}

/** Go to another level through a white flash. */
function goTo(id: string) {
  if (busy) return;
  busy = true;
  sfx.portal();
  ui.fade(() => {
    loadLevel(id);
    setMode('play');
    busy = false;
    ui.levelCard(`${sim.level.emoji} ${sim.level.name}`);
  });
}

function handle(e: SimEvent) {
  switch (e.type) {
    case 'jump':
      return sfx.jump();
    case 'bounce':
      return sfx.bounce();
    case 'speed':
      sfx.speed();
      return ui.toast('💨 Zoom!', 900);
    case 'coin':
      save.coins++;
      runCoins++;
      ui.setCoins(save.coins);
      persist();
      return sfx.coin();
    case 'checkpoint':
      sfx.checkpoint();
      return ui.toast('✅ Checkpoint!');
    case 'oops':
      sfx.oops();
      return ui.toast(['Whoops! 🙈', 'Try again! 💪', 'Oopsie! 😅'][Math.floor(Math.random() * 3)]);
    case 'portal':
      return goTo(e.level);
    case 'shop':
      return openShop();
    case 'finish': {
      const lv = sim.level;
      save.coins += lv.reward;
      if (!save.done.includes(lv.id)) save.done.push(lv.id);
      persist();
      ui.setCoins(save.coins);
      sfx.finish();
      confetti.burst(new THREE.Vector3(sim.pos[0], sim.pos[1] + 2, sim.pos[2]));
      setMode('finish');
      // Let the confetti fly for a moment before the card.
      setTimeout(() => ui.finish(lv.name, runCoins, lv.reward, () => goTo('hub')), 1200);
      return;
    }
  }
}

// ---------------------------------------------------------------- the loop

let last = performance.now();
let acc = 0;
let clock = 0;
let lastLook = -10; // when the player last turned the camera themselves

function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  clock += dt;

  // Camera control: dragging (or Q/E) turns it; otherwise it slowly swings round behind you as you walk.
  const turn = controls.keyTurn();
  if (controls.lookX || controls.lookY || turn) {
    lastLook = clock;
    ui.lookedAround();
  }
  camYaw -= controls.lookX + turn * 2.2 * dt;
  camPitch = Math.max(-0.15, Math.min(1.2, camPitch + controls.lookY));
  camDist = Math.max(4, Math.min(16, camDist + controls.zoom * 0.8));
  controls.lookX = controls.lookY = controls.zoom = 0;
  const speed = Math.hypot(sim.vel[0], sim.vel[2]);
  if (mode === 'play' && clock - lastLook > 1.5 && speed > 1) {
    const d = Math.atan2(Math.sin(sim.yaw - camYaw), Math.cos(sim.yaw - camYaw));
    // Not when walking towards the camera, or it would spin round.
    if (Math.abs(d) < 2.2) camYaw += d * Math.min(1, dt * 1.2 * Math.min(1, speed / 7));
  }

  // Physics at a fixed 60 steps a second. Menus keep the world moving but the player stands still.
  acc += dt;
  while (acc >= STEP) {
    acc -= STEP;
    prevPos.set(...sim.pos);
    let mx = 0, mz = 0, jump = false;
    if (mode === 'play' && !busy) {
      const m = controls.moveInput();
      const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
      mx = -fz * m.x + fx * m.y;
      mz = fx * m.x + fz * m.y;
      jump = controls.takeJump();
    }
    const events = sim.step({ moveX: mx, moveZ: mz, jump });
    if (mode === 'play' && !busy) for (const e of events) handle(e);
  }
  const a = acc / STEP;
  const px = prevPos.x + (sim.pos[0] - prevPos.x) * a;
  const py = prevPos.y + (sim.pos[1] - prevPos.y) * a;
  const pz = prevPos.z + (sim.pos[2] - prevPos.z) * a;

  // The character.
  rig.root.position.set(px, py, pz);
  rig.root.rotation.y = sim.yaw;
  animate(rig, clock, speed, !sim.onGround);
  view?.update(sim, clock, dt);
  confetti.update(dt);

  // Camera: behind the player in play; slowly circling on the title screen; facing them in the shop.
  const want = new THREE.Vector3(px, py + 1.6, pz);
  camTarget.lerp(want, Math.min(1, dt * 10));
  let yaw = camYaw, pitch = camPitch, dist = camDist;
  camera.clearViewOffset();
  if (mode === 'title') {
    yaw = sim.yaw + Math.PI + Math.sin(clock * 0.3) * 0.6;
    pitch = 0.25;
    dist = 7;
  } else if (mode === 'shop') {
    yaw = sim.yaw + Math.PI + 0.5;
    pitch = 0.15;
    dist = 4.5;
    // Shift the picture left so the character isn't hidden behind the shop panel.
    const w = window.innerWidth, h = window.innerHeight;
    camera.setViewOffset(w, h, w * 0.24, 0, w, h);
  }
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  camera.position.set(
    camTarget.x - fx * dist * Math.cos(pitch),
    camTarget.y + dist * Math.sin(pitch),
    camTarget.z - fz * dist * Math.cos(pitch),
  );
  camera.lookAt(camTarget);

  sun.position.set(camTarget.x + 10, camTarget.y + 22, camTarget.z + 8);
  sun.target.position.copy(camTarget);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- start

loadLevel('hub');
openTitle();
requestAnimationFrame(frame);
document.addEventListener('visibilitychange', () => document.hidden && openPause());

startPwa({
  onUpdate: () => {
    updateReady = true;
    if (mode === 'title') reloadForUpdate();
    else ui.showUpdate(true);
  },
});

// For poking at the game from the console while testing.
(window as unknown as { __blox: unknown }).__blox = { get sim() { return sim; }, save, BUILD, LEVELS, goTo };
