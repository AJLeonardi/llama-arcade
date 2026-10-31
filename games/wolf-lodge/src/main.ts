// Llama Wolf Lodge: a lodge with an indoor water park. Arrive outside, book a room at the front desk (Basic,
// Nice or Luxury: you get a wristband that opens your room and the water park), then ride the Twister Tube,
// the Wolf Drop, the Flush Bowl and the Big Dipper, float the lazy river, do the Wand Quest and the ropes
// course. As real as we can make it: real slide physics (sim/ride.ts), a person who walks and runs like a
// person (view/person.ts), log walls, stone, water, glass roof with the sun coming through.
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { BUILD, startPwa, reloadForUpdate } from '../../../shared/pwa';
import { gameStorage } from '../../../shared/storage';
import { goToArcade } from '../../../shared/home';
import { Controls } from '../../../shared/controls';
import { Confetti } from '../../../shared/confetti';
import { Player, STEP } from './sim/player';
import { Rider, surfH, type RideDef } from './sim/ride';
import { RIDES, TOWER_RIDES } from './sim/slides';
import {
  areaAt, DESK, doorOpen, doors, LOBBY, rayDist, ROOMS, RUNES, spots, START, type Spot, type Tier,
} from './sim/world';
import { buildLodge, materials, setFrontDoors } from './view/lodge';
import { Person, PLAYER_LOOK, type Look, type PoseMode } from './view/person';
import { buildSlides } from './view/slidesView';
import { setHum, setRush, sfx, unlock } from './ui/sfx';
import { UI } from './ui/ui';

void BUILD;

// ---------------------------------------------------------------- saving

interface Save {
  tier: Tier | 0;
  wand: boolean;
  runes: boolean[];
  dragon: boolean;
}
const store = gameStorage('wolf-lodge');
const loaded = store.load<Partial<Save>>('save') ?? {};
const save: Save = {
  tier: ([1, 2, 3] as number[]).includes(Number(loaded.tier)) ? (Number(loaded.tier) as Tier) : 0,
  wand: !!loaded.wand,
  runes: RUNES.map((_, i) => !!loaded.runes?.[i]),
  dragon: !!loaded.dragon,
};
const persist = () => store.save('save', save);

// ---------------------------------------------------------------- renderer, sky, light

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.08, 1200);

const SUN_DIR = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 52), THREE.MathUtils.degToRad(140));
const sky = new Sky();
sky.scale.setScalar(1000);
const su = sky.material.uniforms;
su.turbidity.value = 3;
su.rayleigh.value = 1.1;
su.mieCoefficient.value = 0.004;
su.mieDirectionalG.value = 0.85;
su.sunPosition.value.copy(SUN_DIR);
scene.add(sky);
{
  // Reflections and soft fill from an indoor-ish environment (the lodge is mostly inside).
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;
  pm.dispose();
}
scene.fog = new THREE.Fog(0xb8c8d8, 120, 700);
const sun = new THREE.DirectionalLight(0xfff0d8, 3.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 1, far: 180 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x6b5440, 0.8);
scene.add(hemi);

function fit() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', fit);
fit();

// ---------------------------------------------------------------- the world

const mats = materials();
const lodge = buildLodge(mats);
scene.add(lodge.group);
const slides = buildSlides(mats.wood, mats.roof, mats.poolTile, mats.water, mats.coping);
scene.add(slides.group);
const confetti = new Confetti(scene);
if (save.dragon) lodge.dragon.wake();

const player = new Player();
const me = new Person(PLAYER_LOOK);
scene.add(me.root);

