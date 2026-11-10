// The sky: the real Milky Way picture far away, with sharp twinkling stars in front of it.
import * as THREE from 'three';
import { texture } from './textures';

export function makeSpace(scene: THREE.Scene): { update(t: number): void } {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 48, 32),
    new THREE.MeshBasicMaterial({ map: texture('milky_way'), side: THREE.BackSide, color: 0x8a8a8a, depthWrite: false }),
  );
  sky.rotation.set(0.6, 0, 0.9);
  scene.add(sky);

  const N = 3500;
  const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), size = new Float32Array(N), phase = new Float32Array(N);
  const tints = [[1, 1, 1], [0.75, 0.85, 1], [1, 0.92, 0.75], [1, 0.75, 0.6], [0.85, 0.9, 1]];
  for (let i = 0; i < N; i++) {
    const z = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - z * z);
    pos.set([Math.cos(a) * r * 700, z * 700, Math.sin(a) * r * 700], i * 3);
    const t = tints[Math.floor(Math.random() * tints.length)];
    const b = 0.5 + Math.random() * 0.5;
    col.set([t[0] * b, t[1] * b, t[2] * b], i * 3);
    size[i] = Math.random() < 0.97 ? 1 + Math.random() * 1.6 : 3 + Math.random() * 2.5;
    phase[i] = Math.random() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, dpr: { value: Math.min(window.devicePixelRatio || 1, 2) } },
    vertexShader: /* glsl */ `
      attribute float size; attribute float phase; attribute vec3 color;
      uniform float time; uniform float dpr; varying vec3 vC;
      void main() {
        float tw = 0.75 + 0.25 * sin(time * (1.5 + fract(phase) * 2.0) + phase);
        vC = color * tw;
        gl_PointSize = size * dpr;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vC;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(vC * a, 1.0);
      }`,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  });
  const stars = new THREE.Points(geo, mat);
  scene.add(stars);
  return { update: (t) => (mat.uniforms.time.value = t) };
}
