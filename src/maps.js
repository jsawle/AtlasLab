// ============================================================ Maps and layers
// Opening a map: a web map or web scene from ArcGIS Online or from a file, or a new blank map. Opening one clears the
// work on screen (resetWorkspace), after asking about unsaved changes; a saved map then puts its own sketches,
// spreadsheets and added layers back. Between 2D and 3D, and between the two versions of a paired map, the sketch layers
// go across (setActiveMap). Also the order of the map's layers, the time slider, the toolbar badges, and adding or
// removing a layer from the collection.
import "./view-mode.js?v=5.0.0-beta.73";   // first: keeps the files running in the order they were written in (see app.js)
import { AUTHORING_APP, ITEM_LAYER_PREFIX, isOwnLayerJson, readWebMap, isSketchKey, TWO_D_ONLY_PROP, saved3dCamera, readWebScene } from "../lib/doc.js?v=5.0.0-beta.73";
import { pairOf, savedPair } from "../lib/pairs.js?v=5.0.0-beta.73";
import { state } from "./state.js?v=5.0.0-beta.73";
import { cfg, APP_VERSION, $, HEX32, F, S, t } from "./config.js?v=5.0.0-beta.73";
import { WebMap, WebScene, Camera, Basemap, Layer, restGet } from "./sdk.js?v=5.0.0-beta.73";
import { graphicsLayer, defaultBasemap, sketchLayers, isSketch, sketchLayerByKey, sketchCount, localMap, takePreloaded, startCenter, setViewMap,
  startZoom, mapView, activeMap, goToSafe } from "./views.js?v=5.0.0-beta.73";
import { dataLayers, portalLayers, unbindFile, markDirty, markClean, confirmDiscard, setTitle, titleFromFileName } from "./session.js?v=5.0.0-beta.73";
import { toast, openPanelName, closePanels, closeModal } from "./ui.js?v=5.0.0-beta.73";
import { addSketchGraphic, syncSketchLayerPicker, newSketchLayer, nextSketchLayerName, setActiveSketch, removeSketchLayer, updatePinned,
  setSelection, endSketchOps } from "./sketch.js?v=5.0.0-beta.73";
import { legend } from "./legend-basemaps.js?v=5.0.0-beta.73";
import { idleMap, sourceBms, partnerFor, usePair, isScene, has2dOnlyTag, syncViewLocks, setMode } from "./view-mode.js?v=5.0.0-beta.73";
import { addDataLayer } from "./data-layers.js?v=5.0.0-beta.73";
import { chartNoteWhenLoaded, chartNote, endLayerTools, renderLayers } from "./layers-panel.js?v=5.0.0-beta.73";
import { showBmList } from "./bookmarks.js?v=5.0.0-beta.73";
import { catalogLoaded, refreshCatalogButtons } from "./collection.js?v=5.0.0-beta.73";
import { previewLayer, removePreview } from "./csv-import.js?v=5.0.0-beta.73";

/**
 * Shows a map in the views, bringing the sketch layers along on top, and brings the toolbar badges, time slider and
 * 2D/3D locks up to date. A web scene is shown in 3D only.
 * @param {WebMap|WebScene|Map} m
 * @param {object} opts { keep2d: the 2D view keeps its map (a pair's web map), not3d: the 3D view is given nothing }
 */
