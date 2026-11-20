// Speed Run PM: one endless straight road, level after level. Free treadmills and keyboard keys make your speed
// go up with no top (all the way to ∞). Speed walls need enough speed to smash. Cross a finish line and you just
// keep running into the next level. Started from Speed Run AM's main.ts.
import * as THREE from 'three';
import { BUILD, startPwa, reloadForUpdate } from '../../../shared/pwa';
import { gameStorage } from '../../../shared/storage';
import { goToArcade } from '../../../shared/home';
import { Controls } from '../../../shared/controls';
import { Confetti } from '../../../shared/confetti';
import { makeLevel } from './sim/levels';
import { short } from './sim/numbers';
import { Sim, STEP, type SimEvent } from './sim/physics';
import { animate, buildPerson, Pieces, RUNNER } from './view/avatar';
import { WorldView } from './view/world';
import { sfx, unlock } from './ui/sfx';
import { UI } from './ui/ui';

interface Save {
  /** The level you're on (1, 2, 3...). */
  level: number;
  /** Your speed. Infinity is saved as the string 'inf' (JSON can't hold it). */
  speed: number | 'inf';
}
const store = gameStorage('speed-run-pm');
const loaded = store.load<Partial<Save>>('save') ?? {};
const save = {
  level: Math.max(1, Math.floor(Number(loaded.level) || 1)),
  speed: loaded.speed === 'inf' ? Infinity : Math.max(1, Number(loaded.speed) || 1),
};
const persist = () => {
  if (sim) save.speed = sim.speed;
  store.save('save', { level: save.level, speed: Number.isFinite(save.speed) ? save.speed : 'inf' } satisfies Save);
};

// ---------------------------------------------------------------- renderer, scene, lights

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
scene.add(new THREE.HemisphereLight(0xe5dbff, 0x3b2f73, 2.2));
const sun = new THREE.DirectionalLight(0xfff0d6, 1.8); // the moon, really
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 70 });
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);
const confetti = new Confetti(scene);
const pieces = new Pieces(scene);

// Stars, far away in every direction; they follow the player so they never get closer.
const stars = (() => {
  const pts: number[] = [];
  for (let i = 0; i < 600; i++) {
    const u = Math.random() * Math.PI * 2, v = Math.random() * 0.9 + 0.05;
    pts.push(Math.cos(u) * Math.sin(v * Math.PI) * 420, Math.cos(v * Math.PI) * 300 + 120, Math.sin(u) * Math.sin(v * Math.PI) * 420);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const s = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, fog: false }));
  scene.add(s);
  return s;
})();

function fit() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', fit);
fit();

// ---------------------------------------------------------------- game state

type Mode = 'title' | 'play' | 'pause';
let mode: Mode = 'title';
let sim!: Sim;
let view: WorldView | null = null;
/** The level you just finished, still drawn behind you. */
let trail: WorldView | null = null;
const rig = buildPerson(RUNNER);
rig.cape.visible = false; // no cape in this one
scene.add(rig.root);
let updateReady = false;
let busy = false; // during a fade between levels
let brokenUntil = 0; // while in pieces

let camYaw = 0;
let camPitch = 0.38;
let camDist = 9;
const camTarget = new THREE.Vector3();
const prevPos = new THREE.Vector3();

function loadLevel(num: number) {
  const speed = sim?.speed ?? save.speed; // your speed always comes with you
  view?.dispose();
  trail?.dispose();
  trail = null;
  pieces.clear();
  const level = makeLevel(num);
  sim = new Sim(level);
  sim.speed = speed;
  view = new WorldView(level);
  scene.add(view.group);
  scene.background = new THREE.Color(level.sky);
  scene.fog = new THREE.Fog(level.sky, 90, 320);
  rig.root.visible = true;
  snapCamera();
}

/**
 * Crossed the finish line: run straight on into the next level, no stopping. Each level has its own z, starting
 * at 0 where the last finish line was, so everything (you, the camera, the last level's picture) moves back by
 * the old finish line's z. The last level stays drawn behind you until the next finish line.
 */
function runOn() {
  const old = sim;
  const shift = old.level.finishZ;
  trail?.dispose();
  trail = view;
  if (trail) trail.group.position.z -= shift;
  const level = makeLevel(old.level.num + 1, false);
  sim = new Sim(level);
  sim.speed = old.speed;
  sim.pos = [old.pos[0], old.pos[1], old.pos[2] - shift];
  sim.vel = [...old.vel];
  sim.yaw = old.yaw;
  view = new WorldView(level);
  scene.add(view.group);
  camTarget.z -= shift;
  prevPos.z -= shift;
  camera.position.z -= shift;
}

