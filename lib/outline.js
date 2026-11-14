// Outline maps for printing (5.0.0-beta.48). No browser needed: unit tested.
// A teacher prints a blank map for a class to label and colour: the world with its continents, a continent with its
// countries, the United States with its states. The boundaries are Esri's public layers; this file turns them into the
// lines of a drawing. The app draws those lines as SVG, so they print sharp at any size and nothing is sent anywhere.
export const OUTLINE_VERSION = "1.0";
const RAD = Math.PI / 180;

// --- projections: each takes degrees and gives x to the right, y down, in units of the earth's radius
// Equal Earth (Šavrič, Patterson and Jenny, 2018): the whole world with areas kept true.
export function equalEarth(lon, lat) {
  const A1 = 1.340264, A2 = -0.081106, A3 = 0.000893, A4 = 0.003796, M = Math.sqrt(3) / 2;
  const t = Math.asin(M * Math.sin(lat * RAD)), t2 = t * t, t6 = t2 * t2 * t2;
  return [(lon * RAD * Math.cos(t)) / (M * (A1 + 3 * A2 * t2 + t6 * (7 * A3 + 9 * A4 * t2))), -t * (A1 + A2 * t2 + t6 * (A3 + A4 * t2))];
}
// Lambert azimuthal equal-area about a centre: one continent, areas kept true.
export function azimuthal(lon0, lat0) {
  const s0 = Math.sin(lat0 * RAD), c0 = Math.cos(lat0 * RAD);
  return (lon, lat) => { const p = lat * RAD, d = (lon - lon0) * RAD, sp = Math.sin(p), cp = Math.cos(p), cd = Math.cos(d);
    const k = Math.sqrt(2 / Math.max(1e-9, 1 + s0 * sp + c0 * cp * cd));
    return [k * cp * Math.sin(d), -k * (c0 * sp - s0 * cp * cd)]; };
}
// Albers equal-area conic: the usual map of the United States.
export function albers(lat1, lat2, lon0, lat0) {
  const n = (Math.sin(lat1 * RAD) + Math.sin(lat2 * RAD)) / 2, C = Math.cos(lat1 * RAD) ** 2 + 2 * n * Math.sin(lat1 * RAD), r0 = Math.sqrt(C - 2 * n * Math.sin(lat0 * RAD)) / n;
  return (lon, lat) => { const r = Math.sqrt(Math.max(0, C - 2 * n * Math.sin(lat * RAD))) / n, th = n * (lon - lon0) * RAD; return [r * Math.sin(th), -(r0 - r * Math.cos(th))]; };
}

// Esri's layer files all of Russia but Kaliningrad, and Papua New Guinea, under Asia. For a class, Russia belongs on the
// map of Europe as well (it runs off the page's edge, as on any map of Europe) and Papua New Guinea with Oceania.
// --- what can be printed. frame: west, south, east, north in degrees: the part of the earth the page shows.
const COUNTRIES = "World_Countries", BASE = "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/";
export const OUTLINE_MAPS = [
  { id: "world", label: "outWorld", layer: "World_Continents", where: "1=1", name: "CONTINENT", detail: 0.3, project: () => equalEarth, frame: [-180, -90, 180, 90] },
  { id: "africa", label: "outAfrica", layer: COUNTRIES, where: "CONTINENT='Africa'", name: "COUNTRY", detail: 0.1, project: () => azimuthal(18, 2), frame: [-19, -36, 52, 38] },
  { id: "asia", label: "outAsia", layer: COUNTRIES, where: "CONTINENT='Asia' AND COUNTRY<>'Papua New Guinea'", name: "COUNTRY", detail: 0.15, project: () => azimuthal(95, 40), frame: [26, -11, 180, 78] },
  { id: "europe", label: "outEurope", layer: COUNTRIES, where: "CONTINENT='Europe' OR COUNTRY='Russian Federation'", name: "COUNTRY", detail: 0.06, project: () => azimuthal(18, 54), frame: [-25, 34, 62, 72] },
  { id: "north-america", label: "outNorthAmerica", layer: COUNTRIES, where: "CONTINENT='North America'", name: "COUNTRY", detail: 0.15, project: () => azimuthal(-98, 46), frame: [-168, 7, -20, 83] },
  { id: "south-america", label: "outSouthAmerica", layer: COUNTRIES, where: "CONTINENT='South America'", name: "COUNTRY", detail: 0.1, project: () => azimuthal(-60, -21), frame: [-82, -56, -34, 13] },
  { id: "oceania", label: "outOceania", layer: COUNTRIES, where: "CONTINENT IN ('Australia','Oceania') OR COUNTRY='Papua New Guinea'", name: "COUNTRY", detail: 0.08, project: () => azimuthal(147, -24), frame: [111, -48, 180, 1] },
  { id: "us-states", label: "outUsStates", layer: "USA_States_Generalized_Boundaries", where: "1=1", name: "STATE_NAME", short: "STATE_ABBR", detail: 0.02, project: () => albers(29.5, 45.5, -96, 37.5), frame: [-124.8, 24.4, -66.9, 49.4],
    insets: [{ match: "Alaska", project: () => albers(55, 65, -154, 50), box: [0, 0.7, 0.2, 1] }, { match: "Hawaii", project: () => azimuthal(-157.5, 20.5), box: [0.22, 0.86, 0.34, 1] }] }
];
export function outlineUrl(map) {
  const fields = [map.name, map.short].filter(Boolean).join(",");
  return BASE + encodeURIComponent(map.layer) + "/FeatureServer/0/query?where=" + encodeURIComponent(map.where) + "&outFields=" + fields + "&outSR=4326&maxAllowableOffset=" + map.detail + "&geometryPrecision=3&f=geojson";
}