export function setActiveMap(m, opts) {
  const old = state.view.map;
  endLayerTools(null);
  // the sketch layers go with the person from map to map, on top, in the order they were in
  const inOld = old && old !== m ? old.layers.toArray().filter(isSketch) : [];
  const carry = inOld.concat(sketchLayers.filter((l) => !inOld.includes(l)));
  if (old && old !== m) carry.forEach((l) => { try { old.remove(l); } catch (e) { /* not there */ } });
  carry.forEach((l) => { if (!m.layers.includes(l)) m.add(l); });
  state.pinnedSketch = m.layers.toArray().filter(isSketch);
  // a web scene is shown by the 3D view only; the 2D view goes back to the plain starting map meanwhile
  state.sceneOnly = isScene(m); state.twoDOnly = false;
  // One of a pair (see switchToPartner): the 2D view keeps the web map while its scene is on screen, and the 3D view is
  // given nothing to prepare while the web map is. Handing the same basemap from one view to the other and back made
  // the SDK's drawing worker answer a layer view that had gone (an error in the console).
  setViewMap(mapView, state.sceneOnly ? (opts && opts.keep2d ? mapView.map : localMap) : m);
  if (state.sceneView) setViewMap(state.sceneView, opts && opts.not3d ? idleMap : m);
  syncViewLocks();
  updateToolBadges();
  syncTimeBar();
}
// ---- Time (time-aware maps)
// A map saved with time settings (web map: widgets.timeSlider) gets a time control above the toolbar, as in MapMaker:
// play, step, and a slider across the map's time span. It is the SDK's Time Bar component (5.2; it replaces the Time
// Slider), which reads the map's own settings and sets the view's time. Other maps don't show it.
export let timeBar = null;
const timeSettings = (m) => (m && m.widgets && m.widgets.timeSlider) || null;
function syncTimeBar() {
  const host = $("timeHost"); if (!host) return;
  const on = F.time !== false && !!timeSettings(state.view && state.view.map);
  if (timeBar) { try { timeBar.stop(); } catch (e) { /* not playing */ } timeBar.remove(); timeBar = null; }
  for (const v of [mapView, state.sceneView]) { if (v && !on) v.timeExtent = null; }   // the last map's time filter doesn't carry over
  host.hidden = !on; $("app").classList.toggle("has-time", on);
  if (!on) return;
  // Time 2.0 (5.0.0-beta.56). People found the slider hard to use with two handles to pull apart, so it has one: the date
  // the map is showing, with everything up to that date on the map (the Time Bar's "cumulative from start"). Whatever the
  // map's author saved (often a window between two dates), it is shown this way; the span, the steps and the speed are
  // the author's. The settings button, which offers the other ways, is left out. A config can have the map's own way and
  // the settings back: "timeMode": "map".
  const single = cfg.timeMode !== "map";
  timeBar = document.createElement("arcgis-time-bar");
  for (const a of ["show-play", "show-previous", "show-next", "show-time-extent"].concat(single ? [] : ["show-settings"])) timeBar.setAttribute(a, "");
  timeBar.setAttribute("label", S.timeTool);
  // the slider takes the place of the bar's date label (its "time-extent" slot) and shows the dates itself
  const slider = document.createElement("arcgis-time-bar-slider"); slider.slot = "time-extent";
  for (const a of ["show-ticks", "show-min", "show-max"]) slider.setAttribute(a, "");
  if (single) slider.setAttribute("popover-display", "always");      // the date is written above the handle, always
  timeBar.appendChild(slider);
  host.appendChild(timeBar);
  timeBar.view = state.view;
  if (single) {      // the bar reads the map's settings a moment after it is made, and they bring their own mode: put ours back each time
    const bar = timeBar, one = () => { if (bar === timeBar && bar.mode !== "cumulative-from-start") bar.mode = "cumulative-from-start"; };
    bar.addEventListener("arcgisPropertyChange", one);
    Promise.resolve(bar.componentOnReady && bar.componentOnReady()).then(one).catch(() => {});
  }
}
/**
 * The time settings to save: the map's own, with where the slider is now.
 * @returns {object|null} the web map's timeSlider settings, or null when the map has no time
 */
