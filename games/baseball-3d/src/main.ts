// Llama Baseball 3D. Play as Leonardo Benjamin: the high school season, the high school playoffs, college
// with the Boston Strikers, then the Finals against the Providence Lightning (7 Finals!). Or pick any team
// (Franchise), or play in the backyard. Looks and plays like MLB The Show 26: the catcher's-eye batting view
// with a big hitting oval ("Big Zone"), pitch types and a timing ring for pitching, a TV scorebug.
// The rules are plain numbers in sim/ (tested in Node); this file is the camera, the people and the flow
// of each pitch: aim → (ring) → windup → flight → in play → result.
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { BUILD, startPwa, reloadForUpdate } from '../../../shared/pwa';
import { gameStorage } from '../../../shared/storage';
import { goToArcade } from '../../../shared/home';
import { Confetti } from '../../../shared/confetti';
import { aiPitch, aiSwing } from './sim/ai';
import { basePos, fielderHome, POSITIONS, type Park } from './sim/field';
import { Game, type PlayOutcome } from './sim/game';
import { pathAt, play, relayFor, runTimes, swingResult, SWING_DELAY, THROW, TIMING, RUN_SPEED, type BallInPlay, type Contact, type Relay } from './sim/hit';
import { inZone, makePitch, MPH, pitchPos, zoneFor, type Pitch, type PitchType } from './sim/pitch';
import { afterGame, CAREER, lineup, NEW_CAREER, parkOf, team, TEAMS, type CareerSave, type Player, type Team } from './sim/teams';
import { buildPark, type ParkView } from './view/park';
import { Person, RELEASE_S, type Look } from './view/person';
import { setCrowd, sfx, unlock } from './ui/sfx';
import { UI } from './ui/ui';

void BUILD;

// ---------------------------------------------------------------- saving

interface Save { career: CareerSave; myTeam: string; oppTeam: string }
const store = gameStorage('baseball-3d');
const loaded = store.load<Partial<Save>>('save') ?? {};
const save: Save = {
  career: { ...NEW_CAREER, ...(loaded.career ?? {}) },
  myTeam: TEAMS.some((t) => t.id === loaded.myTeam) ? loaded.myTeam! : 'pinevalley',
  oppTeam: TEAMS.some((t) => t.id === loaded.oppTeam) ? loaded.oppTeam! : 'lightning',
};
if (save.career.stage >= CAREER.length) save.career = { ...NEW_CAREER };
const persist = () => store.save('save', save);

// ---------------------------------------------------------------- renderer, sky, light

const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 2000);

const sky = new Sky();
sky.scale.setScalar(1500);
const su = sky.material.uniforms;
su.turbidity.value = 4;
su.rayleigh.value = 1.2;
su.mieCoefficient.value = 0.004;
su.mieDirectionalG.value = 0.85;
scene.add(sky);
const sun = new THREE.DirectionalLight(0xfff2dc, 3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 220 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x4a6a3a, 0.9);
scene.add(hemi);

function setLighting(night: boolean) {
  if (night) {
    sky.visible = false;
    scene.background = new THREE.Color('#0a1022');
    scene.fog = new THREE.Fog(0x0a1022, 260, 900);
    sun.color.set('#f4f6ff');
    sun.intensity = 2.6;
    sun.position.set(10, 90, -20);
    hemi.color.set('#9fb0d8');
    hemi.groundColor.set('#33452c');
    hemi.intensity = 1.1;
    renderer.toneMappingExposure = 1.05;
  } else {
    sky.visible = true;
    scene.background = null;
    scene.fog = new THREE.Fog(0xc4d4e4, 300, 1400);
    const dir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 48), THREE.MathUtils.degToRad(200));
    su.sunPosition.value.copy(dir);
    sun.color.set('#fff2dc');
    sun.intensity = 3;
    sun.position.copy(dir).multiplyScalar(120);
    hemi.color.set('#dfe8ff');
    hemi.groundColor.set('#4a6a3a');
    hemi.intensity = 0.9;
    renderer.toneMappingExposure = 0.95;
  }
  sun.target.position.set(0, 0, 10);
}

function fit() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', fit);
fit();

const confetti = new Confetti(scene);

// The ball (drawn a bit bigger than real so you can see it on an iPad), and its shadow-free trail marker.
const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(0.037 * 1.7, 14, 10), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, emissive: '#555555' }));
ballMesh.castShadow = true;
ballMesh.visible = false;
scene.add(ballMesh);
// A short fading trail behind a hit ball, so you can follow it into the sky.
const TRAIL = 14;
const trail = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: '#fff7d6', transparent: true, opacity: 0.55 }), TRAIL);
trail.frustumCulled = false;
trail.visible = false;
scene.add(trail);
const trailPts: THREE.Vector3[] = Array.from({ length: TRAIL }, () => new THREE.Vector3());
const tmpObj = new THREE.Object3D();
function updateTrail(on: boolean, size: number) {
  trail.visible = on;
  if (!on) {
    for (const p of trailPts) p.copy(ballMesh.position);
    return;
  }
  trailPts.pop();
  trailPts.unshift(ballMesh.position.clone());
  trailPts.forEach((p, i) => {
    tmpObj.position.copy(p);
    tmpObj.scale.setScalar(size * (1 - i / TRAIL));
    tmpObj.updateMatrix();
    trail.setMatrixAt(i, tmpObj.matrix);
  });
  trail.instanceMatrix.needsUpdate = true;
}

// Overlays at the plate: the strike zone, your hitting oval (PCI), the pitch target and its timing ring.
const overlay = new THREE.Group();
scene.add(overlay);
const ovMat = (c: string, o = 0.9) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
const zoneBox = new THREE.Group();
overlay.add(zoneBox);
const pci = new THREE.Group();
{
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 56), ovMat('#ffffff', 0.85));
  const fill = new THREE.Mesh(new THREE.CircleGeometry(1, 56), ovMat('#ffffff', 0.1));
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), ovMat('#ffd21f', 0.95));
  pci.add(fill, ring, dot);
}
overlay.add(pci);
const target = new THREE.Mesh(new THREE.RingGeometry(0.05, 0.075, 32), ovMat('#ffd21f'));
const timingRing = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 48), ovMat('#ffffff', 0.9));
overlay.add(target, timingRing);
overlay.traverse((o) => (o.renderOrder = 10));

