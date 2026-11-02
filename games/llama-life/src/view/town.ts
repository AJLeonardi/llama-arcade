// Draws the whole town from sim/world.ts: ground, roads with lines, sidewalks, houses with pitched roofs, the
// buildings you can go into (walls, floors, ceilings, furniture, signs), city towers, trees, lamps, parked cars.
// Everything is merged into one mesh per material per 240 m tile, so the far tiles are culled and the shadow
// pass only draws what's near.
import * as THREE from 'three';
import { Geo } from './geo';
import {
  houses, lamps, paved, parked, POOL, props, roads, towers, trees, venues, wallBoxes,
  type Box, type Furn, type House, type Side, type Venue,
} from '../sim/world';
import { rng } from '../sim/world';
import { asphalt, concrete, facade, FACADE_H, FACADE_W, field, grass, houseWall, plywood, roofTex, shingles, textTexture, tileFloor, water } from './textures';
import { barkMaterial, leafMaterials, treeGeometry } from './trees';
import { carMats, carParts } from './carModel';

type V3 = [number, number, number];
const TILE = 240;

type MatKey =
  | 'grass' | 'field' | 'asphalt' | 'paint' | 'concrete' | 'houseWall' | 'roof' | 'trim' | 'roofFlat' | 'wood' | 'tile'
  | 'glass' | 'bark' | 'leaves' | 'pole' | 'glow' | 'decal' | 'water' | 'poolTile' | 'ceilingLight' | 'screen'
  | 'carPaint' | 'carGlass'
  | `facade${number}`;

export class Town {
  readonly group = new THREE.Group();
  private geos = new Map<string, Geo>();
  private mats = {} as Record<string, THREE.Material>;
  private waterTex: THREE.Texture;
  private glowMat: THREE.MeshBasicMaterial;
  private decalMat: THREE.MeshBasicMaterial;
  private litMats: THREE.MeshStandardMaterial[] = [];

  constructor(scene: THREE.Scene) {
    scene.add(this.group);
    this.makeMaterials();
    this.waterTex = (this.mats.water as THREE.MeshStandardMaterial).normalMap!;
    this.glowMat = this.mats.glow as THREE.MeshBasicMaterial;
    this.decalMat = this.mats.decal as THREE.MeshBasicMaterial;
    this.ground();
    this.roadsAndPaving();
    for (const h of houses) this.house(h);
    for (const v of venues) this.venue(v);
    for (const t of towers) this.tower(t.x0, t.x1, t.z0, t.z1, 0, t.h, t.style);
    this.trees();
    this.lamps();
    this.props();
    this.parkedCars();
    this.build();
  }

  // ---------------------------------------------------------------- materials

