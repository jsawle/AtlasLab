// ============================================================ Maps and layers
import "./view-mode.js?v=5.0.0-beta.40";   // first: keeps the files running in the order they were written in (see app.js)
import { AUTHORING_APP, ITEM_LAYER_PREFIX, isOwnLayerJson, readWebMap, isSketchKey, TWO_D_ONLY_PROP, saved3dCamera, readWebScene } from "../lib/doc.js?v=5.0.0-beta.40";
import { pairOf, savedPair } from "../lib/pairs.js?v=5.0.0-beta.40";
import { state } from "./state.js?v=5.0.0-beta.40";
import { APP_VERSION, $, HEX32, F, S, t } from "./config.js?v=5.0.0-beta.40";
import { WebMap, WebScene, Camera, Basemap, Layer, restGet } from "./sdk.js?v=5.0.0-beta.40";
import { graphicsLayer, defaultBasemap, sketchLayers, isSketch, sketchLayerByKey, sketchCount, localMap, takePreloaded, startCenter, setViewMap,
  startZoom, mapView, activeMap, goToSafe } from "./views.js?v=5.0.0-beta.40";
import { dataLayers, portalLayers, unbindFile, markDirty, markClean, confirmDiscard, setTitle, titleFromFileName } from "./session.js?v=5.0.0-beta.40";
import { toast, openPanelName, closePanels, closeModal } from "./ui.js?v=5.0.0-beta.40";
import { addSketchGraphic, syncSketchLayerPicker, newSketchLayer, nextSketchLayerName, setActiveSketch, removeSketchLayer, updatePinned,
  setSelection, endSketchOps } from "./sketch.js?v=5.0.0-beta.40";
