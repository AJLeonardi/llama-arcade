import { describe, expect, it } from 'vitest';
import { BODIES, WEAPONS, healthPercent, bigNumber, bodyById, dirToMap, endingFor, exitPoint, heat, hit, weaponById } from '../src/sim/game';

describe('smashing', () => {
  it('a railgun takes several shots to smash Earth', () => {
    const earth = bodyById('earth');
    const rail = weaponById('railgun');
    let hp = earth.hp;
    let shots = 0;
    while (hp > 0) {
      hp = hit(earth, rail, hp).hp;
      shots++;
    }
    expect(shots).toBeGreaterThan(2);
  });

  it('the Moon smashes small planets on the first try, but not Earth', () => {
    const moon = weaponById('moon');
    for (const b of BODIES.filter((b) => b.small)) expect(hit(b, moon, b.hp).destroyed).toBe(true);
    const earth = bodyById('earth');
    expect(hit(earth, moon, earth.hp).destroyed).toBe(false);
  });

  it('only the Rainbow Laser can hurt the biggest star, and it takes many shots', () => {
    const star = bodyById('giant-star');
    for (const w of WEAPONS.filter((w) => w.id !== 'rainbow')) {
      const r = hit(star, w, star.hp);
      expect(r.blocked).toBe(true);
      expect(r.hp).toBe(star.hp);
    }
    const rainbow = weaponById('rainbow');
    let hp = star.hp;
    let shots = 0;
    while (hp > 0) {
      hp = hit(star, rainbow, hp).hp;
      shots++;
    }
    expect(shots).toBeGreaterThanOrEqual(6);
  });

  it('a black hole swallows anything else in one go', () => {
    const bh = weaponById('blackhole');
    for (const b of BODIES.filter((b) => !b.rainbowOnly)) {
      expect(hit(b, bh, b.hp).destroyed).toBe(true);
      expect(endingFor(b, bh)).toBe('blackhole');
    }
  });

  it('rocky planets end in rocks, gas and ice giants and stars in a supernova', () => {
    const laser = weaponById('laser');
    expect(endingFor(bodyById('mars'), laser)).toBe('rocks');
    expect(endingFor(bodyById('jupiter'), laser)).toBe('supernova');
    expect(endingFor(bodyById('neptune'), laser)).toBe('supernova');
    expect(endingFor(bodyById('sun'), laser)).toBe('supernova');
  });
});

describe('health bar and heat', () => {
  it('shows how much health a planet has left', () => {
    const earth = bodyById('earth');
    expect(healthPercent(earth, earth.hp)).toBe(100);
    expect(healthPercent(earth, earth.hp / 2)).toBe(50);
    expect(healthPercent(earth, 0)).toBe(0);
    expect(healthPercent(earth, -5)).toBe(0);
  });

  it('gas giants get hotter, rocky planets do not', () => {
    const j = bodyById('jupiter');
    expect(heat(j, j.hp)).toBe(0);
    expect(heat(j, j.hp / 4)).toBeCloseTo(0.75);
    expect(heat(bodyById('earth'), 1)).toBe(0);
  });

  it('writes big numbers with commas', () => {
    expect(bigNumber(8_200_000_000)).toBe('8,200,000,000');
    expect(bigNumber(12)).toBe('12');
  });
});

describe('aiming maths', () => {
  it('maps directions onto the planet picture like three.js spheres do', () => {
    // three.js SphereGeometry: x = -cos(phi) sin(theta), y = cos(theta), z = sin(phi) sin(theta)
    for (const [u, v] of [[0.1, 0.3], [0.5, 0.5], [0.8, 0.9], [0.25, 0.1]]) {
      const phi = u * Math.PI * 2, theta = v * Math.PI;
      const m = dirToMap(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta));
      expect(m.u).toBeCloseTo(u);
      expect(m.v).toBeCloseTo(v);
    }
  });

  it('a straight shot through the middle comes out the opposite side', () => {
    const e = exitPoint([0, 0, 1], [0, 0, -1]);
    expect(e[2]).toBeCloseTo(-1);
    const s = exitPoint([0.6, 0, 0.8], [0, 0, -1]); // a slanted hit comes out on the same side's back
    expect(Math.hypot(...s)).toBeCloseTo(1);
    expect(s[0]).toBeCloseTo(0.6);
    expect(s[2]).toBeCloseTo(-0.8);
  });
});