// People: the clerk at the desk, lifeguards, and a few guests walking about.
const clerk = new Person({ skin: '#c68863', hair: '#1c1c1c', shirt: '#2d5a3a', shorts: '#222222', shoes: '#222222', swim: '#222', longHair: true });
clerk.root.position.set(DESK.clerkX, 0, 17);
clerk.root.scale.setScalar(1.28); // grown-ups
clerk.root.rotation.y = Math.PI / 2;
scene.add(clerk.root);
const guardLook: Look = { skin: '#e8b48f', hair: '#d9a441', shirt: '#d8322f', shorts: '#d8322f', shoes: '#e8b48f', swim: '#d8322f', longHair: false };
const lifeguards = [
  [13, -42, Math.PI / 2], [44, -20, -Math.PI / 2], [-4, -10, Math.PI],
].map(([x, z, yaw]) => {
  const p = new Person(guardLook);
  p.setSwim(true);
  p.root.position.set(x, 1.58, z);
  p.root.scale.setScalar(1.28);
  p.root.rotation.y = yaw;
  scene.add(p.root);
  return p;
});
interface Walker { p: Person; path: [number, number][]; i: number; phase: number; x: number; z: number; yaw: number; swim: boolean }
const guestLooks: Look[] = [
  { skin: '#f6d2b8', hair: '#6b4423', shirt: '#e85d9c', shorts: '#3d5a3d', shoes: '#fff', swim: '#e85d9c', longHair: true },
  { skin: '#8d5a3c', hair: '#111', shirt: '#fdd835', shorts: '#2b3a55', shoes: '#111', swim: '#1e88e5', longHair: false },
  { skin: '#e8b48f', hair: '#b5462b', shirt: '#43a047', shorts: '#6d6d6d', shoes: '#e53935', swim: '#43a047', longHair: true },
  { skin: '#c68863', hair: '#2b1d14', shirt: '#8e24aa', shorts: '#1c1c1c', shoes: '#fff', swim: '#fb8c00', longHair: false },
];
const walkers: Walker[] = [
  { path: [[-6, 14], [8, 14], [8, 24], [-8, 22]], swim: false },
  { path: [[-2, 4], [-2, -6], [8, -14], [10, 2]], swim: true },
  { path: [[-26, -32], [-14, -30], [-12, -50], [-26, -50]], swim: true },
  { path: [[4, -78], [-10, -80], [-12, -70], [4, -70]], swim: true },
].map((w, k) => {
  const p = new Person(guestLooks[k]);
  p.setSwim(w.swim);
  scene.add(p.root);
  return { p, path: w.path as [number, number][], i: 0, phase: k, x: w.path[0][0], z: w.path[0][1], yaw: 0, swim: w.swim };
});

// ---------------------------------------------------------------- UI and controls

type Mode = 'title' | 'walk' | 'ride' | 'menu' | 'busy';
let mode: Mode = 'title';
let updateReady = false;
const ui = new UI({ pause: () => openPause(), update: () => reloadForUpdate(), camera: () => (povCam = !povCam) });
const controls = new Controls(canvas, ui.jumpBtn);
window.addEventListener('pointerdown', unlock, { capture: true });
window.addEventListener('keydown', () => unlock(), { capture: true });

// Held buttons on rides.
let holdFaster = false, holdSlower = false;
const hold = (b: HTMLElement, set: (v: boolean) => void) => {
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    set(true);
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => set(false));
};
hold(ui.fasterBtn, (v) => (holdFaster = v));
hold(ui.slowerBtn, (v) => (holdSlower = v));
ui.getOutBtn.addEventListener('click', () => endRide(true));
const keys = new Set<string>();
window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'KeyF' || e.code === 'Enter') doAction();
  if (e.code === 'KeyC') povCam = !povCam;
  if (e.code === 'Escape' && mode === 'walk') openPause();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
ui.actionBtn.addEventListener('click', () => doAction());

function setMode(m: Mode) {
  mode = m;
  controls.reset();
  controls.enabled = m === 'walk' || m === 'ride';
  ui.showHud(m === 'walk' || m === 'ride');
  ui.riding(m === 'ride', !!rider?.def.loop);
  ui.showUpdate(updateReady && m !== 'title');
  if (m === 'walk' || m === 'ride') ui.hideScreen();
}

// ---------------------------------------------------------------- the camera

let camYaw = Math.PI, camPitch = 0.28, camDist = 4.2;
let lastLook = 0;
let povCam = false;
const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3();
let camReady = false;

