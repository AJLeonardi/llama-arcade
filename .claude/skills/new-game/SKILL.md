---
name: new-game
description: Create a new game in the Llama Arcade — interview the kid designer, scaffold games/<id>/ from the starter template, wire it into the arcade, and verify it. Use when the user asks to make, start or add a new game.
---

# Making a new Llama Arcade game

The designers are kids (about 7). They describe the game; you build it. Keep everything you
say to them short, concrete and excited, and show progress often.

## 1. Talk about the game first (keep it to a few questions)

Ask only what you need, in kid-friendly words, a couple of questions at a time:

- What's the game called? Who do you play as? (Llamas are the house style, but not required.)
- What do you do in it? How do you win, or what's the fun part?
- 2D (flat, like Rocket Builder) or 3D (like Llama Drive)? Default to **2D** unless the idea
  really needs 3D: 2D games are much smaller, faster to build, and run better on the old iPad.
- Play together on two devices? Only if they ask; it's a lot of extra work (see step 6).

Then say back the plan in 3–5 short bullets and build a **small first version** they can try
within one session. Add more in later sessions; don't build everything at once.

## 2. Pick the id and create the folders

The id is short, lowercase, letters/numbers/dashes, e.g. `llama-soccer`. It becomes the URL
(`/games/<id>/`) and the save slot. Then:

```bash
cp -R templates/2d-starter games/<id>
mkdir -p public/games/<id>
mv games/<id>/public/* public/games/<id>/ && rmdir games/<id>/public
```

Replace every `GAME TITLE` and `GAME_ID` placeholder (`grep -rn "GAME TITLE\|GAME_ID" games/<id> public/games/<id>`):

- `games/<id>/game.json`: `title`, `blurb` (one short sentence), `color` (the tile colour on
  the arcade page), `order` (position on the arcade page; use the next number up).
- `games/<id>/index.html`: `<title>`, `apple-mobile-web-app-title` (short: it's the name
  under the home-screen icon), `theme-color` and background colour.
- `public/games/<id>/manifest.webmanifest`: `name`, `short_name`, colours.
- `games/<id>/src/main.ts`: `GAME_ID`.

For a **3D** game, keep the template's page and plumbing but build on `three` and, if it needs
physics, `@dimforge/rapier3d-compat` (both already installed). Read `games/drive/CLAUDE.md`
first: it explains the patterns Drive uses (fixed-step physics loop, keeping sim code free of
three.js/DOM so it can be tested in Node, the draw-call budget for the A10X iPad).

## 3. The icon

Draw `public/games/<id>/icon.svg` (512×512, full-bleed background; iOS rounds the corners).
Simple bold shapes or an emoji read best at small size. Then run `npm run icons` to make the
PNGs. Look at `icon-180.png` to check it.

## 4. Rules every game follows

- **Devices:** a 2017 iPad Pro 10.5" (A10X, iPadOS 17: WebGL2, no WebGPU) and an iPhone,
  usually in landscape, launched from the home screen. Touch controls first, with keyboard
  controls too for the Mac. Buttons big enough for small fingers. Test on the real iPad for speed.
- **Content:** kid-friendly. Cartoon crashes and explosions are fine; no gore, nothing scary
  beyond a silly "evil" boss.
- **Everything made in code** where possible (drawings, sounds). If you need image files,
  put them in `public/games/<id>/` and keep them small (WebP, ~1K px or less).
- **Plumbing comes from `shared/`.** Don't rebuild it:
  - `startPwa({ onUpdate })` from `shared/pwa.ts`: offline support + "new version" check.
    Show a "✨ New version! Tap to get it" button that calls `reloadForUpdate()` (or reload
    straight away on a title screen, where nothing is lost).
  - `gameStorage('<id>')` from `shared/storage.ts` for saving. **Never** call
    `localStorage` directly: all games share the site's storage.
  - `goToArcade()` from `shared/home.ts` behind a **🏠 Arcade** button on the title screen
    or pause menu. Not during play, where it could be tapped by accident.
  - `BUILD` from `shared/pwa.ts`: show `build <n>` small in a corner (it helps when
    checking which version a device has).
- **Stay in your folder.** A new game only adds files under `games/<id>/` and
  `public/games/<id>/`. If you think you need to change `shared/` or another game, stop and
  follow the shared-code rules in the root `CLAUDE.md`.
- **Tests:** put game logic that can run without the screen (scoring, rules, physics) in
  plain functions and test it in `games/<id>/tests/*.test.ts` (vitest). Not required for a
  first version, but add tests for anything that broke once.

## 5. Check it, then tell them how to play

```bash
npm run dev          # http://localhost:5173/games/<id>/ (also on the Wi-Fi, for the iPad)
npm run check        # tests + typecheck + build + smoke test of every page
```

`npm run check` must pass before you commit: the smoke test opens every page (including the
arcade page, which must show the new tile) and fails on any error. Then write
`games/<id>/README.md`: what the game is, how to play (touch and keyboard), and anything a
grown-up needs to know. Once the game has a few files, add a short `games/<id>/CLAUDE.md`
code map (like `games/rocket/CLAUDE.md`) so later sessions don't have to re-read everything.

Commit and push to `main` (the deploy runs on its own). On the iPad: open the arcade, tap the
new game, then Share → **Add to Home Screen** to give it its own icon.

## 6. Playing together (only if asked)

Both existing games pair two devices on the same Wi-Fi by showing QR codes to each other's
cameras (WebRTC, no server). They each have their own version: `games/rocket/src/net.js`
(simpler) and `games/drive/src/net/` + `ui/Together.ts`. There's no shared version yet. If a
third game needs it, that's the moment to move one into `shared/` (following the shared-code
rules), rather than writing a third copy.
