// Going from the 2D map to the 3D view (5.0.0-beta.54). Plain functions with no map in them, so they can be tested.
// Why each is here is in the README: a review of how a selection of the collection's maps look after pressing 3D.
export const THREED_VERSION = "1.0";

// The 2D map's scale is measured on the Web Mercator grid, which stretches the world away from the equator; the 3D view's
// is true on the ground. Handing one to the other unchanged made the 3D view show a place smaller than the 2D map did
// (1.6 times smaller at London's latitude). These keep what is on screen the same size.
const cosLat = (lat) => Math.cos((Math.max(-85, Math.min(85, Number(lat) || 0)) * Math.PI) / 180);
export const scaleTo3d = (scale, lat) => scale * cosLat(lat);
export const scaleTo2d = (scale, lat) => scale / cosLat(lat);

// How far the camera tilts when the 3D view opens, by how far out the map is (the 3D view's scale). Looking at a
// continent, a tilted camera looks at the horizon and the map's subject ends up on the skyline, so there it looks straight
// down; from there the tilt grows as the map zooms in, to the config's angle at town scale and closer.
export const TILT_FLAT_SCALE = 5000000, TILT_FULL_SCALE = 250000;
export function tiltForScale(scale, max) {
  max = Math.max(0, Number(max) || 0);
  if (!(scale > 0) || scale <= TILT_FULL_SCALE) return max;
  if (scale >= TILT_FLAT_SCALE) return 0;
  return Math.round(max * (Math.log(TILT_FLAT_SCALE) - Math.log(scale)) / (Math.log(TILT_FLAT_SCALE) - Math.log(TILT_FULL_SCALE)));
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
