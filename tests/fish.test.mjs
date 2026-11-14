// Fish in the profile (lib/fish.js): the movement, with a fixed sequence of "random" numbers.
import { waterColumn, spawnFish, stepFish, FISH_VERSION } from "../lib/fish.js";
let n = 0, bad = 0; const ok = (c, m) => { n++; if (!c) bad++; console.log((c ? "  ok   " : "  FAIL ") + m); };
let seed = 7; const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
// a chart 0..1000 px wide: sea level at y 20, the bottom at 200. Deep water, an island (land above the sea) at 400..500, a shallow shelf at 800..1000.
const xs = [0, 390, 400, 500, 510, 790, 800, 1000], ys = [180, 180, 5, 5, 180, 180, 28, 28];
const col = waterColumn(xs, ys, 20, 200, { pad: 6, band: 60, room: 4 });
ok(/^\d+\.\d+$/.test(FISH_VERSION), "has a version: " + FISH_VERSION);
const deep = col(100); ok(deep && deep.top === 26 && deep.bottom === 86, "in deep water a fish has from just under sea level to 60 px below it");
ok(col(450) === null, "none over the island");
ok(col(900) === null, "none where the water is too shallow");
ok(col(-5) === null && col(1001) === null, "none off the ends of the chart");
const fish = spawnFish(6, col, 0, 1000, rand);
ok(fish.length === 6 && fish.every((f) => col(f.x) && f.y >= col(f.x).top && f.y <= col(f.x).bottom), "six fish start in the water");
let out = 0, moved = 0; const start = fish.map((f) => ({ x: f.x }));
for (let i = 0; i < 6000; i++) for (const f of fish) { stepFish(f, 1 / 30, col, 0, 1000, rand); const c = col(f.x); if (!c || f.y < c.top - 1e-6 || f.y > c.bottom + 1e-6) out++; }
fish.forEach((f, i) => { if (Math.abs(f.x - start[i].x) > 5) moved++; });
ok(out === 0, "after 200 seconds of swimming none has left the water, crossed the island or gone onto the shelf");
ok(moved >= 5, "they have moved (" + moved + " of 6 are somewhere else)");
ok(fish.every((f) => Math.abs(f.vx) >= 6 && Math.abs(f.vx) <= 24 && Math.abs(f.vy) <= 4), "slowly: 6 to 24 px a second along, 4 at most up or down");
ok(spawnFish(4, () => null, 0, 1000, rand).length === 0, "no water, no fish");
console.log(`${n - bad}/${n} checks passed`); process.exit(bad ? 1 : 0);
