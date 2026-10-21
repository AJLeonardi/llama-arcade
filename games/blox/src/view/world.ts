// Turns a Level into three.js meshes, and keeps the moving parts (moving blocks, vanish blocks, coins,
// portals, lava, belts) in step with the Sim each frame.
import * as THREE from 'three';
import type { Sim } from '../sim/physics';
import type { Block, Kind, Level } from '../sim/types';
import { LEVELS } from '../sim/levels';
import { BoxBatch } from './boxes';
import { beltTex, bounceTex, checkerTex, doorTex, grateTex, labelTex, lavaTex, portalTex, speedTex, tileTex } from './textures';

type Look = 'tile' | 'lava' | 'bounce' | 'speed' | 'finish' | 'belt' | 'grate' | 'door';
const LOOK: Record<Kind, Look> = {
  solid: 'tile', checkpoint: 'tile', vanish: 'tile', portal: 'tile', shop: 'tile', crawl: 'tile', spot: 'tile', zone: 'tile',
  lava: 'lava', bounce: 'bounce', speed: 'speed', finish: 'finish', conveyor: 'belt', door: 'door',
};
/** Blocks that aren't drawn as boxes (walk-through areas), or are drawn their own way. */
const NOT_BOXES = new Set<Kind>(['portal', 'shop', 'crawl', 'zone', 'spot']);

/** A copy of a shared texture, for materials that scroll it on their own. */
function own(t: THREE.Texture) {
  const c = t.clone();
  c.needsUpdate = true;
  return c;
}

