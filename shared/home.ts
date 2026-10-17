import { ARCADE_ROOT } from './pwa';

/** Back to the arcade's game picker. Games put this behind a "🏠 Arcade" button on a menu screen. */
export function goToArcade() {
  location.href = ARCADE_ROOT.href;
}