function walkCamera(dt: number, now: number) {
  const look = controls.lookX !== 0 || controls.lookY !== 0;
  camYaw -= controls.lookX + controls.keyTurn() * dt * 2;
  camPitch = THREE.MathUtils.clamp(camPitch + controls.lookY, -0.25, 1.2);
  camDist = THREE.MathUtils.clamp(camDist + controls.zoom * 0.4, 1.6, 9);
  controls.lookX = controls.lookY = controls.zoom = 0;
  if (look) lastLook = now;
  // Swing round behind the player when they walk and you haven't looked around for a bit.
  if (now - lastLook > 1.2 && player.speed > 0.5) {
    let d = player.yaw - camYaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    // On the tower stairs the camera swings round behind you faster, for the corners and U-turns.
    camYaw += d * Math.min(1, dt * (player.onStairs ? 3.5 : 1.2) * Math.min(1, player.speed / 2));
  }
  const tgt = new THREE.Vector3(player.x, player.y + (player.harness > 0 ? -0.6 : 1.25), player.z);
  camTarget.lerp(tgt, camReady ? Math.min(1, dt * 12) : 1);
  const dir = new THREE.Vector3(-Math.sin(camYaw) * Math.cos(camPitch), Math.sin(camPitch), -Math.cos(camYaw) * Math.cos(camPitch));
  // Don't go through walls and ceilings.
  const hit = rayDist([camTarget.x, camTarget.y, camTarget.z], [dir.x, dir.y, dir.z], camDist + 0.3);
  const d = Math.max(0.5, Math.min(camDist, hit - 0.3));
  camera.position.copy(camTarget).addScaledVector(dir, d);
  camera.up.set(0, 1, 0);
  camera.lookAt(camTarget);
  camReady = true;
}

// ---------------------------------------------------------------- riding

let rider: Rider | null = null;
let rideFlat = 0; // seconds since the ride ended (for the "you did it" pop-up)
const tmpM = new THREE.Matrix4();

function startRide(def: RideDef) {
  rider = new Rider(def);
  me.setTube(def.seat === 'tube');
  me.setSwim(def.id !== 'zip');
  setMode('ride');
  ui.toast(`${def.emoji} ${def.name}: ${def.blurb}`, 4);
  slides.trapdoor.rotation.x = 0;
  camReady = false;
}

function endRide(early = false) {
  if (!rider) return;
  const def = rider.def;
  let { x, z, yaw } = def.exit;
  if (early && def.loop) {
    // Climb out of the river on the outside bank.
    const p = rider.frame.pos;
    const dx = p[0] - 28, dz = p[2] + 42, l = Math.hypot(dx, dz) || 1;
    x = p[0] + (dx / l) * 3.4;
    z = p[2] + (dz / l) * 3.4;
    yaw = Math.atan2(dx, dz);
  }
  player.place(x, 0, z, yaw);
  camYaw = yaw;
  me.setTube(false);
  rider = null;
  setRush(0);
  setMode('walk');
  if (!def.loop && def.id !== 'zip') {
    rideFlat = 0;
    ui.toast(`🎉 You rode the ${def.name}!`, 3);
  }
}

