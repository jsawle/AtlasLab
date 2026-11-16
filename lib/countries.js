// Countries by name (pure functions; no browser or SDK needed, so they are unit-tested in tests/countries.test.mjs).
// Add data can place a row by the country it names: this file works out which country a piece of text means, finds the
// column of a table that holds countries, and gets a country's outline ready to draw (fewer points; a point inside it).
// The list of countries and names is lib/countries-data.js, made by tools/countries.mjs.
export const COUNTRIES_VERSION = "1.0";

/**
 * A country name as it is compared: lower case, no accents, no dots or apostrophes ("D.R.C." = "drc", "Côte d'Ivoire" =
 * "cote divoire"), "&" as "and", "St" as "saint", other punctuation as a space, and no "the" at the start.
 */
export function normCountry(text) {
  let s = String(text == null ? "" : text).normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase();
  s = s.replace(/&/g, " and ").replace(/[.'’‘`´]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  if (!s) return "";
  let words = s.split(" ").map((w) => (w === "st" ? "saint" : w));
  if (words.length > 1 && words[0] === "the") words = words.slice(1);
  return words.join(" ");
}

function turned(n) {
  const b = /^([^(]+)\(([^)]+)\)\s*$/.exec(n); if (b) return normCountry(b[2] + " " + b[1]);
  const i = n.indexOf(","); return i > 0 ? normCountry(n.slice(i + 1) + " " + n.slice(0, i)) : "";
}
/** The lookup made from the list: names and codes to a country. `list` is COUNTRIES from countries-data.js. */
export function countryIndex(list) {
  const names = new Map(), codes = new Map(), byIso = new Map();
  for (const [iso2, iso3, name, more] of list) {
    const c = { iso2, iso3, name };
    byIso.set(iso2, c);
    for (const n of [name].concat(more || [])) { const k = normCountry(n); if (k && !names.has(k)) names.set(k, c); }
    // a name the list writes back to front is also known the right way round: "Congo (República Democrática del)", "Korea, Republic of"
    for (const n of more || []) { const k = turned(n); if (k && !names.has(k)) names.set(k, c); }
    codes.set(iso2.toLowerCase(), c); if (iso3) codes.set(iso3.toLowerCase(), c);
  }
  return { names, codes, byIso };
}

/**
 * The country a piece of text means, or null. Tried in turn: the text as a name; a name written back to front round a
 * comma ("Korea, Republic of", "Gambia, The"); the name without what is in brackets ("Bolivia (Plurinational State
 * of)"); a two- or three-letter code ("CD", "COD").
 */
export function matchCountry(text, index) {
  const raw = String(text == null ? "" : text).trim();
  if (!raw) return null;
  const tries = [normCountry(raw)];
  if (raw.includes(",")) { const parts = raw.split(","); tries.push(normCountry(parts.slice(1).join(" ") + " " + parts[0])); }
  if (/[([]/.test(raw)) tries.push(normCountry(raw.replace(/[([][^)\]]*[)\]]?/g, " ")));
  for (const k of tries) { if (k && index.names.has(k)) return index.names.get(k); }
  const code = raw.replace(/[.\s]/g, "").toLowerCase();
  if (/^[a-z]{2,3}$/.test(code) && index.codes.has(code)) return index.codes.get(code);
  return null;
}

// Column headings that say the column holds countries (compared as normCountry leaves them, without spaces).
const COUNTRY_HEADINGS = ["country", "countries", "countryname", "countrynames", "countrycode", "countrycodes", "countryorarea", "countryorterritory", "countryterritory",
  "nation", "nations", "iso", "iso2", "iso3", "isocode", "iso3166", "alpha2", "alpha3", "pais", "paises", "nombredelpais", "pays", "land", "staat", "orszag", "دولة", "البلد", "الدولة"];
const COUNTRY_SHARE = 0.7;   // an unnamed column counts as countries when this share of its filled cells are countries
/**
 * The column that holds countries: -1 when there is none. A column whose heading says so is taken if any cell in it is
 * a country; otherwise the column with the largest share of cells that are countries, when that share is 70% or more
 * (and at least two cells, or the only one). Returns { idx, matched, filled }.
 */
export function detectCountryColumn(header, rows, index) {
  let best = { idx: -1, matched: 0, filled: 0 }, bestScore = 0;
  header.forEach((h, i) => {
    let matched = 0, filled = 0;
    for (const r of rows) { const v = String(r[i] == null ? "" : r[i]).trim(); if (!v) continue; filled++; if (matchCountry(v, index)) matched++; }
    if (!matched) return;
    const named = COUNTRY_HEADINGS.includes(normCountry(h).replace(/ /g, ""));
    const share = matched / filled;
    if (!named && (share < COUNTRY_SHARE || (matched < 2 && filled > 1))) return;
    const score = (named ? 2 : 0) + share;
    if (score > bestScore) { bestScore = score; best = { idx: i, matched, filled }; }
  });
  return best;
}

/**
 * Each row's country, and what to tell the student: how many rows were placed, the names that weren't (each once, in
 * the order met), and the countries placed. `rows[r][idx]` is the cell.
 */
export function matchRows(rows, idx, index) {
  const isoOf = [], missed = [], seen = new Set(), found = new Map();
  let matched = 0, empty = 0;
  for (const r of rows) {
    const v = String(r[idx] == null ? "" : r[idx]).trim();
    const c = v ? matchCountry(v, index) : null;
    isoOf.push(c ? c.iso2 : null);
    if (c) { matched++; found.set(c.iso2, c); }
    else if (!v) empty++;
    else { const k = v.toLowerCase(); if (!seen.has(k)) { seen.add(k); missed.push(v); } }
  }
  return { isoOf, matched, empty, missed, countries: [...found.values()] };
}

// ---------- A country's outline, ready to draw ----------
const ringArea = (r) => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return Math.abs(a) / 2; };
const ringBox = (r) => { let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const p of r) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; } return [x0, y0, x1, y1]; };
// Douglas–Peucker: the points of a line that are needed to keep it within `tol` of where it was.
function thin(pts, tol) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(), ax = pts[a][0], ay = pts[a][1], dx = pts[b][0] - ax, dy = pts[b][1] - ay, len = Math.hypot(dx, dy);
    let far = 0, at = -1;
    for (let i = a + 1; i < b; i++) {
      const d = len ? Math.abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / len : Math.hypot(pts[i][0] - ax, pts[i][1] - ay);
      if (d > far) { far = d; at = i; }
    }
    if (far > tol && at > 0) { keep[at] = 1; stack.push([a, at], [at, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
export const OUTLINE = { detail: 400, minTolerance: 500, smallest: 0.0005 };
/**
 * A country's rings with fewer points, so a layer of countries is small enough to keep in a map file (the world is
 * about 700 KB, where the layer as it comes is 4.5 MB). Each ring keeps the points needed to stay within a 400th of the
 * width of the country's largest ring (500 m at least); rings smaller than a 2,000th of the largest ring's area are
 * left out (the smallest islands), and so is a ring left with fewer than three corners. Coordinates are whole metres.
 */
export function simplifyRings(rings) {
  const list = (rings || []).filter((r) => Array.isArray(r) && r.length >= 4);
  if (!list.length) return [];
  const areas = list.map(ringArea), most = Math.max(...areas), big = list[areas.indexOf(most)], b = ringBox(big);
  const tol = Math.max(OUTLINE.minTolerance, Math.hypot(b[2] - b[0], b[3] - b[1]) / OUTLINE.detail);
  const out = [];
  list.forEach((r, i) => {
    if (areas[i] < most * OUTLINE.smallest) return;
    const s = thin(r, tol);
    if (s.length >= 4) out.push(s.map((p) => [Math.round(p[0]), Math.round(p[1])]));
  });
  if (!out.length) out.push(big.map((p) => [Math.round(p[0]), Math.round(p[1])]));
  return out;
}
const inRing = (x, y, r) => { let inside = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside; } return inside; };
/**
 * A point inside a country, for showing it as a point: the centre of gravity of its largest ring, or, when that falls
 * outside the ring (a country shaped like a crescent), the middle of the widest stretch of the ring at that height.
 */
export function insidePoint(rings) {
  const list = (rings || []).filter((r) => Array.isArray(r) && r.length >= 4);
  if (!list.length) return null;
  const areas = list.map(ringArea), r = list[areas.indexOf(Math.max(...areas))];
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < r.length - 1; i++) { const f = r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; a += f; cx += (r[i][0] + r[i + 1][0]) * f; cy += (r[i][1] + r[i + 1][1]) * f; }
  const b = ringBox(r);
  if (!a) return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  cx /= 3 * a; cy /= 3 * a;
  if (inRing(cx, cy, r)) return [Math.round(cx), Math.round(cy)];
  const xs = [];
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const yi = r[i][1], yj = r[j][1]; if ((yi > cy) !== (yj > cy)) xs.push((r[j][0] - r[i][0]) * (cy - yi) / (yj - yi) + r[i][0]); }
  xs.sort((p, q) => p - q);
  let best = null, width = -1;
  for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > width) { width = xs[i + 1] - xs[i]; best = (xs[i] + xs[i + 1]) / 2; }
  return best == null ? [Math.round(cx), Math.round(cy)] : [Math.round(best), Math.round(cy)];
}
