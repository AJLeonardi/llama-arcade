// 3D Skate: start on the roof of a skyscraper, drop in on the giant blue ramp, fly off the kicker doing
// kickflips and backflips, then skate a 10-mile city full of rails, ledges, kickers and quarter pipes.
// Designed by Mariano. Looks as real as we can make it: sky-lit glass, photo asphalt, soft shadows.
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { BUILD, startPwa, reloadForUpdate } from '../../../shared/pwa';
import { gameStorage } from '../../../shared/storage';
import { goToArcade } from '../../../shared/home';
import { Controls } from '../../../shared/controls';
import { Skater, STEP, type Input } from './sim/skater';
import { HALF_W, MILE, surfaceAt } from './sim/world';
import { CityView } from './view/city';
import { DEFAULT_LOOK, SkaterModel, type Look } from './view/skaterModel';
import { BOARDS } from './view/textures';
import { sfx, rolling, unlock } from './ui/sfx';
import { UI, type Screen } from './ui/ui';

// ---------------------------------------------------------------- saving

interface Save {
  board: number;
  look: Look;
  best: number;
}
const store = gameStorage('3d-skate');
const loaded = store.load<Partial<Save>>('save') ?? {};
const save: Save = {
  board: Math.min(BOARDS.length - 1, Math.max(0, Number(loaded.board) || 0)),
  look: { ...DEFAULT_LOOK, ...(loaded.look ?? {}) },
  best: Number(loaded.best) || 0,
};
const persist = () => store.save('save', save);
const statsOf = (i: number) => ({ push: BOARDS[i].push, pop: BOARDS[i].pop });

// ---------------------------------------------------------------- renderer, sky, light

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 2400);

const SUN_DIR = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 38), THREE.MathUtils.degToRad(35));
const sky = new Sky();
sky.scale.setScalar(2000);
sky.renderOrder = -1;
const su = sky.material.uniforms;
su.turbidity.value = 3.5;
su.rayleigh.value = 1.2;
su.mieCoefficient.value = 0.004;
su.mieDirectionalG.value = 0.85;
su.sunPosition.value.copy(SUN_DIR);
scene.add(sky);
{
  // Light the scene with the sky itself (reflections in the glass, soft fill light).
  const pm = new THREE.PMREMGenerator(renderer);
  const skyScene = new THREE.Scene();
  const s2 = new Sky();
  s2.scale.setScalar(1000);
  Object.assign(s2.material.uniforms, THREE.UniformsUtils.clone(sky.material.uniforms));
  s2.material.uniforms.sunPosition.value.copy(SUN_DIR);
  skyScene.add(s2);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(900, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3b3d40 }));
  ground.position.y = -5;
  skyScene.add(ground);
  scene.environment = pm.fromScene(skyScene, 0.02).texture;
  scene.environmentIntensity = 0.8;
  pm.dispose();
}
scene.fog = new THREE.Fog(0xb4c3d3, 250, 2000);
const sun = new THREE.DirectionalLight(0xfff1dc, 2.8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, near: 1, far: 160 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x5a5550, 0.35));

function fit() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', fit);
fit();

// ---------------------------------------------------------------- world and skater

const city = new CityView(scene);
const sim = new Skater(statsOf(save.board));
const model = new SkaterModel(save.look, save.board);
scene.add(model.root);
const debug = new URLSearchParams(location.search);
const startZ = Number(debug.get('z'));
function placeAtStart() {
  sim.respawn();
  if (startZ) {
    // Debug: start out in the city at ?z=<metres>.
    sim.z = startZ;
    sim.y = surfaceAt(0, startZ, 1).h;
  }
  sim.score = 0;
  prev.set(sim.x, sim.y, sim.z);
  camYaw = sim.heading;
}

// ---------------------------------------------------------------- UI and input

let mode: Screen = 'title';
const ui = new UI(
  {
    start: () => {
      unlock();
      placeAtStart();
      setMode('play');
      ui.popup('Push off the roof!', 'Left thumb up to push');
    },
    resume: () => setMode('play'),
    restart: () => restart(),
    menu: () => {
      placeAtStart();
      setMode('title');
    },
    arcade: () => goToArcade(),
    update: () => reloadForUpdate(),
    board: (i) => {
      save.board = i;
      persist();
      model.setBoard(i);
      sim.stats = statsOf(i);
      sfx.click();
    },
    look: (l) => {
      save.look = l;
      persist();
      model.setLook(l);
      sfx.click();
    },
    screen: (s) => {
      unlock();
      setMode(s);
    },
    trick: (t) => {
      unlock();
      queued[t] = true;
    },
  },
  save.look,
  save.board,
  save.best,
);
const controls = new Controls(ui.surface, ui.ollieBtn);
const queued = { ollie: false, kickflip: false, backflip: false };
window.addEventListener('keydown', (e) => {
  if (e.repeat || mode !== 'play') return;
  if (e.code === 'KeyF' || e.code === 'KeyK') queued.kickflip = true;
  if (e.code === 'KeyB' || e.code === 'KeyL') queued.backflip = true;
  if (e.code === 'Escape' || e.code === 'KeyP') setMode('pause');
  if (e.code === 'KeyR') restart();
});
window.addEventListener('pointerdown', () => unlock());
document.addEventListener('visibilitychange', () => document.hidden && mode === 'play' && setMode('pause'));
function restart() {
  placeAtStart();
  setMode('play');
}