function rideCamera(dt: number) {
  if (!rider) return;
  const f = rider.frame;
  const pos = new THREE.Vector3(...f.pos), fwd = new THREE.Vector3(...f.fwd), up = new THREE.Vector3(...f.up);
  const seg = rider.def.segs[rider.seg];
  const k = camReady ? Math.min(1, dt * 5) : 1;
  if (povCam && rider.wait <= 0) {
    // Through your own eyes.
    const lying = rider.def.seat === 'body';
    const eye = pos.clone().addScaledVector(up, lying ? 0.45 : 0.85).addScaledVector(fwd, lying ? -0.3 : 0);
    camera.position.copy(eye);
    camera.up.copy(up.clone().lerp(new THREE.Vector3(0, 1, 0), 0.5).normalize());
    camera.lookAt(eye.clone().addScaledVector(fwd, 6).addScaledVector(up, lying ? 0.4 : -0.3));
    camReady = true;
    return;
  }
  let want: THREE.Vector3;
  if (seg?.type === 'surface') {
    // In a funnel or bowl: look down from above the far rim to see you swing up and down.
    const top = surfH(seg, seg.R);
    const away = new THREE.Vector3(pos.x - seg.cx, 0, pos.z - seg.cz);
    if (away.lengthSq() < 0.01) away.set(1, 0, 0);
    away.normalize();
    want = seg.shape === 'bowl'
      ? new THREE.Vector3(seg.cx, seg.cy + top + 7, seg.cz).addScaledVector(away, -2.5) // round and round: from above
      : new THREE.Vector3(seg.cx, seg.cy + top + 3.2, seg.cz).addScaledVector(away, -seg.R * 0.85);
  } else if (rider.def.loop) {
    want = pos.clone().addScaledVector(fwd, -4).add(new THREE.Vector3(0, 2.2, 0));
  } else if (rider.wait > 0 || rider.def.countdown && rider.t < 5.2 && rider.s < 4) {
    // The capsule: from outside, level with you.
    want = pos.clone().add(new THREE.Vector3(3.2, 0.8, 1.2));
  } else {
    const flatFwd = fwd.clone().setY(0);
    if (flatFwd.lengthSq() < 0.05) flatFwd.set(0, 0, -1);
    flatFwd.normalize();
    want = pos.clone().addScaledVector(fwd, -3.2).addScaledVector(flatFwd, -0.5).add(new THREE.Vector3(0, 1.6, 0));
  }
  // Keep the camera out of the towers and walls.
  const from = pos.clone().add(new THREE.Vector3(0, 0.5, 0)), to = want.clone().sub(from);
  const len = to.length();
  if (len > 0.01) {
    to.divideScalar(len);
    const hit = rayDist([from.x, from.y, from.z], [to.x, to.y, to.z], len);
    if (hit < len) want.copy(from).addScaledVector(to, Math.max(0.6, hit - 0.3));
  }
  camPos.lerp(want, k);
  if (!camReady) camPos.copy(want);
  camera.position.copy(camPos);
  camera.up.set(0, 1, 0);
  camTarget.lerp(pos.clone().add(new THREE.Vector3(0, 0.4, 0)), camReady ? Math.min(1, dt * 10) : 1);
  camera.lookAt(camTarget);
  camReady = true;
}

/** Put the person on the ride: the ride's frame gives forward and up. */
function poseOnRide(t: number) {
  if (!rider) return;
  const f = rider.frame;
  const fwd = new THREE.Vector3(...f.fwd);
  let up = new THREE.Vector3(...f.up);
  if (rider.def.seat !== 'body' || rider.def.loop) {
    // Sitting or hanging: stay upright-ish, facing along the ride.
    if (rider.def.seat === 'zip' || rider.def.loop) {
      up = new THREE.Vector3(0, 1, 0);
      fwd.setY(0).normalize();
    }
  }
  up.addScaledVector(fwd, -up.dot(fwd)).normalize();
  const x = new THREE.Vector3().crossVectors(up, fwd).normalize();
  tmpM.makeBasis(x, up, fwd);
  me.root.position.set(...f.pos);
  me.root.quaternion.setFromRotationMatrix(tmpM);
  const pose: PoseMode = rider.def.seat === 'tube' ? 'tube' : rider.def.seat === 'zip' ? 'zip' : 'lie';
  const push = (holdFaster ? 1 : 0) - (holdSlower ? 1 : 0);
  me.pose({ mode: pose, phase: 0, speed: 0, lean: 0, t, air: null, wet: 1, push });
}

// ---------------------------------------------------------------- spots and actions

function nearSpot(): Spot | null {
  let best: Spot | null = null, bd = Infinity;
  for (const s of spots) {
    if (Math.abs(player.y - s.y) > 1.5) continue;
    const d = Math.hypot(player.x - s.x, player.z - s.z);
    if (d < s.r && d < bd) {
      if (s.kind === 'rune' && (!save.wand || save.runes[s.rune!])) continue;
      if (s.kind === 'sleep' && s.id !== `sleep${save.tier}`) continue;
      if (s.kind === 'dragon' && save.dragon) continue;
      best = s;
      bd = d;
    }
  }
  return best;
}

let waving = 0;

