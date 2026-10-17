// Turns each icon.svg into the PNG home-screen icons (icon-180/192/512.png) next to it.
// iPads ignore SVG icons, so every game needs the PNGs. Run: npm run icons
// Looks in public/arcade/ and public/games/*/; folders without an icon.svg are skipped.
import { chromium } from 'playwright';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dirs = [join(root, 'public/arcade'), ...readdirSync(join(root, 'public/games')).map((d) => join(root, 'public/games', d))];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const dir of dirs) {
  const svg = join(dir, 'icon.svg');
  if (!existsSync(svg)) continue;
  const data = `data:image/svg+xml;base64,${readFileSync(svg).toString('base64')}`;
  for (const size of [180, 192, 512]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<body style="margin:0"><img src="${data}" width="${size}" height="${size}" style="display:block">`);
    await page.locator('img').screenshot({ path: join(dir, `icon-${size}.png`) });
  }
  console.log(`icons: ${dir.slice(root.length)}`);
}
await browser.close();
