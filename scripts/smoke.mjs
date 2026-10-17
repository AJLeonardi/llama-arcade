// Smoke test: opens the built site (dist/) in a headless browser and checks that the arcade page
// and every game start without errors or missing files. Run `npm run build` first.
// Usage: npm run smoke            (add `-- --shots <dir>` to save a screenshot of each page)
import { chromium } from 'playwright';
import { preview } from 'vite';
import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const shotsArg = process.argv.indexOf('--shots');
const shots = shotsArg > 0 ? process.argv[shotsArg + 1] : null;
if (shots) mkdirSync(shots, { recursive: true });
const WAIT_MS = 8000; // long enough for the 3D games to build their worlds

const games = readdirSync(join(root, 'games')).filter((id) => existsSync(join(root, 'games', id, 'index.html')));
const pages = [{ name: 'arcade', path: '' }, ...games.map((id) => ({ name: id, path: `games/${id}/` }))];

const server = await preview({ root, preview: { port: 4183, strictPort: false }, logLevel: 'silent' });
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let failed = 0;

for (const p of pages) {
  const page = await browser.newPage({ viewport: { width: 1180, height: 820 } });
  const problems = [];
  page.on('pageerror', (e) => problems.push(`error: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && problems.push(`console: ${m.text()}`));
  page.on('response', (r) => r.status() >= 400 && problems.push(`${r.status()}: ${r.url()}`));
  await page.goto(base + p.path, { waitUntil: 'load' });
  await page.waitForTimeout(WAIT_MS);
  if (p.name === 'arcade') {
    const tiles = await page.locator('a.game').count();
    if (tiles !== games.length) problems.push(`arcade shows ${tiles} games, expected ${games.length}`);
  }
  if (shots) await page.screenshot({ path: join(shots, `${p.name}.png`) });
  await page.close();
  console.log(`${problems.length ? '✗' : '✓'} ${p.name}`);
  for (const msg of problems) console.log(`    ${msg}`);
  if (problems.length) failed++;
}

await browser.close();
server.httpServer.close();
if (failed) {
  console.log(`\n${failed} page(s) had problems.`);
  process.exit(1);
}
console.log('\nAll pages started cleanly.');
