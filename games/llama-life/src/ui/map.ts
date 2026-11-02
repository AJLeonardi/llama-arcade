// The map: a round mini-map that turns with you (tap it for the big one), and the big map of the whole town
// with buttons to go straight to a place. Both are drawn from the world data onto one picture made at the start.
import { BOUNDS, houses, paved, PLACES, POOL, roads, towers, trees, venues, type Place } from '../sim/world';

const PX = 1.6; // picture pixels per metre
const W = (BOUNDS.x1 - BOUNDS.x0) * PX, H = (BOUNDS.z1 - BOUNDS.z0) * PX;
const mx = (x: number) => (x - BOUNDS.x0) * PX;
const mz = (z: number) => (z - BOUNDS.z0) * PX;

function drawTown() {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d')!;
  g.fillStyle = '#7fae62';
  g.fillRect(0, 0, W, H);
  const rect = (x0: number, x1: number, z0: number, z1: number, color: string) => {
    g.fillStyle = color;
    g.fillRect(mx(x0), mz(z0), (x1 - x0) * PX, (z1 - z0) * PX);
  };
  for (const t of trees) {
    g.fillStyle = '#5d8f45';
    g.beginPath();
    g.arc(mx(t.x), mz(t.z), 2.4 * PX, 0, Math.PI * 2);
    g.fill();
  }
  for (const p of paved) rect(p.x0, p.x1, p.z0, p.z1, p.kind === 'field' ? '#8cc46c' : p.kind === 'court' ? '#6f9a74' : p.kind === 'parking' ? '#8d8f93' : '#d6d1c6');
  rect(POOL.x0, POOL.x1, POOL.z0, POOL.z1, '#4cb7e8');
  for (const r of roads) rect(r.x0, r.x1, r.z0, r.z1, r.kind === 'drive' ? '#cfc9bb' : '#5d6168');
  for (const h of houses) rect(h.x0, h.x1, h.z0, h.z1, '#b98d6b');
  for (const t of towers) rect(t.x0, t.x1, t.z0, t.z1, '#4b5563');
  const colors: Record<string, string> = { home: '#f1c40f', coffee: '#2e5b45', market: '#c0392b', school: '#1f4e79', work: '#14202c' };
  for (const v of venues) rect(v.x0, v.x1, v.z0, v.z1, colors[v.id] ?? '#888');
  return c;
}

export class TownMap {
  readonly mini = document.createElement('canvas');
  readonly screen = document.createElement('div');
  private town = drawTown();
  private big = document.createElement('canvas');
  private me = { x: 0, z: 0, heading: 0 };

  constructor(
    open: () => void,
    close: () => void,
    go: (p: Place) => void,
  ) {
    this.mini.className = 'minimap';
    this.mini.width = this.mini.height = 300;
    this.mini.onpointerdown = (e) => {
      e.stopPropagation();
      open();
    };
    this.screen.className = 'screen map-screen hidden';
    const side = document.createElement('div');
    side.className = 'map-side';
    const h = document.createElement('h2');
    h.textContent = 'Go to…';
    side.append(h);
    for (const p of PLACES) {
      const b = document.createElement('button');
      b.className = 'place';
      b.textContent = `${p.icon}  ${p.name}`;
      b.onclick = () => go(p);
      side.append(b);
    }
    const x = document.createElement('button');
    x.className = 'big';
    x.textContent = '✓  Close';
    x.onclick = () => close();
    side.append(x);
    this.big.className = 'bigmap';
    this.screen.append(this.big, side);
  }

  /** Draws the mini-map: 220 m across, turned so the way you face is up. */
  update(x: number, z: number, heading: number, camYaw: number) {
    this.me = { x, z, heading };
    const g = this.mini.getContext('2d')!;
    const S = this.mini.width, R = S / 2;
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath();
    g.arc(R, R, R - 4, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#7fae62';
    g.fillRect(0, 0, S, S);
    const k = S / (220 * PX);
    g.translate(R, R);
    // Camera heading up: the map turns the other way. Heading PI (north) means no turn.
    g.rotate(camYaw - Math.PI);
    g.scale(k, k);
    g.drawImage(this.town, -mx(x), -mz(z));
    g.restore();
    this.places(g, x, z, camYaw, S, k);
    // You, an arrow in the middle, pointing the way you face relative to the camera.
    g.save();
    g.translate(R, R);
    g.rotate(-(heading - camYaw));
    this.arrow(g, 13);
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(R, R, R - 4, 0, Math.PI * 2);
    g.stroke();
  }

  /** Place icons on the mini-map (pinned to the edge when they're far away). */
  private places(g: CanvasRenderingContext2D, x: number, z: number, camYaw: number, S: number, k: number) {
    const R = S / 2;
    const a = camYaw - Math.PI, ca = Math.cos(a), sa = Math.sin(a);
    g.font = '34px system-ui';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const p of PLACES) {
      const dx = (p.x - x) * PX * k, dz = (p.z - z) * PX * k;
      let sx = dx * ca - dz * sa, sy = dx * sa + dz * ca;
      const d = Math.hypot(sx, sy), max = R - 26;
      if (d > max) (sx *= max / d), (sy *= max / d);
      g.fillText(p.icon, R + sx, R + sy);
    }
  }

  private arrow(g: CanvasRenderingContext2D, s: number) {
    g.fillStyle = '#ff4d4d';
    g.strokeStyle = '#fff';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, -s * 1.3);
    g.lineTo(s, s);
    g.lineTo(0, s * 0.45);
    g.lineTo(-s, s);
    g.closePath();
    g.fill();
    g.stroke();
  }

  /** Draws the big map (north up) when it opens. */
  opened() {
    const avail = Math.min(window.innerHeight - 24, (window.innerWidth - 260) * (H / W));
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const h = Math.max(200, avail), w = (h * W) / H;
    this.big.width = w * scale;
    this.big.height = h * scale;
    this.big.style.width = `${w}px`;
    this.big.style.height = `${h}px`;
    const g = this.big.getContext('2d')!;
    const k = this.big.width / W;
    g.drawImage(this.town, 0, 0, this.big.width, this.big.height);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `${26 * scale}px system-ui`;
    for (const p of PLACES) g.fillText(p.icon, mx(p.x) * k, mz(p.z) * k);
    g.font = `bold ${15 * scale}px system-ui`;
    g.fillStyle = '#fff';
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.lineWidth = 4 * scale;
    for (const [t, x, z] of [['Suburb', 0, 60], ['Llama City', 0, -850], ['Country road', 60, -150]] as const) {
      g.strokeText(t, mx(x) * k, mz(z) * k);
      g.fillText(t, mx(x) * k, mz(z) * k);
    }
    g.save();
    g.translate(mx(this.me.x) * k, mz(this.me.z) * k);
    g.rotate(Math.PI - this.me.heading);
    this.arrow(g, 9 * scale);
    g.restore();
  }
}
