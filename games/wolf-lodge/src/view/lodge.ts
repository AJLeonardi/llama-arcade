// The lodge in 3D: floors, the walls and furniture from the sim's boxes, pitched roofs, the water park's glass
// roof, and the details that make it feel real (the big tree, the fireplace, beds with pillows, the ropes
// course's ropes, the dragon, cars outside). Static things are merged per material (see build.ts); the few
// moving things (doors, fire, the dragon, the tipping bucket, runes) come back as `LodgeView` handles.
import * as THREE from 'three';
import {
  ADV, boxes, DESK, doors, floorAt, HALL, LOBBY, PARK, pools, ROOMS, ROPES_HIGH, ROPES_Y, RUNES, type Box, type Mat,
} from '../sim/world';
import { Batch } from './build';
import { pool, steel } from './slidesView';
import * as T from './textures';

function std(s: T.Surface, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ map: s.map, normalMap: s.normal, roughness: s.rough ?? 0.8, ...extra });
}

export function materials() {
  const water = new THREE.MeshPhysicalMaterial({
    color: '#3fb4d0', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.72, normalMap: T.waterNormal(),
    normalScale: new THREE.Vector2(0.35, 0.35), clearcoat: 1, depthWrite: false,
  });
  return {
    log: std(T.logs()),
    plaster: std(T.plaster()),
    stone: std(T.stone()),
    wood: std(T.planks(true), { roughness: 0.4 }),
    desk: std(T.planks(true), { roughness: 0.25 }),
    bedFrame: std(T.planks(true), { color: '#8a5a3c', roughness: 0.35 }), // darker than the floors, so beds don't blend in
    plank: std(T.planks()),
    beam: std(T.logs(), { color: '#d8c0a0' }),
    ceiling: std(T.ceilingBoards()),
    roof: std(T.tiles('roof', 0.35, [[64, 70, 58], [58, 62, 52], [72, 76, 62]], [40, 42, 36]), { roughness: 0.85 }),
    glass: new THREE.MeshPhysicalMaterial({ color: '#d8eef6', roughness: 0.03, metalness: 0, transparent: true, opacity: 0.18, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide }),
    floorLobby: std(T.planks(), { roughness: 0.35 }),
    floorDark: std(T.planks(true), { roughness: 0.4 }),
    carpet: std(T.carpet()),
    carpetBeige: std(T.carpet([168, 146, 116], [140, 120, 94])),
    carpetGreen: std(T.carpet([46, 74, 52], [120, 40, 34])),
    deck: std(T.deckTile()),
    poolTile: std(T.poolTile()),
    coping: std(T.tiles('coping', 0.6, [[214, 206, 190], [206, 198, 182]], [170, 160, 146])),
    bath: std(T.bathTile()),
    grass: std(T.grass()),
    asphalt: std(T.asphalt()),
    concrete: std(T.tiles('conc', 1.5, [[176, 172, 164], [170, 166, 158]], [130, 126, 120])),
    duvet: std(T.fabric('duvet', [238, 236, 230])),
    plaid: std(T.fabric('plaid', [150, 40, 36], 'plaid')),
    leather: new THREE.MeshStandardMaterial({ color: '#6b3e22', roughness: 0.45 }),
    sofaFabric: std(T.fabric('sofa', [120, 96, 70])),
    pillow: std(T.fabric('pillow', [248, 248, 244])),
    curtain: std(T.fabric('curtain', [96, 116, 74])),
    bark: std(T.logs(), { color: '#9a8070' }),
    leaves: new THREE.MeshStandardMaterial({ color: '#3d6b35', roughness: 0.9, flatShading: true }),
    pine: new THREE.MeshStandardMaterial({ color: '#2a4f2c', roughness: 0.95, flatShading: true }),
    black: new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.3 }),
    screen: new THREE.MeshStandardMaterial({ color: '#0c1a2a', emissive: '#3a78b8', emissiveIntensity: 0.5, roughness: 0.2 }),
    lampShade: new THREE.MeshStandardMaterial({ color: '#f3e3c0', emissive: '#ffcf80', emissiveIntensity: 0.8, roughness: 0.8 }),
    bulb: new THREE.MeshStandardMaterial({ color: '#fff3d6', emissive: '#ffd890', emissiveIntensity: 2.5 }),
    whitePlastic: new THREE.MeshStandardMaterial({ color: '#f1f1ee', roughness: 0.4 }),
    rope: new THREE.MeshStandardMaterial({ color: '#c9a86a', roughness: 0.95 }),
    redPaint: new THREE.MeshStandardMaterial({ color: '#b8332a', roughness: 0.5 }),
    door: std(T.planks(true), { color: '#c8a888', roughness: 0.35 }),
    brass: new THREE.MeshStandardMaterial({ color: '#c8a050', roughness: 0.25, metalness: 1 }),
    water,
  };
}
export type Mats = ReturnType<typeof materials>;

export interface LodgeView {
  group: THREE.Group;
  doorMeshes: { id: number; pivot: THREE.Object3D; open: number; kind: 'swing' | 'slide' }[];
  runes: THREE.Mesh[];
  dragon: Dragon;
  animate(dt: number, t: number): void;
}

