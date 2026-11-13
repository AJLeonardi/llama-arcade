// The World Cup stadium: striped grass with the lines painted on, two goals with nets, ad boards, stands
// full of fans, and four floodlight towers. Everything is drawn in code.
import * as THREE from 'three';
import { FIELD } from '../sim/match';

const MARGIN = 8;

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function tex(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Grass with mowing stripes and the white lines, covering the field plus a margin. */
function grassTexture() {
  const W = FIELD.halfW * 2 + MARGIN * 2, L = FIELD.halfL * 2 + MARGIN * 2;
  const ppm = 18; // pixels per metre
  const [c, g] = canvas(Math.round(W * ppm), Math.round(L * ppm));
  // Canvas x = world x (flipped so +x is on the left as seen from the camera), canvas y = world -z... set up below.
  const X = (x: number) => (W / 2 - x) * ppm;
  const Z = (z: number) => (L / 2 - z) * ppm;
  g.fillStyle = '#2f8f3c';
  g.fillRect(0, 0, c.width, c.height);
  const stripe = 4;
  for (let i = 0; i * stripe < L; i++) {
    if (i % 2) continue;
    g.fillStyle = '#38a046';
    g.fillRect(0, i * stripe * ppm, c.width, stripe * ppm);
  }
  // Specks, so it looks like grass up close.
  for (let i = 0; i < 6000; i++) {
    g.fillStyle = Math.random() < 0.5 ? 'rgba(20,70,25,.25)' : 'rgba(120,200,110,.18)';
    g.fillRect(Math.random() * c.width, Math.random() * c.height, 2, 2);
  }
  g.strokeStyle = 'rgba(255,255,255,.92)';
  g.lineWidth = 0.14 * ppm;
  const rect = (x0: number, z0: number, x1: number, z1: number) => {
    g.strokeRect(Math.min(X(x0), X(x1)), Math.min(Z(z0), Z(z1)), Math.abs(X(x1) - X(x0)), Math.abs(Z(z1) - Z(z0)));
  };
  const { halfW, halfL } = FIELD;
  rect(-halfW, -halfL, halfW, halfL);
  g.beginPath();
  g.moveTo(X(-halfW), Z(0));
  g.lineTo(X(halfW), Z(0));
  g.stroke();
  g.beginPath();
  g.arc(X(0), Z(0), 5 * ppm, 0, Math.PI * 2);
  g.stroke();
  for (const s of [1, -1]) {
    rect(-8, s * halfL, 8, s * (halfL - 7));
    rect(-4.5, s * halfL, 4.5, s * (halfL - 2.5));
    g.fillStyle = '#fff';
    for (const [x, z, r] of [[0, s * (halfL - 5.5), 0.22], [0, 0, 0.25]]) {
      g.beginPath();
      g.arc(X(x), Z(z), r * ppm, 0, Math.PI * 2);
      g.fill();
    }
    g.beginPath();
    g.arc(X(0), Z(s * (halfL - 5.5)), 4 * ppm, s > 0 ? Math.PI * 0.18 : Math.PI * 1.18, s > 0 ? Math.PI * 0.82 : Math.PI * 1.82);
    g.stroke();
  }
  return { t: tex(c), W, L };
}

function netTexture() {
  const [c, g] = canvas(128, 128);
  g.strokeStyle = 'rgba(255,255,255,.85)';
  g.lineWidth = 3;
  for (let i = 0; i <= 128; i += 16) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 128);
    g.moveTo(0, i);
    g.lineTo(128, i);
    g.stroke();
  }
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function crowdTexture() {
  const [c, g] = canvas(1024, 256);
  g.fillStyle = '#26303d';
  g.fillRect(0, 0, 1024, 256);
  const cols = ['#e63946', '#f1faee', '#1d3557', '#ffd166', '#06d6a0', '#ef476f', '#118ab2', '#ff9f1c', '#b5179e', '#ffffff'];
  for (let row = 0; row < 16; row++) {
    g.fillStyle = row % 2 ? '#2d3848' : '#222b37';
    g.fillRect(0, row * 16, 1024, 16);
    for (let i = 0; i < 90; i++) {
      const x = i * 11.4 + (row % 2) * 5 + Math.random() * 3;
      g.fillStyle = cols[Math.floor(Math.random() * cols.length)];
      g.fillRect(x, row * 16 + 3, 8, 9); // shirt
      g.fillStyle = Math.random() < 0.5 ? '#e0b48a' : '#8d5a3b';
      g.beginPath();
      g.arc(x + 4, row * 16 + 3, 3.2, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = tex(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

function boardTexture() {
  const words: [string, string, string][] = [
    ['LLAMA ARCADE', '#1f5fbf', '#fff'],
    ['GO USA!', '#b22234', '#fff'],
    ['HAY FOR ALL', '#ffd166', '#5b3a1a'],
    ['REVOLUTION', '#0a2240', '#e63946'],
    ['WORLD CUP', '#2a9d4b', '#fff'],
    ['SPIT-FREE ZONE', '#ff9f1c', '#222'],
  ];
  const [c, g] = canvas(2048, 64);
  const w = 2048 / words.length;
  words.forEach(([txt, bg, fg], i) => {
    g.fillStyle = bg;
    g.fillRect(i * w, 0, w, 64);
    g.fillStyle = fg;
    g.font = 'bold 40px Arial Black, Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(txt, i * w + w / 2, 34);
  });
  const t = tex(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

export function buildStadium(scene: THREE.Scene) {
  const { halfW, halfL, goalHalfW, goalH, goalDepth } = FIELD;
  const grass = grassTexture();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(grass.W, grass.L), new THREE.MeshLambertMaterial({ map: grass.t }));
  ground.rotation.x = -Math.PI / 2;
  ground.rotation.z = Math.PI; // so canvas left (+x on the camera's left) lines up
  scene.add(ground);
  // An outer ring of plain ground under the stands.
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ color: '#2a6b33' }));
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -0.02;
  scene.add(apron);

  // Goals: white posts and bar, and a net.
  const white = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  const net = new THREE.MeshBasicMaterial({ map: netTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false });
  const postR = 0.09;
  for (const s of [1, -1]) {
    const goal = new THREE.Group();
    goal.position.z = s * halfL;
    goal.rotation.y = s > 0 ? 0 : Math.PI;
    for (const x of [-goalHalfW, goalHalfW]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(postR, postR, goalH, 10), white);
      post.position.set(x, goalH / 2, 0);
      goal.add(post);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(postR, postR, goalHalfW * 2 + postR * 2, 10), white);
    bar.rotation.z = Math.PI / 2;
    bar.position.y = goalH;
    goal.add(bar);
    const plane = (w: number, h: number, rx: number, ry: number, x: number, y: number, z: number) => {
      const m = net.clone();
      m.map = net.map!.clone();
      m.map.repeat.set(w * 2, h * 2);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
      p.rotation.set(rx, ry, 0);
      p.position.set(x, y, z);
      goal.add(p);
    };
    plane(goalHalfW * 2, goalH, 0, 0, 0, goalH / 2, goalDepth);
    plane(goalDepth, goalH, 0, Math.PI / 2, goalHalfW, goalH / 2, goalDepth / 2);
    plane(goalDepth, goalH, 0, Math.PI / 2, -goalHalfW, goalH / 2, goalDepth / 2);
    plane(goalHalfW * 2, goalDepth, Math.PI / 2, 0, 0, goalH, goalDepth / 2);
    scene.add(goal);
  }

  // Ad boards round the field, with a gap for each goal.
  const boardMat = new THREE.MeshLambertMaterial({ map: boardTexture() });
  const board = (len: number, x: number, z: number, ry: number) => {
    const m = boardMat.clone();
    m.map = boardMat.map!.clone();
    m.map.repeat.set(len / 30, 1);
    m.map.needsUpdate = true;
    const b = new THREE.Mesh(new THREE.BoxGeometry(len, 0.9, 0.12), m);
    b.position.set(x, 0.45, z);
    b.rotation.y = ry;
    scene.add(b);
  };
  board(halfL * 2 + 0.4, halfW + 0.1, 0, Math.PI / 2);
  board(halfL * 2 + 0.4, -halfW - 0.1, 0, -Math.PI / 2);
  const endLen = halfW - goalHalfW - 0.2;
  for (const s of [1, -1]) {
    board(endLen, goalHalfW + 0.2 + endLen / 2, s * (halfL + 0.1), s > 0 ? Math.PI : 0);
    board(endLen, -goalHalfW - 0.2 - endLen / 2, s * (halfL + 0.1), s > 0 ? Math.PI : 0);
    // A board behind the net too.
    board(goalHalfW * 2 + 2, 0, s * (halfL + goalDepth + 0.8), s > 0 ? Math.PI : 0);
  }

  // Stands: sloped banks of fans on all four sides.
  const crowd = crowdTexture();
  const stand = (len: number, dist: number, ry: number) => {
    const m = new THREE.MeshLambertMaterial({ map: crowd.clone(), side: THREE.DoubleSide });
    m.map!.repeat.set(len / 40, 1);
    m.map!.needsUpdate = true;
    const g = new THREE.Group();
    const slope = new THREE.Mesh(new THREE.PlaneGeometry(len, 16), m);
    slope.rotation.x = Math.PI / 2 - 0.6; // rises away from the field; seen from its back side
    slope.position.set(0, 4.6, 5.6);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(len, 0.4, 7), new THREE.MeshLambertMaterial({ color: '#d7dde6' }));
    roof.position.set(0, 12.5, 9);
    const back = new THREE.Mesh(new THREE.BoxGeometry(len, 13, 0.4), new THREE.MeshLambertMaterial({ color: '#3a4656' }));
    back.position.set(0, 6.3, 12.6);
    g.add(slope, roof, back);
    g.rotation.y = ry;
    g.position.set(Math.sin(ry) * dist, 0, Math.cos(ry) * dist);
    scene.add(g);
  };
  stand(halfL * 2 + 16, halfW + 3, Math.PI / 2);
  stand(halfL * 2 + 16, halfW + 3, -Math.PI / 2);
  stand(halfW * 2 + 16, halfL + 5, 0);
  stand(halfW * 2 + 16, halfL + 5, Math.PI);

  // Floodlight towers in the corners.
  const pole = new THREE.MeshLambertMaterial({ color: '#9aa4b1' });
  const lamp = new THREE.MeshBasicMaterial({ color: '#fffbe6' });
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 26, 8), pole);
    p.position.set(x * (halfW + 12), 13, z * (halfL + 12));
    const l = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 0.6), lamp);
    l.position.set(x * (halfW + 12), 26.5, z * (halfL + 12));
    l.lookAt(0, 0, 0);
    scene.add(p, l);
  }
}
