// The maps: a round mini-map in the corner (turns with you, so the way you're going is up) and a big map
// (drag to move, pinch or ± to zoom) with buttons that take you straight to a place: the roof, Skateland,
// or any mile of the 10-mile street. Drawn from the same data as the game (sim/world.ts).
import { CHUNK, chunk, CITY_LEN, CROSS_EVERY, CROSS_W, HALF_W, MILE, PARK, SIDE_X0, SIDE_X1, SPAWN, type Look } from '../sim/world';

export interface Place {
  icon: string;
  label: string;
  x: number;
  z: number;
  heading: number;
  /** Back to the top of the building (a proper restart). */
  roof?: boolean;
}

export const PLACES: Place[] = [
  { icon: '🏢', label: 'The roof', x: SPAWN.x, z: SPAWN.z, heading: 0, roof: true },
  { icon: '🎢', label: 'Skateland', x: SIDE_X1 - 6, z: PARK.z0 + 140, heading: Math.PI / 2 },
  ...Array.from({ length: 10 }, (_, i) => ({ icon: '🛹', label: `Mile ${i + 1}`, x: 0, z: (i + 1) * MILE - (i === 9 ? 40 : -3), heading: 0 })),
];

const LOOK_COLOR: Record<Look, string> = {
  concrete: '#cfcac0',
  blue: '#2f7de1',
  wood: '#c79a5b',
  red: '#d0453b',
  roof: '#9aa0a8',
  wall: '#8d939b',
  water: '#3a8fd0',
  coaster: '#c0392b',
  hidden: '#e0a33a',
};

interface View {
  cx: number;
  cz: number;
  /** Pixels per metre. */
  s: number;
  /** Which way is up on the screen (the heading that points up). */
  rot: number;
}

/**
 * Draws the city into `g` (w × h pixels). Screen up is the `rot` heading; the skater's left is screen left
 * (so with rot = 0, +z is up and +x is left).
 */