export function timeWidgetsJson() {
  const ts = timeSettings(state.view && state.view.map);
  if (!ts) return null;
  let props = {};
  try { props = { ...((typeof ts.toJSON === "function" ? ts.toJSON() : ts).properties || {}) }; } catch (e) { props = {}; }
  if (state.currentSource && state.currentSource.data && state.currentSource.data.widgets) props = { ...state.currentSource.data.widgets.timeSlider.properties, ...props };
  const te = timeBar && timeBar.timeExtent;
  // With one handle the start is open. A map its author saved with two handles gets the start of its span there, so it
  // still opens as its author made it in Map Viewer.
  const full = timeBar && timeBar.fullTimeExtent, start = te && (te.start || (props.thumbCount === 2 && full && full.start) || null);
  if (te && (start || te.end)) props.currentTimeExtent = [start ? start.getTime() : null, te.end ? te.end.getTime() : null];
  return { timeSlider: { properties: props } };
}
/**
 * Toolbar badges, as MapMaker shows them: the number of layers on Map layers, and a dot on Bookmarks when the map has
 * bookmarks. The count is the map's top-level layers as Map layers lists them (a group counts once, as in MapMaker:
 * 6 for "1777-1778 Revolutionary Battles", which has 4 layers and 2 groups); the sketch layer and a CSV preview don't
 * count.
 * The map on show, read from the views themselves so that watchers follow it: the 3D view's when it holds a web scene
 * (which the 2D view never shows), otherwise the 2D view's. (Before beta.3 the layer count and the basemap gallery
 * looked at the 2D view only, so in a scene the count stayed at 0.)
 * @returns {Map}
 */
export function shownMap() { return state.sceneView && isScene(state.sceneView.map) ? state.sceneView.map : mapView && mapView.map; }
/**
 * How many layers Map layers lists for the map on screen (top-level layers that are not hidden from the list).
 * @returns {number}
 */
export function listedLayerCount() {
  const m = shownMap();
  let n = 0;
  if (m) m.layers.forEach((l) => { if (l.listMode !== "hide" && l !== previewLayer) n++; });
  return n;
}
/**
 * Brings the toolbar badges up to date: the layer count on Map layers (also said to screen readers) and the dot on
 * Bookmarks.
 */
export function updateToolBadges() {
  const n = listedLayerCount(), b = $("layersBadge");
  b.textContent = n > 99 ? "99+" : String(n); b.hidden = !n;
  $("layersBadgeSr").textContent = n ? ", " + (n === 1 ? S.layersCountOne : t("layersCount", { n })) : "";
  const k = state.bookmarks.length;
  $("bookmarksDot").hidden = !k;
  $("bookmarksDotSr").textContent = k ? ", " + (k === 1 ? S.bookmarksCountOne : t("bookmarksCount", { n: k })) : "";
}
/**
 * Moves the pinned sketch layers back to the top of the map, after another layer was added.
 */
export function keepSketchOnTop() { const m = activeMap(); for (const l of state.pinnedSketch) { if (m.layers.includes(l)) { try { m.reorder(l, m.layers.length - 1); } catch (e) { /* ok */ } } } }
/**
 * Put the map's layers in a saved order (ids, bottom first). Layers the order doesn't name keep their places above.
 * @param {string[]} ids layer ids, bottom first
 */
export function applyLayerOrder(ids) {
  if (!Array.isArray(ids) || !ids.length) return;
  const m = activeMap(), named = ids.map((id) => m.layers.find((l) => l.id === id)).filter((l) => l && l !== previewLayer);
  [...new Set(named)].forEach((l, i) => { try { m.reorder(l, i); } catch (e) { /* ok */ } });
  updatePinned();
}
/**
 * Takes a layer off every map the app holds (the starting map, the 2D view's and the 3D view's).
 * @param {Layer} l
 */
export function removeFromMaps(l) { for (const m of new Set([localMap, mapView.map, state.sceneView && state.sceneView.map])) { if (m) { try { m.remove(l); } catch (e) { /* not there */ } } } }
/**
 * Clears the work on screen before another map opens: the Filter panel, data waiting in Add data, layer tools,
 * spreadsheet layers, layers added from the collection, every sketch (back to one empty sketch layer), bookmarks, and
 * the map and item it came from.
 */
