// The worlds with their own kind of game, by level id.
import type { Activity, WorldCtx } from './activity';
import { BurgerWorld } from './burger';
import { CoasterWorld } from './coaster';
import { RocketWorld } from './rocket';

export const ACTIVITIES: Record<string, (ctx: WorldCtx) => Activity> = {
  coaster: (ctx) => new CoasterWorld(ctx),
  rocket: (ctx) => new RocketWorld(ctx),
  burger: (ctx) => new BurgerWorld(ctx),
};
