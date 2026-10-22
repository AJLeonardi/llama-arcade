// The worlds with their own kind of game, by level id.
import type { Activity, WorldCtx } from './activity';
import { BurgerWorld } from './burger';
import { CoasterWorld } from './coaster';
import { FishWorld } from './fish';
import { FISH_IDS } from '../sim/fishLevels';
import { RocketWorld } from './rocket';

export const ACTIVITIES: Record<string, (ctx: WorldCtx) => Activity> = {
  coaster: (ctx) => new CoasterWorld(ctx),
  rocket: (ctx) => new RocketWorld(ctx),
  burger: (ctx) => new BurgerWorld(ctx),
  ...Object.fromEntries(FISH_IDS.map((id) => [id, (ctx: WorldCtx) => new FishWorld(ctx, id)])),
};