export function resetWorkspace() {
  if (openPanelName === "filter") closePanels(false);
  state.addState = null; removePreview(false);
  endLayerTools(null);
  dataLayers.splice(0).forEach(removeFromMaps);
  [...portalLayers.values()].forEach(removeFromMaps); portalLayers.clear();
  endSketchOps(); setSelection([]);
  sketchLayers.slice(1).forEach(removeSketchLayer);   // back to the one sketch layer, empty
  graphicsLayer.removeAll(); graphicsLayer.visible = true; graphicsLayer.opacity = 1; graphicsLayer.title = S.sketchLayer;
  setActiveSketch(graphicsLayer); state.pinnedSketch = [graphicsLayer]; keepSketchOnTop();
  state.bookmarks = []; updateToolBadges();
  state.currentSource = null; state.currentAgolItem = null; usePair(null);
  if (!$("bookmarksPanel").hidden) showBmList();
  if (!$("layersPanel").hidden) renderLayers();
  if (catalogLoaded) refreshCatalogButtons();
}
/**
 * The map's own layers: the ones it came with, not the sketch, preview, spreadsheet or collection layers the app added.
 * @returns {Layer[]}
 */
export function sourceLayers() {
  const own = new Set([...sketchLayers, previewLayer, ...dataLayers, ...portalLayers.values()]);
  return activeMap().layers.toArray().filter((l) => !own.has(l));
}
/**
 * A saved basemap reference made into a basemap: "item:<id>" becomes the basemap of that item; anything else (an SDK
 * basemap name) is returned as it is.
 * @param {string} ref
 * @returns {Basemap|string}
 */
export function basemapFrom(ref) { return typeof ref === "string" && ref.startsWith("item:") ? new Basemap({ portalItem: { id: ref.slice(5) } }) : ref; }
/**
 * How a save refers to the map's basemap: "item:<id>" when it comes from an item, otherwise null.
 * @returns {string|null}
 */
export function basemapRef() { const b = activeMap().basemap; return b && b.portalItem && b.portalItem.id ? "item:" + b.portalItem.id : null; }

// This app's own layers (sketches, spreadsheets) come back editable; layers it added from the collection are
// recognised by their "__item_<id>" layer id so they can be removed again.
function applyParsedWebMap(parsed) {
  restoreSketchLayers(parsed.sketchLayers, parsed.sketchVisible, parsed.sketchOpacity);
  for (const gj of parsed.graphics) addSketchGraphic(gj);
  for (const def of parsed.layers) { try { addDataLayer(def, { silent: true }); } catch (e) { console.warn("Skipped a data layer", e); } }
  const ops = (state.currentSource && state.currentSource.data && state.currentSource.data.operationalLayers) || [];
  activeMap().layers.forEach((l) => {
    if (typeof l.id !== "string" || !l.id.startsWith(ITEM_LAYER_PREFIX)) return;
    const itemId = l.id.slice(ITEM_LAYER_PREFIX.length);
    if (!HEX32.test(itemId) || portalLayers.has(itemId)) return;
    l.__item = { itemId, type: "", title: l.title || "" };
    l.__opJson = ops.find((o) => o.id === l.id) || null;
    portalLayers.set(itemId, l);
  });
  if (state.currentSource && state.currentSource.data) state.currentSource.data = { ...state.currentSource.data, operationalLayers: ops.filter((o) => !String(o.id || "").startsWith(ITEM_LAYER_PREFIX)) };
  state.bookmarks = parsed.bookmarks; updateToolBadges();
  keepSketchOnTop();
  applyLayerOrder(parsed.order);
}
/**
 * The sketch layers a saved map or document says it has: the first one's settings, and each further layer made again.
 * @param {object[]} metas the further layers: { key, title, visible, opacity }
 * @param {boolean} firstVisible whether the first sketch layer is shown
 * @param {number} firstOpacity the first sketch layer's opacity, 0 to 1
 */
export function restoreSketchLayers(metas, firstVisible, firstOpacity) {
  graphicsLayer.visible = firstVisible !== false;
  graphicsLayer.opacity = typeof firstOpacity === "number" ? firstOpacity : 1;
  for (const m of Array.isArray(metas) ? metas : []) {
    if (!m) continue;
    const l = m.key === "" ? graphicsLayer : (isSketchKey(m.key) ? (sketchLayerByKey(m.key) || newSketchLayer(m.title || nextSketchLayerName(), m.key)) : null);
    if (!l) continue;
    if (m.title) l.title = m.title;
    l.visible = m.visible !== false; l.opacity = typeof m.opacity === "number" ? m.opacity : 1;
  }
  syncSketchLayerPicker();
}
/**
 * The item's details and its map JSON, as the SDK fetched them when it loaded the map. (Before 5.0.0-beta.9 the app
 * asked ArcGIS Online for both itself as well, so each was downloaded twice.) If the SDK doesn't hand them over, they
 * are fetched.
 * @param {WebMap|WebScene} m the loaded map
 * @param {string} itemId
 * @returns {Promise<{item: object, data: object}>}
 */