/** Draw a floor of `mat` over a rectangle at y = 0, leaving holes where pools are: strips of dry 0.25 m cells. */
function floor(b: Batch, mat: THREE.Material, x0: number, x1: number, z0: number, z1: number) {
  const C = 0.25;
  const pos: number[] = [];
  const quad = (a: number, c: number, e: number, f: number) => pos.push(a, 0, c, a, 0, f, e, 0, c, e, 0, c, a, 0, f, e, 0, f);
  for (let z = z0; z < z1 - 1e-6; z += C) {
    let run: number | null = null;
    for (let x = x0; x <= x1 + 1e-6; x += C) {
      const dry = x < x1 - 1e-6 && floorAt(x + C / 2, z + C / 2) >= 0;
      if (dry && run === null) run = x;
      if (!dry && run !== null) {
        quad(run, z, x, Math.min(z1, z + C));
        run = null;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  b.add(mat, g, undefined, 'world');
}

/** A pitched roof over a rectangle: ridge along x (or z), eaves overhanging. */
function roof(b: Batch, mat: THREE.Material, x0: number, x1: number, z0: number, z1: number, y: number, rise: number, alongX: boolean) {
  const o = 0.8;
  const [a0, a1, c0, c1] = alongX ? [x0 - o, x1 + o, z0 - o, z1 + o] : [z0 - o, z1 + o, x0 - o, x1 + o];
  const mid = (c0 + c1) / 2;
  const P = (a: number, c: number, h: number) => (alongX ? [a, h, c] : [c, h, a]);
  const pts = [P(a0, c0, y), P(a1, c0, y), P(a1, mid, y + rise), P(a0, mid, y + rise), P(a0, c1, y), P(a1, c1, y)];
  const quads = [[0, 1, 2, 3], [5, 4, 3, 2]];
  const pos: number[] = [];
  for (const q of quads) for (const i of [q[0], q[1], q[2], q[0], q[2], q[3]]) pos.push(...pts[i]);
  // gables
  for (const [i, j, k] of [[0, 3, 4], [1, 5, 2]]) pos.push(...pts[i], ...pts[j], ...pts[k]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  b.add(mat, g, undefined, 'world');
  const back = g.clone();
  const arr = back.attributes.position.array as Float32Array;
  for (let i = 0; i < arr.length; i += 9) for (let k = 0; k < 3; k++) [arr[i + 3 + k], arr[i + 6 + k]] = [arr[i + 6 + k], arr[i + 3 + k]];
  back.computeVertexNormals();
  b.add(mat, back, undefined, 'world');
}

export function buildLodge(m: Mats): LodgeView {
  const group = new THREE.Group();
  const b = new Batch();

  // ---------------------------------------------------------------- floors
  floor(b, m.floorLobby, LOBBY.x0, LOBBY.x1, LOBBY.z0, LOBBY.z1);
  floor(b, m.carpet, HALL.x0, HALL.x1, HALL.z0, HALL.z1);
  floor(b, m.carpetBeige, ROOMS[0].x0, ROOMS[0].x1, ROOMS[0].z0, ROOMS[0].z1);
  floor(b, m.carpetGreen, ROOMS[1].x0, ROOMS[1].x1, ROOMS[1].z0, ROOMS[1].z1);
  floor(b, m.floorDark, ROOMS[2].x0, ROOMS[2].x1, ROOMS[2].z0, ROOMS[2].z1);
  floor(b, m.floorDark, ADV.x0, ADV.x1, ADV.z0, ADV.z1);
  floor(b, m.deck, PARK.x0, PARK.x1, PARK.z0, PARK.z1);
  // Outside: the car park in front, grass all round.
  b.box(m.asphalt, -60, -0.03, 48, 60, -0.01, 110);
  b.box(m.concrete, -24, -0.02, 40, 24, 0, 48);
  const grassRects: [number, number, number, number][] = [
    [-300, 300, 110, 300], [-300, -60, 42, 110], [60, 300, 42, 110], [-300, -66, -300, 42], [66, 300, -300, 42],
    [-66, 66, -300, -86], [46, 66, -86, 22], [20, 46, 10, 22], [-66, -46, -86, 10], [24, 60, 42, 48], [-60, -24, 40, 48], [20, 24, 40, 42],
  ];
  for (const [x0, x1, z0, z1] of grassRects) b.box(m.grass, x0, -0.04, z0, x1, -0.02, z1);
  // Parking bay lines.
  const paint = new THREE.MeshStandardMaterial({ color: '#e8e4d8', roughness: 0.7 });
  for (let x = -54; x <= 54; x += 2.8) {
    if (Math.abs(x) < 5) continue;
    b.box(paint, x - 0.06, -0.01, 62, x + 0.06, 0, 67);
    b.box(paint, x - 0.06, -0.01, 75, x + 0.06, 0, 80);
  }

  // ---------------------------------------------------------------- the sim's boxes
  const byMat: Partial<Record<Mat, THREE.Material>> = {
    log: m.log, plaster: m.plaster, stone: m.stone, wood: m.wood, desk: m.desk, glass: m.glass, ceiling: m.ceiling,
    plank: m.plank, beam: m.beam, tile: m.deck, concrete: m.concrete, panel: m.wood, steel,
  };
  for (const x of boxes) {
    if (x.mat === 'bed') bed(b, m, x);
    else if (x.mat === 'sofa') sofa(b, m, x);
    else if (x.mat === 'counter') counter(b, m, x);
    else {
      const mat = byMat[x.mat];
      if (mat) b.box(mat, x.x0, x.y0, x.z0, x.x1, x.y1, x.z1);
    }
  }

  // ---------------------------------------------------------------- roofs
  roof(b, m.roof, LOBBY.x0, LOBBY.x1, LOBBY.z0, LOBBY.z1, LOBBY.h + 0.4, 7, true);
  roof(b, m.roof, ADV.x0, ADV.x1, ADV.z0, ADV.z1, ADV.h + 0.4, 5, true);
  roof(b, m.roof, HALL.x0, HALL.x1, HALL.z0, 42, HALL.h + 0.3, 3.5, true);
  // The water park: a glass roof on steel trusses (the sun comes through).
  for (let x = PARK.x0; x <= PARK.x1 + 0.1; x += 8) {
    b.box(steel, x - 0.15, PARK.h - 1.4, PARK.z0, x + 0.15, PARK.h, PARK.z1);
    for (let z = PARK.z0; z < PARK.z1; z += 3) b.box(steel, x - 0.05, PARK.h - 1.4, z, x + 0.05, PARK.h - 1.3, z + 3); // web
  }
  for (let z = PARK.z0; z <= PARK.z1; z += 12) b.box(steel, PARK.x0, PARK.h - 0.3, z - 0.1, PARK.x1, PARK.h, z + 0.1);
  b.box(m.glass, PARK.x0, PARK.h, PARK.z0, PARK.x1, PARK.h + 0.05, PARK.z1);
  b.box(m.log, PARK.x0 - 0.3, PARK.h, PARK.z0 - 0.3, PARK.x1 + 0.3, PARK.h + 0.8, PARK.z0 + 0.1);
  // Big log beams across the lobby ceiling.
  for (let z = LOBBY.z0 + 4; z < LOBBY.z1; z += 6) {
    const beam = new THREE.CylinderGeometry(0.28, 0.3, LOBBY.x1 - LOBBY.x0, 12).rotateZ(Math.PI / 2);
    b.put(m.bark, beam, 0, LOBBY.h - 0.5, z);
  }
  for (let x = ADV.x0 + 6; x < ADV.x1; x += 8) {
    const beam = new THREE.CylinderGeometry(0.25, 0.27, ADV.z1 - ADV.z0, 12).rotateX(Math.PI / 2);
    b.put(m.bark, beam, x, ADV.h - 0.5, (ADV.z0 + ADV.z1) / 2);
  }
  // Log columns at the lobby corners and by the entrance.
  for (const [x, z] of [[-19.4, 10.6], [19.4, 10.6], [-19.4, 39.4], [19.4, 39.4], [-4, 39.4], [4, 39.4]]) {
    b.put(m.bark, new THREE.CylinderGeometry(0.4, 0.45, LOBBY.h, 14), x, LOBBY.h / 2, z);
  }

  // ---------------------------------------------------------------- the lobby
  bigTree(b, m);
  // Rugs.
  b.box(m.plaid, 11, 0, 28.5, 17.6, 0.012, 37.5);
  b.box(m.carpet, -6, 0, 13, 6, 0.012, 20);
  // Front desk: monitors, a bell, a sign.
  for (const z of [15, 18.5]) {
    b.box(m.black, DESK.x0 - 0.35, 1.16, z - 0.3, DESK.x0 - 0.3, 1.56, z + 0.3);
    b.box(m.screen, DESK.x0 - 0.36, 1.2, z - 0.27, DESK.x0 - 0.35, 1.53, z + 0.27);
  }
  b.put(m.brass, new THREE.SphereGeometry(0.06, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), DESK.x1 - 0.2, 1.16, 17);
  // Cubbies for keys behind the desk.
  for (let z = 13.2; z < 21; z += 0.5) b.box(m.desk, -19.32, 1.4, z, -19.25, 3.6, z + 0.04);
  for (let y = 1.4; y < 3.7; y += 0.45) b.box(m.desk, -19.32, y, 13, -19.25, y + 0.04, 21);
  // Fireplace: the hearth opening, logs; the fire itself is animated below.
  b.box(m.black, 18.25, 0.5, 32.6, 18.45, 2.4, 35.4);
  for (let i = 0; i < 3; i++) b.put(m.bark, new THREE.CylinderGeometry(0.1, 0.1, 1.4, 8).rotateX(Math.PI / 2), 17.9 - i * 0.05, 0.62 + (i === 2 ? 0.16 : 0), 33.4 + i * 0.6 - (i === 2 ? 0.9 : 0));
  b.box(m.wood, 17.6, 3.2, 31, 18.4, 3.4, 37); // mantel
  // Chandeliers (antler-style rings with bulbs).
  for (const [x, z] of [[-8, 25], [8, 20], [0, 16]]) chandelier(b, m, x, LOBBY.h - 3, z);
  // Armchairs by the window.
  for (const z of [32, 35]) armchair(b, m, -17, z, Math.PI / 2);
  // Hallway lights and art.
  for (let x = 24; x < 66; x += 6) b.box(m.bulb, x - 0.2, HALL.h - 0.05, 24.8, x + 0.2, HALL.h, 25.2);
  // Signs.
  signBoard(group, ['FRONT DESK'], -17.6, 4.6, 17, Math.PI / 2, 3.6, 0.8);
  signBoard(group, ['~ WATER PARK ~'], 0, 5, 10.3, 0, 5, 1);
  signBoard(group, ['GUEST ROOMS →'], 19.75, 4, 25, -Math.PI / 2, 3.4, 0.7);
  signBoard(group, ['← ADVENTURE WING'], -19.75, 5, 25, Math.PI / 2, 4, 0.8);
  signBoard(group, ['WAND QUEST'], -27, 3.8, 39.45, Math.PI, 3.6, 0.8, '#3b1d5a');
  signBoard(group, ['HOWLING HEIGHTS', 'ropes course'], -34, 6, 10.3, 0, 4.4, 1.3, '#2d4a22');

  // ---------------------------------------------------------------- rooms
  for (const r of ROOMS) roomDecor(b, group, m, r.tier);

  // ---------------------------------------------------------------- the adventure wing
  ropesDecor(b, m);
  // Wands on the shop wall.
  for (let i = 0; i < 10; i++) {
    const w = new THREE.CylinderGeometry(0.012, 0.016, 0.38, 6).rotateZ(Math.PI / 2 - 0.15);
    b.put(i % 2 ? m.desk : m.wood, w, -30 + 0.6 + i * 0.7, 1.8 + (i % 3) * 0.3, 39.15);
  }

  // ---------------------------------------------------------------- the water park
  // The hot tub in the luxury suite is a pool too.
  for (const p of pools) if (p.name === 'hot tub') pool(b, p.x0, p.x1, p.z0, p.z1, p.depth, m.bath, m.water, m.wood);
  parkDecor(b, m);

  // ---------------------------------------------------------------- outside
  outside(b, group, m);

  b.flush(group);

  // ---------------------------------------------------------------- moving things
  const doorMeshes: LodgeView['doorMeshes'] = [];
  for (const d of doors) {
    if (d.tier === 0) {
      // The water park gate: two glass panels that slide apart.
      for (const s of [-1, 1]) {
        const pivot = new THREE.Group();
        pivot.position.set(d.x + (s * d.width) / 4, 0, d.z);
        const panel = new THREE.Mesh(new THREE.BoxGeometry(d.width / 2, 2.4, 0.06), m.glass);
        panel.position.y = 1.2;
        const frame = new THREE.Mesh(new THREE.BoxGeometry(d.width / 2, 0.1, 0.1), steel);
        frame.position.y = 2.4;
        pivot.add(panel, frame);
        pivot.userData.side = s;
        group.add(pivot);
        doorMeshes.push({ id: d.id, pivot, open: 0, kind: 'slide' });
      }
      continue;
    }
    const pivot = new THREE.Group();
    const w = d.width;
    pivot.position.set(d.x - w / 2, 0, d.z);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(w, d.h, 0.05), m.door);
    leaf.position.set(w / 2, d.h / 2, 0);
    leaf.castShadow = true;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), m.brass);
    knob.position.set(w - 0.12, 1.0, 0.05);
    const knob2 = knob.clone();
    knob2.position.z = -0.05;
    // The card reader: green light for your room.
    const reader = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.03), new THREE.MeshStandardMaterial({ color: '#222', emissive: d.tier > 0 ? '#2a2' : '#a22', emissiveIntensity: 0.6 }));
    reader.position.set(w - 0.12, 1.2, d.z > 25 ? -0.04 : 0.04);
    pivot.add(leaf, knob, knob2, reader);
    group.add(pivot);
    doorMeshes.push({ id: d.id, pivot, open: 0, kind: 'swing' });
  }
  // The front doors: automatic sliding glass.
  const front: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(3, 4.1, 0.06), m.glass);
    panel.position.set(s * 1.5, 2.05, LOBBY.z1);
    panel.userData.side = s;
    group.add(panel);
    front.push(panel);
  }

  // Fire: flickering flames in the lobby fireplace and the luxury suite's.
  const fires: THREE.Mesh[] = [];
  const flameMat = new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const addFire = (x: number, y: number, z: number, n: number, spread: number) => {
    for (let i = 0; i < n; i++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.6, 8), flameMat);
      f.position.set(x, y + 0.3, z + (i - (n - 1) / 2) * spread);
      f.userData.base = f.position.y;
      f.userData.k = i * 1.7;
      group.add(f);
      fires.push(f);
    }
  };
  addFire(17.9, 0.6, 34, 5, 0.35);
  addFire(65.1, 0.35, 34, 4, 0.3);
  const fireLight = new THREE.PointLight('#ff9a40', 18, 14, 1.6);
  fireLight.position.set(16.8, 1.2, 34);
  group.add(fireLight);

  // Runes: floating crystals. Purple until found, then gold.
  const runeGeo = new THREE.OctahedronGeometry(0.16, 0);
  runeGeo.scale(1, 1.6, 1);
  const runes = RUNES.map((r) => {
    const mesh = new THREE.Mesh(runeGeo, new THREE.MeshStandardMaterial({ color: '#8a5cff', emissive: '#7a3cff', emissiveIntensity: 1.2, roughness: 0.2, metalness: 0.3 }));
    mesh.position.set(r.x, r.y, r.z);
    group.add(mesh);
    return mesh;
  });

  const dragon = buildDragon(m);
  group.add(dragon.root);

  // The tipping bucket on the kids' fort, hanging over the edge of its roof so it dumps onto the splash pad.
  const bucket = new THREE.Group();
  bucket.position.set(BUCKET.x, BUCKET.y, FORT.z);
  const bucketMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.75, 1.3, 16, 1, true), new THREE.MeshStandardMaterial({ color: '#d84a2c', roughness: 0.4, side: THREE.DoubleSide }));
  bucketMesh.position.y = 0.4;
  bucket.add(bucketMesh);
  group.add(bucket);
  const water = new BlockWater(group);
  let bucketT = 0;

  return {
    group,
    doorMeshes,
    runes,
    dragon,
    animate(dt, t) {
      (m.water.normalMap as THREE.Texture).offset.set(t * 0.02, t * 0.013);
      for (const f of fires) {
        const k = f.userData.k as number;
        const s = 0.75 + 0.35 * Math.sin(t * 9 + k) * Math.sin(t * 5.3 + k * 2);
        f.scale.set(1, s, 1);
        f.position.y = (f.userData.base as number) + (s - 1) * 0.3;
      }
      fireLight.intensity = 14 + Math.sin(t * 11) * 3 + Math.sin(t * 7.3) * 2;
      for (const r of runes) {
        r.rotation.y += dt * 1.2;
        r.position.y += Math.sin(t * 2 + r.position.x) * 0.002;
      }
      // The bucket fills for 40 s, tips, and dumps: water comes out as blocks that smash into bits.
      bucketT = (bucketT + dt) % 45;
      const tip = bucketT > 40 ? Math.sin(((bucketT - 40) / 5) * Math.PI) : 0;
      bucket.rotation.z = -tip * 2.0;
      if (tip > 0.55) water.pour(dt, -bucket.rotation.z, (tip - 0.55) / 0.45);
      water.step(dt);
      dragon.animate(dt, t);
      // Front doors open when someone's near (set by the game).
      for (const p of front) {
        const s = p.userData.side as number;
        p.position.x += (s * (1.5 + frontOpen * 2.6) - p.position.x) * Math.min(1, dt * 4);
      }
    },
  };
}

