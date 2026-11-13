# CLAUDE.md: Llama Soccer 3D

5-a-side llama soccer (three.js, TypeScript, no physics engine). Mr. Random takes Team USA from #16 to #1
in the World Cup. How to play is in `README.md`. Run commands from the repo root; this game's tests:
`npx vitest run games/llama-soccer-3d`.

## Code map

- `src/sim/` is plain numbers, **no three.js or DOM**, so it runs in the Node tests.
  - `match.ts`: `Match`. Ground is x/z, team 0 (USA) attacks +z. The camera looks along +z, so **+x is
    screen left** (the left back's home is +x). The ball is at someone's feet (`owner`), following a
    drawn line (`path`, from `makePath`/`pathAt`), or free (gravity, friction, board bounces; the end
    boards have a gap for the goal). Fixed 1/120 s substeps. AI: `chaser()` runs at the ball,
    `fieldTarget()` home places shifted with the ball, `carrierThink()` shoots in range / passes (USA's AI
    passes to Mr. Random). Keepers: `keeperTarget()` waits a reaction delay after a kick, then guesses the
    crossing point from the ball's *current* direction (`ballVel()`), which is why curvy lines beat them;
    `saves()` checks reach as the ball reaches the keeper's line. `shoot(line)` is your drawn line,
    `quickShot()` the Space bar. `autopilot` lets the AI play Mr. Random (title-screen demo, tests).
    Events (`takeEvents()`) drive sounds and banners.
  - `teams.ts`: `COUNTRIES` (starting table, USA last; nobody else wears white), `Save`, `newSave`/
    `fixSave`, `nextOpponent` (team above; #2 when USA is #1 = the Final), `strengthOf` (0..1 from table
    position, sets opponent speed/kick/keeper), `afterMatch` (up one place per goal of margin, max 3;
    coins), `makeShop`/`buy`/`release`, `swap` (slot↔slot or slot↔bench; Mr. Random never benched).
- `src/view/llama.ts`: `Llama` (four-legged, shirt texture with the number on both sides, merged
  head/neck mesh, trot cycle, kick leg, keeper dive, cheer bounce).
- `src/view/stadium.ts`: grass canvas texture with the lines, goals with nets, ad boards, four stands
  (crowd texture, seen from the back side of a sloped plane), floodlights.
- `src/ui.ts` + `src/style.css`: home (big PLAY), intro card, My Team, table, HUD, pause, result.
- `src/sfx.ts`: sounds from `shared/sfx.ts` tones.
- `src/main.ts`: renderer, ball, blob shadows, Mr. Random's ring and name tag, the drawn-line ribbon,
  input (touch: left 38% of the screen = joystick, elsewhere = draw; mouse always draws; slow motion while
  drawing with the ball), camera (follows 70% ball / 30% Mr. Random; closer on wide phones), saving
  (`gameStorage('llama-soccer-3d')`, key `save`). `window.__soccer` has `match`, `play()`, `tick(n)`,
  `draw(points)` for testing (the browser pane runs the match in real time too, so step `match` directly
  for exact checks).

## Tuning notes

`tests/sim.test.ts` checks: corner lines beat weak keepers, shots at the keeper are saved, a curvy line
beats the best keeper more than a straight one, an idle Mr. Random loses to a strong team.
Not yet measured on the iPad (≈150 draw calls for the llamas).

## Ideas for later

Headers, slide tackles, penalty shootouts for draws, Mr. Random's goal count across the World Cup, a trophy
room, the Revolution club season before the World Cup.
