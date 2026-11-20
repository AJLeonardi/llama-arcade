// Builds a level in three.js and keeps it in step with the Sim. Still blocks are merged into one mesh per look
// (few draw calls for the old iPad); speed walls are their own meshes, so they can vanish when smashed.
import * as THREE from 'three';
import { BoxBatch } from '../../../../shared/boxes';
import { beltTex, checkerTex, gooTex, tileTex } from '../../../../shared/textures';
import { boulderZ, FLOOR_KEY, slideX, type Sim } from '../sim/physics';
import type { Block, Level } from '../sim/types';
import { boulderTex, crateTex, keyTopsTex, lettersTex } from './textures';

/** How tall the raised keys are (they're only drawn: the floor you run on is flat). */
const CAP = 0.28;

type Look = 'tile' | 'goo' | 'belt' | 'finish' | 'crate' | `kb:${string}`;

function lookOf(b: Block): Look {
  if (b.keyboard) return `kb:${b.keyboard.join()}`;
  if (b.finish) return 'finish';
  if (b.crate) return 'crate';
  if (b.kind === 'goo') return 'goo';
  if (b.kind === 'treadmill') return 'belt';
  return 'tile';
}

export class WorldView {
  readonly group = new THREE.Group();
  private readonly owned: { dispose(): void }[] = [];
  private readonly walls: { mesh: THREE.Object3D; i: number }[] = [];
  private readonly signs: { mesh: THREE.Object3D; i: number }[] = [];
  private readonly sliders: { mesh: THREE.Object3D; b: Block }[] = [];
  private readonly boulders: THREE.Mesh[] = [];
  private readonly gooMap: THREE.Texture;
  private readonly beltMap: THREE.Texture;

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
      crate: own(new THREE.MeshLambertMaterial({ vertexColors: true, map: crateTex() })),
    };

    let slideMat: THREE.Material | undefined; // sliding goo (its own meshes, so no vertex colours)
    const batches = new Map<Look, BoxBatch>();
    const color = new THREE.Color();
    level.blocks.forEach((b, i) => {
      if (b.hidden) return;
      if (b.kind === 'wall') {
        const m = new THREE.Mesh(
          own(new THREE.BoxGeometry(b.w, b.h, b.d)),
          own(new THREE.MeshLambertMaterial({ color: b.color, emissive: b.color, emissiveIntensity: 0.25 })),
        );
        m.position.set(b.x, b.y, b.z);
        m.castShadow = m.receiveShadow = true;
        this.group.add(m);
        this.walls.push({ mesh: m, i });
        return;
      }
      if (b.slide) {
        slideMat ??= own(new THREE.MeshLambertMaterial({ color: b.color, map: this.gooMap, emissive: 0x224400 }));
        const m = new THREE.Mesh(own(new THREE.BoxGeometry(b.w, b.h, b.d)), slideMat);
        m.position.set(b.x, b.y, b.z);
        m.castShadow = true;
        this.group.add(m);
        this.sliders.push({ mesh: m, b });
        return;
      }
      const batch = (look: Look) => {
        let bb = batches.get(look);
        if (!bb) batches.set(look, (bb = new BoxBatch()));
        return bb;
      };
      if (b.keyboard) {
        this.keyCaps(b, batch(lookOf(b)), batch('tile'), color);
        return;
      }
      // Treadmill tops are turned round so the arrows point back, the way the belt goes.
      batch(lookOf(b)).add(b.x, b.y, b.z, b.w, b.h, b.d, color.set(b.color), b.kind === 'treadmill' ? Math.PI : 0);
    });
    for (const [look, batch] of batches) {
      if (!mats[look] && look.startsWith('kb:')) {
        mats[look] = own(new THREE.MeshLambertMaterial({ vertexColors: true, map: keyTopsTex(look.slice(3).split(','), FLOOR_KEY) }));
      }
      const m = new THREE.Mesh(own(batch.geometry()), mats[look]);
      m.receiveShadow = true;
      m.castShadow = look === 'tile';
      this.group.add(m);
    }

    const ballMat = own(new THREE.MeshLambertMaterial({ map: boulderTex() }));
    for (const b of level.boulders) {
      const m = new THREE.Mesh(own(new THREE.SphereGeometry(b.r, 18, 12)), ballMat);
      m.castShadow = true;
      m.position.set(b.x, b.r, b.z0);
      this.group.add(m);
      this.boulders.push(m);
    }

    for (const s of level.signs) {
      const { tex, aspect } = lettersTex(s.text, s.colors);
      own(tex);
      const m = new THREE.Mesh(
        own(new THREE.PlaneGeometry(s.size * aspect, s.size * 1.25)),
        own(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })),
      );
      m.position.set(...s.at);
      m.rotation.y = s.yaw;
      this.group.add(m);
      if (s.block !== undefined) this.signs.push({ mesh: m, i: s.block });
    }
  }

  /**
   * A keyboard floor drawn as real raised keys: a dark base sunk below the floor, and on it one key per
   * FLOOR_KEY square (one box each, to keep it light for the old iPad). Only for looks: the floor you run on is
   * still flat at the key tops (y = top of the block), so the grooves between keys can't trip you.
   */
  private keyCaps(b: Block, kb: BoxBatch, tile: BoxBatch, color: THREE.Color) {
    const top = b.y + b.h / 2;
    const x0 = b.x - b.w / 2, x1 = b.x + b.w / 2, z0 = b.z - b.d / 2, z1 = b.z + b.d / 2;
    const span = (lo: number, hi: number, a: number, c: number) => [Math.max(lo, a), Math.min(hi, c)] as const;
    tile.add(b.x, b.y - CAP / 2, b.z, b.w, b.h - CAP, b.d, color.set('#2b2350'));
    for (let kx = Math.floor(x0 / FLOOR_KEY) * FLOOR_KEY; kx < x1; kx += FLOOR_KEY) {
      for (let kz = Math.floor(z0 / FLOOR_KEY) * FLOOR_KEY; kz < z1; kz += FLOOR_KEY) {
        const inset = 0.1;
        const [ax, bx] = span(x0, x1, kx + inset, kx + FLOOR_KEY - inset);
        const [az, bz] = span(z0, z1, kz + inset, kz + FLOOR_KEY - inset);
        if (bx - ax < 0.05 || bz - az < 0.05) continue;
        kb.add((ax + bx) / 2, top - CAP / 2, (az + bz) / 2, bx - ax, CAP, bz - az, color.set('#ffffff'));
      }
    }
  }

  update(sim: Sim, t: number, dt: number) {
    this.gooMap.offset.set(t * 0.03, t * 0.02);
    // The belts move back (-z) as fast as they'd carry you. Their tops are turned round, so a bigger offset
    // slides the picture towards -z. Very fast belts would just flicker, so they're drawn at most this fast.
    const mill = this.level.blocks.find((b) => b.kind === 'treadmill');
    if (mill) this.beltMap.offset.y = (this.beltMap.offset.y + Math.min(40, sim.beltSpeed(mill)) * dt) % 1;
    for (const w of this.walls) w.mesh.visible = !sim.smashed.has(w.i);
    for (const s of this.signs) s.mesh.visible = !sim.smashed.has(s.i);
    for (const s of this.sliders) s.mesh.position.x = slideX(s.b, sim.t);
    this.level.boulders.forEach((b, k) => {
      const z = boulderZ(b, sim.t);
      const m = this.boulders[k];
      m.visible = z !== null;
      if (z !== null) {
        m.position.z = z;
        m.rotation.x = -(z / b.r); // rolling towards you
      }
    });
  }

  dispose() {
    this.group.removeFromParent();
    this.owned.forEach((o) => o.dispose());
  }
}
