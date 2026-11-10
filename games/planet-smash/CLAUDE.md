# CLAUDE.md: Planet Smash

Smash real-looking planets (three.js, TypeScript, no physics engine). How to play is in `README.md`. Run
commands from the repo root; this game's tests: `npx vitest run games/planet-smash`.

## Code map

- `src/sim/game.ts`: plain data and numbers, **no three.js or DOM**. `BODIES` (planets/stars: `kind`
  rocky/gas/ice/star/giant, `hp`, `tab`, picture name, air glow colour, `small` = the Moon one-shots it,
  `rainbowOnly`), `WEAPONS` (damage, crater size), `hit()`, `endingFor()` (rocks / supernova / blackhole),
  `healthPercent()`, `heat()` (gas giants and stars only), `dirToMap()` (direction → picture u/v, matches
  three.js `SphereGeometry`), `exitPoint()` (where a railgun shot leaves the ball).
- `src/view/textures.ts`: loads the pictures from `public/games/planet-smash/textures/` (path from the
  page's own URL), makes Terraformed Mars (recoloured Mars) and the Biggest Star (red-tinted Sun),
  `softDot()`, `puffTex()`, `roundMask()`.
- `src/view/planet.ts`: `Planet`. One custom shader for the ball: lit by `lightDir` (stars glow instead),
  `heat` turns it fiery, `glowMap` is glowing lava in craters, `holes[]` discards round patches (the
  inside, seen through a hole, is drawn as magma via `gl_FrontFacing`), `waves[]` are shock waves rolling
  over the surface with dust behind them. Craters are painted onto a copy of the picture (`crater()`,
  stretched near the poles and wrapped at the seam). Earth has a cloud ball (craters clear the clouds),
  Saturn has rings, planets with air have a halo, stars a glow sprite.
- `src/view/fx.ts`: `Fx` runs per-frame effects (`run(fn)` until it returns false, `after()`), plus
  `flash`, `sparks`, `beam`, `ring`, `gas`, `plume` (dust from big impacts), and the two endings: `rocks()`
  (instanced lumpy rocks coloured from the planet, cooling from red-hot, plus hot gas) and `supernova()`
  (flash, shock rings, shell, sparks, the Crab Nebula picture growing in two layers, a bright core).
- `src/view/weapons.ts`: how each weapon gets there (`fire()`), calling `shot.impact()` on landing.
  `blackHole()` turns the `pull` group toward the hole and squashes the planet into it.
- `src/view/space.ts`: Milky Way sphere + twinkling star points.
- `src/sfx.ts`: own AudioContext; zaps, booms, whooshes from oscillators and noise.
- `src/main.ts`: screens (title → pick → smash), swipe-to-spin with fling, tap-to-fire (raycast →
  planet-space direction), the `impact` handler (blocked shots, craters, holes, shock waves, damage), the
  endings, the health bar, photos (render then copy the canvas, with a caption), saving
  (`gameStorage('planet-smash')`: `weapon`, `smashed` counts). Camera distance comes from the screen size
  and the weapon panel's width (`setViewOffset` keeps the planet centred in the free space).
  `window.__smash` has `start(id)`, `chooseWeapon(id)`, `aimAt(localDir)`, `planet`, `hp` for testing.

## Notes

- Additive glows add up fast: many overlapping gas puffs turned the whole screen white once. Keep puff
  counts and opacities low.
- The kids didn't want a death counter; the meter is planet health only.
- Check new screens at 844×390 (phone on its side): the weapon list folds into two columns there.

## Ideas for later

A photo album, more planets (Pluto, moons of Jupiter), more weapons, pinch to zoom.
