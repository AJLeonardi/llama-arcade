// Builds a level in three.js and keeps it in step with the Sim. Still blocks are merged into one mesh per look
// (few draw calls for the old iPad); moving blocks, keyboard keys and doors are their own meshes.
import * as THREE from 'three';
import { BoxBatch } from '../../../../shared/boxes';
import { beltTex, checkerTex, gooTex, tileTex } from '../../../../shared/textures';
import { boulderZ, type Sim } from '../sim/physics';
import type { Block, Level } from '../sim/types';
import { animate, buildPerson, CHASER, type Rig } from './avatar';
import { FLOOR_KEY } from '../sim/physics';
import { boulderTex, keyboardTex, keyTex, lettersTex, logTex, poopTex } from './textures';

type Look = 'tile' | 'goo' | 'belt' | 'finish' | 'log' | `kb:${string}`;

/** One box as a geometry centred on 0, with world-sized UVs (for moving keyboard platforms). */
function one(b: Block) {
  const batch = new BoxBatch();
  batch.add(0, 0, 0, b.w, b.h, b.d, new THREE.Color('#ffffff'));
  return batch.geometry();
}

function lookOf(b: Block): Look {
  if (b.keyboard) return `kb:${b.keyboard.join()}`;
  if (b.log) return 'log';
  if (b.kind === 'goo') return 'goo';
  if (b.kind === 'treadmill') return 'belt';
  if (b.kind === 'finish') return 'finish';
  return 'tile';
}

export class WorldView {
  readonly group = new THREE.Group();
  private readonly owned: { dispose(): void }[] = [];
  private readonly movers: { mesh: THREE.Mesh; i: number }[] = [];
  private readonly keys: { mesh: THREE.Mesh; i: number; y: number }[] = [];
  private readonly doors: { mesh: THREE.Mesh; level: number }[] = [];
  private readonly chasers: Rig[] = [];
  private readonly boulders: THREE.Mesh[] = [];
  private readonly poops: THREE.Mesh[] = [];
  private cape: THREE.Group | null = null;
  private readonly gooMap: THREE.Texture;
  private readonly beltMap: THREE.Texture;
  private readonly doorOpen: THREE.Material;
  private readonly doorShut: THREE.Material;

  constructor(private readonly level: Level) {
    const own = <T extends { dispose(): void }>(x: T) => (this.owned.push(x), x);
    this.gooMap = own(gooTex().clone());
    this.gooMap.needsUpdate = true;
    this.beltMap = own(beltTex().clone());
    this.beltMap.needsUpdate = true;
    const mats: Record<string, THREE.Material> = {
      tile: own(new THREE.MeshLambertMaterial({ vertexColors: true, map: tileTex() })),
      goo: own(new THREE.MeshLambertMaterial({ vertexColors: true, map: this.gooMap, emissive: 0x224400 })),
      belt: own(new THREE.MeshLambertMaterial({ vertexColors: true, map: this.beltMap })),
      finish: own(new THREE.MeshLambertMaterial({ vertexColors: true, map: checkerTex() })),
      log: own(new THREE.MeshLambertMaterial({ vertexColors: true, map: logTex(), emissive: 0x3a2a00 })),
    };
    this.doorOpen = own(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
    this.doorShut = own(new THREE.MeshLambertMaterial({ color: 0x6c5848 }));

    const batches = new Map<Look, BoxBatch>();
    const color = new THREE.Color();
    level.blocks.forEach((b, i) => {
      if (b.kind === 'zone') return;
      if (b.kind === 'cape') {
        this.cape = this.capeOnStand(b);
        return;
      }
      if (b.kind === 'door') {
        const m = new THREE.Mesh(own(new THREE.BoxGeometry(b.w, b.h, b.d * 0.3)), this.doorShut);
        m.position.set(b.x, b.y, b.z);
        this.group.add(m);
        this.doors.push({ mesh: m, level: b.level ?? 0 });
        return;
      }
      if (b.kind === 'key') {
        const side = own(new THREE.MeshLambertMaterial({ color: 0xe9ecef }));
        const top = own(new THREE.MeshLambertMaterial({ map: keyTex(b.letter ?? '') }));
        const m = new THREE.Mesh(own(new THREE.BoxGeometry(b.w, b.h, b.d)), [side, side, top, side, side, side]);
        m.position.set(b.x, b.y, b.z);
        m.receiveShadow = true;
        this.group.add(m);
        this.keys.push({ mesh: m, i, y: b.y });
        return;
      }
      if (b.move) {
        const look = lookOf(b);
        // Keyboard platforms get world-sized UVs like the still blocks, so their keys are the same size.
        const geo = b.keyboard ? one(b) : new THREE.BoxGeometry(b.w, b.h, b.d);
        const map = b.keyboard ? keyboardTex(b.keyboard, FLOOR_KEY) : look === 'log' ? logTex() : tileTex();
        const m = new THREE.Mesh(
          own(geo),
          own(new THREE.MeshLambertMaterial({ color: b.keyboard ? '#ffffff' : b.color, map, emissive: look === 'log' ? 0x3a2a00 : 0 })),
        );
        m.castShadow = m.receiveShadow = true;
        this.group.add(m);
        this.movers.push({ mesh: m, i });
        return;
      }
      const look = lookOf(b);
      let batch = batches.get(look);
      if (!batch) batches.set(look, (batch = new BoxBatch()));
      // Treadmill tops are turned round so the arrows point back, the way the belt goes.
      batch.add(b.x, b.y, b.z, b.w, b.h, b.d, color.set(b.keyboard ? '#ffffff' : b.color), b.kind === 'treadmill' ? Math.PI : 0);
    });
    for (const [look, batch] of batches) {
      if (!mats[look] && look.startsWith('kb:')) {
        mats[look] = own(new THREE.MeshLambertMaterial({ vertexColors: true, map: keyboardTex(look.slice(3).split(','), FLOOR_KEY) }));
      }
      const m = new THREE.Mesh(own(batch.geometry()), mats[look]);
      m.receiveShadow = true;
      m.castShadow = look === 'tile' || look === 'log';
      this.group.add(m);
    }

    for (const s of level.signs) {
      const { tex, aspect } = lettersTex(s.text, s.colors);
      own(tex);
      const m = new THREE.Mesh(
        own(new THREE.PlaneGeometry(s.size * aspect * 1.0, s.size * 1.25)),
        own(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })),
      );
      m.position.set(...s.at);
      m.rotation.y = s.yaw;
      this.group.add(m);
    }