export async function loadedItemJson(m, itemId) {
  const copy = (o) => (o && typeof o === "object" ? JSON.parse(JSON.stringify(o)) : null);
  const item = copy(m.portalItem && m.portalItem.sourceJSON), data = copy(m.resourceInfo);
  if (item && item.id === itemId && data && Array.isArray(data.operationalLayers)) return { item, data };
  const [i, d] = await Promise.all([restGet(`/sharing/rest/content/items/${itemId}`), restGet(`/sharing/rest/content/items/${itemId}/data`)]);
  return { item: i, data: d };
}
/**
 * Opens a web map from ArcGIS Online in place of the map on screen, after asking about unsaved changes: clears the work
 * on screen (resetWorkspace) and closes the tools that worked on the old map, goes to the place the map was saved
 * looking at, and switches to 2D when the map must be seen there (after a web scene, or when its author switched 3D off
 * or made a 3D version of its own).
 * @param {string} itemId 32 hexadecimal characters
 * @param {object} opts { keepWorkspace: keep the work on screen (a saved map's own layers come next), skipConfirm,
 *   quiet: no "Opening…" message, title: for that message, pair: the pair it belongs to }
 * @returns {Promise<boolean>} whether it opened
 */
export async function openWebMapItem(itemId, opts) {
  opts = opts || {};
  if (!HEX32.test(itemId || "")) return false;
  if (!opts.keepWorkspace && !opts.skipConfirm && !confirmDiscard()) return false;
  closeModal("openModal");
  if (!opts.quiet) toast(t("openingMap", { title: opts.title || "" }));
  try {
    const wm = takePreloaded(itemId, WebMap);
    await wm.load();
    const { item, data } = await loadedItemJson(wm, itemId);
    const parsed = readWebMap(data, { trusted: true });
    if (!parsed.ok) throw new Error("Not a web map");
    if (!opts.keepWorkspace) {
      resetWorkspace();
      // tools that work on the map on screen end with it (5.0.0-beta.69): Measure stayed on, measuring the new map
      // and Add data / Change style (5.0.0-beta.70): their file or layer went with the old map, so the panel was left open with nothing in it
      if (["measure", "profile", "filter", "data"].includes(openPanelName)) closePanels(false);
    }
    for (const op of (data.operationalLayers || []).filter(isOwnLayerJson)) { const l = wm.layers.find((x) => x.id === op.id); if (l) wm.remove(l); }
    const wasScene = state.sceneOnly;
    setActiveMap(wm);
    state.twoDOnly = has2dOnlyTag(item); usePair(opts.pair || pairOf(item, data));
    if (state.mode === "3d" && (state.twoDOnly || wasScene || partnerFor("3d"))) await setMode("2d");   // a web map opens in 2D after a scene, when it has a 3D version of its own, and always when its author switched 3D off
    // A map that isn't public, opened while signed in, can hold layers only that account can see. Its layers are never written to a file.
    state.currentSource = { itemId, title: item.title, item, data: parsed.webmap, restricted: !!state.portalUser && !!item.access && item.access !== "public" };
    if (state.portalUser && item.owner === state.portalUser.username) state.currentAgolItem = { id: itemId, owner: item.owner, title: item.title };
    if (!opts.keepWorkspace) {
      applyParsedWebMap(parsed);
      state.bookmarks.forEach((b) => sourceBms.add(b));
      setTitle(item.title); markClean(); unbindFile();
      const vp = wm.initialViewProperties && wm.initialViewProperties.viewpoint;
      if (vp) goToSafe(vp, { animate: false });
      const say = () => toast(t("openedMap", { title: item.title }) + chartNote(), chartNote() ? 8000 : undefined);
      if (!opts.quiet) { say(); chartNoteWhenLoaded(activeMap(), say); }
    }
    if (!$("bookmarksPanel").hidden) showBmList();
    if (!$("layersPanel").hidden) renderLayers();
    if (catalogLoaded) refreshCatalogButtons();
    if (legend) legend.view = state.view;
    return true;
  } catch (e) {
    console.error("Open map failed", e);
    if (!opts.quiet) toast(S.openFailed, 5000);
    return false;
  }
}
// A web scene from the collection or a link (webscene=<id>). It opens in 3D and stays there: see sceneOnly.
// Its slides become the bookmarks, each with its camera and the layers it shows.
// A slide lists the layers it shows (visibleLayers); every other layer of the scene is off in that slide. The record
// covers the scene's own layers, those inside group layers too, so the sketch layer and anything added later are left as
// they are. A slide with no list (null) changes no layers.
function slideLayers(ws, sl) {
  if (!sl.visibleLayers) return [];
  const on = new Set(sl.visibleLayers.toArray().map((v) => v && v.id));
  return layersDeep(ws).filter((l) => !isSketch(l) && l !== previewLayer).map((l) => ({ id: l.id, title: l.title || "", visible: on.has(l.id) }));
}
/**
 * The map's data layers, with those inside group layers. Not map.allLayers: that has the basemap and the ground as
 * well.
 * @param {Map} m
 * @returns {Layer[]}
 */
