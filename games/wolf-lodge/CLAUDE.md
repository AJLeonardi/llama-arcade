# CLAUDE.md: Llama Wolf Lodge

A 3D lodge with an indoor water park (three.js, TypeScript, no physics engine). How to play is in `README.md`.
Run commands from the repo root; this game's tests: `npx vitest run games/wolf-lodge`.

## Code map

- `src/sim/` is plain numbers, **no three.js or DOM**, so it runs in the Node tests.
  - `world.ts`: the lodge as data. +y up, +z out of the front doors to the car park. Regions `LOBBY`, `HALL`
    (guest rooms north of it: `ROOMS`, tiers 1-3), `ADV` (adventure wing, ropes course, dragon), `PARK`
    (water park). Everything solid is a `Box` (walls via `wall()` with `Gap`s for doors/windows, furniture, the open leaf of a room door (`leaf`),
    ropes-course planks). Box flags: `plat` (ropes platform, the harness returns you there), `bounce` (beds),
    `door` (solid only while `doorOpen[id]` is false), `face` (which way a bed/sofa faces, for the view),
    `camera` (invisible but blocks the camera). Mat `none` = solid but not drawn; `bed`/`sofa`/`counter` are
    drawn as furniture by the view. `pools` (rects) and `dips` (the lazy river) lower the floor; `WATER_Y`.
    `spots`: where the action button does something. `RUNES` for the Wand Quest. Queries: `groundAt`,
    `pushOut`, `ceilingAt`, `rayDist` (camera), `areaAt`.
  - `player.ts`: walking, 120 Hz. Accelerates over a few steps, turns before it goes, walk/run by stick
    distance, slower in water, steps up stairs (bigger step out of pools), jumps (higher off beds), the
    ropes-course harness. `phase` is the walk cycle (2π per stride, stride grows with speed); `step` events.
  - `ride.ts`: slide physics. `PathBuilder` (turtle: `line`, `arc`, `through` = Catmull-Rom waypoints that
    leave in the current direction, `downTo`; slope changes eased by `bend`). `Rider` on a `PathSeg`: gravity
    along the slope, friction, drag, push (lean/brake) within `minV`/`maxV`, `roll` up the tube wall from
    v²·curvature, `gForce` for airtime. On a `SurfSeg` (funnel/bowl, h(r) = a(r-r0)² + b(r-r0)): a bead on the
    surface in 2D, exits through `hole` after `passes` swings (funnel) or when it gets there (bowl).
    `frame` = position/forward/up for the view. Lazy river (`loop`) is a current plus steering.
  - `slides.ts`: the rides (`RIDES`), `TOWER`/`DROP_TOWER`, splash pools (`SPLASH`, added by `withPool`),
    the lazy river line (`RIVER`) and its dip, ride spots (at the tower foot for a quick climb, and on the
    decks), `TOWER_STAIRS`.
  - `stairs.ts`: the towers' walk-up stairs as pieces (flights, landings, deck, lone rails), each with its
    railing sides: `spiralStairs` (Big Tower, round the inside, last flight up the east side through a deck
    hole) and `switchbackStairs` (Wolf Drop, on its north face, clear of the drop). `stairBoxes` makes the
    solid boxes (railings `RAIL_H` 1.2 m, higher than a jump); the view draws the same pieces (railings are
    safety-mesh panels with posts, not balusters: those cost ~40k triangles). A landing edge with no flight
    leaving it needs a rail (that was a fall-through once). `stairGuide` steers you round the corners: on
    the stairs, the stick aims at a point 0.9 m further along the centre line (`registerStairs` builds the
    line, through the middle of each lane on a landing). The player remembers up/down (`stairWay`): stick
    forward keeps going that way (the camera lags at corners and U-turns), first pulling back turns round.
- `src/view/`: three.js. Static things go through `build.ts`'s `Batch` (merged per material, metre UVs
  from `worldUV`).
  - `lodge.ts`: `materials()`, floors (dry 0.25 m strips, holes for pools), the sim boxes, roofs, glass
    roof trusses, lobby (tree, fireplace, desk, chandeliers), rooms' furniture, ropes-course ropes, park
    furniture (fort + tipping bucket `FORT`, chairs, lifeguard stands, planters), outside (porte-cochère,
    sign, pines, cars). Moving bits: doors, front doors (`setFrontDoors`), fire, runes, the `Dragon`, the
    bucket's `BlockWater` (instanced blocks that smash into little blocks when they land).
  - `slidesView.ts`: tubes/troughs swept along ride paths (level frames), running water (scrolling
    texture), supports, funnels/bowl from their real profiles (lathe), towers, drop capsule + `trapdoor`,
    `pool()`, the river's ribbons.
  - `person.ts`: `Person`: lathe-shaped limbs on a joint hierarchy; `pose()` modes walk/stand/wave (gait
    from `phase` and speed: stride-matched thigh swing, swing-phase knee bend, bob, hip/shoulder twist, arm
    swing; run blends in), tube, lie (body slides), zip/hang, sleep. `setSwim()`, `tube`, `wand`.
  - `textures.ts`: canvas textures with normal maps (logs, planks, stone, plaster, carpet, tiles, fabric,
    grass, asphalt, water ripples, slide water, signs).
- `src/ui/`: `ui.ts` (title, booking cards `OFFERS`, choice menus, HUD, ride panel), `sfx.ts` (own
  AudioContext: noise for steps/splashes, water rush loop `setRush`, park hum), `style.css`.
- `src/main.ts`: renderer (ACES, PCF shadows following you, `RoomEnvironment` reflections, `Sky`), per-area
  hemisphere light/exposure, NPCs (clerk, lifeguards, walking guests: adults scaled 1.28), modes
  title/walk/ride/menu/busy, spots → actions, doors/wristband, walk camera (collides via `rayDist`), ride
  camera (chase, POV, funnel rim / above the bowl), saving `{ tier, wand, runes, dragon }`.

## Notes

- `tests/rides.test.ts` checks every slide finishes, stays in the park, keeps 2 m from the others and has a
  dry exit. Re-run after moving a slide; the funnel heights (`funnelSpec`) must stay above how high riders
  swing (entry height + v²/2g).
- Draw calls ~120-180, ~180k triangles in the water park.
- Ideas: a wave pool, the tipping bucket soaking you, Story Time in the lobby at night, mini golf, the
  arcade, NPC families riding the slides, a customizable character.