    for (const c of level.chasers) {
      const rig = buildPerson(CHASER);
      rig.root.scale.setScalar(1.3);
      rig.root.position.set(...c.home);
      this.group.add(rig.root);
      this.chasers.push(rig);
    }

    const ballMat = own(new THREE.MeshLambertMaterial({ map: boulderTex() }));
    for (const b of level.boulders) {
      const m = new THREE.Mesh(own(new THREE.SphereGeometry(b.r, 20, 14)), ballMat);
      m.castShadow = true;
      m.position.set(b.x, b.y + b.r, b.z0);
      this.group.add(m);
      this.boulders.push(m);
    }

    const poopMap = own(poopTex().clone());
    poopMap.needsUpdate = true;
    poopMap.repeat.set(0.25, 0.25);
    const poopMat = own(new THREE.MeshLambertMaterial({ map: poopMap }));
    for (const p of level.poops) {
      const [x0, z0, x1, z1] = p.area;
      const g = own(new THREE.BoxGeometry(x1 - x0, 1, z1 - z0));
      g.translate(0, -0.5, 0); // top at y = 0, so scaling stretches it downwards
      const m = new THREE.Mesh(g, poopMat);
      m.position.set((x0 + x1) / 2, p.y0, (z0 + z1) / 2);
      this.group.add(m);
      this.poops.push(m);
    }
  }

  /** The cape floating above its stand, turning slowly. */
  private capeOnStand(b: Block) {
    const g = new THREE.Group();
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.5, 0.08), new THREE.MeshLambertMaterial({ color: 0xe03131, emissive: 0x330000 }));
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.14, 0.16), new THREE.MeshLambertMaterial({ color: 0xffd43b, emissive: 0x332200 }));
    bar.position.y = 0.75;
    g.add(cloth, bar);
    this.owned.push(cloth.geometry, bar.geometry, cloth.material as THREE.Material, bar.material as THREE.Material);
    g.position.set(b.x, b.y, b.z);
    this.group.add(g);
    return g;
  }

  update(sim: Sim, t: number, dt: number, playerAt: THREE.Vector3) {
    this.gooMap.offset.set(t * 0.03, t * 0.02);
    // The belts move back (-z) as fast as they'd carry you. Their tops are turned round, so v runs along +z,
    // and a bigger offset slides the picture towards -v (-z): the offset goes up.
    const mill = this.level.blocks.find((b) => b.kind === 'treadmill');
    if (mill) this.beltMap.offset.y = (this.beltMap.offset.y + sim.beltSpeed(mill) * dt) % 1;
    for (const { mesh, i } of this.movers) mesh.position.set(...sim.at[i]);
    for (const k of this.keys) {
      const down = sim.ground === k.i && sim.onGround ? -0.12 : 0;
      k.mesh.position.y += (k.y + down - k.mesh.position.y) * Math.min(1, dt * 20);
    }
    for (const d of this.doors) d.mesh.material = d.level <= sim.unlocked ? this.doorOpen : this.doorShut;
    if (this.cape) {
      this.cape.visible = !sim.cape;
      this.cape.rotation.y = t * 1.5;
      this.cape.position.y = this.level.blocks.find((b) => b.kind === 'cape')!.y + Math.sin(t * 2) * 0.15;
    }
    this.chasers.forEach((rig, k) => {
      const c = sim.chasers[k];
      const was = rig.root.position.clone();
      rig.root.position.set(...c.pos);
      const moved = rig.root.position.distanceTo(was) / Math.max(dt, 1e-3);
      rig.root.rotation.y = Math.atan2(playerAt.x - c.pos[0], playerAt.z - c.pos[2]);
      animate(rig, t, c.on ? moved : 0, false);
      rig.arms.forEach((a) => (a.rotation.x = c.on ? -1.4 : 0)); // arms out, to grab you
    });
    this.level.boulders.forEach((b, k) => {
      const z = boulderZ(b, sim.t);
      const m = this.boulders[k];
      m.visible = z !== null;
      if (z !== null) {
        m.position.z = z;
        m.rotation.x = -(z / b.r);
      }
    });
    this.level.poops.forEach((p, k) => {
      const y = sim.poops[k].y;
      const m = this.poops[k];
      m.visible = y > p.y0 + 0.01; // hidden until it starts rising
      m.position.y = y;
      m.scale.y = Math.max(0.01, y - p.y0 + 1);
    });
  }

  dispose() {
    this.group.removeFromParent();
    this.chasers.forEach((r) => r.dispose());
    this.owned.forEach((o) => o.dispose());
  }
}