function draw(g: CanvasRenderingContext2D, w: number, h: number, v: View, me: { x: number; z: number; heading: number }, labels: boolean) {
  const { s, rot } = v;
  const c = Math.cos(rot), sn = Math.sin(rot);
  // world → screen: sx = w/2 - s((x-cx)cos - (z-cz)sin), sy = h/2 - s((x-cx)sin + (z-cz)cos)
  const a = -s * c, b = s * sn, cc = -s * sn, d = -s * c;
  const e = w / 2 - a * v.cx - b * v.cz, f = h / 2 - cc * v.cx - d * v.cz;
  const toScreen = (x: number, z: number): [number, number] => [a * x + b * z + e, cc * x + d * z + f];
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#2b3038'; // buildings
  g.fillRect(0, 0, w, h);
  g.setTransform(a, cc, b, d, e, f);
  const reach = Math.hypot(w, h) / 2 / s + 20;
  const z0 = Math.max(-90, v.cz - reach), z1 = Math.min(CITY_LEN + 40, v.cz + reach);
  const rect = (x0: number, x1: number, za: number, zb: number, col: string) => {
    g.fillStyle = col;
    g.fillRect(x0, za, x1 - x0, zb - za);
  };
  // Streets.
  const road = '#5d6168', walk = '#8a8e94';
  rect(-HALF_W, HALF_W, Math.max(0, z0), Math.min(CITY_LEN, z1), walk);
  rect(-HALF_W + 4, HALF_W - 4, Math.max(0, z0), Math.min(CITY_LEN, z1), road);
  for (const side of [-1, 1]) {
    rect(Math.min(side * SIDE_X0, side * SIDE_X1), Math.max(side * SIDE_X0, side * SIDE_X1), Math.max(0, z0), Math.min(CITY_LEN, z1), walk);
    rect(Math.min(side * (SIDE_X0 + 3), side * (SIDE_X1 - 3)), Math.max(side * (SIDE_X0 + 3), side * (SIDE_X1 - 3)), Math.max(0, z0), Math.min(CITY_LEN, z1), road);
  }
  for (let n = Math.max(0, Math.floor(z0 / CROSS_EVERY)); n * CROSS_EVERY < z1; n++) rect(-SIDE_X0, SIDE_X0, n * CROSS_EVERY, n * CROSS_EVERY + CROSS_W, road);
  rect(PARK.x0, PARK.x1, PARK.z0, PARK.z1, '#7d9a6a'); // Skateland
  rect(-15, 15, -40, 0, '#9aa0a8'); // the roof
  // What's in the streets (only when zoomed in enough to see it).
  if (s > 0.12) {
    const ids = new Set<number>([-1]);
    if (z1 > PARK.z0 && z0 < PARK.z1) ids.add(-2);
    for (let i = Math.max(0, Math.floor(z0 / CHUNK)); i * CHUNK < z1 && i * CHUNK < CITY_LEN; i++) ids.add(i);
    for (const i of ids) {
      const ch = chunk(i);
      for (const p of ch.pieces) {
        if (p.kind === 'box' && p.top < 0.2) continue; // sidewalks
        if (p.look === 'roof') continue;
        g.fillStyle = LOOK_COLOR[p.look];
        if (p.kind === 'ring') {
          g.beginPath();
          g.arc(p.cx, p.cz, p.r1, 0, Math.PI * 2);
          g.fill();
        } else g.fillRect(p.x0, p.z0, p.x1 - p.x0, p.z1 - p.z0);
      }
      g.strokeStyle = '#ffd84a';
      g.lineWidth = Math.max(0.35, 1.2 / s);
      g.beginPath();
      for (const r of ch.rails) {
        g.moveTo(r.a[0], r.a[2]);
        g.lineTo(r.b[0], r.b[2]);
      }
      g.stroke();
    }
  }
  // Mile lines across the main street.
  g.strokeStyle = '#ffffff';
  g.lineWidth = Math.max(1, 2 / s);
  for (let m = 1; m <= 10; m++) {
    const z = m * MILE;
    if (z < z0 || z > z1) continue;
    g.beginPath();
    g.moveTo(-HALF_W, z);
    g.lineTo(HALF_W, z);
    g.stroke();
  }
  // Labels and the skater, upright on the screen.
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (labels) {
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const p of PLACES) {
      const [x, y] = toScreen(p.x, p.z);
      if (x < -40 || y < -40 || x > w + 40 || y > h + 40) continue;
      g.font = '20px system-ui, sans-serif';
      g.fillText(p.icon, x, y - 12);
      g.font = '800 13px system-ui, sans-serif';
      g.lineWidth = 3;
      g.strokeStyle = 'rgba(0,0,0,0.7)';
      g.strokeText(p.label, x, y + 8);
      g.fillStyle = '#fff';
      g.fillText(p.label, x, y + 8);
    }
  }
  const [mx, my] = toScreen(me.x, me.z);
  g.save();
  g.translate(mx, my);
  g.rotate(rot - me.heading); // the arrow points the way the skater faces
  g.fillStyle = '#ffd84a';
  g.strokeStyle = '#1b1b1b';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, -11);
  g.lineTo(8, 9);
  g.lineTo(0, 4);
  g.lineTo(-8, 9);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
}

function canvasFor(el: HTMLElement) {
  const cv = document.createElement('canvas');
  el.append(cv);
  return cv;
}

function fit(cv: HTMLCanvasElement) {
  const r = cv.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (cv.width !== w || cv.height !== h) {
    cv.width = w;
    cv.height = h;
  }
  return dpr;
}

export class CityMap {
  /** The round mini-map (goes in the HUD); tap it to open the big map. */
  readonly mini = document.createElement('button');
  /** The big map screen. */
  readonly screen = document.createElement('div');
  private miniCv: HTMLCanvasElement;
  private bigCv: HTMLCanvasElement;
  private view: View = { cx: 0, cz: 0, s: 1, rot: 0 };
  private me = { x: 0, z: 0, heading: 0 };
  private lastMini = 0;
  private dirty = false;

