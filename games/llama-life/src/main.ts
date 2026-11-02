// Llama Life: live a life in a real-looking town. Walk out of your mansion, drive your car (or one of the
// cars you earn at work) round the suburb and into the city, get a coffee at Llama Latte, take whatever you
// like at FreshMart, go to class, go to work, swim in your pool, and sleep in your bed when it gets dark.
// Nothing to win: just explore. No police!
import * as THREE from 'three';
import { BUILD, startPwa, reloadForUpdate } from '../../../shared/pwa';
import { gameStorage } from '../../../shared/storage';
import { goToArcade } from '../../../shared/home';
import { Controls } from '../../../shared/controls';
import { Walker } from './sim/walker';
import { Car, CAR_TYPES } from './sim/car';
import { isNight, pass, schoolOpen, sleep, tick, timeText, workOpen } from './sim/clock';
import { BOOKS, doWork, eat, fromSave, LESSONS, newLife, ownedCars, SHOWS, take, yum, type Life, type Look } from './sim/life';
import { blocked, CAR_SPOTS, npcs, PLACES, solidsNear, spotAt, venueAt, type Place, type Spot } from './sim/world';
import { Town } from './view/town';
import { DayNight } from './view/sky';
import { CarModel } from './view/carModel';
import { NPC_LOOKS, Person } from './view/person';
import { UI, type Screen } from './ui/ui';
import { TownMap } from './ui/map';
import { engineSound, sfx, unlock } from './ui/sfx';

// ---------------------------------------------------------------- saving

const store = gameStorage('llama-life');
let life: Life = fromSave(store.load<Partial<Life>>('save'));
const persist = () => store.save('save', life);
const debug = new URLSearchParams(location.search);
if (debug.has('hour')) life.hour = Number(debug.get('hour')) || 0;

// ---------------------------------------------------------------- renderer and world

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2200);
function fit() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', fit);
fit();

const sky = new DayNight(scene, renderer);
const town = new Town(scene);
// One light inside whichever building you're in, and your car's headlights.
const roomLight = new THREE.PointLight(0xfff0dc, 0, 40, 1.2);
scene.add(roomLight);
const headlight = new THREE.SpotLight(0xfff4dd, 0, 70, 0.55, 0.5, 1.2);
scene.add(headlight, headlight.target);

// ---------------------------------------------------------------- you, your cars, the people you meet

const HOME_START = { x: 0, z: 527, heading: Math.PI };
const me = new Walker(HOME_START.x, HOME_START.z, HOME_START.heading);
const person = new Person(life.look);
scene.add(person.root);

let cars: Car[] = [];
let carModels: CarModel[] = [];
/** Which car you're driving (an index into `cars`), or -1 on foot. */
let driving = -1;

function parkCars() {
  for (const m of carModels) scene.remove(m.root);
  const owned = ownedCars(life);
  cars = owned.map((t, i) => new Car(t, CAR_SPOTS[i % CAR_SPOTS.length].x, CAR_SPOTS[i % CAR_SPOTS.length].z, CAR_SPOTS[i % CAR_SPOTS.length].heading));
  carModels = owned.map((t) => new CarModel(t));
  for (const m of carModels) scene.add(m.root);
  driving = -1;
}
parkCars();

const people = npcs.map((n) => {
  const p = new Person(NPC_LOOKS[n.look % NPC_LOOKS.length], false);
  p.root.position.set(n.x, 0, n.z);
  p.root.rotation.y = n.heading;
  p.root.visible = false;
  scene.add(p.root);
  return p;
});

// ---------------------------------------------------------------- screens and input

let mode: Screen = 'title';
const ui = new UI(
  {
    play: () => {
      unlock();
      setMode('play');
      if (!started) {
        started = true;
        ui.popup('Welcome home! 🏡', 'Walk out the front door to find your car');
      }
    },
    resume: () => setMode('play'),
    menu: () => {
      persist();
      setMode('title');
    },
    arcade: () => {
      persist();
      goToArcade();
    },
    update: () => {
      persist();
      reloadForUpdate();
    },
    restart: () => {
      life = newLife();
      persist();
      person.setLook(life.look);
      ui.setLook(life.look);
      parkCars();
      me.placeAt(HOME_START.x, HOME_START.z, HOME_START.heading);
      started = false;
      ui.setBag(life.bag);
    },
    look: (l: Look) => {
      life.look = l;
      person.setLook(l);
      sfx.click();
      persist();
    },
    lookDone: () => setMode(ui.lookReturn === 'play' ? 'play' : 'title'),
    screen: (s) => {
      unlock();
      setMode(s);
    },
    action: () => doAction(),
    eat: (i) => {
      const it = eat(life, i);
      if (!it) return;
      persist();
      ui.setBag(life.bag);
      sfx.yum();
      setMode('play');
      ui.popup(yum(it));
    },
  },
  life.look,
);
let started = false;
const map = new TownMap(
  () => setMode('map'),
  () => setMode('play'),
  (p) => goTo(p),
);
ui.hudAppend(map.mini);
ui.add('map', map.screen);
ui.setBag(life.bag);
const controls = new Controls(ui.surface, ui.jumpBtn);

