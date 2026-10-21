// Other characters (riders, customers): the same blocky llamas and people as you, in random outfits.
import { ITEMS, type Outfit } from '../sim/shop';
import { buildAvatar, type Rig } from '../view/avatar';

const pickOf = (rnd: () => number, slot: string) => {
  const list = ITEMS.filter((i) => i.slot === slot && (i.price === 0 || rnd() < 0.5));
  return list[Math.floor(rnd() * list.length)].id;
};

export function randomOutfit(rnd: () => number = Math.random): Outfit {
  return {
    body: rnd() < 0.5 ? 'llama' : 'human',
    color: pickOf(rnd, 'color'),
    pants: pickOf(rnd, 'pants'),
    skin: pickOf(rnd, 'skin'),
    hat: rnd() < 0.5 ? pickOf(rnd, 'hat') : 'h-none',
    glasses: rnd() < 0.3 ? pickOf(rnd, 'glasses') : 'g-none',
    cape: 'k-none',
  };
}

export const randomRider = (rnd?: () => number): Rig => buildAvatar(randomOutfit(rnd));

/** Sitting down (in a ride, or a car). */
export function sit(rig: Rig, armsUp = false) {
  if (rig.llama) rig.legs.forEach((l, i) => (l.rotation.x = i < 2 ? -0.9 : 0.9));
  else {
    rig.legs.forEach((l) => (l.rotation.x = -1.45));
    rig.arms.forEach((a) => (a.rotation.x = armsUp ? Math.PI * 0.95 : -0.5));
  }
  rig.body.position.y = 0;
}