/** How open the automatic front doors are (0..1), set by the game. */
let frontOpen = 0;
export const setFrontDoors = (v: number) => (frontOpen = v);

// ---------------------------------------------------------------- furniture

function bed(b: Batch, m: Mats, x: Box) {
  const w = x.x1 - x.x0, d = x.z1 - x.z0, top = x.y1;
  const alongZ = d >= w;
  // Frame and mattress. The mattress sits right on the frame, so there's no gap to see the floor through.
  const frameTop = x.y0 + Math.max(0.08, Math.min(0.28, top - x.y0 - 0.3));
  b.box(m.bedFrame, x.x0, x.y0, x.z0, x.x1, frameTop, x.z1);
  b.box(m.pillow, x.x0 + 0.03, frameTop, x.z0 + 0.03, x.x1 - 0.03, top - 0.06, x.z1 - 0.03);
  // Duvet (plaid in the lodge's style) over most of it, folded at the top.
  const head = alongZ ? (Math.cos(x.face ?? 0) < 0 ? 'z1' : 'z0') : 'x0';
  if (alongZ) {
    const hz = head === 'z1' ? x.z1 : x.z0, dir = head === 'z1' ? -1 : 1;
    const end = hz + dir * 0.55;
    b.box(m.plaid, x.x0 - 0.02, top - 0.1, Math.min(end, hz + dir * d), x.x1 + 0.02, top, Math.max(end, hz + dir * d));
    for (const px of [x.x0 + w * 0.27, x.x1 - w * 0.27]) {
      const p = new THREE.SphereGeometry(0.3, 12, 8);
      p.scale(w > 1.6 ? 1.15 : 1.4, 0.32, 0.6);
      b.put(m.pillow, p, px, top + 0.05, hz + dir * 0.3);
    }
    // Headboard.
    b.box(m.bedFrame, x.x0 - 0.05, x.y0, hz - (dir > 0 ? 0.08 : 0), x.x1 + 0.05, top + 0.7, hz + (dir > 0 ? 0 : 0.08));
  } else {
    b.box(m.plaid, x.x0 + 0.55, top - 0.1, x.z0 - 0.02, x.x1, top, x.z1 + 0.02);
    const p = new THREE.SphereGeometry(0.3, 12, 8);
    p.scale(0.6, 0.32, 1.2);
    b.put(m.pillow, p, x.x0 + 0.3, top + 0.05, (x.z0 + x.z1) / 2);
  }
  // Bunk posts (any bed whose top is high, or the bed under it).
  if (x.y0 > 1) {
    for (const [px, pz] of [[x.x0, x.z0], [x.x1, x.z0], [x.x0, x.z1], [x.x1, x.z1]]) b.box(m.bedFrame, px - 0.05, 0, pz - 0.05, px + 0.05, top + 0.4, pz + 0.05);
    for (let y = 0.5; y < x.y0; y += 0.3) b.box(m.wood, x.x1 - 0.5, y, x.z0 - 0.06, x.x1 - 0.1, y + 0.04, x.z0 - 0.02); // ladder rungs
  }
}

