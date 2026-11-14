// ============================================================ Local save and open (.amap; older .mmap files open too)
// A sketch drawn in 3D carries a height of 0 on every point (the sketch layer lies on the ground). Saved sketches are
// flat shapes, as the ones drawn in 2D are: x and y only (Sketch 3D 1.0).
import "./drag-drop.js?v=5.0.0-beta.40";   // first: keeps the files running in the order they were written in (see app.js)
import { DOC_TYPE, DOC_VERSION, sanitizeDoc, docToWebMap, looksLikeWebMap, LOCK_PROP, isLockedText, TWO_D_ONLY_PROP, VIEW_3D_PROP, looksLikeWebScene,
  docToWebScene } from "../lib/doc.js?v=5.0.0-beta.40";
import { PAIR_PROP } from "../lib/pairs.js?v=5.0.0-beta.40";
import { state } from "./state.js?v=5.0.0-beta.40";
import { APP_VERSION, $, cfg, F, S, t } from "./config.js?v=5.0.0-beta.40";
import { Extent } from "./sdk.js?v=5.0.0-beta.40";
import { graphicsLayer, defaultBasemap, sketchLayers, sketchKeyOfLayer, sketchCount, localMap, mapView, activeMap, goToSafe } from "./views.js?v=5.0.0-beta.40";
import { dataLayers, portalLayers, bindOpened, lockedBase, copyBase, openedEntry, restoreOpened, markClean, confirmDiscard, currentTitle, setTitle,
  FILE_EXT, OPEN_EXTS, titleFromFileName, titleSlug } from "./session.js?v=5.0.0-beta.40";
import { toast, saveNotes, closePanels, openModal, closeModal } from "./ui.js?v=5.0.0-beta.40";
import { vectorSymbol, styleOf, straighten, addSketchGraphic } from "./sketch.js?v=5.0.0-beta.40";
import { mapPair, setMode } from "./view-mode.js?v=5.0.0-beta.40";
import { setActiveMap, timeWidgetsJson, updateToolBadges, keepSketchOnTop, applyLayerOrder, resetWorkspace, sourceLayers, basemapFrom, basemapRef,
  restoreSketchLayers, openWebMapItem, openWebSceneFile, openWebMapFile, addPortalLayer } from "./maps.js?v=5.0.0-beta.40";
import { addDataLayer } from "./data-layers.js?v=5.0.0-beta.40";
import { sketchLayersMeta, layerOrderIds } from "./layers-panel.js?v=5.0.0-beta.40";
import { filterText, hasFilter } from "./filter-panel.js?v=5.0.0-beta.40";
import { showBmList } from "./bookmarks.js?v=5.0.0-beta.40";
import { catalogLoaded, refreshCatalogButtons } from "./collection.js?v=5.0.0-beta.40";
import { readText } from "./drag-drop.js?v=5.0.0-beta.40";
import { recordSave } from "./saved-maps.js?v=5.0.0-beta.40";
import { layerToJson, currentBaseMapJson, sourceLayersJson, saveToAgol } from "./arcgis-online.js?v=5.0.0-beta.40";

