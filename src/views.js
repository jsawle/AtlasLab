// ============================================================ Map, views and widgets
// Makes the 2D view from the SDK's map component (the 3D view is made by view-mode.js when first needed), the starting
// map and the first sketch layer, and puts the app's controls on each view: search, home, zoom, the compass rose, the
// scale bar. Starts downloading the map named in the link early. Holds what the rest of the app uses to work with
// whichever view is on screen: activeMap, onViews, goToSafe, frameTarget.
import { SKETCH_LAYER_PREFIX } from "../lib/doc.js?v=5.0.0-beta.77";
import { state, late } from "./state.js?v=5.0.0-beta.77";
import { $, HEX32, reduceMotion, params, authStash, cfg, F, S, t } from "./config.js?v=5.0.0-beta.77";
import { upgradeIcons } from "./branding.js?v=5.0.0-beta.77";
import { EsriMap, WebMap, WebScene, GraphicsLayer, Basemap, intl, reactiveUtils } from "./sdk.js?v=5.0.0-beta.77";

export const graphicsLayer = new GraphicsLayer({ id: "__sketch", title: S.sketchLayer, elevationInfo: { mode: "on-the-ground" }, listMode: "hide" });
export const defaultBasemap = () => new Basemap({ portalItem: { id: cfg.defaultBasemap } });
// A link that opens a map or scene starts without the default basemap: that map brings its own, and the default one
// (its item, style and first tiles) would be downloaded only to be replaced (5.0.0-beta.9). It is put in if the open fails.
export const linkedScene = !authStash && F.threeD !== false && HEX32.test(params.get("webscene") || "") ? params.get("webscene") : null;
export const linkedMap = !authStash && !linkedScene && HEX32.test(params.get("webmap") || "") ? params.get("webmap") : null;
// Sketch layers. The first ("My sketches") always exists and is the one a first sketch goes on; it is listed in Map
// layers once it has a sketch. Further ones are made by the person (Add layer, or the Sketch panel), keep their own
// name, and are listed even when empty. One of them is the layer being drawn on (activeSketch).
export const sketchLayers = [graphicsLayer];
state.activeSketch = graphicsLayer;
state.pinnedSketch = [graphicsLayer];
export const isSketch = (l) => sketchLayers.includes(l);
export const sketchKeyOfLayer = (l) => (l === graphicsLayer ? "" : String(l.id).slice(SKETCH_LAYER_PREFIX.length));
export const sketchLayerByKey = (key) => (key ? sketchLayers.find((l) => l !== graphicsLayer && sketchKeyOfLayer(l) === key) : graphicsLayer) || null;
export const sketchCount = () => sketchLayers.reduce((n, l) => n + l.graphics.length, 0);
export const sketchListed = (l) => isSketch(l) && (l !== graphicsLayer || l.graphics.length > 0);
export const localMap = new EsriMap({ basemap: linkedScene || linkedMap ? null : defaultBasemap(), ground: "world-elevation", layers: [graphicsLayer] });
// The linked map starts downloading now, while the view and the rest of the app are still being set up.
let preloaded = null;
if (linkedScene || linkedMap) {
  const m = linkedScene ? new WebScene({ portalItem: { id: linkedScene } }) : new WebMap({ portalItem: { id: linkedMap } });
  preloaded = { id: linkedScene || linkedMap, map: m }; m.load().catch(() => {});
}
/**
 * The web map or scene fetched early for the map in the link, if it is the one asked for and loaded; otherwise a new
 * one for that item.
 * @param {string} itemId
 * @param {function} Type WebMap or WebScene
 * @returns {WebMap|WebScene}
 */
export function takePreloaded(itemId, Type) { const p = preloaded; preloaded = null; return p && p.id === itemId && p.map instanceof Type && p.map.loadStatus !== "failed" ? p.map : new Type({ portalItem: { id: itemId } }); }
export const startCenter = Array.isArray(cfg.startView.center) ? cfg.startView.center : [0, 20];
/**
 * The views are made by the SDK's map and scene components (arcgis-map, arcgis-scene), the supported way from SDK 5 on;
 * the rest of the app works with the MapView / SceneView each one holds (5.0.0-beta.9).
 * @param {string} tag "arcgis-map" or "arcgis-scene"
 * @param {string} hostId the id of the element it goes in
 * @param {object} props the component's settings
 * @returns {Promise<MapView|SceneView>} the view the component holds, once ready
 */