function material(look: Look) {
  switch (look) {
    case 'lava':
      return new THREE.MeshBasicMaterial({ map: own(lavaTex()) });
    case 'bounce':
      return new THREE.MeshLambertMaterial({ vertexColors: true, map: bounceTex() });
    case 'speed':
      return new THREE.MeshLambertMaterial({ vertexColors: true, map: speedTex(), emissive: 0x332200 });
    case 'finish':
      return new THREE.MeshLambertMaterial({ vertexColors: true, map: checkerTex() });
    case 'belt':
      return new THREE.MeshLambertMaterial({ vertexColors: true, map: own(beltTex()) });
    case 'grate':
      return new THREE.MeshLambertMaterial({ vertexColors: true, map: grateTex(), transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
    case 'door':
      return new THREE.MeshLambertMaterial({ vertexColors: true, map: doorTex() });
    default:
      return new THREE.MeshLambertMaterial({ vertexColors: true, map: tileTex() });
  }
}

/** Which way a block's top texture should point: speed pads along the path (+z), belts along their push. */
const topSpin = (b: Block) => (b.push ? -Math.atan2(b.push[0], b.push[1]) : 0);

function sprite(text: string, bg: string, height: number) {
  const { tex, aspect } = labelTex(text, bg);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  s.scale.set(height * aspect, height, 1);
  return s;
}

export class WorldView {
  readonly group = new THREE.Group();
  private mats: THREE.Material[] = [];
  private geos: THREE.BufferGeometry[] = [];
  private texs: THREE.Texture[] = [];
  /** Blocks drawn on their own because they move or fade: block index → mesh. */
  private loose = new Map<number, THREE.Mesh>();
  private coins: THREE.InstancedMesh | null = null;
  private portals: { mesh: THREE.Mesh; tex: THREE.Texture }[] = [];
  private flags: { index: number; flag: THREE.Mesh }[] = [];
  private lavaMats: THREE.MeshBasicMaterial[] = [];
  private belts: { mat: THREE.MeshLambertMaterial; speed: number }[] = [];
  private dummy = new THREE.Object3D();
  private lastCheckpoint: [number, number, number] | null = null;
  private keys: THREE.Group[] = [];
  /** Doors: block index → how far open (0..1). */
  private doors = new Map<number, number>();

  constructor(readonly level: Level, done: string[]) {
    const color = new THREE.Color();
    const batches = new Map<Look, BoxBatch>();
    level.blocks.forEach((b, i) => {
      if (NOT_BOXES.has(b.kind)) return; // drawn below, or not at all
      color.set(b.color);
      const look = b.see ? 'grate' : LOOK[b.kind];
      if (b.kind === 'door') this.doors.set(i, 0);
      if (b.move || b.kind === 'vanish' || b.kind === 'door') {
        const one = new BoxBatch();
        one.add(0, 0, 0, b.w, b.h, b.d, color, topSpin(b));
        const mat = material(look);
        if (b.kind === 'vanish') mat.transparent = true;
        this.track(mat);
        const mesh = new THREE.Mesh(this.trackGeo(one.geometry()), mat);
        mesh.position.set(b.x, b.y, b.z);
        mesh.castShadow = mesh.receiveShadow = look !== 'lava';
        if (look === 'lava') {
          this.lavaMats.push(mat as THREE.MeshBasicMaterial);
          this.texs.push((mat as THREE.MeshBasicMaterial).map!);
        }
        this.group.add(mesh);
        this.loose.set(i, mesh);
        return;
      }
      let batch = batches.get(look);
      if (!batch) batches.set(look, (batch = new BoxBatch()));
      // Belts get their own batch per direction, so their stripes can scroll the right way.
      if (b.kind === 'conveyor') {
        const one = new BoxBatch();
        one.add(b.x, b.y, b.z, b.w, b.h, b.d, color, topSpin(b));
        const mat = material('belt') as THREE.MeshLambertMaterial;
        this.track(mat);
        this.texs.push(mat.map!);
        const mesh = new THREE.Mesh(this.trackGeo(one.geometry()), mat);
        mesh.receiveShadow = true;
        this.group.add(mesh);
        this.belts.push({ mat, speed: Math.hypot(...b.push!) });
        return;
      }
      batch.add(b.x, b.y, b.z, b.w, b.h, b.d, color, topSpin(b));
    });
    for (const [look, batch] of batches) {
      if (batch.empty) continue;
      const mat = material(look);
      this.track(mat);
      if (look === 'lava') {
        this.lavaMats.push(mat as THREE.MeshBasicMaterial);
        this.texs.push((mat as THREE.MeshBasicMaterial).map!);
      }
      const mesh = new THREE.Mesh(this.trackGeo(batch.geometry()), mat);
      mesh.castShadow = look !== 'lava';
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }

    // Checkpoint flags: grey until you reach them, then green.
    level.blocks.forEach((b, i) => {
      if (b.kind !== 'checkpoint') return;
      const top = b.y + b.h / 2;
      const pole = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.12, 2.6, 0.12)), this.track(new THREE.MeshLambertMaterial({ color: 0xf1f3f5 })));
      pole.position.set(b.x - b.w / 2 + 0.4, top + 1.3, b.z - b.d / 2 + 0.4);
      const flag = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.06, 0.6, 0.9)), this.track(new THREE.MeshLambertMaterial({ color: 0xadb5bd })));
      flag.position.set(pole.position.x, top + 2.25, pole.position.z + 0.5);
      pole.castShadow = flag.castShadow = true;
      this.group.add(pole, flag);
      this.flags.push({ index: i, flag });
    });

    // Portals: a swirling doorway, with the obby's name above it (and a ⭐ once finished).
    level.blocks.forEach((b) => {
      if (b.kind !== 'portal') return;
      const tex = portalTex();
      tex.center.set(0.5, 0.5);
      this.texs.push(tex);
      const mat = this.track(new THREE.MeshBasicMaterial({ map: tex, color: b.color, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
      const across = b.d > b.w; // doorways in a wall facing east or west
      const mesh = new THREE.Mesh(this.trackGeo(new THREE.PlaneGeometry(across ? b.d : b.w, b.h)), mat);
      mesh.position.set(b.x, b.y, b.z);
      if (across) mesh.rotation.y = Math.PI / 2;
      this.group.add(mesh);
      this.portals.push({ mesh, tex });
      const target = LEVELS[b.level!];
      const star = done.includes(target.id) ? ' ⭐' : '';
      const label = sprite(`${target.emoji} ${target.name}${star}`, b.color, 1.1);
      label.position.set(b.x, b.y + b.h / 2 + 1.6, b.z);
      this.group.add(label);
      this.trackSprite(label);
    });

    // The shop's sign.
    for (const b of level.blocks) {
      if (b.kind !== 'shop') continue;
      const label = sprite('👕 Dress-Up Shop', '#e23d8f', 1.1);
      label.position.set(b.x + 0.5, 4.6, b.z);
      this.group.add(label);
      this.trackSprite(label);
    }

    // Searchlights: a pool of light on the ground and a faint beam.
    level.blocks.forEach((b, i) => {
      if (b.kind !== 'spot') return;
      const g = new THREE.Group();
      const r = Math.max(b.w, b.d) / 2 + 0.1;
      const pool = new THREE.Mesh(
        this.trackGeo(new THREE.CircleGeometry(r, 28).rotateX(-Math.PI / 2)),
        this.track(new THREE.MeshBasicMaterial({ color: 0xfff3a0, transparent: true, opacity: 0.75, depthWrite: false })),
      );
      pool.position.y = -b.h / 2 + 0.03;
      const beam = new THREE.Mesh(
        this.trackGeo(new THREE.CylinderGeometry(r * 0.35, r, 14, 20, 1, true)),
        this.track(new THREE.MeshBasicMaterial({ color: 0xfff3a0, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide })),
      );
      beam.position.y = -b.h / 2 + 7;
      g.add(pool, beam);
      g.position.set(b.x, b.y, b.z);
      this.group.add(g);
      this.loose.set(i, g as unknown as THREE.Mesh);
    });

    // Keys: spinning, in their colour.
    for (const k of level.keys ?? []) {
      const g = new THREE.Group();
      const m = this.track(new THREE.MeshLambertMaterial({ color: k.color, emissive: new THREE.Color(k.color).multiplyScalar(0.35) }));
      for (const [w, h, x, y] of [[0.5, 0.5, 0, 0.35], [0.14, 0.75, 0, -0.2], [0.22, 0.1, 0.14, -0.45], [0.18, 0.1, 0.12, -0.25]]) {
        const part = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(w, h, 0.12)), m);
        part.position.set(x, y, 0);
        part.castShadow = true;
        g.add(part);
      }
      const hole = new THREE.Mesh(this.trackGeo(new THREE.BoxGeometry(0.2, 0.2, 0.14)), this.track(new THREE.MeshBasicMaterial({ color: 0x222222 })));
      hole.position.y = 0.35;
      g.add(hole);
      g.position.set(...k.at);
      this.group.add(g);
      this.keys.push(g);
    }

    // Signs.
    for (const s of level.signs ?? []) {
      const label = sprite(s.text, s.color, s.size ?? 1);
      label.position.set(...s.at);
      this.group.add(label);
      this.trackSprite(label);
    }

    // The finish: a big trophy floating over the pad.
    for (const b of level.blocks) {
      if (b.kind !== 'finish') continue;
      const label = sprite('🏆 FINISH 🏆', '#f59f00', 1.4);
      label.position.set(b.x, b.y + b.h / 2 + 4, b.z);
      this.group.add(label);
      this.trackSprite(label);
    }

    // Coins.
    if (level.coins.length) {
      const geo = this.trackGeo(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 20).rotateX(Math.PI / 2));
      const mat = this.track(new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x6b4a00 }));
      this.coins = new THREE.InstancedMesh(geo, mat, level.coins.length);
      this.coins.castShadow = true;
      this.group.add(this.coins);
    }

    this.addScenery();
  }

  /** Water around the hub; clouds everywhere. */
  private addScenery() {
    const color = new THREE.Color();
    if (this.level.id === 'hub') {
      const water = new THREE.Mesh(
        this.trackGeo(new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2)),
        this.track(new THREE.MeshLambertMaterial({ color: 0x3fa7e0 })),
      );
      water.position.y = -5;
      water.receiveShadow = true;
      this.group.add(water);
    }
    // Puffy blocky clouds around and below the course.
    const clouds = new BoxBatch();
    color.set('#ffffff');
    const bounds = new THREE.Box3();
    for (const b of this.level.blocks) bounds.expandByPoint(new THREE.Vector3(b.x, b.y, b.z));
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i++) {
      const cx = bounds.min.x - 60 + rnd() * (bounds.max.x - bounds.min.x + 120);
      const cz = bounds.min.z - 60 + rnd() * (bounds.max.z - bounds.min.z + 120);
      const below = this.level.id !== 'hub' && i % 2 === 0;
      const cy = below ? -14 - rnd() * 8 : 22 + rnd() * 18;
      // Keep clouds off the course itself.
      if (Math.abs(cx - (bounds.min.x + bounds.max.x) / 2) < 16 && cz > bounds.min.z - 10 && cz < bounds.max.z + 10 && !below) continue;
      const n = 2 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) {
        clouds.add(cx + k * 3 - n, cy + (k % 2) * 1.2, cz + (rnd() - 0.5) * 3, 4 + rnd() * 3, 2 + rnd(), 3 + rnd() * 2, color);
      }
    }
    const mesh = new THREE.Mesh(this.trackGeo(clouds.geometry()), this.track(new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x666666 })));
    this.group.add(mesh);
  }

  /** Bring moving parts up to date with the sim. */
  update(sim: Sim, time: number, dt: number) {
    for (const [i, mesh] of this.loose) {
      const c = sim.at[i];
      mesh.position.set(c[0], c[1], c[2]);
      if (this.level.blocks[i].kind === 'vanish') {
        const f = sim.fade(i);
        mesh.visible = sim.present(i);
        const mat = mesh.material as THREE.MeshLambertMaterial;
        mat.opacity = 1 - f * 0.75;
        // A little wobble while it's about to go.
        mesh.position.x += f > 0 && f < 1 ? Math.sin(time * 60) * 0.05 : 0;
      }
    }
    if (this.coins) {
      this.level.coins.forEach((c, i) => {
        this.dummy.position.set(c[0], c[1] + Math.sin(time * 2 + i) * 0.15, c[2]);
        this.dummy.rotation.set(0, time * 2.5 + i, 0);
        this.dummy.scale.setScalar(sim.coinTaken[i] ? 0 : 1);
        this.dummy.updateMatrix();
        this.coins!.setMatrixAt(i, this.dummy.matrix);
      });
      this.coins.instanceMatrix.needsUpdate = true;
    }
    for (const p of this.portals) p.tex.rotation = -time * 1.5;
    this.keys.forEach((k, i) => {
      k.visible = !sim.keyTaken[i];
      k.rotation.y = time * 2.5;
      k.position.y = this.level.keys![i].at[1] + Math.sin(time * 2 + i) * 0.15;
    });
    // Doors slide up into the ceiling once opened.
    for (const [i, open] of this.doors) {
      const o = sim.opened.has(i) ? Math.min(1, open + dt * 1.5) : 0;
      this.doors.set(i, o);
      const b = this.level.blocks[i];
      const mesh = this.loose.get(i)!;
      mesh.position.y = b.y + o * (b.h - 0.2);
      mesh.scale.y = 1 - o * 0.9;
      mesh.visible = o < 1;
    }
    for (const m of this.lavaMats) m.map!.offset.set(time * 0.05, time * 0.08);
    for (const b of this.belts) b.mat.map!.offset.y = (b.mat.map!.offset.y + b.speed * dt) % 1;
    const cp = sim.checkpoint;
    if (cp !== this.lastCheckpoint) {
      this.lastCheckpoint = cp;
      for (const f of this.flags) {
        const b = this.level.blocks[f.index];
        const on = Math.abs(cp[0] - b.x) < 0.01 && Math.abs(cp[2] - b.z) < 0.01;
        (f.flag.material as THREE.MeshLambertMaterial).color.set(on ? 0x40c057 : 0xadb5bd);
      }
    }
  }

  dispose() {
    for (const m of this.mats) m.dispose();
    for (const g of this.geos) g.dispose();
    for (const t of this.texs) t.dispose();
    this.group.removeFromParent();
  }

  private track<M extends THREE.Material>(m: M): M {
    this.mats.push(m);
    return m;
  }
  private trackGeo<G extends THREE.BufferGeometry>(g: G): G {
    this.geos.push(g);
    return g;
  }
  private trackSprite(s: THREE.Sprite) {
    this.mats.push(s.material);
    this.texs.push(s.material.map!);
  }
}
