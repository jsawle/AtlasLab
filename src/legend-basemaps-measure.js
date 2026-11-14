// ============================================================ Legend, basemaps, measure
import "./sketch.js?v=5.0.0-beta.41";   // first: keeps the files running in the order they were written in (see app.js)
import { groupSort, basemapItems, thumbnailUrl, selectedId, needsDataTitles, gridMove } from "../lib/basemaps.js?v=5.0.0-beta.41";
import { xyToLonLat } from "../lib/doc.js?v=5.0.0-beta.41";
import { resolveUnits } from "../lib/units.js?v=5.0.0-beta.41";
import { state, late } from "./state.js?v=5.0.0-beta.41";
import { $, params, cfg, S, t, PORTAL } from "./config.js?v=5.0.0-beta.41";
import { Graphic, Basemap, Portal, reactiveUtils, ElevationLayer, toolEl, dropEl, restGet } from "./sdk.js?v=5.0.0-beta.41";
import { sketchLayers, viewEls, mapView, onViews, activeMap } from "./views.js?v=5.0.0-beta.41";
import { markDirty } from "./session.js?v=5.0.0-beta.41";
import { toast, openPanelName, openPanel, togglePanel } from "./ui.js?v=5.0.0-beta.41";
import { updatePopupEnabled } from "./popups.js?v=5.0.0-beta.41";
import { sketch } from "./sketch.js?v=5.0.0-beta.41";
import { shownMap } from "./maps.js?v=5.0.0-beta.41";
import { leaveData } from "./csv-import.js?v=5.0.0-beta.41";
late.portalUnits = portalUnits;   // for the start-up files, which run before this one (see late in state.js)

export let legend = null, legendMaking = null, coordWidget = null;
export async function ensureLegend() {
  if (!legend) { legendMaking = legendMaking || toolEl("arcgis-legend", $("legendBody"), { view: state.view }); try { legend = await legendMaking; } catch (e) { legendMaking = null; throw e; } }
  legend.view = state.view;
}

