# CLAUDE.md: Llama-blox

A Roblox-style 3D blocky world (three.js, TypeScript, no physics engine). How to play is in `README.md`.
Run commands from the repo root (see the root `CLAUDE.md`); this game's tests: `npx vitest run games/blox`.

## Code map

- `src/sim/`: plain data and rules, **no three.js or DOM**, so it all runs in the Node tests.
  - `types.ts`: `Block` (a box with a `kind`: solid, lava, bounce, speed, checkpoint, finish, conveyor,
    vanish, portal, shop; optional `move`, `push`, `level`, `deco`) and `Level`.
  - `physics.ts`: `Sim`, the player in a world of boxes. Fixed 60 Hz `step(input)` returns events (`coin`,
    `oops`, `finish`, `portal`…). Collisions are AABB, resolved one axis at a time (y, then x, then z), with
    step-up onto low ledges, coyote time, jump buffering, moving platforms that carry you, and vanish timers.
    Tuning constants (`WALK`, `JUMP`, `GRAVITY`, `BOUNCE`…) are at the top.
  - `course.ts`: `Course`, a cursor for laying out obbies along +z (`add({ gap, rise, side, kind… })`); it
    records the main `path` for the tests.
  - `levels.ts`: the hub (Llama Island: portals, shop, trees, trampoline) and the obbies. `LEVELS`, `OBBY_IDS`,
    `WORLD_IDS` (the worlds below, through the doorways on the west side).
  - `prison.ts`: Jail Break, a hand-built level (not a `Course`) with keys/doors, a vent maze (`crawl` zones under
    see-through grates), and searchlights (`spot`). It has a `route` of waypoints for the robot test.
  - `coaster.ts`: Coaster Park. `Track` turns a closed loop of points into evenly spaced samples with a forward and
    an "up" (carried along smoothly so loops turn you upside down); `Ride` is one lap (chain lift, gravity, brakes).
  - `rocket.ts`: Rocket Lab. Parts, `addPart`/`undoPart`/`checkDesign`, `liftRatio`, `steadiness` (fins low down
    keep it straight), and `fly()`, which works out a whole flight up front (stages, boosters, air, wobble,
    weaker gravity higher up). `hint()` says what to try next. Tuned so the Moon needs three stages and boosters.
  - `burger.ts`: Llama Burgers. `Restaurant` (grill, fryer, hands, customers at the counter and drive-through,
    `actions(station)` / `act(id)` / `step(dt)` → events) and the building.
  - `fish.ts`: Fish Tank to the Ocean. `FishSim` is a ball (the bowl, bottle or bucket, or the fish on its own while
    flopping) rolling over the level's boxes and `Ramp`s (sloped tops, only solid from above): sphere-vs-box
    contacts, rolling drag, cracking on hard landings (`VESSELS[v].crack`) or in hazard zones (`goo`, `hot`,
    `drop`), the 50 s air bar, water objects to jump into, and level 1's bag (`buy`) and clock. `fishLevels.ts`
    has the 7 levels (`Build` helper, all laid out along +z) with a `route` each for the robot in
    `tests/fish.test.ts`. The walker waits on a block up in the sky in these levels, hidden.
  - `shop.ts`: the outfit catalogue (`ITEMS`), `Save` (coins, owned, outfit, done), `fixSave`, `pick` (buy/wear).
- `src/view/`: three.js.
  - `boxes.ts`: `BoxBatch` merges many boxes into one geometry with vertex colours and world-sized UVs.
  - `world.ts`: `WorldView` builds a level. Static blocks are merged per look (tile, lava, bounce, speed,
    finish); moving/vanish blocks and belts are their own meshes; coins are one InstancedMesh. `update()`
    syncs them with the `Sim` each frame.
  - `avatar.ts`: `buildAvatar(outfit)` (llama or person, hat/glasses/cape) and `animate()`. Rebuilt on change.
  - `textures.ts`: every texture drawn on canvas. `confetti.ts`: the finish burst.
- `src/ui/`: `ui.ts` (HUD, menus, shop panel; DOM only written on change), `controls.ts` (floating touch
  joystick on the left 45%, look-drag elsewhere, jump button, keyboard), `sfx.ts` (WebAudio beeps),
  `style.css`.
- `src/worlds/`: the worlds' own games, plugged into main.ts through `Activity` (`activity.ts`): context
  buttons, locking the player while riding/building, placing the avatar and the camera. `index.ts` maps level
  id → activity. `coaster.ts` (tracks, trains, wheel, riding cameras), `rocket.ts` (workshop panel, rocket
  meshes, flight playback with time speed-up, sky/planet/Moon), `burger.ts` (customers, cars, bubbles, food),
  `npc.ts` (random riders and customers, sitting pose), `fish.ts` (bowl/fish/ramp meshes, the fish and level menu, air
  bar and clock; it uses the optional `Activity.drive`/`follow` so main.ts sends it the controls and the camera
  follows the bowl; saves under key `fish`; `window.__fish` for poking).
- `src/main.ts`: renderer, sky, lights, the mode machine (`title`, `play`, `pause`, `shop`, `finish`), the
  loop (fixed-step sim + interpolated player), the follow camera (it tilts up, then pulls in, to see over walls:
  `keepInView`) and saving (`gameStorage('blox')`, key `save`; Rocket Lab keeps the rocket under key `rocket`).
  `window.__blox` exposes `sim`, `save`, `LEVELS` and `goTo(levelId)` for poking from the console.

## Making levels

- Use `Course` so new jumps are checked: `tests/levels.test.ts` has a robot that plays each obby with the
  real physics and must reach the finish with at most 2 slips. Add new obby ids to `OBBIES` in `levels.ts`.
- Rules of thumb learned so far: a flat running jump reaches ~5 units edge to edge (`MAX_GAP`); keep lava
  stripes at least ~7 apart so landing from one jump doesn't put you on the next; and a bounce pad's
  target platform must be at least ~3.5 away, or you bonk your head on its underside on the way up.
- Special blocks always use the same colours (`course.ts:KIND_COLOR`) so kids learn what they do.
- Levels that aren't a straight `Course` get a `route` (waypoints; `wait: true` = wait for searchlights) and a
  test using `tests/robot.ts:walkRoute`. Also test that the keys/trampoline are really needed.
- Walls only need to be taller than a jump from the highest thing next to them (~2.3 + that height). Keep them
  low where you can: the camera has to see over them.
- Fish levels: a bowl jump is ~1.6 up and ~4.5 across; falls over ~5 crack it; a bounce target should start
  ~2–3 beyond the pad's edge or the ball hits its side on the way up. Hazard zones only count when you're well
  inside them; give the robot a `jump` waypoint just before each one.

## Ideas for later

More obbies, pets that follow you, a build mode (place blocks), playing together over QR pairing. Rocket Lab:
landing on the Moon. Burgers: more foods, a busier lunch rush.
