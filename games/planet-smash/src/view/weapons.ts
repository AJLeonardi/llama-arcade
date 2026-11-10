// What each weapon looks like on its way to the planet. Each one calls `shot.impact()` when it lands;
// main.ts does the damage and paints the crater.
import * as THREE from 'three';
import { Weapon, exitPoint } from '../sim/game';
import { Fx } from './fx';
import { Planet, CraterStyle } from './planet';
import { texture, softDot } from './textures';
import { sfx } from '../sfx';

export interface Shot {
  weapon: Weapon;
  planet: Planet;
  /** Where it hits, in the planet's own space (a point on the ball of radius 1). */
  local: THREE.Vector3;
  /** Where beams come from: your cannon, just under the bottom middle of the view (first person). */
  gun: THREE.Vector3;
  /** Where you are (the camera). Ships, the UFO and thrown things start just behind you and fly away from you. */
  eye: THREE.Vector3;
  /** The landing. `main` paints the crater (unless blocked) and does the damage when `primary`.
   * Returns false when the shot bounced off (the biggest star without the Rainbow Laser). */
  impact(o: { primary: boolean; local: THREE.Vector3; size: number; style?: CraterStyle; exit?: THREE.Vector3 }): boolean;
}

/** World position of a point in the planet's space (the planet spins, so ask again every frame). */
function world(shot: Shot, local: THREE.Vector3, lift = 0): THREE.Vector3 {
  return shot.planet.root.localToWorld(local.clone().multiplyScalar(1 + lift));
}
function normalAt(shot: Shot, local: THREE.Vector3): THREE.Vector3 {
  return world(shot, local).sub(shot.planet.root.getWorldPosition(new THREE.Vector3())).normalize();
}
function jitter(local: THREE.Vector3, amount: number): THREE.Vector3 {
  return local.clone().add(new THREE.Vector3().randomDirection().multiplyScalar(amount)).normalize();
}

/** A point near you: `x` right, `y` up, `z` back (behind you is +z, since you look down -z). */
function nearYou(shot: Shot, x: number, y: number, z: number): THREE.Vector3 {
  return shot.eye.clone().add(new THREE.Vector3(x, y, z));
}

/** A quick glow at the cannon when it fires. */
function muzzle(fx: Fx, shot: Shot, color: number) {
  const m = fx.glow(color, 0.9);
  m.position.copy(shot.gun);
  const size = shot.gun.distanceTo(shot.eye) * 0.35;
  fx.run((_, t) => {
    m.scale.setScalar(size * (1 + t * 3));
    m.material.opacity = 0.9 * (1 - t / 0.2);
    if (t < 0.2) return true;
    fx.remove(m);
    return false;
  });
}

/** Flash, sparks and a boom where something lands. */
function boom(fx: Fx, shot: Shot, local: THREE.Vector3, color: number, size: number, ok: boolean) {
  const p = world(shot, local, 0.01), n = normalAt(shot, local);
  if (!ok) {
    fx.flash(p, 0xffffff, 0.5, 0.3);
    fx.sparks(p, n, 0xffffff, 25, 1.2, 0.04, 0.5);
    sfx.plink();
    return;
  }
  fx.flash(p, color, size * 6, 0.6);
  fx.flash(p, 0xffffff, size * 3, 0.25);
  fx.sparks(p, n, color, 40 + Math.round(size * 200), 1 + size * 4, 0.05, 1.1);
  fx.shake = Math.max(fx.shake, Math.min(1, size * 2.5));
}

export function fire(fx: Fx, shot: Shot) {
  const w = shot.weapon;
  switch (w.id) {
    case 'laser': return laser(fx, shot, 0xff2020, 0.02, 0.45, sfx.laser);
    case 'plasma': return plasma(fx, shot);
    case 'rainbow': return rainbow(fx, shot);
    case 'railgun': return railgun(fx, shot);
    case 'ships': return ships(fx, shot);
    case 'asteroid': return thrown(fx, shot, 'asteroid');
    case 'moon': return thrown(fx, shot, 'moon');
    case 'ufo': return ufo(fx, shot);
    case 'blackhole': return; // main.ts runs the black hole itself (it swallows the planet)
  }
}

function laser(fx: Fx, shot: Shot, color: number, width: number, secs: number, sound: () => void) {
  sound();
  muzzle(fx, shot, color);
  fx.beam(shot.gun, () => world(shot, shot.local), color, width, secs);
  fx.after(0.08, () => {
    const ok = shot.impact({ primary: true, local: shot.local, size: shot.weapon.crater });
    boom(fx, shot, shot.local, color, shot.weapon.crater, ok);
    if (ok) sfx.hit();
  });
}

