// The time of day. `hour` runs 0..24; one game hour takes HOUR_SECS real seconds, so a whole day is
// 12 minutes. Night is from NIGHT_FROM (7:30 pm) to DAY_FROM (6 am): that's when you can go to sleep.

export const HOUR_SECS = 30;
export const DAY_FROM = 6;
export const NIGHT_FROM = 19.5;
export const WAKE_AT = 7;

export interface Clock {
  day: number;
  hour: number;
}

export function tick(c: Clock, secs: number) {
  c.hour += secs / HOUR_SECS;
  while (c.hour >= 24) {
    c.hour -= 24;
    c.day++;
  }
}

/** Moves the clock on by some hours (class, work). */
export function pass(c: Clock, hours: number) {
  tick(c, hours * HOUR_SECS);
}

/** Sleeping: to 7 in the morning (the next day if it's before midnight). */
export function sleep(c: Clock) {
  if (c.hour >= WAKE_AT) c.day++;
  c.hour = WAKE_AT;
}

export const isNight = (h: number) => h >= NIGHT_FROM || h < DAY_FROM;

/** School is open 8 am to 3 pm; work 8 am to 6 pm. */
export const schoolOpen = (h: number) => h >= 8 && h < 15;
export const workOpen = (h: number) => h >= 8 && h < 18;

/**
 * Where the sun is: elevation (radians above the horizon, negative at night) and azimuth (radians, 0 = north,
 * turning east). It rises in the east at 6, is highest at noon (60°), sets in the west at 6 pm.
 */
export function sunAt(h: number) {
  const t = (h - 6) / 12; // 0 at sunrise, 1 at sunset
  const elev = Math.sin(t * Math.PI) * (Math.PI / 3);
  const az = Math.PI / 2 + t * Math.PI; // east → south → west
  return { elev, az };
}

/** How much daylight: 1 in the day, 0 at night, fading through dawn and dusk. */
export function daylight(h: number) {
  const s = Math.sin(sunAt(h).elev);
  const k = Math.max(0, Math.min(1, (s + 0.12) / 0.4));
  return k * k * (3 - 2 * k);
}

/** "8:05 AM". */
export function timeText(h: number) {
  const mins = Math.floor((h % 1) * 60);
  const hr = Math.floor(h) % 24;
  const h12 = hr % 12 === 0 ? 12 : hr % 12;
  return `${h12}:${String(mins).padStart(2, '0')} ${hr < 12 ? 'AM' : 'PM'}`;
}