function snapCamera() {
  camYaw = sim.yaw;
  camTarget.set(sim.pos[0], sim.pos[1] + 1.6, sim.pos[2]);
  prevPos.set(...sim.pos);
}

const levelTitle = () => `🌙 Level ${sim.level.num}`;

// ---------------------------------------------------------------- UI

const ui = new UI({ pause: () => openPause(), update: () => reloadForUpdate() });
const controls = new Controls(canvas, ui.jumpBtn);
window.addEventListener('pointerdown', unlock, { capture: true });

function setMode(m: Mode) {
  mode = m;
  controls.reset();
  controls.enabled = m === 'play';
  ui.showHud(m === 'play', levelTitle());
  ui.showUpdate(updateReady && m !== 'title');
  if (m === 'play') ui.hideScreen();
}

function openTitle() {
  if (updateReady) return reloadForUpdate(); // nothing to lose on the title screen
  setMode('title');
  ui.title(save.level, short(sim.speed), {
    play: () => {
      setMode('play');
      ui.levelCard(levelTitle());
    },
    arcade: () => goToArcade(),
  });
}

function openPause() {
  if (mode !== 'play') return;
  persist();
  setMode('pause');
  ui.pause({
    resume: () => setMode('play'),
    title: () => openTitle(),
  });
}

/** Go to a level through a white flash. */
function goTo(num: number) {
  if (busy) return;
  busy = true;
  sfx.next();
  ui.fade(() => {
    loadLevel(num);
    brokenUntil = 0;
    setMode('play');
    busy = false;
    ui.levelCard(levelTitle());
  });
}

const OUCH: Record<string, string> = {
  goo: 'Splat in the goo! 🟢',
  fall: 'Whoooa! 🙃',
};

let lastTick = 0;

function handle(e: SimEvent) {
  switch (e.type) {
    case 'jump':
      return sfx.jump();
    case 'pad':
      return sfx.pad();
    case 'key':
      // Clicks no faster than 25 a second, however fast you run.
      if (clock - lastTick > 0.04) {
        lastTick = clock;
        sfx.tick(e.letter.charCodeAt(0));
      }
      return;
    case 'treadmill':
      sfx.zoom();
      persist();
      return ui.toast(`⚡ +${e.gain === 1 ? '' : `×${e.gain} `}Faster!`, 900);
    case 'smash': {
      sfx.smash();
      const b = sim.level.blocks[e.block];
      confetti.burst(new THREE.Vector3(sim.pos[0], 3, b.z));
      return ui.toast('💥 SMASH!', 1800);
    }
    case 'tooSlow':
      sfx.nope();
      return ui.toast(`🐢 You need ⚡${short(e.need)}! Run on the big treadmills right here!`, 3500);
    case 'skim':
      sfx.pad();
      return ui.toast('🌊 Too fast for the goo!', 2200);
    case 'oops':
      sfx.ouch();
      pieces.burst(rig);
      rig.root.visible = false;
      brokenUntil = clock + 1.2;
      return ui.toast(OUCH[e.why] ?? 'Oops!');
    case 'finish': {
      // No doors and no restart: the road just keeps going into the next level.
      const done = sim.level.num;
      runOn();
      save.level = sim.level.num;
      persist();
      sfx.finish();
      confetti.burst(new THREE.Vector3(sim.pos[0], sim.pos[1] + 2, sim.pos[2] + 6));
      ui.toast(`🏆 Level ${done} done!`, 2600);
      ui.showHud(true, levelTitle());
      ui.levelCard(levelTitle());
      return;
    }
  }
}

/** Put the runner back together, just behind where it happened. */
function afterPieces() {
  brokenUntil = 0;
  pieces.clear();
  sim.respawn();
  rig.root.visible = true;
  snapCamera();
}