// Basemaps, as MapMaker shows them: the basemap group's web maps (and, in 3D, its web scenes) as a two-column grid of
// cards, in the group's own order (MapMaker's: date added, newest first). The card for the map's basemap is selected.
export const gallery = { items: null, loading: null, dataTitles: null, fetchingTitles: false };
async function loadGalleryItems() {
  if (gallery.items) return gallery.items;
  if (!gallery.loading) gallery.loading = (async () => {
    const group = await restGet(`/sharing/rest/community/groups/${cfg.basemapGroup}`);
    const d = await restGet(`/sharing/rest/content/groups/${cfg.basemapGroup}/search`, { q: "*", num: 100, start: 1, ...groupSort(group) });
    return d.results || [];
  })();
  try { gallery.items = await gallery.loading; return gallery.items; }
  catch (e) { console.error("Basemaps couldn't load", e); return null; }
  finally { gallery.loading = null; }
}
const galleryList = () => basemapItems(gallery.items || [], state.mode);
function currentBasemapInfo() {
  const m = shownMap(), b = m && m.basemap;
  return b ? { itemId: (b.portalItem && b.portalItem.id) || null, title: b.title || "" } : null;
}
export function syncGallerySelection() {
  if (!gallery.items) return;
  const list = galleryList(), info = currentBasemapInfo();
  const sel = selectedId(list, info, gallery.dataTitles);
  $("basemapsGrid").querySelectorAll(".bmg-card").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.id === sel)));
  // A basemap from inside a web map (a saved file, a collection map) is named as in its item's data, which can differ
  // from the card's name: fetch those names once, then look again.
  if (!sel && !gallery.dataTitles && !gallery.fetchingTitles && needsDataTitles(list, info)) {
    gallery.fetchingTitles = true;
    Promise.all(gallery.items.map((it) => restGet(`/sharing/rest/content/items/${it.id}/data`).then((d) => [it.id, (d && d.baseMap && d.baseMap.title) || ""], () => [it.id, ""])))
      .then((pairs) => { gallery.dataTitles = new Map(pairs); }).finally(() => { gallery.fetchingTitles = false; syncGallerySelection(); });
  }
}
export function renderGallery() {
  if (!gallery.items) return;
  const grid = $("basemapsGrid"), list = galleryList();
  const hadFocus = grid.contains(document.activeElement) ? document.activeElement.dataset.id : null;
  grid.innerHTML = "";
  for (const it of list) {
    const li = document.createElement("li");
    const b = document.createElement("button"); b.type = "button"; b.className = "bmg-card"; b.dataset.id = it.id;
    const src = thumbnailUrl(PORTAL, it, 400);
    const pic = document.createElement(src ? "img" : "span"); pic.className = "bmg-thumb";
    if (src) { pic.alt = ""; pic.loading = "lazy"; pic.decoding = "async"; pic.src = src; } else pic.setAttribute("aria-hidden", "true");
    const name = document.createElement("span"); name.className = "bmg-title"; name.textContent = String(it.title || "").trim() || S.untitled;
    b.append(pic, name);
    b.addEventListener("click", () => chooseBasemap(it));
    li.appendChild(b); grid.appendChild(li);
  }
  $("basemapsStatus").textContent = list.length ? "" : S.basemapsNone;
  syncGallerySelection();
  if (hadFocus) { const f = grid.querySelector('.bmg-card[data-id="' + hadFocus + '"]'); if (f) f.focus(); }
}
export async function ensureGallery() {
  if (gallery.items) { renderGallery(); return; }
  const st = $("basemapsStatus");
  st.textContent = S.basemapsLoading; $("basemapsGrid").innerHTML = "";
  if (await loadGalleryItems()) { renderGallery(); return; }
  st.textContent = S.basemapsError;
  const again = document.createElement("button"); again.type = "button"; again.className = "btn"; again.textContent = S.tryAgain;
  again.addEventListener("click", () => { ensureGallery().then(() => { const f = $("basemapsGrid").querySelector(".bmg-card"); if (f) f.focus(); }); });
  st.append(document.createElement("br"), again);
}
function chooseBasemap(it) {
  const m = activeMap(), cur = m.basemap;
  if (cur && cur.portalItem && cur.portalItem.id === it.id) return;
  const bm = new Basemap({ portalItem: { id: it.id } });
  m.basemap = bm;
  markDirty();
  syncGallerySelection();
  bm.load().catch((e) => { console.error("Basemap failed", e); toast(S.basemapFailed); });
}
$("basemapsGrid").addEventListener("keydown", (e) => {
  const cards = [...$("basemapsGrid").querySelectorAll(".bmg-card")], i = cards.indexOf(document.activeElement);
  if (i < 0) return;
  const cols = getComputedStyle($("basemapsGrid")).gridTemplateColumns.split(" ").filter(Boolean).length || 2;
  const n = gridMove(i, cards.length, cols, e.key);
  if (n == null) return;
  e.preventDefault(); cards[n].focus();
});
// The selected card follows the map's basemap, wherever it changes (another map opened, a file, a new map).
reactiveUtils.watch(() => { const m = shownMap(), b = m && m.basemap; return b ? ((b.portalItem && b.portalItem.id) || "") + "|" + (b.title || "") : ""; }, syncGallerySelection);
// Units (1.0 in 5.0.0-beta.12): kilometres and metres, or miles and feet, for Measure, Elevation and Sketch's
// tooltips and side labels. Where they start is worked out in lib/units.js; the km / mi switch changes them.
const UNITS_KEY = "atlas.units";
const unitsFound = (() => {
  let stored = null, timeZone, languages = [];
  if (cfg.unitsSwitch !== false) { try { stored = localStorage.getItem(UNITS_KEY); } catch (e) { /* no storage */ } }
  try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { /* not known */ }
  try { languages = navigator.languages && navigator.languages.length ? [...navigator.languages] : [navigator.language]; } catch (e) { /* not known */ }
  return resolveUnits({ param: (params.get("units") || "").toLowerCase(), stored, config: cfg.units, timeZone, languages });
})();
let units = unitsFound.units;
// Sketch's side labels have no units setting of their own: the SDK takes them from the portal's units (its
// documentation for SketchLabelOptions), of the map's item where there is one and of the default portal otherwise.
function portalUnits() {
  const pu = units === "imperial" ? "english" : "metric";
  try { Portal.getDefault().units = pu; } catch (e) { /* no default portal */ }
  for (const v of [mapView, state.sceneView]) { try { const it = v && v.map && v.map.portalItem; if (it && it.portal) it.portal.units = pu; } catch (e) { /* no item */ } }
}
export function sketchUnits() {
  portalUnits();
  if (!sketch) return;
  try { const u = { length: units, verticalLength: units, area: units }; sketch.valueOptions = { displayUnits: u, inputUnits: u }; } catch (e) { console.warn("Sketch units not set", e); }
}
function syncUnitsSwitches() {
  document.querySelectorAll(".units-seg").forEach((g) => { g.hidden = cfg.unitsSwitch === false; g.querySelectorAll("button[data-units]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.units === units))); });
}
function setUnits(u, save) {
  if (u !== "imperial" && u !== "metric") return;
  units = u;
  if (save) { try { localStorage.setItem(UNITS_KEY, u); } catch (e) { /* no storage: for this visit only */ } }
  try { if (measureEl) measureEl.unit = u; } catch (e) { console.warn("Measure units not set", e); }
  sketchUnits(); syncUnitsSwitches();
  if (prof && profActive()) renderProfile();
}
document.querySelectorAll(".units-seg button[data-units]").forEach((b) => b.addEventListener("click", () => setUnits(b.dataset.units, true)));
syncUnitsSwitches();
// Measure: one SDK component for each kind of measurement and each kind of view. It is made when a tool is chosen and
// taken away when measuring stops. Its own units menu is hidden: the km / mi switch above it sets the units.
const MEASURE_TAGS = { "2d": { distance: "arcgis-distance-measurement-2d", area: "arcgis-area-measurement-2d" }, "3d": { distance: "arcgis-direct-line-measurement-3d", area: "arcgis-area-measurement-3d" } };
let measureEl = null, measureSeq = 0;
function clearMeasure() {
  measureSeq++;
  if (measureEl) { try { measureEl.clear(); } catch (e) { /* idle */ } dropEl(measureEl); measureEl = null; }
}
async function startMeasure(kind) {
  clearMeasure(); const seq = measureSeq;
  let el; try { el = await toolEl(MEASURE_TAGS[state.mode][kind], $("measureBody"), { view: state.view, unit: units, hideUnitSelect: true }); } catch (e) { if (seq === measureSeq) stopMeasuring(); return; }
  if (seq !== measureSeq) { dropEl(el); return; }   // another tool was chosen, or measuring stopped, meanwhile
  measureEl = el;
  try { await el.start(); } catch (e) { /* stopped before the first click */ }
}
function measurePressed(id) { ["mDist", "mArea", "mCoord"].forEach((b) => $(b).setAttribute("aria-pressed", String(b === id))); }
export function stopMeasuring() {
  clearMeasure();
  measurePressed(null); state.measureActive = false; $("coordWrap").hidden = true;
  updatePopupEnabled();
}
$("mDist").addEventListener("click", () => { $("coordWrap").hidden = true; measurePressed("mDist"); state.measureActive = true; updatePopupEnabled(); startMeasure("distance"); });
$("mArea").addEventListener("click", () => { $("coordWrap").hidden = true; measurePressed("mArea"); state.measureActive = true; updatePopupEnabled(); startMeasure("area"); });
let coordMaking = null;
$("mCoord").addEventListener("click", async () => {
  clearMeasure();
  $("coordWrap").hidden = false; measurePressed("mCoord"); state.measureActive = false; updatePopupEnabled();
  // Capture mode: the coordinates stay where the map was clicked. (In Esri's default live mode they follow the pointer,
  // so moving to the panel to copy them would copy wherever the pointer last crossed the map.)
  if (!coordWidget) {
    coordMaking = coordMaking || toolEl("arcgis-coordinate-conversion", $("coordBody"), { view: state.view, mode: "capture" });
    try { coordWidget = await coordMaking; } catch (e) { coordMaking = null; return; }
    watchCoordCopy();
  }
  coordWidget.view = state.view; coordWidget.mode = "capture";
});
// Copy coordinates: the text Esri's own Copy puts on the clipboard (the tool's main row has no Copy button), ready to
// paste into one spreadsheet cell; Add layer reads that column back (see parseCoordPair in lib/csv.js).
const coordText = () => { const c = coordWidget && coordWidget.conversions && coordWidget.conversions.length ? coordWidget.conversions.getItemAt(0) : null; return (c && c.position && c.displayCoordinate) || ""; };
function watchCoordCopy() {
  reactiveUtils.watch(coordText, (txt) => { $("coordCopy").disabled = !txt; $("coordCopied").textContent = ""; }, { initial: true });
}
$("coordCopy").addEventListener("click", async () => {
  const txt = coordText();
  if (!txt) return;
  try { await navigator.clipboard.writeText(txt); $("coordCopied").textContent = S.coordsCopied; }
  catch (e) { $("coordCopied").textContent = S.coordsCopyFailed; }
});
$("mClear").addEventListener("click", stopMeasuring);

// Elevation profile: the land's height along a line drawn on the map (or a sketched line), from Esri's world elevation.
// Esri's World Elevation TopoBathy 3D: land and the sea floor (the service behind the SDK's "world-topobathymetry" ground).
// Sampled directly, so the profile dips below sea level in 2D and 3D alike, whatever the map's ground.
const TOPOBATHY_URL = "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/TopoBathy3D/ImageServer";
// Elevation profile 3.0 (5.0.0-beta.10; 3.1 in beta.11: drawn lines are geodesic): the app's own tool and chart; before, Esri's Elevation Profile widget, which
// could not be given a sea-level line or a filled chart (and is one of the widgets SDK 6 removes).
//  - The line: click the map for each point and double-click to finish, or click a line already on the map (a
//    sketched line, or a line feature of a layer). Over a line that can be chosen the pointer becomes a hand.
//  - The heights: 512 points along the line, asked of the elevation service in one request. Always 512 (3.2; before, fewer
//    on a narrower screen), so a line gives the same figures on every screen.
//  - Total climb and total descent (3.2): only for a line up to 50 km. They add up every rise and fall between the points,
//    so on a longer line they count the bumps of the land or sea floor between points kilometres apart, and change with
//    how many points are taken (Venezuela to Mali: 18,310 m of climb from 128 points, 36,769 m from 512, 60,751 m from
//    4,096). Up to 50 km the points are 100 m apart or less.
//  - Changing a drawn line (3.3), as in MapMaker: its points are orange handles, and a white handle halfway along each
//    part adds a point. Drag a handle to move it (the line follows the pointer; the heights are asked for again when it
//    is let go); double-click a point to take it out (a line keeps at least two). A line chosen on the map (a sketch, a
//    feature) is changed where it belongs, with Sketch.
//  - Touch (3.4): a finger has no pointer that hovers, so the line so far is drawn through the places tapped (with a dot
//    at each) rather than on to the pointer, and Finish line and Undo point buttons appear while drawing (also for a
//    mouse: double-click and Enter still finish). Moving a finger over the map (panning) no longer asks the map what is
//    under it each time, which was slow in 3D on an iPad. Handles are easier to hit with a finger. Messages say "tap".
//  - Vertical exaggeration (3.2): the chart stretches heights to fill its box, by an amount that depends on the line and
//    the screen (64 times for an Atlantic crossing, 132 for 65 km of the Hungarian plain). The figure is shown under the
//    chart and told to screen readers, as a printed profile states its vertical exaggeration.
//  - The chart: the whole width under the map. Land is filled in earth colours, lighter at the top and darker with
//    depth; where the line goes below sea level the water is shown and a dashed line marks sea level.
//  - Moving along the chart (pointer, or the arrow keys) shows a dot at that place on the line on the map.
const PROF_POINTS = 512, PROF_CLIMB_MAX = 50000;   // points along every line; the longest line (m) given total climb and descent
let topoBathy = null, prof = null, profHover = null, profBusy = 0, profAt = -1;
const profGraphics = { line: null, dot: null, draft: null, draftDots: null };
export const PROF_KEYS = ["line", "dot", "draft", "draftDots"];
// A finger (or a device with no hovering pointer) gets the touch wording; the last pointer used on the map decides.
let profTouch = (() => { try { return matchMedia("(hover: none)").matches; } catch (e) { return false; } })();
const isTouch = (e) => { const n = e && e.native; return !!n && n.pointerType === "touch"; };
const profHint = () => (profTouch ? S.profileHintTouch : S.profileHint);
const PROF_LINE = { type: "simple-line", color: [255, 127, 0, 1], width: 3 };
const PROF_DOT = { type: "simple-marker", style: "circle", color: [255, 255, 255, 1], size: 13, outline: { color: [200, 60, 0, 1], width: 3 } };
const PROF_VERTEX = { type: "simple-marker", style: "circle", color: [255, 127, 0, 1], size: 13, outline: { color: [255, 255, 255, 1], width: 2 } };
const PROF_MID = { type: "simple-marker", style: "circle", color: [255, 255, 255, 1], size: 10, outline: { color: [80, 80, 80, 1], width: 1.5 } };
let profHandles = [], profEdit = null;   // the handles of a drawn line; the point being dragged
export const profActive = () => openPanelName === "profile";
function setViewCursor(c) { const el = viewEls.get(state.view); try { if (el) el.style.cursor = c || ""; if (state.view.container) state.view.container.style.cursor = c || ""; } catch (e) { /* no container */ } }
export function profShow(key, graphic) {
  for (const v of [mapView, state.sceneView]) if (v && profGraphics[key] && v.graphics.includes(profGraphics[key])) v.graphics.remove(profGraphics[key]);
  profGraphics[key] = graphic; if (graphic) state.view.graphics.add(graphic);
}
export function ensureProfile() {
  if (!topoBathy) {
    topoBathy = new ElevationLayer({ url: TOPOBATHY_URL });
    topoBathy.load().then(() => {   // credit the data, as the map's attribution would if it were on the map
      const src = topoBathy.copyright || "";
      $("profileSource").textContent = src ? t("profileSource", { src }) : ""; $("profileSource").title = src;
    }).catch(() => {});
  }
  fillProfileLines();
  if (prof) { profShow("line", new Graphic({ geometry: prof.line, symbol: PROF_LINE })); showProfHandles(prof.via); renderProfile(); } else profMessage(profHint());
  setViewCursor("crosshair");
}
export function stopProfile() {
  state.profDraft = null; profHover = null; profBusy++; profEdit = null; syncDraftButtons();
  for (const k of PROF_KEYS) profShow(k, null);
  showProfHandles(null);
  setViewCursor("");
}
function clearProfile() { prof = null; profAt = -1; state.profDraft = null; profEdit = null; showProfHandles(null); syncDraftButtons(); for (const k of PROF_KEYS) profShow(k, null); $("profLines").value = ""; profMessage(profHint()); $("profStats").replaceChildren(); $("profNew").hidden = true; }
function profMessage(text) { $("profChart").replaceChildren(); const p = document.createElement("p"); p.className = "prof-msg"; p.textContent = text; $("profChart").appendChild(p); $("profStatus").textContent = text; }
// the lines that can be chosen without the pointer: the sketched lines, by name
function sketchLines() { return sketchLayers.flatMap((l) => l.graphics.filter((g) => g.geometry && g.geometry.type === "polyline").toArray()); }
function fillProfileLines() {
  const sel = $("profLines"), lines = sketchLines();
  sel.replaceChildren(new Option(S.profilePickLine, ""));
  lines.forEach((g, i) => sel.appendChild(new Option((g.attributes && g.attributes.title) || t("profileLineN", { n: i + 1 }), String(i))));
  $("profLinesWrap").hidden = !lines.length;
}
// --- the line's points and their heights
const R_EARTH = 6371008.8, D2R = Math.PI / 180;
const lonLatToXY = (lon, lat) => [lon * D2R * 6378137, Math.log(Math.tan(Math.PI / 4 + (lat * D2R) / 2)) * 6378137];
function haversine(a, b) { const dLat = (b[1] - a[1]) * D2R, dLon = (b[0] - a[0]) * D2R, h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * D2R) * Math.cos(b[1] * D2R) * Math.sin(dLon / 2) ** 2; return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h))); }
// The shortest way round the Earth between two places (a great circle), as longitudes and latitudes; the longitudes run
// on past 180 rather than jumping, so the line stays in one piece on the map.
const llUnit = ([lon, lat]) => [Math.cos(lat * D2R) * Math.cos(lon * D2R), Math.cos(lat * D2R) * Math.sin(lon * D2R), Math.sin(lat * D2R)];
function geoBetween(p, q, f) {
  const u = llUnit(p), v = llUnit(q), w = Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2])));
  if (w < 1e-9) return [p[0], p[1]];
  const k1 = Math.sin((1 - f) * w) / Math.sin(w), k2 = Math.sin(f * w) / Math.sin(w), x = k1 * u[0] + k2 * v[0], y = k1 * u[1] + k2 * v[1], z = k1 * u[2] + k2 * v[2];
  let lon = Math.atan2(y, x) / D2R; const ref = p[0] + (q[0] - p[0]) * f; lon += Math.round((ref - lon) / 360) * 360;
  return [lon, Math.atan2(z, Math.hypot(x, y)) / D2R];
}
const isMerc = (sr) => !!sr && (sr.isWebMercator || sr.wkid === 102100 || sr.wkid === 3857);
const PROF_MAX_LAT = 85;   // Web Mercator has no poles
const llToXY = (ll) => lonLatToXY(ll[0], Math.max(-PROF_MAX_LAT, Math.min(PROF_MAX_LAT, ll[1])));
// the points clicked (Web Mercator), joined by great circles, as a line the map can draw
function geodesicLine(clicks, perPart) {
  const ll = clicks.map((c) => xyToLonLat(c.x, c.y)); for (let i = 1; i < ll.length; i++) ll[i][0] += Math.round((ll[i - 1][0] - ll[i][0]) / 360) * 360;   // each the short way from the last
  return { ll, geometry: geodesicPath(ll, perPart) };
}
function geodesicPath(ll, perPart) {
  const path = [llToXY(ll[0])];
  for (let i = 1; i < ll.length; i++) for (let k = 1; k <= perPart; k++) path.push(llToXY(geoBetween(ll[i - 1], ll[i], k / perPart)));
  return { type: "polyline", paths: [path], spatialReference: { wkid: 102100 } };
}
// --- the handles of a drawn line: its points, and halfway along each part a point to add
function showProfHandles(via) {
  for (const v of [mapView, state.sceneView]) if (v) for (const h of profHandles) if (v.graphics.includes(h)) v.graphics.remove(h);
  profHandles = [];
  if (!via || via.length < 2 || !profActive()) return;
  const pt = (ll) => { const [x, y] = llToXY(ll); return { type: "point", x, y, spatialReference: { wkid: 102100 } }; };
  for (let i = 0; i + 1 < via.length; i++) profHandles.push(new Graphic({ geometry: pt(geoBetween(via[i], via[i + 1], 0.5)), symbol: PROF_MID, attributes: { kind: "mid", i } }));
  via.forEach((ll, i) => profHandles.push(new Graphic({ geometry: pt(ll), symbol: PROF_VERTEX, attributes: { kind: "vertex", i } })));
  state.view.graphics.addMany(profHandles);
}
// The handle at a place on the screen (a point first, then a halfway point), or null.
function profHandleAt(sx, sy, touch) {
  if (!prof || !prof.via || !profHandles.length) return null;
  let best = null, bd = Infinity;
  for (const kind of ["vertex", "mid"]) {
    for (const h of profHandles) {
      if (h.attributes.kind !== kind) continue;
      const q = state.view.toScreen(h.geometry); if (!q) continue;
      const d = Math.hypot(q.x - sx, q.y - sy); if (d < bd) { bd = d; best = h; }
    }
    if (best && bd <= (kind === "vertex" ? 12 : 10) * (touch ? 2 : 1)) return best;   // a fingertip is wider than a pointer
    best = null; bd = Infinity;
  }
  return null;
}
// A line drawn in the tool is geodesic: `via` is its clicked places (longitude, latitude). A line chosen on the map (a
// sketch, a feature) is followed as it is drawn there, straight between its points in Web Mercator.
async function profileOf(geometry, via) {
  const sr = geometry.spatialReference, merc = sr && (sr.isWebMercator || sr.wkid === 102100 || sr.wkid === 3857), geo = sr && (sr.isWGS84 || sr.wkid === 4326);
  if (!merc && !geo) { profMessage(S.profileNoSR); return; }
  const verts = []; if (via) verts.push(...via); else for (const path of geometry.paths) for (const c of path) verts.push(merc ? [c[0], c[1]] : lonLatToXY(c[0], c[1]));
  if (verts.length < 2) return;
  const segs = []; let total = 0; for (let i = 1; i < verts.length; i++) { const l = via ? haversine(verts[i - 1], verts[i]) : Math.hypot(verts[i][0] - verts[i - 1][0], verts[i][1] - verts[i - 1][1]); segs.push(l); total += l; }
  if (!(total > 0)) return;
  const N = PROF_POINTS;
  const pts = [];
  for (let k = 0; k < N; k++) {
    let d = (total * k) / (N - 1), i = 0; while (i < segs.length - 1 && d > segs[i]) { d -= segs[i]; i++; }
    const f = segs[i] ? Math.min(1, d / segs[i]) : 0;
    if (via) { const g = geoBetween(verts[i], verts[i + 1], f), xy = llToXY(g); pts.push({ x: xy[0], y: xy[1], ll: [((g[0] + 540) % 360 + 360) % 360 - 180, g[1]] }); }
    else { const x = verts[i][0] + (verts[i + 1][0] - verts[i][0]) * f, y = verts[i][1] + (verts[i + 1][1] - verts[i][1]) * f; pts.push({ x, y, ll: xyToLonLat(x, y) }); }
  }
  const seq = ++profBusy;
  profMessage(S.profileWorking);
  profShow("line", new Graphic({ geometry, symbol: PROF_LINE })); profShow("draft", null); profShow("dot", null);
  showProfHandles(via || null);
  let z;
  try {
    const res = await topoBathy.queryElevation({ type: "polyline", paths: [pts.map((p) => p.ll)], spatialReference: { wkid: 4326 } }, { demResolution: "auto", noDataValue: NaN });
    z = res.geometry.paths[0].map((c) => c[2]);
  } catch (e) { console.error("Elevation not available", e); if (seq === profBusy) profMessage(S.profileFailed); return; }
  if (seq !== profBusy || !profActive()) return;
  let dist = 0, last = null, gain = 0, loss = 0, min = Infinity, max = -Infinity;
  pts.forEach((p, i) => {
    if (i) dist += haversine(pts[i - 1].ll, p.ll);
    p.d = dist; p.z = Number.isFinite(z[i]) ? z[i] : last;
    if (p.z != null) { if (last != null) { const dz = p.z - last; if (dz > 0) gain += dz; else loss -= dz; } last = p.z; min = Math.min(min, p.z); max = Math.max(max, p.z); }
  });
  const first = pts.find((p) => p.z != null); if (!first) { profMessage(S.profileFailed); return; }
  for (const p of pts) { if (p.z == null) p.z = first.z; }
  prof = { line: geometry, sr, pts, total: dist, min, max, gain, loss, via: via ? via.map((c) => [c[0], c[1]]) : null };
  showProfHandles(prof.via);
  profAt = -1; $("profNew").hidden = false;
  renderProfile();
}
// --- numbers, in the units the app is set to
const profNum = (v, places) => new Intl.NumberFormat(S.locale || undefined, { maximumFractionDigits: places, minimumFractionDigits: 0 }).format(v);
function profHeight(m) { const v = units === "imperial" ? m * 3.28084 : m; return profNum(Math.round(v) === 0 ? 0 : v, 0) + (units === "imperial" ? " ft" : " m"); }
function profDist(m, totalM) {
  if (units === "imperial") { const mi = m / 1609.344; return totalM < 1609.344 ? profNum(m * 3.28084, 0) + " ft" : profNum(mi, totalM < 16093 ? 1 : 0) + " mi"; }
  return totalM < 1000 ? profNum(m, 0) + " m" : profNum(m / 1000, totalM < 10000 ? 1 : 0) + " km";
}
// Round numbers for a scale between lo and hi: about `want` of them, and at least `least` when that is given (the height
// scale asks for 3: with a short chart and a large range the round steps could otherwise leave only two, 0 and -5,000).
function niceTicks(lo, hi, want, least) {
  const span = hi - lo || 1, raw = span / want, pow = 10 ** Math.floor(Math.log10(raw)), steps = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10].map((m) => m * pow);
  const at = (step) => { const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step) out.push(Math.abs(v) < step * 1e-6 ? 0 : v); return out; };
  let i = steps.findIndex((st) => st >= pow && span / st <= want); if (i < 0) i = steps.length - 1;
  let out = at(steps[i]);
  while (least && out.length < least && i > 0) out = at(steps[--i]);
  return out;
}
// How many times taller than true the chart draws heights: metres per pixel along the line over metres per pixel up the chart.
function profStretch(total, w, lo, hi, h) { return total > 0 && hi > lo && w > 0 && h > 0 ? (total / w) / ((hi - lo) / h) : 1; }
function profStretchText(ve) {
  if (ve >= 0.67 && ve < 1.5) return S.profileTrueShape;
  return "×" + profNum(ve, ve >= 10 ? 0 : ve >= 1 ? 1 : 2);
}
// --- the chart
const SVGNS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs, text) { const e = document.createElementNS(SVGNS, tag); for (const k in attrs || {}) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; }
let profScale = null;
function renderProfile() {
  if (!prof || !profActive()) return;
  const host = $("profChart"), W = Math.max(320, host.clientWidth), H = Math.max(120, host.clientHeight);
  const m = { l: 66, r: 18, t: 16, b: 30 }, w = W - m.l - m.r, h = H - m.t - m.b;
  const hz = units === "imperial" ? 3.28084 : 1, unitDist = units === "imperial" ? (prof.total < 1609.344 ? 0.3048 : 1609.344) : (prof.total < 1000 ? 1 : 1000);
  // the height axis: the line's own range with room above and below; sea level is always in view when the line goes below it
  let lo = prof.min, hi = prof.max; const pad = Math.max((hi - lo) * 0.12, 5); lo -= pad; hi += pad;
  const under = prof.min < 0; if (under && hi < 0) hi = pad;
  const X = (d) => m.l + (prof.total ? (d / prof.total) * w : 0), Y = (z) => m.t + (1 - (z - lo) / (hi - lo)) * h;
  profScale = { X, Y, m, w, h, W, H };
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, "aria-hidden": "true", focusable: "false", class: "prof-svg" });
  const defs = svgEl("defs");
  // earth: light at the surface, darker with depth (from the top of the chart to its bottom)
  const earth = svgEl("linearGradient", { id: "profEarth", gradientUnits: "userSpaceOnUse", x1: 0, x2: 0, y1: Y(prof.max), y2: m.t + h });
  for (const [o, c] of [[0, "#ead9b0"], [0.3, "#cfa76a"], [0.65, "#96622f"], [1, "#4b2e17"]]) earth.appendChild(svgEl("stop", { offset: o, "stop-color": c }));
  const water = svgEl("linearGradient", { id: "profWater", gradientUnits: "userSpaceOnUse", x1: 0, x2: 0, y1: Y(0), y2: m.t + h });
  for (const [o, c] of [[0, "#a9d6f0"], [1, "#3d86c0"]]) water.appendChild(svgEl("stop", { offset: o, "stop-color": c }));
  defs.append(earth, water); svg.appendChild(defs);
  svg.appendChild(svgEl("rect", { x: m.l, y: m.t, width: w, height: h, fill: "#fbfaf7" }));
  // grid and the height scale
  for (const v of niceTicks(lo * hz, hi * hz, Math.max(2, Math.min(5, Math.floor(h / 34))), 3)) {
    const y = Y(v / hz); if (y < m.t - 0.5 || y > m.t + h + 0.5) continue;
    svg.appendChild(svgEl("line", { x1: m.l, x2: m.l + w, y1: y, y2: y, stroke: "#dcd8cf", "stroke-width": 1 }));
    svg.appendChild(svgEl("text", { x: m.l - 8, y: y + 4.5, "text-anchor": "end", class: "prof-tick" }, profNum(v, 0) + (units === "imperial" ? " ft" : " m")));
  }
  if (under) svg.appendChild(svgEl("rect", { x: m.l, y: Y(0), width: w, height: m.t + h - Y(0), fill: "url(#profWater)", class: "prof-water" }));
  const top = prof.pts.map((p, i) => (i ? "L" : "M") + X(p.d).toFixed(1) + " " + Y(p.z).toFixed(1)).join("");
  svg.appendChild(svgEl("path", { d: top + `L${(m.l + w).toFixed(1)} ${m.t + h}L${m.l} ${m.t + h}Z`, fill: "url(#profEarth)", class: "prof-land" }));
  svg.appendChild(svgEl("path", { d: top, fill: "none", stroke: "#3a2412", "stroke-width": 1, "stroke-linejoin": "round", class: "prof-top" }));
  if (under) {   // sea level, where the line goes below it
    svg.appendChild(svgEl("line", { x1: m.l, x2: m.l + w, y1: Y(0), y2: Y(0), stroke: "#0b4f8a", "stroke-width": 2, "stroke-dasharray": "7 5", class: "prof-sea" }));
    const atStart = prof.pts[0].z < prof.pts[prof.pts.length - 1].z;   // named at the end that is under water, clear of the land
    svg.appendChild(svgEl("text", { x: atStart ? m.l + 6 : m.l + w - 6, y: Y(0) - 6, "text-anchor": atStart ? "start" : "end", class: "prof-sea-label" }, S.profileSeaLevel));
  }
  // the distance scale
  for (const v of niceTicks(0, prof.total / unitDist, Math.max(3, Math.min(10, Math.floor(w / 110))))) {
    const x = X(v * unitDist);
    svg.appendChild(svgEl("line", { x1: x, x2: x, y1: m.t + h, y2: m.t + h + 5, stroke: "#4a4a4a", "stroke-width": 1 }));
    svg.appendChild(svgEl("text", { x, y: m.t + h + 20, "text-anchor": v === 0 ? "start" : (x > m.l + w - 34 ? "end" : "middle"), class: "prof-tick" }, profNum(v, 1) + (units === "imperial" ? (unitDist === 0.3048 ? " ft" : " mi") : (unitDist === 1 ? " m" : " km"))));
  }
  svg.appendChild(svgEl("rect", { x: m.l, y: m.t, width: w, height: h, fill: "none", stroke: "#8a8a8a", "stroke-width": 1 }));
  // the place the pointer (or the arrow keys) is at
  const g = svgEl("g", { id: "profMark", visibility: "hidden" });
  g.append(svgEl("line", { id: "profGuide", y1: m.t, y2: m.t + h, stroke: "#1f1f1f", "stroke-width": 1.5 }), svgEl("circle", { id: "profPoint", r: 6, fill: "#fff", stroke: "#c83c00", "stroke-width": 3 }));
  svg.appendChild(g);
  host.replaceChildren(svg);
  const tip = document.createElement("div"); tip.className = "prof-tip"; tip.id = "profTip"; tip.hidden = true; host.appendChild(tip);
  // what the chart says, in words, and the figures along the bottom
  const ve = profStretch(prof.total, w, lo, hi, h), veText = profStretchText(ve), trueShape = ve >= 0.67 && ve < 1.5;
  const veSay = trueShape ? S.profileTrueShapeSay : t("profileStretchSay", { n: profNum(ve, ve >= 10 ? 0 : ve >= 1 ? 1 : 2) });
  const short = prof.total <= PROF_CLIMB_MAX;
  const stats = [[S.profileLength, profDist(prof.total, prof.total)], [S.profileHighest, profHeight(prof.max)], [S.profileLowest, profHeight(prof.min)]];
  if (short) stats.push([S.profileClimb, profHeight(prof.gain)], [S.profileDescent, profHeight(prof.loss)]);
  stats.push([S.profileStretch, veText, veSay + (ve >= 1.5 ? " " + S.profileStretchWhy : "")]);
  const items = stats.map(([k, v, tip]) => { const d = document.createElement("div"); d.className = "prof-stat"; const dt = document.createElement("dt"); dt.textContent = k; const dd = document.createElement("dd"); dd.textContent = v; if (tip) { d.title = tip; d.classList.add("prof-stretch"); } d.append(dt, dd); return d; });
  if (!short) { const n = document.createElement("div"); n.className = "prof-stat prof-note"; const dt = document.createElement("dt"); dt.textContent = S.profileClimbBoth; const dd = document.createElement("dd"); dd.textContent = t("profileClimbLong", { dist: profDist(PROF_CLIMB_MAX, PROF_CLIMB_MAX) }); n.append(dt, dd); items.push(n); }
  $("profStats").replaceChildren(...items);
  $("profStatus").textContent = t("profileSummary", { length: stats[0][1], high: stats[1][1], low: stats[2][1] }) + (under ? " " + S.profileBelowSea : "") + " " + veSay;
  host.setAttribute("aria-valuemin", "0"); host.setAttribute("aria-valuemax", String(prof.pts.length - 1));
  profMark(profAt, false);
}
function profMark(i, announce) {
  const host = $("profChart"), mark = document.getElementById("profMark"), tip = $("profTip");
  if (!prof || !mark || !profScale) return;
  if (i < 0 || i >= prof.pts.length) { profAt = -1; mark.setAttribute("visibility", "hidden"); if (tip) tip.hidden = true; profShow("dot", null); host.setAttribute("aria-valuenow", "0"); host.setAttribute("aria-valuetext", S.profileNoPlace); return; }
  profAt = i; const p = prof.pts[i], x = profScale.X(p.d), y = profScale.Y(p.z);
  mark.setAttribute("visibility", "visible");
  const gl = document.getElementById("profGuide"); gl.setAttribute("x1", x); gl.setAttribute("x2", x);
  const pt = document.getElementById("profPoint"); pt.setAttribute("cx", x); pt.setAttribute("cy", y);
  const text = t("profileAt", { dist: profDist(p.d, prof.total), height: profHeight(p.z) });
  tip.textContent = text; tip.hidden = false;
  const tw = tip.offsetWidth || 150; tip.style.left = Math.max(profScale.m.l, Math.min(profScale.W - tw - 6, x + (x + tw + 18 > profScale.W ? -tw - 12 : 12))) + "px"; tip.style.top = Math.max(2, Math.min(profScale.m.t + profScale.h - 34, y - 38)) + "px";
  host.setAttribute("aria-valuenow", String(i)); host.setAttribute("aria-valuetext", text);
  // the same place on the line on the map
  const geom = { type: "point", x: p.x, y: p.y, spatialReference: { wkid: 102100 } };
  if (profGraphics.dot && state.view.graphics.includes(profGraphics.dot)) profGraphics.dot.geometry = geom; else profShow("dot", new Graphic({ geometry: geom, symbol: PROF_DOT }));
}
{
  const host = $("profChart");
  const at = (e) => { if (!prof || !profScale) return -1; const r = host.getBoundingClientRect(), x = e.clientX - r.left; if (x < profScale.m.l - 4 || x > profScale.m.l + profScale.w + 4) return -1; return Math.max(0, Math.min(prof.pts.length - 1, Math.round(((x - profScale.m.l) / profScale.w) * (prof.pts.length - 1)))); };
  host.addEventListener("pointermove", (e) => profMark(at(e)));
  host.addEventListener("pointerdown", (e) => profMark(at(e)));
  host.addEventListener("pointerleave", () => { if (document.activeElement !== host) profMark(-1); });
  host.addEventListener("blur", () => profMark(-1));
  host.addEventListener("keydown", (e) => {
    if (!prof) return; const n = prof.pts.length, step = e.shiftKey ? Math.round(n / 10) : Math.max(1, Math.round(n / 100));
    const to = { ArrowRight: profAt + step, ArrowUp: profAt + step, ArrowLeft: profAt - step, ArrowDown: profAt - step, Home: 0, End: n - 1, PageUp: profAt + Math.round(n / 10), PageDown: profAt - Math.round(n / 10) }[e.key];
    if (to === undefined) return; e.preventDefault(); profMark(Math.max(0, Math.min(n - 1, profAt < 0 && !["Home", "End"].includes(e.key) ? 0 : to)));
  });
  if (typeof ResizeObserver !== "undefined") { let rt = 0; new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => { if (prof && profActive()) renderProfile(); }, 80); }).observe(host); }
  $("profNew").addEventListener("click", () => { clearProfile(); setViewCursor("crosshair"); });
  $("profLines").addEventListener("change", () => { const g = sketchLines()[Number($("profLines").value)]; if ($("profLines").value !== "" && g) profileOf(g.geometry.clone()); });
}
// --- on the map: choose a line, or draw one
const lineUnder = async (e) => {
  try { const hit = await state.view.hitTest(e); const r = (hit.results || []).find((x) => x.type === "graphic" && x.graphic && x.graphic.geometry && x.graphic.geometry.type === "polyline" && x.graphic !== profGraphics.line && x.graphic !== profGraphics.draft); return r ? r.graphic : null; } catch (err) { return null; }
};
let hoverTimer = 0, hoverSeq = 0;
onViews("pointer-move", (e) => {
  if (!profActive()) return;
  if (isTouch(e)) return;   // a finger moving is panning the map: no line to the finger, and no asking what is under it
  if (state.profDraft) {   // the line so far, and on to the pointer
    const p = state.view.toMap({ x: e.x, y: e.y }); if (!p) return;
    drawDraft(p);
    return;
  }
  if (profEdit) return;
  if (profHandleAt(e.x, e.y)) { clearTimeout(hoverTimer); ++hoverSeq; profHover = null; setViewCursor("grab"); return; }   // a handle of the line: it can be dragged
  clearTimeout(hoverTimer); const seq = ++hoverSeq;
  hoverTimer = setTimeout(async () => { const g = await lineUnder(e); if (seq !== hoverSeq || !profActive() || state.profDraft) return; profHover = g; setViewCursor(g ? "pointer" : "crosshair"); }, 40);   // a hand over a line that can be chosen
});
// Points are taken on "immediate-click": the view's "click" waits to see whether a double-click follows, and is not
// sent at all when one does, so the place double-clicked would never be added to the line.
onViews("click", (e) => { if (profActive()) e.stopPropagation(); });   // no pop-ups while the tool is open
onViews("immediate-click", async (e) => {
  if (!profActive() || e.button === 2) return;
  profTouch = isTouch(e);
  if (!state.profDraft && (profEdit || profHandleAt(e.x, e.y, profTouch))) return;   // a handle pressed and let go without moving: nothing changes
  if (!state.profDraft) {
    const g = profHover || await lineUnder(e);
    if (g) { profHover = null; setViewCursor("crosshair"); $("profLines").value = ""; profileOf(g.geometry.clone()); return; }   // a line on the map was chosen
    if (prof) clearProfile();
    state.profDraft = [];
  }
  if (!e.mapPoint) return;
  const last = state.profDraft[state.profDraft.length - 1];   // the second click of a double-click is the same place: once only
  if (!last || Math.hypot(last.sx - e.x, last.sy - e.y) > 4) { const q = e.mapPoint; state.profDraft.push({ x: q.x, y: q.y, spatialReference: q.spatialReference, sx: e.x, sy: e.y }); }
  if (state.profDraft.length === 1) profMessage(profTouch ? S.profileDrawingTouch : S.profileDrawing);
  drawDraft();
});
// The line being drawn: through the places clicked or tapped, and on to the pointer when there is one (`to`).
function drawDraft(to) {
  if (!state.profDraft || !state.profDraft.length) { profShow("draft", null); profShow("draftDots", null); syncDraftButtons(); return; }
  const pts = to ? [...state.profDraft, to] : state.profDraft;
  if (pts.length >= 2) {
    const g = isMerc(pts[0].spatialReference) ? geodesicLine(pts, 48).geometry   // as it will be: the shortest way round
      : { type: "polyline", paths: [pts.map((c) => [c.x, c.y])], spatialReference: pts[0].spatialReference };
    if (profGraphics.draft && state.view.graphics.includes(profGraphics.draft)) profGraphics.draft.geometry = g; else profShow("draft", new Graphic({ geometry: g, symbol: { ...PROF_LINE, style: "short-dash" } }));
  } else profShow("draft", null);
  const dots = { type: "multipoint", points: state.profDraft.map((c) => [c.x, c.y]), spatialReference: state.profDraft[0].spatialReference };
  if (profGraphics.draftDots && state.view.graphics.includes(profGraphics.draftDots)) profGraphics.draftDots.geometry = dots; else profShow("draftDots", new Graphic({ geometry: dots, symbol: { ...PROF_VERTEX, size: 11 } }));
  syncDraftButtons();
}
export function syncDraftButtons() {
  const n = state.profDraft ? state.profDraft.length : 0;
  $("profFinish").hidden = n < 2; $("profUndo").hidden = n < 1;
}
function cancelDraft() { state.profDraft = null; drawDraft(); profMessage(profHint()); }
function finishProfileDraft() {
  if (!state.profDraft) return;
  const pts = state.profDraft; state.profDraft = null; drawDraft();
  if (pts.length < 2) { profMessage(profHint()); return; }
  if (!isMerc(pts[0].spatialReference)) { profileOf({ type: "polyline", paths: [pts.map((c) => [c.x, c.y])], spatialReference: pts[0].spatialReference }); return; }   // a map in another coordinate system: as drawn
  const g = geodesicLine(pts, 96); profileOf(g.geometry, g.ll);
}
onViews("double-click", (e) => {
  if (!profActive()) return; e.stopPropagation();
  if (state.profDraft) { finishProfileDraft(); return; }
  const h = profHandleAt(e.x, e.y, isTouch(e));   // a point of the line double-clicked: taken out, while the line keeps two
  if (h && h.attributes.kind === "vertex" && prof.via.length > 2) { const via = prof.via.filter((c, i) => i !== h.attributes.i); profileOf(geodesicPath(via, 96), via); }
});
// Dragging a handle moves that point of the line (a halfway handle becomes a new point); the map does not pan meanwhile.
// The handle is the one where the pointer went down: the drag's own start is reported a few pixels later, by when a
// finger that landed on the edge of a handle has left it.
let profDown = null;
onViews("pointer-down", (e) => { if (profActive()) profDown = { x: e.x, y: e.y }; });
onViews("drag", (e) => {
  if (!profActive() || state.profDraft || !prof || !prof.via) return;
  if (e.action === "start") {
    const o = profDown || e.origin || e, h = profHandleAt(o.x, o.y, isTouch(e)); if (!h) return;
    e.stopPropagation();
    let i = h.attributes.i;
    if (h.attributes.kind === "mid") { prof.via.splice(i + 1, 0, geoBetween(prof.via[i], prof.via[i + 1], 0.5)); i += 1; }
    profEdit = { i }; profMark(-1); setViewCursor("grabbing");
  }
  if (!profEdit) return;
  e.stopPropagation();
  const p = state.view.toMap({ x: e.x, y: e.y });
  if (p && isMerc(p.spatialReference)) {
    const ll = xyToLonLat(p.x, p.y), nb = prof.via[profEdit.i - 1] || prof.via[profEdit.i + 1];
    if (nb) ll[0] += Math.round((nb[0] - ll[0]) / 360) * 360;   // the short way from its neighbour
    prof.via[profEdit.i] = ll;
    if (profGraphics.line) profGraphics.line.geometry = geodesicPath(prof.via, 96);
    showProfHandles(prof.via);
  }
  if (e.action === "end") { const via = prof.via.map((c) => [c[0], c[1]]); profEdit = null; setViewCursor("grab"); profileOf(geodesicPath(via, 96), via); }
});
onViews("key-down", (e) => { if (!profActive() || !state.profDraft) return; if (e.key === "Enter") { e.stopPropagation(); finishProfileDraft(); } else if (e.key === "Escape") { e.stopPropagation(); cancelDraft(); } });
$("profFinish").addEventListener("click", () => finishProfileDraft());
$("profUndo").addEventListener("click", () => { if (!state.profDraft) return; state.profDraft.pop(); if (!state.profDraft.length) cancelDraft(); else drawDraft(); });

