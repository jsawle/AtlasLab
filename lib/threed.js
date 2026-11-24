// ============================================================ 2D to 3D
// Going from the 2D map to the 3D view (5.0.0-beta.54): the scale handed across, how far the camera tilts, when haze is
// left off, what about a layer the 3D view can't draw as 2D does, and the size of the picture a styled fill is drawn
// into. Plain functions with no map in them, so they can be tested.
// Why each is here is in the README: a review of how a selection of the collection's maps look after pressing 3D.
export const THREED_VERSION = "1.8";   /* 1.8 (5.0.0-beta.78): measurements across 2D and 3D are in the main app (features.keepMeasure; the classic config turns it off). */ /* 1.7 (lab, features.keepMeasure): Measure stays on, and a finished measurement is measured again in the other view; a 2D path with bends is drawn in 3D with its 2D length. */ /* 1.6: a click inside a fill laid on the ground opens its sketch's pop-up; docked or not carries across. */ /* 1.5: an open pop-up follows into the other view. */ /* 1.4: a 3D view used before is given the place to look at two frames after it is shown again (it came down a thousand times too close after a map was opened in 2D). */ /* 1.3: the fill laid on the ground is in the main app; the swatch's clear edge and border are left off each repeat (no seams). */ /* 1.2: sketched areas with a styled fill get a thicker outline and a light tint in 3D; lab: the fill laid on the ground as a picture */

// The 2D map's scale is measured on the Web Mercator grid, which stretches the world away from the equator; the 3D view's
// is true on the ground. Handing one to the other unchanged made the 3D view show a place smaller than the 2D map did
// (1.6 times smaller at London's latitude). These keep what is on screen the same size.
const cosLat = (lat) => Math.cos((Math.max(-85, Math.min(85, Number(lat) || 0)) * Math.PI) / 180);
export const scaleTo3d = (scale, lat) => scale * cosLat(lat);
export const scaleTo2d = (scale, lat) => scale / cosLat(lat);

export const TILT_FULL_SCALE = 250000, TILT_REGION_SCALE = 5000000, TILT_REGION_END = 10000000, TILT_GLOBE_SCALE = 25000000, TILT_REGION = 30;
/**
 * How far the camera tilts when the 3D view opens, by how far out the map is (the 3D view's scale).
 * - town scale and closer (1:250,000): the config's angle
 * - out to a region (1:5,000,000 to 1:10,000,000): falling to 30°. That still shows plainly that the view is 3D (the
 * far edge curves away) and keeps the map's subject in the middle; the old 60° put it on the skyline. (1.0 looked
 * straight down here, which did not look like 3D at all.)
 * - beyond that it falls away to none at 1:25,000,000: there the globe itself shows the view is 3D, and a tilt only
 * pushes the globe down the screen.
 * @param {number} scale the 3D view's scale
 * @param {number} max the config's tilt, degrees
 * @returns {number} degrees
 */
export function tiltForScale(scale, max) {
  max = Math.max(0, Number(max) || 0);
  const region = Math.min(max, TILT_REGION), part = (s, a, b) => (Math.log(b) - Math.log(s)) / (Math.log(b) - Math.log(a));
  if (!(scale > 0) || scale <= TILT_FULL_SCALE) return max;
  if (scale < TILT_REGION_SCALE) return Math.round(region + (max - region) * part(scale, TILT_FULL_SCALE, TILT_REGION_SCALE));
  if (scale <= TILT_REGION_END) return region;
  if (scale < TILT_GLOBE_SCALE) return Math.round(region * part(scale, TILT_REGION_END, TILT_GLOBE_SCALE));
  return 0;
}

// The 3D view's haze suits a landscape seen from close by. Over a whole country or the globe it washes out a map's colours,
// so there a web map is drawn without it.
export const HAZE_SCALE = 1000000;
export const hazeOn = (scale) => !(scale > 0) || scale < HAZE_SCALE;