function setMode(m: Screen) {
  if (m === 'look') ui.openLookFrom(mode === 'play' ? 'play' : 'title');
  mode = m;
  ui.show(m);
  if (m === 'map') map.opened();
  controls.enabled = m === 'play';
  controls.reset();
  if (m !== 'play' && m !== 'busy') engineSound(false, 0, 1);
}
ui.show('title');

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (mode === 'map' && e.code === 'KeyM') return setMode('play');
  if ((mode === 'bag' && e.code === 'KeyB') || ((mode === 'pause' || mode === 'bag' || mode === 'map') && e.code === 'Escape')) return setMode('play');
  if (mode !== 'play') return;
  if (e.code === 'KeyF' || e.code === 'Enter') doAction();
  if (e.code === 'KeyM') setMode('map');
  if (e.code === 'KeyB') setMode('bag');
  if (e.code === 'KeyH' && driving >= 0) sfx.horn();
  if (e.code === 'Escape' || e.code === 'KeyP') setMode('pause');
});
window.addEventListener('pointerdown', () => unlock());
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  persist();
  if (mode === 'play') setMode('pause');
});

// ---------------------------------------------------------------- things you can do

/** What the action button would do right now. */
function currentAction(): { label: string; run: () => void } | null {
  if (driving >= 0) return { label: '🚪 Get out', run: getOut };
  const spot = spotAt(me.x, me.z);
  if (spot) return { label: spotLabel(spot), run: () => doSpot(spot) };
  const i = nearCar();
  if (i >= 0) return { label: `🚗 Drive the ${CAR_TYPES[cars[i].type].name}`, run: () => getIn(i) };
  return null;
}

function spotLabel(s: Spot) {
  const icon: Record<Spot['act'], string> = { sleep: '🛏️', take: s.item ?? '🛒', class: '📚', work: '💼', read: '📖', dress: '👕', tv: '📺', snack: s.item ?? '🍽️' };
  return `${icon[s.act]} ${s.label}`;
}

function doAction() {
  if (mode !== 'play') return;
  currentAction()?.run();
}

function nearCar() {
  let best = -1, bd = Infinity;
  cars.forEach((c, i) => {
    const d = Math.hypot(c.x - me.x, c.z - me.z);
    if (d < c.spec.length / 2 + 2.2 && d < bd) (best = i), (bd = d);
  });
  return best;
}

function getIn(i: number) {
  driving = i;
  me.speed = 0;
  sfx.door();
  camYaw = cars[i].heading;
  ui.popup(`${CAR_TYPES[cars[i].type].name} 🚗`, 'Left thumb to drive: up is gas, down is brake');
}

function getOut() {
  const c = cars[driving];
  if (Math.abs(c.speed) > 3) {
    ui.popup('Slow down first!', 'Stop the car to get out');
    return;
  }
  c.speed = 0;
  // Out the driver's door (the car's left), or the other side, or the back.
  const left = { x: Math.cos(c.heading), z: -Math.sin(c.heading) }, fwd = { x: Math.sin(c.heading), z: Math.cos(c.heading) };
  const w = c.spec.width / 2 + 0.7;
  const tries = [
    [left.x * w, left.z * w], [-left.x * w, -left.z * w], [-fwd.x * (c.spec.length / 2 + 0.8), -fwd.z * (c.spec.length / 2 + 0.8)], [fwd.x * (c.spec.length / 2 + 0.8), fwd.z * (c.spec.length / 2 + 0.8)],
  ];
  const spot = tries.find(([dx, dz]) => !blocked(c.x + dx, c.z + dz, 0.4)) ?? tries[0];
  me.placeAt(c.x + spot[0], c.z + spot[1], c.heading);
  driving = -1;
  sfx.door();
  engineSound(false, 0, 1);
}