function drawZone(z: { lo: number; hi: number; half: number }) {
  zoneBox.clear();
  const m = ovMat('#ffffff', 0.8);
  const w = 0.022;
  const bar = (x: number, y: number, bw: number, bh: number) => {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), m);
    b.position.set(x, y, 0);
    b.rotation.y = Math.PI;
    b.renderOrder = 10;
    zoneBox.add(b);
  };
  const W = z.half * 2, H = z.hi - z.lo;
  bar(0, z.hi, W, w);
  bar(0, z.lo, W, w);
  bar(-z.half, (z.lo + z.hi) / 2, w, H);
  bar(z.half, (z.lo + z.hi) / 2, w, H);
}

// ---------------------------------------------------------------- the match

interface Match {
  park: Park;
  pv: ParkView;
  teams: [Team, Team];
  lineups: [Player[], Player[]];
  /** Which side you are: 0 bats first (visitors), 1 bats second (home). */
  user: 0 | 1;
  game: Game;
  mode: 'career' | 'franchise' | 'backyard';
  /** Fielders (by POSITIONS) and the batter + 3 runners, for each team. */
  fielders: [Person[], Person[]];
  hitters: [Person[], Person[]];
  stats: [{ h: number; ab: number }[], { h: number; ab: number }[]];
  scale: number;
  maxEv: number;
  oval: { rx: number; ry: number };
  zone: { lo: number; hi: number; half: number };
  /** The pitchers (index into the lineup, just for the jersey). */
  pitcher: [Player, Player];
}
let M: Match | null = null;
const world = new THREE.Group();
scene.add(world);

const SKINS = ['#f1c8a5', '#e8b48f', '#c68863', '#8d5a3c', '#e0ac85', '#5c3a24', '#f6d2b8'];
const HAIRS = ['#2b1d14', '#4a2e1a', '#111111', '#b5462b', '#d9a441', '#6b4423'];
const lookFor = (t: Team, p: Player): Look => ({
  skin: p.num === 7 && p.name.startsWith('Leonardo') ? '#e8b48f' : SKINS[p.num % SKINS.length],
  hair: p.num === 7 && p.name.startsWith('Leonardo') ? '#4a2e1a' : HAIRS[(p.num * 3) % HAIRS.length],
  jersey: t.colors[0], trim: t.colors[1], pants: t.colors[2], num: p.num, abbr: t.abbr,
});

function disposeWorld() {
  world.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.geometry.dispose();
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        (m as THREE.MeshStandardMaterial).map?.dispose();
        m.dispose();
      }
    }
  });
  world.clear();
}

function startMatch(o: { user: Team; opp: Team; userHome: boolean; mode: Match['mode']; withLeo: boolean; park: Park }) {
  disposeWorld();
  const teams: [Team, Team] = o.userHome ? [o.opp, o.user] : [o.user, o.opp];
  const userSide: 0 | 1 = o.userHome ? 1 : 0;
  const home = teams[1];
  const pv = buildPark(o.park, home.colors[0], `${home.city} ${home.name}`);
  world.add(pv.group);
  setLighting(o.park.night);
  const scale = o.park.kind === 'backyard' ? 1.0 : 1.25;
  const lineups: [Player[], Player[]] = [lineup(teams[0], o.withLeo && userSide === 0), lineup(teams[1], o.withLeo && userSide === 1)];
  const pitcher: [Player, Player] = [lineups[0][o.withLeo && userSide === 0 ? 2 : 8], lineups[1][o.withLeo && userSide === 1 ? 2 : 8]];
  const fielders: [Person[], Person[]] = [[], []];
  const hitters: [Person[], Person[]] = [[], []];
  for (const k of [0, 1] as const) {
    const t = teams[k];
    POSITIONS.forEach((pos, i) => {
      const pl = pos === 'P' ? pitcher[k] : lineups[k][(i + 3) % 9];
      const p = new Person(lookFor(t, pl), pos !== 'P' && pos !== 'C');
      p.root.scale.setScalar(scale);
      p.setGear({ glove: true });
      world.add(p.root);
      fielders[k].push(p);
    });
    for (let i = 0; i < 4; i++) {
      const p = new Person(lookFor(t, lineups[k][i]), i > 0);
      p.root.scale.setScalar(scale);
      p.setGear({ glove: false, helmet: true });
      world.add(p.root);
      hitters[k].push(p);
    }
  }
  const zone = zoneFor(o.park);
  drawZone(zone);
  const maxEv = { hs: 40, college: 42, pro: 44, backyard: 27 }[o.park.kind];
  M = {
    park: o.park, pv, teams, lineups, user: userSide, game: new Game(3), mode: o.mode, fielders, hitters,
    stats: [lineups[0].map(() => ({ h: 0, ab: 0 })), lineups[1].map(() => ({ h: 0, ab: 0 }))],
    scale, maxEv, oval: o.park.kind === 'backyard' ? { rx: 0.3, ry: 0.26 } : { rx: 0.25, ry: 0.21 }, zone, pitcher,
  };
  oval.x = 0;
  oval.y = (zone.lo + zone.hi) / 2;
  aim.x = 0;
  aim.y = oval.y;
  ui.closeMenu();
  ui.showHud(true);
  setCrowd(o.park.kind === 'backyard' ? 0.15 : o.park.kind === 'hs' ? 0.4 : 1);
  sfx.charge();
  updateBug();
  scoreboardMsg(`${teams[0].name} at ${teams[1].name}`);
  ui.big('PLAY BALL!', 'wow', 1500);
  newBatter();
  setPhase('aim');
  appMode = 'game';
}

// ---------------------------------------------------------------- state for each pitch