function flatGeometryJson(geom) {
  const j = geom.toJSON(), xy = (c) => [c[0], c[1]];
  delete j.hasZ; delete j.hasM; delete j.z; delete j.m;
  if (j.paths) j.paths = j.paths.map((p) => p.map(xy));
  if (j.rings) j.rings = j.rings.map((r) => r.map(xy));
  if (j.points) j.points = j.points.map(xy);
  return j;
}
function currentViewpoint() { return { center: [state.view.center.longitude, state.view.center.latitude], zoom: state.view.zoom }; }
export function buildDocument() {
  const doc = {
    type: DOC_TYPE, version: DOC_VERSION, app: cfg.appName, appVersion: APP_VERSION, title: currentTitle(), savedAt: new Date().toISOString(),
    basemap: basemapRef(), mode: state.mode, viewpoint: currentViewpoint(),
    camera: state.mode === "3d" && state.sceneView ? state.sceneView.camera.toJSON() : null,
    webmap: state.currentSource ? { itemId: state.currentSource.itemId, title: state.currentSource.title } : null,
    layerStates: state.currentSource ? sourceLayers().map((l) => ({ id: l.id, title: l.title, visible: l.visible !== false, opacity: l.opacity })) : [],
    portalLayers: [...portalLayers.values()].map((l) => ({ ...l.__item, visible: l.visible !== false, opacity: l.opacity })),
    sketchVisible: graphicsLayer.visible !== false, sketchOpacity: graphicsLayer.opacity,
    sketchLayers: sketchLayersMeta(), order: layerOrderIds(),
    graphics: sketchLayers.flatMap((sl) => sl.graphics.toArray().map((g) => { straighten(g); const j = { geometry: flatGeometryJson(g.geometry), attributes: { ...g.attributes } }; if (sl !== graphicsLayer) j.layer = sketchKeyOfLayer(sl); return j; })),
    layers: dataLayers.map((fl) => ({ ...fl._srcDef, visible: fl.visible !== false, opacity: fl.opacity, showLabels: fl.labelsVisible !== false, definitionExpression: hasFilter(fl) ? filterText(fl) : undefined }))
  };
  if (state.bookmarks.length) doc.bookmarks = state.bookmarks.map((b) => ({ title: b.title, viewpoint: b.viewpoint, layers: b.layers || [], thumb: b.thumb || null, camera: b.camera ? b.camera.toJSON() : null }));
  return doc;
}
export async function loadDocument(doc) {
  closePanels(false);
  resetWorkspace();
  let sourceOk = false;
  if (doc.webmap) {
    sourceOk = await openWebMapItem(doc.webmap.itemId, { keepWorkspace: true, quiet: true });
    if (!sourceOk) toast(S.sourceMissing, 5000);
  }
  if (!sourceOk) { setActiveMap(localMap); localMap.basemap = defaultBasemap(); }
  if (doc.basemap) { try { activeMap().basemap = basemapFrom(doc.basemap); } catch (e) { /* keep current */ } }
  if (sourceOk) for (const st of doc.layerStates || []) { const l = activeMap().layers.find((x) => x.id === st.id); if (l) { l.visible = st.visible; l.opacity = st.opacity; } }
  for (const p of doc.portalLayers || []) await addPortalLayer(p, { silent: true, visible: p.visible, opacity: p.opacity });
  for (const ld of doc.layers || []) { try { addDataLayer(ld, { silent: true }); } catch (e) { console.warn("Skipped a data layer", e); } }
  restoreSketchLayers(doc.sketchLayers, doc.sketchVisible, doc.sketchOpacity);
  for (const gj of doc.graphics || []) { try { addSketchGraphic(gj); } catch (e) { console.warn("Skipped a sketch", e); } }
  keepSketchOnTop();
  applyLayerOrder(doc.order);
  state.bookmarks = doc.bookmarks || []; updateToolBadges();
  setTitle(doc.title);
  if (doc.mode === "3d" && F.threeD !== false) {
    await setMode("3d", { keepCamera: true });
    if (doc.camera) goToSafe(doc.camera, { animate: false }); else if (doc.viewpoint && doc.viewpoint.center) goToSafe(doc.viewpoint, { animate: false });
  } else {
    await setMode("2d");
    if (doc.viewpoint && doc.viewpoint.center) goToSafe({ center: doc.viewpoint.center, zoom: doc.viewpoint.zoom }, { animate: false });
    else if (doc.viewpoint && doc.viewpoint.extent) goToSafe(Extent.fromJSON(doc.viewpoint.extent), { animate: false });
  }
  if (!$("bookmarksPanel").hidden) showBmList();
  if (catalogLoaded) refreshCatalogButtons();
  markClean();
  const n = sketchCount() + (doc.layers || []).reduce((a, l) => a + l.features.length, 0);
  toast(t("openedFile", { title: currentTitle(), n }));
}
export async function openDocText(text, fileName) {
  let raw;
  try { raw = JSON.parse(text); } catch (e) { toast(S.cantRead); return false; }
  if (looksLikeWebScene(raw)) return openWebSceneFile(raw, fileName);
  if (looksLikeWebMap(raw)) return openWebMapFile(raw, fileName);
  const res = sanitizeDoc(raw);          // a .mmap saved before version 1.2 of this app
  if (!res.ok) { toast(S[res.code] || S.cantRead, 5000); return false; }
  closeModal("openModal");
  await loadDocument(res.doc);
  if (res.skipped) setTimeout(() => toast(t("skippedOnOpen", { n: res.skipped }), 5000), 3500);
  return true;
}
export function openFromDevice() {
  if (!confirmDiscard()) return;
  if (window.showOpenFilePicker) {
    window.showOpenFilePicker({ multiple: false, types: [{ description: S.mapFile, accept: { "application/json": OPEN_EXTS } }] })
      .then(async ([h]) => { const f = await h.getFile(), txt = await f.text(); if (await openDocText(txt, h.name || f.name)) bindOpened(h, txt); })
      .catch((err) => { if (err && err.name === "AbortError") return; pickViaInput(); });
  } else pickViaInput();
}
function pickViaInput() {
  const input = document.createElement("input"); input.type = "file"; input.accept = OPEN_EXTS.join(",") + ",application/json";
  input.addEventListener("change", async () => {
    const f = input.files && input.files[0];
    if (!f) return;
    try { const txt = await readText(f); if (await openDocText(txt, f.name)) bindOpened(null, txt); } catch (e) { toast(S.cantRead); }
  });
  input.click();
}
function downloadBlob(blob, filename) { const u = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = u; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 1000); }
// The saved file is an ArcGIS web map (Web Map Specification): the same JSON that Save to ArcGIS Online stores.
export let unsavedLayers = 0;
export async function buildWebMapJson(toFile) {
  state.privateLeftOut = 0;
  const doc = buildDocument();
  const ext = state.view.extent ? state.view.extent.clone() : null;
  const added = [...portalLayers.values()].map(layerToJson);
  unsavedLayers = added.filter((x) => !x).length;
  const ctx = { baseMap: await currentBaseMapJson(toFile), sourceLayers: sourceLayersJson(toFile), portalLayers: added.filter(Boolean),
    extent: ext ? ext.toJSON() : null, scale: state.mode === "2d" ? mapView.scale : null, rotation: state.mode === "2d" ? mapView.rotation || 0 : 0,
    appVersion: APP_VERSION, sketchTitle: S.sketchLayer, sketchVisible: graphicsLayer.visible !== false, sketchOpacity: graphicsLayer.opacity, widgets: timeWidgetsJson(),
    sketchIcon: (a) => { const v = vectorSymbol(styleOf(a)); try { return v ? v.toJSON() : null; } catch (e) { return null; } },   // the vector symbol itself, as Map Viewer saves it
    order: layerOrderIds() };
  // A web scene is saved as a web scene (3.0): its ground, lighting and kind of scene, the camera, and the bookmarks as slides.
  // One of a pair: the saved map names both versions, so it can still switch after it is opened again.
  const pairNote = (o) => { if (mapPair) o[PAIR_PROP] = { webmap: mapPair.webmap, scene: mapPair.scene }; return o; };
  if (state.sceneOnly) return pairNote(docToWebScene(doc, { ...ctx, camera: state.sceneView && state.sceneView.camera ? state.sceneView.camera.toJSON() : null, scene: (state.currentSource && state.currentSource.data) || null }));
  const wm = pairNote(docToWebMap(doc, ctx));
  if (state.twoDOnly) wm[TWO_D_ONLY_PROP] = true;   // its author switched 3D off: the saved copy stays 2D only
  // Saved to a file while in 3D: the file says so and from where it was seen, and opens that way again.
  if (toFile && state.mode === "3d" && state.sceneView && state.sceneView.camera) wm[VIEW_3D_PROP] = { camera: state.sceneView.camera.toJSON() };
  return wm;
}
async function docText(locked) { const wm = await buildWebMapJson(true); if (locked) wm[LOCK_PROP] = true; return JSON.stringify(wm); }
function saveToDevice(forceNew, locked) {
  if (state.portalUser) return;   // signed in: maps save to ArcGIS Online (see applySaveMode)
  if (state.openedLocked && !locked && (forceNew || !state.currentFileHandle)) toast(S.lockedSaveCopy, 7000);   // said when it matters: at Save
  if (!window.showSaveFilePicker) { openNameDialog(locked); return; }
  writeToHandle(forceNew, locked);
}
// locked: Save a locked copy. It writes a new locked file and leaves the map where it was (Save keeps going there).
async function writeToHandle(forceNew, locked) {
  let target = locked ? null : state.currentFileHandle;
  try {
    if (forceNew || locked || !target) {
      const suggested = locked ? lockedBase() : state.openedLocked ? copyBase() : titleSlug();
      const picked = await window.showSaveFilePicker({ suggestedName: suggested + FILE_EXT, types: [{ description: S.mapFile, accept: { "application/json": [FILE_EXT] } }] });
      const opened = await openedEntry(picked);
      if (opened) { toast((await restoreOpened(opened, picked)) ? S.lockedKept : S.restoreFailed, 9000); return; }   // a locked map: put back as it was
      target = picked;
    } else {
      if (target.queryPermission && (await target.queryPermission({ mode: "readwrite" })) !== "granted") {
        // A map opened from the saved list or from a file: ask to write to its file now, while the click still counts.
        if ((await target.requestPermission({ mode: "readwrite" })) !== "granted") { const d = new Error("Not allowed"); d.name = "NotAllowedError"; throw d; }
      }
      // locked since it was opened (a copy of the file locked in its place, say)? Save makes a copy instead
      if (isLockedText(await (await target.getFile()).text())) { state.openedLocked = true; state.currentFileHandle = null; $("lockedNote").hidden = false; toast(S.lockedSaveCopy, 7000); return writeToHandle(true); }
    }
    const name = target.name || (locked ? lockedBase() : titleSlug()) + FILE_EXT;
    const w = await target.createWritable();
    await w.write(new Blob([await docText(locked)], { type: "application/json" })); await w.close();
    if (locked) {
      toast(t("lockedSaved", { name }), 7000);
      recordSave({ handle: target, fileName: name });
      return;
    }
    state.currentFileHandle = target; state.openedLocked = false; $("lockedNote").hidden = true;
    setTitle(titleFromFileName(name));   // a saved map is named by its file: the header shows what reopening shows
    markClean();
    toast(t("savedFile", { name }));
    recordSave({ handle: target, fileName: name });
    saveNotes(true);
  } catch (err) {
    // Chrome reports two things as AbortError: Cancel in the save box ("The user aborted a request."), and a file
    // it couldn't open for writing ("Failed to create or truncate file": someone else's file, a read-only one).
    if (err && err.name === "AbortError") { if (!/user aborted/i.test(err.message || "user aborted")) toast(S.cantSaveThere, 8000); return; }
    if (err && (err.name === "NotAllowedError" || err.name === "NoModificationAllowedError") && !forceNew && !locked) { toast(S.readOnlyFile, 5000); state.currentFileHandle = null; return writeToHandle(true); }
    console.error(err);
    if (!locked) state.currentFileHandle = null;
    openNameDialog(locked);
  }
}
let nameDialogLocked = false;
function openNameDialog(locked) { nameDialogLocked = !!locked; $("fileNameInput").value = locked ? lockedBase() : state.openedLocked ? copyBase() : titleSlug(); openModal("nameModal", $("fileNameInput")); setTimeout(() => $("fileNameInput").select(), 0); }
async function confirmNameDialog() {
  const name = ($("fileNameInput").value || "map").replace(/[^\w-]+/g, "_").slice(0, 60) || "map";
  const locked = nameDialogLocked;
  closeModal("nameModal");
  if (!locked) setTitle(titleFromFileName(name));   // as above
  try {
    const text = await docText(locked);
    downloadBlob(new Blob([text], { type: "application/json" }), name + FILE_EXT);
    if (locked) { toast(t("lockedSaved", { name: name + FILE_EXT }), 7000); recordSave({ json: text, fileName: name + FILE_EXT }); return; }
    markClean(); toast(t("savedDownload", { name: name + FILE_EXT }));
    recordSave({ json: text, fileName: name + FILE_EXT });
  } catch (e) { console.error(e); toast(S.saveFailed); return; }
  saveNotes(true);
}
$("nameConfirm").addEventListener("click", confirmNameDialog);
$("fileNameInput").addEventListener("keydown", (e) => { if (e.key === "Enter") confirmNameDialog(); });
$("saveTile").addEventListener("click", () => (state.portalUser ? saveToAgol(false) : saveToDevice(false)));
$("saveAsTile").addEventListener("click", () => (state.portalUser ? saveToAgol(true) : saveToDevice(true)));
$("lockTile").addEventListener("click", () => { if (!state.portalUser) saveToDevice(true, true); });
$("shotTile").addEventListener("click", () => {
  state.view.takeScreenshot({ format: "png" }).then((s) => { fetch(s.dataUrl).then((r) => r.blob()).then((b) => { downloadBlob(b, titleSlug() + ".png"); toast(S.shotSaved); }); })
    .catch(() => toast(S.shotFailed));
});

