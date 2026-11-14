// ============================================================ 2D / 3D
import "./legend-basemaps-measure.js?v=5.0.0-beta.43";   // first: keeps the files running in the order they were written in (see app.js)
import { readWebMap } from "../lib/doc.js?v=5.0.0-beta.43";
import { state } from "./state.js?v=5.0.0-beta.43";
import { $, reduceMotion, params, cfg, F, S } from "./config.js?v=5.0.0-beta.43";
import { EsriMap, WebMap, WebScene, reactiveUtils } from "./sdk.js?v=5.0.0-beta.43";
import { sketchLayers, componentView, viewEls, setViewMap, mapView, viewHandlers, activeMap, addViewUI, goToSafe } from "./views.js?v=5.0.0-beta.43";
import { dataLayers, portalLayers, watchBottom } from "./session.js?v=5.0.0-beta.43";
import { toast, openPanelName, closePanels } from "./ui.js?v=5.0.0-beta.43";
import { updatePopupEnabled } from "./popups.js?v=5.0.0-beta.43";
import { sketch, sketchReady, updatePinned, endSketchOps } from "./sketch.js?v=5.0.0-beta.43";
import { legend, coordWidget, gallery, syncGallerySelection, renderGallery, stopMeasuring, PROF_KEYS, profActive, profShow, ensureProfile,
  syncDraftButtons } from "./legend-basemaps-measure.js?v=5.0.0-beta.43";
import { setActiveMap, timeBar, shownMap, listedLayerCount, updateToolBadges, loadedItemJson, slidesToBookmarks } from "./maps.js?v=5.0.0-beta.43";
import { syncColumns } from "./data-layers.js?v=5.0.0-beta.43";
import { table, endSwipe, endLayerTools, renderLayers } from "./layers-panel.js?v=5.0.0-beta.43";
import { showBmList } from "./bookmarks.js?v=5.0.0-beta.43";
import { catalogLoaded, refreshCatalogButtons } from "./collection.js?v=5.0.0-beta.43";
import { previewLayer, renderStyleList, renderFieldRows } from "./csv-import.js?v=5.0.0-beta.43";