function setMode(m: Screen) {
  mode = m;
  ui.show(m);
  controls.enabled = m === 'play';
  controls.reset();
  if (m !== 'play') rolling(0, false, false);
}

// ---------------------------------------------------------------- camera

let camYaw = sim.heading;
let orbitYaw = 0;
let orbitPitch = 0;
let lookIdle = 0;
let camDist = 4.5;
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
const prev = new THREE.Vector3(sim.x, sim.y, sim.z);
const shown = new THREE.Vector3();
let titleSpin = 0;

function updateCamera(dt: number) {
  if (mode === 'title' || mode === 'boards' || mode === 'skater') {
    // Turn slowly around the skater, who stands on the right of the screen.
    titleSpin += dt * 0.12;
    const yaw = sim.heading + Math.PI + 0.6 + Math.sin(titleSpin) * 0.5;
    const target = new THREE.Vector3(shown.x, shown.y + 0.95, shown.z);
    camera.position.set(target.x + Math.sin(yaw) * 3.3, target.y + 0.5, target.z + Math.cos(yaw) * 3.3);
    camera.lookAt(target);
    camera.rotateY(0.32);
    return;
  }
  const [vx, , vz] = sim.velocity();
  const hs = Math.hypot(vx, vz);
  // Follow the way we're going (not the way we're spinning).
  const travel = sim.mode === 'ground' || sim.mode === 'grind' || hs < 1 ? sim.heading : Math.atan2(vx, vz);
  if (sim.mode !== 'bail') {
    let d = travel - camYaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    camYaw += d * Math.min(1, dt * (sim.mode === 'air' ? 2 : 4));
  }
  // Dragging on the right side looks around; it eases back after a moment.
  if (controls.lookX || controls.lookY) {
    orbitYaw -= controls.lookX;
    orbitPitch = Math.max(-0.3, Math.min(0.9, orbitPitch + controls.lookY));
    controls.lookX = controls.lookY = 0;
    lookIdle = 0;
  }
  lookIdle += dt;
  if (lookIdle > 1.2) {
    orbitYaw *= Math.max(0, 1 - dt * 2);
    orbitPitch *= Math.max(0, 1 - dt * 2);
  }
  const speed = Math.hypot(...sim.velocity());
  const want = 4.2 + Math.min(4, speed * 0.12) + (sim.mode === 'air' && sim.air > 0.6 ? 2 : 0);
  camDist += (want - camDist) * Math.min(1, dt * 2);
  const yaw = camYaw + orbitYaw;
  const pitch = 0.22 + orbitPitch;
  const target = new THREE.Vector3(shown.x, shown.y + 1.1, shown.z);
  const want3 = new THREE.Vector3(
    target.x - Math.sin(yaw) * Math.cos(pitch) * camDist,
    target.y + Math.sin(pitch) * camDist + 0.4,
    target.z - Math.cos(yaw) * Math.cos(pitch) * camDist,
  );
  want3.x = Math.max(-HALF_W + 1, Math.min(HALF_W - 1, want3.x));
  if (camPos.lengthSq() === 0) camPos.copy(want3);
  camPos.lerp(want3, Math.min(1, dt * 8));
  camLook.lerp(target, Math.min(1, dt * 12));
  if (camLook.distanceTo(target) > 20) camLook.copy(target);
  if (camPos.distanceTo(want3) > 40) camPos.copy(want3);
  keepInSight(camPos, target);
  camera.position.copy(camPos);
  camera.lookAt(camLook);
}

/** The highest thing at (x, z), ramps included (0 off the street). */
function topAt(x: number, z: number) {
  const h = surfaceAt(x, z, 1e6).h;
  return h < -1e8 ? 0 : h;
}

/**
 * Lifts the camera so it's above whatever is under it (the mega ramp on the way down) and so the line from
 * it to the skater doesn't pass through a ramp: you always see the skater from above, never through things.
 */
