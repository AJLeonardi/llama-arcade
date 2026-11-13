// Llama Soccer 3D: Mr. Random takes Team USA from last place in the World Cup to #1.
// Run with the left thumb (or WASD), draw a line with the right finger (or mouse) and the ball follows it.
import * as THREE from 'three';
import { startPwa, reloadForUpdate } from '../../../shared/pwa';
import { gameStorage } from '../../../shared/storage';
import { goToArcade } from '../../../shared/home';
import { unlock } from '../../../shared/sfx';
import { Confetti } from '../../../shared/confetti';
import { BALL_R, FIELD, Match, type Vec } from './sim/match';
import { afterMatch, buy, country, fixSave, lineupPlayers, nextOpponent, rankOf, release, strengthOf, swap, US, type Save } from './sim/teams';
import { Llama } from './view/llama';
import { buildStadium } from './view/stadium';
import { sfx } from './sfx';
import * as ui from './ui';

const store = gameStorage('llama-soccer-3d');
let save: Save = fixSave(store.load<Save>('save'));
const persist = () => store.save('save', save);

// ---- renderer, scene, camera ----
const canvas = document.getElementById('game') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
const scene = new THREE.Scene();
scene.background = new THREE.Color('#8fd0ff');
scene.fog = new THREE.Fog('#8fd0ff', 70, 160);
const camera = new THREE.PerspectiveCamera(52, 1, 0.5, 300);
scene.add(new THREE.HemisphereLight('#e8f4ff', '#3d6b35', 1.6));
const sun = new THREE.DirectionalLight('#fff4dd', 1.6);
sun.position.set(-20, 40, -10);
scene.add(sun);
buildStadium(scene);
const confetti = new Confetti(scene);

function fit() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', fit);
fit();

// ---- the ball, shadows, the line you draw, and Mr. Random's marker ----
function ballTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#111';
  for (let row = 0; row < 3; row++)
    for (let i = 0; i < 5; i++) {
      const x = i * 51.2 + (row % 2) * 25.6 + 12, y = 22 + row * 42;
      g.beginPath();
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
        g.lineTo(x + Math.cos(a) * 11, y + Math.sin(a) * 11);
      }
      g.fill();
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 20, 14), new THREE.MeshLambertMaterial({ map: ballTexture() }));
scene.add(ballMesh);

function blobTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(0,0,0,.5)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const shadows = new THREE.InstancedMesh(shadowGeo, new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false }), 11);
shadows.frustumCulled = false;
scene.add(shadows);
const tmp = new THREE.Object3D();

const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.9, depthWrite: false }));
ring.position.y = 0.03;
scene.add(ring);

function nameTag(text: string) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(13,35,64,.85)';
  g.beginPath();
  g.roundRect(8, 8, 240, 48, 24);
  g.fill();
  g.fillStyle = '#ffd23f';
  g.font = 'bold 30px Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 33);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
  s.scale.set(2.4, 0.6, 1);
  s.renderOrder = 10;
  return s;
}
const tag = nameTag('⭐ Mr. Random');
scene.add(tag);