let switching = false;
// How much work the 3D view does (5.0.0-beta.3). "low" asks the SDK for its low quality profile (smaller textures, less
// memory, simpler sky) and leaves out shadows and stars. With threeDQuality "auto" (the default) a device gets "low" when
// it has little memory or few processor cores, or draws 3D without a graphics chip; otherwise "medium". A config or a
// link (?quality=low|medium|high) can fix it.
function pick3dQuality() {
  const asked = String(params.get("quality") || cfg.threeDQuality || "auto").toLowerCase();
  if (["low", "medium", "high"].includes(asked)) return { quality: asked, why: "set" };
  let software = false;
  try {
    const gl = document.createElement("canvas").getContext("webgl2");
    const ext = gl && gl.getExtension("WEBGL_debug_renderer_info");
    const r = gl ? String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) : "";
    software = !gl || /swiftshader|llvmpipe|software|basic render/i.test(r);
    const lose = gl && gl.getExtension("WEBGL_lose_context"); if (lose) lose.loseContext();
  } catch (e) { software = true; }
  const mem = navigator.deviceMemory, cores = navigator.hardwareConcurrency;
  if (software) return { quality: "low", why: "software" };
  if ((typeof mem === "number" && mem <= 4) || (typeof cores === "number" && cores <= 4)) return { quality: "low", why: "device" };
  return { quality: "medium", why: "device" };
}
let quality3d = null;
function tune3d(v) {
  if (quality3d.quality !== "low") return;
  const calm = () => { try { const env = v.environment; if (env) { env.starsEnabled = false; env.atmosphereEnabled = true; if (env.lighting) { env.lighting.directShadowsEnabled = false; env.lighting.ambientOcclusionEnabled = false; } if (env.atmosphere) env.atmosphere.quality = "low"; } } catch (e) { /* keep the SDK's own */ } };
  calm(); reactiveUtils.watch(() => v.map, () => v.when().then(calm).catch(() => {}));   // a scene brings its own lighting
}
const TILT_3D = Math.max(0, Math.min(80, Number(cfg.threeDTilt) || 0));
// Which views a map allows (5.0.0-beta.9):
//  - a web scene is 3D only (sceneOnly): it can hold layers and a camera that have no 2D form
//  - a web map tagged "atlas-2d-only" on its ArcGIS Online item is 2D only (twoDOnly): its author switched 3D off
const TAG_2D_ONLY = "atlas-2d-only";
// Paired 2D and 3D maps (lab, features.pairs; lib/pairs.js): a web map and a web scene their author tagged as the 2D and
// 3D versions of one map. The 3D button on the web map opens the scene, and the 2D button on the scene opens the web
// map, in place of drawing the same map in the other view. Sketches, spreadsheet layers and added layers go across,
// and the view stays on the same place; the author's layers, with their filters and what is switched on, are each
// version's own. A version already visited is kept as it was left while the pair is open.
export const pairOn = F.pairs === true && F.threeD !== false;
export let mapPair = null;           // { webmap, scene } (item IDs) when the map on screen is one of a pair
export const idleMap = new EsriMap({});   // what the 3D view holds while the 2D version of a pair is on screen: nothing to draw
const pairSides = {};         // "2d" / "3d": { map, source, agol, bookmarks } of the version not on screen
export const sourceBms = new WeakSet();   // bookmarks that came with a version (its author's), as opposed to ones made here
let pairBusy = false, pairNoteShown = false;
export const partnerFor = (m) => (pairOn && mapPair && !state.twoDOnly && (m === "3d" ? !state.sceneOnly : state.sceneOnly) ? (m === "3d" ? mapPair.scene : mapPair.webmap) : null);
export function usePair(p) { mapPair = pairOn && p ? p : null; for (const k of Object.keys(pairSides)) delete pairSides[k]; syncViewLocks(); }
export const isScene = (m) => !!m && m.declaredClass === "esri.WebScene";
export const has2dOnlyTag = (item) => !!item && Array.isArray(item.tags) && item.tags.some((tg) => String(tg).trim().toLowerCase() === TAG_2D_ONLY);
export function syncViewLocks() {
  const lock = (id, on, why) => { const b = $(id); if (on) { b.setAttribute("aria-disabled", "true"); b.title = why; } else { b.removeAttribute("aria-disabled"); b.removeAttribute("title"); } };
  lock("tg2d", state.sceneOnly && !partnerFor("2d"), S.only3d); lock("tg3d", state.twoDOnly, S.only2d);
}
export async function setMode(m, opts) {
  opts = opts || {};
  if ((m === state.mode && !opts.force) || switching) return;
  if (m === "3d" && F.threeD === false) return;
  if (m === "2d" && state.sceneOnly && !opts.map) { toast(S.only3d, 5000); return; }
  if (m === "3d" && state.twoDOnly) { toast(S.only2d, 5000); return; }
  if (openPanelName === "filter") closePanels(false);   // the filter preview belongs to this view's copy of the layer
  switching = true;
  const from = state.view, vp = !opts.map && from.viewpoint ? from.viewpoint.clone() : null, curMap = opts.map || from.map;
  stopMeasuring();
  endSketchOps();
  try {
    if (m === "3d") {
      if (!isScene(curMap) && (!curMap.ground || !curMap.ground.layers || !curMap.ground.layers.length)) curMap.ground = "world-elevation";
      $("sceneDiv").hidden = false;
      // A scene is either a globe or a flat "local" scene, fixed when its view is made: a scene of the other kind gets a new view.
      const wantMode = isScene(curMap) && curMap.initialViewProperties && curMap.initialViewProperties.viewingMode;
      if (state.sceneView && wantMode && state.sceneView.viewingMode !== wantMode) { const oldEl = viewEls.get(state.sceneView); viewEls.delete(state.sceneView); try { oldEl.destroy(); } catch (e) { /* gone */ } oldEl.remove(); state.sceneView = null; }
      if (!quality3d) { quality3d = pick3dQuality(); console.info("3D quality", quality3d.quality, "(" + quality3d.why + ")"); document.documentElement.dataset.quality3d = quality3d.quality; }
      if (!state.sceneView) { state.sceneView = await componentView("arcgis-scene", "sceneDiv", { map: curMap, qualityProfile: quality3d.quality }); tune3d(state.sceneView); addViewUI(state.sceneView, true);
        // the layer count and the basemap gallery now follow the 3D view's map too (see shownMap)
        reactiveUtils.watch(listedLayerCount, updateToolBadges, { initial: true });
        reactiveUtils.watch(() => { const m = shownMap(), b = m && m.basemap; return b ? ((b.portalItem && b.portalItem.id) || "") + "|" + (b.title || "") : ""; }, syncGallerySelection); viewHandlers.forEach((h) => state.sceneView.on(h[0], h[1])); }
      else if (state.sceneView.map !== curMap) setViewMap(state.sceneView, curMap);
      await state.sceneView.when();
      if (vp) state.sceneView.viewpoint = vp;
      $("viewDiv").hidden = true; state.view = state.sceneView;
      // Same place, then tilt the camera towards the horizon so it's obvious the view is now 3D.
      // (At a whole-world scale the SDK allows little tilt, but the globe itself shows the change.)
      // The place is named in the move: asked for a tilt alone, the SDK tilts about somewhere else and the view ends up
      // off to one side (at street scale, a few kilometres from where the 2D map was looking).
      if (TILT_3D && !opts.keepCamera) {
        const tg = vp && vp.targetGeometry, c = tg ? (tg.type === "point" ? tg : (tg.extent && tg.extent.center)) : state.sceneView.center;
        const to = c ? { target: c, scale: (vp && vp.scale) || state.sceneView.scale, tilt: TILT_3D } : { tilt: TILT_3D };
        state.viewSettled = state.sceneView.goTo(to, { animate: !reduceMotion, duration: 1400 }).catch(() => {});
      }
    } else {
      $("viewDiv").hidden = false;
      if (mapView.map !== curMap) setViewMap(mapView, curMap);
      await mapView.when();
      if (vp) mapView.viewpoint = vp;
      $("sceneDiv").hidden = true; state.view = mapView;
    }
  } catch (e) {
    console.error("Couldn't switch view", e);
    $("viewDiv").hidden = false; $("sceneDiv").hidden = true; state.view = mapView; m = "2d";
    toast(S.no3d);
  }
  state.mode = m; switching = false;
  $("tg2d").setAttribute("aria-pressed", String(m === "2d")); $("tg3d").setAttribute("aria-pressed", String(m === "3d"));
  sketchReady.then(() => { sketch.view = state.view; });
  if (timeBar) { const te = timeBar.timeExtent; timeBar.view = state.view; if (te) state.view.timeExtent = te; }   // the time control follows into 2D / 3D
  if (gallery.items) renderGallery();   // 3D lists the group's 3D basemaps too
  if (profActive()) { for (const k of PROF_KEYS) profShow(k, null); state.profDraft = null; syncDraftButtons(); ensureProfile(); }   // the profile's line follows to the other view
  if (coordWidget) coordWidget.view = state.view;
  if (legend) legend.view = state.view;
  if (m === "3d") endSwipe();   // Swipe is for 2D maps
  if (table && table.widget) { if (table.kind === "chart") { try { const src = state.view.selectionManager && state.view.selectionManager.sources; if (src && !src.includes(table.layer)) src.add(table.layer); } catch (e) { /* no selection on this view */ } } table.widget.view = state.view; }
  if (!$("layersPanel").hidden) renderLayers({ keepFocus: true });
  updatePopupEnabled();
  watchBottom(0);
  if (m === "3d" && dataLayers.some((l) => l.renderer && l.renderer.type === "pie-chart")) toast(S.pieIn3d);
  dataLayers.concat(previewLayer ? [previewLayer] : []).forEach(syncColumns);
  if (state.addState && !$("dataPanel").hidden) { renderStyleList(); renderFieldRows(); }   // what the styles offer depends on the view
}
// The 2D and 3D buttons. A map with a partner goes to its partner; any other map is drawn in the other view.
function requestMode(m) { return m !== state.mode && partnerFor(m) ? switchToPartner(m) : setMode(m); }
async function switchToPartner(m) {
  if (pairBusy || switching) return;
  pairBusy = true;
  const id = partnerFor(m), here = m === "3d" ? "2d" : "3d", btn = $(m === "3d" ? "tg3d" : "tg2d");
  btn.setAttribute("aria-busy", "true");
  let side = pairSides[m];
  try {
    if (!side) {
      const map = new (m === "3d" ? WebScene : WebMap)({ portalItem: { id } });
      await map.load();
      const { item, data } = await loadedItemJson(map, id);
      if (item.type !== (m === "3d" ? "Web Scene" : "Web Map")) throw new Error("The partner is a " + item.type);
      let bms, srcData = data;
      if (m === "3d") bms = slidesToBookmarks(map);
      else { const parsed = readWebMap(data, { trusted: true }); if (!parsed.ok) throw new Error("Not a web map"); bms = parsed.bookmarks; srcData = parsed.webmap; }
      bms.forEach((b) => sourceBms.add(b));
      side = { map, bookmarks: bms, agol: state.portalUser && item.owner === state.portalUser.username ? { id, owner: item.owner, title: item.title } : null,
        source: { itemId: id, title: item.title, item, data: srcData, ...(m === "3d" ? { scene: true } : {}), restricted: !!state.portalUser && !!item.access && item.access !== "public" } };
    }
  } catch (e) {
    console.warn("The map's " + m.toUpperCase() + " version couldn't be opened", e);
    btn.removeAttribute("aria-busy"); pairBusy = false;
    if (m === "3d") { toast(S.pairNo3d, 6000); return setMode("3d"); }   // as any other map: drawn in 3D as it is
    toast(S.pairNo2d, 6000); return;
  }
  if (openPanelName === "filter") closePanels(false);
  endLayerTools(null);
  const prev = activeMap(), vp = state.view.viewpoint ? state.view.viewpoint.clone() : null;
  const mine = state.bookmarks.filter((b) => !sourceBms.has(b));
  const carried = [...dataLayers, ...portalLayers.values()].concat(previewLayer ? [previewLayer] : []);
  const leaving = { map: prev, bookmarks: state.bookmarks.filter((b) => sourceBms.has(b)), source: state.currentSource, agol: state.currentAgolItem };
  // the person's own layers (sketch layers, spreadsheets, added layers), in the drawing order they have been given
  const ownSet = new Set([...sketchLayers, ...carried]), own = prev.layers.toArray().filter((l) => ownSet.has(l));
  for (const l of own) { try { prev.remove(l); } catch (e) { /* not there */ } }
  const keepPair = mapPair, wasScene = state.sceneOnly;
  await setMode(m, { map: side.map, force: true, keepCamera: true });
  if (state.mode !== m) {   // the other view couldn't start: everything goes back where it was
    for (const l of own) prev.add(l);
    state.sceneOnly = wasScene; setActiveMap(prev); mapPair = keepPair; syncViewLocks(); updatePinned();
    btn.removeAttribute("aria-busy"); pairBusy = false;
    return;
  }
  setActiveMap(side.map, m === "2d" ? { not3d: true } : { keep2d: true }); mapPair = keepPair;
  for (const l of own) { if (side.map.layers.includes(l)) side.map.remove(l); side.map.add(l); }   // above the version's own layers, in the same order
  updatePinned();
  pairSides[here] = leaving; delete pairSides[m];
  state.currentSource = side.source; state.currentAgolItem = side.agol;
  const names = new Set(mine.map((b) => b.title));
  state.bookmarks = side.bookmarks.filter((b) => !names.has(b.title)).concat(mine); updateToolBadges();
  syncViewLocks();
  // The same place: what the other version was looking at, at the same scale (tilted, in 3D, as any map is).
  const tg = vp && vp.targetGeometry, c = tg ? (tg.type === "point" ? tg : (tg.extent && tg.extent.center)) : null;
  if (c && vp.scale) {
    if (m === "3d") state.viewSettled = state.sceneView.goTo({ target: c, scale: vp.scale, ...(TILT_3D ? { tilt: TILT_3D } : {}) }, { animate: false }).catch(() => {});
    else goToSafe({ target: c, scale: vp.scale }, { animate: false });
  }
  dataLayers.concat(previewLayer ? [previewLayer] : []).forEach(syncColumns);
  if (!$("bookmarksPanel").hidden) showBmList();
  if (!$("layersPanel").hidden) renderLayers({ keepFocus: true });
  if (catalogLoaded) refreshCatalogButtons();
  if (legend) legend.view = state.view;
  btn.removeAttribute("aria-busy"); pairBusy = false;
  toast(pairNoteShown ? (m === "3d" ? S.pairNow3d : S.pairNow2d) : (m === "3d" ? S.pairFirst3d : S.pairFirst2d), pairNoteShown ? 3000 : 9000);
  pairNoteShown = true;
}
$("tg2d").addEventListener("click", () => requestMode("2d"));
$("tg3d").addEventListener("click", () => requestMode("3d"));