  constructor(open: () => void, close: () => void, go: (p: Place) => void) {
    this.mini.className = 'minimap';
    this.mini.setAttribute('aria-label', 'Map');
    this.miniCv = canvasFor(this.mini);
    this.mini.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      open();
    });

    this.screen.className = 'screen bigmap';
    const box = document.createElement('div');
    box.className = 'bigmap-box';
    this.bigCv = canvasFor(box);
    const zoom = document.createElement('div');
    zoom.className = 'bigmap-zoom';
    const zb = (label: string, f: () => void) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.addEventListener('click', () => {
        f();
        this.redraw();
      });
      zoom.append(b);
    };
    zb('+', () => (this.view.s = Math.min(6, this.view.s * 1.6)));
    zb('−', () => (this.view.s = Math.max(0.03, this.view.s / 1.6)));
    zb('📍', () => Object.assign(this.view, { cx: this.me.x, cz: this.me.z }));
    box.append(zoom);
    const side = document.createElement('div');
    side.className = 'bigmap-side panel';
    const h2 = document.createElement('h2');
    h2.textContent = 'Skate to…';
    side.append(h2);
    for (const p of PLACES) {
      const b = document.createElement('button');
      b.className = 'btn place';
      b.textContent = `${p.icon}  ${p.label}`;
      b.addEventListener('click', () => go(p));
      side.append(b);
    }
    const back = document.createElement('button');
    back.className = 'btn primary';
    back.textContent = '✕  Close';
    back.addEventListener('click', () => close());
    side.append(back);
    this.screen.append(box, side);
    this.dragging(this.bigCv);
    window.addEventListener('resize', () => this.redraw());
  }

  /** Drag to move, two fingers to zoom, mouse wheel to zoom. */
  private dragging(cv: HTMLCanvasElement) {
    const pts = new Map<number, { x: number; y: number }>();
    let pinch = 0;
    cv.addEventListener('pointerdown', (e) => {
      cv.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) {
        const [p, q] = [...pts.values()];
        pinch = Math.hypot(p.x - q.x, p.y - q.y);
      }
    });
    cv.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      if (pts.size === 1) {
        // The world point under the finger stays under it (screen x is the world's -x, screen y its -z).
        this.view.cx += (e.clientX - p.x) / this.view.s;
        this.view.cz += (e.clientY - p.y) / this.view.s;
      }
      p.x = e.clientX;
      p.y = e.clientY;
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0) this.view.s = Math.min(6, Math.max(0.03, (this.view.s * dist) / pinch));
        pinch = dist;
      }
      this.redraw();
    });
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      pinch = 0;
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);
    cv.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.view.s = Math.min(6, Math.max(0.03, this.view.s * Math.exp(-e.deltaY * 0.0015)));
        this.redraw();
      },
      { passive: false },
    );
  }

  /** Called every frame while skating: redraws the mini-map ~12 times a second. */
  update(now: number, x: number, z: number, heading: number) {
    this.me = { x, z, heading };
    if (now - this.lastMini < 80) return;
    this.lastMini = now;
    const dpr = fit(this.miniCv);
    const g = this.miniCv.getContext('2d')!;
    const w = this.miniCv.width, h = this.miniCv.height;
    draw(g, w, h, { cx: x, cz: z, s: 0.9 * dpr, rot: heading }, this.me, false);
  }

  /** Opening the big map: centred on the skater. */
  opened() {
    Object.assign(this.view, { cx: this.me.x, cz: this.me.z, s: 1, rot: 0 });
    this.redraw();
  }

  private redraw() {
    if (this.dirty) return;
    this.dirty = true;
    requestAnimationFrame(() => {
      this.dirty = false;
      const dpr = fit(this.bigCv);
      const g = this.bigCv.getContext('2d')!;
      draw(g, this.bigCv.width, this.bigCv.height, { ...this.view, s: this.view.s * dpr }, this.me, true);
    });
  }
}
