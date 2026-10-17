# CLAUDE.md: Llama Rocket Builder

A 2D canvas game (plain JavaScript ES modules, no framework) designed by a 7-year-old. Gameplay and the
code map are in `README.md`. Run commands from the repo root (see the root `CLAUDE.md`).

## How the code is put together

- `src/main.js` is the entry point (loaded by `index.html`): the title scene, the main loop, and the
  arcade plumbing (`startPwa`, the "new version" button, 🏠 Arcade on the title screen).
- Every file imports what it uses from the others by name, and exports all its top-level names
  (an `export { … }` list at the bottom). This came from the original classic-script version, where all
  files shared one global scope. When you add a top-level function or constant that another file needs,
  add it to that file's export list and to the other file's import line.
- Circular imports between the files are normal here, which works because almost all cross-file use
  happens inside functions. Code that runs while a file loads (top-level statements) may only use
  imports from files that load before it. `main.js` imports the files in order: core, data, art, house,
  bay, builder, flight, planet, net, coop.
- Files can't reassign another file's `let` variables (ES module imports are read-only). Change them
  through a function in the owning file, or keep the state on an object such as `game`.
- `core.js`: the 960×600 stage (wider on phones, see `fitCanvas`/`setLayer`), input, the immediate-mode
  `button()` UI, effects, `Sfx` (WebAudio beeps), and saving through `shared/storage.ts`
  (`gameStorage('rocket')`, slot `save`).
- Scenes are objects with `enter/update/draw`, registered in `SCENES` (in `main.js`) and switched with `goTo(name)`.
- `window.__rocket` exposes `game`, `goTo`, `Net`, `Coop`, `Space`, `startFlight` for `tests/pairing-test.html`.