export async function componentView(tag, hostId, props) {
  const el = document.createElement(tag); el.className = "view-el";
  Object.assign(el, props);
  $(hostId).appendChild(el);
  await customElements.whenDefined(tag);
  await el.viewOnReady();
  viewEls.set(el.view, el);
  roundMeasurements(el);
  popupFits(el.view);
  return el.view;
}
// Pop-ups on small screens (5.0.0-beta.76). The SDK docks a pop-up once the view is 544 pixels wide or less (a phone held
// upright); a phone on its side is wide but short, so its pop-up floated above the feature and ran off the top of the map,
// title and all. It now docks there too. Whether a docked pop-up sits at the bottom is noted on the page (pop-docked-bottom)
// so the compass can stand aside for it on a phone (index.html).
function popupFits(v) {
  reactiveUtils.whenOnce(() => v.popup).then((p) => { p.dockOptions = { ...p.dockOptions, breakpoint: { width: 544, height: 544 } }; }).catch(() => {});
  reactiveUtils.watch(() => [v.popup && v.popup.visible, v.popup && v.popup.currentDockPosition], ([shown, pos]) => {
    if (state.view === v) $("app").classList.toggle("pop-docked-bottom", !!shown && /^bottom/.test(pos || ""));
  });
}
// Measurements with no decimal places (5.0.0-beta.8). The Sketch tools show lengths and areas to two decimal places
// ("1,199.31 km") in their tooltips and segment labels, and the SDK has no setting for that: its value options choose
// units only. Those texts are ordinary page text inside the view component, so they are rounded there, as they are
// written: "1,199 km". Coordinates and angles are left alone. sketchDecimals in a config gives another number of
// places, or null to leave the SDK's own.
const MEASURE_PLACES = cfg.sketchDecimals === null ? null : Number.isInteger(cfg.sketchDecimals) && cfg.sketchDecimals >= 0 && cfg.sketchDecimals <= 6 ? cfg.sketchDecimals : 0;
function roundMeasurements(el) {
  if (MEASURE_PLACES === null || !el.shadowRoot || typeof MutationObserver === "undefined") return;
  let locale; try { locale = intl.getLocale(); } catch (e) { locale = undefined; }
  let parts; try { parts = new Intl.NumberFormat(locale).formatToParts(12345.6); } catch (e) { locale = undefined; parts = new Intl.NumberFormat().formatToParts(12345.6); }
  const group = (parts.find((p) => p.type === "group") || {}).value || ",", decimal = (parts.find((p) => p.type === "decimal") || {}).value || ".";
  const esc = (c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const UNIT = "(?:km²|mi²|m²|ft²|yd²|km2|mi2|m2|ft2|ha|ac|km|nmi|mi|yd|ft|cm|mm|in|m)";
  const re = new RegExp("(\\d[\\d" + esc(group) + "\\u00a0\\u202f]*)" + esc(decimal) + "(\\d+)(\\s?" + UNIT + ")(?![\\w²])", "g");
  const out = new Intl.NumberFormat(locale, { maximumFractionDigits: MEASURE_PLACES, minimumFractionDigits: 0 });
  const fix = (node) => {
    const text = node.nodeValue; if (!text || text.length > 80 || !/\d/.test(text)) return;
    const next = text.replace(re, (m, whole, frac, unit) => { if (frac.length <= MEASURE_PLACES) return m; const n = Number(whole.replace(/\D/g, "") + "." + frac); return Number.isFinite(n) ? out.format(n) + unit : m; });
    if (next !== text) node.nodeValue = next;
  };
  const sweep = (root) => {
    if (root.nodeType === 3) { fix(root); return; }
    if (root.nodeType !== 1 && root.nodeType !== 11) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) fix(n);
  };
  new MutationObserver((list) => { for (const m of list) { if (m.type === "characterData") fix(m.target); else for (const n of m.addedNodes) sweep(n); } })
    .observe(el.shadowRoot, { subtree: true, childList: true, characterData: true });
}
// A view's map is set on its component, which owns the view: set on the view alone, the component can put its own back.
export const viewEls = new Map();
/**
 * Shows a map in a view (through its component), and sets that map's portal to the app's units, so the SDK's tools
 * measure in them.
 * @param {MapView|SceneView} v
 * @param {Map|WebMap|WebScene} m
 */