type Phase = 'aim' | 'ring' | 'windup' | 'flight' | 'inplay' | 'after' | 'switch';
let phase: Phase = 'aim';
let pt = 0; // seconds in this phase
let appMode: 'title' | 'game' | 'paused' = 'title';
const oval = { x: 0, y: 0.8 };
const aim = { x: 0, y: 0.8 };
let pitchType: PitchType = 'fast';
let pitch: Pitch | null = null;
let windT = 0; // since the windup started
let flightT = 0; // since release
let swingAt: number | null = null; // flight time when the swing started
let aiPlan: ReturnType<typeof aiSwing> | null = null;
let resolved = false;
let bip: BallInPlay | null = null;
let outcome: PlayOutcome | null = null;
let ringErr = 0;
let afterWait = 1.6;
const WINDUP = 1.9; // the whole pitching motion; release at RELEASE_S of it

const userBatting = () => !!M && M.game.batting === M.user;

function setPhase(p: Phase) {
  phase = p;
  pt = 0;
  if (!M) return;
  if (p === 'aim') {
    placeForPitch();
    pitch = null;
    swingAt = null;
    aiPlan = null;
    resolved = false;
    bip = null;
    ballMesh.visible = false;
    ui.setMode(userBatting() ? 'bat' : 'pitch');
    ui.setThrowLabel('PITCH', false);
    ui.setPitchType(pitchType);
    ui.hint.textContent = 'Drag to move the circle over the ball · tap SWING when it gets there';
  }
  if (p === 'inplay' || p === 'after' || p === 'switch') ui.setMode('watch');
  if (p === 'windup') {
    windT = 0;
    ui.setMode(userBatting() ? 'bat' : 'watch');
  }
}

/** Everyone back to their spots before a pitch. */
function placeForPitch() {
  if (!M) return;
  const g = M.game, sc = M.scale;
  for (const k of [0, 1] as const) {
    const fielding = g.fielding === k;
    M.fielders[k].forEach((p, i) => {
      p.root.visible = fielding;
      const [x, z] = fielderHome(M!.park, POSITIONS[i]);
      p.root.position.set(x, POSITIONS[i] === 'P' ? 0.25 * (M!.park.base / 27.43) : 0, z);
      p.root.rotation.y = Math.atan2(-x, -z);
      p.setGear({ ball: POSITIONS[i] === 'P' });
    });
    M.hitters[k].forEach((p, i) => {
      p.root.visible = !fielding && (i === 0 || g.bases[i - 1]);
      if (i === 0) {
        p.root.position.set(0.95 * sc, 0, 0.05);
        p.root.rotation.y = -Math.PI / 2;
        p.setGear({ bat: true });
      } else {
        const [x, z] = basePos(M!.park, i);
        // Leading off a little toward the next base.
        const [nx, nz] = basePos(M!.park, i + 1);
        const l = Math.hypot(nx - x, nz - z);
        p.root.position.set(x + ((nx - x) / l) * 2, 0, z + ((nz - z) / l) * 2);
        p.root.rotation.y = Math.atan2(-x, -z);
        p.setGear({ bat: false });
      }
    });
  }
  // The catcher faces the pitcher; the pitcher faces home.
  const f = M.fielders[g.fielding];
  f[1].root.position.set(0, 0, -0.95 * sc);
  f[1].root.rotation.y = 0;
  f[0].root.rotation.y = Math.PI;
}

function newBatter() {
  if (!M) return;
  const g = M.game, k = g.batting;
  const pl = M.lineups[k][g.batter[k]];
  const t = M.teams[k];
  const b = M.hitters[k][0];
  b.setPlayer(pl.num, lookFor(t, pl).skin, lookFor(t, pl).hair);
  const st = M.stats[k][g.batter[k]];
  const leo = pl.name === 'Leonardo Benjamin';
  ui.showBatter(pl.num, pl.name, t, st.ab ? `${st.h} for ${st.ab} today` : 'first time up today', leo);
  if (leo && k === M.user) ui.toast('⭐ Leonardo Benjamin is up!');
}

function updateBug() {
  if (!M) return;
  const g = M.game;
  ui.setBug({ away: M.teams[0], home: M.teams[1], score: g.score, inning: g.inning, top: g.top, balls: g.balls, strikes: g.strikes, outs: g.outs, bases: g.bases });
}

function scoreboardMsg(msg: string) {
  if (!M) return;
  const g = M.game;
  M.pv.scoreboard({ away: M.teams[0].abbr, home: M.teams[1].abbr, line: g.line, score: g.score, inning: g.inning, top: g.top, msg });
}

// ---------------------------------------------------------------- input

const keys: Record<string, boolean> = {};
let drag: { x: number; y: number } | null = null;
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  unlock();
  if (appMode !== 'game') return;
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    if (!e.repeat) action();
  }
  const n = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
  if (n >= 0) choosePitch((['fast', 'curve', 'slider', 'change'] as PitchType[])[n]);
  if (e.code === 'Escape') pause();
});
window.addEventListener('keyup', (e) => (keys[e.code] = false));
canvas.addEventListener('pointerdown', (e) => {
  unlock();
  drag = { x: e.clientX, y: e.clientY };
});
window.addEventListener('pointermove', (e) => {
  if (!drag || !M || appMode !== 'game') return;
  // Drag anywhere: about a third of the screen height moves the circle the height of the zone.
  const k = 0.75 / window.innerHeight * (M.zone.hi - M.zone.lo) / 0.3;
  const dx = (e.clientX - drag.x) * k, dy = (e.clientY - drag.y) * k;
  drag = { x: e.clientX, y: e.clientY };
  moveAim(-dx, -dy);
});
window.addEventListener('pointerup', () => (drag = null));
window.addEventListener('pointercancel', () => (drag = null));

/** Move the hitting oval (batting) or the pitch target (pitching). Screen-right is -x from the catcher's view. */
function moveAim(dx: number, dy: number) {
  if (!M) return;
  const z = M.zone;
  if (userBatting()) {
    oval.x = THREE.MathUtils.clamp(oval.x + dx, -0.55, 0.55);
    oval.y = THREE.MathUtils.clamp(oval.y + dy, z.lo - 0.3, z.hi + 0.3);
  } else if (phase === 'aim') {
    // From behind the pitcher, screen-right is +x.
    aim.x = THREE.MathUtils.clamp(aim.x - dx, -0.6, 0.6);
    aim.y = THREE.MathUtils.clamp(aim.y + dy, z.lo - 0.35, z.hi + 0.35);
  }
}