// The Measure tool opens a small menu above it: Measure, Elevation profile (as in MapMaker).
const menuItems = () => [...$("measureMenu").querySelectorAll('[role="menuitem"]')].filter((b) => !b.hidden);
function placeToolMenu() {
  const menu = $("measureMenu"), wrap = $("mapWrap").getBoundingClientRect(), btn = $("tool-measure").getBoundingClientRect(), tb = $("toolbar").getBoundingClientRect();
  const mw = menu.offsetWidth;
  menu.style.left = Math.max(8, Math.min(btn.left + btn.width / 2 - mw / 2 - wrap.left, wrap.width - mw - 8)) + "px";
  menu.style.bottom = Math.round(wrap.bottom - tb.top + 6) + "px";
}
function openToolMenu() {
  $("measureMenu").hidden = false; placeToolMenu();
  $("tool-measure").setAttribute("aria-expanded", "true");
  const items = menuItems(), cur = items.find((b) => b.classList.contains("active")) || items[0];
  if (cur) cur.focus();
}
export function closeToolMenu(focusButton) {
  if ($("measureMenu").hidden) return;
  $("measureMenu").hidden = true; $("tool-measure").setAttribute("aria-expanded", "false");
  if (focusButton) $("tool-measure").focus();
}
$("tool-measure").addEventListener("click", () => {
  const items = menuItems();
  if (items.length < 2) { togglePanel(items[0] === $("menuProfile") ? "profile" : "measure"); return; }
  if ($("measureMenu").hidden) openToolMenu(); else closeToolMenu(false);
});
$("menuMeasure").addEventListener("click", () => { closeToolMenu(false); leaveData(() => openPanel("measure")); });
$("menuProfile").addEventListener("click", () => { closeToolMenu(false); leaveData(() => openPanel("profile")); });
$("measureMenu").addEventListener("keydown", (e) => {
  const items = menuItems(), i = items.indexOf(document.activeElement);
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
  if (step) { e.preventDefault(); items[(i + step + items.length) % items.length].focus(); }
  else if (e.key === "Home" || e.key === "End") { e.preventDefault(); items[e.key === "Home" ? 0 : items.length - 1].focus(); }
  else if (e.key === "Tab") closeToolMenu(false);
});
document.addEventListener("pointerdown", (e) => { if (!$("measureMenu").hidden && !$("measureMenu").contains(e.target) && !$("tool-measure").contains(e.target)) closeToolMenu(false); });
window.addEventListener("resize", () => { if (!$("measureMenu").hidden) placeToolMenu(); });

