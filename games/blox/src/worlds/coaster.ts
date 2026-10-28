// Coaster Park: walk up to a ride's platform and tap Ride. The trains go round on their own with other
// riders; when you ride, a quick white flash puts you in the front car. Rides are just for fun (and a few
// coins the first time). Track maths is in sim/coaster.ts.
import * as THREE from 'three';
import { COASTERS, Ride, Track, WHEEL_TIME, type CoasterDef, type TrackPoint } from '../sim/coaster';
import type { V3 } from '../sim/types';
import type { Rig } from '../view/avatar';
import { BoxBatch } from '../../../../shared/boxes';
import { sfx } from '../ui/sfx';
import type { Action, Activity, CamView, WorldCtx } from './activity';
import { randomRider, sit } from './npc';

const CARS = 3;
const CAR_GAP = 2.4;
const STATION_WAIT = 6; // trains wait this long in the station between laps (s)
const FIRST_RIDE_COINS = 5;
const ALL_RIDES_BONUS = 20;

interface Coaster {
  def: CoasterDef;
  track: Track;
  cars: THREE.Group[];
  rider: Rig;
  ride: Ride | null;
  wait: number;
}

const V = (a: V3) => new THREE.Vector3(a[0], a[1], a[2]);
const tmpM = new THREE.Matrix4();

/** Puts an object on the track: facing along it, with its up the track's up. */
function orient(o: THREE.Object3D, tp: TrackPoint, lift = 0) {
  const t = V(tp.t), up = V(tp.up);
  const x = new THREE.Vector3().crossVectors(up, t).normalize();
  tmpM.makeBasis(x, up, t);
  o.quaternion.setFromRotationMatrix(tmpM);
  o.position.copy(V(tp.p)).addScaledVector(up, lift);
}

export class CoasterWorld implements Activity {
  private group = new THREE.Group();
  private coasters: Coaster[] = [];
  private wheel: THREE.Group;
  private gondolas: THREE.Object3D[] = [];
  private wheelAngle = 0;
  private wheelRider: Rig;
  /** What you're riding (null = walking). */
  private riding: Coaster | 'wheel' | null = null;
  private wheelStart = 0;
  private pov = false;
  private lastClack = 0;
  private disposables: { dispose(): void }[] = [];
  private camPos = new THREE.Vector3();
  private camUp = new THREE.Vector3(0, 1, 0);
  /** One material for everything drawn as merged boxes with their own colours. */
  private vmat = this.mat('#ffffff', true);

  constructor(private ctx: WorldCtx) {
    ctx.scene.add(this.group);
    for (const def of COASTERS) {
      if (def.kind !== 'coaster') continue;
      const track = new Track(def);
      this.buildTrack(track);
      const cars: THREE.Group[] = [];
      for (let i = 0; i < CARS; i++) cars.push(this.buildCar(def.color, i === 0));
      const rider = randomRider();
      this.group.add(rider.root);
      this.coasters.push({ def, track, cars, rider, ride: null, wait: Math.random() * STATION_WAIT });
    }
    this.wheel = this.buildWheel(COASTERS.find((c) => c.kind === 'wheel')!);
    this.wheelRider = randomRider();
    this.group.add(this.wheelRider.root);
  }

  // ---------------------------------------------------------------- building the rides

  private mat(color: string | number, vertexColors = false) {
    const m = new THREE.MeshLambertMaterial({ color, vertexColors });
    this.disposables.push(m);
    return m;
  }

  private geo<G extends THREE.BufferGeometry>(g: G): G {
    this.disposables.push(g);
    return g;
  }