function doAction() {
  if (mode !== 'walk') return;
  const s = nearSpot();
  if (!s) return;
  sfx.click();
  switch (s.kind) {
    case 'desk':
      sfx.bell();
      setMode('menu');
      ui.booking(
        {
          pick: (t) => {
            save.tier = t;
            persist();
            setMode('walk');
            ui.setBand(t);
            const r = ROOMS[t - 1];
            ui.toast(`⌚ Here's your wristband! Your ${r.name} is room ${100 + t * 10 + 2}, down the hall. It opens the water park too!`, 5);
            sfx.chime();
          },
          close: () => setMode('walk'),
        },
        save.tier,
      );
      break;
    case 'ride':
      if (!save.tier) return needBand();
      if (s.ride) climb(RIDES[s.ride]);
      else {
        setMode('menu');
        ui.choices('🪜 The Big Tower', 'Which slide?', [
          ...TOWER_RIDES.map((id) => ({ label: `${RIDES[id].emoji} ${RIDES[id].name}`, sub: RIDES[id].blurb, act: () => climb(RIDES[id]) })),
          { label: '↩ Not now', color: 'rgba(255,255,255,0.2)', act: () => setMode('walk') },
        ]);
      }
      break;
    case 'river':
      if (!save.tier) return needBand();
      sfx.splash(false);
      startRide(RIDES[s.ride!]);
      break;
    case 'zip':
      sfx.whoosh();
      startRide(RIDES.zip);
      break;
    case 'wand':
      if (save.wand) {
        ui.toast(`🪄 Find the glowing runes all over the lodge! ${save.runes.filter(Boolean).length}/${RUNES.length} found.`, 4);
      } else {
        save.wand = true;
        persist();
        sfx.wand();
        ui.toast('🪄 You got a magic wand! Find the 8 glowing runes hidden around the lodge, then wake the dragon.', 5);
      }
      break;
    case 'rune': {
      save.runes[s.rune!] = true;
      persist();
      waving = 1.2;
      sfx.wand();
      setTimeout(() => sfx.chime(), 400);
      const n = save.runes.filter(Boolean).length;
      ui.toast(n >= RUNES.length ? '✨ All the runes! Go wake the dragon in the adventure wing!' : `✨ Rune found at ${RUNES[s.rune!].where}! ${n}/${RUNES.length}`, 3.5);
      break;
    }
    case 'dragon': {
      const n = save.runes.filter(Boolean).length;
      if (!save.wand) ui.toast('🐉 Shh, the dragon is asleep. Get a magic wand at the Wand Quest shop first.', 4);
      else if (n < RUNES.length) ui.toast(`🐉 The dragon needs all 8 runes to wake up. You have ${n}.`, 4);
      else {
        waving = 1.5;
        save.dragon = true;
        persist();
        lodge.dragon.wake();
        sfx.roar();
        setTimeout(() => sfx.fanfare(), 1600);
        confetti.burst(new THREE.Vector3(-58, 4, 29));
        ui.toast('🐉 ROAR! You woke the dragon! Quest complete!', 5);
      }
      break;
    }
    case 'sleep':
      setMode('busy');
      ui.fade(true, '😴 Zzz...');
      sfx.snore();
      setTimeout(() => sfx.snore(), 1300);
      setTimeout(() => {
        ui.fade(false);
        setMode('walk');
        ui.toast('☀️ Good morning! Time for the water park!', 3);
      }, 2800);
      break;
    case 'clerk':
      break;
  }
}

function needBand() {
  sfx.nope();
  ui.toast('⌚ You need a wristband! Book a room at the front desk first.', 3.5);
}

function climb(def: RideDef) {
  setMode('busy');
  // Already up the stairs? Then just get in.
  if (player.y > 10) {
    startRide(def);
    return;
  }
  ui.fade(true, def.countdown ? '🐺 Up the Wolf Drop tower...' : '🪜 Climbing the Big Tower...');
  setTimeout(() => {
    ui.fade(false);
    startRide(def);
  }, 1300);
}

// ---------------------------------------------------------------- doors