  private makeMaterials() {
    const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
    const rep = (t: THREE.Texture) => t;
    const g = grass(), fl = field(), a = asphalt(), c = concrete(2), hw = houseWall(), sh = shingles(), wd = plywood(), tl = tileFloor();
    this.mats.grass = std({ map: rep(g.map), normalMap: g.normal, roughness: 0.95 });
    this.mats.field = std({ map: fl.map, normalMap: fl.normal, roughness: 0.95 });
    this.mats.asphalt = std({ map: a.map, normalMap: a.normal, roughness: 0.92 });
    this.mats.paint = std({ roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mats.concrete = std({ map: c.map, normalMap: c.normal, roughness: 0.9 });
    const wallMat = std({ map: hw.map, emissiveMap: hw.lit, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.85 });
    this.litMats.push(wallMat);
    this.mats.houseWall = wallMat;
    this.mats.roof = std({ map: sh.map, normalMap: sh.normal, roughness: 0.9 });
    this.mats.trim = std({ roughness: 0.75 });
    this.mats.roofFlat = std({ map: roofTex(), roughness: 0.95 });
    this.mats.wood = std({ map: wd.map, normalMap: wd.normal, roughness: 0.55 });
    this.mats.tile = std({ map: tl.map, normalMap: tl.normal, roughness: 0.35 });
    this.mats.poolTile = std({ map: tl.map, roughness: 0.4 });
    this.mats.glass = new THREE.MeshPhysicalMaterial({ color: 0x9db8cc, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide, envMapIntensity: 1.5 });
    this.mats.bark = barkMaterial();
    const lm = leafMaterials();
    this.mats.leaves = lm.leaves;
    this.mats.pole = std({ roughness: 0.5, metalness: 0.6 });
    this.mats.glow = new THREE.MeshBasicMaterial({ color: 0x777066 });
    this.mats.ceilingLight = new THREE.MeshBasicMaterial({ color: 0xfff6e6 });
    this.mats.screen = new THREE.MeshStandardMaterial({ color: 0x0a0d12, roughness: 0.15, metalness: 0.4 });
    this.mats.decal = new THREE.MeshBasicMaterial({ map: glowSpot(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xffc98a });
    this.mats.water = new THREE.MeshPhysicalMaterial({ color: 0x2a9fd6, roughness: 0.05, transparent: true, opacity: 0.72, normalMap: water(), normalScale: new THREE.Vector2(0.4, 0.4), envMapIntensity: 1.4 });
    for (let i = 0; i < 5; i++) {
      const f = facade(i);
      const m = new THREE.MeshStandardMaterial({ map: f.map, roughnessMap: f.rm, metalnessMap: f.rm, roughness: 1, metalness: 1, envMapIntensity: 1.2, emissiveMap: f.lit, emissive: 0xffffff, emissiveIntensity: 0 });
      this.mats[`facade${i}`] = m;
      this.litMats.push(m);
    }
    this.mats.carPaint = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.08 });
    this.mats.carGlass = carMats().glass;
  }

  /** The Geo for a material in the tile that holds (x, z). */
  private geo(mat: MatKey, x: number, z: number) {
    const k = `${mat}|${Math.floor(x / TILE)}|${Math.floor(z / TILE)}`;
    let g = this.geos.get(k);
    if (!g) this.geos.set(k, (g = new Geo()));
    return g;
  }

  private build() {
    const noShadow = new Set(['glass', 'glow', 'decal', 'water', 'paint', 'ceilingLight', 'carGlass']);
    const flat = new Set(['grass', 'field', 'asphalt', 'paint', 'concrete', 'tile', 'wood', 'decal', 'water', 'poolTile']);
    for (const [k, g] of this.geos) {
      if (g.empty) continue;
      const mat = k.split('|')[0];
      const mesh = new THREE.Mesh(g.build(), this.mats[mat]);
      mesh.castShadow = !noShadow.has(mat) && !flat.has(mat);
      mesh.receiveShadow = !['glow', 'decal', 'ceilingLight'].includes(mat);
      if (mat === 'leaves') mesh.customDepthMaterial = leafMaterials().depth;
      if (mat === 'glass' || mat === 'water') mesh.renderOrder = 2;
      if (mat === 'decal') mesh.renderOrder = 3;
      this.group.add(mesh);
    }
    this.geos.clear();
  }

  // ---------------------------------------------------------------- helpers

  /** A flat rectangle at height y, UVs one tile per `tile` metres. */
  private flat(mat: MatKey, x0: number, x1: number, z0: number, z1: number, y: number, tile: number, color = '#ffffff') {
    // Big rectangles are cut into tile-sized pieces so each lands in its own tile.
    for (let ax = x0; ax < x1 - 1e-6; ax = Math.min(x1, (Math.floor(ax / TILE) + 1) * TILE)) {
      const bx = Math.min(x1, (Math.floor(ax / TILE) + 1) * TILE);
      for (let az = z0; az < z1 - 1e-6; az = Math.min(z1, (Math.floor(az / TILE) + 1) * TILE)) {
        const bz = Math.min(z1, (Math.floor(az / TILE) + 1) * TILE);
        const t = 1 / tile;
        this.geo(mat, (ax + bx) / 2, (az + bz) / 2)
          .tint(color)
          .quad([[ax, y, az], [bx, y, az], [bx, y, bz], [ax, y, bz]], [0, 1, 0], [[ax * t, -az * t], [bx * t, -az * t], [bx * t, -bz * t], [ax * t, -bz * t]]);
      }
    }
  }

  /** A box, coloured, in the given material (UVs world-sized). */
  private box(mat: MatKey, b: { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number }, color: string, tile = 2, bottom = false) {
    this.geo(mat, (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2).tint(color).box(b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, tile, !bottom);
  }

  /** A vertical wall face from (x0, z0) to (x1, z1), facing `n`, with UVs u = along / uw, v = y / vh. */
  private face(mat: MatKey, x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, n: V3, uw: number, vh: number, color = '#ffffff', u0 = 0) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    this.geo(mat, (x0 + x1) / 2, (z0 + z1) / 2)
      .tint(color)
      .quad([[x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0]], n, [[u0 / uw, y0 / vh], [(u0 + len) / uw, y0 / vh], [(u0 + len) / uw, y1 / vh], [u0 / uw, y1 / vh]]);
  }

  /** The four outside walls of a block, with a texture that tiles uw × vh metres (so windows line up). */
  private walls(mat: MatKey, x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, uw: number, vh: number, color = '#ffffff') {
    this.face(mat, x0, z1, x1, z1, y0, y1, [0, 0, 1], uw, vh, color);
    this.face(mat, x1, z0, x0, z0, y0, y1, [0, 0, -1], uw, vh, color);
    this.face(mat, x1, z1, x1, z0, y0, y1, [1, 0, 0], uw, vh, color);
    this.face(mat, x0, z0, x0, z1, y0, y1, [-1, 0, 0], uw, vh, color);
  }

  /** A pitched roof over a block, the ridge along its longer side, with gable ends in `wallColor`. */
  private pitched(x0: number, x1: number, z0: number, z1: number, y: number, color: string, wallColor: string) {
    const o = 0.5;
    const alongX = x1 - x0 >= z1 - z0;
    const span = alongX ? z1 - z0 : x1 - x0;
    const rise = span * 0.38;
    const g = this.geo('roof', (x0 + x1) / 2, (z0 + z1) / 2).tint(color);
    const slope = Math.hypot(span / 2 + o, rise + o * 0.76);
    if (alongX) {
      const zm = (z0 + z1) / 2, yt = y + rise;
      const n1: V3 = [0, span / 2, -rise], n2: V3 = [0, span / 2, rise];
      const l1 = Math.hypot(...n1), l2 = Math.hypot(...n2);
      g.quad([[x0 - o, y - o * 0.76, z0 - o], [x1 + o, y - o * 0.76, z0 - o], [x1 + o, yt, zm], [x0 - o, yt, zm]], [n1[0] / l1, n1[1] / l1, n1[2] / l1], [[0, 0], [(x1 - x0) / 2, 0], [(x1 - x0) / 2, slope / 2], [0, slope / 2]]);
      g.quad([[x0 - o, y - o * 0.76, z1 + o], [x1 + o, y - o * 0.76, z1 + o], [x1 + o, yt, zm], [x0 - o, yt, zm]], [n2[0] / l2, n2[1] / l2, n2[2] / l2], [[0, 0], [(x1 - x0) / 2, 0], [(x1 - x0) / 2, slope / 2], [0, slope / 2]]);
      const w = this.geo('trim', (x0 + x1) / 2, zm).tint(wallColor);
      for (const [x, nx] of [[x0, -1], [x1, 1]] as const) w.quad([[x, y, z0], [x, y, z1], [x, yt, zm], [x, yt, zm]], [nx, 0, 0], [[0, 0], [1, 0], [0.5, 1], [0.5, 1]]);
    } else {
      const xm = (x0 + x1) / 2, yt = y + rise;
      const n1: V3 = [-rise, span / 2, 0], n2: V3 = [rise, span / 2, 0];
      const l1 = Math.hypot(...n1), l2 = Math.hypot(...n2);
      g.quad([[x0 - o, y - o * 0.76, z0 - o], [x0 - o, y - o * 0.76, z1 + o], [xm, yt, z1 + o], [xm, yt, z0 - o]], [n1[0] / l1, n1[1] / l1, n1[2] / l1], [[0, 0], [(z1 - z0) / 2, 0], [(z1 - z0) / 2, slope / 2], [0, slope / 2]]);
      g.quad([[x1 + o, y - o * 0.76, z0 - o], [x1 + o, y - o * 0.76, z1 + o], [xm, yt, z1 + o], [xm, yt, z0 - o]], [n2[0] / l2, n2[1] / l2, n2[2] / l2], [[0, 0], [(z1 - z0) / 2, 0], [(z1 - z0) / 2, slope / 2], [0, slope / 2]]);
      const w = this.geo('trim', xm, (z0 + z1) / 2).tint(wallColor);
      for (const [z, nz] of [[z0, -1], [z1, 1]] as const) w.quad([[x0, y, z], [x1, y, z], [xm, yt, z], [xm, yt, z]], [0, 0, nz], [[0, 0], [1, 0], [0.5, 1], [0.5, 1]]);
    }
  }

  // ---------------------------------------------------------------- ground, roads, paving

  private ground() {
    // Grass everywhere except over the pool.
    const G = 80;
    for (let x = -400; x < 400; x += G) {
      for (let z = -960; z < 720; z += G) {
        const hit = x < POOL.x1 && x + G > POOL.x0 && z < POOL.z1 && z + G > POOL.z0;
        if (!hit) {
          this.flat('grass', x, x + G, z, z + G, 0, 4);
          continue;
        }
        // Around the pool hole.
        this.flat('grass', x, POOL.x0, z, z + G, 0, 4);
        this.flat('grass', POOL.x1, x + G, z, z + G, 0, 4);
        this.flat('grass', POOL.x0, POOL.x1, z, POOL.z0, 0, 4);
        this.flat('grass', POOL.x0, POOL.x1, POOL.z1, z + G, 0, 4);
      }
    }
    // The pool: tiled sides and floor, water near the top.
    const D = 1.6;
    this.flat('poolTile', POOL.x0, POOL.x1, POOL.z0, POOL.z1, -D, 2, '#9fd8f0');
    const p = POOL;
    this.face('poolTile', p.x0, p.z0, p.x1, p.z0, -D, 0, [0, 0, 1], 2, 2, '#bfe6f5');
    this.face('poolTile', p.x1, p.z1, p.x0, p.z1, -D, 0, [0, 0, -1], 2, 2, '#bfe6f5');
    this.face('poolTile', p.x0, p.z1, p.x0, p.z0, -D, 0, [1, 0, 0], 2, 2, '#bfe6f5');
    this.face('poolTile', p.x1, p.z0, p.x1, p.z1, -D, 0, [-1, 0, 0], 2, 2, '#bfe6f5');
    this.flat('water', p.x0, p.x1, p.z0, p.z1, -0.18, 3);
  }

  private roadsAndPaving() {
    for (const p of paved) {
      if (p.kind === 'pool') continue;
      const y = p.kind === 'sidewalk' ? 0.06 : p.kind === 'parking' || p.kind === 'court' ? 0.025 : p.kind === 'field' ? 0.008 : 0.035;
      const mat: MatKey = p.kind === 'parking' || p.kind === 'court' ? 'asphalt' : p.kind === 'field' ? 'field' : 'concrete';
      const color = p.kind === 'court' ? '#5f8f6a' : p.kind === 'plaza' ? '#e6e0d4' : p.kind === 'drive' ? '#d9d4c8' : '#ffffff';
      this.flat(mat, p.x0, p.x1, p.z0, p.z1, y, mat === 'asphalt' ? 8 : 4, color);
      if (p.kind === 'sidewalk') {
        // The kerb's sides.
        const g = this.geo('concrete', (p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2).tint('#cfcac0');
        g.box(p.x0, p.x1, 0, y, p.z0, p.z1, 4);
      }
      if (p.kind === 'parking') {
        // Parking bay lines.
        for (let x = p.x0 + 4; x < p.x1 - 2; x += 3.2) {
          for (const [z0, z1] of [[p.z0 + 2, p.z0 + 8], [p.z1 - 8, p.z1 - 2], [p.z0 + 13, p.z0 + 19], [p.z1 - 19, p.z1 - 13]]) this.flat('paint', x - 0.06, x + 0.06, z0, z1, 0.03, 4, '#f4f4f0');
        }
      }
    }
    for (const r of roads) {
      this.flat(r.kind === 'drive' ? 'concrete' : 'asphalt', r.x0, r.x1, r.z0, r.z1, 0.02, r.kind === 'drive' ? 4 : 8, r.kind === 'drive' ? '#d9d4c8' : '#ffffff');
      if (r.kind === 'drive') continue;
      // Lines: a dashed yellow middle on suburb streets; double yellow and dashed white lanes in the city.
      const along = r.dir === 'ns' ? [r.z0, r.z1] : [r.x0, r.x1];
      const mid = r.dir === 'ns' ? (r.x0 + r.x1) / 2 : (r.z0 + r.z1) / 2;
      const crossing = (a: number) => roads.some((o) => o !== r && o.dir !== r.dir && o.kind !== 'drive' && (r.dir === 'ns' ? a > o.z0 - 2 && a < o.z1 + 2 && mid > o.x0 && mid < o.x1 : a > o.x0 - 2 && a < o.x1 + 2 && mid > o.z0 && mid < o.z1));
      const line = (off: number, w: number, dash: number, gap: number, color: string) => {
        for (let a = along[0] + 1; a < along[1] - 1; a += dash + gap) {
          const b = Math.min(along[1] - 1, a + dash);
          if (crossing(a) || crossing(b)) continue;
          if (r.dir === 'ns') this.flat('paint', mid + off - w / 2, mid + off + w / 2, a, b, 0.028, 4, color);
          else this.flat('paint', a, b, mid + off - w / 2, mid + off + w / 2, 0.028, 4, color);
        }
      };
      if (r.kind === 'street') line(0, 0.14, 3, 4, '#e8b923');
      else {
        line(-0.15, 0.12, 6, 0, '#e8b923');
        line(0.15, 0.12, 6, 0, '#e8b923');
        line(-3.5, 0.13, 3, 6, '#f4f4f0');
        line(3.5, 0.13, 3, 6, '#f4f4f0');
      }
    }
  }

  // ---------------------------------------------------------------- buildings

  private house(h: House) {
    // Walls with windows (one per 4 m per floor), a front door and step, a pitched roof, a chimney.
    this.walls('houseWall', h.x0, h.x1, h.z0, h.z1, 0, h.h, 4, 3, h.color);
    this.pitched(h.x0, h.x1, h.z0, h.z1, h.h, h.roof, h.color);
    const cx = (h.x0 + h.x1) / 2;
    const fz = h.face === 'n' ? h.z0 : h.z1, s = h.face === 'n' ? -1 : 1;
    // Door (covers the window there).
    this.box('trim', { x0: cx - 0.6, x1: cx + 0.6, z0: fz - (s < 0 ? 0.06 : 0), z1: fz + (s > 0 ? 0.06 : 0), y0: 0.2, y1: 2.3 }, '#7a3b2a');
    this.box('trim', { x0: cx - 0.75, x1: cx + 0.75, z0: fz - (s < 0 ? 0.08 : 0), z1: fz + (s > 0 ? 0.08 : 0), y0: 2.3, y1: 2.6 }, '#ffffff');
    this.box('concrete', { x0: cx - 1.2, x1: cx + 1.2, z0: Math.min(fz, fz + s * 1.2), z1: Math.max(fz, fz + s * 1.2), y0: 0, y1: 0.2 }, '#d8d2c6');
    // A path to the sidewalk.
    this.flat('concrete', cx - 0.6, cx + 0.6, Math.min(fz + s * 1.2, fz + s * 13), Math.max(fz + s * 1.2, fz + s * 13), 0.03, 4, '#d8d2c6');
    const chx = h.x0 + (h.x1 - h.x0) * 0.25;
    const zc = (h.z0 + h.z1) / 2;
    this.box('trim', { x0: chx - 0.5, x1: chx + 0.5, z0: zc - 0.5, z1: zc + 0.5, y0: h.h, y1: h.h + (h.z1 - h.z0) * 0.38 + 1 }, '#8a4b3a');
  }

  private venue(v: Venue) {
    const inside = (x: number, z: number) => x > v.x0 + 0.05 && x < v.x1 - 0.05 && z > v.z0 + 0.05 && z < v.z1 - 0.05;
    // Walls: each solid wall box drawn with the outside colour (or windows) facing out, the inside colour facing in.
    const glassSide = v.glass ? v.doors[0].side : undefined;
    const outerMat: MatKey = v.upper?.style === -1 ? 'houseWall' : 'trim';
    const outerTile = outerMat === 'houseWall' ? 4 : 2;
    for (const b of wallBoxes(v)) {
      const exterior = b.x0 <= v.x0 + 0.01 || b.x1 >= v.x1 - 0.01 || b.z0 <= v.z0 + 0.01 || b.z1 >= v.z1 - 0.01;
      const side: Side | undefined = !exterior ? undefined : b.z0 <= v.z0 + 0.01 && b.z1 - b.z0 < 1 ? 'n' : b.z1 >= v.z1 - 0.01 && b.z1 - b.z0 < 1 ? 's' : b.x0 <= v.x0 + 0.01 ? 'w' : 'e';
      if (side && side === glassSide) {
        // Shop window: a low wall, glass, a band at the top.
        this.wallBox(b, 0, 0.6, v, inside, 'trim', v.wall, 2);
        this.wallBox(b, v.h - 0.7, v.h, v, inside, 'trim', v.wall, 2);
        const n: V3 = side === 'n' ? [0, 0, -1] : side === 's' ? [0, 0, 1] : side === 'w' ? [-1, 0, 0] : [1, 0, 0];
        const mz = (b.z0 + b.z1) / 2, mx = (b.x0 + b.x1) / 2;
        if (side === 'n' || side === 's') this.face('glass', b.x0, mz, b.x1, mz, 0.6, v.h - 0.7, n, 2, 2);
        else this.face('glass', mx, b.z0, mx, b.z1, 0.6, v.h - 0.7, n, 2, 2);
        // Window frames every 2.5 m.
        const len = side === 'n' || side === 's' ? b.x1 - b.x0 : b.z1 - b.z0;
        for (let a = 0; a <= len + 0.01; a += Math.max(1, len / Math.max(1, Math.round(len / 2.5)))) {
          const fb = side === 'n' || side === 's' ? { x0: b.x0 + a - 0.05, x1: b.x0 + a + 0.05, z0: b.z0, z1: b.z1, y0: 0.6, y1: v.h - 0.7 } : { x0: b.x0, x1: b.x1, z0: b.z0 + a - 0.05, z1: b.z0 + a + 0.05, y0: 0.6, y1: v.h - 0.7 };
          this.box('pole', fb, '#2a2d30');
        }
        continue;
      }
      this.wallBox(b, 0, v.h, v, inside, exterior ? outerMat : 'trim', exterior ? v.wall : v.inside, outerTile);
    }
    // Door frames and the wall over each doorway.
    for (const d of v.doors) {
      const ns = d.side === 'n' || d.side === 's';
      const at = ns ? (d.side === 'n' ? v.z0 : v.z1) : d.side === 'w' ? v.x0 : v.x1;
      const t = 0.3, inward = d.side === 'n' || d.side === 'w' ? 1 : -1;
      const a0 = d.at - d.w / 2, a1 = d.at + d.w / 2;
      const c0 = Math.min(at, at + inward * t), c1 = Math.max(at, at + inward * t);
      const header = ns ? { x0: a0, x1: a1, z0: c0, z1: c1, y0: 2.6, y1: v.h } : { x0: c0, x1: c1, z0: a0, z1: a1, y0: 2.6, y1: v.h };
      this.box(v.glass ? 'pole' : 'trim', header, v.glass ? '#2a2d30' : v.wall);
      for (const e of [a0, a1]) {
        const post = ns ? { x0: e - 0.08, x1: e + 0.08, z0: c0 - 0.03, z1: c1 + 0.03, y0: 0, y1: 2.6 } : { x0: c0 - 0.03, x1: c1 + 0.03, z0: e - 0.08, z1: e + 0.08, y0: 0, y1: 2.6 };
        this.box('pole', post, '#ffffff');
      }
      // A doormat.
      const mat = ns ? { x0: a0, x1: a1, z0: at - (inward < 0 ? 1.2 : 0), z1: at + (inward > 0 ? 1.2 : 0) } : { x0: at - (inward < 0 ? 1.2 : 0), x1: at + (inward > 0 ? 1.2 : 0), z0: a0, z1: a1 };
      this.flat('trim', mat.x0, mat.x1, mat.z0, mat.z1, 0.07, 1, '#4a3b30');
    }
    // Floor and ceiling (with lights), and the building above.
    this.flat(v.floor === 'wood' ? 'wood' : v.floor === 'tile' ? 'tile' : 'trim', v.x0, v.x1, v.z0, v.z1, 0.05, 2, v.floor === 'tile' ? '#cdc9c0' : '#ffffff');
    const ceil = this.geo('trim', (v.x0 + v.x1) / 2, (v.z0 + v.z1) / 2).tint('#f7f4ee');
    ceil.quad([[v.x0, v.h, v.z0], [v.x1, v.h, v.z0], [v.x1, v.h, v.z1], [v.x0, v.h, v.z1]], [0, -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    for (let x = v.x0 + 3; x < v.x1 - 2; x += 6) {
      for (let z = v.z0 + 3; z < v.z1 - 2; z += 6) {
        this.geo('ceilingLight', x, z).quad([[x - 0.6, v.h - 0.02, z - 0.6], [x + 0.6, v.h - 0.02, z - 0.6], [x + 0.6, v.h - 0.02, z + 0.6], [x - 0.6, v.h - 0.02, z + 0.6]], [0, -1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
      }
    }
    const up = v.upper;
    const top = v.h + (up?.h ?? 0.4);
    if (up) {
      if (up.style === -1) {
        this.walls('houseWall', v.x0, v.x1, v.z0, v.z1, v.h, top, 4, 3, up.color ?? v.wall);
        // A band between the floors and columns by the door, for a grand look.
        this.box('trim', { x0: v.x0 - 0.1, x1: v.x1 + 0.1, z0: v.z0 - 0.1, z1: v.z1 + 0.1, y0: v.h - 0.1, y1: v.h + 0.25 }, '#ffffff');
      } else this.tower(v.x0, v.x1, v.z0, v.z1, v.h, top, up.style);
    } else this.box('trim', { x0: v.x0, x1: v.x1, z0: v.z0, z1: v.z1, y0: v.h, y1: top }, v.wall);
    if (up?.roof === 'pitched') this.pitched(v.x0, v.x1, v.z0, v.z1, top, '#3b4552', up.color ?? v.wall);
    else if (!up || up.style !== -1) this.box('roofFlat', { x0: v.x0, x1: v.x1, z0: v.z0, z1: v.z1, y0: top, y1: top + 0.3 }, '#bbbbbb', 4);
    if (v.id === 'home') this.mansionPorch(v);
    if (v.sign) this.sign(v, v.sign.text, v.sign.bg, v.sign.fg, v.sign.side);
    for (const fu of v.furniture) this.furniture(fu, v);
  }

  /** One wall box, its faces coloured by which way they look (into the room or out). */
  private wallBox(b: Box, y0: number, y1: number, v: Venue, inside: (x: number, z: number) => boolean, outMat: MatKey, outColor: string, uw: number) {
    const faces: [V3, number, number, number, number][] = [
      [[0, 0, -1], b.x1, b.z0, b.x0, b.z0],
      [[0, 0, 1], b.x0, b.z1, b.x1, b.z1],
      [[-1, 0, 0], b.x0, b.z0, b.x0, b.z1],
      [[1, 0, 0], b.x1, b.z1, b.x1, b.z0],
    ];
    for (const [n, x0, z0, x1, z1] of faces) {
      const mx = (x0 + x1) / 2 + n[0] * 0.2, mz = (z0 + z1) / 2 + n[2] * 0.2;
      const into = inside(mx, mz);
      if (into) this.face('trim', x0, z0, x1, z1, y0, y1, n, 2, 2, v.inside);
      else this.face(outMat, x0, z0, x1, z1, y0, y1, n, uw, outMat === 'houseWall' ? 3 : 2, outColor, n[0] ? z0 : x0);
    }
    this.geo('trim', (b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2).tint(outColor).quad([[b.x0, y1, b.z0], [b.x1, y1, b.z0], [b.x1, y1, b.z1], [b.x0, y1, b.z1]], [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  }

  /** Columns and a balcony over the mansion's front door. */
  private mansionPorch(v: Venue) {
    const z = v.z0;
    for (const x of [-5, -2.2, 2.2, 5]) {
      this.geo('trim', x, z - 3).tint('#ffffff').add(new THREE.CylinderGeometry(0.3, 0.34, v.h, 14), new THREE.Matrix4().makeTranslation(x, v.h / 2, z - 3));
    }
    this.box('trim', { x0: -6, x1: 6, z0: z - 3.6, z1: z, y0: v.h, y1: v.h + 0.35 }, '#ffffff');
    this.box('concrete', { x0: -6.5, x1: 6.5, z0: z - 4, z1: z, y0: 0, y1: 0.12 }, '#e6e1d6');
    for (let x = -5.6; x <= 5.6; x += 0.5) this.box('trim', { x0: x - 0.05, x1: x + 0.05, z0: z - 3.5, z1: z - 3.4, y0: v.h + 0.35, y1: v.h + 1.2 }, '#ffffff');
    this.box('trim', { x0: -6, x1: 6, z0: z - 3.55, z1: z - 3.35, y0: v.h + 1.2, y1: v.h + 1.3 }, '#ffffff');
  }

  private sign(v: Venue, text: string, bg: string, fg: string, side: Side) {
    const tex = textTexture(text, bg, fg, 1024, 160);
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.6 });
    this.litMats.push(mat);
    const wide = side === 'n' || side === 's';
    const len = wide ? v.x1 - v.x0 : v.z1 - v.z0;
    const w = Math.min(14, len * 0.7), h = (w * 160) / 1024;
    const door = v.doors.find((d) => d.side === side);
    const at = door?.at ?? (wide ? (v.x0 + v.x1) / 2 : (v.z0 + v.z1) / 2);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    const y = v.h + 0.15 + h / 2 + (v.id === 'work' ? 0.6 : 0);
    if (side === 'n') mesh.position.set(at, y, v.z0 - 0.12), (mesh.rotation.y = Math.PI);
    if (side === 's') mesh.position.set(at, y, v.z1 + 0.12);
    if (side === 'w') mesh.position.set(v.x0 - 0.12, y, at), (mesh.rotation.y = -Math.PI / 2);
    if (side === 'e') mesh.position.set(v.x1 + 0.12, y, at), (mesh.rotation.y = Math.PI / 2);
    this.group.add(mesh);
  }

  /** A tower block with a glass-and-stone facade (windows line up with the floors), a flat roof, a parapet. */
  private tower(x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, style: number) {
    this.walls(`facade${style}`, x0, x1, z0, z1, y0, y1, FACADE_W, FACADE_H);
    if (y0 === 0) {
      // A darker band at street level.
      this.box('trim', { x0: x0 - 0.15, x1: x1 + 0.15, z0: z0 - 0.15, z1: z1 + 0.15, y0: 0, y1: 0.8 }, '#3a3d42');
    }
    this.box('roofFlat', { x0, x1, z0, z1, y0: y1, y1: y1 + 0.2 }, '#9a9a9a', 4);
    const p = 0.4;
    for (const b of [
      { x0, x1, z0, z1: z0 + p }, { x0, x1, z0: z1 - p, z1 }, { x0, x1: x0 + p, z0, z1 }, { x0: x1 - p, x1, z0, z1 },
    ]) this.box('trim', { ...b, y0: y1, y1: y1 + 1.1 }, '#5a5e63');
    if (y1 - y0 > 60) {
      // Machinery on top of the tall ones.
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      this.box('trim', { x0: cx - 4, x1: cx + 4, z0: cz - 3, z1: cz + 3, y0: y1, y1: y1 + 3 }, '#77797c');
    }
  }

  // ---------------------------------------------------------------- furniture

  private furniture(fu: Furn, v: Venue) {
    const B = (x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, c: string, mat: MatKey = 'trim') => this.box(mat, { x0, x1, z0, z1, y0, y1 }, c);
    const { x0, x1, z0, z1, y1 } = fu;
    const r = rng(Math.floor(x0 * 13 + z0 * 7));
    const legs = (h: number, c: string, t = 0.06) => {
      for (const [x, z] of [[x0 + t, z0 + t], [x1 - t, z0 + t], [x0 + t, z1 - t], [x1 - t, z1 - t]]) B(x - 0.03, x + 0.03, z - 0.03, z + 0.03, 0, h, c);
    };
    switch (fu.kind) {
      case 'rug':
        this.flat('trim', x0, x1, z0, z1, 0.07, 1, fu.color);
        break;
      case 'counter':
      case 'reception':
      case 'checkout':
        B(x0, x1, z0, z1, 0, y1 - 0.05, fu.color);
        B(x0 - 0.05, x1 + 0.05, z0 - 0.05, z1 + 0.05, y1 - 0.05, y1, fu.kind === 'checkout' ? '#222222' : '#e8e4dc');
        if (fu.kind === 'counter' && v.id === 'coffee') {
          // The coffee machine, cups and a cake stand.
          B(22, 24, 382.7, 383.6, 1.05, 1.75, '#b0b4b8', 'pole');
          for (let i = 0; i < 6; i++) B(25 + i * 0.3, 25.2 + i * 0.3, 381.4, 381.6, 1.05, 1.17, '#ffffff');
          for (const [x, c] of [[17, '#8b5a2b'], [18.4, '#e8a0b4'], [27.8, '#f3c06b']] as const) B(x, x + 0.8, 381.3, 382.3, 1.05, 1.25, c);
        }
        if (fu.kind === 'reception') B(x0 + 1, x0 + 1.6, z0 + 0.6, z0 + 0.65, y1, y1 + 0.4, '#111111');
        break;
      case 'shelf':
      case 'bookcase': {
        B(x0, x1, z0, z1, 0, y1, fu.kind === 'shelf' ? '#d6d2c8' : fu.color);
        // Things on the shelves, both long sides (shelves run along z; bookcases along their length).
        const alongZ = z1 - z0 > x1 - x0;
        const colors = fu.kind === 'shelf' ? ['#e74c3c', '#f1c40f', '#2ecc71', '#3498db', '#e67e22', '#9b59b6', '#ecf0f1', '#d35400'] : ['#8e2b2b', '#2b4f8e', '#2e7d32', '#c99a2e', '#5d3a7a', '#37474f'];
        for (let lvl = 0; lvl < 4; lvl++) {
          const y = 0.15 + lvl * (y1 - 0.2) / 4;
          const len = alongZ ? z1 - z0 : x1 - x0;
          for (let a = 0.1; a < len - 0.25; a += 0.22 + r() * 0.15) {
            const c = colors[Math.floor(r() * colors.length)];
            const hgt = 0.18 + r() * 0.22;
            const d = fu.kind === 'shelf' ? 0.3 : 0.22;
            if (alongZ) {
              B(x0 - 0.02, x0 + d, z0 + a, z0 + a + 0.18, y, y + hgt, c);
              if (fu.kind === 'shelf') B(x1 - d, x1 + 0.02, z0 + a, z0 + a + 0.18, y, y + hgt, colors[Math.floor(r() * colors.length)]);
            } else {
              const back = fu.face === 'n' ? z0 - 0.02 : z1 - d;
              B(x0 + a, x0 + a + 0.16, back, back + d, y, y + hgt, c);
            }
          }
        }
        break;
      }
      case 'freezer': {
        // An open-front freezer: base, back, top, the ice cream and pizzas on shelves behind glass.
        B(x0, x1, z0, z1, 0, 0.3, fu.color);
        B(x0, x1, z1 - 0.2, z1, 0, y1, fu.color);
        B(x0, x1, z0, z1, y1 - 0.15, y1, fu.color);
        for (const y of [0.3, 0.95, 1.5]) B(x0, x1, z0 + 0.1, z1 - 0.2, y - 0.03, y, '#c8d2da');
        this.face('glass', x0, z0 - 0.01, x1, z0 - 0.01, 0.3, y1 - 0.15, [0, 0, -1], 2, 2);
        const tints = ['#f7c6d9', '#fff3c4', '#c4e3ff', '#d9a066'];
        let n = 0;
        for (let x = x0 + 0.3; x < x1 - 0.3; x += 0.45) for (const y of [0.3, 0.95, 1.5]) B(x, x + 0.35, z0 + 0.3, z1 - 0.4, y, y + 0.28, tints[n++ % 4]);
        break;
      }
      case 'bed':
        B(x0, x1, z0, z1, 0, 0.35, '#6b4a2f');
        B(x0 + 0.1, x1 - 0.1, z0 + 0.1, z1 - 0.1, 0.35, y1, '#f4f4f4');
        // Blanket over most of it, pillows at the head (the far end from where it faces).
        if (fu.face === 'w') {
          B(x0 + 0.05, x1 - 0.9, z0 + 0.05, z1 - 0.05, y1 - 0.05, y1 + 0.06, '#3b5f9a');
          const pw = (z1 - z0) / 2 - 0.3;
          for (const z of [z0 + 0.2, (z0 + z1) / 2 + 0.1]) B(x1 - 0.8, x1 - 0.25, z, z + pw, y1, y1 + 0.18, '#ffffff');
          B(x1 - 0.2, x1, z0, z1, 0, 1.4, '#6b4a2f');
        }
        break;
      case 'sofa': {
        // The back is on the side away from where it faces; arms at the ends.
        B(x0, x1, z0, z1, 0, 0.45, fu.color);
        const f = fu.face ?? 'n';
        if (f === 'n' || f === 's') {
          const back = f === 'n' ? [z1 - 0.4, z1] : [z0, z0 + 0.4];
          B(x0, x1, back[0], back[1], 0.45, y1, fu.color);
          B(x0, x0 + 0.3, z0, z1, 0.45, 0.68, fu.color);
          B(x1 - 0.3, x1, z0, z1, 0.45, 0.68, fu.color);
        } else {
          const back = f === 'e' ? [x0, x0 + 0.4] : [x1 - 0.4, x1];
          B(back[0], back[1], z0, z1, 0.45, y1, fu.color);
          B(x0, x1, z0, z0 + 0.3, 0.45, 0.68, fu.color);
          B(x0, x1, z1 - 0.3, z1, 0.45, 0.68, fu.color);
          for (let z = z0 + 0.4; z < z1 - 0.5; z += 2.1) B(f === 'e' ? x0 + 0.45 : x0 + 0.1, f === 'e' ? x1 - 0.1 : x1 - 0.45, z, z + 1.9, 0.45, 0.58, '#5b7090');
          break;
        }
        for (let x = x0 + 0.4; x < x1 - 0.5; x += 1.4) B(x, x + 1.2, z0 + 0.1, z1 - 0.45, 0.45, 0.58, '#5b7090');
        break;
      }
      case 'table':
      case 'desk':
        B(x0, x1, z0, z1, y1 - 0.05, y1, fu.color);
        legs(y1 - 0.05, '#333333');
        if (fu.kind === 'desk' && v.id === 'work') {
          // A computer.
          const cx = (x0 + x1) / 2;
          B(cx - 0.45, cx + 0.45, z0 + 0.2, z0 + 0.25, y1 + 0.15, y1 + 0.65, '#111111');
          B(cx - 0.05, cx + 0.05, z0 + 0.2, z0 + 0.3, y1, y1 + 0.15, '#333333');
          B(cx - 0.35, cx + 0.35, z0 + 0.6, z0 + 0.8, y1, y1 + 0.03, '#2a2a2a');
        }
        break;
      case 'chair': {
        B(x0, x1, z0, z1, 0.45, 0.5, fu.color);
        legs(0.45, '#333333', 0.04);
        const back = fu.face === 'n' ? [z1 - 0.06, z1] : fu.face === 's' ? [z0, z0 + 0.06] : null;
        if (back) B(x0, x1, back[0], back[1], 0.5, y1, fu.color);
        else if (fu.face === 'w') B(x1 - 0.06, x1, z0, z1, 0.5, y1, fu.color);
        else B(x0, x0 + 0.06, z0, z1, 0.5, y1, fu.color);
        break;
      }
      case 'fridge':
        B(x0, x1, z0, z1, 0, y1, fu.color);
        B(x1, x1 + 0.04, z0 + 0.2, z0 + 0.3, 0.9, 1.6, '#888888', 'pole');
        B(x1, x1 + 0.01, z0, z1, 1.3, 1.32, '#bbbbbb');
        break;
      case 'stove':
        B(x0, x1, z0, z1, 0, y1, fu.color);
        for (const z of [z0 + 0.5, z1 - 0.5]) B(x0 + 0.6, x0 + 1.1, z - 0.25, z + 0.25, y1, y1 + 0.02, '#111111');
        break;
      case 'tv': {
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        if (z1 - z0 > x1 - x0) B(x0 - 0.3, x1, cz - 1.6, cz + 1.6, 0, 0.55, '#3b2f28');
        else B(cx - 1.6, cx + 1.6, z0, z1 + 0.3, 0, 0.55, '#3b2f28');
        this.box('screen', { x0, x1, z0, z1, y0: 0.9, y1 }, '#ffffff');
        break;
      }
      case 'board':
        B(x0, x1, z0, z1, 1, y1, fu.color);
        B(x0 - 0.06, x1 + 0.06, z0 - 0.02, z1 + 0.02, 0.95, 1, '#b08a5a');
        if (v.id === 'coffee') {
          // The menu.
          const tex = textTexture('Coffee · Cocoa · Muffins · Donuts', '#1d1d1d', '#f4e6c8', 1024, 96);
          const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0 - 0.4, 0.9), new THREE.MeshBasicMaterial({ map: tex }));
          m.position.set((x0 + x1) / 2, (1 + y1) / 2, z0 - 0.01);
          m.rotation.y = Math.PI;
          this.group.add(m);
        }
        break;
      case 'plant': {
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, rr = (x1 - x0) / 2;
        this.geo('trim', cx, cz).tint('#a0522d').add(new THREE.CylinderGeometry(rr * 0.7, rr * 0.5, 0.5, 12), new THREE.Matrix4().makeTranslation(cx, 0.25, cz));
        this.geo('trim', cx, cz).tint(fu.color).add(new THREE.IcosahedronGeometry(rr * 1.1, 1), new THREE.Matrix4().makeTranslation(cx, y1 - rr, cz));
        break;
      }
      case 'wardrobe':
        B(x0, x1, z0, z1, 0, y1, fu.color);
        for (let x = x0 + (x1 - x0) / 3; x < x1 - 0.1; x += (x1 - x0) / 3) B(x - 0.02, x + 0.02, z1, z1 + 0.02, 0.1, y1 - 0.1, '#4a3a2a');
        break;
      case 'fireplace':
        B(x0, x1, z0, z1, 0, y1, fu.color);
        B(x1, x1 + 0.02, z0 + 2.5, z1 - 2.5, 0.2, 1.1, '#111111');
        this.geo('glow', x1, (z0 + z1) / 2).tint('#ffffff').box(x1 - 0.1, x1 + 0.03, 0.25, 0.6, z0 + 3, z1 - 3, 1);
        break;
      case 'elevator':
        B(x0, x1, z0, z1 + 0.1, 0, y1, fu.color, 'pole');
        B((x0 + x1) / 2 - 0.02, (x0 + x1) / 2 + 0.02, z1 + 0.1, z1 + 0.12, 0, y1 - 0.1, '#555555');
        break;
    }
  }

  // ---------------------------------------------------------------- outdoor things

  private trees() {
    const kinds = [0, 1, 2, 3].map((k) => treeGeometry(k + 1));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const Y = new THREE.Vector3(0, 1, 0);
    trees.forEach((t, i) => {
      q.setFromAxisAngle(Y, (i * 2.39996) % (Math.PI * 2));
      s.setScalar(t.s);
      m.compose(p.set(t.x, 0, t.z), q, s);
      const k = kinds[t.kind % 4];
      this.geo('bark', t.x, t.z).tint('#ffffff').add(k.bark, m);
      this.geo('leaves', t.x, t.z).tint(['#ffffff', '#e8f0d8', '#d8e8c8', '#f0f0d0'][i % 4]).add(k.leaves, m);
    });
  }

  private lamps() {
    for (const l of lamps) {
      const h = l.tall ? 8 : 5.5;
      const g = this.geo('pole', l.x, l.z).tint('#3a3d40');
      g.add(new THREE.CylinderGeometry(0.07, 0.11, h, 8), new THREE.Matrix4().makeTranslation(l.x, h / 2, l.z));
      // The arm reaches out over the street (away from the sidewalk side the lamp stands on).
      const dir = this.streetSide(l.x, l.z);
      const ax = l.x + dir[0] * 1.2, az = l.z + dir[1] * 1.2;
      g.box(Math.min(l.x, ax) - 0.05, Math.max(l.x, ax) + 0.05, h - 0.1, h, Math.min(l.z, az) - 0.05, Math.max(l.z, az) + 0.05, 1);
      g.box(ax - 0.3, ax + 0.3, h - 0.25, h - 0.05, az - 0.3, az + 0.3, 1);
      this.geo('glow', ax, az).tint('#ffffff').box(ax - 0.24, ax + 0.24, h - 0.3, h - 0.25, az - 0.24, az + 0.24, 1, false);
      // A pool of light on the ground (only at night).
      const R = l.tall ? 9 : 7;
      this.geo('decal', ax, az).tint('#ffffff').quad([[ax - R, 0.09, az - R], [ax + R, 0.09, az - R], [ax + R, 0.09, az + R], [ax - R, 0.09, az + R]], [0, 1, 0], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    }
  }

  /** Which way is the road from a lamp: the nearest road's middle, as a unit step in x or z. */
  private streetSide(x: number, z: number): [number, number] {
    let best: [number, number] = [1, 0], bd = Infinity;
    for (const r of roads) {
      if (r.dir === 'ns' && z > r.z0 && z < r.z1) {
        const d = (r.x0 + r.x1) / 2 - x;
        if (Math.abs(d) < bd) (bd = Math.abs(d)), (best = [Math.sign(d), 0]);
      }
      if (r.dir === 'ew' && x > r.x0 && x < r.x1) {
        const d = (r.z0 + r.z1) / 2 - z;
        if (Math.abs(d) < bd) (bd = Math.abs(d)), (best = [0, Math.sign(d)]);
      }
    }
    return best;
  }

  private props() {
    for (const p of props) {
      const B = (b: Partial<Box>, c: string, mat: MatKey = 'trim') => this.box(mat, { ...p, ...b } as Box, c);
      switch (p.kind) {
        case 'hedge':
        case 'stone':
          B({}, p.color ?? '#888888', p.kind === 'hedge' ? 'trim' : 'concrete');
          if (p.kind === 'hedge') {
            // Leafy top so it doesn't look like a green box.
            const long = p.x1 - p.x0 > p.z1 - p.z0;
            const len = long ? p.x1 - p.x0 : p.z1 - p.z0;
            for (let a = 0.6; a < len; a += 1.4) {
              const x = long ? p.x0 + a : (p.x0 + p.x1) / 2, z = long ? (p.z0 + p.z1) / 2 : p.z0 + a;
              this.geo('trim', x, z).tint('#36652f').add(new THREE.IcosahedronGeometry(0.8, 1), new THREE.Matrix4().makeTranslation(x, p.y1 - 0.15, z));
            }
          }
          break;
        case 'fence': {
          B({ y0: 0.5, y1: 0.6 }, p.color!);
          B({ y0: 1.2, y1: 1.3 }, p.color!);
          for (let x = p.x0; x <= p.x1; x += 2.4) B({ x0: x - 0.06, x1: x + 0.06, z0: p.z0 - 0.03, z1: p.z1 + 0.03 }, p.color!);
          break;
        }
        case 'mailbox':
          B({ y1: 1.0 }, '#4a3b30');
          B({ x0: p.x0 - 0.15, x1: p.x1 + 0.15, z0: p.z0 - 0.15, z1: p.z1 + 0.25, y0: 1.0, y1: 1.3 }, '#2c3e50');
          break;
        case 'goal':
          for (const x of [p.x0, p.x1]) B({ x0: x - 0.06, x1: x + 0.06 }, '#ffffff', 'pole');
          B({ y0: p.y1 - 0.12 }, '#ffffff', 'pole');
          break;
        case 'hoop':
          B({ y1: 3.05 }, '#555555', 'pole');
          B({ x0: p.x0 - 0.6, x1: p.x1 + 0.6, z0: p.z1, z1: p.z1 + 0.06, y0: 2.85, y1: 3.9 }, '#ffffff');
          this.geo('pole', p.x0, p.z1).tint('#ff5a1f').add(new THREE.TorusGeometry(0.23, 0.02, 6, 16).rotateX(Math.PI / 2), new THREE.Matrix4().makeTranslation((p.x0 + p.x1) / 2, 3.05, p.z1 + 0.3));
          break;
        case 'slide': {
          B({ x1: p.x0 + 0.1, z1: p.z0 + 0.1 }, '#3a7bd5', 'pole');
          B({ x0: p.x1 - 0.1, z1: p.z0 + 0.1 }, '#3a7bd5', 'pole');
          B({ z1: p.z0 + 1.2, y0: p.y1 - 0.1 }, '#f1c40f');
          // The slide itself, sloping down.
          const g = this.geo('trim', p.x0, p.z0).tint(p.color!);
          g.quad([[p.x0, p.y1, p.z0 + 1.2], [p.x1, p.y1, p.z0 + 1.2], [p.x1, 0.2, p.z1], [p.x0, 0.2, p.z1]], [0, 0.94, 0.33], [[0, 0], [1, 0], [1, 1], [0, 1]]);
          break;
        }
        case 'fountain': {
          const cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2, rr = (p.x1 - p.x0) / 2;
          this.geo('concrete', cx, cz).tint('#d8d2c6').add(new THREE.CylinderGeometry(rr, rr, p.y1, 24, 1, true), new THREE.Matrix4().makeTranslation(cx, p.y1 / 2, cz));
          this.geo('concrete', cx, cz).tint('#d8d2c6').add(new THREE.TorusGeometry(rr, 0.2, 6, 24).rotateX(Math.PI / 2), new THREE.Matrix4().makeTranslation(cx, p.y1, cz));
          this.geo('water', cx, cz).add(new THREE.CircleGeometry(rr - 0.1, 24).rotateX(-Math.PI / 2), new THREE.Matrix4().makeTranslation(cx, p.y1 - 0.15, cz));
          this.geo('concrete', cx, cz).tint('#d8d2c6').add(new THREE.CylinderGeometry(0.3, 0.5, 2.2, 12), new THREE.Matrix4().makeTranslation(cx, 1.1, cz));
          this.geo('concrete', cx, cz).tint('#d8d2c6').add(new THREE.CylinderGeometry(1.4, 0.3, 0.4, 16), new THREE.Matrix4().makeTranslation(cx, 2.2, cz));
          break;
        }
        case 'bench': {
          const long = p.x1 - p.x0 > p.z1 - p.z0;
          B({ y0: 0.42, y1: 0.48 }, '#8a6a4a');
          if (long) B({ z0: p.z1 - 0.08, y0: 0.48, y1: 0.95 }, '#8a6a4a');
          else B({ x0: p.x1 - 0.08, y0: 0.48, y1: 0.95 }, '#8a6a4a');
          B({ y1: 0.42, x0: long ? p.x0 : p.x0 + 0.1, x1: long ? p.x0 + 0.08 : p.x1 - 0.1, z0: long ? p.z0 + 0.1 : p.z0, z1: long ? p.z1 - 0.1 : p.z0 + 0.08 }, '#333333', 'pole');
          B({ y1: 0.42, x0: long ? p.x1 - 0.08 : p.x0 + 0.1, x1: long ? p.x1 : p.x1 - 0.1, z0: long ? p.z0 + 0.1 : p.z1 - 0.08, z1: long ? p.z1 - 0.1 : p.z1 }, '#333333', 'pole');
          break;
        }
        case 'sign': {
          for (const x of [p.x0 + 0.4, p.x1 - 0.4]) B({ x0: x - 0.08, x1: x + 0.08, y1: 2.0 }, '#555555', 'pole');
          const tex = textTexture('Llama City ↑', '#1f6f3a', '#ffffff', 512, 128);
          const m = new THREE.Mesh(new THREE.PlaneGeometry(p.x1 - p.x0, 1.4), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, side: THREE.DoubleSide }));
          m.position.set((p.x0 + p.x1) / 2, 2.7, p.z1 + 0.02);
          this.group.add(m);
          break;
        }
      }
    }
  }

  /** The parked cars, merged into the town (the cheap version of each car, few materials). */
  private parkedCars() {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    for (const c of parked) {
      const p = carParts(c.type, true);
      m.compose(new THREE.Vector3(c.x, 0, c.z), q.setFromAxisAngle(Y, c.heading), one);
      const add = (key: MatKey, list: THREE.BufferGeometry[], color: string) => {
        const g = this.geo(key, c.x, c.z).tint(color);
        for (const x of list) g.add(x, m);
      };
      add('carPaint', p.paint, c.color);
      add('carGlass', p.glass, '#ffffff');
      add('trim', p.dark, '#1b1d20');
      add('pole', p.chrome, '#dfe3e8');
      add('trim', p.head, '#f4f6ff');
      add('trim', p.tail, '#a01010');
      for (const at of p.wheelAt) {
        const wm = m.clone().multiply(new THREE.Matrix4().makeTranslation(at.x, at.y, at.z));
        this.geo('trim', c.x, c.z).tint('#18181a').add(p.tyre, wm);
        this.geo('pole', c.x, c.z).tint('#c9ced4').add(p.rim, wm);
      }
    }
  }

  // ---------------------------------------------------------------- every frame

  /** Night (0 = day, 1 = night): windows and lamps glow, the light pools show. Water ripples. */
  update(night: number, t: number) {
    for (const m of this.litMats) m.emissiveIntensity = m.map && m.emissiveMap === m.map ? 0.35 + night * 0.8 : night * 1.1;
    const g = 0.45 + night * 0.55;
    this.glowMat.color.setRGB(g, g * 0.92, g * 0.78);
    this.decalMat.opacity = night;
    this.waterTex.offset.set(t * 0.02, t * 0.013);
  }
}

/** A soft round spot of light for the ground under street lamps. */
function glowSpot() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