function keepInSight(cam: THREE.Vector3, target: THREE.Vector3) {
  cam.y = Math.max(cam.y, topAt(cam.x, cam.z) + 1.2);
  for (const t of [0.25, 0.5, 0.75]) {
    // A point part of the way from the skater to the camera; if it's inside something, raise the camera.
    const x = target.x + (cam.x - target.x) * t, z = target.z + (cam.z - target.z) * t;
    const y = target.y + (cam.y - target.y) * t;
    const need = topAt(x, z) + 0.5 - y;
    if (need > 0) cam.y += need / t;
  }
}

// ---------------------------------------------------------------- events from the sim

function handleEvents() {
  for (const e of sim.takeEvents()) {
    switch (e.type) {
      case 'ollie':
        sfx.pop();
        break;
      case 'land':
        sfx.land(e.hard);
        if (e.tricks.length) {
          ui.popup(e.tricks.join(' + '), `+${e.points}`);
          sfx.trick(e.tricks.length);
        } else if (e.air > 1.5) ui.popup('Big air!', `+${e.points}`);
        if (sim.score > save.best) {
          save.best = sim.score;
          persist();
          ui.setBest(save.best);
        }
        break;
      case 'grind-start':
        sfx.land(2);
        break;
      case 'grind-end':
        if (e.points >= 20) ui.popup('Grind!', `+${e.points}`);
        break;
      case 'bail':
        sfx.bail();
        ui.popup(e.why, 'Getting back up…', true);
        break;
      case 'bump':
        sfx.bump();
        break;
    }
  }
}

// ---------------------------------------------------------------- the loop

const groundQ = new THREE.Quaternion();
const yawQ = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
const nrm = new THREE.Vector3();
let acc = 0;
let last = performance.now();

function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (mode === 'play') {
    const mv = controls.moveInput();
    if (controls.takeJump()) queued.ollie = true;
    acc += dt;
    while (acc >= STEP) {
      acc -= STEP;
      const inp: Input = {
        steer: Math.max(-1, Math.min(1, mv.x)),
        throttle: Math.max(-1, Math.min(1, mv.y)),
        ollie: queued.ollie,
        kickflip: queued.kickflip,
        backflip: queued.backflip,
      };
      queued.ollie = queued.kickflip = queued.backflip = false;
      prev.set(sim.x, sim.y, sim.z);
      sim.step(inp);
    }
    handleEvents();
    const alpha = acc / STEP;
    const jump = prev.distanceToSquared(new THREE.Vector3(sim.x, sim.y, sim.z)) > 25;
    shown.set(sim.x, sim.y, sim.z);
    if (!jump) shown.lerpVectors(prev, shown, alpha);
    const [vx, vy, vz] = sim.velocity();
    rolling(Math.hypot(vx, vy, vz), sim.mode === 'ground', sim.mode === 'grind');
    ui.hud(sim.score, Math.max(0, sim.z) / MILE);
  } else {
    shown.set(sim.x, sim.y, sim.z);
    acc = 0;
  }

  // Pose the skater.
  const onGround = sim.mode === 'ground' || sim.mode === 'bail';
  nrm.set(sim.nx, sim.ny, sim.nz);
  if (!onGround) nrm.copy(UP);
  groundQ.setFromUnitVectors(UP, nrm);
  yawQ.setFromAxisAngle(UP, sim.heading);
  groundQ.multiply(yawQ);
  model.root.quaternion.slerp(groundQ, mode === 'play' ? Math.min(1, dt * (sim.mode === 'air' ? 30 : 14)) : 1);
  model.root.position.copy(shown);
  const sinceLand = sim.sinceLand;
  const crouch =
    sim.mode === 'air' ? 0.55 : sim.mode === 'grind' ? 0.35 : 0.12 + (sinceLand < 0.35 ? 0.45 * (1 - sinceLand / 0.35) : 0);
  model.pose(
    {
      crouch,
      kick: sim.kick,
      pitch: sim.flipping ? sim.pitch : 0,
      pop: sim.sincePop,
      push: sim.pushing && mode === 'play',
      bail: sim.mode === 'bail' ? sim.bailT : -1,
      lean: 0,
      grind: sim.mode === 'grind',
    },
    dt,
  );

  // Shadows follow the skater; the city streams in around them.
  sun.target.position.copy(shown);
  sun.position.copy(shown).addScaledVector(SUN_DIR, 80);
  city.update(sim.z, mode === 'play' ? 1 : 2);
  updateCamera(dt);
  sky.position.copy(camera.position);
  renderer.render(scene, camera);
}

placeAtStart();
requestAnimationFrame(frame);
startPwa({ onUpdate: () => (mode === 'title' ? reloadForUpdate() : ui.offerUpdate()) });

(window as unknown as { __skate: unknown }).__skate = { sim, city, model, camera, renderer, BUILD };