// --- drawing
const ringsOf = (g) => !g ? [] : g.type === "Polygon" ? g.coordinates : g.type === "MultiPolygon" ? g.coordinates.flat() : [];
function areaCentre(pts) {      // a ring's area (signed) and centre
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const f = pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1]; a += f; cx += (pts[j][0] + pts[i][0]) * f; cy += (pts[j][1] + pts[i][1]) * f; }
  a /= 2; return a ? { area: Math.abs(a), x: cx / (6 * a), y: cy / (6 * a) } : { area: 0, x: pts[0][0], y: pts[0][1] };
}
function frameBox(project, [w, s, e, n]) {      // the frame's edges, projected: its box on the page
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const see = (lon, lat) => { const [x, y] = project(lon, lat); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
  for (let i = 0; i <= 40; i++) { const lon = w + ((e - w) * i) / 40, lat = s + ((n - s) * i) / 40; see(lon, s); see(lon, n); see(w, lat); see(e, lat); }
  return [x0, y0, x1, y1];
}
// features (GeoJSON, degrees) -> { width, height, shapes: [{ name, short, d, x, y, size }] } for a page of the given
// width (in drawing units; the height follows from the map's shape). d is an SVG path. x, y is where a name goes and
// size how big the shape is there (the square root of its largest part's area), so the caller can fit the lettering.
// Parts smaller than minArea square units (specks at this scale) are left out.
export function outlineShapes(map, features, width = 1000, minArea = 2.5) {
  const project = map.project(), [x0, y0, x1, y1] = frameBox(project, map.frame), k = width / (x1 - x0), height = Math.round((y1 - y0) * k);
  const main = (lon, lat) => { const [x, y] = project(lon, lat); return [(x - x0) * k, (y - y0) * k]; };
  const insets = (map.insets || []).map((ins) => {
    const p = ins.project(), f = (features || []).find((ft) => ft.properties && ft.properties[map.name] === ins.match), pts = f ? ringsOf(f.geometry).flat().map(([lon, lat]) => p(lon, lat)) : [];
    if (!pts.length) return null;
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]), bx0 = Math.min(...xs), by0 = Math.min(...ys), bw = Math.max(...xs) - bx0 || 1, bh = Math.max(...ys) - by0 || 1;
    const [l, t, r, b] = ins.box, W = (r - l) * width, H = (b - t) * height, s = Math.min(W / bw, H / bh), ox = l * width + (W - bw * s) / 2, oy = t * height + (H - bh * s) / 2;
    return { match: ins.match, to: (lon, lat) => { const [x, y] = p(lon, lat); return [ox + (x - bx0) * s, oy + (y - by0) * s]; } };
  }).filter(Boolean);
  const shapes = [], num = (v) => String(Math.round(v * 10) / 10);
  for (const f of features || []) {
    const name = String((f.properties && f.properties[map.name]) || ""), ins = insets.find((i) => i.match === name), to = ins ? ins.to : main;
    let d = "", best = null;
    for (const ring of ringsOf(f.geometry)) {
      const pts = ring.map(([lon, lat]) => to(lon, lat)), ac = areaCentre(pts);
      if (ac.area < minArea) continue;
      if (!ins) {      // a part that runs off the page is drawn (the page's edge cuts it) and named where it shows; one wholly off it is left out
        let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity; for (const q of pts) { bx0 = Math.min(bx0, q[0]); bx1 = Math.max(bx1, q[0]); by0 = Math.min(by0, q[1]); by1 = Math.max(by1, q[1]); }
        const ix0 = Math.max(0, bx0), iy0 = Math.max(0, by0), ix1 = Math.min(width, bx1), iy1 = Math.min(height, by1);
        if (ix1 <= ix0 || iy1 <= iy0) continue;
        if (ac.x < 0 || ac.x > width || ac.y < 0 || ac.y > height) { ac.x = (ix0 + ix1) / 2; ac.y = (iy0 + iy1) / 2; ac.area = Math.min(ac.area, (ix1 - ix0) * (iy1 - iy0) * 0.5); }
      }
      d += "M" + pts.map((q) => num(q[0]) + " " + num(q[1])).join("L") + "Z";
      if (!best || ac.area > best.area) best = ac;
    }
    if (d) shapes.push({ name, short: map.short ? String(f.properties[map.short] || "") : "", d, x: best.x, y: best.y, size: Math.sqrt(best.area) });
  }
  // one name for a place drawn as several features (a country's mainland and its islands): the largest part carries it
  const biggest = new Map(); for (const s of shapes) if (!biggest.has(s.name) || biggest.get(s.name).size < s.size) biggest.set(s.name, s);
  for (const s of shapes) s.labelled = biggest.get(s.name) === s;
  return { width, height, shapes };
}
// The lettering for a shape: its name if that fits across it, else its short form, else nothing. Returns { text, size }.
export function outlineLabel(shape, { min = 6.5, max = 13 } = {}) {
  if (!shape.labelled || !shape.name) return null;
  const fits = (text) => { const size = Math.min(max, (shape.size * 1.5) / Math.max(1, text.length * 0.56)); return size >= min ? { text, size: Math.round(size * 10) / 10 } : null; };
  return fits(shape.name) || (shape.short ? fits(shape.short) : null);
}
