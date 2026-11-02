# CLAUDE.md: Llama Life

A realistic-looking open-world life game (three.js, TypeScript, no physics engine). How to play is in
`README.md`. Run commands from the repo root; this game's tests: `npx vitest run games/llama-life`.
Its look (textures, trees, the person's limbs) started as copies of 3D Skate's code.

## Code map

- `src/sim/` is plain numbers, **no three.js or DOM**, so it runs in the Node tests.
  - `world.ts`: the whole town as data. +x east, +z south (north is up on the map), headings: forward is
    `(sin h, cos h)`, so 0 faces south and `NORTH = PI`. Suburb street grid (`SUB_X`/`SUB_Z`, 10 m streets),
    city grid (`CITY_X`/`CITY_Z`, 14 m avenues), the country road up x = 0, the mansion's driveway.
    `Venue`s are the buildings you can go into: a rectangle of walls (`wallBoxes`) with `doors`, `inner`
    walls, `furniture`, `spots` (where the action button does something: sleep, take, class, work, read,
    dress, tv, snack) and optional `upper` floors (style -1 = house walls, else a tower facade style).
    `MANSION`, `COFFEE`, `MARKET`, `SCHOOL`, `WORK`. Also `houses` (seeded, per block via `houseBlock`),
    `towers`, `trees`, `lamps`, `parked` cars, `props`, `paved` areas, `npcs`, `PLACES` (the map's go-to
    list: a spot on foot and one for your car), `CAR_SPOTS` (your cars, in front of the mansion), `POOL`.
    Collision: `solids` (boxes) in a 16 m grid, `pushOut(p, r, car)` pushes a circle out. `low` boxes stop
    cars but not people: the pool edge and invisible blockers in every doorway, so cars can't drive inside.
  - `walker.ts`: you on foot. Camera-relative stick, run past 0.75, jump, swim (slower) in the pool.
  - `car.ts`: `CAR_TYPES` (size, side outline `body`/`cabin`, wheels, seat, top speed) and `Car` (bicycle-model
    steering, less lock at speed; a row of circles for bumping: head-on bounces, scraping slows).
  - `clock.ts`: hour/day, `HOUR_SECS` (30 s per game hour), night is 7:30 PM to 6 AM, `sleep()` → 7 AM,
    school/work hours, `sunAt`/`daylight`.
  - `life.ts`: the save (`Life`: day, hour, look, `earned` cars, trophies, bag…), `fromSave` cleans an old or
    broken save, `doWork` (next reward car, then trophies), the bag, lessons/books/TV shows, the look colours.
- `src/view/`: three.js.
  - `town.ts`: `Town` draws everything in the world data, merged into one mesh per material per 240 m tile
    (`geo(mat, x, z)`), so far tiles are culled and the shadow pass only draws what's near. Houses (walls with
    a window texture, pitched roof, door, chimney), venues (walls coloured by which way they face, glass shop
    fronts, door frames, floors, ceilings with lights, signs, furniture by kind), towers, roads with lines,
    trees, lamps (glow + a light pool on the ground at night), props, parked cars (the cheap `low` car).
    `update(night)` lights windows, lamps and signs at night.
  - `sky.ts`: `DayNight`: the Sky shader's sun from the hour, stars, sun/moon light with shadows following
    you, fog, exposure, environment strength.
  - `carModel.ts`: `carParts(type, low)` builds a car from its outline (body extruded with rounded edges and
    wheel arches, glass cabin, roof, bumpers, lights, steering wheel, extras: pickup bed, spoiler, monster
    frame). `CarModel` is a drivable one (turning wheels, headlights).
  - `person.ts`: `Person` (lathe-shaped limbs, two-bone IK), poses `stand` (walk/run by speed), `sit`
    (driving, hands on the wheel), `lie` (in bed), `swim`, `air`; five hair styles. `NPC_LOOKS`.
  - `textures.ts`, `trees.ts`, `geo.ts`: copied from 3D Skate; `Geo` has vertex colours (`tint()`), textures
    add grass, house walls (with a lit-window map), shingles, tiles, water.
- `src/ui/`: `ui.ts` (title, "me" maker, pause, bag, HUD, action button, pop-ups, `fade()`), `map.ts`
  (`TownMap`: round heading-up mini-map, big map with go-to buttons, both from one picture of the town),
  `sfx.ts` (own AudioContext: engine hum, horn, take, yum, bell, lullaby…), `style.css`.
- `src/main.ts`: renderer, the loop (60 Hz sim), on foot vs `driving` (an index into `cars`), the action
  button (`currentAction`/`doSpot`), `busy()` for things that take time (fade, clock moves on), the camera
  (follows behind; walks out toward the camera and stops before walls; inside a building it stays under
  the ceiling and inside the walls), the room light and headlights, saving (`gameStorage('llama-life')`,
  key `save`). `window.__life` has `life()`, `me`, `cars()`, `camera`, `renderer`, `town`, `scene`.

## Notes

- Draw calls at the mansion are ~300 with ~260k triangles (shadow pass included). Parked cars use the
  `low` car parts (plain wheels) because they were most of the triangles.
- On foot the camera only swings behind you when you push forward, so walking back toward the camera
  doesn't spin it round.

## Ideas for later

Traffic and people walking on the sidewalks, going upstairs in the mansion, a garage, more shops, money
or a phone, more things to do at home, sitting on sofas and chairs, measuring speed on the real iPad.