const BLENDS_IN_3D = ["tile", "vector-tile", "imagery-tile", "web-tile", "wmts", "wcs", "open-street-map", "base-tile", "group"];
/**
 * What the 3D view cannot draw as the 2D map does, for one layer. Returns the reasons, as keys of the wording:
 * symbols  polygon or line symbols made in ArcGIS Pro (CIM): 3D falls back to plain outlines
 * effect   layer or feature effects (glow, shadow, invert, blur): not drawn in 3D
 * blend    a blend mode on a kind of layer 3D does not blend
 * cluster  points grouped into clusters or bins: 3D draws every point
 * @param {object} l the layer (or its JSON): its renderer, effects, blend mode and feature reduction
 * @returns {string[]}
 */
export function layerDiffers3d(l) {
  const why = [];
  if (!l) return why;
  const r = l.renderer, syms = [];
  if (r) { syms.push(r.symbol, r.defaultSymbol); for (const k of ["uniqueValueInfos", "classBreakInfos"]) for (const i of r[k] || []) syms.push(i && i.symbol); }
  if (syms.some((s) => s && s.type === "cim" && s.data && s.data.symbol && (s.data.symbol.type === "CIMPolygonSymbol" || s.data.symbol.type === "CIMLineSymbol"))) why.push("symbols");
  if (l.effect || l.featureEffect) why.push("effect");
  if (l.blendMode && l.blendMode !== "normal" && !BLENDS_IN_3D.includes(l.type)) why.push("blend");
  const fr = l.featureReduction; if (fr && (fr.type === "cluster" || fr.type === "binning")) why.push("cluster");
  return why;
}

// Sketched areas with a styled fill, in 3D (1.2): the helper's outline width (points) and tint (0 to 1); the most areas given a picture.
export const FILL3D = { outline: 2.5, tint: 0.16, most: 40 };
/**
 * The size of the picture a styled fill is drawn into before it is laid on the ground: the longer side 2048 pixels,
 * the shorter in proportion (64 at least), and the pattern's tile a sixth of the longer side, so about six repeats.
 * @param {number} width the area's width on the ground, any unit
 * @param {number} height its height, the same unit
 * @returns {{w: number, h: number, tile: number}} pixels
 */
export function drapeSize(width, height) {
  const LONG = 2048, wide = width >= height, ratio = wide ? height / width : width / height, short = Math.max(64, Math.round(LONG * ratio));
  return { w: wide ? LONG : short, h: wide ? short : LONG, tile: Math.round(LONG / 6) };
}

// Measurements across 2D and 3D (1.7; in the main app from 1.8: features.keepMeasure). The 3D view's distance tool (the SDK's Direct Line
// Measurement 3D) measures from one point to another only, so a 2D path goes across as that tool's line only when it is
// one straight stretch; a path with bends is drawn on the ground, labelled at its middle (src/measure.js).
const samePoint = (a, b) => a[0] === b[0] && a[1] === b[1];
/**
 * A path's points with any point that repeats the one before it left out (a double-click can add one).
 * @param {number[][]} path [x, y] points
 * @returns {number[][]}
 */
export function distinctPoints(path) { return (path || []).filter((p, i, all) => i === 0 || !samePoint(p, all[i - 1])); }
/**
 * How a 2D distance measurement's path shows in 3D: "line" for one straight stretch (two points: the 3D tool's line,
 * which can still be changed), "fixed" for a path with bends (drawn on the ground with the length 2D gave it), or ""
 * for no path.
 * @param {number[][]} path [x, y] points
 * @returns {string}
 */
export function pathIn3d(path) { const n = distinctPoints(path).length; return n < 2 ? "" : n === 2 ? "line" : "fixed"; }
/**
 * The point halfway along a path, measured in the map's own units, where its label goes.
 * @param {number[][]} path [x, y] points
 * @returns {number[]|null} [x, y]; null for no points
 */
export function halfwayAlong(path) {
  const p = distinctPoints(path);
  if (!p.length) return null;
  const seg = p.slice(1).map((q, i) => Math.hypot(q[0] - p[i][0], q[1] - p[i][1]));
  let left = seg.reduce((a, b) => a + b, 0) / 2;
  for (let i = 0; i < seg.length; i++) {
    if (left <= seg[i]) { const f = seg[i] ? left / seg[i] : 0; return [p[i][0] + (p[i + 1][0] - p[i][0]) * f, p[i][1] + (p[i + 1][1] - p[i][1]) * f]; }
    left -= seg[i];
  }
  return [p[p.length - 1][0], p[p.length - 1][1]];
}