let gateWarned = 0;
function updateDoors(dt: number) {
  for (const d of doors) {
    const near = Math.hypot(player.x - d.x, player.z - d.z) < (d.tier === 0 ? 3.2 : 2.2) && player.y < 2;
    const mine = d.tier === 0 ? save.tier > 0 : d.tier > 0 && d.tier === save.tier;
    const want = near && mine && mode === 'walk';
    if (want && !doorOpen[d.id]) sfx.door();
    if (near && !mine && d.tier >= 0 && mode === 'walk' && performance.now() - gateWarned > 5000) {
      gateWarned = performance.now();
      if (d.tier === 0) needBand();
      else {
        sfx.nope();
        ui.toast(save.tier ? `🔒 That's not your room. Yours is room ${100 + save.tier * 10 + 2}.` : '🔒 Locked. Book a room at the front desk!', 3);
      }
    }
    doorOpen[d.id] = want || (doorOpen[d.id] && near);
  }
  for (const dm of lodge.doorMeshes) {
    const target = doorOpen[dm.id] ? 1 : 0;
    dm.open += (target - dm.open) * Math.min(1, dt * 5);
    const d = doors[dm.id];
    if (dm.kind === 'swing') dm.pivot.rotation.y = -dm.open * 1.6;
    else dm.pivot.position.x = d.x + (dm.pivot.userData.side as number) * (d.width / 4 + dm.open * (d.width / 2 - 0.2));
  }
  setFrontDoors(Math.hypot(player.x, player.z - LOBBY.z1) < 4.5 ? 1 : 0);
}

// ---------------------------------------------------------------- per-area light

const AREA = {
  outside: { name: '🌲 Outside', sky: '#dfe8ff', ground: '#6b5a40', hemi: 0.7, exp: 0.95 },
  lobby: { name: '🛎️ The Lobby', sky: '#ffdcae', ground: '#6b4a30', hemi: 1.5, exp: 1.15 },
  hall: { name: '🚪 Guest Rooms', sky: '#ffe2bd', ground: '#5a3a2a', hemi: 1.4, exp: 1.15 },
  room: { name: '🛏️ Room', sky: '#ffe4c4', ground: '#5a4030', hemi: 1.4, exp: 1.15 },
  adventure: { name: '🪄 Adventure Wing', sky: '#ffd8b0', ground: '#4a3020', hemi: 1.4, exp: 1.15 },
  park: { name: '🌊 Water Park', sky: '#e8f4ff', ground: '#7a8a8a', hemi: 1.15, exp: 1.05 },
};
const skyCol = new THREE.Color(), groundCol = new THREE.Color();
function areaLight(dt: number) {
  const a = rider ? 'park' : areaAt(player.x, player.z);
  const L = AREA[a];
  const k = Math.min(1, dt * 2);
  hemi.color.lerp(skyCol.set(L.sky), k);
  hemi.groundColor.lerp(groundCol.set(L.ground), k);
  hemi.intensity += (L.hemi - hemi.intensity) * k;
  renderer.toneMappingExposure += (L.exp - renderer.toneMappingExposure) * k;
  let name = L.name;
  if (a === 'room') {
    const r = ROOMS.find((q) => player.x > q.x0 && player.x < q.x1 && player.z > q.z0 && player.z < q.z1);
    if (r) name = `🛏️ ${r.name}`;
  }
  if (rider) name = `${rider.def.emoji} ${rider.def.name}`;
  ui.setArea(name);
  me.setSwim(a === 'park' || !!rider && rider.def.id !== 'zip');
  setHum(a === 'park' ? 1 : a === 'lobby' ? 0.2 : 0);
  me.wand.visible = save.wand && a !== 'park' && !rider;
}

// ---------------------------------------------------------------- screens

function openTitle() {
  setMode('title');
  ui.title({ play: () => play(), arcade: () => goToArcade() }, save.tier);
}

function play() {
  if (updateReady) return reloadForUpdate(); // nothing to lose yet
  if (save.tier) {
    player.place(0, 0, 34, Math.PI);
    ui.toast('Welcome back! 🌊 The water park is through the lobby.', 3);
  } else {
    player.place(START.x, 0, START.z, START.yaw);
    ui.toast('🚗 You made it! Go in and book a room at the front desk.', 4);
  }
  camYaw = player.yaw;
  camReady = false;
  ui.setBand(save.tier);
  setMode('walk');
}

