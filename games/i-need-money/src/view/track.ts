// Coaster and flume tracks: an oval with hills and loops, the frames along it (so cars can go upside down
// in a loop), and how long a lap takes (slow up the lift hill, fast down the drops).
import * as THREE from 'three';

export interface Track {
  curve: THREE.CatmullRomCurve3;
  length: number;
  /** Evenly spaced samples (by distance along the track). */
  pts: THREE.Vector3[];
  /** Direction of travel, the car's "up", and its "right" at each sample. */
  tan: THREE.Vector3[];
  up: THREE.Vector3[];
  side: THREE.Vector3[];
  /** Seconds from the station to each sample. */
  time: number[];
  lap: number;
}

export function makeTrack(t: { a: number; b: number; h: number; hills: number; loops: number }, flume = false): Track {
  const { a, b, h, hills, loops } = t;
  const N = Math.max(40, Math.round((a + b) * 2.4));
  const loopR = 2.5 + h * 0.13;
  const loopAt = new Set<number>();
  for (let j = 1; j <= loops; j++) loopAt.add(Math.round((N * j) / hills));
  const raw: THREE.Vector3[] = [];
  const yAt = (th: number) => 1 + h * (0.5 - 0.5 * Math.cos(hills * th));
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2;
    // Station at th = 0 on the south side (+z), going east first.
    const p = new THREE.Vector3(a * Math.sin(th), yAt(th), b * Math.cos(th));
    raw.push(p);
    if (loopAt.has(i)) {
      const tan = new THREE.Vector3(a * Math.cos(th), 0, -b * Math.sin(th)).normalize();
      const side = new THREE.Vector3(-tan.z, 0, tan.x);
      for (let k = 1; k < 12; k++) {
        const f = (k / 12) * Math.PI * 2;
        raw.push(
          p.clone()
            .addScaledVector(tan, loopR * Math.sin(f) + loopR * 0.25 * (k / 12))
            .add(new THREE.Vector3(0, loopR * (1 - Math.cos(f)), 0))
            .addScaledVector(side, 1.6 * (k / 12) - 0.8),
        );
      }
    }
  }
  const curve = new THREE.CatmullRomCurve3(raw, true, 'centripetal');
  const length = curve.getLength();
  const M = Math.max(80, Math.round(length));
  const pts: THREE.Vector3[] = [], tan: THREE.Vector3[] = [], up: THREE.Vector3[] = [], side: THREE.Vector3[] = [];
  for (let i = 0; i <= M; i++) {
    const u = i / M;
    pts.push(curve.getPointAt(u % 1));
    tan.push(curve.getTangentAt(u % 1).normalize());
  }
  // Parallel transport: start with "up" being up, then turn it along with the track.
  const Y = new THREE.Vector3(0, 1, 0);
  up.push(Y.clone().addScaledVector(tan[0], -Y.dot(tan[0])).normalize());
  const q = new THREE.Quaternion();
  for (let i = 1; i <= M; i++) {
    q.setFromUnitVectors(tan[i - 1], tan[i]);
    const u = up[i - 1].clone().applyQuaternion(q);
    // Away from loops, ease back toward level so the track doesn't stay twisted.
    const flat = Y.clone().addScaledVector(tan[i], -Y.dot(tan[i]));
    if (Math.abs(tan[i].y) < 0.7 && u.y > 0.3 && flat.lengthSq() > 0.01) u.lerp(flat.normalize(), 0.15);
    up.push(u.addScaledVector(tan[i], -u.dot(tan[i])).normalize());
  }
  for (let i = 0; i <= M; i++) side.push(new THREE.Vector3().crossVectors(tan[i], up[i]).normalize());

  // Timing: lift hill to the first top, then gravity, then brakes into the station.
  const ymax = Math.max(...pts.map((p) => p.y));
  let liftEnd = 0;
  for (let i = 0; i < M / Math.max(1, hills) * 0.75; i++) if (pts[i].y > pts[liftEnd].y) liftEnd = i;
  const time = [0];
  const ds = length / M;
  for (let i = 1; i <= M; i++) {
    let v = i <= liftEnd ? (flume ? 2.5 : 3.5) : 4 + Math.sqrt(2 * 9.8 * Math.max(0, ymax - pts[i].y)) * (flume ? 0.6 : 0.85);
    if ((M - i) * ds < 12) v = Math.min(v, 4);
    time.push(time[i - 1] + ds / v);
  }
  return { curve, length, pts, tan, up, side, time, lap: time[M] };
}

/** Where along the track (sample index, with fraction) the train is after `secs` of its lap. */
export function trackIndexAt(tr: Track, secs: number) {
  const T = tr.time;
  let lo = 0, hi = T.length - 1;
  if (secs <= 0) return 0;
  if (secs >= T[hi]) return hi;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (T[mid] < secs) lo = mid;
    else hi = mid;
  }
  return lo + (secs - T[lo]) / (T[hi] - T[lo]);
}

/** Position and frame at a fractional sample index (wraps around). */
export function frameAt(tr: Track, idx: number, out: { p: THREE.Vector3; t: THREE.Vector3; u: THREE.Vector3; s: THREE.Vector3 }) {
  const M = tr.pts.length - 1;
  idx = ((idx % M) + M) % M;
  const i = Math.floor(idx), f = idx - i, j = i + 1;
  out.p.lerpVectors(tr.pts[i], tr.pts[j], f);
  out.t.lerpVectors(tr.tan[i], tr.tan[j], f).normalize();
  out.u.lerpVectors(tr.up[i], tr.up[j], f).normalize();
  out.s.crossVectors(out.t, out.u).normalize();
  return out;
}
