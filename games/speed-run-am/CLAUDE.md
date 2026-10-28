# CLAUDE.md: Speed Run AM

A 3D running game (three.js, TypeScript, no physics engine). How to play is in `README.md`.
Run commands from the repo root (see the root `CLAUDE.md`); this game's tests: `npx vitest run games/speed-run-am`.

## Code map

- `src/sim/`: plain data and rules, **no three.js or DOM**, so it all runs in the Node tests.
  - `types.ts`: `Block` (a box with a `kind`: solid, goo, treadmill, key, checkpoint, finish, crush, trap,
    door, cape, zone; optional `move`, `push`, `keyboard` (a giant-keyboard floor), `log`), and the moving
    hazards `Chaser`, `Boulder`, `Poop`, plus `Sign` and `Level`.
  - `physics.ts`: `Sim`. Running/jumping started as a copy of Llama-blox's physics (AABB, one axis at a
    time, step-up, coyote time, jump buffer, moving platforms). Added: `boost` (treadmills, keyboard keys and
    keyboard floors make you faster; it fades slowly), `cape` (higher, farther, gliding jumps), the
    hazards (chasers walk round pillars with a `detour`; `boulderZ()`; poop rises once its zone is entered;
    crush walls), `broken` (in pieces until `respawn()`), `fails` (losses since the last checkpoint;
    `FAILS_TO_GYM` sends you to the workout room), traps (`backToStart()`), locked doors (`unlocked`).
  - `maze.ts`: seeded `rng`, `makeMaze(n, seed)` (perfect maze), `solve`, `deadEnds` (where the traps go).
  - `levels.ts`: `workoutRoom()` (level 0) and `makeLevel(num)`: levels 1-9 are the same rooms laid out
    along +z, harder with `d = num - 1`; level 10 is `bigJump()`. Colours: `PINK`/`BROWN` take turns,
    `MAZE_COLORS` for the maze. `LEVEL_INFO` has the names.
- `src/view/`: three.js.
  - `world.ts`: `WorldView`. Still blocks merged per look (tile, goo, belt, finish, log, one per keyboard
    colour set) with `shared/boxes.ts`; moving blocks, keys and doors are their own meshes; chasers,
    boulders, poop and signs. `update()` syncs with the `Sim`.
  - `avatar.ts`: `buildPerson(look)` (the runner `RUNNER` with a cape, the chaser `CHASER`), `animate()`,
    and `Pieces` (breaking into blocks).
  - `textures.ts`: keyboard keys and floors, pink/brown letter signs, boulder, poop, logs. The plain
    textures come from `shared/textures.ts`.
- `src/ui/`: `ui.ts` (HUD with the 💨 speed bar, title/pause/finish screens, toasts), `sfx.ts` (sounds
  made with `shared/sfx.ts`'s `tone()`), `style.css` (started from Llama-blox's).
- `src/main.ts`: renderer, the mode machine (`title`, `play`, `pause`, `finish`), fixed-step loop, follow
  camera (copied from Llama-blox: tilts up over walls, `keepInView`), what each event does, saving
  (`gameStorage('speed-run-am')`, key `save`: `{ done, cape }`). Boost carries from the workout room into
  a level. `window.__speedrun` has `sim`, `save` and `goTo(num)` for poking from the console.

From `shared/`: `Controls`, `BoxBatch`, `Confetti`, plain textures, `tone()`/`unlock()`, plus the usual
`pwa`/`storage`/`home`.

## Tuning notes

- A flat running jump at walking speed is ~5 units edge to edge (`MAX_GAP`); level jumps stay under 4.
- Poop climb steps rise at most 1.6. The poop's speed is worked out from the number of steps. The doorway is
  4.5 tall and the first step is in a corner: a step just inside a low doorway can't be jumped onto (you
  bonk your head). Tests: a robot walks in and climbs every level's steps while the poop rises.
- Maze walls are 3.2 tall so you can't jump over them; dead ends are `trap` pads 0.05 above the floor.
- The workout room faces north (+z) at the doors; +x is on your left, so door 1 is at +x.

## Ideas for later

A robot test that plays a whole level, different rooms per level (each level is the same rooms now),
a time to beat for speed running, a bigger "impossible" jump for level 10.