function doSpot(s: Spot) {
  switch (s.act) {
    case 'take':
    case 'snack':
      if (!take(life, s.item!)) {
        sfx.nope();
        ui.popup('Your bag is full!', 'Tap 🛍️ to eat something first');
        return;
      }
      sfx.take();
      ui.setBag(life.bag);
      persist();
      ui.popup(`${s.item} in your bag!`, life.bag.length === 1 ? '1 thing in your bag' : `${life.bag.length} things in your bag`);
      return;
    case 'sleep':
      if (!isNight(life.hour)) {
        sfx.nope();
        ui.popup("It's still daytime! ☀️", 'You can sleep when it gets dark');
        return;
      }
      busy('💤 Zzz…', () => {
        sleep(life);
        persist();
        me.placeAt(s.x, s.z, -Math.PI / 2);
        sfx.morning();
        ui.popup('Good morning! ☀️', `Day ${life.day}`);
      }, 2200, true);
      sfx.lullaby();
      return;
    case 'class':
      if (!schoolOpen(life.hour)) {
        sfx.nope();
        ui.popup('School is closed', 'Come back between 8 AM and 3 PM');
        return;
      }
      sfx.bell();
      busy('📚 Class time…', () => {
        pass(life, 2);
        life.classes++;
        persist();
        ui.popup('You learned:', LESSONS[(life.classes - 1) % LESSONS.length], true);
      });
      return;
    case 'read':
      life.books++;
      persist();
      sfx.click();
      ui.popup('You read:', BOOKS[(life.books - 1) % BOOKS.length], true);
      return;
    case 'work':
      if (!workOpen(life.hour)) {
        sfx.nope();
        ui.popup('The office is closed', 'Work is from 8 AM to 6 PM');
        return;
      }
      busy('💼 Working hard…', () => {
        pass(life, 3);
        const got = doWork(life);
        persist();
        if (got.car !== undefined) {
          const i = cars.length;
          const at = CAR_SPOTS[i % CAR_SPOTS.length];
          cars.push(new Car(got.car, at.x, at.z, at.heading));
          const m = new CarModel(got.car);
          carModels.push(m);
          scene.add(m.root);
        }
        sfx.reward();
        ui.popup(got.car !== undefined ? '🎉 Payday!' : '🏆 Payday!', got.text, true);
      });
      return;
    case 'dress':
      setMode('look');
      return;
    case 'tv':
      sfx.click();
      ui.popup('You watched…', SHOWS[Math.floor(Math.random() * SHOWS.length)], true);
      return;
  }
}

let lying = false;
/** Something that takes time: fade out, do it, fade back in. Going to bed, you lie down first. */
function busy(text: string, run: () => void, hold = 1600, lie = false) {
  setMode('busy');
  lying = lie;
  setTimeout(() => {
    ui.fade(text, () => {
      run();
      lying = false;
      setTimeout(() => mode === 'busy' && setMode('play'), hold);
    }, hold);
  }, lie ? 1400 : 0);
}

/** The big map's buttons: go straight there (in your car if you're driving). */
function goTo(p: Place) {
  setMode('busy');
  ui.fade(`${p.icon} Going to ${p.name}…`, () => {
    if (driving >= 0) {
      const c = cars[driving];
      c.x = p.cx;
      c.z = p.cz;
      c.heading = p.ch;
      c.speed = 0;
      camYaw = p.ch;
    } else {
      me.placeAt(p.x, p.z, p.heading);
      camYaw = p.heading;
    }
    camPos.set(0, 0, 0);
    pass(life, 0.25);
    setTimeout(() => mode === 'busy' && setMode('play'), 600);
  }, 600);
}

// ---------------------------------------------------------------- camera

let camYaw = Math.PI;
let orbitYaw = 0;
let orbitPitch = 0;
let lookIdle = 9;
let camDist = 4.5;
const camPos = new THREE.Vector3();
const camLook = new THREE.Vector3();
let titleSpin = 0;

/** Is a camera point inside something solid? */
function solidAt(x: number, y: number, z: number) {
  for (const b of solidsNear(x, z, 0.3)) {
    if (b.low) continue;
    if (x > b.x0 - 0.25 && x < b.x1 + 0.25 && z > b.z0 - 0.25 && z < b.z1 + 0.25 && y > b.y0 - 0.2 && y < b.y1 + 0.3) return true;
  }
  return false;
}