export function layersDeep(m) {
  const out = [];
  const walk = (ls) => ls.forEach((l) => { out.push(l); if (l.type === "group" && l.layers) walk(l.layers); });
  walk(m.layers);
  return out;
}
/**
 * A web scene's slides as bookmarks: each slide's camera position, title and (https or data) thumbnail.
 * @param {WebScene} ws
 * @returns {object[]}
 */
export function slidesToBookmarks(ws) {
  const out = [];
  const slides = ws.presentation && ws.presentation.slides ? ws.presentation.slides.toArray() : [];
  for (const sl of slides) {
    const cam = sl.viewpoint && sl.viewpoint.camera; if (!cam || !cam.position) continue;
    const bm = { title: (sl.title && sl.title.text) || t("bookmarkDefault", { n: out.length + 1 }), viewpoint: { center: [cam.position.longitude, cam.position.latitude], zoom: 10 }, camera: cam.clone(), layers: slideLayers(ws, sl), thumb: null };
    const th = sl.thumbnail && sl.thumbnail.url; if (typeof th === "string" && /^(https:|data:image\/)/i.test(th)) bm.thumb = th;
    out.push(bm);
  }
  return out;
}
async function showScene(ws) {
  const prev = activeMap();
  if (prev && prev !== ws) sketchLayers.forEach((l) => { try { prev.remove(l); } catch (e) { /* not there */ } });
  state.twoDOnly = false;
  await setMode("3d", { map: ws, force: true, keepCamera: true });
  if (state.mode !== "3d") throw new Error("3D view not available");
  setActiveMap(ws);
  const vp = ws.initialViewProperties && ws.initialViewProperties.viewpoint;
  if (vp) goToSafe(vp, { animate: false });
}
/**
 * Opens a web scene from ArcGIS Online in place of the map on screen, in 3D, after asking about unsaved changes; its
 * slides become bookmarks.
 * @param {string} itemId 32 hexadecimal characters
 * @param {object} opts { keepWorkspace, skipConfirm, quiet, title, pair } as for openWebMapItem
 * @returns {Promise<boolean>} whether it opened
 */