function plasma(fx: Fx, shot: Shot) {
  sfx.plasma();
  for (let i = 0; i < 3; i++) {
    const target = i === 0 ? shot.local : jitter(shot.local, 0.06);
    fx.after(i * 0.18, () => {
      muzzle(fx, shot, 0x66aaff);
      const b = fx.glow(0x66aaff);
      const core = fx.glow(0xffffff);
      fx.run((_, t) => {
        const k = Math.min(1, t / 0.3);
        const p = shot.gun.clone().lerp(world(shot, target, 0.02), k);
        const near = 0.4 + 0.6 * k; // smaller close to you so it doesn't fill the screen
        b.scale.setScalar(0.35 * near);
        core.scale.setScalar(0.12 * near);
        b.position.copy(p);
        core.position.copy(p);
        if (k < 1) return true;
        fx.remove(b);
        fx.remove(core);
        const ok = shot.impact({ primary: i === 0, local: target, size: shot.weapon.crater * (i === 0 ? 1 : 0.6) });
        boom(fx, shot, target, 0x3a8cff, shot.weapon.crater, ok);
        if (ok) sfx.hit();
        return false;
      });
    });
  }
}

function rainbow(fx: Fx, shot: Shot) {
  sfx.rainbow();
  muzzle(fx, shot, 0xffffff);
  const mat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform float time; varying vec3 vP;
      vec3 hue(float h){ return clamp(abs(mod(h*6.0+vec3(0,4,2),6.0)-3.0)-1.0, 0.0, 1.0); }
      void main(){ gl_FragColor = vec4(hue(fract(vP.z*3.0 - time*2.0 + atan(vP.y, vP.x)*0.16)) * 0.9, 1.0); }`,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
  fx.run((dt) => { mat.uniforms.time.value += dt; return mat.uniforms.time.value < 2; });
  fx.beam(shot.gun, () => world(shot, shot.local), 0xffffff, 0.09, 1.3, mat);
  let ok = true;
  fx.after(0.12, () => {
    ok = shot.impact({ primary: true, local: shot.local, size: shot.weapon.crater });
    boom(fx, shot, shot.local, 0xff66ff, shot.weapon.crater, ok);
    if (ok) sfx.bigHit();
  });
  const colors = [0xff3030, 0xffa020, 0xffff40, 0x40ff60, 0x40a0ff, 0xa040ff];
  for (let i = 0; i < 8; i++) {
    fx.after(0.2 + i * 0.13, () => {
      if (ok) fx.sparks(world(shot, shot.local, 0.02), normalAt(shot, shot.local), colors[i % 6], 30, 2, 0.06, 0.8);
    });
  }
}

function railgun(fx: Fx, shot: Shot) {
  sfx.charge();
  const charge = fx.glow(0x88ddff);
  charge.position.copy(shot.gun);
  const near = shot.gun.distanceTo(shot.eye);
  fx.run((_, t) => {
    charge.scale.setScalar(near * (0.1 + t * 1.1));
    if (t < 0.45) return true;
    fx.remove(charge);
    return false;
  });
  fx.after(0.45, () => {
    sfx.railgun();
    // a straight line through the planet and out the back
    const entryW = world(shot, shot.local);
    const dirW = entryW.clone().sub(shot.gun).normalize();
    const center = shot.planet.root.getWorldPosition(new THREE.Vector3());
    const pLocal = shot.local.toArray() as [number, number, number];
    const dLocal = shot.planet.root.worldToLocal(entryW.clone().add(dirW)).sub(shot.local).toArray() as [number, number, number];
    const exitLocal = new THREE.Vector3(...exitPoint(pLocal, dLocal));
    const exitW = world(shot, exitLocal);
    const far = exitW.clone().addScaledVector(dirW, 30);
    fx.beam(shot.gun, () => far, 0x66ccff, 0.025, 0.5);
    const ok = shot.impact({ primary: true, local: shot.local, size: shot.weapon.crater, exit: exitLocal });
    boom(fx, shot, shot.local, 0x66ccff, shot.weapon.crater, ok);
    if (ok) {
      sfx.hit();
      fx.flash(exitW, 0xffaa55, 1.2, 0.6);
      fx.sparks(exitW, exitW.clone().sub(center).normalize().add(dirW).normalize(), 0xffaa55, 120, 3, 0.06, 1.4);
    }
  });
}

function shipModel(): THREE.Group {
  const g = new THREE.Group();
  const white = new THREE.MeshLambertMaterial({ color: 0xe8eef5 });
  const red = new THREE.MeshLambertMaterial({ color: 0xd63a3a });
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.2, 8), white);
  body.rotation.x = Math.PI / 2; // points along +z
  const wing = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.008, 0.06), red);
  wing.position.z = -0.05;
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.05, 0.05), red);
  fin.position.set(0, 0.025, -0.07);
  g.add(body, wing, fin);
  const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: 0x66bbff, blending: THREE.AdditiveBlending, depthWrite: false }));
  flame.scale.setScalar(0.09);
  flame.position.z = -0.11;
  g.add(flame);
  return g;
}

function ships(fx: Fx, shot: Shot) {
  sfx.whoosh(1);
  const offsets = [[0, 0], [-0.25, -0.12], [0.25, -0.12], [-0.5, -0.24], [0.5, -0.24]];
  offsets.forEach(([ox, oy], i) => {
    const ship = shipModel();
    fx.scene.add(ship);
    const side = new THREE.Vector3(ox, oy + 0.15, 0);
    // from just behind you, past your shoulders, out toward the planet
    const start = nearYou(shot, ox * 0.8 + (ox === 0 ? 0 : Math.sign(ox) * 0.15), -0.35 + oy * 0.5, 0.6 + i * 0.15);
    let fired = 0;
    fx.run((_, t) => {
      const target = world(shot, shot.local);
      const n = normalAt(shot, shot.local);
      const hover = target.clone().addScaledVector(n, 1.1).add(side);
      if (t < 1) {
        const e = 1 - Math.pow(1 - t, 2);
        ship.position.copy(start).lerp(hover, e);
        ship.lookAt(target);
        ship.visible = ship.position.z < shot.eye.z - 0.1; // not while it's still behind you
      } else if (t < 2.2) {
        ship.position.copy(hover).add(new THREE.Vector3(0, Math.sin(t * 6 + i) * 0.02, 0));
        ship.lookAt(target);
        const shotsDue = Math.floor((t - 1) / 0.28);
        while (fired <= shotsDue && fired < 4) {
          const primary = i === 0 && fired === 0;
          const aim = primary ? shot.local : jitter(shot.local, 0.09);
          const from = ship.position.clone();
          fired++;
          sfx.ship();
          fx.beam(from, () => world(shot, aim), 0x44ff66, 0.008, 0.18);
          fx.after(0.05, () => {
            const ok = shot.impact({ primary, local: aim, size: shot.weapon.crater });
            boom(fx, shot, aim, 0x66ff88, 0.05, ok);
            if (ok && fired % 2 === 0) sfx.hit();
          });
        }
      } else {
        const k = t - 2.2;
        ship.position.addScaledVector(new THREE.Vector3(ox * 0.6 + (i % 2 ? 0.3 : -0.3), 1, -0.4).normalize(), k * 0.25);
        if (k > 1.5) { fx.remove(ship); return false; }
      }
      return true;
    });
  });
}

function rockGeometry(r: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, 2);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const bumps = Array.from({ length: 6 }, () => [new THREE.Vector3().randomDirection(), 0.1 + Math.random() * 0.25] as const);
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize();
    let s = 1;
    for (const [d, a] of bumps) s -= a * Math.max(0, v.dot(d) - 0.6) * 2.5;
    s *= 0.9 + Math.random() * 0.15;
    v.multiplyScalar(r * s);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function thrown(fx: Fx, shot: Shot, what: 'asteroid' | 'moon') {
  const isMoon = what === 'moon';
  const r = isMoon ? 0.32 : 0.13;
  const mesh = isMoon
    ? new THREE.Mesh(new THREE.SphereGeometry(r, 48, 32), new THREE.MeshLambertMaterial({ map: texture('moon') }))
    : new THREE.Mesh(rockGeometry(r), new THREE.MeshLambertMaterial({ color: 0x8a7a68, flatShading: true }));
  fx.scene.add(mesh);
  const secs = isMoon ? 1.9 : 1.2;
  // thrown from just below and behind you, so you see it fly away into the planet
  const from = nearYou(shot, isMoon ? 0 : 0.15, -(r + 0.25), 0.4);
  const spin = new THREE.Vector3().randomDirection();
  sfx.whoosh(secs);
  let trailT = 0;
  fx.run((dt, t) => {
    const k = Math.min(1, t / secs);
    const e = 1 - Math.pow(1 - k, 1.6); // fast as it leaves you, then smaller and smaller far away
    const target = world(shot, shot.local, r * 0.6);
    mesh.position.copy(from).lerp(target, e);
    mesh.visible = mesh.position.z < shot.eye.z - r;
    mesh.rotateOnAxis(spin, dt * (isMoon ? 0.8 : 3));
    trailT += dt;
    if (trailT > 0.025 && k > 0.2) { // a fiery trail as it heats up
      trailT = 0;
      const s = fx.glow(isMoon ? 0xffcc88 : 0xff7a22, 0.8);
      s.position.copy(mesh.position);
      const size = r * (isMoon ? 2.2 : 3) * (0.4 + k);
      fx.run((_, tt) => {
        s.scale.setScalar(size * (1 + tt));
        s.material.opacity = 0.8 * (1 - tt / 0.5);
        if (tt > 0.5) { fx.remove(s); return false; }
      });
    }
    if (k < 1) return true;
    fx.remove(mesh);
    const ok = shot.impact({ primary: true, local: shot.local, size: shot.weapon.crater });
    boom(fx, shot, shot.local, 0xffaa44, shot.weapon.crater, ok);
    if (ok) {
      if (isMoon) sfx.bigHit(); else sfx.hit();
    }
    return false;
  });
}

function ufoModel(): THREE.Group {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 12), new THREE.MeshLambertMaterial({ color: 0xb8c4d0 }));
  disc.scale.y = 0.25;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.08, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x7dffb0, transparent: true, opacity: 0.8 }));
  dome.position.y = 0.03;
  g.add(disc, dome);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const l = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: i % 2 ? 0xffee55 : 0x55ff99, blending: THREE.AdditiveBlending, depthWrite: false }));
    l.scale.setScalar(0.06);
    l.position.set(Math.cos(a) * 0.19, 0, Math.sin(a) * 0.19);
    g.add(l);
  }
  return g;
}

function ufo(fx: Fx, shot: Shot) {
  const saucer = ufoModel();
  fx.scene.add(saucer);
  const start = nearYou(shot, 0.5, 0.45, 0.5); // over your shoulder
  sfx.whoosh(0.9);
  let beamed = false;
  fx.run((_, t) => {
    const target = world(shot, shot.local);
    const n = normalAt(shot, shot.local);
    const side = new THREE.Vector3(0, 1, 0).cross(n).normalize();
    const hover = target.clone().addScaledVector(n, 0.5).addScaledVector(side, 0.25).add(new THREE.Vector3(0, 0.2, 0));
    saucer.scale.setScalar(0.6);
    saucer.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    if (t < 0.9) {
      const e = 1 - Math.pow(1 - t / 0.9, 2);
      saucer.position.copy(start).lerp(hover, e);
      saucer.visible = saucer.position.z < shot.eye.z - 0.15;
    } else if (t < 2.3) {
      saucer.position.copy(hover).addScaledVector(new THREE.Vector3(1, 0, 0), Math.sin(t * 5) * 0.03);
      if (!beamed) {
        beamed = true;
        sfx.ufo();
        const cone = new THREE.Mesh(
          new THREE.CylinderGeometry(0.02, 0.11, 1, 24, 1, true).translate(0, -0.5, 0),
          new THREE.MeshBasicMaterial({ color: 0x55ff88, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
        );
        fx.scene.add(cone);
        fx.run((_, tt) => {
          const tw = world(shot, shot.local);
          cone.position.copy(saucer.position);
          const d = saucer.position.distanceTo(tw);
          cone.scale.set(1, d, 1);
          cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), tw.clone().sub(saucer.position).normalize());
          (cone.material as THREE.MeshBasicMaterial).opacity = 0.35 + 0.2 * Math.sin(tt * 40);
          if (tt < 1.3) return true;
          fx.remove(cone);
          return false;
        });
        fx.after(0.5, () => {
          const ok = shot.impact({ primary: true, local: shot.local, size: shot.weapon.crater, style: 'alien' });
          boom(fx, shot, shot.local, 0x55ff88, shot.weapon.crater, ok);
          if (ok) sfx.hit();
        });
      }
    } else {
      saucer.position.addScaledVector(n, 0.12).add(new THREE.Vector3(0.06, 0.03, 0));
      if (t > 3.3) { fx.remove(saucer); return false; }
    }
    return true;
  });
}

/** A black hole appears next to the planet and swallows it. `pull` holds the planet (see main.ts). */
export function blackHole(fx: Fx, shot: Shot, pull: THREE.Group, done: () => void) {
  // beside the planet, on the side that was tapped (flat to the screen, so it isn't in your face)
  const n = normalAt(shot, shot.local);
  const flat = new THREE.Vector3(n.x, n.y, 0);
  if (flat.lengthSq() < 0.01) flat.set(-1, 0.4, 0);
  const at = shot.planet.root.getWorldPosition(new THREE.Vector3()).addScaledVector(flat.normalize(), 2.1);
  const hole = new THREE.Group();
  hole.position.copy(at);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.42, 32, 24), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  const halo = fx.glow(0xb070ff, 0.7);
  halo.position.copy(at);
  const diskMat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 } },
    vertexShader: `varying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform float time; varying vec3 vP;
      void main(){ float r = length(vP.xy); float a = atan(vP.y, vP.x);
        float sw = 0.5 + 0.5 * sin(a * 3.0 + r * 9.0 - time * 7.0);
        float edge = smoothstep(0.5, 0.65, r) * (1.0 - smoothstep(1.1, 1.6, r));
        vec3 c = mix(vec3(1.0, 0.45, 0.1), vec3(1.0, 0.95, 0.8), sw * (1.6 - r));
        gl_FragColor = vec4(c * edge * (0.6 + 0.6 * sw), 1.0); }`,
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const disk = new THREE.Mesh(new THREE.RingGeometry(0.5, 1.6, 96, 4), diskMat);
  disk.rotation.x = -1.2;
  hole.add(disk, ball);
  fx.scene.add(hole);
  sfx.hum();
  // stretch the planet toward the hole: turn `pull` so its +y points at the hole, then squash and shrink
  const center = pull.position.clone();
  const toHole = at.clone().sub(center).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), toHole);
  const planetRoot = shot.planet.root;
  const before = planetRoot.getWorldQuaternion(new THREE.Quaternion());
  pull.quaternion.copy(q);
  planetRoot.quaternion.copy(q.clone().invert().multiply(before));
  let swallowed = false;
  let streamT = 0;
  fx.run((dt, t) => {
    diskMat.uniforms.time.value = t;
    const grow = Math.min(1, t / 0.8);
    const end = t > 4 ? Math.max(0, 1 - (t - 4) / 0.6) : 1;
    hole.scale.setScalar(grow * end);
    halo.scale.setScalar(3.2 * grow * end * (1 + 0.05 * Math.sin(t * 8)));
    if (t > 0.8 && t < 3.6) {
      const k = (t - 0.8) / 2.8;
      const e = k * k;
      pull.position.copy(center).lerp(at, e);
      const s = 1 - e;
      pull.scale.set(s * (1 - 0.4 * k), s * (1 + 1.2 * k), s * (1 - 0.4 * k));
      planetRoot.rotateY(dt * (1 + k * 6));
      streamT += dt;
      if (streamT > 0.03) { // bits of planet spiralling in
        streamT = 0;
        const bit = fx.glow([0xffaa66, 0xffffff, 0xff6644][Math.floor(Math.random() * 3)], 0.9);
        const startP = pull.position.clone().add(new THREE.Vector3().randomDirection().multiplyScalar(s * 1.1));
        const ang = Math.random() * Math.PI * 2;
        fx.run((_, tt) => {
          const kk = Math.min(1, tt / 0.6);
          const swirl = new THREE.Vector3(Math.cos(ang + kk * 6), Math.sin(ang + kk * 6), 0).multiplyScalar(0.4 * (1 - kk));
          bit.position.copy(startP).lerp(at, kk * kk).add(swirl);
          bit.scale.setScalar(0.15 * (1 - kk) + 0.03);
          if (kk < 1) return true;
          fx.remove(bit);
          return false;
        });
      }
    }
    if (t >= 3.6 && !swallowed) {
      swallowed = true;
      pull.visible = false;
      fx.flash(at, 0xd0a0ff, 3, 0.8);
      done();
    }
    if (t > 4.6) {
      fx.remove(hole);
      fx.remove(halo);
      fx.flash(at, 0xffffff, 2.5, 0.6);
      return false;
    }
    return true;
  });
}