function sofa(b: Batch, m: Mats, x: Box, fabric: THREE.Material = m.sofaFabric) {
  const face = x.face ?? 0;
  const fx = Math.round(Math.sin(face)), fz = Math.round(Math.cos(face));
  b.box(fabric, x.x0, 0.08, x.z0, x.x1, x.y1 - 0.05, x.z1);
  b.box(fabric, x.x0 + 0.02, x.y1 - 0.05, x.z0 + 0.02, x.x1 - 0.02, x.y1, x.z1 - 0.02);
  // The back is on the side opposite the way it faces.
  const t = 0.22;
  if (fx > 0) b.box(fabric, x.x0, 0.08, x.z0, x.x0 + t, 0.9, x.z1);
  else if (fx < 0) b.box(fabric, x.x1 - t, 0.08, x.z0, x.x1, 0.9, x.z1);
  else if (fz > 0) b.box(fabric, x.x0, 0.08, x.z0, x.x1, 0.9, x.z0 + t);
  else b.box(fabric, x.x0, 0.08, x.z1 - t, x.x1, 0.9, x.z1);
  // Arms.
  if (fx === 0) {
    b.box(fabric, x.x0 - 0.15, 0.08, x.z0, x.x0, 0.65, x.z1);
    b.box(fabric, x.x1, 0.08, x.z0, x.x1 + 0.15, 0.65, x.z1);
  } else {
    b.box(fabric, x.x0, 0.08, x.z0 - 0.15, x.x1, 0.65, x.z0);
    b.box(fabric, x.x0, 0.08, x.z1, x.x1, 0.65, x.z1 + 0.15);
  }
  for (const [px, pz] of [[x.x0, x.z0], [x.x1, x.z0], [x.x0, x.z1], [x.x1, x.z1]]) b.box(m.wood, px - 0.04, 0, pz - 0.04, px + 0.04, 0.08, pz + 0.04);
}

function armchair(b: Batch, m: Mats, x: number, z: number, face: number) {
  sofa(b, m, { x0: x - 0.4, x1: x + 0.4, y0: 0, y1: 0.45, z0: z - 0.4, z1: z + 0.4, mat: 'sofa', face }, m.leather);
}

function counter(b: Batch, m: Mats, x: Box) {
  // A log-faced counter with a stone base.
  b.box(m.stone, x.x0, 0, x.z0, x.x1, 0.25, x.z1);
  b.box(m.log, x.x0 + 0.03, 0.25, x.z0 + 0.03, x.x1 - 0.03, x.y1, x.z1 - 0.03);
}

function chandelier(b: Batch, m: Mats, x: number, y: number, z: number) {
  const ring = new THREE.TorusGeometry(1.1, 0.07, 6, 24).rotateX(Math.PI / 2);
  b.put(m.bark, ring, x, y, z);
  b.box(m.black, x - 0.02, y, z - 0.02, x + 0.02, y + 3, z + 0.02);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    b.put(m.lampShade, new THREE.CylinderGeometry(0.09, 0.14, 0.22, 10), x + Math.cos(a) * 1.1, y + 0.18, z + Math.sin(a) * 1.1);
    // antler tines
    const tine = new THREE.ConeGeometry(0.04, 0.5, 5);
    tine.rotateZ(0.6);
    b.put(m.beam, tine, x + Math.cos(a) * 0.8, y - 0.15, z + Math.sin(a) * 0.8, -a);
  }
}