export function setViewMap(v, m) { const el = viewEls.get(v); if (el) el.map = m; if (v.map !== m) v.map = m; try { late.portalUnits(); } catch (e) { /* at start-up, before the units are worked out */ } }
/**
 * The zoom the app opens at (5.0.0-beta.41): the config's, or closer when that would leave the world narrower than the
 * map.
 * The map library does not repeat the world sideways when zoomed out, so at zoom 2 (a world 1,024 px wide) a wider map
 * had
 * white bands either side. A config's own closer zoom (example-es: 7) is kept.
 * @returns {number}
 */
export function startZoom() {
  const w = ($("viewDiv") && $("viewDiv").clientWidth) || window.innerWidth || 1024;
  const fill = Math.ceil(Math.log2(Math.max(256, w) / 256) - 1e-9);   // the world is 256 px wide at zoom 0, twice that at each zoom
  return Math.max(Number(cfg.startView.zoom) || 2, fill);
}
export const mapView = await componentView("arcgis-map", "viewDiv", { map: localMap, center: startCenter, zoom: startZoom() });
state.view = mapView;
export const viewHandlers = [];
/**
 * Listens for a view event on the 2D view and on the 3D view, including a 3D view made later.
 * @param {string} evt an SDK view event, e.g. "click"
 * @param {function} fn the handler
 */
export function onViews(evt, fn) { viewHandlers.push([evt, fn]); mapView.on(evt, fn); if (state.sceneView) state.sceneView.on(evt, fn); }
/**
 * The map shown in the view on screen.
 * @returns {Map}
 */
export function activeMap() { return state.view.map; }
export let startDone = null;
const started = new Promise((res) => { startDone = res; });   // the app has started, and a map opened from a link is in
// Bigger buttons for fingers (features.tabletLayout, Tablets 1.0, 5.0.0-beta.75; main app from 5.0.0-beta.76). On a device with a touch screen at
// least 641 pixels wide the map library's own buttons (Search, Home, Zoom, the 3D navigation toggle, the Sketch tools)
// are made 44 pixels, from 32, with the components' visualScale "l" (SDK 5.0; the Sketch tools in sketch.js, as far as
// they fit); the app's own are made bigger in
// index.html, and its Calcite controls by growControls. Phones come later. Versions: Tablets 1.0.
const TOUCH_WIDE = (() => { try { return matchMedia("(any-pointer: coarse) and (min-width: 641px)"); } catch (e) { return null; } })();
/** Whether controls are drawn big, for fingers, now. @returns {boolean} */
export const bigTargets = () => !!(F.tabletLayout && TOUCH_WIDE && TOUCH_WIDE.matches);
const SCALED = "arcgis-zoom, arcgis-home, arcgis-expand, arcgis-search, arcgis-navigation-toggle";   // the Sketch tools: sketch.js (as far as they fit)
/** Sets the map library's controls on the page to the size for the device (big for fingers on a tablet). */
export function scaleControls() {
  if (!F.tabletLayout) return;
  const s = bigTargets() ? "l" : "m";
  document.querySelectorAll(SCALED).forEach((c) => { c.setAttribute("visual-scale", s); c.visualScale = s; });
}
/**
 * Makes the app's Calcite controls inside an element big for fingers on a tablet (scale "l", 44 pixels).
 * @param {HTMLElement} root
 */
export function growControls(root) {
  if (!bigTargets() || !root) return;
  root.querySelectorAll("calcite-button, calcite-select, calcite-combobox, calcite-input-number, calcite-input-text").forEach((c) => c.setAttribute("scale", "l"));
}
if (TOUCH_WIDE && F.tabletLayout) TOUCH_WIDE.addEventListener("change", scaleControls);
/**
 * Puts the app's controls on a view: search, home, zoom, the compass rose, scale bar and the corner buttons, as SDK
 * components in the view's slots.
 * @param {MapView|SceneView} v
 * @param {boolean} is3d
 */
