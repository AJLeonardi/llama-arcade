// Skateland's rides and props (the skateable parts are ordinary pieces in sim/world.ts): the entrance gate,
// the carousel (turning, horses going up and down), the Ferris wheel (turning, gondolas hanging level) and
// the food stands. Each returns a group; the moving ones also give back a function that animates them.
import * as THREE from 'three';
import { canvasTexture } from '../../../../shared/textures';
import { textTexture } from './textures';

export type Animate = (dt: number, t: number) => void;

const M = (color: number | string, rough = 0.6, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
const shadow = <T extends THREE.Object3D>(o: T) => {
  o.traverse((c) => (c.castShadow = true));
  return o;
};

/** Stripes going round (for the carousel's roof and the stands' awnings). */
const stripes = (a: string, b: string, n: number) =>
  canvasTexture(128, (g, s) => {
    for (let i = 0; i < n; i++) {
      g.fillStyle = i % 2 ? b : a;
      g.fillRect((i * s) / n, 0, s / n + 1, s);
    }
  });

/** A sign: a board with big letters, facing -x (toward the side street) when `face` is -1. */
function sign(text: string, w: number, bg: string, fg: string) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshStandardMaterial({ map: textTexture(text, bg, fg), roughness: 0.5, side: THREE.DoubleSide }));
  return m;
}

/** The entrance: two striped towers and an arched sign over the way in, facing the side street. */
export function gate(text: string) {
  const g = new THREE.Group();
  const red = M(0xd8342c, 0.45), white = M(0xf4f1ea, 0.5), gold = M(0xe2b13c, 0.35, 0.6);
  for (const z of [-9, 9]) {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 9, 16), new THREE.MeshStandardMaterial({ map: stripes('#d8342c', '#f4f1ea', 8), roughness: 0.5 }));
    tower.position.set(0, 4.5, z);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.4, 2.4, 16), red);
    cap.position.set(0, 10.2, z);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), gold);
    ball.position.set(0, 11.6, z);
    g.add(tower, cap, ball);
  }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(9, 0.35, 10, 40, Math.PI), white);
  arch.rotation.y = Math.PI / 2;
  arch.position.y = 7.5;
  const board = sign(text, 14, '#d8342c', '#ffe066');
  board.rotation.y = -Math.PI / 2;
  board.position.set(-0.2, 12.5, 0);
  g.add(arch, board);
  return shadow(g);
}

/** The carousel: a turning canopy and three rings of horses going up and down on golden poles. */
export function carousel(): [THREE.Group, Animate] {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  g.add(spin);
  const gold = M(0xe2b13c, 0.3, 0.8);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 4.4, 20), new THREE.MeshStandardMaterial({ map: stripes('#f2d04b', '#c43b3b', 10), roughness: 0.4 }));
  column.position.y = 2.6;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(8.2, 2.6, 32, 1, true), new THREE.MeshStandardMaterial({ map: stripes('#c43b3b', '#f6f1e6', 16), roughness: 0.5, side: THREE.DoubleSide }));
  roof.position.y = 6.1;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(8.2, 8.2, 0.6, 32, 1, true), new THREE.MeshStandardMaterial({ map: stripes('#f2d04b', '#c43b3b', 32), roughness: 0.4, side: THREE.DoubleSide }));
  rim.position.y = 4.6;
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 8), gold);
  top.position.y = 7.6;
  spin.add(column, roof, rim, top);
  const colors = [0xf6f1e6, 0x8b5a3c, 0x2f2f33, 0xe8c9a0];
  const horses: { o: THREE.Group; phase: number }[] = [];
  for (const [r, n] of [[2.4, 6], [3.6, 9], [4.6, 12]] as const) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 4.2, 8), gold);
      pole.position.set(Math.cos(a) * r, 2.5, Math.sin(a) * r);
      const horse = horseShape(M(colors[(i + n) % colors.length], 0.45));
      horse.position.set(Math.cos(a) * r, 1.5, Math.sin(a) * r);
      horse.rotation.y = -a; // facing the way round
      spin.add(pole, horse);
      horses.push({ o: horse, phase: a * 2 + r });
    }
  }
  return [
    shadow(g),
    (dt, t) => {
      spin.rotation.y += dt * 0.5;
      for (const h of horses) h.o.position.y = 1.5 + Math.sin(t * 2 + h.phase) * 0.35;
    },
  ];
}

