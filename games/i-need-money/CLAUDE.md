# CLAUDE.md: I Need Money

A first-person 3D theme park builder (three.js, TypeScript, no physics engine). How to play is in `README.md`.
Run commands from the repo root; this game's tests: `npx vitest run games/i-need-money`.

## Code map

- `src/sim/` is plain numbers, **no three.js or DOM**, so it runs in the Node tests.
  - `catalog.ts`: `RIDES` (30 rides, cheapest first: kind, cost, footprint radius `r`, riders, cycle, size,
    colours, `track` for coasters/flumes). Ticket prices come from `payback()` (seconds of full use to earn
    the price back). The Up-and-Down Tower (`drop`, `grows`) has `dropHeight/Riders/Ticket/Cycle(level)` and
    `biggerCost(level)`. `hireCost`, `money()` formatting.
  - `park.ts`: `Park`: money, rides, guests, helpers. +x east, +z south; the gate is at `z = GATE_Z` (south
    fence). `step(dt, you)` returns `ParkEvent`s (collect, tip, broke, fixed, go). Rides: queue → load riders
    (pay the ticket into `cash`) → run for `cycle` seconds (`phase` 0..1) → maybe break. Guests walk in
    straight lines (no paths), pick rides weighted by price and short lines, leave after a few rides. Workers
    walk to the ride with the most cash and bank it; mechanics fix the nearest broken ride. You collect a
    ride's cash within `COLLECT_DIST` of its edge, and fix it yourself (`youFixing`) by standing close.
    `rot` is the way the entrance faces (0 = south); `entrance(r)` is where the line starts. `save()`/`load()`.
- `src/view/`: three.js.
  - `rides.ts`: `buildRide(type, level)` → `RideModel` (`group`, `top`, `update(phase, running, dt)`,
    `seat()`, and `lap` for coasters, which then sets the sim's `cycle`). One builder per kind. Motion only
    depends on `phase`, so it matches the sim. `bakeStatic` merges each group's direct meshes per material
    (mark a mesh `userData.keep` if it moves on its own). Materials are shared by colour (`M()`).
  - `track.ts`: `makeTrack`: an oval with hills and vertical loops, parallel-transport frames (so cars go
    upside down), and lap timing (slow lift hill, gravity speed, brakes into the station).
  - `world.ts`: grass, fence, gate sign, trees, clouds, `Guests` (one instanced llama mesh), `Helpers`
    (workers: yellow hats; mechanics: orange), `labelSprite` signs, `Puffs` (money flying to your arm,
    smoke from broken rides).
  - `arm.ts`: the builder arm on the camera, and its beam (`zap`).
- `src/main.ts`: renderer and loop, walking/looking with `shared/controls`, the views of the rides
  (`syncViews` rebuilds the tower when it grows), placing a ride (ghost + green/red ring in front of you),
  the bottom panel (placing / riding / the ride you're next to), menus (build, hire, pause), riding (camera on
  `seat()`; coasters look along the track), sounds, saving every 4 s (`gameStorage('i-need-money')`, key
  `save`). `window.__money` has `park()`, `you`, `camera`, `scene`, `renderer`, `views` for debugging.

## Notes

- The Browser pane pauses `requestAnimationFrame` while it's hidden; play-test in headless Playwright then.
- A park with ~20 rides is ~450 draw calls (tested in headless Chromium). Check speed on the real iPad.

## Ideas for later

Paths guests follow, guests riding visibly in the seats, more upgradeable rides, day and night, a park
rating, ride colours.