/** If a wall is between the player and the camera, bring the camera in front of it. */
function keepInView(target: THREE.Vector3, cam: THREE.Vector3) {
  const d = cam.clone().sub(target);
  const len = d.length();
  if (len < 0.01) return;
  d.divideScalar(len);
  let near = len;
  const B = sim.level.blocks;
  for (let i = 0; i < B.length; i++) {
    const b = B[i];
    if (!sim.solidAt(i) || b.h < 1.2) continue;
    let t0 = 0, t1 = near;
    const half = [b.w / 2 + 0.15, b.h / 2 + 0.15, b.d / 2 + 0.15];
    const c = [b.x, b.y, b.z], o = [target.x, target.y, target.z], v = [d.x, d.y, d.z];
    let hit = true;
    for (let k = 0; k < 3 && hit; k++) {
      if (Math.abs(v[k]) < 1e-9) {
        if (Math.abs(o[k] - c[k]) > half[k]) hit = false;
        continue;
      }
      let a = (c[k] - half[k] - o[k]) / v[k], z = (c[k] + half[k] - o[k]) / v[k];
      if (a > z) [a, z] = [z, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, z);
      if (t0 > t1) hit = false;
    }
    if (hit && t0 > 0.05) near = Math.min(near, t0);
  }
  if (near < len) cam.copy(target).addScaledVector(d, Math.max(0.6, near - 0.1));
}

// ---------------------------------------------------------------- the loop

let last = performance.now();
let acc = 0;
let clock = 0;
let lastLook = -10;
const playerAt = new THREE.Vector3();

function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  clock += dt;

  // Camera control: dragging (or Q/E) turns it; otherwise it slowly swings round behind you as you run.
  const turn = controls.keyTurn();
  if (controls.lookX || controls.lookY || turn) lastLook = clock;
  camYaw -= controls.lookX + turn * 2.2 * dt;
  camPitch = Math.max(-0.15, Math.min(1.2, camPitch + controls.lookY));
  camDist = Math.max(4, Math.min(16, camDist + controls.zoom * 0.8));
  controls.lookX = controls.lookY = controls.zoom = 0;
  const speed = Math.hypot(sim.vel[0], sim.vel[2]);
  if (mode === 'play' && clock - lastLook > 1.5 && speed > 1) {
    const d = Math.atan2(Math.sin(sim.yaw - camYaw), Math.cos(sim.yaw - camYaw));
    if (Math.abs(d) < 2.2) camYaw += d * Math.min(1, dt * 1.2 * Math.min(1, speed / 7));
  }

  // Physics at a fixed 60 steps a second.
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
  if (brokenUntil && clock > brokenUntil && !busy) afterPieces();
  const a = acc / STEP;
  playerAt.set(
    prevPos.x + (sim.pos[0] - prevPos.x) * a,
    prevPos.y + (sim.pos[1] - prevPos.y) * a,
    prevPos.z + (sim.pos[2] - prevPos.z) * a,
  );

  rig.root.position.copy(playerAt);
  rig.root.rotation.set(0, sim.yaw, 0);
  animate(rig, clock, speed, !sim.onGround);
  view?.update(sim, clock, dt);
  pieces.update(dt, sim.pos[1]);
  confetti.update(dt);
  ui.setSpeed(short(sim.speed));

  // Camera: right behind the player in play (no lag, even at a huge speed); slowly circling on the title screen.
  camTarget.set(playerAt.x, camTarget.y + (playerAt.y + 1.6 - camTarget.y) * Math.min(1, dt * 10), playerAt.z);
  let yaw = camYaw, pitch = camPitch, dist = camDist;
  if (mode === 'title') {
    yaw = sim.yaw + Math.PI + Math.sin(clock * 0.3) * 0.6;
    pitch = 0.25;
    dist = 7;
  }
  // Going fast? The camera pulls back a little and the view gets wider, so it feels fast.
  const zoom = Math.min(1, Math.max(0, (speed - 10) / 60));
  dist += zoom * 3;
  const fov = 60 + zoom * 22;
  if (Math.abs(camera.fov - fov) > 0.1) {
    camera.fov += (fov - camera.fov) * Math.min(1, dt * 4);
    camera.updateProjectionMatrix();
  }
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  camera.position.set(camTarget.x - fx * dist * Math.cos(pitch), camTarget.y + dist * Math.sin(pitch), camTarget.z - fz * dist * Math.cos(pitch));
  keepInView(camTarget, camera.position);
  camera.lookAt(camTarget);

  sun.position.set(camTarget.x + 10, camTarget.y + 22, camTarget.z + 8);
  sun.target.position.copy(camTarget);
  stars.position.copy(camera.position);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- start

loadLevel(save.level);
openTitle();
requestAnimationFrame(frame);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    persist();
    openPause();
  }
});

startPwa({
  onUpdate: () => {
    updateReady = true;
    if (mode === 'title') reloadForUpdate();
    else ui.showUpdate(true);
  },
});

// For poking at the game from the console while testing.
(window as unknown as { __speedrun: unknown }).__speedrun = {
  get sim() {
    return sim;
  },
  save,
  BUILD,
  goTo,
};
