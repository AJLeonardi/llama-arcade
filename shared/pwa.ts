// Home-screen app plumbing shared by every page: offline support and "a new version is out".

/** The arcade's root folder (where index.html, sw.js and version.json live). Works in dev and in the build. */
export const ARCADE_ROOT = new URL(/* @vite-ignore */ '../', import.meta.url);

/** The build number of the code that's running ('dev' when running locally). */
export const BUILD = __BUILD_NUMBER__;

const CHECK_EVERY_MS = 2 * 60 * 1000;

async function newerBuildAvailable() {
  if (!import.meta.env.PROD || BUILD === 'dev') return false;
  try {
    const res = await fetch(new URL(`version.json?t=${Date.now()}`, ARCADE_ROOT), { cache: 'no-store' });
    const { build } = (await res.json()) as { build: string };
    return Number(build) > Number(BUILD);
  } catch {
    return false; // offline: keep playing what we have
  }
}

/**
 * Turns on offline support and watches for newer deploys. `onUpdate` is called (once) when one is
 * out; the game decides how to offer it, e.g. a button that calls `reloadForUpdate()`.
 *
 * Home-screen apps on iOS are usually paused rather than closed, so this checks at launch, every
 * time the app comes back to the front, and every couple of minutes while it's open.
 */
export function startPwa(opts: { onUpdate?: () => void } = {}) {
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () =>
      navigator.serviceWorker
        .register(new URL('sw.js', ARCADE_ROOT), { scope: ARCADE_ROOT.pathname, updateViaCache: 'none' })
        .then((r) => r.update())
        .catch(() => {}),
    );
  }
  const onUpdate = opts.onUpdate;
  if (!onUpdate) return;
  let told = false;
  const check = async () => {
    if (told || document.hidden) return;
    if (await newerBuildAvailable()) {
      told = true;
      onUpdate();
    }
  };
  check();
  document.addEventListener('visibilitychange', check);
  setInterval(check, CHECK_EVERY_MS);
}

/** Loads the newest version (the service worker fetches pages fresh, and asset names change per build). */
export function reloadForUpdate() {
  location.reload();
}