function choosePitch(t: PitchType) {
  pitchType = t;
  ui.setPitchType(t);
  sfx.tap();
}

/** SWING / PITCH. */
function action() {
  if (!M || appMode !== 'game') return;
  if (userBatting()) {
    if ((phase === 'flight' || phase === 'windup') && swingAt === null) {
      swingAt = phase === 'flight' ? flightT : -(WINDUP * RELEASE_S - windT);
      sfx.whoosh();
    }
    return;
  }
  if (phase === 'aim') {
    setPhase('ring');
    ui.setThrowLabel('NOW!', true);
  } else if (phase === 'ring') {
    ringErr = Math.abs(ringRadius(pt) - 0.075);
    throwPitch();
  }
}

const RING_TIME = 1.0;
const ringRadius = (t: number) => Math.max(0, 0.5 * (1 - t / RING_TIME)) + 0.0;

function throwPitch() {
  if (!M) return;
  // How far off: tap when the ring is on the target circle for a perfect pitch.
  const miss = Math.min(0.4, ringErr * 0.8);
  const a = Math.random() * Math.PI * 2;
  const end: [number, number] = [aim.x + Math.cos(a) * miss, aim.y + Math.sin(a) * miss];
  const k = M.game.fielding;
  const fb = M.teams[k].fastball + (M.pitcher[k].name === 'Leonardo Benjamin' ? 1.5 : 0);
  // You aim where it ends up, so take the break off for the aim point.
  const p0 = makePitch(M.park, pitchType, fb, end);
  pitch = makePitch(M.park, pitchType, fb, [end[0] * 2 - p0.end[0], end[1] * 2 - p0.end[1]]);
  ui.setThrowLabel(ringErr < 0.05 ? 'PERFECT!' : ringErr < 0.12 ? 'GOOD' : 'OOPS', false);
  setPhase('windup');
}

function aiThrow() {
  if (!M) return;
  const k = M.game.fielding, t = M.teams[k];
  const ap = aiPitch(Math.random, M.zone, t.control, M.game.balls, M.game.strikes);
  // The computer aims where it wants the ball to end up.
  const p0 = makePitch(M.park, ap.type, t.fastball, ap.aim);
  pitch = makePitch(M.park, ap.type, t.fastball, [ap.aim[0] * 2 - p0.end[0], ap.aim[1] * 2 - p0.end[1]]);
  setPhase('windup');
}

// ---------------------------------------------------------------- the flow

function step(dt: number) {
  if (!M) return;
  pt += dt;
  const g = M.game;
  // Keyboard moves the oval/target.
  const kx = (keys.ArrowLeft || keys.KeyA ? 1 : 0) - (keys.ArrowRight || keys.KeyD ? 1 : 0);
  const ky = (keys.ArrowUp || keys.KeyW ? 1 : 0) - (keys.ArrowDown || keys.KeyS ? 1 : 0);
  if (kx || ky) moveAim(kx * 0.9 * dt, ky * 0.9 * dt);

  switch (phase) {
    case 'aim':
      if (userBatting() && pt > 1.3) aiThrow();
      break;
    case 'ring':
      if (pt >= RING_TIME) {
        ringErr = 0.35;
        throwPitch();
      }
      break;
    case 'windup':
      windT += dt;
      if (!userBatting() && !aiPlan && pitch) {
        const b = M.lineups[g.batting][g.batter[g.batting]];
        const skill = M.teams[g.batting].skill * 0.6 + b.eye * 0.4;
        aiPlan = aiSwing(Math.random, pitch, M.zone, skill, g.strikes, M.oval, b.power, M.maxEv);
      }
      if (windT >= WINDUP * RELEASE_S && pitch) {
        flightT = 0;
        setPhase('flight');
        ballMesh.visible = true;
        if (aiPlan?.swung) swingAt = pitch.T - SWING_DELAY + (aiPlan.contact ? 0 : (Math.random() - 0.5) * 0.1);
      }
      break;
    case 'flight':
      windT += dt;
      flightT += dt;
      flight();
      break;
    case 'inplay':
      windT += dt;
      inPlay();
      break;
    case 'after':
      if (pt >= afterWait) afterPlay();
      break;
    case 'switch':
      if (pt >= 1.8) {
        ui.closeMenu();
        newBatter();
        setPhase('aim');
      }
      break;
  }
}

function flight() {
  if (!M || !pitch) return;
  const p = pitch;
  const pos = pitchPos(p, flightT);
  const g = M.game;
  const tc = swingAt !== null ? swingAt + SWING_DELAY : null;
  const glove = p.T + (0.95 * M.scale) / p.speed; // when it reaches the catcher's mitt
  ballMesh.position.set(...pos);
  if (flightT >= glove) ballMesh.position.set(...pitchPos(p, glove));
  if (!resolved && tc !== null && flightT >= Math.min(tc, p.T + TIMING)) {
    // The bat gets to the plate (or the ball is long gone).
    const timing = tc - p.T;
    let contact: Contact | null;
    if (userBatting()) {
      const b = M.lineups[g.batting][g.batter[g.batting]];
      contact = swingResult({ ...oval, ...M.oval }, p.end, timing, b.power, M.maxEv);
    } else {
      contact = aiPlan && aiPlan.swung ? aiPlan.contact : null;
    }
    resolved = true;
    if (contact) {
      hitBall(contact);
    } else {
      // Swing and a miss: the ball goes on to the mitt.
      missed = 'swing';
    }
  }
  if (!resolved && tc === null && flightT >= glove) {
    resolved = true;
    missed = 'take';
  }
  if (missed && flightT >= glove) {
    const was = missed;
    missed = null;
    sfx.mitt();
    const strike = was === 'swing' || inZone(M.zone, p.end[0], p.end[1]);
    if (strike && g.strikes === 2) countAB(false); // strike three (a walk isn't an at-bat)
    finishPitch(was === 'swing' ? g.pitch('strike', true) : g.pitch(strike ? 'strike' : 'ball'));
  }
}
let missed: 'swing' | 'take' | null = null;