function updateCamera(dt: number, target: THREE.Vector3, heading: number, moving: boolean) {
  if (mode === 'title' || mode === 'look') {
    // Turn slowly round you in front of the mansion; on the "me" screen, close up.
    titleSpin += dt * 0.15;
    const close = mode === 'look';
    const yaw = heading + Math.PI + Math.sin(titleSpin) * 0.5;
    const d = close ? 2.6 : 5.5;
    const t = target.clone().add(new THREE.Vector3(0, close ? 1.1 : 1.4, 0));
    const want = new THREE.Vector3(t.x - Math.sin(yaw) * d, t.y + (close ? 0.3 : 1.2), t.z - Math.cos(yaw) * d);
    clampToRoom(want, t);
    camera.position.copy(want);
    camera.lookAt(t);
    camera.rotateY(close ? 0.4 : 0.25);
    return;
  }
  const car = driving >= 0 ? cars[driving] : null;
  // Dragging on the right side looks around; when you stop it eases back behind you.
  if (controls.lookX || controls.lookY) {
    orbitYaw -= controls.lookX;
    orbitPitch = Math.max(-0.25, Math.min(1.1, orbitPitch + controls.lookY));
    controls.lookX = controls.lookY = 0;
    lookIdle = 0;
  }
  const kt = controls.keyTurn();
  if (kt) (orbitYaw -= kt * dt * 2), (lookIdle = 0);
  lookIdle += dt;
  if (car) {
    // Driving: the camera swings round behind the car.
    let d = heading - camYaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    camYaw += d * Math.min(1, dt * (1.5 + Math.abs(car.speed) * 0.12));
    if (lookIdle > 1.5) orbitYaw *= Math.max(0, 1 - dt * 2), (orbitPitch *= Math.max(0, 1 - dt * 2));
  } else {
    // On foot: fold the look-around into the camera's heading so walking stays camera-relative.
    camYaw += orbitYaw;
    orbitYaw = 0;
    if (moving && lookIdle > 1.5) {
      let d = heading - camYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      camYaw += d * Math.min(1, dt * 0.9);
    }
  }
  if (controls.zoom) (camZoom = Math.max(0.6, Math.min(2.2, camZoom + controls.zoom * 0.1))), (controls.zoom = 0);
  const room = venueAt(target.x, target.z);
  const want = (car ? 5.5 + car.spec.length * 0.6 + Math.abs(car.speed) * 0.06 : room ? 3.4 : 4.6) * camZoom;
  camDist += (want - camDist) * Math.min(1, dt * 3);
  const yaw = camYaw + orbitYaw;
  const pitch = (car ? 0.2 : lying ? 0.75 : room ? 0.32 : 0.22) + orbitPitch;
  const t = target.clone().add(new THREE.Vector3(0, car ? 1.3 + car.spec.wheelR : 1.45, 0));
  const ideal = new THREE.Vector3(
    t.x - Math.sin(yaw) * Math.cos(pitch) * camDist,
    t.y + Math.sin(pitch) * camDist,
    t.z - Math.cos(yaw) * Math.cos(pitch) * camDist,
  );
  // Don't go into walls: walk out from you toward the camera and stop before anything solid.
  const step = new THREE.Vector3().subVectors(ideal, t);
  const len = step.length();
  step.divideScalar(len);
  let reach = len;
  for (let s = 0.3; s < len; s += 0.25) {
    const p = t.clone().addScaledVector(step, s);
    if (solidAt(p.x, p.y, p.z)) {
      reach = Math.max(0.5, s - 0.3);
      break;
    }
  }
  const wantPos = t.clone().addScaledVector(step, reach);
  clampToRoom(wantPos, t);
  if (camPos.lengthSq() === 0 || camPos.distanceTo(wantPos) > 30) camPos.copy(wantPos);
  camPos.lerp(wantPos, Math.min(1, dt * 10));
  camLook.lerp(t, Math.min(1, dt * 14));
  if (camLook.distanceTo(t) > 10) camLook.copy(t);
  camera.position.copy(camPos);
  camera.lookAt(camLook);
}
let camZoom = 1;

/** Inside a building, the camera stays inside (under the ceiling, within the walls). */
function clampToRoom(p: THREE.Vector3, t: THREE.Vector3) {
  const v = venueAt(t.x, t.z);
  if (!v) return;
  p.x = Math.max(v.x0 + 0.5, Math.min(v.x1 - 0.5, p.x));
  p.z = Math.max(v.z0 + 0.5, Math.min(v.z1 - 0.5, p.z));
  p.y = Math.min(v.h - 0.35, p.y);
}

// ---------------------------------------------------------------- the loop

const STEP = 1 / 60;
let acc = 0;
let last = performance.now();
let saveTimer = 0;
let wasSwimming = false;
const shown = new THREE.Vector3();
const prev = new THREE.Vector3();

