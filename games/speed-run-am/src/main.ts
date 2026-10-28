// Speed Run AM: start in the big workout room (treadmills and a giant keyboard make you faster, and there's a
// cape that makes you jump farther), then go through a door into one of 10 levels: a chaser, a boulder, jumps,
// closing walls, a poop climb and a maze. Mistakes break you into pieces.
import * as THREE from 'three';
import { BUILD, startPwa, reloadForUpdate } from '../../../shared/pwa';
import { gameStorage } from '../../../shared/storage';
import { goToArcade } from '../../../shared/home';
import { Controls } from '../../../shared/controls';
import { Confetti } from '../../../shared/confetti';
import { LAST_LEVEL, LEVEL_INFO, makeLevel } from './sim/levels';
import { FAILS_TO_GYM, Sim, STEP, type SimEvent } from './sim/physics';
import { animate, buildPerson, Pieces, RUNNER } from './view/avatar';
import { WorldView } from './view/world';
import { sfx, unlock } from './ui/sfx';
import { UI } from './ui/ui';

interface Save {
  /** The highest level finished (0 = none yet). */
  done: number;
  cape: boolean;
}
const store = gameStorage('speed-run-am');
const loaded = store.load<Partial<Save>>('save') ?? {};
const save: Save = { done: Math.max(0, Math.min(LAST_LEVEL, Number(loaded.done) || 0)), cape: !!loaded.cape };
const persist = () => store.save('save', save);

// ---------------------------------------------------------------- renderer, scene, lights

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
scene.add(new THREE.HemisphereLight(0xfff4f8, 0xb08a70, 2.4));
const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 70 });
sun.shadow.bias = -0.0008;
scene.add(sun, sun.target);
const confetti = new Confetti(scene);
const pieces = new Pieces(scene);

function fit() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', fit);
fit();

// ---------------------------------------------------------------- game state

type Mode = 'title' | 'play' | 'pause' | 'finish';
let mode: Mode = 'title';
let sim!: Sim;
let view: WorldView | null = null;
const rig = buildPerson(RUNNER);
scene.add(rig.root);
let updateReady = false;
let busy = false; // during a fade between levels
let brokenUntil = 0; // while in pieces

let camYaw = 0;
let camPitch = 0.38;
let camDist = 9;
let liftPitch = 0;
const camTarget = new THREE.Vector3();
const prevPos = new THREE.Vector3();

function loadLevel(num: number) {
  const boost = sim?.boost ?? 0; // speed from the treadmills comes with you
  view?.dispose();
  pieces.clear();
  const level = makeLevel(num);
  sim = new Sim(level);
  sim.boost = boost;
  sim.cape = save.cape;
  sim.unlocked = Math.min(LAST_LEVEL, save.done + 1);
  view = new WorldView(level);
  scene.add(view.group);
  scene.background = new THREE.Color(level.sky);
  scene.fog = new THREE.Fog(level.sky, 70, 240);
  rig.root.visible = true;
  rig.cape.visible = save.cape;
  snapCamera();
}

function snapCamera() {
  camYaw = sim.yaw;
  camTarget.set(sim.pos[0], sim.pos[1] + 1.6, sim.pos[2]);
  prevPos.set(...sim.pos);
}

const levelTitle = () => `${sim.level.emoji} ${sim.level.num ? `Level ${sim.level.num}: ` : ''}${sim.level.name}`;

// ---------------------------------------------------------------- UI

const ui = new UI({ pause: () => openPause(), update: () => reloadForUpdate() });
const controls = new Controls(canvas, ui.jumpBtn);
window.addEventListener('pointerdown', unlock, { capture: true });

function setMode(m: Mode) {
  mode = m;
  controls.reset();
  controls.enabled = m === 'play';
  ui.showHud(m === 'play', levelTitle());
  ui.setCape(save.cape);
  ui.showUpdate(updateReady && m !== 'title');
  if (m === 'play') ui.hideScreen();
}

function openTitle() {
  if (updateReady) return reloadForUpdate(); // nothing to lose on the title screen
  if (sim.level.num !== 0) loadLevel(0);
  setMode('title');
  ui.title(save.done, {
    play: () => {
      setMode('play');
      ui.levelCard('🏋️ Workout Room');
    },
    arcade: () => goToArcade(),
  });
}

function openPause() {
  if (mode !== 'play') return;
  setMode('pause');
  ui.pause(sim.level.num === 0, {
    resume: () => setMode('play'),
    gym: () => goTo(0),
    title: () => openTitle(),
  });
}

/** Go to another level through a white flash. */
function goTo(num: number) {
  if (busy) return;
  busy = true;
  sfx.door();
  ui.fade(() => {
    loadLevel(num);
    brokenUntil = 0;
    setMode('play');
    busy = false;
    ui.levelCard(levelTitle());
  });
}

const OUCH: Record<string, string> = {
  caught: 'Caught! 😱',
  boulder: 'Squashed by the boulder! 🪨',
  squish: 'Squished! 🧱',
  goo: 'Splat in the goo! 🟢',
  poop: 'The poop got you! 💩',
  fall: 'Whoooa! 🙃',
};

