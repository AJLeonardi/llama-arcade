/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import { execSync } from 'node:child_process';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Build number shown in every game: the total number of commits. */
function buildNumber() {
  try {
    return execSync('git rev-list --count HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'dev';
  }
}

const BUILD = buildNumber();
const root = import.meta.dirname;

/** Every games/<id>/index.html is a page of the site, so a new game needs no config change. */
function pages() {
  const input: Record<string, string> = { arcade: resolve(root, 'index.html') };
  for (const id of readdirSync(resolve(root, 'games'))) {
    const page = resolve(root, 'games', id, 'index.html');
    if (existsSync(page)) input[id] = page;
  }
  return input;
}

/**
 * version.json lets an installed copy notice a newer deploy and update itself.
 * sw.js gets the build number in its cache name, so each deploy starts a fresh offline cache.
 */
function deployFiles(): Plugin {
  return {
    name: 'deploy-files',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD }) });
      const sw = readFileSync(resolve(root, 'shared/sw.js'), 'utf8').replace('__BUILD__', BUILD);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: sw });
    },
  };
}

export default defineConfig({
  plugins: [deployFiles()],
  // Relative base so the build works from any GitHub Pages sub-path.
  base: './',
  define: { __BUILD_NUMBER__: JSON.stringify(BUILD) },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 4000,
    rollupOptions: { input: pages() },
  },
  server: { host: true },
  test: {
    include: ['games/*/tests/**/*.test.ts', 'shared/**/*.test.ts'],
    testTimeout: 30000,
  },
});