export function addViewUI(v, is3d) {
  // The controls on the view are SDK components placed in the map / scene component's slots (5.0.0-beta.2; they were
  // widgets added to view.ui, which SDK 6 removes). The 3D compass is left out: the rose replaces it.
  const el = viewEls.get(v);
  const slot = (tag, where, attrs) => { const c = document.createElement(tag); c.slot = where; for (const k in (attrs || {})) c.setAttribute(k, attrs[k]); el.appendChild(c); return c; };
  if (F.search !== false) { const ex = slot("arcgis-expand", "top-left", { "expand-icon": "search", "expand-tooltip": S.search, group: "top-left" }); ex.appendChild(document.createElement("arcgis-search")); }
  // Home remembers where the view was when it was made, so it is made once the view is somewhere: a map opened from
  // a link starts with no basemap, and nowhere yet (Home made then threw an error inside the SDK).
  v.when(() => { const s = v.container && v.container.querySelector(".esri-view-surface"); if (s) s.setAttribute("aria-label", S.mapKeys); }).catch(() => {});      // what the keys do, for a screen reader (5.0.0-beta.57)
  const zoom = slot("arcgis-zoom", "top-left");
  const home = document.createElement("arcgis-home"); home.slot = "top-left";
  started.then(() => reactiveUtils.whenOnce(() => v.ready && !!v.viewpoint && !!v.viewpoint.targetGeometry)).then(() => { el.insertBefore(home, zoom); scaleControls(); }).catch(() => {});
  if (is3d) slot("arcgis-navigation-toggle", "top-left");
  const stack = document.createElement("div"); stack.className = "ll-stack";
  if (F.compass !== false) stack.appendChild(makeCompass(v, is3d));
  if (!is3d && cfg.scalebar !== "none") {
    const sb = document.createElement("arcgis-scale-bar"); sb.unit = ["dual", "metric", "imperial"].includes(cfg.scalebar) ? cfg.scalebar : "dual";
    sb.referenceElement = el; stack.appendChild(sb);
  }
  // While Elevation profile is docked under the map the toolbar is tucked away; this button brings it back.
  const tt = document.createElement("button"); tt.type = "button"; tt.className = "tools-toggle"; tt.setAttribute("aria-controls", "toolbar");
  tt.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><circle cx="5" cy="5" r="2"/><circle cx="12" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="12" cy="19" r="2"/><circle cx="19" cy="19" r="2"/></svg>';
  // features.hideToolbar (5.0.0-beta.46; on by default): the button is always there, with the word "Tools", so the row of tools can be
  // hidden at any time to give the map the whole screen. Hidden, the toolbar stays hidden until the button is used again.
  // 5.0.0-beta.49 (Hide the toolbar 1.1): one button for both views, at the bottom right beside the version, and its words say
  // what pressing it will do: "Hide tools" or "Show tools".
  if (F.hideToolbar) { $("app").classList.add("tools-always"); tt.classList.add("labelled"); tt.id = "toolsBtn"; const w = document.createElement("span"); tt.appendChild(w); }
  tt.addEventListener("click", () => { const app = $("app"); if (F.hideToolbar && !app.classList.contains("docked")) app.classList.toggle("tools-off"); else app.classList.toggle("tools-shown"); syncToolsToggles(); late.layoutBottom(); });
  if (!F.hideToolbar) stack.appendChild(tt);
  else if (!$("toolsBtn")) { const c = document.querySelector(".corner"); c.insertBefore(tt, c.firstChild); }
  stack.slot = "bottom-left"; el.appendChild(stack);
  scaleControls();
  // Map layers greys a layer outside its scale range: check again whenever this view stops moving
  reactiveUtils.watch(() => v.stationary, (st) => { if (st && v === state.view && !$("layersPanel").hidden) late.updateScaleStates(); });
  syncToolsToggles();
}
/**
 * Makes the Hide tools / Show tools buttons say and show what the toolbar is doing now.
 */
