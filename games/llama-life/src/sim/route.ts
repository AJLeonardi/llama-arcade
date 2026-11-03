// The GPS: the way along the roads from where you are to a place. The roads are drawn onto a grid of 4 m cells
// once; picking a place fills in how many cells each road cell is from it, and the way from anywhere is then
// just "step to the neighbour that's closer" until you get there.
import { BOUNDS, roads, type Place } from './world';

const CELL = 4;
const NX = Math.ceil((BOUNDS.x1 - BOUNDS.x0) / CELL), NZ = Math.ceil((BOUNDS.z1 - BOUNDS.z0) / CELL);
const road = new Uint8Array(NX * NZ);
for (const r of roads) {
  for (let i = Math.max(0, Math.floor((r.x0 - BOUNDS.x0) / CELL)); i < Math.min(NX, Math.ceil((r.x1 - BOUNDS.x0) / CELL)); i++) {
    for (let j = Math.max(0, Math.floor((r.z0 - BOUNDS.z0) / CELL)); j < Math.min(NZ, Math.ceil((r.z1 - BOUNDS.z0) / CELL)); j++) {
      // Only cells whose middle is on the road, so the line stays off the verges.
      const x = BOUNDS.x0 + (i + 0.5) * CELL, z = BOUNDS.z0 + (j + 0.5) * CELL;
      if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1) road[j * NX + i] = 1;
    }
  }
}
const cellOf = (x: number, z: number) => [Math.floor((x - BOUNDS.x0) / CELL), Math.floor((z - BOUNDS.z0) / CELL)];
const mid = (k: number) => ({ x: BOUNDS.x0 + ((k % NX) + 0.5) * CELL, z: BOUNDS.z0 + (Math.floor(k / NX) + 0.5) * CELL });

/** The road cell nearest to a point (or -1 if there's none within 160 m). */
function nearestRoad(x: number, z: number) {
  const [ci, cj] = cellOf(x, z);
  for (let rad = 0; rad < 40; rad++) {
    let best = -1, bestD = Infinity;
    for (let i = ci - rad; i <= ci + rad; i++) {
      for (let j = cj - rad; j <= cj + rad; j++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== rad || i < 0 || j < 0 || i >= NX || j >= NZ) continue;
        const k = j * NX + i;
        if (!road[k]) continue;
        const m = mid(k), d = Math.hypot(m.x - x, m.z - z);
        if (d < bestD) (best = k), (bestD = d);
      }
    }
    if (best >= 0) return best;
  }
  return -1;
}

export interface Pt {
  x: number;
  z: number;
}

export class Route {
  private dist = new Int32Array(NX * NZ);

  constructor(readonly place: Place) {
    this.dist.fill(-1);
    const start = nearestRoad(place.cx, place.cz);
    if (start < 0) return;
    const queue = new Int32Array(NX * NZ);
    let head = 0, tail = 0;
    queue[tail++] = start;
    this.dist[start] = 0;
    while (head < tail) {
      const k = queue[head++], i = k % NX, d = this.dist[k] + 1;
      for (const n of [i > 0 ? k - 1 : -1, i < NX - 1 ? k + 1 : -1, k - NX, k + NX]) {
        if (n < 0 || n >= NX * NZ || !road[n] || this.dist[n] >= 0) continue;
        this.dist[n] = d;
        queue[tail++] = n;
      }
    }
  }

  /** The way from (x, z) to the place: corner points, starting where you are and ending at the door. */
  from(x: number, z: number): Pt[] {
    const pts: Pt[] = [{ x, z }];
    let k = nearestRoad(x, z);
    if (k < 0 || this.dist[k] < 0) return [...pts, { x: this.place.x, z: this.place.z }];
    let dir = 0;
    pts.push(mid(k));
    while (this.dist[k] > 0) {
      const i = k % NX;
      let next = -1;
      // Keep going the same way when that's still closer, so the line turns only at corners.
      const order = [dir, -1, 1, -NX, NX];
      for (const step of order) {
        if (!step || (step === -1 && i === 0) || (step === 1 && i === NX - 1)) continue;
        const n = k + step;
        if (n >= 0 && n < NX * NZ && this.dist[n] === this.dist[k] - 1) {
          next = n;
          if (step !== dir) {
            pts.push(mid(k));
            dir = step;
          }
          break;
        }
      }
      if (next < 0) break;
      k = next;
    }
    pts.push(mid(k), { x: this.place.cx, z: this.place.cz }, { x: this.place.x, z: this.place.z });
    return pts;
  }
}

/** How long a way is, in metres. */
export function length(pts: Pt[]) {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z);
  return d;
}
