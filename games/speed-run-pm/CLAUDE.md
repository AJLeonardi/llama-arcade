# CLAUDE.md: Speed Run PM

A 3D running game (three.js, TypeScript, no physics engine), started as a copy of Speed Run AM
(`games/speed-run-am`) and then cut down: no workout room, doors, cape, chasers, boulders, poop, maze or
checkpoints. The kids asked for it to be easier and longer, and for levels not to restart: one endless road.
How to play is in `README.md`. This game's tests: `npx vitest run games/speed-run-pm`.

## Code map

- `src/sim/`: plain data and rules, **no three.js or DOM**, so it all runs in the Node tests.
  - `types.ts`: `Block` (kinds: solid, goo, treadmill (`push`, `gain`), wall (`need`), pad; optional
    `keyboard`, `finish`, `crate`, `slide` (sliding goo), `hidden` (touched, not drawn), `deco` (drawn, not touched)), `Sign` (`block`: hidden when that wall is smashed), `Level`
    (`finishZ`: crossing it finishes; `boulders`), `Boulder`.
  - `physics.ts`: `Sim`. `speed` is the number on screen: no top, can be `Infinity`. `runSpeed(speed)` is how
    fast you really move: +9 units/s per ×10 of speed, capped at `TOP_RUN` (100). The kids found the
    first, steeper curve too fast. Sideways is capped at `SIDEWAYS` so you can steer.
    Moves are cut into pieces of `MAX_MOVE` so nothing is skipped at huge speeds. `treadmillRate()`: past
    speed 33 treadmills grow your speed by a share of itself (exponential). `GOO_SKIM`: run this fast and goo
    is just floor. Walls smash in `moveXZ` when `speed >= need` (`smashed`). `checkpoint` is where a splat
    brings you back: updated every step on plain floor, `BACK_UP` behind you if there's floor there (`floorAt`).
    `boulderZ()`/`hitBoulder()`, `slideX()` (sliding goo isn't solid: it only splats). After a respawn `safe`
    counts down `SAFE_TIME`: boulders and sliding goo can't hurt (main.ts blinks the runner). Generous `COYOTE`/`JUMP_BUFFER`.
  - `levels.ts`: `makeLevel(num, first)` for any num ≥ 1, along +z from 0: a `gym()` with the small free
    treadmills (`GAINS` ×1-×5), then long keyboard stretches (`60 + 10 * d`, each a `road()` with rails) with
    goo, obstacles in the middle of each stretch (`things`: crates, boulders, sliding goo, then crates +
    boulders, placed with a seeded `rng(num)` so a level is the same every time; `few` grows with the level),
    a `gym()` with the big treadmills (×10-×100) right before the speed wall (`wallNeed(num)`), a jump
    pad, and the finish + cup. Gyms are walled in, open only where the road goes through. z = 0 is where the last level's finish line was: its
    finish floor covers -5..5 and its road goes on behind, so with `first = false` our own floor, rails and a
    back wall from z = -80 are `hidden`. 
  - `numbers.ts`: `short()` (1.2K, 5.6M, ∞) and `nice()` (2-digit rounding for wall speeds).
- `src/view/`: `world.ts` (merged blocks per look; walls, sliding goo and boulders are their own meshes; `keyCaps()` draws keyboard
  floors as raised keys, one box each, sunk so their tops are the flat floor you run on), `avatar.ts` (the runner; its cape
  is hidden), `textures.ts` (`keyTopsTex`, `boulderTex`, `crateTex`, sign letters).
- `src/ui/`: `ui.ts` (HUD with ⚡ speed, title and pause screens, toasts), `sfx.ts`, `style.css`.
- `src/main.ts`: renderer, starry night sky, modes (`title`, `play`, `pause`), fixed-step loop, follow
  camera (no lag; pulls back and widens when fast), events, saving (`gameStorage('speed-run-pm')`, key
  `save`: `{ level, speed }`, speed `'inf'` for Infinity). Finishing calls `runOn()`: a new `Sim` for the next
  level, you/the camera moved back by the old `finishZ`, the old level kept drawn behind you (`trail`).
  `window.__speedrun` has `sim`, `save` and `goTo(num)`.

## Tuning notes

- Goo is 0.3 high with a long stretch before it. Running over the keys alone gets you past the walls of
  levels 1-3; from level 4 you need the treadmills.
- The road is 18 wide (`ROAD` = 9); gym treadmills start at `ROAD + 3`, clear of the road through the middle.
- The test robot (`tests/game.test.ts`) tries a jump in a copy of the sim first and only takes jumps that
  land safely, jumps crates in its lane and keeps to the lane farthest from boulders. `playLevel` lets it get
  back up after splats; it runs levels 1, 2, 3, 5 and 8 with just the wall's speed.

## Ideas for later

Different things on the road per level, a time to beat, more treadmill kinds.
