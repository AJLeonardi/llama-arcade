// Loading the real planet pictures, and making the two that aren't real (terraformed Mars, the biggest star).
import * as THREE from 'three';

/** The textures folder as served (works in dev and in the build, at any sub-path). */
export const TEX_URL = `${location.pathname.replace(/[^/]*$/, '')}textures/`;

const FILES = ['mercury', 'venus', 'earth', 'earth_clouds', 'moon', 'mars', 'jupiter', 'saturn', 'saturn_ring',
  'uranus', 'neptune', 'sun', 'milky_way', 'nebula'];

const images = new Map<string, HTMLImageElement | HTMLCanvasElement>();

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${src}`));
    img.src = src;
  });
}

/** Load every picture once, then make the made-up ones. */
export async function loadAll(onProgress?: (done: number, total: number) => void): Promise<void> {
  let done = 0;
  await Promise.all(
    FILES.map(async (f) => {
      images.set(f, await loadImage(`${TEX_URL}${f}.webp`));
      onProgress?.(++done, FILES.length);
    }),
  );
  images.set('mars-green', terraform(images.get('mars')!));
  images.set('giant-star', redGiant(images.get('sun')!));
}

export function image(name: string): HTMLImageElement | HTMLCanvasElement {
  const img = images.get(name);
  if (!img) throw new Error(`no picture ${name}`);
  return img;
}

/** A small picture for the planet chooser (a data URL for the made-up ones, the file for real ones). */
export function thumbUrl(name: string): string {
  const img = images.get(name);
  if (img instanceof HTMLCanvasElement) return img.toDataURL('image/jpeg', 0.8);
  return `${TEX_URL}${name}.webp`;
}

/** A fresh copy to draw craters on. */
export function copyCanvas(name: string, w?: number, h?: number): HTMLCanvasElement {
  const img = image(name);
  const c = document.createElement('canvas');
  c.width = w ?? img.width;
  c.height = h ?? img.height;
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return c;
}

export function texture(name: string): THREE.Texture {
  const t = new THREE.Texture(image(name) as HTMLImageElement);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Mars with oceans in the low dark places, forests, and white poles. */
function terraform(mars: HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement {
  const W = 1024, H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(mars, 0, 0, W, H);
  const data = ctx.getImageData(0, 0, W, H);
  const d = data.data;
  for (let y = 0; y < H; y++) {
    const lat = Math.abs(y / H - 0.5) * 2; // 0 at the equator, 1 at the poles
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const lum = (d[i] * 0.4 + d[i + 1] * 0.4 + d[i + 2] * 0.2) / 255;
      const detail = 0.75 + lum * 0.5;
      let r: number, g: number, b: number;
      if (lat > 0.86) {
        r = g = b = 235 * detail;
      } else if (lum < 0.3) {
        const deep = Math.max(0, (0.3 - lum) / 0.3);
        r = 20; g = 70 + 40 * (1 - deep); b = 150 + 50 * (1 - deep);
      } else if (lum < 0.45) {
        r = 45 * detail; g = 120 * detail; b = 50 * detail;
      } else if (lum < 0.55) {
        r = 110 * detail; g = 140 * detail; b = 70 * detail;
      } else {
        r = d[i] * 0.9; g = d[i + 1] * 0.85; b = d[i + 2] * 0.8;
      }
      d[i] = r; d[i + 1] = g; d[i + 2] = b;
    }
  }
  ctx.putImageData(data, 0, 0);
  return c;
}

/** The Sun's picture made deep red-orange, for the biggest star (a red hypergiant). */
function redGiant(sun: HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 512;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(sun, 0, 0, c.width, c.height);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = '#ff6a3a';
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

/** A soft round dot, for glows, gas and sparks. */
let soft: THREE.Texture | null = null;
export function softDot(): THREE.Texture {
  if (soft) return soft;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.7)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.15)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  soft = new THREE.CanvasTexture(c);
  return soft;
}

/** A puffy cloud, for hot gas and nebulas. */
let puff: THREE.Texture | null = null;
export function puffTex(): THREE.Texture {
  if (puff) return puff;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  for (let i = 0; i < 14; i++) {
    const x = 64 + (Math.random() - 0.5) * 50, y = 64 + (Math.random() - 0.5) * 50, r = 20 + Math.random() * 28;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  puff = new THREE.CanvasTexture(c);
  return puff;
}

/** White in the middle fading to black at the edge: hides the square edges of a picture. */
let edgeMask: THREE.Texture | null = null;
export function roundMask(): THREE.Texture {
  if (edgeMask) return edgeMask;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, '#fff');
  g.addColorStop(0.55, '#fff');
  g.addColorStop(0.97, '#000');
  g.addColorStop(1, '#000');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  edgeMask = new THREE.CanvasTexture(c);
  return edgeMask;
}