function openPause() {
  if (mode !== 'walk' && mode !== 'ride') return;
  const wasRide = mode === 'ride';
  setMode('menu');
  const go = (x: number, z: number, yaw: number) => () => {
    if (rider) endRide(true);
    player.place(x, 0, z, yaw);
    camYaw = yaw;
    camReady = false;
    setMode('walk');
  };
  const list = [
    { label: '▶ Keep playing', act: () => setMode(wasRide ? 'ride' : 'walk') },
    ...(save.tier ? [{ label: '🛏️ Go to my room', act: go(ROOMS[save.tier - 1].doorX, 31, 0) }] : []),
    { label: '🌊 Go to the water park', act: go(0, 4, Math.PI) },
    { label: '🛎️ Go to the front desk', act: go(-12.5, 17, -Math.PI / 2) },
    { label: '🪄 Go to the adventure wing', act: go(-26, 25, -Math.PI / 2) },
    { label: '🏠 Arcade', color: 'rgba(255,255,255,0.2)', act: () => goToArcade() },
  ];
  ui.choices('⏸ Paused', '', list);
}

// ---------------------------------------------------------------- the loop

let acc = 0;
let last = performance.now();
let clock = 0;

function frame(nowMs: number) {
  const dt = Math.min(0.05, (nowMs - last) / 1000);
  last = nowMs;
  clock += dt;

  if (mode === 'walk') {
    acc += dt;
    while (acc >= STEP) {
      const mv = controls.moveInput();
      player.step({ x: mv.x, y: mv.y, camYaw, jump: controls.takeJump() || keys.has('Space'), walk: keys.has('ShiftLeft') || keys.has('ShiftRight') });
      acc -= STEP;
    }
    for (const e of player.events) {
      if (e === 'step') sfx.step(player.wet > 0.1);
      else if (e === 'jump') sfx.jump();
      else if (e === 'land') sfx.land();
      else if (e === 'bounce') sfx.bounce();
      else if (e === 'splash') sfx.splash(false);
      else if (e === 'harness') {
        sfx.harness();
        ui.toast('🧗 The harness caught you!', 2);
      }
    }
    player.events.length = 0;
    updateDoors(dt);
    const s = nearSpot();
    ui.setAction(s ? s.label : null);
    ui.setQuest(save.runes.filter(Boolean).length, RUNES.length, save.wand);
    waving = Math.max(0, waving - dt);
    // Place and pose the person.
    me.root.position.set(player.x, player.y + (player.harness > 0 ? -0.9 : 0), player.z);
    me.root.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), player.yaw);
    me.pose({
      mode: player.harness > 0 ? 'hang' : waving > 0 ? 'wave' : 'walk',
      phase: player.phase, speed: player.speed, lean: player.lean, t: clock,
      air: player.onGround ? null : player.vy, wet: player.wet,
    });
    walkCamera(dt, clock);
  } else if (mode === 'ride' && rider) {
    acc += dt;
    const mv = controls.moveInput();
    const kb = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
    const push = THREE.MathUtils.clamp((holdFaster ? 1 : 0) - (holdSlower ? 1 : 0) + mv.y * 0.8 + kb * 0, -1, 1);
    while (acc >= STEP && rider && !rider.done) {
      rider.step(push, mv.x);
      acc -= STEP;
    }
    for (const e of rider.events) {
      if (e === 'count') {
        sfx.beep();
        ui.bigText(`${Math.ceil(rider.wait)}`);
      } else if (e === 'drop') {
        sfx.beep(true);
        sfx.drop();
        ui.bigText('DROP!');
        setTimeout(() => ui.bigText(null), 900);
      } else if (e === 'airtime') ui.toast('🫨 AIRTIME!', 1.2);
      else if (e === 'swish') sfx.whoosh();
      else if (e === 'flush') {
        sfx.flush();
        ui.toast('🚽 FLUSH!', 1.4);
      } else if (e === 'splash') sfx.splash(true);
    }
    rider.events.length = 0;
    if (rider.def.countdown && rider.wait > 0 && rider.wait < 3.99 && !ui.root.querySelector('.big-text:not(.hidden)')) ui.bigText(`${Math.ceil(rider.wait)}`);
    if (rider.def.countdown && rider.wait <= 0) slides.trapdoor.rotation.x += (Math.PI / 2 - slides.trapdoor.rotation.x) * Math.min(1, dt * 10);
    setRush(rider.def.loop ? 1.5 : rider.speed);
    ui.setSpeed(rider.speed, rider.def.maxV);
    poseOnRide(clock);
    rideCamera(dt);
    if (rider.done) endRide();
  } else if (mode === 'title') {
    // A slow fly-by of the lodge.
    const a = clock * 0.05;
    camera.position.set(Math.sin(a) * 70, 22, 75 + Math.cos(a) * 25);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 6, 20);
  } else if (mode === 'menu' || mode === 'busy') {
    acc = 0;
  }
  rideFlat += dt;

  // People.
  clerk.pose({ mode: 'stand', phase: 0, speed: 0, lean: 0, t: clock + 3, air: null, wet: 0 });
  lifeguards.forEach((p, i) => p.pose({ mode: 'tube', phase: 0, speed: 0, lean: 0, t: clock + i, air: null, wet: 0 }));
  for (const w of walkers) {
    const [tx, tz] = w.path[w.i];
    const dx = tx - w.x, dz = tz - w.z, d = Math.hypot(dx, dz);
    if (d < 0.3) w.i = (w.i + 1) % w.path.length;
    else {
      const v = 1.15;
      w.x += (dx / d) * v * dt;
      w.z += (dz / d) * v * dt;
      let dy = Math.atan2(dx, dz) - w.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      w.yaw += dy * Math.min(1, dt * 5);
      w.phase += ((v * dt) / (0.75 + v * 0.42)) * Math.PI * 2;
    }
    w.p.root.position.set(w.x, 0, w.z);
    w.p.root.rotation.y = w.yaw;
    w.p.pose({ mode: 'walk', phase: w.phase, speed: 1.15, lean: 0, t: clock, air: null, wet: 0 });
  }

  // Light, shadows that follow you, and the world's moving parts.
  areaLight(dt);
  const focus = mode === 'title' ? new THREE.Vector3(0, 0, 30) : me.root.position;
  sun.target.position.copy(focus);
  sun.position.copy(focus).addScaledVector(SUN_DIR, 90);
  lodge.animate(dt, clock);
  slides.animate(dt);
  confetti.update(dt);
  for (const [i, r] of lodge.runes.entries()) {
    const m = r.material as THREE.MeshStandardMaterial;
    const found = save.runes[i];
    m.color.set(found ? '#ffd23a' : '#8a5cff');
    m.emissive.set(found ? '#ffb000' : '#7a3cff');
    r.visible = save.wand || found;
  }

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// Debug: ?at=park|lobby|adv|rooms|ropes, ?ride=<id>, ?tier=1..3.
const q = new URLSearchParams(location.search);
openTitle();
if (q.get('tier')) {
  save.tier = (Number(q.get('tier')) as Tier) || 0;
  ui.setBand(save.tier);
}
const AT: Record<string, [number, number, number, number]> = {
  park: [0, 0, 4, Math.PI], lobby: [0, 0, 34, Math.PI], adv: [-26, 0, 25, -Math.PI / 2], rooms: [53, 0, 31, 0], ropes: [-38.5, 4, 14.5, 0],
};
if (q.get('at') && AT[q.get('at')!]) {
  const [x, y, z, yaw] = AT[q.get('at')!];
  setMode('walk');
  player.place(x, y, z, yaw);
  camYaw = yaw;
}
if (q.get('ride') && RIDES[q.get('ride')!]) startRide(RIDES[q.get('ride')!]);
const tp = (x: number, y: number, z: number, yaw: number, pitch = 0.28) => {
  if (rider) endRide(true);
  setMode('walk');
  player.place(x, y, z, yaw);
  camYaw = yaw;
  camPitch = pitch;
  camReady = false;
};
(window as unknown as { __lodge: unknown }).__lodge = { player, scene, camera, renderer, startRide, RIDES, get rider() { return rider; }, save, tp, doAction, renderer_info: () => renderer.info.render };
requestAnimationFrame(frame);

startPwa({
  onUpdate: () => {
    updateReady = true;
    if (mode === 'title') reloadForUpdate();
    else ui.showUpdate(true);
  },
});