export async function openWebSceneItem(itemId, opts) {
  opts = opts || {};
  if (!HEX32.test(itemId || "")) return false;
  if (F.threeD === false) { toast(S.no3d, 5000); return false; }
  if (!opts.skipConfirm && !confirmDiscard()) return false;
  closeModal("openModal");
  if (!opts.quiet) toast(t("openingMap", { title: opts.title || "" }));
  try {
    const ws = takePreloaded(itemId, WebScene);
    await ws.load();
    const { item, data } = await loadedItemJson(ws, itemId);
    if (item.type !== "Web Scene") throw new Error("Not a web scene");
    closePanels(false);
    resetWorkspace();
    await showScene(ws);
    state.currentSource = { itemId, title: item.title, item, data, scene: true, restricted: !!state.portalUser && !!item.access && item.access !== "public" };
    state.bookmarks = slidesToBookmarks(ws); updateToolBadges();
    state.bookmarks.forEach((b) => sourceBms.add(b));
    usePair(opts.pair || pairOf(item, data));
    setTitle(item.title); markClean(); unbindFile();
    const say = () => toast(t("openedMap", { title: item.title }) + chartNote(), chartNote() ? 8000 : undefined);
    if (!opts.quiet) { say(); chartNoteWhenLoaded(ws, say); }
    if (!$("bookmarksPanel").hidden) showBmList();
    if (!$("layersPanel").hidden) renderLayers();
    if (catalogLoaded) refreshCatalogButtons();
    if (legend) legend.view = state.view;
    return true;
  } catch (e) {
    console.error("Open scene failed", e);
    if (!opts.quiet) toast(S.openFailed, 5000);
    return false;
  }
}
/**
 * A web scene saved on this device (3.0). Every web address in it was checked by readWebScene.
 * @param {string} raw the file's text
 * @param {string} fileName
 * @returns {Promise<boolean>} whether it opened
 */
export async function openWebSceneFile(raw, fileName) {
  if (F.threeD === false) { toast(S.no3d, 5000); return false; }
  const parsed = readWebScene(raw);
  if (!parsed.ok) { toast(S[parsed.code] || S.cantRead, 5000); return false; }
  closeModal("openModal");
  closePanels(false);
  try {
    const ws = WebScene.fromJSON(parsed.webscene);
    if (!parsed.webscene.baseMap) ws.basemap = defaultBasemap();
    await ws.load();
    resetWorkspace();
    await showScene(ws);
    const title = titleFromFileName(fileName);
    state.currentSource = { itemId: null, title, item: null, data: parsed.webscene, scene: true };
    usePair(savedPair(raw));
    applyParsedWebMap(parsed);
    state.bookmarks = parsed.bookmarks.map((b) => ({ ...b, camera: Camera.fromJSON(b.camera) })); updateToolBadges();
    setTitle(title);
    if (parsed.camera) goToSafe(Camera.fromJSON(parsed.camera), { animate: false });
    if (!$("bookmarksPanel").hidden) showBmList();
    if (!$("layersPanel").hidden) renderLayers();
    if (catalogLoaded) refreshCatalogButtons();
    if (legend) legend.view = state.view;
    markClean();
    const n = sketchCount() + parsed.layers.reduce((x, l) => x + l.features.length, 0);
    toast(t("openedFile", { title: title || S.untitled, n }));
    if (parsed.skipped) setTimeout(() => toast(t("skippedOnOpen", { n: parsed.skipped }), 5000), 3500);
    return true;
  } catch (e) {
    console.error("Open scene file failed", e);
    toast(S.cantRead, 5000);
    return false;
  }
}
/**
 * A web map saved on this device (or any web map JSON). Every web address in it was checked by readWebMap.
 * @param {string} raw the file's text
 * @param {string} fileName
 * @returns {Promise<boolean>} whether it opened
 */
