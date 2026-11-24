// ============================================================ Measure, units and coordinates
// The Measure tool's menu: distance, area and the coordinates of a place, with the SDK's measurement and coordinate
// components, and what Measure keeps when the view switches between 2D and 3D (lab: features.keepMeasure). And the units the app shows lengths in (kilometres or miles): worked out at start (lib/units.js), changed
// with the units switch, and followed by the Sketch tools and the Elevation profile too.
import "./legend-basemaps.js?v=5.0.0-beta.77";   // first: keeps the files running in the order they were written in (see app.js)
import { resolveUnits, wholeNumberText, metresOf, lengthText } from "../lib/units.js?v=5.0.0-beta.77";
import { pathIn3d, distinctPoints, halfwayAlong } from "../lib/threed.js?v=5.0.0-beta.77";
import { state, late } from "./state.js?v=5.0.0-beta.77";
import { $, params, cfg, F, S } from "./config.js?v=5.0.0-beta.77";
import { Portal, reactiveUtils, toolEl, dropEl, Graphic, intl } from "./sdk.js?v=5.0.0-beta.77";
import { mapView } from "./views.js?v=5.0.0-beta.77";
import { openPanel, togglePanel } from "./ui.js?v=5.0.0-beta.77";
import { updatePopupEnabled, handWords, onHandChange } from "./popups.js?v=5.0.0-beta.77";
import { sketch } from "./sketch.js?v=5.0.0-beta.77";
import { leaveData } from "./csv-import.js?v=5.0.0-beta.77";
import { profileUnitsChanged } from "./profile.js?v=5.0.0-beta.77";
late.portalUnits = portalUnits;   // for the start-up files, which run before this one (see late in state.js)

export let coordWidget = null;
// tooltips and side labels. Where they start is worked out in lib/units.js; the km / mi switch changes them.
const UNITS_KEY = "atlas.units";
const unitsFound = (() => {
  let stored = null, timeZone, languages = [];
  if (cfg.unitsSwitch !== false) { try { stored = localStorage.getItem(UNITS_KEY); } catch (e) { /* no storage */ } }
  try { timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { /* not known */ }
  try { languages = navigator.languages && navigator.languages.length ? [...navigator.languages] : [navigator.language]; } catch (e) { /* not known */ }
  return resolveUnits({ param: (params.get("units") || "").toLowerCase(), stored, config: cfg.units, timeZone, languages });
})();
export let units = unitsFound.units;   // read by the Elevation profile (profile.js); set only here
// Sketch's side labels have no units setting of their own: the SDK takes them from the portal's units (its
// documentation for SketchLabelOptions), of the map's item where there is one and of the default portal otherwise.
function portalUnits() {
  const pu = units === "imperial" ? "english" : "metric";
  try { Portal.getDefault().units = pu; } catch (e) { /* no default portal */ }
  for (const v of [mapView, state.sceneView]) { try { const it = v && v.map && v.map.portalItem; if (it && it.portal) it.portal.units = pu; } catch (e) { /* no item */ } }
}
/**
 * Sets the units the Sketch tools show lengths and areas in to the app's units (km or miles).
 */
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
  fixedText();
  sketchUnits(); syncUnitsSwitches();
  profileUnitsChanged();
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
  clearFixed();
}
/**
 * Makes the measuring component for a kind of measurement in the view on screen and starts a measurement, or, given a
 * shape, shows that shape measured (a measurement carried from the other view), which can still be changed.
 * @param {string} kind "distance" or "area"
 * @param {object} [shape] a polygon or polyline (as JSON), or for the 3D distance tool { startPoint, endPoint }
 */
