# 🦙 Llama Arcade 🕹️

All our llama games in one place. Open the arcade, pick a game, play.

**Play:** https://ajleonardi.github.io/llama-arcade/

| Game | What it is |
|---|---|
| [Llama Drive](games/drive/README.md) | Open-world driving and crashing (3D) |
| [Llama Rocket Builder](games/rocket/README.md) | Build a rocket and fly to Planet Evil (2D) |
| [Llama-blox](games/blox/README.md) | Roblox-style blocky world: obbies, dress-up, a jail break, rocket building, roller coasters and a burger shop (3D) |

## On the iPad / iPhone

Open the arcade in Safari and tap **Share → Add to Home Screen**. That gives you an **Arcade** icon with
every game in it. You can also open a single game and add it to the home screen, which gives that game its
own icon that opens straight into it. Everything works offline once it's been opened.

When a new version is out, the games show a **✨ New version!** button (or update by themselves on the menus).

## Making a new game

In Claude Code, in this folder, type **`/new-game`** and describe the game. Claude asks a few questions,
builds a first version from the starter template, checks it, and adds it to the arcade page.

## For grown-ups

```bash
npm install
npx playwright install chromium   # once, for the smoke test
npm run dev                       # http://localhost:5173 (also on your Wi-Fi for the iPad)
npm run check                     # all tests + build + smoke test of every page
```

Pushing to `main` tests and deploys everything (`.github/workflows/deploy.yml`). If anything fails,
nothing is deployed. See `CLAUDE.md` for how the repo is organised and the rules for shared code.