function bigTree(b: Batch, m: Mats) {
  // The lobby's big tree, right through the middle of the room.
  b.put(m.bark, new THREE.CylinderGeometry(0.75, 1.3, 10, 16), 0, 5, 29);
  const r = T.rng(9);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + r() * 0.4, y = 5 + r() * 3.5;
    const len = 2.5 + r() * 2;
    const branch = new THREE.CylinderGeometry(0.12, 0.3, len, 8);
    branch.translate(0, len / 2, 0);
    branch.rotateZ(-1.0 - r() * 0.3);
    b.put(m.bark, branch, 0, y, 29, a);
    const ex = Math.cos(a) * len * 0.85, ez = -Math.sin(a) * len * 0.85;
    for (let k = 0; k < 3; k++) {
      const blob = new THREE.IcosahedronGeometry(1.1 + r() * 0.6, 1);
      b.put(m.leaves, blob, ex + (r() - 0.5) * 1.5, y + len * 0.5 + r() * 1.2, 29 + ez + (r() - 0.5) * 1.5);
    }
  }
  for (let k = 0; k < 6; k++) b.put(m.leaves, new THREE.IcosahedronGeometry(1.6, 1), (r() - 0.5) * 3, 10 + r(), 29 + (r() - 0.5) * 3);
  // Roots spreading over the floor, and a stone ring.
  for (let i = 0; i < 6; i++) {
    const root = new THREE.CylinderGeometry(0.08, 0.3, 1.8, 6).rotateZ(Math.PI / 2 - 0.25);
    root.translate(0.9, 0.18, 0);
    b.put(m.bark, root, 0, 0, 29, (i / 6) * Math.PI * 2);
  }
  b.put(m.stone, new THREE.TorusGeometry(2.6, 0.25, 6, 24).rotateX(Math.PI / 2), 0, 0.2, 29);
}

function roomDecor(b: Batch, group: THREE.Group, m: Mats, tier: 1 | 2 | 3) {
  const r = ROOMS[tier - 1];
  // Ceiling, curtains by the window, a ceiling light, room number on the door.
  b.box(m.plaster, r.x0, 3.0, r.z0, r.x1, 3.05, r.z1);
  b.box(m.bulb, (r.x0 + r.x1) / 2 - 0.3, 2.98, (r.z0 + r.z1) / 2 - 0.3, (r.x0 + r.x1) / 2 + 0.3, 3.0, (r.z0 + r.z1) / 2 + 0.3);
  signBoard(group, [`${100 + tier * 10 + 2}`], r.doorX, 2.55, 27.79, Math.PI, 0.5, 0.25, '#3b2414');
  const lamp = (x: number, z: number) => {
    b.box(m.wood, x - 0.25, 0, z - 0.25, x + 0.25, 0.55, z + 0.25);
    b.put(m.brass, new THREE.CylinderGeometry(0.03, 0.08, 0.35, 8), x, 0.72, z);
    b.put(m.lampShade, new THREE.CylinderGeometry(0.12, 0.18, 0.22, 12, 1, true), x, 1.0, z);
  };
  const tv = (x: number, y: number, z: number, w: number, yaw: number) => {
    const g = new THREE.BoxGeometry(w, w * 0.58, 0.05);
    b.put(m.black, g, x, y, z, yaw);
    const s = new THREE.PlaneGeometry(w * 0.94, w * 0.52);
    s.translate(0, 0, 0.03);
    b.put(m.screen, s, x, y, z, yaw);
  };
  if (tier === 1) {
    lamp(22.95, 34.6);
    tv(29.1, 1.1, 34.2, 0.8, -Math.PI / 2);
    b.box(m.curtain, 22.4, 0.3, 36.6, 23, 2.7, 36.75);
    b.box(m.curtain, 27, 0.3, 36.6, 27.6, 2.7, 36.75);
    // A small desk and chair.
    b.box(m.wood, 20.3, 0.72, 29, 21.2, 0.76, 31);
    b.box(m.wood, 20.3, 0, 29, 20.4, 0.72, 29.1);
    b.box(m.wood, 20.3, 0, 30.9, 20.4, 0.72, 31);
    armchair(b, m, 21.8, 30, -Math.PI / 2);
  } else if (tier === 2) {
    lamp(31, 35.2);
    lamp(34.4, 38.2);
    tv(33.5, 1.4, 28.24, 1.2, 0);
    b.box(m.curtain, 32.6, 0.3, 38.6, 33.1, 2.7, 38.75);
    b.box(m.curtain, 38, 0.3, 38.6, 38.5, 2.7, 38.75);
    // The den: rock arch and a WOLF DEN sign.
    signBoard(group, ['WOLF DEN'], 39, 2.35, 33.15, Math.PI, 1.2, 0.3, '#2a1a0e');
    b.put(m.stone, new THREE.IcosahedronGeometry(0.6, 1), 37.3, 2.6, 33.4);
    b.put(m.stone, new THREE.IcosahedronGeometry(0.5, 1), 40.6, 2.65, 33.4);
  } else {
    // Luxury: a king bed with lamps both sides, a big TV, a chandelier, a fireplace, a hot tub, art.
    lamp(55.4, 41.2);
    lamp(59.6, 41.2);
    tv(48.25, 1.6, 28.24, 2.2, 0);
    chandelier(b, m, 53.5, 2.3, 35);
    b.box(m.wood, 64.6, 3, 31.6, 65.8, 3.08, 36.4);
    b.box(m.black, 64.75, 0.3, 33, 64.8, 1.5, 35);
    for (const x of [43.6, 51.8, 54.6, 62.8]) b.box(m.curtain, x, 0.2, 41.6, x + 0.6, 2.9, 41.75);
    signBoard(group, ['KIDCABIN'], 44.8, 2.45, 37.45, Math.PI, 1.3, 0.3, '#2a1a0e');
    // A dining table and a mini fridge.
    b.box(m.desk, 50, 0.74, 38.5, 52, 0.78, 40);
    for (const [x, z] of [[50.1, 38.6], [51.9, 38.6], [50.1, 39.9], [51.9, 39.9]]) b.box(m.desk, x - 0.04, 0, z - 0.04, x + 0.04, 0.74, z + 0.04);
    b.box(m.whitePlastic, 63.6, 0, 40.6, 64.4, 0.85, 41.6);
  }
}

function ropeLine(b: Batch, m: Mats, a: THREE.Vector3, c: THREE.Vector3, r = 0.025) {
  const len = a.distanceTo(c);
  const g = new THREE.CylinderGeometry(r, r, len, 5);
  const mid = a.clone().add(c).multiplyScalar(0.5);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), c.clone().sub(a).normalize());
  b.add(m.rope, g, new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)));
}