export function syncToolsToggles() {
  const app = $("app"), shown = app.classList.contains("docked") || !app.classList.contains("tools-always") ? app.classList.contains("tools-shown") : !app.classList.contains("tools-off");
  document.querySelectorAll(".tools-toggle").forEach((b) => {
    const l = shown ? S.hideTools : S.showTools, w = b.querySelector("span");
    if (w) { w.textContent = shown ? S.toolsHideWord : S.toolsShowWord; b.removeAttribute("aria-expanded"); b.removeAttribute("aria-label"); b.title = l; return; }      // its own words name it; they change, so no pressed or expanded state as well
    b.setAttribute("aria-expanded", String(shown)); b.setAttribute("aria-label", l); b.title = l;
  });
}
// MapMaker's large compass rose: turns with the map; select it to face north again.
function makeCompass(v, is3d) {
  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs, parent) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; };
  // The rose is a picture with a button over it: its N, E, S, W letters are part of the picture, not the button's
  // name, which says which way the map is turned (WCAG 2.5.3 Label in Name; compass 1.1).
  const wrap = document.createElement("div"); wrap.className = "rose";
  const b = document.createElement("button");
  b.type = "button"; b.className = "rose-btn"; b.title = S.compassReset;
  const svg = el("svg", { viewBox: "0 0 100 100", "aria-hidden": "true", focusable: "false" });
  el("circle", { class: "rose-face", cx: 50, cy: 50, r: 49 }, svg);
  const dial = el("g", { class: "rose-dial" }, svg);
  for (const [k, x, y] of [["compassN", 50, 15], ["compassE", 85, 50], ["compassS", 50, 85], ["compassW", 15, 50]]) el("text", { x, y }, dial).textContent = S[k];
  el("path", { class: "needle-n", d: "M50 31 56.5 50h-13z" }, dial);
  el("path", { class: "needle-s", d: "M43.5 50h13L50 69z" }, dial);
  wrap.append(svg, b);
  let last = null;
  const angle = () => (is3d ? -((v.camera && v.camera.heading) || 0) : (v.rotation || 0));
  const update = () => {
    const a = Math.round(angle() * 10) / 10;
    if (a === last) return;
    last = a;
    dial.setAttribute("transform", "rotate(" + a + " 50 50)");
    const deg = ((Math.round(-a) % 360) + 360) % 360;
    b.setAttribute("aria-label", deg === 0 ? S.compassNorth : t("compassTurned", { deg }));
  };
  reactiveUtils.watch(() => (is3d ? v.camera && v.camera.heading : v.rotation), update, { initial: true });
  b.addEventListener("click", () => { v.goTo(is3d ? { heading: 0 } : { rotation: 0 }, { animate: !reduceMotion }).catch(() => {}); });
  return wrap;
}
addViewUI(mapView, false);
upgradeIcons();
// Where to look to see new data. In 2D, its extent. In 3D a view from straight above hides height (columns, terrain),
// so a view that isn't tilted yet is tilted to 55°; a tilt the user has already set is kept.
const FRAME_TILT = 55;
/**
 * What to go to so an extent fills the view: in 3D, looking at it from a tilt when the camera is nearly flat; otherwise
 * the extent as it is.
 * @param {Extent} extent
 * @returns {Extent|object} a goTo target
 */
export function frameTarget(extent) {
  if (state.mode !== "3d" || !state.view.camera) return extent;
  return state.view.camera.tilt < 20 ? { target: extent, tilt: FRAME_TILT, heading: state.view.camera.heading } : extent;
}
/**
 * Moves the view on screen to a target, after any 3D tilt in progress has ended and the view is ready. Retries up to
 * three times if the view is between maps; a move cut short by another move is not an error.
 * @param {object} target anything view.goTo takes
 * @param {object} opts goTo options; animation is off for people who ask for less motion
 * @returns {Promise<void>}
 */
export function goToSafe(target, opts) {
  const o = { animate: !reduceMotion, ...(opts || {}) };
  let tries = 0;
  const attempt = () => state.view.goTo(target, o).catch((e) => {
    if (e && e.name === "AbortError") return;
    if (++tries < 4) return new Promise((res) => setTimeout(res, 350)).then(attempt);
  });
  // viewSettled: a move asked for while 3D is still tilting into place waits for that to end, so the two can't mix
  return state.viewSettled.then(() => reactiveUtils.whenOnce(() => state.view.ready)).then(attempt);   // not view.when(): the SDK warns when a view is between maps
}
state.viewSettled = Promise.resolve();

