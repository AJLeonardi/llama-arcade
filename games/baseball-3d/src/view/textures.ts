// Textures painted in code: mowed grass, infield dirt, the warning track, brick, wood fence, the crowd.
import * as THREE from 'three';

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, g: c.getContext('2d')! };
}

function tex(c: HTMLCanvasElement, repeat = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function speckle(g: CanvasRenderingContext2D, w: number, h: number, n: number, cols: string[], size = 2) {
  for (let i = 0; i < n; i++) {
    g.fillStyle = cols[i % cols.length];
    g.globalAlpha = 0.25 + Math.random() * 0.35;
    const s = size * (0.5 + Math.random());
    g.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
  g.globalAlpha = 1;
}

/** Grass with mowing stripes in a checkerboard (one tile = 2 stripes each way, `stripe` metres wide). */
export function grassTexture(light = '#4f9a3a', dark = '#3f8530') {
  const { c, g } = canvas(512, 512);
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) {
    g.fillStyle = (x + y) % 2 ? dark : light;
    g.fillRect(x * 256, y * 256, 256, 256);
  }
  speckle(g, 512, 512, 14000, ['#2f6e22', '#6cb34f', '#3b7a2c', '#5aa443'], 2);
  return tex(c);
}

export function dirtTexture(base = '#b7804f') {
  const { c, g } = canvas(256, 256);
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  speckle(g, 256, 256, 6000, ['#9c6a3e', '#c99363', '#a87448', '#d4a274'], 2);
  return tex(c);
}

export function brickTexture() {
  const { c, g } = canvas(256, 256);
  g.fillStyle = '#c9c0b0';
  g.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 16; row++) {
    for (let col = -1; col < 5; col++) {
      const x = col * 64 + (row % 2) * 32;
      g.fillStyle = ['#8e3b2a', '#9b4430', '#7f3424', '#a14a35'][(row * 7 + col * 3) & 3];
      g.fillRect(x + 2, row * 16 + 2, 60, 12);
    }
  }
  speckle(g, 256, 256, 2000, ['#5a2418', '#b8604a'], 2);
  return tex(c);
}

export function woodTexture() {
  const { c, g } = canvas(256, 256);
  for (let i = 0; i < 16; i++) {
    g.fillStyle = ['#a8794a', '#9a6c40', '#b58553', '#93653c'][i & 3];
    g.fillRect(i * 16, 0, 15, 256);
    g.fillStyle = 'rgba(60,35,15,0.6)';
    g.fillRect(i * 16 + 15, 0, 1, 256);
  }
  speckle(g, 256, 256, 3000, ['#6b4422', '#c8955f'], 2);
  return tex(c);
}

/** Chain-link fence: a diamond wire pattern on a transparent background. */
export function chainTexture() {
  const { c, g } = canvas(64, 64);
  g.strokeStyle = '#c8ccd0';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(0, 32); g.lineTo(32, 0); g.lineTo(64, 32); g.lineTo(32, 64); g.closePath();
  g.moveTo(0, 0); g.lineTo(0, 0);
  g.stroke();
  return tex(c);
}

/** A crowd seen from the field: rows of little people in many colours (one row of seats per 64 px). */
export function crowdTexture(teamColor: string) {
  const { c, g } = canvas(512, 256);
  g.fillStyle = '#2a2d33';
  g.fillRect(0, 0, 512, 256);
  const cols = [teamColor, teamColor, '#f4f4f4', '#d8322f', '#2f7de1', '#f2c230', '#43a047', '#222', '#8e24aa', '#ff8a3d'];
  const skins = ['#f1c8a5', '#e0ac85', '#c68863', '#8d5a3c', '#5c3a24'];
  for (let row = 0; row < 8; row++) {
    for (let k = 0; k < 26; k++) {
      if (Math.random() < 0.12) continue; // an empty seat
      const x = k * 20 + 4 + Math.random() * 4, y = row * 32 + 8;
      g.fillStyle = cols[Math.floor(Math.random() * cols.length)];
      g.beginPath();
      g.roundRect(x, y + 10, 13, 18, 4);
      g.fill();
      g.fillStyle = skins[Math.floor(Math.random() * skins.length)];
      g.beginPath();
      g.arc(x + 6.5, y + 6, 5, 0, Math.PI * 2);
      g.fill();
      if (Math.random() < 0.3) {
        g.fillStyle = cols[Math.floor(Math.random() * 3)];
        g.fillRect(x + 1, y, 11, 4); // a cap
      }
    }
  }
  return tex(c);
}

/** A big painted word (for the outfield wall ads and the mound-side logo). */
export function signTexture(text: string, bg: string, fg: string, w = 512, h = 128) {
  const { c, g } = canvas(w, h);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = fg;
  g.font = `900 ${Math.floor(h * 0.55)}px Arial Black, Arial, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 2, w * 0.92);
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