function ropesDecor(b: Batch, m: Mats) {
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  // Poles under every platform (the sim has a solid box there too), and corner posts with a rope rail.
  for (const x of boxes) {
    if (!x.plat) continue;
    const cx = (x.x0 + x.x1) / 2, cz = (x.z0 + x.z1) / 2;
    b.put(m.bark, new THREE.CylinderGeometry(0.2, 0.24, x.y1 + 3.5, 12), cx, (x.y1 + 3.5) / 2, cz);
    for (const [px, pz] of [[x.x0, x.z0], [x.x1, x.z0], [x.x0, x.z1], [x.x1, x.z1]]) b.box(m.wood, px - 0.05, x.y1, pz - 0.05, px + 0.05, x.y1 + 1.1, pz + 0.05);
  }
  // Overhead safety beam with harness cables.
  b.box(steel, -54, ADV.h - 1.2, 12, -36, ADV.h - 1, 12.3);
  b.box(steel, -54, ADV.h - 1.2, 38, -36, ADV.h - 1, 38.3);
  for (const x of [-52, -42.5, -38.5]) b.box(steel, x - 0.1, ADV.h - 1.2, 12, x + 0.1, ADV.h - 1, 38.3);
  const Y = ROPES_Y, H = ROPES_HIGH;
  // Plank bridge: side ropes and hangers.
  for (const s of [-1, 1]) {
    ropeLine(b, m, V(-38.5 + s * 0.6, Y + 1.0, 16), V(-38.5 + s * 0.6, Y + 1.0, 24.5));
    for (let z = 16.4; z < 24.4; z += 1.2) ropeLine(b, m, V(-38.5 + s * 0.55, Y, z), V(-38.5 + s * 0.6, Y + 1.0, z), 0.012);
  }
  // Balance beam: a hand rope.
  ropeLine(b, m, V(-40, Y + 1.6, 26.4), V(-50, Y + 1.6, 26.4));
  // Stepping logs: each hangs from ropes.
  for (let i = 0; i < 6; i++) {
    const z = 28.45 + i;
    ropeLine(b, m, V(-51.5, Y, z), V(-51.5, ADV.h - 1.1, z), 0.015);
  }
  // Climbing net up to the high level.
  for (let k = 0; k <= 6; k++) {
    const z = 35.2 + (k / 6) * 1.6;
    ropeLine(b, m, V(-50, Y, z), V(-44, H, z), 0.02);
  }
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    ropeLine(b, m, V(-50 + t * 6, Y + t * 4, 35.2), V(-50 + t * 6, Y + t * 4, 36.8), 0.02);
  }
  // High beam: two hand ropes.
  for (const s of [-1, 1]) ropeLine(b, m, V(-42.5 + s * 0.5, H + 1.5, 21.5), V(-42.5 + s * 0.5, H + 1.5, 34.5));
  // The zip line's end pole and a landing mat.
  b.put(m.bark, new THREE.CylinderGeometry(0.2, 0.24, 4, 10), -64.2, 2, 18.6);
  b.box(m.redPaint, -64, 0, 16.6, -58, 0.15, 20.6);
}

// ---------------------------------------------------------------- the water park's furniture

export const FORT = { x: -18, z: -8 };
/** The tipping bucket's pivot: over the fort roof's east edge. */
const BUCKET = { x: FORT.x + 3.0, y: 7.6 };

/**
 * The bucket's water, made of blocks like everything in a game should be: big blocks pour out of the lip and
 * fall; when one hits the ground (or the fort's top deck) it smashes into little blocks that fly apart,
 * bounce once and shrink away.
 */
class BlockWater {
  private readonly big: THREE.InstancedMesh;
  private readonly bits: THREE.InstancedMesh;
  private readonly blocks: { p: THREE.Vector3; v: THREE.Vector3; s: number; spin: THREE.Vector3; r: THREE.Euler }[] = [];
  private readonly pieces: { p: THREE.Vector3; v: THREE.Vector3; s: number; age: number; life: number; bounced: boolean; spin: THREE.Vector3; r: THREE.Euler }[] = [];
  private carry = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly sc = new THREE.Vector3();
  static readonly MAX_BIG = 260;
  static readonly MAX_BITS = 1600;

  constructor(parent: THREE.Object3D) {
    const mat = new THREE.MeshStandardMaterial({ color: '#6fd0f2', roughness: 0.08, metalness: 0, transparent: true, opacity: 0.78, emissive: '#1a6f96', emissiveIntensity: 0.25 });
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.big = new THREE.InstancedMesh(geo, mat, BlockWater.MAX_BIG);
    this.bits = new THREE.InstancedMesh(geo, mat, BlockWater.MAX_BITS);
    for (const im of [this.big, this.bits]) {
      im.count = 0;
      im.frustumCulled = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      parent.add(im);
    }
  }

  /** Where blocks land: the fort's top deck, or the floor. */
  private floor(x: number, z: number) {
    return Math.abs(x - FORT.x) < 3 && Math.abs(z - FORT.z) < 3 ? 4.8 : 0;
  }

  /** Pour for `dt` seconds with the bucket tipped `angle` (radians); `flow` 0..1. */
  pour(dt: number, angle: number, flow: number) {
    this.carry += dt * 90 * flow;
    // The middle of the bucket's rim, and the way out of it.
    const ox = Math.sin(angle), oy = Math.cos(angle);
    while (this.carry >= 1 && this.blocks.length < BlockWater.MAX_BIG) {
      this.carry--;
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * 0.75;
      const p = new THREE.Vector3(BUCKET.x + ox * 1.05 + Math.cos(a) * rr * Math.abs(oy), BUCKET.y + oy * 1.05 + Math.cos(a) * rr * ox * 0.3, FORT.z + Math.sin(a) * rr);
      const sp = 1.6 + Math.random() * 1.6;
      const v = new THREE.Vector3(ox * sp + (Math.random() - 0.5) * 0.6, oy * sp, (Math.random() - 0.5) * 0.9);
      const spin = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(8);
      this.blocks.push({ p, v, s: 0.22 + Math.random() * 0.2, spin, r: new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3) });
    }
    this.carry = Math.min(this.carry, 1);
  }

  step(dt: number) {
    const G = 9.8;
    for (let i = this.blocks.length - 1; i >= 0; i--) {
      const b = this.blocks[i];
      b.v.y -= G * dt;
      b.p.addScaledVector(b.v, dt);
      b.r.x += b.spin.x * dt; b.r.y += b.spin.y * dt; b.r.z += b.spin.z * dt;
      const f = this.floor(b.p.x, b.p.z);
      if (b.p.y - b.s / 2 > f) continue;
      // Splash! The block breaks into little blocks.
      this.blocks.splice(i, 1);
      const n = 6 + Math.floor(Math.random() * 4);
      for (let k = 0; k < n && this.pieces.length < BlockWater.MAX_BITS; k++) {
        const a = Math.random() * Math.PI * 2, out = 0.8 + Math.random() * 2.4;
        this.pieces.push({
          p: new THREE.Vector3(b.p.x + Math.cos(a) * b.s * 0.3, f + 0.05, b.p.z + Math.sin(a) * b.s * 0.3),
          v: new THREE.Vector3(Math.cos(a) * out + b.v.x * 0.25, 1 + Math.random() * 2.6, Math.sin(a) * out + b.v.z * 0.25),
          s: b.s * (0.28 + Math.random() * 0.22), age: 0, life: 0.7 + Math.random() * 0.6, bounced: false,
          spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(14),
          r: new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3),
        });
      }
    }
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const c = this.pieces[i];
      c.age += dt;
      if (c.age > c.life) {
        this.pieces.splice(i, 1);
        continue;
      }
      c.v.y -= G * dt;
      c.p.addScaledVector(c.v, dt);
      c.r.x += c.spin.x * dt; c.r.y += c.spin.y * dt; c.r.z += c.spin.z * dt;
      const f = this.floor(c.p.x, c.p.z);
      if (c.p.y - c.s / 2 < f && c.v.y < 0) {
        c.p.y = f + c.s / 2;
        if (c.bounced) c.v.set(c.v.x * 0.5, 0, c.v.z * 0.5);
        else c.v.set(c.v.x * 0.6, -c.v.y * 0.3, c.v.z * 0.6);
        c.bounced = true;
      }
    }
    this.write(this.big, this.blocks.map((b) => [b.p, b.r, b.s] as const));
    this.write(this.bits, this.pieces.map((c) => [c.p, c.r, c.s * Math.min(1, (c.life - c.age) / 0.35)] as const));
  }

  private write(im: THREE.InstancedMesh, list: (readonly [THREE.Vector3, THREE.Euler, number])[]) {
    list.forEach(([p, r, s], i) => {
      this.q.setFromEuler(r);
      this.m.compose(p, this.q, this.sc.set(s, s, s));
      im.setMatrixAt(i, this.m);
    });
    im.count = list.length;
    im.instanceMatrix.needsUpdate = true;
  }
}

