// ============================================================ Bookmarks
import "./filter-panel.js?v=5.0.0-beta.42";   // first: keeps the files running in the order they were written in (see app.js)
import { state } from "./state.js?v=5.0.0-beta.42";
import { $, S, t } from "./config.js?v=5.0.0-beta.42";
import { Extent } from "./sdk.js?v=5.0.0-beta.42";
import { isSketch, activeMap, goToSafe } from "./views.js?v=5.0.0-beta.42";
import { markDirty } from "./session.js?v=5.0.0-beta.42";
import { updateToolBadges, layersDeep } from "./maps.js?v=5.0.0-beta.42";
import { eachToggleableLayer, renderLayers } from "./layers-panel.js?v=5.0.0-beta.42";
import { previewLayer } from "./csv-import.js?v=5.0.0-beta.42";

let bmEditIndex = -1;
function layerSnapshot() { const s = []; eachToggleableLayer((l, id, title) => s.push({ id, title, visible: l.visible !== false })); return s; }
function applyLayerSnapshot(snap) {
  if (!snap || !snap.length) return;
  const top = new Set();
  eachToggleableLayer((l, id, title) => { top.add(l); const rec = snap.find((r) => r.id === id) || snap.find((r) => r.title && r.title === title); if (rec) l.visible = !!rec.visible; });
  // layers inside a group layer: only a scene's slides record these, by id
  layersDeep(activeMap()).forEach((l) => { if (top.has(l) || isSketch(l) || l === previewLayer) return; const rec = snap.find((r) => r.id === l.id); if (rec) l.visible = !!rec.visible; });
  if (!$("layersPanel").hidden) renderLayers();
}
function applyBookmark(bm) {
  const vp = bm.viewpoint;
  if (state.mode === "3d" && bm.camera) goToSafe(bm.camera.clone(), { duration: 800 });   // made in 3D: same tilt and heading
  else if (vp.center) goToSafe({ center: vp.center, zoom: vp.zoom }, { duration: 800 });
  else if (vp.extent) goToSafe(Extent.fromJSON(vp.extent), { duration: 800 });
  applyLayerSnapshot(bm.layers);
}
function captureThumb(bm) {
  state.view.takeScreenshot({ width: 148, height: 96, format: "jpg", quality: 70 }).then((s) => { if (s && s.dataUrl) { bm.thumb = s.dataUrl; renderBookmarks(); } }).catch(() => {});
}
function renderBookmarks() {
  const list = $("bmList"); list.innerHTML = "";
  $("bmEmpty").hidden = state.bookmarks.length > 0;
  state.bookmarks.forEach((bm, i) => {
    const li = document.createElement("li"); li.className = "bm";
    const go = document.createElement("button"); go.type = "button"; go.className = "bm-go";
    const th = document.createElement("span"); th.className = "bm-thumb"; th.setAttribute("aria-hidden", "true");
    if (bm.thumb) th.style.backgroundImage = "url(" + bm.thumb + ")";
    const tt = document.createElement("span"); tt.className = "bm-title"; tt.textContent = bm.title;
    go.append(th, tt); go.addEventListener("click", () => applyBookmark(bm));
    const ed = document.createElement("button"); ed.type = "button"; ed.className = "mini"; ed.innerHTML = "&#9998;"; ed.title = S.editBookmark; ed.setAttribute("aria-label", S.editBookmark + ": " + bm.title);
    ed.addEventListener("click", () => showBmEdit(i));
    li.append(go, ed); list.appendChild(li);
  });
}
export function showBmList() { bmEditIndex = -1; $("bmEditView").hidden = true; $("bmListView").hidden = false; renderBookmarks(); }
function showBmEdit(i) {
  bmEditIndex = typeof i === "number" ? i : -1;
  const editing = bmEditIndex >= 0;
  $("bmListView").hidden = true; $("bmEditView").hidden = false;
  $("bmEditTitle").textContent = editing ? S.editBookmark : S.addBookmark.replace(/^\+\s*/, "");
  $("bmSave").textContent = editing ? S.save : S.add;
  $("bmDelete").hidden = !editing; $("bmHint").hidden = editing;
  $("bmTitleInput").value = editing ? state.bookmarks[bmEditIndex].title : "";
  $("bmTitleInput").focus();
}
$("bmAddBtn").addEventListener("click", () => showBmEdit(-1));
$("bmBack").addEventListener("click", showBmList);
$("bmCancel").addEventListener("click", showBmList);
$("bmSave").addEventListener("click", () => {
  const title = $("bmTitleInput").value.trim();
  if (bmEditIndex >= 0) state.bookmarks[bmEditIndex].title = title || state.bookmarks[bmEditIndex].title;
  else {
    const bm = { title: title || t("bookmarkDefault", { n: state.bookmarks.length + 1 }), viewpoint: { center: [state.view.center.longitude, state.view.center.latitude], zoom: state.view.zoom }, layers: layerSnapshot(), thumb: null };
    // In 3D, the camera too (tilt and heading), for this session: saved maps keep the place, as a web map bookmark does.
    if (state.mode === "3d" && state.sceneView && state.sceneView.camera) bm.camera = state.sceneView.camera.clone();
    state.bookmarks.push(bm); captureThumb(bm);
  }
  markDirty(); showBmList(); updateToolBadges();
  $("bmAddBtn").focus();
});
$("bmTitleInput").addEventListener("keydown", (e) => { if (e.key === "Enter") $("bmSave").click(); });
$("bmDelete").addEventListener("click", () => { if (bmEditIndex >= 0) { state.bookmarks.splice(bmEditIndex, 1); markDirty(); } showBmList(); updateToolBadges(); $("bmAddBtn").focus(); });

