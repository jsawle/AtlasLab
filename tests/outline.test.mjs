// Outline maps for printing (lib/outline.js). Run: node tests/outline.test.mjs
import assert from "node:assert/strict";
import { OUTLINE_VERSION, OUTLINE_MAPS, equalEarth, azimuthal, albers, outlineUrl, outlineShapes, outlineLabel } from "../lib/outline.js";
let n = 0; const ok = (c, m) => { assert.ok(c, m); n++; console.log("  ok   " + m); };
const near = (a, b, t = 1e-3) => Math.abs(a - b) <= t;
ok(OUTLINE_VERSION === "1.0", "version 1.0");
ok(OUTLINE_MAPS.map((m) => m.id).join(" ") === "world africa asia europe north-america south-america oceania us-states", "the eight maps: the world, six continents and the United States");
let [x, y] = equalEarth(0, 0); ok(near(x, 0) && near(y, 0), "Equal Earth: the middle of the map is 0, 0");
[x, y] = equalEarth(180, 0); ok(near(x, 2.7066, 2e-3) && near(equalEarth(0, 90)[1], -1.3173, 2e-3), "Equal Earth: the equator reaches 2.707 and the pole 1.317, the published values");
ok(equalEarth(-90, 30)[0] < 0 && equalEarth(0, 30)[1] < 0, "west is left and north is up");
const az = azimuthal(20, 0); ok(near(az(20, 0)[0], 0) && near(az(20, 0)[1], 0) && az(30, 0)[0] > 0 && az(20, 10)[1] < 0, "azimuthal: its centre is 0, 0, east is right, north is up");
ok(near(Math.hypot(...az(110, 0)), Math.SQRT2, 1e-6), "azimuthal: a quarter of the way round the earth is √2 from the centre (equal area)");
const al = albers(29.5, 45.5, -96, 37.5); ok(near(al(-96, 37.5)[0], 0) && near(al(-96, 37.5)[1], 0) && al(-80, 37.5)[0] > 0 && al(-96, 45)[1] < 0, "Albers: its origin is 0, 0, east is right, north is up");
const us = OUTLINE_MAPS.find((m) => m.id === "us-states"), url = outlineUrl(us);
ok(url.startsWith("https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/USA_States_Generalized_Boundaries/FeatureServer/0/query?") && url.includes("outFields=STATE_NAME,STATE_ABBR") && url.includes("f=geojson") && url.includes("maxAllowableOffset=0.02"), "the request is to Esri's public layer, for names and simplified shapes only");
ok(outlineUrl(OUTLINE_MAPS[1]).includes("World_Countries/") && outlineUrl(OUTLINE_MAPS[1]).includes(encodeURIComponent("CONTINENT='Africa'")), "a continent asks for its own countries");
const sq = (lon, lat, w, h) => ({ type: "Polygon", coordinates: [[[lon, lat], [lon + w, lat], [lon + w, lat + h], [lon, lat + h], [lon, lat]]] });
const feats = [{ properties: { STATE_NAME: "Kansas", STATE_ABBR: "KS" }, geometry: sq(-102, 37, 7, 3) }, { properties: { STATE_NAME: "Rhode Island", STATE_ABBR: "RI" }, geometry: sq(-71.9, 41.3, 0.7, 0.7) },
  { properties: { STATE_NAME: "Alaska", STATE_ABBR: "AK" }, geometry: sq(-165, 55, 30, 15) }, { properties: { STATE_NAME: "Hawaii", STATE_ABBR: "HI" }, geometry: sq(-160, 19, 5, 3) },
  { properties: { STATE_NAME: "Speck", STATE_ABBR: "SP" }, geometry: sq(-90, 35, 0.01, 0.01) }];
const out = outlineShapes(us, feats, 1000), by = Object.fromEntries(out.shapes.map((s) => [s.name, s]));
ok(out.width === 1000 && out.height > 500 && out.height < 720, "the United States page is wider than tall (1000 by " + out.height + ")");
ok(by.Kansas && /^M[\d. ]+L[\d. L]+Z$/.test(by.Kansas.d) && by.Kansas.x > 350 && by.Kansas.x < 600 && by.Kansas.y > 250 && by.Kansas.y < 450, "Kansas is drawn near the middle of the page");
ok(!by.Speck, "a speck too small to see is left out");
ok(by.Alaska.x < 200 && by.Alaska.y > out.height * 0.7 && by.Hawaii.x > 220 && by.Hawaii.x < 340 && by.Hawaii.y > out.height * 0.86, "Alaska and Hawaii are drawn in their own boxes at the bottom left");
ok(outlineLabel(by.Kansas).text === "Kansas" && outlineLabel(by["Rhode Island"]).text === "RI", "a name that fits is written in full; one that does not uses the short form");
const two = outlineShapes(OUTLINE_MAPS[1], [{ properties: { COUNTRY: "A" }, geometry: sq(10, 0, 10, 10) }, { properties: { COUNTRY: "A" }, geometry: sq(30, 0, 2, 2) }], 1000);
ok(two.shapes.length === 2 && two.shapes.filter((s) => s.labelled).length === 1 && two.shapes.find((s) => s.labelled).size > 50, "a country drawn in two parts is named once, on the larger");
const eu = OUTLINE_MAPS.find((m) => m.id === "europe"), ru = outlineShapes(eu, [{ properties: { COUNTRY: "Russian Federation" }, geometry: sq(30, 45, 120, 25) }, { properties: { COUNTRY: "Far" }, geometry: sq(120, 0, 10, 10) }], 1000);
ok(ru.shapes.length === 1 && ru.shapes[0].x > 600 && ru.shapes[0].x <= 1000 && ru.shapes[0].y > 0 && ru.shapes[0].y < ru.height, "on the map of Europe, Russia runs off the page and is named on the part that shows; a country wholly off the page is left out");
ok(/Russian Federation/.test(eu.where) && /Papua New Guinea/.test(OUTLINE_MAPS.find((m) => m.id === "oceania").where) && /<>'Papua New Guinea'/.test(OUTLINE_MAPS.find((m) => m.id === "asia").where), "Russia is on the map of Europe too, and Papua New Guinea is with Oceania, not Asia");
ok(outlineShapes(OUTLINE_MAPS[0], [], 1000).shapes.length === 0 && near(outlineShapes(OUTLINE_MAPS[0], [], 1000).height / 1000, 0.4867, 5e-3), "the world page is about twice as wide as tall, and no features gives no shapes");
console.log(n + " checks passed");
