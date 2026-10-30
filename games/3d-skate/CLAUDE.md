# CLAUDE.md: 3D Skate

A realistic-looking 3D skateboarding game (three.js, TypeScript, no physics engine). How to play is in
`README.md`. Run commands from the repo root (see the root `CLAUDE.md`); this game's tests:
`npx vitest run games/3d-skate`.

## Code map

- `src/sim/` is plain numbers, **no three.js or DOM**, so it runs in the Node tests.
  - `world.ts`: the city as data. Axes: +z down the street, +x is the skater's left, +y up. The tall
    building is at z < 0 (roof at `ROOF_Y`, spawn `SPAWN`); the street runs to `CITY_LEN` (10 miles),
    `HALF_W` either side of the middle. Everything solid is a `Piece`: a `box` or a `ramp` (a `Profile`,
    the height along one axis built with `ProfileBuilder` lines/arcs/steps, solid down to the ground).
    `MEGA` is the mega ramp in two parts: the drop (roll-in, 50° drop, curve up to a 60° kicker whose lip
    is ~70 m up, halfway down the building) and, after a 12 m gap, the landing ramp (flat deck a bit
    lower than the lip, 28° slope, curve to flat); guard walls along both. The streets: the main street
    (`HALF_W` either side of x = 0), a side street each side (`SIDE_X0`..`SIDE_X1`), and cross streets
    every `CROSS_EVERY` m (`crossAt(z)`) joining all three; everything else is building (`outside`). `chunk(i)` makes 100 m of street from a seeded `rng(i)`: sidewalks, 3 slots per side
    filled from `FEATURES`, a `bigJump` table-top in the middle every 400 m; the side streets get
    `SIDE_FEATURES` (fountain with a grindable round bench and basin rim, stairs up and down with
    handrails and a hubba ledge, planters, benches with a kinked rail, bank-to-ledge), the cross streets a
    ledge or rail; lamps/trees/benches, mile signs, buildings filling the blocks (`chunkBuildings`).
    Pieces are `box`, `ramp` or `ring` (round, flat-topped: fountain bench and basin). Look `hidden` is solid
    but drawn as something else (a ride, a stand). Chunk -2 is Skateland (`PARK`, `parkPieces`): an
    amusement park beside the right-hand side street near the start, with the `COASTER` track (ridden
    like a ramp, red rails on both edges), carousel platform, giant halfpipe, food stands, Ferris wheel. Chunk -1 is the start area. `surfaceAt(x, z, feet)` = the highest surface at most `STEP_UP`
    above `feet`, and `wall` if something is taller; `railsAt(z)`.
  - `skater.ts`: `Skater`, stepped at 120 Hz. Modes `ground` (rolls along `heading` at `speed`, gravity
    along the slope, auto-turns round when rolling backwards), `air` (leaves the ground when it drops away
    faster than gravity: lips, ledges, stairs), `grind` (locked to a `Rail`), `bail` (slides, then gets up
    where it is or at the last flat spot). Tricks: `kick` (kickflip progress), `pitch`/`flipping`
    (backflip), `spun` (air spins); `land()` checks they're finished and scores them. A grind runs on
    from one rail piece onto the next that starts where it ends (`nextRail`), so curved and bent rails
    (fountain benches, the coaster) are one smooth grind. Walls are checked at the board's
    nose (`REACH` ahead), so the board and body stop at a ramp's side instead of sinking in: glance off,
    or "Bonk!" head-on above 7 m/s. At top pushing speed `cruising` stops pushing until you have slowed by `PUSH_AGAIN`, so the pose does not flicker between pushing and riding. Rails are solid when you're not grinding (`railCrossed`): ride into
    one and you glance off (or fall, head-on and fast); clip one in the air and you bounce back. Events go to `events` for sounds and pop-ups.
- `src/view/`: three.js.
  - `city.ts`: `CityView` streams chunks (2 behind, 6 ahead, one built per frame) and draws exactly the
    sim's pieces (ramp tops with smooth normals, sides down to the ground), rails with posts, props,
    buildings (facade UVs line up with the floors) and far-off skyline towers. One merged mesh per
    material per chunk.
  - `textures.ts`: noise-based concrete/plywood/ramp/roof with normal maps, building facades with a
    roughness(G)/metalness(B) map so the glass reflects the sky, deck graphics (`BOARDS`, which also hold
    each board's push/pop stats), text signs, and the asphalt photo (`public/games/3d-skate/textures/`).
  - `skaterModel.ts`: the board (bent deck with kicktails, grip tape, trucks, wheels) and the person
    (lathe-shaped limbs from `shaped()` radius profiles, aimed joint to joint, two-bone IK so the feet stay
    on the deck; denim/cotton `cloth()` materials with sheen; a face, hands with thumbs, sleeves, belt). `pose()` does crouch,
    pushing (turned to face the nose, front foot pointing forward, back foot stroking along the ground:
    `pushB` eases in and out, `pushPh` is the stroke), ollie pop, kickflip, backflip and falling. `Look` and the colour lists for the skater maker.
  - `trees.ts`: street trees: a forked bark trunk and a crown of two-sided leaf cards painted from the leaf
    photo (`leaves_broad.webp`, copied from Llama Drive), normals pointing out of the crown so it shades
    like a ball; a depth material so shadows show the gaps. Four shapes (`TREE_KINDS` in `city.ts`).
  - `park.ts`: Skateland's rides and props (gate, carousel, Ferris wheel, food stands); the moving ones
    return an `Animate` that `CityView.animate` calls every frame.
  - `geo.ts`: `Geo`, a quad/geometry merger.
- `src/ui/`: `ui.ts` (title, board picker, skater maker, pause, HUD, trick buttons, pop-ups), `map.ts`
  (`CityMap`: round heading-up mini-map, big map with drag/pinch/± and `PLACES` to skate straight to, all
  drawn from the world data; M opens it), `sfx.ts`
  (wheel roll and grind noise, pop, clack, its own AudioContext since it needs noise), `style.css`.
- `src/main.ts`: renderer (ACES tone mapping, PCF soft shadows following the skater), the `Sky` and a
  PMREM environment made from it, fixed-step loop with interpolation, chase camera, events → sounds and
  pop-ups, saving (`gameStorage('3d-skate')`, key `save`: `{ board, look, best }`).
  `window.__skate` has `sim`, `city`, `model`, `camera`, `renderer`; `?z=<m>` starts down the street.

From `shared/`: `Controls` (joystick + look-drag + the OLLIE button as its jump button), plus the usual
`pwa`/`storage`/`home`.

## Tuning notes

- Drag `0.0065 * (v - 7)²` keeps the drop-in at ~23 m/s at the lip: ~4.7 s of air, landing on the landing
  slope whatever speed you start with (`tests/skater.test.ts`). Re-run the tests after changing the ramp,
  gravity, drag or pop.
- The chase camera is pushed above whatever is under it and above the line to the skater
  (`main.ts:keepInSight`), so it never ends up under the mega ramp.
- Jumps in the street are table-tops (no gap): slow riders land on the flat top instead of a wall.
- `Geo.quad` works out a quad's facing from all four corners (Newell), so ramp sides that taper to a
  point on the ground face outward (they used to be invisible from outside).
- Draw calls are ~210 at street level (~120k triangles) (half of them the skater's parts, drawn twice for shadows).

## Ideas for later

Measuring speed on the real iPad (merge the skater's meshes if needed), more tricks (grabs, shove-its),
manuals, a bowl, cars or people on the sidewalks, a timer to the end of the 10 miles.