function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const car = driving >= 0 ? cars[driving] : null;
  let moving = false;
  if (mode === 'play') {
    const mv = controls.moveInput();
    const jump = controls.takeJump();
    if (jump && car) sfx.horn();
    acc += dt;
    while (acc >= STEP) {
      acc -= STEP;
      if (car) {
        prev.set(car.x, 0, car.z);
        car.step({ steer: Math.max(-1, Math.min(1, mv.x)), throttle: Math.max(-1, Math.min(1, mv.y)) }, STEP);
        if (car.bumped > 4) sfx.bump(car.bumped);
        me.x = car.x;
        me.z = car.z;
      } else {
        prev.set(me.x, me.y, me.z);
        const before = me.y;
        me.step(mv.x, mv.y, camYaw, jump, STEP);
        if (me.y > before && before === 0) sfx.jump();
      }
    }
    // The camera only swings round behind you when you walk forward (not back toward it).
    moving = mv.y > 0.35;
    tick(life, dt);
    saveTimer += dt;
    if (saveTimer > 20) (saveTimer = 0), persist();
    if (me.swimming && !wasSwimming) sfx.splash();
    wasSwimming = me.swimming;
    const a = currentAction();
    ui.setAction(a?.label ?? null);
    ui.setJump(car ? '📯\nHonk' : '⤒\nJump');
    ui.setHint(car ? `${Math.round(Math.abs(car.speed) * 2.237)} mph` : '');
    engineSound(!!car, car?.speed ?? 0, car?.spec.top ?? 1);
  } else {
    acc = 0;
    ui.setAction(null);
  }
  ui.setClock(`Day ${life.day} · ${timeText(life.hour)}`, isNight(life.hour));

  // Cars and you.
  cars.forEach((c, i) => carModels[i].update(c));
  if (car) {
    const s = car.spec;
    const [along, up, left] = s.seat;
    person.root.position.set(car.x + Math.sin(car.heading) * along + Math.cos(car.heading) * left, up - 0.5, car.z + Math.cos(car.heading) * along - Math.sin(car.heading) * left);
    person.root.rotation.y = car.heading;
    person.pose('sit', 0, dt, car.steer / 0.6);
    shown.set(car.x, 0, car.z);
  } else if (lying) {
    // In bed, head on the pillow.
    person.root.position.set(25.45, 0.62 + 0.15, 539);
    person.root.rotation.y = -Math.PI / 2;
    person.pose('lie', 0, dt);
    shown.set(25.8, 0, 539);
  } else {
    const swimY = me.swimming ? -1.25 : 0;
    shown.set(me.x, me.y + swimY, me.z);
    person.root.position.copy(shown);
    person.root.rotation.y = me.heading;
    person.pose(me.y > 0.05 ? 'air' : me.swimming ? 'swim' : 'stand', mode === 'play' || mode === 'busy' ? me.speed : 0, dt);
  }
  for (let i = 0; i < people.length; i++) {
    const n = npcs[i], p = people[i];
    p.root.visible = Math.hypot(n.x - me.x, n.z - me.z) < 45;
    if (p.root.visible) p.pose('stand', 0, dt);
  }

  // Light: the sky for the hour, a lamp in the room you're in, headlights at night.
  sky.update(life.hour, shown, camera);
  town.update(sky.night, now / 1000);
  const room = venueAt(me.x, me.z);
  if (room) {
    roomLight.position.set(Math.max(room.x0 + 1, Math.min(room.x1 - 1, me.x)), room.h - 0.6, Math.max(room.z0 + 1, Math.min(room.z1 - 1, me.z)));
    roomLight.intensity = (5 + sky.night * 9) * Math.max(1, Math.min(3, Math.sqrt((room.x1 - room.x0) * (room.z1 - room.z0)) / 20));
  } else roomLight.intensity = 0;
  for (const m of carModels) m.setLights(0);
  if (car) {
    carModels[driving].setLights(sky.night);
    const f = { x: Math.sin(car.heading), z: Math.cos(car.heading) };
    headlight.position.set(car.x + f.x * (car.spec.length / 2), car.spec.wheelR + 0.4, car.z + f.z * (car.spec.length / 2));
    headlight.target.position.set(car.x + f.x * 25, 0, car.z + f.z * 25);
    headlight.intensity = sky.night * 160;
  } else headlight.intensity = 0;

  const heading = car ? car.heading : me.heading;
  updateCamera(dt, shown, heading, moving);
  map.update(shown.x, shown.z, heading, camYaw + orbitYaw);
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- start

const at = PLACES.find((p) => p.id === debug.get('at'));
if (at) me.placeAt(at.x, at.z, at.heading);
requestAnimationFrame(frame);
startPwa({ onUpdate: () => (mode === 'title' ? reloadForUpdate() : ui.offerUpdate()) });

(window as unknown as { __life: unknown }).__life = { life: () => life, me, cars: () => cars, camera, renderer, town, BUILD, scene };