/** A carousel horse, simple shapes: body, neck, head, legs, a saddle. Faces +z... turned so it rides round. */
function horseShape(mat: THREE.Material) {
  const h = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.6, 6, 10).rotateX(Math.PI / 2), mat);
  const neck = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.35, 4, 8), mat);
  neck.position.set(0, 0.3, 0.42);
  neck.rotation.x = 0.6;
  const head = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.28, 4, 8).rotateX(Math.PI / 2), mat);
  head.position.set(0, 0.52, 0.62);
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.32), M(0xc43b3b, 0.5));
  saddle.position.set(0, 0.22, -0.02);
  h.add(body, neck, head, saddle);
  for (const [x, z] of [[-0.12, 0.3], [0.12, 0.3], [-0.12, -0.3], [0.12, -0.3]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.5, 6), mat);
    leg.position.set(x, -0.35, z);
    leg.rotation.x = z > 0 ? -0.5 : 0.5; // galloping
    h.add(leg);
  }
  // Turn so it faces along the circle (the group's rotation does the rest).
  const holder = new THREE.Group();
  h.rotation.y = Math.PI / 2;
  holder.add(h);
  return holder;
}

/** The Ferris wheel: a turning double rim on two A-frame legs, its gondolas hanging level. */
export function ferris(): [THREE.Group, Animate] {
  const R = 19, hub = 22, gap = 3;
  const g = new THREE.Group();
  const steel = M(0xf2f2f2, 0.4, 0.5), dark = M(0x5c6470, 0.5, 0.6);
  // Legs: an A-frame on each side, from the ground to the hub.
  for (const x of [-gap / 2 - 0.6, gap / 2 + 0.6]) {
    for (const z of [-11, 11]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 1, 10), dark);
      const a = new THREE.Vector3(x, 0, z), b = new THREE.Vector3(x, hub, 0);
      leg.position.copy(a).add(b).multiplyScalar(0.5);
      leg.scale.y = a.distanceTo(b);
      leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      g.add(leg);
    }
  }
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, gap + 2, 16).rotateZ(Math.PI / 2), dark);
  axle.position.y = hub;
  g.add(axle);
  const wheel = new THREE.Group();
  wheel.position.y = hub;
  g.add(wheel);
  const N = 16;
  for (const x of [-gap / 2, gap / 2]) {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.22, 8, 64).rotateY(Math.PI / 2), steel);
    rim.position.x = x;
    const inner = new THREE.Mesh(new THREE.TorusGeometry(R * 0.55, 0.15, 6, 48).rotateY(Math.PI / 2), steel);
    inner.position.x = x;
    wheel.add(rim, inner);
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, R, 6), steel);
      spoke.position.set(x, (Math.sin(a) * R) / 2, (Math.cos(a) * R) / 2);
      spoke.rotation.x = Math.PI / 2 - a;
      wheel.add(spoke);
    }
  }
  const colors = [0xd8342c, 0x2f7de1, 0xf2c230, 0x3aa65a, 0x9b59d0, 0xf07d2b];
  const gondolas: THREE.Group[] = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const pivot = new THREE.Group();
    pivot.position.set(0, Math.sin(a) * R, Math.cos(a) * R);
    const car = new THREE.Group();
    const cab = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.9, 1.6, 12), M(colors[i % colors.length], 0.4));
    cab.position.y = -1.6;
    const lid = new THREE.Mesh(new THREE.ConeGeometry(1.2, 0.6, 12), M(0xf4f1ea, 0.5));
    lid.position.y = -0.5;
    const hanger = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 6), dark);
    hanger.position.y = -0.1;
    car.add(cab, lid, hanger);
    pivot.add(car);
    wheel.add(pivot);
    gondolas.push(car);
  }
  return [
    shadow(g),
    (dt) => {
      wheel.rotation.x += dt * 0.12;
      for (const c of gondolas) c.rotation.x = -wheel.rotation.x; // stay level
    },
  ];
}

/** A food stand: a painted booth with a striped awning and its name on top, its counter facing -x. */
export function kiosk(text: string, hue: number) {
  const g = new THREE.Group();
  const colors = [0xf2c230, 0x5fb3e8, 0xe85d5d, 0xf6e27a];
  const booth = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 5), M(colors[hue % colors.length], 0.55));
  booth.position.set(2, 1.5, 0);
  const window_ = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.2, 3.6), M(0x2a2f36, 0.2));
  window_.position.set(-0.01, 1.7, 0);
  const awning = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 5.4), new THREE.MeshStandardMaterial({ map: stripes('#ffffff', '#d8342c', 10), roughness: 0.6 }));
  awning.position.set(-0.6, 2.75, 0);
  awning.rotation.z = -0.35;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.2, 5.3), M(0xf4f1ea, 0.6));
  roof.position.set(2, 3.1, 0);
  const board = sign(text, 4.6, '#ffffff', '#c43b3b');
  board.rotation.y = -Math.PI / 2;
  board.position.set(1, 3.9, 0);
  g.add(booth, window_, awning, roof, board);
  return shadow(g);
}