import { legend } from "./legend-basemaps-measure.js?v=5.0.0-beta.40";
import { idleMap, sourceBms, partnerFor, usePair, isScene, has2dOnlyTag, syncViewLocks, setMode } from "./view-mode.js?v=5.0.0-beta.40";
import { addDataLayer } from "./data-layers.js?v=5.0.0-beta.40";
import { chartNoteWhenLoaded, chartNote, endLayerTools, renderLayers } from "./layers-panel.js?v=5.0.0-beta.40";
import { showBmList } from "./bookmarks.js?v=5.0.0-beta.40";
import { catalogLoaded, refreshCatalogButtons } from "./collection.js?v=5.0.0-beta.40";
import { previewLayer, removePreview } from "./csv-import.js?v=5.0.0-beta.40";

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
  timeBar = document.createElement("arcgis-time-bar");
  for (const a of ["show-play", "show-previous", "show-next", "show-time-extent", "show-settings"]) timeBar.setAttribute(a, "");
  timeBar.setAttribute("label", S.timeTool);
  // the slider takes the place of the bar's date label (its "time-extent" slot) and shows the dates itself
  const slider = document.createElement("arcgis-time-bar-slider"); slider.slot = "time-extent";
  for (const a of ["show-ticks", "show-min", "show-max"]) slider.setAttribute(a, "");
  timeBar.appendChild(slider);
  host.appendChild(timeBar);
  timeBar.view = state.view;
}
// The time settings to save: the map's own, with where the slider is now.
export function timeWidgetsJson() {
  const ts = timeSettings(state.view && state.view.map);
  if (!ts) return null;
  let props = {};
  try { props = { ...((typeof ts.toJSON === "function" ? ts.toJSON() : ts).properties || {}) }; } catch (e) { props = {}; }
  if (state.currentSource && state.currentSource.data && state.currentSource.data.widgets) props = { ...state.currentSource.data.widgets.timeSlider.properties, ...props };
  const te = timeBar && timeBar.timeExtent;
  if (te && (te.start || te.end)) props.currentTimeExtent = [te.start ? te.start.getTime() : null, te.end ? te.end.getTime() : null];
  return { timeSlider: { properties: props } };
}
// Toolbar badges, as MapMaker shows them: the number of layers on Map layers, and a dot on Bookmarks when the map has
// bookmarks. The count is the map's top-level layers as Map layers lists them (a group counts once, as in MapMaker:
// 6 for "1777-1778 Revolutionary Battles", which has 4 layers and 2 groups); the sketch layer and a CSV preview don't count.
// The map on show, read from the views themselves so that watchers follow it: the 3D view's when it holds a web scene
// (which the 2D view never shows), otherwise the 2D view's. (Before beta.3 the layer count and the basemap gallery
// looked at the 2D view only, so in a scene the count stayed at 0.)
export function shownMap() { return state.sceneView && isScene(state.sceneView.map) ? state.sceneView.map : mapView && mapView.map; }
export function listedLayerCount() {
  const m = shownMap();
  let n = 0;
  if (m) m.layers.forEach((l) => { if (l.listMode !== "hide" && l !== previewLayer) n++; });
  return n;
}
export function updateToolBadges() {
  const n = listedLayerCount(), b = $("layersBadge");
  b.textContent = n > 99 ? "99+" : String(n); b.hidden = !n;
  $("layersBadgeSr").textContent = n ? ", " + (n === 1 ? S.layersCountOne : t("layersCount", { n })) : "";
  const k = state.bookmarks.length;
  $("bookmarksDot").hidden = !k;
  $("bookmarksDotSr").textContent = k ? ", " + (k === 1 ? S.bookmarksCountOne : t("bookmarksCount", { n: k })) : "";
}
export function keepSketchOnTop() { const m = activeMap(); for (const l of state.pinnedSketch) { if (m.layers.includes(l)) { try { m.reorder(l, m.layers.length - 1); } catch (e) { /* ok */ } } } }
// Put the map's layers in a saved order (ids, bottom first). Layers the order doesn't name keep their places above.
export function applyLayerOrder(ids) {
  if (!Array.isArray(ids) || !ids.length) return;
  const m = activeMap(), named = ids.map((id) => m.layers.find((l) => l.id === id)).filter((l) => l && l !== previewLayer);
  [...new Set(named)].forEach((l, i) => { try { m.reorder(l, i); } catch (e) { /* ok */ } });
  updatePinned();
}
export function removeFromMaps(l) { for (const m of new Set([localMap, mapView.map, state.sceneView && state.sceneView.map])) { if (m) { try { m.remove(l); } catch (e) { /* not there */ } } } }
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
export function sourceLayers() {
  const own = new Set([...sketchLayers, previewLayer, ...dataLayers, ...portalLayers.values()]);
  return activeMap().layers.toArray().filter((l) => !own.has(l));
}
export function basemapFrom(ref) { return typeof ref === "string" && ref.startsWith("item:") ? new Basemap({ portalItem: { id: ref.slice(5) } }) : ref; }
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
// The sketch layers a saved map or document says it has: the first one's settings, and each further layer made again.
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
// The item's details and its map JSON, as the SDK fetched them when it loaded the map. (Before 5.0.0-beta.9 the app
// asked ArcGIS Online for both itself as well, so each was downloaded twice.) If the SDK doesn't hand them over, they are fetched.
export async function loadedItemJson(m, itemId) {
  const copy = (o) => (o && typeof o === "object" ? JSON.parse(JSON.stringify(o)) : null);
  const item = copy(m.portalItem && m.portalItem.sourceJSON), data = copy(m.resourceInfo);
  if (item && item.id === itemId && data && Array.isArray(data.operationalLayers)) return { item, data };
  const [i, d] = await Promise.all([restGet(`/sharing/rest/content/items/${itemId}`), restGet(`/sharing/rest/content/items/${itemId}/data`)]);
  return { item: i, data: d };
}
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
    if (!opts.keepWorkspace) resetWorkspace();
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
// The map's data layers, with those inside group layers. Not map.allLayers: that has the basemap and the ground as well.
export function layersDeep(m) {
  const out = [];
  const walk = (ls) => ls.forEach((l) => { out.push(l); if (l.type === "group" && l.layers) walk(l.layers); });
  walk(m.layers);
  return out;
}
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
// A web scene saved on this device (3.0). Every web address in it was checked by readWebScene.
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
// A web map saved on this device (or any web map JSON). Every web address in it was checked by readWebMap.
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
export function removePortalLayer(itemId) {
  const l = portalLayers.get(itemId);
  if (!l) return;
  endLayerTools(l);
  removeFromMaps(l); portalLayers.delete(itemId); markDirty();
  toast(t("removedLayer", { title: l.__item.title }));
  if (!$("layersPanel").hidden) renderLayers();
}