export async function openWebMapFile(raw, fileName) {
  const parsed = readWebMap(raw);
  if (!parsed.ok) { toast(S[parsed.code] || S.cantRead, 5000); return false; }
  closeModal("openModal");
  closePanels(false);
  try {
    const wm = WebMap.fromJSON(parsed.webmap);
    if (!parsed.webmap.baseMap) wm.basemap = defaultBasemap();
    await wm.load();
    resetWorkspace();
    setActiveMap(wm);
    const title = titleFromFileName(fileName);
    state.currentSource = { itemId: null, title, item: null, data: parsed.webmap };
    applyParsedWebMap(parsed);
    setTitle(title);
    await setMode("2d");   // a web map is a 2D document; switch to 3D again if you like
    state.twoDOnly = raw[TWO_D_ONLY_PROP] === true; usePair(savedPair(raw));
    const vp = wm.initialViewProperties && wm.initialViewProperties.viewpoint;
    if (vp) goToSafe(vp, { animate: false });
    const cam3d = !state.twoDOnly && !partnerFor("3d") && F.threeD !== false ? saved3dCamera(raw) : null;   // saved while in 3D: back to 3D, seen from the same place
    if (cam3d) { await setMode("3d", { keepCamera: true }); if (state.mode === "3d") goToSafe(Camera.fromJSON(cam3d), { animate: false }); }
    if (!$("bookmarksPanel").hidden) showBmList();
    if (!$("layersPanel").hidden) renderLayers();
    if (catalogLoaded) refreshCatalogButtons();
    if (legend) legend.view = state.view;
    markClean();
    const n = sketchCount() + parsed.layers.reduce((x, l) => x + l.features.length, 0);
    toast(t("openedFile", { title: title || S.untitled, n }));
    if (parsed.skipped) setTimeout(() => toast(t("skippedOnOpen", { n: parsed.skipped }), 5000), 3500);
    const by = parsed.webmap.authoringApp, ver = parsed.webmap.authoringAppVersion;
    if (by === AUTHORING_APP && newerVersion(ver, APP_VERSION)) setTimeout(() => toast(t("newerFile", { v: ver }), 7000), parsed.skipped ? 9000 : 3500);
    return true;
  } catch (e) {
    console.error("Open file failed", e);
    toast(S.cantRead, 5000);
    return false;
  }
}

// "1.10.0" is newer than "1.9.0".
function newerVersion(a, b) {
  const pa = String(a || "").split(".").map((x) => parseInt(x, 10) || 0), pb = String(b || "").split(".").map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d > 0; }
  return false;
}
/**
 * Starts a new, empty map (after asking about unsaved changes).
 */
export function newBlankMap() {
  if (!confirmDiscard()) return;
  closeModal("openModal");
  resetWorkspace();
  setActiveMap(localMap);
  localMap.basemap = defaultBasemap();
  setTitle(""); unbindFile(); markClean();
  goToSafe({ center: startCenter, zoom: startZoom() });
  toast(S.newMapStarted);
}

/**
 * Adds a layer from an ArcGIS Online item to the map on screen, under the sketch layers, once per item.
 * @param {object} info { itemId, type, title }
 * @param {object} opts { visible, opacity, silent: no message and the map is not marked changed (opening a saved map) }
 * @returns {Promise<Layer|null>} the layer, or null when it couldn't be added (the student is told)
 */
export async function addPortalLayer(info, opts) {
  opts = opts || {};
  if (portalLayers.has(info.itemId)) return portalLayers.get(info.itemId);
  try {
    const layer = await Layer.fromPortalItem({ portalItem: { id: info.itemId } });
    try { layer.id = ITEM_LAYER_PREFIX + info.itemId; } catch (e) { /* keep the generated id */ }
    layer.__item = { itemId: info.itemId, type: info.type || "", title: info.title || layer.title };
    if (opts.visible === false) layer.visible = false;
    if (typeof opts.opacity === "number") layer.opacity = opts.opacity;
    activeMap().add(layer);
    keepSketchOnTop();
    portalLayers.set(info.itemId, layer);
    if (!opts.silent) { toast(t("addedLayer", { title: layer.__item.title })); markDirty(); }
    if (!$("layersPanel").hidden) renderLayers();
    return layer;
  } catch (e) {
    console.error("Add layer failed", e);
    toast(t("layerFailed", { title: info.title || "" }), 5000);
    return null;
  }
}
/**
 * Takes a layer added from an item off every map.
 * @param {string} itemId
 */
export function removePortalLayer(itemId) {
  const l = portalLayers.get(itemId);
  if (!l) return;
  endLayerTools(l);
  removeFromMaps(l); portalLayers.delete(itemId); markDirty();
  toast(t("removedLayer", { title: l.__item.title }));
  if (!$("layersPanel").hidden) renderLayers();
}