  private buildTrack(track: Track) {
    const { def } = track;
    const step = 4; // every metre
    const n = Math.floor(track.pts.length / step);
    const rail = (side: number, drop: number) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i < n; i++) {
        const k = i * step;
        const t = V(track.fwd[k]), up = V(track.up[k]);
        const x = new THREE.Vector3().crossVectors(up, t).normalize();
        pts.push(V(track.pts[k]).addScaledVector(x, side).addScaledVector(up, -drop));
      }
      return new THREE.CatmullRomCurve3(pts, true);
    };
    const railMat = this.mat(def.rail);
    for (const side of [-0.55, 0.55]) {
      const m = new THREE.Mesh(this.geo(new THREE.TubeGeometry(rail(side, 0), n * 2, 0.11, 5, true)), railMat);
      m.castShadow = true;
      this.group.add(m);
    }
    const spine = new THREE.Mesh(this.geo(new THREE.TubeGeometry(rail(0, 0.35), n * 2, 0.2, 6, true)), railMat);
    spine.castShadow = true;
    this.group.add(spine);

    // Cross ties every metre.
    const ties = new THREE.InstancedMesh(this.geo(new THREE.BoxGeometry(1.3, 0.1, 0.22)), this.mat('#495057'), n);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < n; i++) {
      orient(dummy, track.at(i * step * 0.25), -0.12);
      dummy.updateMatrix();
      ties.setMatrixAt(i, dummy.matrix);
    }
    this.group.add(ties);

    // Supports down to the ground, where the track is the right way up and off the ground.
    const legs: THREE.Matrix4[] = [];
    for (let s = 0; s < track.length; s += 5) {
      const tp = track.at(s);
      const bottom = tp.p[1] - 0.45;
      if (tp.up[1] < 0.6 || bottom < 1.2) continue;
      dummy.position.set(tp.p[0], bottom / 2, tp.p[2]);
      dummy.quaternion.identity();
      dummy.scale.set(1, bottom, 1);
      dummy.updateMatrix();
      legs.push(dummy.matrix.clone());
    }
    const sup = new THREE.InstancedMesh(this.geo(new THREE.BoxGeometry(0.35, 1, 0.35)), this.mat('#dee2e6'), Math.max(1, legs.length));
    legs.forEach((m, i) => sup.setMatrixAt(i, m));
    sup.count = legs.length;
    sup.castShadow = true;
    this.group.add(sup);
  }

  /** A car: all its boxes merged into one mesh (fewer things for the iPad to draw). */
  private buildCar(color: string, front: boolean) {
    const b = new BoxBatch();
    const c = new THREE.Color(color), black = new THREE.Color('#212529');
    b.add(0, 0.2, 0, 1.5, 0.25, 2, c); // floor
    b.add(0.72, 0.6, 0, 0.12, 0.6, 2, c); // sides
    b.add(-0.72, 0.6, 0, 0.12, 0.6, 2, c);
    b.add(0, 0.6, -0.95, 1.5, 0.6, 0.12, c); // back
    b.add(0, front ? 0.8 : 0.6, 0.95, 1.5, front ? 1 : 0.6, 0.15, c); // front (taller on the first car)
    for (const [x, z] of [[0.55, 0.6], [-0.55, 0.6], [0.55, -0.6], [-0.55, -0.6]]) b.add(x, 0, z, 0.3, 0.2, 0.3, black); // wheels
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(this.geo(b.geometry()), this.vmat);
    mesh.castShadow = true;
    g.add(mesh);
    this.group.add(g);
    return g;
  }

  private buildWheel(def: CoasterDef) {
    const [cx, cy, cz] = def.centre!, r = def.radius!;
    const wheel = new THREE.Group();
    wheel.position.set(cx, cy, cz);
    const white = this.mat('#ffffff'), blue = this.mat(def.color);
    const spokes = new THREE.InstancedMesh(this.geo(new THREE.BoxGeometry(0.15, r, 0.15)), white, 24);
    const dummy = new THREE.Object3D();
    for (const [n, z] of [-1.3, 1.3].entries()) {
      const rim = new THREE.Mesh(this.geo(new THREE.TorusGeometry(r, 0.25, 6, 48)), blue);
      rim.position.z = z;
      wheel.add(rim);
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        dummy.position.set(Math.sin(a) * r * 0.5, -Math.cos(a) * r * 0.5, z);
        dummy.rotation.set(0, 0, a);
        dummy.updateMatrix();
        spokes.setMatrixAt(n * 12 + k, dummy.matrix);
      }
    }
    wheel.add(spokes);
    const hub = new THREE.Mesh(this.geo(new THREE.CylinderGeometry(0.8, 0.8, 3.2, 12).rotateX(Math.PI / 2)), this.mat('#ffd43b'));
    wheel.add(hub);
    this.group.add(wheel);
    // Legs (they don't turn).
    for (const z of [-2.2, 2.2]) for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(this.geo(new THREE.BoxGeometry(0.5, cy / Math.cos(0.3), 0.5)), white);
      leg.position.set(cx + s * Math.tan(0.3) * cy * 0.5, cy / 2, cz + z);
      leg.rotation.z = -s * 0.3;
      leg.castShadow = true;
      this.group.add(leg);
    }
    // Gondolas: they hang straight down however the wheel turns.
    const colors = ['#ff6b6b', '#ffd43b', '#69db7c', '#4dabf7', '#b197fc', '#ff922b'];
    for (let k = 0; k < 12; k++) {
      const b = new BoxBatch();
      const c = new THREE.Color(colors[k % colors.length]), w = new THREE.Color('#ffffff');
      b.add(0, -2, 0, 2, 0.2, 2, c); // floor
      b.add(0, -1.6, 0, 2, 0.7, 0.1, c);
      b.add(0, -0.9, 0, 0.1, 2.2, 0.1, w);
      b.add(0, 0.2, 0, 2.2, 0.2, 2.2, c); // roof
      const g = new THREE.Mesh(this.geo(b.geometry()), this.vmat);
      g.castShadow = true;
      this.group.add(g);
      this.gondolas.push(g);
    }
    return wheel;
  }

  // ---------------------------------------------------------------- riding

  private zoneRide(): CoasterDef | null {
    for (const z of this.ctx.sim().zones) {
      if (z.startsWith('ride:')) return COASTERS.find((c) => `ride:${c.id}` === z) ?? null;
    }
    return null;
  }

  actions(): Action[] {
    if (this.riding) {
      return this.riding === 'wheel' ? [] : [{ label: this.pov ? '🎥 Watch me' : '👀 My eyes', run: () => (this.pov = !this.pov), color: '#2f7de1' }];
    }
    const def = this.zoneRide();
    if (!def) return [];
    return [{ label: `${def.emoji} Ride!`, run: () => this.board(def), color: def.color === '#ffd43b' ? '#f08c00' : def.color }];
  }

  private board(def: CoasterDef) {
    this.ctx.ui.fade(() => {
      if (def.kind === 'wheel') {
        this.riding = 'wheel';
        this.wheelAngle = 0;
        this.wheelStart = 0;
      } else {
        const c = this.coasters.find((k) => k.def === def)!;
        c.ride = new Ride(c.track);
        c.wait = 0;
        this.riding = c;
        this.camPos.set(0, 0, 0);
      }
      this.ctx.ui.levelCard(`${def.emoji} ${def.name}`);
    });
  }

  private getOff(def: CoasterDef) {
    this.riding = null;
    const s = this.ctx.save;
    const key = `ride:${def.id}`;
    const first = !s.stats[key];
    s.stats[key] = (s.stats[key] ?? 0) + 1;
    this.ctx.persist();
    if (first) {
      this.ctx.addCoins(FIRST_RIDE_COINS);
      this.ctx.ui.toast(`🎉 First ride! +${FIRST_RIDE_COINS} 🪙`, 2000);
    } else this.ctx.ui.toast(['🤩 Wheee!', '🎉 Again! Again!', '😄 That was awesome!'][Math.floor(Math.random() * 3)]);
    if (first && COASTERS.every((c) => s.stats[`ride:${c.id}`]) && !s.done.includes('coaster')) {
      this.ctx.complete('coaster');
      this.ctx.addCoins(ALL_RIDES_BONUS);
      const p = this.ctx.sim().pos;
      this.ctx.confetti([p[0], p[1] + 2, p[2]]);
      setTimeout(() => this.ctx.ui.toast(`⭐ You rode every ride! +${ALL_RIDES_BONUS} 🪙`, 3000), 2100);
    }
  }

  update(dt: number, t: number) {
    for (const c of this.coasters) {
      if (c.ride) {
        c.ride.step(dt);
        if (this.riding === c && c.track.lift(c.ride.s) && t - this.lastClack > 0.28) {
          this.lastClack = t;
          sfx.click();
        }
        if (c.ride.done) {
          c.ride = null;
          c.wait = STATION_WAIT;
          if (this.riding === c) this.getOff(c.def);
        }
      } else if ((c.wait -= dt) <= 0) c.ride = new Ride(c.track);
      const s = c.ride ? c.ride.s : c.track.start;
      c.cars.forEach((car, i) => orient(car, c.track.at(s - i * CAR_GAP), 0.25));
      // The other rider sits in the back car.
      orient(c.rider.root, c.track.at(s - (CARS - 1) * CAR_GAP), 0.3);
      sit(c.rider, !!c.ride && c.ride.v > 11);
    }
    // The wheel turns all the time; one go is once round.
    this.wheelAngle += (dt * Math.PI * 2) / WHEEL_TIME;
    if (this.riding === 'wheel') {
      this.wheelStart += dt;
      if (this.wheelStart >= WHEEL_TIME) this.getOff(COASTERS.find((c) => c.kind === 'wheel')!);
    }
    this.wheel.rotation.z = this.wheelAngle;
    const def = COASTERS.find((c) => c.kind === 'wheel')!;
    this.gondolas.forEach((g, k) => g.position.copy(this.gondolaAt(def, k)));
    this.wheelRider.root.position.copy(this.gondolaAt(def, 6)).y -= 1.9;
    sit(this.wheelRider);
  }

  private gondolaAt(def: CoasterDef, k: number) {
    const a = this.wheelAngle + (k / 12) * Math.PI * 2;
    const [cx, cy, cz] = def.centre!;
    return new THREE.Vector3(cx + Math.sin(a) * def.radius!, cy - Math.cos(a) * def.radius!, cz);
  }

  locked() {
    return this.riding !== null;
  }

  pose(rig: Rig) {
    if (!this.riding) return false;
    if (this.riding === 'wheel') {
      const def = COASTERS.find((c) => c.kind === 'wheel')!;
      rig.root.position.copy(this.gondolaAt(def, 0)).y -= 1.9;
      rig.root.rotation.set(0, 0, 0);
      sit(rig);
      return true;
    }
    const c = this.riding;
    const s = c.ride ? c.ride.s : c.track.start;
    orient(rig.root, c.track.at(s), 0.3);
    rig.root.scale.set(1, 1, 1);
    const tp = c.track.at(s);
    sit(rig, !!c.ride && c.ride.v > 9 && tp.t[1] < -0.2);
    return true;
  }

  camera(cam: THREE.PerspectiveCamera, view: CamView, dt: number) {
    if (!this.riding) return false;
    if (this.riding === 'wheel') {
      // Look around from the gondola: drag to turn, like walking.
      const def = COASTERS.find((c) => c.kind === 'wheel')!;
      const p = this.gondolaAt(def, 0);
      p.y -= 0.6;
      const d = Math.min(view.dist, 6);
      cam.position.set(p.x - Math.sin(view.yaw) * d * Math.cos(view.pitch), p.y + d * Math.sin(view.pitch), p.z - Math.cos(view.yaw) * d * Math.cos(view.pitch));
      cam.lookAt(p);
      return true;
    }
    const c = this.riding;
    const s = c.ride ? c.ride.s : c.track.start;
    const tp = c.track.at(s);
    const p = V(tp.p), t = V(tp.t), up = V(tp.up);
    let want: THREE.Vector3, look: THREE.Vector3;
    if (this.pov) {
      want = p.clone().addScaledVector(up, 1.9).addScaledVector(t, 0.3);
      const ahead = c.track.at(s + 8);
      look = V(ahead.p).addScaledVector(V(ahead.up), 1.5);
    } else {
      const back = c.track.at(s - 8);
      want = V(back.p).addScaledVector(V(back.up), 4);
      look = p.clone().addScaledVector(up, 1.2).addScaledVector(t, 3);
    }
    const k = this.camPos.lengthSq() === 0 ? 1 : Math.min(1, dt * (this.pov ? 30 : 6));
    this.camPos.lerp(want, k);
    this.camUp.lerp(up, Math.min(1, dt * 4)).normalize();
    cam.position.copy(this.camPos);
    cam.up.copy(this.camUp);
    cam.lookAt(look);
    return true;
  }

  dispose() {
    for (const c of this.coasters) c.rider.dispose();
    this.wheelRider.dispose();
    for (const d of this.disposables) d.dispose();
    this.group.removeFromParent();
  }
}