function countAB(hit: boolean) {
  if (!M) return;
  const g = M.game, k = g.batting;
  // Called before the game moves on to the next batter.
  const st = M.stats[k][g.batter[k]];
  st.ab++;
  if (hit) st.h++;
}

function hitBall(c: Contact) {
  if (!M) return;
  const g = M.game;
  const fieldSkill = M.teams[g.fielding].fielding;
  bip = play(M.park, c, fieldSkill);
  sfx.crack(c.quality);
  if (bip.result === 'foul') {
    outcome = g.pitch('foul');
  } else {
    const k = g.batting;
    const st = M.stats[k][g.batter[k]];
    st.ab++;
    if (bip.result !== 'out') st.h++;
    outcome = g.inPlay(bip);
  }
  relay = relayFor(M.park, bip);
  fieldAnim.fill('ready');
  playLen = playLength(bip);
  setPhase('inplay');
  if (bip.result === 'hr') {
    sfx.cheer(true);
    window.setTimeout(() => sfx.fireworks(), 900);
  } else if (c.quality > 0.6) sfx.cheer(false);
  ui.hideBatter();
}

let playLen = 3;
function playLength(b: BallInPlay) {
  if (!M) return 3;
  if (b.result === 'foul') return 1.8;
  if (b.result === 'hr') return 5;
  const run = runTimes(M.park);
  const fieldT = b.fielding?.t ?? 2;
  if (b.result === 'out') return Math.min(7, Math.max(fieldT + 1.6, b.outHow === 'ground' ? run.first + 0.4 : 0));
  return Math.min(9, run.first + run.each * (b.result - 1) + 0.6);
}

/** Animate a ball in play: the ball, the fielder who gets it, the runners. */
function inPlay() {
  if (!M || !bip || !outcome) return;
  const t = pt;
  const f = bip.flight, fl = bip.fielding;
  const fs = M.fielders[fieldSide];
  const run = runTimes(M.park);
  // The ball: along its flight until the fielder has it, then thrown to whoever covers the base (or run
  // to the bag by the fielder himself).
  const pathEnd = (f.path.length - 1) / 30;
  const speed = RUN_SPEED * (M.park.kind === 'backyard' ? 0.75 : 1);
  const glove = 1.2 * M.scale;
  const bag = relay ? basePos(M.park, relay.base) : null;
  const ri = relay?.receiver ? POSITIONS.indexOf(relay.receiver) : -1;
  // The receiver waits half a metre off the bag, toward the throw.
  let cover: [number, number] | null = null, coverAt = 0, throwStart = 0, throwLen = 0;
  if (fl && bag && ri >= 0) {
    const dx = fl.at[0] - bag[0], dz = fl.at[1] - bag[1], l = Math.hypot(dx, dz) || 1;
    cover = [bag[0] + (dx / l) * 0.5, bag[1] + (dz / l) * 0.5];
    const rh = fielderHome(M.park, POSITIONS[ri]);
    coverAt = 0.3 + Math.hypot(cover[0] - rh[0], cover[1] - rh[1]) / speed;
    throwLen = Math.hypot(cover[0] - fl.at[0], cover[1] - fl.at[1]) / THROW;
    throwStart = Math.max(pathEnd + 0.45, coverAt - throwLen);
  }
  if (t <= pathEnd || !fl) {
    ballMesh.position.set(...pathAt(f, Math.min(t, pathEnd)));
  } else if (cover) {
    const u = (t - throwStart) / throwLen;
    if (u < 0) ballMesh.position.set(fl.at[0], glove, fl.at[1]);
    else {
      const k = Math.min(1, u), d = throwLen * THROW;
      ballMesh.position.set(fl.at[0] + (cover[0] - fl.at[0]) * k, glove + Math.sin(k * Math.PI) * d * 0.06, fl.at[1] + (cover[1] - fl.at[1]) * k);
    }
  }
  // The fielders: the one who gets it runs there (and on to the bag if it's his), the one covering runs
  // to the base, the rest stay put (on a home run they chase it to the wall).
  const ball = ballMesh.position;
  const moveTo = (p: Person, from: [number, number], to: [number, number], after: number) => {
    const dx = to[0] - from[0], dz = to[1] - from[1], d = Math.hypot(dx, dz);
    if (d < 0.01) return true;
    const gone = Math.min(d, Math.max(0, (t - after) * speed));
    p.root.position.x = from[0] + (dx / d) * gone;
    p.root.position.z = from[1] + (dz / d) * gone;
    if (gone < d - 0.05) p.root.rotation.y = Math.atan2(dx, dz);
    return gone >= d - 0.05;
  };
  fs.forEach((p, i) => {
    const pos = POSITIONS[i];
    if (pos === 'C') return;
    const home = fielderHome(M!.park, pos);
    let anim: FieldAnim = 'ready';
    if (fl && fl.pos === pos) {
      const there = moveTo(p, home, fl.at, 0.4);
      anim = t < fl.t ? (there ? 'catch' : 'run') : 'catch';
      if (t >= pathEnd && bag && relay && !relay.receiver) {
        // His bag: run it there and step on it.
        const done = moveTo(p, fl.at, bag, pathEnd);
        anim = done ? 'catch' : 'run';
        ball.set(p.root.position.x, glove * 0.8, p.root.position.z);
      } else if (cover && t >= throwStart) anim = 'ready';
    } else if (i === ri && cover) {
      const there = moveTo(p, home, cover, 0.3);
      anim = there ? (t >= throwStart - 0.4 ? 'catch' : 'ready') : 'run';
      if (there && t < throwStart) p.root.rotation.y = Math.atan2(fl!.at[0] - cover[0], fl!.at[1] - cover[1]);
    } else if (bip!.result === 'hr' && !isInfielderPos(pos)) {
      anim = moveTo(p, home, [ball.x * 0.97, ball.z * 0.97], 0.4) ? 'ready' : 'run';
    }
    if (pos === 'P') {
      // Off the mound, down to the ground.
      const off = Math.hypot(p.root.position.x - home[0], p.root.position.z - home[1]);
      p.root.position.y = 0.25 * (M!.park.base / 27.43) * Math.max(0, 1 - off / (2.7 * (M!.park.base / 27.43)));
    }
    fieldAnim[i] = anim;
  });
  // The runners.
  const bt = M.hitters[battingSide];
  for (const m of outcome.moves) {
    const p = m.from === 0 ? bt[0] : bt[m.from];
    if (!p) continue;
    if (m.from === 0) p.setGear({ bat: false });
    const startBase = m.from;
    const endBase = m.to === 0 ? Math.min(4, startBase + 1) : m.to;
    const legs = endBase - startBase;
    if (legs <= 0) continue;
    const t0 = m.from === 0 ? 0.25 : 0;
    const firstLeg = m.from === 0 ? run.first : run.each;
    let tt = t - t0, leg = 0, u = 0;
    if (tt < 0) continue;
    if (tt < firstLeg) {
      u = tt / firstLeg;
    } else {
      tt -= firstLeg;
      leg = 1 + Math.floor(tt / run.each);
      u = (tt % run.each) / run.each;
      if (leg >= legs) {
        leg = legs - 1;
        u = 1;
      }
    }
    const a = basePos(M.park, startBase + leg), b = basePos(M.park, startBase + leg + 1);
    p.root.position.set(a[0] + (b[0] - a[0]) * u, 0, a[1] + (b[1] - a[1]) * u);
    p.root.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]);
    p.root.visible = !(m.to === 0 && u >= 1) && !(m.to === 4 && leg === legs - 1 && u >= 1);
    (p as Person & { running?: boolean }).running = u < 1;
  }
  if (t >= playLen) {
    showOutcome(outcome);
  }
}
let fieldSide: 0 | 1 = 1;
let relay: Relay | null = null;
type FieldAnim = 'ready' | 'run' | 'catch';
/** What each fielder is doing during a ball in play (set by inPlay, drawn by draw). */
const fieldAnim: FieldAnim[] = POSITIONS.map(() => 'ready');
const isInfielderPos = (p: string) => p !== 'LF' && p !== 'CF' && p !== 'RF';
let battingSide: 0 | 1 = 0;

