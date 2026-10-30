# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Llama Arcade: one website holding all the games two kids (about 7) design with their parent and Claude.
The landing page (`index.html`, `src/`) lists the games; each game lives in `games/<id>/` and is its own page
at `/games/<id>/`, which can be added to the iPad/iPhone home screen as its own app. One repo, one build,
one deploy (GitHub Pages).

- **To make a new game, use the `/new-game` skill** (`.claude/skills/new-game/SKILL.md`). It has the
  rules every game follows.
- **Each game has its own `CLAUDE.md`** (`games/drive/CLAUDE.md`, `games/rocket/CLAUDE.md`,
  `games/blox/CLAUDE.md`, `games/speed-run-am/CLAUDE.md`, `games/3d-skate/CLAUDE.md`). When working on one game, read only that game's folder (plus `shared/` if it
  uses something from there).

## Commands

```bash
npm run dev          # Vite dev server: http://localhost:5173/ (host: true, so the iPad can open it on the Wi-Fi)
npm test             # vitest: every game's tests + shared/ tests (headless)
npx vitest run games/drive   # one game's tests
npm run typecheck    # tsc --noEmit
npm run build        # typecheck + vite build → dist/
npm run smoke        # opens every built page in headless Chromium; fails on errors/404s (run build first)
npm run check        # test + build + smoke: run before every commit
npm run icons        # icon.svg → icon-180/192/512.png in public/arcade and public/games/*
```

First time on a machine: `npm install && npx playwright install chromium`.

## Layout

```
index.html, src/        the arcade landing page (tiles come from games/*/game.json)
parents/                the page for parents (/parents/): why we made this, how to add to the home screen
games/<id>/             one game: index.html, game.json, src/, tests/, README.md, CLAUDE.md
public/games/<id>/      that game's static files, copied as-is: manifest, icons, textures
public/arcade/          the arcade's own manifest + icons
public/parents/         the parents page's "add to home screen" GIF
shared/                 code every game uses (see below)
templates/2d-starter/   the starting point for new games (type-checked, not deployed)
scripts/                smoke test, icon maker
```

The build finds pages by itself: any `games/<id>/index.html` becomes a page (`vite.config.ts:pages`), and
any `games/<id>/game.json` becomes a tile. Adding a game needs no config changes.

## shared/

- `pwa.ts`: `startPwa({ onUpdate })` registers the one service worker and watches `version.json` for a
  newer build (at launch, on return to the front, every 2 min); `reloadForUpdate()`; `BUILD`;
  `ARCADE_ROOT` (the site root, found from the bundled chunk's own URL, so it works at any sub-path).
- `storage.ts`: `gameStorage(id)`: localStorage under `llama-arcade/<id>/<key>`. Games must not use
  localStorage directly, since every game shares the site's storage.
- `home.ts`: `goToArcade()`.
- For the blocky 3D games (Llama-blox, Speed Run AM; Llama Drive has its own versions):
  - `boxes.ts`: `BoxBatch` merges many boxes into one geometry (vertex colours, world-sized UVs).
  - `controls.ts`: `Controls`, the touch joystick + look-drag + jump button + keyboard. The game's CSS
    styles `.stick-base` / `.stick-knob`.
  - `textures.ts`: `canvasTexture()`, `once()` (make a texture once), and `tileTex`, `beltTex`,
    `checkerTex`, `gooTex`, `labelTex`.
  - `confetti.ts`: `Confetti`, the finish burst.
  - `sfx.ts`: `unlock()` (call on the first tap) and `tone()`, one WebAudio note. Each game keeps its own
    list of sounds made from `tone()`.
- `sw.js`: the service worker template. The build writes it to `dist/sw.js` with the build number in
  the cache name (`vite.config.ts:deployFiles`), so each deploy starts a fresh offline cache. Pages are
  network-first, everything else cache-first, and `version.json` is never cached.

The build number is the git commit count, one for the whole arcade, so a deploy that only changed one
game still shows "new version" in the others. That's expected.

### Rules for changing shared code

`shared/` is used by every game, so a change there can break a game you aren't looking at.

1. **Keep it small.** Only plumbing that two or more games really use goes in `shared/`. Game-specific
   code stays in the game's folder. Copying a little code is better than a shared module full of options.
2. **Add, don't change.** Prefer a new function or an optional parameter whose default keeps today's
   behaviour, over changing what an existing function does.
3. **Before changing a shared function, find every user** (`grep -rn "<name>" games src templates`) and
   check each one still works.
4. **Run `npm run check`** (every game's tests, typecheck, build, and the smoke test of every page), not
   just the game you were working on.
5. **A game can always opt out:** copy the shared piece into its own folder and change the copy.

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`: `npm ci`, tests, build, smoke test, then
deploy to GitHub Pages. If any step fails nothing is deployed, and the devices keep the last good version.
Site: https://ajleonardi.github.io/llama-arcade/

## History

Llama Drive and Llama Rocket Builder started as separate repos (`AJLeonardi/llama-drive-open-world`,
`AJLeonardi/llama-rocket-builder`) and were copied in on 2026-10-17. Those repos are left as they were.
Rocket Builder was converted from classic scripts sharing one global scope to ES modules with explicit
imports. Its code otherwise didn't change.