function parkDecor(b: Batch, m: Mats) {
  // The kids' fort under the tipping bucket: log posts, platforms, a little slide.
  const F = FORT;
  for (const [dx, dz] of [[-3, -3], [3, -3], [3, 3], [-3, 3]]) b.put(m.bark, new THREE.CylinderGeometry(0.2, 0.22, 7.4, 10), F.x + dx, 3.7, F.z + dz);
  b.box(m.plank, F.x - 3, 2.2, F.z - 3, F.x + 3, 2.4, F.z + 3);
  b.box(m.plank, F.x - 3, 4.6, F.z - 3, F.x + 3, 4.8, F.z + 3);
  b.box(m.roof, F.x - 3.4, 7.2, F.z - 3.4, F.x + 3.4, 7.35, F.z + 3.4);
  for (let y = 0.3; y < 4.6; y += 0.3) b.box(m.wood, F.x + 3.05, y, F.z - 0.5, F.x + 3.15, y + 0.05, F.z + 0.5);
  b.box(m.redPaint, F.x + 3.4, 0, F.z - 1.6, F.x + 6.6, 0.02, F.z + 1.6); // the splash pad under the bucket
  // Lounge chairs in rows.
  const chair = (x: number, z: number, yaw: number) => {
    const g = new THREE.BoxGeometry(0.65, 0.08, 1.9);
    g.translate(0, 0.35, 0);
    b.put(m.whitePlastic, g, x, 0, z, yaw);
    const back = new THREE.BoxGeometry(0.65, 0.08, 0.8);
    back.rotateX(-0.9);
    back.translate(0, 0.62, -0.95);
    b.put(m.whitePlastic, back, x, 0, z, yaw);
    for (const [lx, lz] of [[-0.28, -0.85], [0.28, -0.85], [-0.28, 0.85], [0.28, 0.85]]) {
      const leg = new THREE.BoxGeometry(0.05, 0.35, 0.05);
      leg.translate(lx, 0.17, lz);
      b.put(m.whitePlastic, leg, x, 0, z, yaw);
    }
    // a striped towel
    const towel = new THREE.BoxGeometry(0.55, 0.02, 1.2);
    towel.translate(0, 0.4, 0.2);
    b.put(m.plaid, towel, x, 0, z, yaw);
  };
  for (let x = 10; x < 42; x += 1.4) chair(x, 6.5, Math.PI);
  for (let z = -6; z > -70; z -= 1.4) if (z < -14 || z > -6.5) chair(44.6, z, -Math.PI / 2);
  for (let x = -12; x < 6; x += 1.4) chair(x, -84, 0);
  // Lifeguard chairs.
  const guard = (x: number, z: number, yaw: number) => {
    for (const [dx, dz] of [[-0.4, -0.4], [0.4, -0.4], [0.4, 0.4], [-0.4, 0.4]]) b.box(m.whitePlastic, x + dx - 0.04, 0, z + dz - 0.04, x + dx + 0.04, 1.8, z + dz + 0.04);
    const seat = new THREE.BoxGeometry(0.9, 0.08, 0.9);
    b.put(m.redPaint, seat, x, 1.8, z, yaw);
    const back = new THREE.BoxGeometry(0.9, 0.7, 0.06);
    back.translate(0, 2.2, -0.42);
    b.put(m.redPaint, back, x, 0, z, yaw);
  };
  guard(13, -42, Math.PI / 2);
  guard(44, -20, -Math.PI / 2);
  guard(-4, -10, Math.PI);
  // Planters with fake pines and boulders, to look like the north woods.
  const r = T.rng(77);
  for (const [x, z] of [[-44, 4], [-44, -84], [44, -84], [12, -80], [-10, 6], [10, 4], [-26, -84], [-44, -30]]) {
    b.box(m.stone, x - 1.2, 0, z - 1.2, x + 1.2, 0.6, z + 1.2);
    pine(b, m, x, 0.6, z, 4 + r() * 2);
    b.put(m.stone, new THREE.IcosahedronGeometry(0.7 + r() * 0.5, 1), x + 1.4, 0.3, z + 0.8);
  }
}

function pine(b: Batch, m: Mats, x: number, y: number, z: number, h: number) {
  b.put(m.bark, new THREE.CylinderGeometry(h * 0.03, h * 0.05, h * 0.4, 7), x, y + h * 0.2, z);
  for (let i = 0; i < 4; i++) {
    const f = i / 4;
    const cone = new THREE.ConeGeometry(h * (0.32 - f * 0.18), h * 0.42, 9);
    b.put(m.pine, cone, x, y + h * (0.35 + f * 0.19), z, i * 0.7);
  }
}

function outside(b: Batch, group: THREE.Group, m: Mats) {
  // The porte-cochère over the front doors: log posts on stone bases, a roof.
  for (const [x, z] of [[-7, 47], [7, 47], [-7, 41.5], [7, 41.5]]) {
    b.box(m.stone, x - 0.6, 0, z - 0.6, x + 0.6, 1.2, z + 0.6);
    b.put(m.bark, new THREE.CylinderGeometry(0.3, 0.32, 4.2, 12), x, 3.3, z);
  }
  roof(b, m.roof, -8, 8, 40, 48, 5.4, 2.2, false);
  // The big sign.
  b.box(m.stone, 11, 0, 46.4, 19, 1.4, 47.6);
  signBoard(group, ['LLAMA WOLF LODGE', 'indoor water park resort'], 15, 2.4, 47.62, 0, 7.6, 2);
  for (const x of [11.4, 18.6]) b.put(m.bark, new THREE.CylinderGeometry(0.18, 0.2, 2.4, 10), x, 2.2, 47);
  // Pine trees round the edges.
  const r = T.rng(5);
  for (let i = 0; i < 70; i++) {
    let x = (r() - 0.5) * 260, z = (r() - 0.5) * 260;
    // keep off the building and the car park
    if (x > -75 && x < 75 && z > -95 && z < 115) {
      if (r() < 0.5) continue;
      x = x < 0 ? -75 - r() * 30 : 75 + r() * 30;
    }
    pine(b, m, x, 0, z, 9 + r() * 8);
  }
  for (const [x, z] of [[-14, 44], [22, 44], [-22, 44], [28, 46]]) pine(b, m, x, 0, z, 6);
  // Parked cars (simple, but the right size and shape).
  const cols = ['#9a1d1d', '#e8e8e8', '#1c3f78', '#2d2d2d', '#7b8a8f', '#5a6b3a'];
  let k = 0;
  for (let x = -52.6; x <= 52.6; x += 2.8) {
    if (Math.abs(x) < 6 || r() < 0.4) continue;
    const z = r() < 0.5 ? 64.5 : 77.5;
    car(b, new THREE.MeshPhysicalMaterial({ color: cols[k++ % cols.length], roughness: 0.25, metalness: 0.6, clearcoat: 1 }), m, x + 1.4, z, r() < 0.5 ? 0 : Math.PI);
  }
  // Lamp posts.
  for (let x = -40; x <= 40; x += 20) {
    b.box(m.black, x - 0.08, 0, 71 - 0.08, x + 0.08, 6, 71 + 0.08);
    b.box(m.bulb, x - 0.35, 5.9, 71 - 0.2, x + 0.35, 6, 71 + 0.2);
  }
}