function finishPitch(o: PlayOutcome) {
  outcome = o;
  showOutcome(o);
}

function showOutcome(o: PlayOutcome) {
  if (!M) return;
  const forUser = battingSide === M.user;
  let cls = o.mood === 'big' ? 'wow' : o.mood === 'plain' ? '' : (o.mood === 'good') === forUser ? 'good' : 'bad';
  const word = o.text.split(/[!.]/)[0];
  if (o.mood === 'big') {
    confetti.burst(new THREE.Vector3(0, 6, 30));
    cls = 'wow';
  }
  if (o.mood === 'plain' && o.text === 'Strike') sfx.strike();
  if (o.next && o.mood !== 'big') (o.mood === 'good') === forUser ? sfx.cheer(false) : sfx.groan();
  ui.big(word.length < 22 ? word.toUpperCase() + (o.text.includes('!') ? '!' : '') : word, cls, o.next ? 1700 : 900);
  if (o.next) ui.toast(o.text, 2400);
  ui.hidePitch();
  updateBug();
  scoreboardMsg(o.text);
  afterWait = o.mood === 'big' ? 2.6 : o.next ? 1.7 : 0.9;
  setPhase('after');
}

function afterPlay() {
  if (!M || !outcome) return;
  const g = M.game;
  if (g.over) return endMatch();
  if (outcome.sideRetired) {
    const userUp = g.batting === M.user;
    ui.menu({ title: `${g.top ? 'Top' : 'Bottom'} of inning ${g.inning}`, lines: [userUp ? '🏏 Your turn to bat!' : '⚾ Your turn to pitch!'], cls: 'menu' });
    setPhase('switch');
    updateBug();
    return;
  }
  if (outcome.next) newBatter();
  setPhase('aim');
}

function endMatch() {
  if (!M) return;
  const g = M.game;
  const won = g.winner === M.user;
  ui.showHud(false);
  setCrowd(0.2);
  if (won) {
    sfx.cheer(true);
    sfx.fireworks();
    confetti.burst(new THREE.Vector3(0, 4, 8));
  } else sfx.groan();
  const score = `${M.teams[0].abbr} ${g.score[0]} – ${g.score[1]} ${M.teams[1].abbr}`;
  const lines = [score];
  const leo = M.lineups[M.user].findIndex((p) => p.name === 'Leonardo Benjamin');
  if (leo >= 0) {
    const st = M.stats[M.user][leo];
    lines.push(`Leonardo Benjamin: ${st.h} for ${st.ab}`);
  }
  if (M.mode === 'career') {
    const r = afterGame(save.career, won);
    save.career = r.save;
    persist();
    lines.push(r.text);
    if (r.save.champion && r.stageDone) {
      ui.menu({ title: '🏆 CHAMPIONS! 🏆', lines: [...lines, 'From Pine Valley High to the Finals. Leonardo Benjamin is a champion!'], buttons: [{ label: '🎉 Back to the menu', big: true, act: title }], cls: 'menu' });
      return;
    }
    ui.menu({ title: won ? '🎉 YOU WIN!' : 'Good game!', lines, buttons: [{ label: '▶ Next', big: true, act: careerScreen }, { label: 'Menu', act: title }], cls: 'menu' });
  } else {
    ui.menu({ title: won ? '🎉 YOU WIN!' : 'Good game!', lines, buttons: [{ label: '🔁 Play again', big: true, act: () => replay() }, { label: 'Menu', act: title }], cls: 'menu' });
  }
  appMode = 'title';
}
let replay = () => title();

// ---------------------------------------------------------------- drawing each frame

let clock = 0;
const camPos = new THREE.Vector3(0, 8, -12);
const camLook = new THREE.Vector3(0, 1, 18);