async function startMeasure(kind, shape) {
  clearMeasure(); const seq = measureSeq;
  let el; try { el = await toolEl(MEASURE_TAGS[state.mode][kind], $("measureBody"), { view: state.view, unit: units, hideUnitSelect: true }); } catch (e) { if (seq === measureSeq) stopMeasuring(); return; }
  if (seq !== measureSeq) { dropEl(el); return; }   // another tool was chosen, or measuring stopped, meanwhile
  measureEl = el; wholeNumbers(el);
  if (shape) {
    try { if (shape.startPoint) Object.assign(el.analysis, shape); else el.analysis.geometry = shape; } catch (e) { console.warn("The measurement didn't carry across", e); }
    if (el.analysis && el.analysis.valid) return;
  }
  try { await el.start(); } catch (e) { /* stopped before the first click */ }
}
// Whole numbers in the Measure panel (5.0.0-beta.47, lib/units.js). Esri's component shows two decimal places and has no
// setting for it, so its figures are rounded as it writes them. The figure it draws on the map itself is part of the
// map picture, out of the app's reach: that one keeps its decimals.
function wholeNumbers(el) {
  const roots = [], seen = new WeakSet();
  const scan = (root) => {
    root.querySelectorAll("output").forEach((o) => o.childNodes.forEach((c) => { if (c.nodeType === 3) { const r = wholeNumberText(c.nodeValue); if (r !== c.nodeValue) c.nodeValue = r; } }));
    root.querySelectorAll("*").forEach((n) => { if (n.shadowRoot && !seen.has(n.shadowRoot)) watch(n.shadowRoot); });
  };
  const obs = new MutationObserver(() => roots.forEach(scan));
  const watch = (root) => { seen.add(root); roots.push(root); obs.observe(root, { subtree: true, childList: true, characterData: true }); scan(root); };
  if (el.shadowRoot) watch(el.shadowRoot);
}
// Measurements across 2D and 3D (lab: features.keepMeasure, 2D to 3D 1.7, 5.0.0-beta.77). Switching views no longer ends
// Measure: the tool chosen stays chosen, and a finished measurement is measured again in the other view by the SDK's
// component for that view, so it can still be changed there. An area is the same shape in both views, and so is a
// distance between two points (the 3D tool's straight line). The 3D distance tool measures from one point to another
// only, so a 2D path with bends can't be one: in 3D it is drawn on the ground in the colours of Esri's measuring tools,
// labelled halfway along with the length 2D gave it, and is changed back in 2D, where it is the same path again (lib/threed.js).
// A measurement half drawn when the view switches is left behind; the same tool starts afresh in the other view.
let fixed = null;   // the bent 2D path drawn in 3D: { shape, metres, view, line, label, box }
const KINDS = { mDist: "distance", mArea: "area", mCoord: "coords" };
const chosenKind = () => { const b = Object.keys(KINDS).find((id) => $(id).getAttribute("aria-pressed") === "true"); return b ? KINDS[b] : null; };
// the finished shape on a measuring component, flat (heights belong to the 3D view): its first path or ring, as JSON
function shapeOf(el) {
  const a = el && el.analysis;
  if (!a || !a.valid || el.state !== "measured") return null;
  if (a.type === "direct-line-measurement") return { type: "polyline", paths: [[[a.startPoint.x, a.startPoint.y], [a.endPoint.x, a.endPoint.y]]], spatialReference: a.startPoint.spatialReference.toJSON() };
  const g = a.geometry, part = g && (g.type === "polygon" ? g.rings[0] : g.paths[0]);
  if (!part || !part.length) return null;
  const flat = part.map((p) => [p[0], p[1]]), sr = g.spatialReference.toJSON();
  return g.type === "polygon" ? { type: "polygon", rings: [flat], spatialReference: sr } : { type: "polyline", paths: [flat], spatialReference: sr };
}
// the length the 2D tool measured, in metres (NaN if not known)
async function measuredMetres(el) {
  try { const av = await state.view.whenAnalysisView(el.analysis); return metresOf(av && av.result && av.result.length); } catch (e) { return NaN; }
}
/**
 * At a switch between 2D and 3D, before it: takes what Measure has on off this view, to be put back in the other by
 * putMeasure. Without features.keepMeasure, or with no tool chosen, Measure stops, as before.
 * @returns {Promise<object|null>} { kind: "distance", "area" or "coords", shape, metres }; null when Measure stopped
 */
