// ============================================================ Fish in the elevation profile
// Fish in the sea of an elevation profile (lab: features.profileFish). A light-hearted extra, not data: a few small fish
// wander at random in the upper water of the chart. This file is the movement only, with no drawing, so it can be tested.
// The chart is stretched many times over, so the fish are not to scale and say nothing about where sea life is found.
export const FISH_VERSION = "1.0";

/**
 * The water a fish may use at a place along the chart, in pixels: from just under sea level down to the sea bed or to
 * `band` below sea level, whichever comes first. null where there is land, or too little water.
 * xs, ys   the profile's points on the chart (xs rising); seaY the y of sea level; floorY the bottom of the chart
 * @param {number[]} xs the profile's x on the chart, rising
 * @param {number[]} ys the profile's y on the chart
 * @param {number} seaY the y of sea level
 * @param {number} floorY the bottom of the chart
 * @param {object} opts { pad: the gap kept from the surface and the bed, band: how deep below sea level fish go, room:
 *   the least water a fish needs } in pixels
 * @returns {function} (x) => { top, bottom } or null
 */
export function waterColumn(xs, ys, seaY, floorY, { pad = 6, band = 60, room = 4 } = {}) {
  return (x) => {
    if (!xs.length || x < xs[0] || x > xs[xs.length - 1]) return null;
    let lo = 0, hi = xs.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (xs[mid] <= x) lo = mid; else hi = mid; }
    const span = xs[hi] - xs[lo], bed = span > 0 ? ys[lo] + ((x - xs[lo]) / span) * (ys[hi] - ys[lo]) : ys[lo];
    const top = seaY + pad, bottom = Math.min(bed - pad, floorY - pad, top + band);
    return bottom - top >= room ? { top, bottom } : null;
  };
}

/**
 * n fish, each put somewhere there is water. Fewer come back when there is little water to put them in.
 * @param {number} n how many
 * @param {function} column from waterColumn
 * @param {number} x0 the chart's left edge
 * @param {number} x1 the chart's right edge
 * @param {function} rand random numbers from 0 to 1 (Math.random; a seeded one in the tests)
 * @returns {object[]} { x, y, vx, vy, turn, kind } for each fish
 */
export function spawnFish(n, column, x0, x1, rand = Math.random) {
  const fish = [];
  for (let i = 0; i < n; i++) {
    for (let tries = 0; tries < 40; tries++) {
      const x = x0 + rand() * (x1 - x0), c = column(x);
      if (!c) continue;
      const speed = 8 + rand() * 14;
      fish.push({ x, y: c.top + rand() * (c.bottom - c.top), vx: (rand() < 0.5 ? -1 : 1) * speed, vy: 0, turn: 1 + rand() * 4, kind: i });
      break;
    }
  }
  return fish;
}

/**
 * Move one fish on by dt seconds. Now and then it picks a new speed and drift at random, and sometimes turns round;
 * it turns back at the chart's edge and at land, and is kept between sea level and the sea bed.
 * @param {object} f a fish from spawnFish; changed in place
 * @param {number} dt seconds
 * @param {function} column from waterColumn
 * @param {number} x0 the chart's left edge
 * @param {number} x1 the chart's right edge
 * @param {function} rand random numbers from 0 to 1
 */
export function stepFish(f, dt, column, x0, x1, rand = Math.random) {
  f.turn -= dt;
  if (f.turn <= 0) {
    f.turn = 1.5 + rand() * 4.5;
    const speed = 6 + rand() * 18;
    f.vx = (rand() < 0.25 ? -1 : 1) * Math.sign(f.vx || 1) * speed;
    f.vy = (rand() - 0.5) * 8;
  }
  let nx = f.x + f.vx * dt, c = nx < x0 || nx > x1 ? null : column(nx);
  if (!c) { f.vx = -f.vx; nx = f.x; c = column(nx); }
  f.x = nx;
  if (!c) return f;      // the chart changed under it: it waits where it is
  let ny = f.y + f.vy * dt;
  if (ny < c.top) { ny = c.top; f.vy = Math.abs(f.vy); }
  if (ny > c.bottom) { ny = c.bottom; f.vy = -Math.abs(f.vy); }
  f.y = ny;
  return f;
}