function draw(dt: number) {
  clock += dt;
  if (!M) {
    // Title: slowly circle an empty ballpark.
    camera.position.set(Math.sin(clock * 0.08) * 60, 22, -40 + Math.cos(clock * 0.08) * 20);
    camera.lookAt(0, 0, 40);
    return;
  }
  const g = M.game;
  battingSide = phase === 'inplay' || phase === 'after' ? battingSide : g.batting;
  fieldSide = phase === 'inplay' || phase === 'after' ? fieldSide : g.fielding;
  const fs = M.fielders[fieldSide], bt = M.hitters[battingSide];
  const sc = M.scale;
  // Pitcher.
  const pitcherP = fs[0];
  const pitchS = phase === 'windup' || phase === 'flight' || phase === 'inplay' ? Math.min(1, windT / WINDUP) : 0;
  if (phase === 'inplay' && fieldAnim[0] !== 'ready') fielderPose(pitcherP, 0);
  else pitcherP.pose({ mode: pitchS > 0 ? 'pitch' : 'stand', s: pitchS, t: clock });
  pitcherP.setGear({ ball: pitchS < RELEASE_S });
  // Catcher: glove up as the target, then out to the ball.
  const catcher = fs[1];
  const gl = new THREE.Vector3(0.05, 0.75, 0.55);
  if (pitch && (phase === 'flight' || phase === 'windup')) {
    const e = pitch.end;
    const u = phase === 'flight' ? Math.min(1, flightT / pitch.T) : 0;
    const want = new THREE.Vector3(-e[0] / sc, e[1] / sc, 0.75);
    gl.lerp(want, u);
  }
  catcher.pose({ mode: 'squat', t: clock, glove: gl });
  // Fielders.
  fs.forEach((p, i) => {
    if (i < 2) return;
    if (phase === 'inplay') fielderPose(p, i);
    else p.pose({ mode: 'ready', t: clock + i });
  });
  // Batter and runners.
  bt.forEach((p, i) => {
    const runner = p as Person & { running?: boolean };
    if (phase === 'inplay' && runner.running) {
      p.pose({ mode: 'walk', speed: 6.5, phase: clock * 11, t: clock });
    } else if (i === 0 && (phase === 'aim' || phase === 'ring' || phase === 'windup' || phase === 'flight')) {
      let s = 0;
      if (phase === 'windup') s = Math.min(0.3, (windT / (WINDUP * RELEASE_S)) * 0.3);
      if (phase === 'flight') {
        s = 0.3;
        if (swingAt !== null) s = Math.min(1, 0.3 + Math.max(0, flightT - swingAt) / 0.4 * 0.7);
      }
      p.pose({ mode: 'bat', s, t: clock });
    } else if (phase === 'after' && outcome?.mood === 'big' && i === 0) {
      p.pose({ mode: 'cheer', t: clock });
    } else {
      runner.running = false;
      p.pose({ mode: 'stand', t: clock + i });
    }
  });

  // Overlays.
  const batting = userBatting() && phase !== 'inplay' && phase !== 'after' && phase !== 'switch';
  const pitching = !userBatting() && (phase === 'aim' || phase === 'ring');
  zoneBox.visible = batting || pitching;
  pci.visible = batting;
  pci.position.set(oval.x, oval.y, 0);
  pci.scale.set(M.oval.rx, M.oval.ry, 1);
  pci.rotation.y = Math.PI;
  target.visible = pitching;
  target.position.set(aim.x, aim.y, 0);
  target.rotation.y = 0;
  timingRing.visible = phase === 'ring';
  timingRing.position.copy(target.position);
  timingRing.scale.setScalar(Math.max(0.01, ringRadius(pt)));
  const ringGood = Math.abs(ringRadius(pt) - 0.075) < 0.05;
  (timingRing.material as THREE.MeshBasicMaterial).color.set(ringGood ? '#7dffb0' : '#ffffff');
  if (phase === 'flight' && pitch && pt < 0.05) ui.showPitch(pitch.speed * MPH, pitch.type);

  // Camera.
  const k = M.park.kind === 'backyard' ? 0.85 : 1;
  const want = new THREE.Vector3(), look = new THREE.Vector3();
  if (phase === 'inplay' || (phase === 'after' && bip && outcome?.next && bip.result !== 'foul')) {
    const b = ballMesh.position;
    want.set(b.x * 0.3, 7 + b.y * 0.35 + Math.hypot(b.x, b.z) * 0.05, -12 + b.z * 0.35);
    look.set(b.x, b.y * 0.6, b.z);
    const f = 1 - Math.exp(-dt * 3);
    camPos.lerp(want, f);
    camLook.lerp(look, 1 - Math.exp(-dt * 5));
    camera.fov = 50;
  } else if (userBatting()) {
    // Above and behind the catcher, looking over his head at the zone (MLB The Show's batting view).
    camPos.set(0, 2.25 * sc, -3.7 * sc);
    camLook.set(0, 2.25 * sc - Math.tan(0.33) * (10 + 3.7 * sc), 10); // looking down 19°: the zone sits just below the middle
    camera.fov = 44;
  } else {
    // Behind and above the pitcher, so you see over him to the plate.
    camPos.set(0.8 * k, 3.0 * k, M.park.mound + 7.0 * k);
    camLook.set(0, 0.95 * k, 0);
    camera.fov = 17;
  }
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  // A hit ball is drawn bigger the further away it is, so it never shrinks to nothing.
  const hit = phase === 'inplay' && !!bip;
  const size = hit ? Math.max(1, camera.position.distanceTo(ballMesh.position) / 14) : 1;
  ballMesh.scale.setScalar(size);
  updateTrail(hit && dt > 0, size);
  camera.updateProjectionMatrix();
  sun.target.position.set(camLook.x * 0.5, 0, Math.max(5, camLook.z * 0.5));
  if (!M.park.night) sun.position.copy(sun.target.position).add(su.sunPosition.value.clone().multiplyScalar(120));
}

function fielderPose(p: Person, i: number) {
  const a = fieldAnim[i];
  if (a === 'run') p.pose({ mode: 'walk', speed: 6, phase: clock * 10 + i, t: clock });
  else if (a === 'catch') {
    // Glove out toward the ball (no further than an arm's reach).
    const local = p.root.worldToLocal(ballMesh.position.clone());
    const chest = new THREE.Vector3(0, 1.0, 0.1);
    local.sub(chest).clampLength(0, 0.6).add(chest);
    p.pose({ mode: 'reach', t: clock, glove: local });
  } else p.pose({ mode: 'ready', t: clock + i });
}