export async function takeMeasure() {
  const kind = F.keepMeasure ? chosenKind() : null;
  if (!kind) { stopMeasuring(); return null; }
  let c = { kind, shape: null, metres: NaN };
  if (fixed) c = { kind, shape: fixed.shape, metres: fixed.metres };
  else if (kind !== "coords") {
    c.shape = shapeOf(measureEl);
    if (c.shape && c.shape.type === "polyline" && state.mode === "2d") c.metres = await measuredMetres(measureEl);
  }
  clearMeasure();
  return c;
}
/**
 * After a switch between 2D and 3D: puts back in the view now on screen what takeMeasure took. The Coordinates tool
 * follows the view by itself.
 * @param {object|null} c what takeMeasure returned
 */
export function putMeasure(c) {
  if (!c || c.kind === "coords") return;
  const s = c.shape;
  if (!s || c.kind === "area" || state.mode === "2d") { startMeasure(c.kind, s); return; }
  const path = distinctPoints(s.paths[0]), how = pathIn3d(path);
  if (how === "line") { const pt = (p) => ({ type: "point", x: p[0], y: p[1], spatialReference: s.spatialReference }); startMeasure("distance", { startPoint: pt(path[0]), endPoint: pt(path[1]) }); }
  else if (how === "fixed") showFixed(c);
  else startMeasure("distance");
}
// The bent path in 3D: Esri's 2D measuring line (its accent colour under white dashes) laid on the ground, and a label
// like the 3D tools' (white on dark grey), sitting just above the middle of the path so it doesn't hide it, on a short
// stalk once the camera tilts (the stalk is upright in the world, so it can't be seen looking straight down). The panel
// says what it is and how to change it.
const fixedLabel = (text) => ({ type: "point-3d", verticalOffset: { screenLength: 24 }, callout: { type: "line", size: 1, color: [41, 41, 41, 0.9] },
  symbolLayers: [{ type: "text", text, size: 10.5, verticalAlignment: "bottom", material: { color: [255, 255, 255, 1] }, background: { color: [41, 41, 41, 0.85] } }] });
function showFixed(c) {
  clearMeasure();
  const v = state.view, th = v.effectiveTheme, accent = th && th.accentColor ? th.accentColor.toArray() : [255, 127, 0, 1];
  const line = new Graphic({ geometry: c.shape, symbol: { type: "line-3d", symbolLayers: [
    { type: "line", size: 3.75, cap: "butt", join: "round", material: { color: accent } },
    { type: "line", size: 2.6, cap: "butt", join: "round", material: { color: [255, 255, 255, 1] }, pattern: { type: "style", style: "dash" } }] } });
  const mid = halfwayAlong(c.shape.paths[0]);
  const label = new Graphic({ geometry: { type: "point", x: mid[0], y: mid[1], spatialReference: c.shape.spatialReference }, symbol: fixedLabel("") });
  v.graphics.addMany([line, label]);
  const box = document.createElement("div"), row = document.createElement("div"), name = document.createElement("span"), out = document.createElement("output"), note = document.createElement("p");
  box.className = "measure-fixed"; row.className = "mf-row"; note.className = "hint";
  name.textContent = S.distance; note.textContent = S.measureFixed;
  row.append(name, out); box.append(row, note); $("measureBody").appendChild(box);
  fixed = { shape: c.shape, metres: c.metres, view: v, line, label, box };
  fixedText();
}
function fixedText() {
  if (!fixed) return;
  const t = lengthText(fixed.metres, units, intl.getLocale());
  fixed.label.symbol = fixedLabel(t); fixed.label.visible = !!t;
  fixed.box.querySelector("output").textContent = t || "–";
}
function clearFixed() {
  if (!fixed) return;
  try { fixed.view.graphics.removeMany([fixed.line, fixed.label]); } catch (e) { /* view gone */ }
  fixed.box.remove(); fixed = null;
}
function measurePressed(id) { ["mDist", "mArea", "mCoord"].forEach((b) => $(b).setAttribute("aria-pressed", String(b === id))); }
/**
 * Ends any measuring: clears the measurement, lifts the Measure button, hides the coordinates and turns pop-ups back
 * on.
 */
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
/**
 * Closes the Measure tool's menu, if it is open.
 * @param {boolean} focusButton true puts the keyboard's focus back on the Measure button
 */
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
// "tap" or "click" in the panel's instructions, for the hand in use (5.0.0-beta.75)
const measureWords = () => { $("measureHint").textContent = handWords("measureHint"); };
onHandChange(measureWords); measureWords();
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