function car(b: Batch, paint: THREE.Material, m: Mats, x: number, z: number, yaw: number) {
  const body = new THREE.BoxGeometry(1.8, 0.7, 4.4);
  body.translate(0, 0.65, 0);
  b.put(paint, body, x, 0, z, yaw);
  const cab = new THREE.BoxGeometry(1.6, 0.6, 2.2);
  cab.translate(0, 1.3, -0.2);
  b.put(paint, cab, x, 0, z, yaw);
  const glass = new THREE.BoxGeometry(1.62, 0.5, 2.0);
  glass.translate(0, 1.32, -0.2);
  b.put(m.black, glass, x, 0, z, yaw);
  for (const [wx, wz] of [[-0.8, 1.4], [0.8, 1.4], [-0.8, -1.4], [0.8, -1.4]]) {
    const w = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 14).rotateZ(Math.PI / 2);
    w.translate(wx, 0.34, wz);
    b.put(m.black, w, x, 0, z, yaw);
  }
}

/** A carved wooden sign with text. */
export function signBoard(group: THREE.Group, lines: string[], x: number, y: number, z: number, yaw: number, w: number, h: number, bg = '#3b2414') {
  const mat = new THREE.MeshStandardMaterial({ map: T.signTexture(lines, { w: 1024, h: Math.round((1024 * h) / w), bg }), roughness: 0.6 });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  mesh.position.set(x, y, z);
  mesh.rotation.y = yaw;
  group.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------- the dragon

export interface Dragon {
  root: THREE.Group;
  awake: boolean;
  wake(): void;
  animate(dt: number, t: number): void;
}

function buildDragon(m: Mats): Dragon {
  const root = new THREE.Group();
  root.position.set(-60.5, 1.6, 29);
  root.rotation.y = Math.PI / 2; // facing into the room (+x)
  const scales = new THREE.MeshPhysicalMaterial({ color: '#2f7a46', roughness: 0.45, clearcoat: 0.6 });
  const belly = new THREE.MeshStandardMaterial({ color: '#d9b45a', roughness: 0.6 });
  const horn = new THREE.MeshStandardMaterial({ color: '#efe6cc', roughness: 0.5 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: '#ffd23a', emissive: '#ff9a00', emissiveIntensity: 0.1 });
  const wingMat = new THREE.MeshPhysicalMaterial({ color: '#5a2a7a', roughness: 0.6, side: THREE.DoubleSide, sheen: 1 });
  const add = (parent: THREE.Object3D, g: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  // Body, belly, legs, tail.
  const body = add(root, new THREE.SphereGeometry(1.2, 20, 14), scales, 0, 1.3, 0);
  body.scale.set(1, 0.85, 1.5);
  const bel = add(root, new THREE.SphereGeometry(1.0, 16, 12), belly, 0, 1.05, 0.35);
  bel.scale.set(0.85, 0.7, 1.3);
  for (const [x, z] of [[-0.8, 0.9], [0.8, 0.9], [-0.8, -0.9], [0.8, -0.9]]) {
    add(root, new THREE.CylinderGeometry(0.28, 0.34, 1.0, 10), scales, x, 0.5, z);
    for (let c = -1; c <= 1; c++) add(root, new THREE.ConeGeometry(0.06, 0.2, 6).rotateX(Math.PI / 2), horn, x + c * 0.14, 0.05, z + 0.35);
  }
  const tail = new THREE.Group();
  tail.position.set(0, 1.1, -1.6);
  root.add(tail);
  let seg: THREE.Object3D = tail;
  const tailSegs: THREE.Object3D[] = [];
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Group();
    s.position.z = i === 0 ? 0 : -0.55;
    seg.add(s);
    add(s, new THREE.SphereGeometry(0.42 - i * 0.06, 12, 10), scales, 0, 0, -0.25).scale.set(1, 0.9, 1.4);
    tailSegs.push(s);
    seg = s;
  }
  add(seg, new THREE.ConeGeometry(0.25, 0.6, 4).rotateX(-Math.PI / 2), horn, 0, 0, -0.7);
  // Neck and head.
  const neck = new THREE.Group();
  neck.position.set(0, 1.8, 1.4);
  root.add(neck);
  add(neck, new THREE.CylinderGeometry(0.4, 0.55, 1.6, 12).rotateX(0.6), scales, 0, 0.55, 0.35);
  const head = new THREE.Group();
  head.position.set(0, 1.35, 0.85);
  neck.add(head);
  const skull = add(head, new THREE.SphereGeometry(0.55, 16, 12), scales, 0, 0, 0);
  skull.scale.set(1, 0.85, 1.1);
  const snout = add(head, new THREE.SphereGeometry(0.42, 14, 10), scales, 0, -0.12, 0.55);
  snout.scale.set(0.9, 0.7, 1.2);
  const jaw = add(head, new THREE.SphereGeometry(0.36, 12, 8), belly, 0, -0.3, 0.45);
  jaw.scale.set(0.85, 0.4, 1.2);
  const eyes: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    eyes.push(add(head, new THREE.SphereGeometry(0.11, 10, 8), eyeMat, s * 0.3, 0.15, 0.4));
    add(head, new THREE.SphereGeometry(0.05, 8, 6), m.black, s * 0.32, 0.15, 0.49);
    add(head, new THREE.ConeGeometry(0.1, 0.6, 8).rotateX(-0.9), horn, s * 0.28, 0.45, -0.2);
    add(head, new THREE.SphereGeometry(0.04, 6, 5), m.black, s * 0.14, -0.05, 0.98); // nostrils
  }
  // Wings.
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.lineTo(2.6, 1.6);
  wingShape.lineTo(2.2, 0.4);
  wingShape.lineTo(2.8, -0.2);
  wingShape.lineTo(1.8, -0.3);
  wingShape.lineTo(1.9, -0.9);
  wingShape.lineTo(0.9, -0.5);
  wingShape.lineTo(0, -0.6);
  const wings: THREE.Object3D[] = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(s * 0.7, 2.1, 0.2);
    root.add(w);
    const g = new THREE.ShapeGeometry(wingShape);
    if (s < 0) g.scale(-1, 1, 1);
    const mesh = add(w, g, wingMat, 0, 0, 0);
    mesh.rotation.x = -Math.PI / 2 + 0.3;
    wings.push(w);
  }
  let wake = 0;
  const d: Dragon = {
    root,
    awake: false,
    wake() {
      d.awake = true;
      wake = 0;
    },
    animate(dt, t) {
      const breathe = Math.sin(t * 1.3) * 0.03;
      body.scale.y = 0.85 + breathe;
      tailSegs.forEach((s, i) => (s.rotation.y = Math.sin(t * 1.1 - i * 0.6) * 0.15));
      if (d.awake) {
        wake = Math.min(1, wake + dt * 0.8);
        eyeMat.emissiveIntensity = 0.1 + wake * 3;
        neck.rotation.x = -wake * 0.35 + Math.sin(t * 2) * 0.05 * wake;
        head.rotation.x = wake * 0.25;
        jaw.position.y = -0.3 - Math.max(0, Math.sin(t * 3)) * 0.12 * wake;
        wings.forEach((w, i) => (w.rotation.z = (i ? -1 : 1) * (0.3 + Math.sin(t * 4) * 0.5 * wake)));
      } else {
        neck.rotation.x = 0.35 + Math.sin(t * 0.6) * 0.03; // asleep, head down
        head.rotation.x = 0.4;
        eyeMat.emissiveIntensity = 0.05;
        wings.forEach((w, i) => (w.rotation.z = (i ? -1 : 1) * 0.15));
      }
    },
  };
  return d;
}