function handle(e: SimEvent) {
  switch (e.type) {
    case 'jump':
      return sfx.jump();
    case 'key':
      return e.floor ? sfx.tick(e.letter.charCodeAt(0)) : sfx.key(e.letter.charCodeAt(0));
    case 'treadmill':
      sfx.zoom();
      return ui.toast(sim.boost >= 0.99 ? '💨 MAX SPEED!' : '💨 Faster!', 900);
    case 'cape':
      save.cape = true;
      persist();
      rig.cape.visible = true;
      ui.setCape(true);
      sfx.cape();
      return ui.toast('🦸 You got the CAPE! Jump farther!', 2200);
    case 'locked':
      sfx.nope();
      return ui.toast(`🔒 Finish level ${e.level - 1} first!`);
    case 'door':
      return goTo(e.level);
    case 'checkpoint':
      sfx.checkpoint();
      return ui.toast('✅ Checkpoint!');
    case 'chase':
      sfx.chase();
      return ui.toast('😱 RUN!', 1200);
    case 'poop':
      sfx.poop();
      return ui.toast('💩 The poop is rising! CLIMB!', 1800);
    case 'trap':
      sfx.trap();
      snapCamera();
      return ui.toast('🌀 Wrong way! Back to the start!', 2000);
    case 'oops':
      sfx.smash();
      pieces.burst(rig);
      rig.root.visible = false;
      brokenUntil = clock + 1.4;
      return ui.toast(OUCH[e.why] ?? 'Oops!');
    case 'finish': {
      const num = sim.level.num;
      save.done = Math.max(save.done, num);
      persist();
      sfx.finish();
      confetti.burst(new THREE.Vector3(sim.pos[0], sim.pos[1] + 2, sim.pos[2]));
      setMode('finish');
      const next = num < LAST_LEVEL ? num + 1 : 0;
      setTimeout(
        () =>
          ui.finish(sim.level.name, next ? `${LEVEL_INFO[next].emoji} ${LEVEL_INFO[next].name}` : null, {
            next: () => goTo(next),
            gym: () => goTo(0),
          }),
        1200,
      );
      return;
    }
  }
}

/** Put the runner back together at the last checkpoint, or send them to the workout room after too many tries. */
function afterPieces() {
  brokenUntil = 0;
  pieces.clear();
  if (sim.fails >= FAILS_TO_GYM) {
    ui.toast(`${FAILS_TO_GYM} in a row! Back to the workout room 💪`, 2400);
    goTo(0);
    return;
  }
  sim.respawn();
  rig.root.visible = true;
  snapCamera();
}

/** If a wall is between the player and the camera, bring the camera in front of it. Returns how much of the view was clear (0..1). */
function keepInView(target: THREE.Vector3, cam: THREE.Vector3) {
  const d = cam.clone().sub(target);
  const len = d.length();
  if (len < 0.01) return 1;
  d.divideScalar(len);
  let near = len;
  const B = sim.level.blocks;
  for (let i = 0; i < B.length; i++) {
    if (!sim.blocksView(i)) continue;
    const b = B[i], c = sim.at[i];
    let t0 = 0, t1 = near;
    const half = [b.w / 2 + 0.15, b.h / 2 + 0.15, b.d / 2 + 0.15];
    const o = [target.x, target.y, target.z], v = [d.x, d.y, d.z];
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
  return near / len;
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
  view?.update(sim, clock, dt, playerAt);
  pieces.update(dt, sim.pos[1]);
  confetti.update(dt);
  ui.setSpeed(sim.boost);

  // Camera: behind the player in play; slowly circling on the title screen.
  camTarget.lerp(new THREE.Vector3(playerAt.x, playerAt.y + 1.6, playerAt.z), Math.min(1, dt * 10));
  let yaw = camYaw, pitch = camPitch, dist = camDist;
  if (mode === 'title') {
    yaw = sim.yaw + Math.PI + Math.sin(clock * 0.3) * 0.6;
    pitch = 0.25;
    dist = 7;
  }
  const fx = Math.sin(yaw), fz = Math.cos(yaw);
  const place = (p: number) => {
    camera.position.set(camTarget.x - fx * dist * Math.cos(p), camTarget.y + dist * Math.sin(p), camTarget.z - fz * dist * Math.cos(p));
    return keepInView(camTarget, camera.position);
  };
  // Walls in the way? Look down from higher up instead, then pull in if still blocked.
  let want = pitch;
  if (mode === 'play') {
    for (const p of [pitch, 0.75, 1.05, 1.3]) {
      want = Math.max(pitch, p);
      if (place(want) > 0.85) break;
    }
  }
  liftPitch += (want - liftPitch) * Math.min(1, dt * 4);
  place(Math.max(pitch, liftPitch));
  camera.lookAt(camTarget);

  sun.position.set(camTarget.x + 10, camTarget.y + 22, camTarget.z + 8);
  sun.target.position.copy(camTarget);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- start

loadLevel(0);
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
(window as unknown as { __speedrun: unknown }).__speedrun = {
  get sim() {
    return sim;
  },
  save,
  BUILD,
  goTo,
};
