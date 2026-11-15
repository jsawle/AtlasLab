// Going from the 2D map to the 3D view (5.0.0-beta.54). Plain functions with no map in them, so they can be tested.
// Why each is here is in the README: a review of how a selection of the collection's maps look after pressing 3D.
export const THREED_VERSION = "1.3";   /* 1.3: the fill laid on the ground is in the main app; the swatch's clear edge and border are left off each repeat (no seams). */ /* 1.2: sketched areas with a styled fill get a thicker outline and a light tint in 3D; lab: the fill laid on the ground as a picture */

// The 2D map's scale is measured on the Web Mercator grid, which stretches the world away from the equator; the 3D view's
// is true on the ground. Handing one to the other unchanged made the 3D view show a place smaller than the 2D map did
// (1.6 times smaller at London's latitude). These keep what is on screen the same size.
const cosLat = (lat) => Math.cos((Math.max(-85, Math.min(85, Number(lat) || 0)) * Math.PI) / 180);
export const scaleTo3d = (scale, lat) => scale * cosLat(lat);
export const scaleTo2d = (scale, lat) => scale / cosLat(lat);

// How far the camera tilts when the 3D view opens, by how far out the map is (the 3D view's scale).
//  - town scale and closer (1:250,000): the config's angle
//  - out to a region (1:5,000,000 to 1:10,000,000): falling to 30°. That still shows plainly that the view is 3D (the
//    far edge curves away) and keeps the map's subject in the middle; the old 60° put it on the skyline. (1.0 looked
//    straight down here, which did not look like 3D at all.)
//  - beyond that it falls away to none at 1:25,000,000: there the globe itself shows the view is 3D, and a tilt only
//    pushes the globe down the screen.
export const TILT_FULL_SCALE = 250000, TILT_REGION_SCALE = 5000000, TILT_REGION_END = 10000000, TILT_GLOBE_SCALE = 25000000, TILT_REGION = 30;
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

// What the 3D view cannot draw as the 2D map does, for one layer. Returns the reasons, as keys of the wording:
//   symbols  polygon or line symbols made in ArcGIS Pro (CIM): 3D falls back to plain outlines
//   effect   layer or feature effects (glow, shadow, invert, blur): not drawn in 3D
//   blend    a blend mode on a kind of layer 3D does not blend
//   cluster  points grouped into clusters or bins: 3D draws every point
const BLENDS_IN_3D = ["tile", "vector-tile", "imagery-tile", "web-tile", "wmts", "wcs", "open-street-map", "base-tile", "group"];
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
 */
export function drapeSize(width, height) {
  const LONG = 2048, wide = width >= height, ratio = wide ? height / width : width / height, short = Math.max(64, Math.round(LONG * ratio));
  return { w: wide ? LONG : short, h: wide ? short : LONG, tile: Math.round(LONG / 6) };
}
