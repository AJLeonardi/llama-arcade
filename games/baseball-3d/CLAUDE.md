# CLAUDE.md: Llama Baseball 3D

A 3D baseball game in the style of MLB The Show 26 (three.js, TypeScript, no physics engine). How to play is
in `README.md`. Run commands from the repo root; this game's tests: `npx vitest run games/baseball-3d`.

## Code map

- `src/sim/` is plain numbers, **no three.js or DOM**, so it runs in the Node tests.
  - `field.ts`: the parks (`PARKS`: hs, college, pro, backyard). Home plate at the origin, +z to centre
    field, first base on **-x**. Spray angle: 0 = centre, + = right field; `dirOf(a)` = (-sin a, cos a).
    `fenceDist`, `basePos(i)`, `fielderHome(pos)`.
  - `pitch.ts`: `PITCHES` (speed factor, late break, arc), `makePitch(park, type, fastball, aim)`,
    `pitchPos(p, t)` (break grows with u², ends exactly at `end` = aim + break). `zoneFor(park)`, `inZone`.
    Callers that want a pitch to *end* at a spot aim at `2·spot - end` (see `throwPitch`/`aiThrow`).
  - `hit.ts`: `swingResult` (Big Zone: oval vs ball → exit speed, launch angle, spray; null = miss),
    `fly` (gravity + drag, bounces and rolls, home run if it clears the fence, foul lines), `field`
    (first fielder to reach the ball; caught if still in the air), `play` (→ out / 1-4 bases / hr / foul,
    batter keeps running while he beats the throw to the next base).
  - `game.ts`: `Game`: count, outs, bases, score, line score, 5-run limit per half, walk-offs, extra
    innings. `pitch(kind)` and `inPlay(ballInPlay)` return a `PlayOutcome` with runner `moves`.
  - `teams.ts`: `TEAMS` (made up), `lineup()` (seeded; Leonardo Benjamin bats 3rd), `CAREER` stages and
    `afterGame()` (season = win `need` of the games, playoff = win every game, retry on a loss).
  - `ai.ts`: `aiPitch` (type + spot, misses by control), `aiSwing` (same `swingResult` as you, with
    guessing errors that grow on edges and breaking balls).
- `src/view/`:
  - `person.ts`: the ballplayer (Wolf Lodge's person, built like 3D Skate's skater) in a uniform: cap or
    helmet, jersey with a canvas number/letters (lathe u = 0 front, 0.5 back), pants, socks, glove, bat.
    Arms use two-bone IK (`reachTo`), so poses are hand paths: `bat` (swing keyframes `SWING_HANDS`/
    `SWING_BAT`, contact at s = 0.55), `pitch` (`PITCH_HAND`, release at `RELEASE_S`), `ready`, `reach`,
    `squat`, `cheer`, `walk`. Faces +z, right-handed. `simple` skips face details and shadows (fielders).
  - `park.ts`: `buildPark` merges everything per material (`Batch`): grass, infield skin/arcs, chalk,
    bases, mound, fence + foul walls + backstop (one loop), stands (crowd texture strips), per-kind extras
    (bleachers/trees, Boston brick and city, Providence two decks + light towers, backyard house/swing
    set), and a canvas scoreboard (`scoreboard()`).
  - `textures.ts`: canvas textures (mowed grass, dirt, brick, wood, chain-link, crowd, signs).
- `src/ui/`: `ui.ts` (menus, team cards, TV scorebug, pitch speed, batter lower-third, SWING / pitch
  type / PITCH buttons), `sfx.ts` (own AudioContext: bat crack, mitt, crowd loop, organ "charge"),
  `style.css`.
- `src/main.ts`: renderer, day sky / night lights (`setLighting`), the match (`startMatch`: two teams of
  9 fielders + batter and 3 runners each), the pitch flow `aim → ring (you pitch) → windup → flight →
  inplay → after → (switch)`, cameras (batting: above the catcher; pitching: behind the pitcher; in play:
  follows the ball), ball trail, menus, saving (`gameStorage('baseball-3d')`, key `save`:
  `{ career, myTeam, oppTeam }`). `window.__ball` has `tick(n, render)` to step the game by hand (the
  browser pane throttles frames when hidden), plus `action()`, `oval`, `pitch`, `phase`.
  `?play=career|backyard|franchise` starts a game straight away.

## Tuning notes

- Hitting: `TIMING` ±0.15 s window, `SWING_DELAY` 0.12 s. Launch angle 20° + 40°·(how far the oval is
  below the ball). Max exit speed per park in `startMatch` (`maxEv`); Leonardo's power is 1.1, so a good
  swing with him often goes out, other batters rarely. `tests/sim.test.ts` checks the computer gets on
  base 20-55% of the time and that fly balls, grounders and gap shots do what they should.
- ~26 people exist per match, ~14 visible; fielders are `simple`. Not yet measured on the iPad.

## Ideas for later

Measure speed on the iPad (merge each person's meshes if needed), stealing and pick-offs, choosing where
fielders throw, a bigger Finals (best of 3), Leonardo's stats across the career, a customisable player,
the batter's walk-up music, more parks.