const lineMat = new THREE.MeshBasicMaterial({ color: '#ffd23f', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
const lineMesh = new THREE.Mesh(new THREE.BufferGeometry(), lineMat);
lineMesh.renderOrder = 5;
lineMesh.frustumCulled = false;
scene.add(lineMesh);
let lineFade = 0;

/** A flat ribbon along the points, with an arrow head at the end. */
function drawRibbon(pts: Vec[]) {
  const pos: number[] = [];
  const W = 0.22, Y = 0.05;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const d = Math.hypot(bx - ax, bz - az) || 1;
    const nx = (-(bz - az) / d) * W, nz = ((bx - ax) / d) * W;
    pos.push(ax + nx, Y, az + nz, ax - nx, Y, az - nz, bx + nx, Y, bz + nz);
    pos.push(ax - nx, Y, az - nz, bx - nx, Y, bz - nz, bx + nx, Y, bz + nz);
  }
  if (pts.length >= 2) {
    const [ax, az] = pts[pts.length - 2], [bx, bz] = pts[pts.length - 1];
    const d = Math.hypot(bx - ax, bz - az) || 1;
    const ux = (bx - ax) / d, uz = (bz - az) / d;
    const A = 0.7;
    pos.push(bx + ux * A, Y, bz + uz * A, bx - uz * A, Y, bz + ux * A, bx + uz * A, Y, bz - ux * A);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  lineMesh.geometry.dispose();
  lineMesh.geometry = g;
}

// ---- matches ----
let match: Match;
let llamas: Llama[] = [];
let oppId = nextOpponent(save);
type Mode = 'title' | 'match' | 'paused' | 'over' | 'menu';
let mode: Mode = 'title';
let updateReady = false;
let shotsTaken = 0;

function setupMatch(demo: boolean) {
  for (const l of llamas) scene.remove(l.group);
  oppId = nextOpponent(save);
  const opp = country(oppId), us = country(US);
  match = new Match(lineupPlayers(save), { strength: strengthOf(save, oppId) }, Date.now() & 0xffff);
  match.autopilot = demo;
  const nums = [1, 3, 2, 8, 9];
  llamas = match.bodies.map((b) => {
    const kit = b.team === 0 ? us : opp;
    const l = new Llama(b.fur, kit.shirt, kit.trim, b.human ? 10 : nums[b.slot], b.slot === 0);
    scene.add(l.group);
    return l;
  });
  camFocus.set(0, 0, 0);
}

function startMatch() {
  unlock();
  mode = 'match';
  setupMatch(false);
  shotsTaken = 0;
  ui.showHud(oppId, { pause });
  const r = rankOf(save), or = rankOf(save, oppId);
  const title = r === 1 ? (save.champion ? 'World Cup Final!' : 'THE FINAL!') : 'World Cup match';
  ui.banner(`🇺🇸 vs ${country(oppId).flag}<small>${title} · #${r} vs #${or} ${country(oppId).name}</small>`, '', 2400);
}

function pause() {
  if (mode !== 'match') return;
  mode = 'paused';
  ui.showPause({
    resume: () => (mode = 'match'),
    quit: () => toTitle(),
    arcade: () => goToArcade(),
  });
}

function endMatch() {
  mode = 'over';
  const [us, them] = match.score;
  const r = afterMatch(save, us, them);
  persist();
  if (r.win) {
    sfx.win();
    confetti.burst(new THREE.Vector3(camFocus.x, 2, camFocus.z + 4));
  }
  setTimeout(() => {
    const h = {
      next: () => startMatch(),
      team: () => openTeam(() => showResultAgain()),
      table: () => ui.showTable(save, { back: () => showResultAgain() }),
      home: () => toTitle(),
    };
    const showResultAgain = () => ui.showResult(r, oppId, h);
    showResultAgain();
  }, 1200);
}

function toTitle() {
  if (updateReady) return reloadForUpdate(); // nothing to lose on the title screen
  mode = 'title';
  setupMatch(true);
  showTitle();
}

function showTitle() {
  ui.showTitle(
    save,
    {
      play: () => {
        sfx.tap();
        if (!save.intro) {
          unlock();
          ui.showIntro({
            ok: () => {
              save.intro = true;
              persist();
              startMatch();
            },
          });
        } else startMatch();
      },
      team: () => openTeam(showTitle),
      table: () => ui.showTable(save, { back: showTitle }),
      arcade: () => goToArcade(),
      update: () => reloadForUpdate(),
    },
    updateReady,
  );
}

function openTeam(back: () => void) {
  let selected: string | null = null;
  const show = () =>
    ui.showTeam(save, selected, {
      back: () => {
        persist();
        if (mode === 'title') setupMatch(true);
        back();
      },
      pick: (arg) => {
        sfx.tap();
        if (!arg) return;
        if (!selected || selected === arg) {
          selected = selected === arg ? null : arg;
        } else {
          const part = (s: string) => (s.startsWith('slot:') ? Number(s.slice(5)) : s.slice(6));
          const a = part(selected), b = part(arg);
          if (typeof a === 'number' || typeof b === 'number') swap(save, a, b);
          selected = null;
          persist();
        }
        show();
      },
      buy: (arg) => {
        if (buy(save, Number(arg))) {
          sfx.coin();
          persist();
        }
        show();
      },
      release: (id) => {
        if (id && release(save, id)) persist();
        show();
      },
    });
  show();
}

// ---- input ----
const keys = new Set<string>();
window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (mode === 'match' && e.code === 'Space') {
    if (match.quickShot()) shotsTaken++;
  }
  if (e.code === 'Escape' || e.code === 'KeyP') pause();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

const stickBase = document.createElement('div');
stickBase.className = 'stick-base';
const stickKnob = document.createElement('div');
stickKnob.className = 'stick-knob';
stickBase.append(stickKnob);
document.body.append(stickBase);
let stickId = -1;
const stickO = { x: 0, y: 0 };
const stick = { x: 0, y: 0 };
let drawId = -1;
let drawPts: Vec[] = [];

const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hitPoint = new THREE.Vector3();
function ground(e: PointerEvent): Vec | null {
  const ndc = new THREE.Vector2((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.ray.intersectPlane(groundPlane, hitPoint) ? [hitPoint.x, hitPoint.z] : null;
}

canvas.addEventListener('pointerdown', (e) => {
  unlock();
  if (mode !== 'match') return;
  const leftSide = e.clientX < window.innerWidth * 0.38;
  if (e.pointerType !== 'mouse' && leftSide && stickId < 0) {
    stickId = e.pointerId;
    stickO.x = e.clientX;
    stickO.y = e.clientY;
    stickBase.style.left = `${e.clientX}px`;
    stickBase.style.top = `${e.clientY}px`;
    stickKnob.style.transform = '';
    stickBase.classList.add('on');
    return;
  }
  if (drawId < 0) {
    drawId = e.pointerId;
    const p = ground(e);
    drawPts = p ? [p] : [];
    lineFade = 0;
  }
});
window.addEventListener('pointermove', (e) => {
  if (e.pointerId === stickId) {
    const R = 60;
    let dx = e.clientX - stickO.x, dy = e.clientY - stickO.y;
    const d = Math.hypot(dx, dy);
    if (d > R) {
      dx = (dx / d) * R;
      dy = (dy / d) * R;
    }
    stick.x = dx / R;
    stick.y = dy / R;
    stickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  } else if (e.pointerId === drawId) {
    const p = ground(e);
    const last = drawPts[drawPts.length - 1];
    if (p && (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.25)) drawPts.push(p);
  }
});
function pointerEnd(e: PointerEvent) {
  if (e.pointerId === stickId) {
    stickId = -1;
    stick.x = stick.y = 0;
    stickBase.classList.remove('on');
  } else if (e.pointerId === drawId) {
    drawId = -1;
    if (mode !== 'match') return;
    if (match.shoot(drawPts)) {
      shotsTaken++;
      lineFade = 1;
    } else {
      if (!match.canShoot() && drawPts.length > 3) ui.banner('Get the ball first! ⚽', 'bad', 1000);
      drawPts = [];
      drawRibbon([]);
    }
  }
}
window.addEventListener('pointerup', pointerEnd);
window.addEventListener('pointercancel', pointerEnd);

/** Where you want Mr. Random to run, in world x/z. The camera looks along +z, so screen right is world -x. */
function wantedMove(): Vec {
  let sx = stick.x, sy = stick.y;
  const k = (c: string) => (keys.has(c) ? 1 : 0);
  sx += k('ArrowRight') + k('KeyD') - k('ArrowLeft') - k('KeyA');
  sy += k('ArrowDown') + k('KeyS') - k('ArrowUp') - k('KeyW');
  return [-sx, -sy];
}

// ---- camera ----
const camFocus = new THREE.Vector3();
let orbit = 0;
function updateCamera(dt: number) {
  const ball = match.ball;
  if (mode === 'title' || mode === 'menu') {
    orbit += dt * 0.08;
    const r = 46;
    camera.position.set(Math.sin(orbit) * r, 22, Math.cos(orbit) * r);
    camera.lookAt(ball.x * 0.3, 0, ball.z * 0.3);
    return;
  }
  const h = match.human;
  const fx = ball.x * 0.7 + h.x * 0.3, fz = ball.z * 0.7 + h.z * 0.3;
  const k = Math.min(1, dt * 3);
  camFocus.x += (Math.max(-FIELD.halfW + 7, Math.min(FIELD.halfW - 7, fx)) - camFocus.x) * k;
  camFocus.z += (Math.max(-FIELD.halfL + 7, Math.min(FIELD.halfL - 4, fz)) - camFocus.z) * k;
  // Wide phone screens show lots of field sideways, so come in closer there.
  const a = camera.aspect;
  const up = a < 1.2 ? 20 : a > 1.7 ? 11.5 : 15, back = a < 1.2 ? 15 : a > 1.7 ? 10 : 12.5;
  camera.position.set(camFocus.x, up, camFocus.z - back);
  camera.lookAt(camFocus.x, 0, camFocus.z + 3);
}

// ---- events from the match ----
function handleEvents() {
  for (const ev of match.takeEvents()) {
    if (mode !== 'match') continue;
    switch (ev) {
      case 'kick':
        if (match.ball.kicker === match.human) sfx.kick();
        else sfx.pass();
        break;
      case 'goal-us': {
        sfx.goal();
        const who = match.scorer?.name || 'USA';
        ui.banner(`GOAL! ⚽<small>${who}${match.scorer?.human ? ' scores!' : ''}</small>`, 'goal', 2400);
        confetti.burst(new THREE.Vector3(0, 2.5, FIELD.halfL));
        break;
      }
      case 'goal-them':
        sfx.sad();
        ui.banner(`${country(oppId).flag} scores<small>Get it back!</small>`, 'bad', 2200);
        break;
      case 'save':
        sfx.save();
        if (match.ball.owner?.team === 1) ui.banner('SAVED! 🧤<small>Try a curvy line!</small>', 'bad', 1400);
        else ui.banner('Great save! 🧤', '', 1200);
        break;
      case 'tackle':
        sfx.tackle();
        break;
      case 'bounce':
        sfx.bounce();
        break;
      case 'whistle':
        sfx.whistle();
        break;
      case 'end':
        sfx.longWhistle();
        ui.banner('Full time!', '', 1200);
        endMatch();
        break;
    }
  }
}

function hints() {
  const b = match.ball, h = match.human;
  if (match.phase !== 'play') return ui.hint('');
  if (b.owner === h) ui.hint(shotsTaken < 3 ? '✏️ Draw a line from Mr. Random into the goal!' : '');
  else if (b.owner && b.owner.team === 1) ui.hint(shotsTaken < 3 ? '🏃 Run into them to steal the ball!' : '');
  else ui.hint('');
}

// ---- the loop ----
let last = performance.now();
const ballAxis = new THREE.Vector3();
function frame(now: number) {
  requestAnimationFrame(frame);
  tick(Math.min(0.05, (now - last) / 1000), true);
  last = now;
}

function tick(dt: number, draw: boolean) {
  const drawing = drawId >= 0 && mode === 'match' && match.canShoot();
  const slow = drawing ? 0.25 : 1;
  if (mode === 'match' || mode === 'title' || mode === 'over') {
    const [mx, mz] = mode === 'match' ? wantedMove() : [0, 0];
    const bx = match.ball.x, bz = match.ball.z;
    match.step(dt * slow, mx, mz);
    if (match.phase === 'over' && mode === 'title') setupMatch(true);
    handleEvents();
    // Roll the ball the way it moved.
    const dx = match.ball.x - bx, dz = match.ball.z - bz, dist = Math.hypot(dx, dz);
    if (dist > 1e-4) {
      ballAxis.set(dz, 0, -dx).normalize();
      ballMesh.rotateOnWorldAxis(ballAxis, dist / BALL_R);
    }
  }
  if (mode === 'match') {
    ui.updateHud(match.score, match.minute());
    hints();
  }
  if (!draw) return;

  const t = performance.now() / 1000;
  const goalTeam = match.phase === 'goal' ? (match.ball.z > 0 ? 0 : 1) : -1; // who just scored
  match.bodies.forEach((b, i) => {
    llamas[i].update(b, dt * slow, b.team === goalTeam || (match.phase === 'over' && match.score[b.team] > match.score[1 - b.team]), t);
    tmp.position.set(b.x, 0.02, b.z);
    tmp.scale.set(1.6, 1, 2.2);
    tmp.rotation.set(0, b.face, 0);
    tmp.updateMatrix();
    shadows.setMatrixAt(i, tmp.matrix);
  });
  const ball = match.ball;
  ballMesh.position.set(ball.x, ball.y, ball.z);
  tmp.position.set(ball.x, 0.015, ball.z);
  tmp.scale.setScalar(0.6);
  tmp.rotation.set(0, 0, 0);
  tmp.updateMatrix();
  shadows.setMatrixAt(10, tmp.matrix);
  shadows.instanceMatrix.needsUpdate = true;

  const h = match.human;
  const showMe = mode !== 'title';
  ring.visible = tag.visible = showMe;
  ring.position.set(h.x, 0.03, h.z);
  ring.scale.setScalar(1 + Math.sin(t * 5) * 0.06);
  tag.position.set(h.x, 2.75, h.z);

  // The line: live while drawing (from the ball), fading after the kick.
  if (drawId >= 0 && drawPts.length) {
    lineMat.opacity = 0.9;
    lineMat.color.set(match.canShoot() ? '#ffd23f' : '#ffffff');
    drawRibbon(match.canShoot() ? [[ball.x, ball.z], ...drawPts] : drawPts);
  } else if (lineFade > 0) {
    lineFade = Math.max(0, lineFade - dt * 1.4);
    lineMat.opacity = 0.9 * lineFade;
    if (lineFade === 0) drawRibbon([]);
  }

  confetti.update(dt);
  updateCamera(dt);
  renderer.render(scene, camera);
}

// ---- start ----
setupMatch(true);
showTitle();
requestAnimationFrame(frame);
startPwa({
  onUpdate: () => {
    updateReady = true;
    if (mode === 'title') reloadForUpdate();
  },
});

// For testing in the browser: step the game by hand (hidden tabs get few frames).
(window as unknown as { __soccer: unknown }).__soccer = {
  get match() {
    return match;
  },
  get mode() {
    return mode;
  },
  get save() {
    return save;
  },
  play: () => startMatch(),
  tick: (n = 1, dt = 1 / 60) => {
    for (let i = 0; i < n; i++) tick(dt, i === n - 1);
  },
  draw: (pts: Vec[]) => match.shoot(pts),
};