// ---------------------------------------------------------------- menus

function title() {
  appMode = 'title';
  M = null;
  disposeWorld();
  const pv = buildPark(parkOf('pro'), '#3b1f7a', 'Llama Baseball');
  world.add(pv.group);
  setLighting(false);
  ui.showHud(false);
  ui.setMode('watch');
  overlay.visible = true;
  zoneBox.visible = pci.visible = target.visible = timingRing.visible = false;
  ballMesh.visible = false;
  setCrowd(0.3);
  const c = save.career;
  const st = CAREER[c.stage];
  ui.menu({
    title: '',
    logo: true,
    cls: 'title',
    buttons: [
      { label: '⭐ Road to the Finals', sub: c.champion ? '🏆 Champion! Play it again' : `Leonardo Benjamin · ${st.title}`, act: careerScreen, color: '#c8102e' },
      { label: '🏟️ Pick Your Franchise', sub: 'Choose any team and play one game', act: franchiseScreen, color: '#14284b' },
      { label: '🏡 Backyard Baseball', sub: 'A quick game in the backyard', act: backyard, color: '#2e7d32' },
      { label: '🏠 Arcade', act: goToArcade },
    ],
  });
}

function careerScreen() {
  M = null;
  appMode = 'title';
  const c = save.career;
  if (c.champion && c.stage === CAREER.length - 1 && c.wins >= CAREER[c.stage].need) {
    save.career = { ...NEW_CAREER, champion: true };
    persist();
  }
  const s = save.career;
  const st = CAREER[s.stage];
  const me = team(st.team), opp = team(st.games[s.game]);
  const progress = st.playoff ? `Game ${s.game + 1} of ${st.games.length} · you must win!` : `Game ${s.game + 1} of ${st.games.length} · wins: ${s.wins} (need ${st.need})`;
  ui.menu({
    title: `${st.title}`,
    lines: [st.intro, progress, `${me.emoji} ${me.city} ${me.name}  vs  ${opp.emoji} ${opp.city} ${opp.name}`],
    buttons: [
      { label: '⚾ Play ball!', big: true, act: () => playCareer() },
      { label: 'Start the career over', sub: 'Back to the first high school game', act: () => {
        save.career = { ...NEW_CAREER, champion: save.career.champion };
        persist();
        careerScreen();
      } },
    ],
    back: title,
  });
}

function playCareer() {
  const s = save.career, st = CAREER[s.stage];
  const userHome = st.park !== 'pro'; // the Finals are in Providence: you're the visitors
  replay = playCareer;
  startMatch({ user: team(st.team), opp: team(st.games[s.game]), userHome, mode: 'career', withLeo: true, park: parkOf(st.park) });
}

function franchiseScreen() {
  const real = TEAMS.filter((t) => !t.kids);
  ui.menu({
    title: 'Pick your franchise',
    cards: real.map((t) => ({ team: t, tag: t.id === save.myTeam ? 'LAST' : t.id === 'lightning' ? '7× FINALS' : undefined, act: () => {
      save.myTeam = t.id;
      persist();
      pickOpponent();
    } })),
    back: title,
  });
}

function pickOpponent() {
  const me = team(save.myTeam);
  ui.menu({
    title: `${me.emoji} ${me.name} vs...`,
    cards: TEAMS.filter((t) => !t.kids && t.id !== me.id).map((t) => ({ team: t, act: () => {
      save.oppTeam = t.id;
      persist();
      const go = () => startMatch({ user: me, opp: t, userHome: true, mode: 'franchise', withLeo: me.id === 'pinevalley' || me.id === 'strikers', park: parkOf(me.park) });
      replay = go;
      go();
    } })),
    back: franchiseScreen,
  });
}

function backyard() {
  const go = () => startMatch({ user: team('backyard-a'), opp: team('backyard-b'), userHome: false, mode: 'backyard', withLeo: true, park: parkOf('backyard') });
  replay = go;
  go();
}

function pause() {
  if (appMode !== 'game') return;
  appMode = 'paused';
  ui.menu({
    title: '⏸ Paused',
    buttons: [
      { label: '▶ Keep playing', big: true, act: () => { ui.closeMenu(); appMode = 'game'; } },
      { label: 'Quit to the menu', sub: 'This game won\'t count', act: title },
      { label: '🏠 Arcade', act: goToArcade },
    ],
  });
}

const ui = new UI({ pause, update: reloadForUpdate, pitchType: choosePitch });
ui.swingBtn.addEventListener('pointerdown', () => { unlock(); action(); });
ui.throwBtn.addEventListener('pointerdown', () => { unlock(); action(); });

// ---------------------------------------------------------------- loop

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (appMode === 'game') step(dt);
  draw(appMode === 'paused' ? 0 : dt);
  confetti.update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

title();
// ?play=career|backyard|franchise jumps straight into a game (for testing).
{
  const q = new URLSearchParams(location.search).get('play');
  if (q === 'career') playCareer();
  else if (q === 'backyard') backyard();
  else if (q === 'franchise') startMatch({ user: team(save.myTeam), opp: team(save.oppTeam), userHome: true, mode: 'franchise', withLeo: true, park: parkOf(team(save.myTeam).park) });
}
requestAnimationFrame(frame);
startPwa({ onUpdate: () => (appMode === 'title' ? reloadForUpdate() : ui.showUpdate()) });

(window as unknown as { __ball: unknown }).__ball = { get M() { return M; }, get phase() { return phase; }, get pitch() { return pitch; }, get flightT() { return flightT; }, get dbg() { return { resolved, missed, swingAt, aiPlan, appMode, relay, bip, fieldAnim }; }, oval, aim, action, hitBall,
  /** Step the game by hand (the browser pane throttles frames when hidden). */
  tick(n = 1, render = true) { for (let i = 0; i < n; i++) { if (appMode === 'game') step(1 / 60); draw(1 / 60); confetti.update(1 / 60); } if (render) renderer.render(scene, camera); },
  scene, camera, renderer, save };
