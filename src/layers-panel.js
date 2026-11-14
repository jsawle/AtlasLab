// ============================================================ Map layers panel
import "./data-layers.js?v=5.0.0-beta.41";   // first: keeps the files running in the order they were written in (see app.js)
import { state, late } from "./state.js?v=5.0.0-beta.41";
import { $, fmt, F, S, t } from "./config.js?v=5.0.0-beta.41";
import { toolEl, dropEl } from "./sdk.js?v=5.0.0-beta.41";
import { graphicsLayer, sketchLayers, isSketch, sketchKeyOfLayer, sketchListed, viewEls, mapView, activeMap, syncToolsToggles, goToSafe } from "./views.js?v=5.0.0-beta.41";
import { dataLayers, portalLayers, markDirty, layoutBottom } from "./session.js?v=5.0.0-beta.41";
import { toast, openPanelName, openPanel, closePanels } from "./ui.js?v=5.0.0-beta.41";
import { SKETCH_LAYERS_ON, syncSketchLayerPicker, removeSketchLayer, updatePinned, setSelection, endSketchOps } from "./sketch.js?v=5.0.0-beta.41";
import { shownMap, updateToolBadges, removeFromMaps } from "./maps.js?v=5.0.0-beta.41";
import { filterable, hasFilter, openFilter } from "./filter-panel.js?v=5.0.0-beta.41";
import { catalogLoaded, refreshCatalogButtons } from "./collection.js?v=5.0.0-beta.41";
import { safeFragment } from "./item-info.js?v=5.0.0-beta.41";
import { previewLayer, editDataLayer } from "./csv-import.js?v=5.0.0-beta.41";
late.updateScaleStates = updateScaleStates;   // for the start-up files, which run before this one (see late in state.js)

export function eachToggleableLayer(fn) {
  activeMap().layers.toArray().slice().reverse().forEach((l) => { if (l !== previewLayer) fn(l, l.id, l.title || l.id); });
}
function zoomToLayer(l) {
  if (isSketch(l)) { const g = l.graphics.toArray(); if (g.length) goToSafe(g); else toast(S.noSketches); return; }
  if (l.queryExtent) { l.when().then(() => l.queryExtent()).then((r) => { if (r && r.extent) goToSafe(r.extent.expand(1.2)); }).catch(() => {}); return; }
  if (l.fullExtent) goToSafe(l.fullExtent);
}
// Map layers, after MapMaker's: each layer has a drag handle, its name, a chevron that shows or hides its tools, and
// its check box; under it a row of tools (Zoom to, Show legend, Adjust transparency, Swipe, Table, Layer's description,
// Labels when the layer has labels, Change style for spreadsheet layers, Remove). A group opens to show its layers, each
// with the same tools. A layer outside its visible scale range is greyed with an ⓘ that says so.
// The icons are the SDK's own Calcite icons, as in MapMaker; each tool is a plain button with its own accessible name.
const ICON_STYLE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.7-.8 1.7-1.6 0-.5-.2-.9-.5-1.2-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5C21 6.4 17 3 12 3z"/><circle cx="7.5" cy="11.5" r="1.1" fill="currentColor"/><circle cx="9.8" cy="7.4" r="1.1" fill="currentColor"/><circle cx="14.6" cy="7.4" r="1.1" fill="currentColor"/><circle cx="17" cy="11.3" r="1.1" fill="currentColor"/></svg>';
export const calIcon = (name) => '<calcite-icon icon="' + name + '" scale="s" aria-hidden="true"></calcite-icon>';
export const TABLE_TYPES = new Set(["feature", "csv", "geojson", "wfs", "ogc-feature"]);
const LEGEND_TYPES = new Set(["feature", "csv", "geojson", "wfs", "ogc-feature", "map-image", "imagery", "imagery-tile", "tile", "vector-tile", "wms", "kml", "scene", "stream"]);
const layerUi = new WeakMap();            // per layer: { collapsed, open (sublayers shown), legend, transp, info }
const uiOf = (l) => { let u = layerUi.get(l); if (!u) { u = { collapsed: false, open: false, legend: false, transp: false, info: false, scale: false }; layerUi.set(l, u); } return u; };
let layerKeySeq = 0;
const layerKeys = new WeakMap();
export const keyOf = (l) => { let k = layerKeys.get(l); if (!k) { k = "k" + (++layerKeySeq); layerKeys.set(l, k); } return k; };
export let rowWidgets = [], rowRefs = [], swipe = null, table = null;
export const isGroup = (l) => l && l.type === "group" && l.layers;
function outOfScale(l) {
  const s = state.view && state.view.scale;
  if (!(s > 0)) return false;
  const min = l.minScale || 0, max = l.maxScale || 0;
  return (min > 0 && s > min) || (max > 0 && s < max);
}
export function hasLabels(l) { const li = l.labelingInfo; return !isSketch(l) && !!li && li.length > 0; }
// The layers listed at one level, top first (as drawn), and the collection that holds them.
function siblingsOf(owner) {
  const coll = owner === "map" ? activeMap().layers : owner.layers;
  // sketch layers are listed with the others, in their place in the drawing order (the first one only once it has a sketch)
  return coll.toArray().filter((x) => x !== previewLayer && (isSketch(x) ? sketchListed(x) : x.listMode !== "hide")).reverse();
}
function ownerColl(owner) { return owner === "map" ? activeMap() : owner; }
function moveLayer(l, owner, to) {
  const sibs = siblingsOf(owner), from = sibs.indexOf(l);
  if (from < 0 || to < 0 || to >= sibs.length || to === from) return;
  const coll = ownerColl(owner), target = coll.layers.indexOf(sibs[to]);
  try { coll.reorder(l, target); } catch (e) { console.error(e); return; }
  if (owner === "map") updatePinned();
  markDirty();
  renderLayers({ focusKey: keyOf(l) + ":move" });
  $("layersLive").textContent = t("layerMoved", { title: l.title || "", n: to + 1, total: sibs.length });
}
export function endSwipe() {
  if (!swipe) return;
  dropEl(swipe.widget);
  swipe = null;
}
let swipeSeq = 0;
async function toggleSwipe(l) {
  if (swipe && swipe.layer === l) { endSwipe(); renderLayers({ keepFocus: true }); return; }
  endSwipe(); const seq = ++swipeSeq;
  try {
    // the swipe component sits inside the map component, over the map
    const el = await toolEl("arcgis-swipe", viewEls.get(mapView), { view: mapView, leadingLayers: [l], trailingLayers: [], direction: "horizontal", swipePosition: 50 });
    if (state.mode !== "2d" || seq !== swipeSeq) { dropEl(el); return; }
    swipe = { widget: el, layer: l };
    toast(t("swipeOn", { title: l.title || "" }));
  } catch (e) { console.error(e); toast(S.swipeFailed); }
  renderLayers({ keepFocus: true });
}
export function closeTable(restoreFocus) {
  if (!table) return;
  const l = table.layer, kind = table.kind || "table";
  if (kind === "chart") {   // the chart's selection goes from the map with it
    try { if (table.widget && table.widget.clearSelection) table.widget.clearSelection(); } catch (e) { /* none */ }
    for (const v of [mapView, state.sceneView]) { try { const src = v && v.selectionManager && v.selectionManager.sources; if (src && src.includes(l)) src.remove(l); } catch (e) { /* none */ } }
  }
  dropEl(table.widget);
  table = null;
  $("tableDock").hidden = true; $("tableBody").innerHTML = ""; $("tableDock").classList.remove("chart-dock"); $("chartPickWrap").hidden = true;
  if (openPanelName !== "profile") { $("app").classList.remove("docked", "tools-shown"); syncToolsToggles(); }
  setTimeout(layoutBottom, 0);
  if (!$("layersPanel").hidden) renderLayers({ focusKey: restoreFocus ? keyOf(l) + ":" + kind : null, keepFocus: !restoreFocus });
}
// The SDK's table has a progress bar with no name for a screen reader (WCAG 4.1.2, found by axe-core): it is given one.
function nameTableProgress(el, tries = 0) {
  const find = (n) => { if (!n) return null; if (n.nodeType === 1 && n.tagName === "CALCITE-PROGRESS") return n; if (n.shadowRoot) { const f = find(n.shadowRoot); if (f) return f; } for (const c of n.children || []) { const f = find(c); if (f) return f; } return null; };
  const bar = el.isConnected ? find(el) : null;
  if (bar) { if (!bar.label) bar.label = S.filterLoading || "Loading"; return; }
  if (el.isConnected && tries < 20) setTimeout(() => nameTableProgress(el, tries + 1), 300);
}
async function openTable(l) {
  if (table && table.layer === l && table.kind !== "chart") { closeTable(true); return; }
  if (openPanelName === "profile") { closePanels(false); openPanel("layers", { focus: false }); }
  if (table) closeTable(false);
  try {
    const c = document.createElement("div"); c.className = "table-host";
    $("tableBody").replaceChildren(c);
    $("tableH").textContent = t("tableOf", { title: l.title || "" });
    $("tableDock").hidden = false; syncDockHeight($("tableDock"));
    $("app").classList.add("docked"); $("app").classList.remove("tools-shown"); syncToolsToggles();
    const w = await toolEl("arcgis-feature-table", c, { view: state.view, layer: l });
    nameTableProgress(w);
    table = { widget: w, layer: l, kind: "table" };
    setTimeout(layoutBottom, 0);
  } catch (e) { console.error(e); toast(S.tableFailed); closeTable(false); return; }
  renderLayers({ keepFocus: true });
}
$("tableClose").addEventListener("click", () => closeTable(true));
// A dock (the chart, the table, Elevation) can be made taller or shorter: drag the bar along its top, or with the bar
// in focus use the up and down arrow keys (Page Up / Page Down for bigger steps, Home and End for the tallest and
// shortest). The height chosen is kept for each kind of dock while the app is open; the map keeps at least 120px.
const dockHeights = {};
const dockKind = (dock) => (dock.id === "profilePanel" ? "profile" : dock.classList.contains("chart-dock") ? "chart" : "table");
function dockLimits(dock) { const app = $("app").getBoundingClientRect(), top = $("mapWrap").getBoundingClientRect().top; return { min: 150, max: Math.max(150, Math.round(app.bottom - top - 120)) }; }
function setDockHeight(dock, px, remember) {
  const { min, max } = dockLimits(dock), hgt = Math.round(Math.min(max, Math.max(min, px)));
  dock.style.height = hgt + "px";
  if (remember) dockHeights[dockKind(dock)] = hgt;
  const grip = dock.querySelector(".dock-grip");
  if (grip) { grip.setAttribute("aria-valuemin", String(min)); grip.setAttribute("aria-valuemax", String(max)); grip.setAttribute("aria-valuenow", String(hgt)); grip.setAttribute("aria-valuetext", fmt(S.dockHeight, { n: hgt })); }
  layoutBottom();
}
// when a dock opens (or changes from table to chart): the height last chosen for its kind, else the stylesheet's
export function syncDockHeight(dock) { const k = dockHeights[dockKind(dock)]; if (k) setDockHeight(dock, k, false); else { dock.style.height = ""; setDockHeight(dock, dock.getBoundingClientRect().height, false); dock.style.height = ""; } }
for (const grip of document.querySelectorAll(".dock-grip")) {
  const dock = grip.parentElement; let start = null;
  grip.addEventListener("pointerdown", (e) => { if (e.button) return; start = { y: e.clientY, h: dock.getBoundingClientRect().height }; grip.setPointerCapture(e.pointerId); grip.classList.add("dragging"); document.body.classList.add("dock-dragging"); e.preventDefault(); });
  grip.addEventListener("pointermove", (e) => { if (start) setDockHeight(dock, start.h + (start.y - e.clientY), true); });
  const end = (e) => { if (!start) return; start = null; grip.classList.remove("dragging"); document.body.classList.remove("dock-dragging"); try { grip.releasePointerCapture(e.pointerId); } catch (err) { /* released */ } setTimeout(layoutBottom, 0); };
  grip.addEventListener("pointerup", end); grip.addEventListener("pointercancel", end);
  grip.addEventListener("keydown", (e) => {
    const cur = dock.getBoundingClientRect().height, { min, max } = dockLimits(dock);
    const to = { ArrowUp: cur + 20, ArrowDown: cur - 20, PageUp: cur + 100, PageDown: cur - 100, Home: max, End: min }[e.key];
    if (to === undefined) return; e.preventDefault(); setDockHeight(dock, to, true);
  });
  grip.addEventListener("dblclick", () => { delete dockHeights[dockKind(dock)]; syncDockHeight(dock); });   // back to the usual height
}
window.addEventListener("resize", () => { for (const d of document.querySelectorAll(".dock:not([hidden])")) if (d.style.height) setDockHeight(d, parseFloat(d.style.height), false); });
// Charts (1.0 in 5.0.0-beta.16): a chart the map's author set up on a layer in Map Viewer is drawn by the SDK's chart
// component from that set-up, in the dock under the map (where the table goes; one or the other). The component's own
// action bar has its tools: the legend, selecting, only what is in view, zoom, and saving the picture or the numbers.
// The chart and the map share a selection: what is selected on the chart is highlighted on the map.
// Charts 1.1 (5.0.0-beta.41): a chart can be kept in the map or with the layer's own item (Map Viewer's "Save layer").
// The SDK reads an item's charts when the layer loads, after the map has opened, so "This map has a chart" was missed
// for those. The opening message is given at once as before, and given again with the chart note if the map's feature
// layers turn out to have charts once they have loaded (waiting up to 8 seconds).
const layersOf = (x) => (x && x.allLayers ? x.allLayers.toArray() : []);
export async function chartNoteWhenLoaded(map, say) {
  const fl = layersOf(map).filter((l) => l && l.type === "feature");
  if (!fl.length) return;
  const before = chartNote();
  await Promise.race([Promise.allSettled(fl.map((l) => l.load())), new Promise((r) => setTimeout(r, 8000))]);
  if (shownMap() !== map) return;   // another map has been opened since
  if (!before && chartNote()) say();
  if (!$("layersPanel").hidden) renderLayers({ keepFocus: true });
}
const chartsOf = (l) => { try { const c = l && l.charts; return Array.isArray(c) ? c.filter((x) => x && x.series) : []; } catch (e) { return []; } };
const chartTitle = (c, i) => { const x = c && c.title && c.title.content; return String((x && x.text) || (typeof c.title === "string" ? c.title : "") || t("chartN", { n: i + 1 })).trim(); };
async function openChart(l, index) {
  const charts = chartsOf(l);
  if (!charts.length) return;
  if (table && table.layer === l && table.kind === "chart" && index === undefined) { closeTable(true); return; }
  if (openPanelName === "profile") { closePanels(false); openPanel("layers", { focus: false }); }
  if (table) closeTable(false);
  const i = Math.min(charts.length - 1, Math.max(0, index || 0));
  try {
    const c = document.createElement("div"); c.className = "table-host chart-host";
    $("tableBody").replaceChildren(c);
    $("tableH").textContent = t("chartOf", { title: l.title || "" });
    const pick = $("chartPick"); pick.replaceChildren(...charts.map((ch, k) => new Option(chartTitle(ch, k), String(k)))); pick.value = String(i);
    $("chartPickWrap").hidden = charts.length < 2;
    $("tableDock").classList.add("chart-dock"); $("tableDock").hidden = false; syncDockHeight($("tableDock"));
    $("app").classList.add("docked"); $("app").classList.remove("tools-shown"); syncToolsToggles();
    const el = document.createElement("arcgis-chart"); el.setAttribute("aria-label", chartTitle(charts[i], i));
    const bar = document.createElement("arcgis-charts-action-bar"); bar.slot = "action-bar"; el.appendChild(bar);
    c.appendChild(el);
    await Promise.race([customElements.whenDefined("arcgis-chart"), new Promise((_, no) => setTimeout(() => no(new Error("arcgis-chart did not load")), 45000))]);
    if (el.componentOnReady) await el.componentOnReady();
    // the map's selection manager only takes selections for layers it has been told of
    try { const src = state.view.selectionManager && state.view.selectionManager.sources; if (src && !src.includes(l)) src.add(l); } catch (e) { console.warn("Chart selection won't show on the map", e); }
    Object.assign(el, { layer: l, view: state.view, model: charts[i], syncSelectionsBetweenChartAndLayerViewPolicy: "enabled" });   // what is selected on the chart is highlighted on the map
    table = { widget: el, layer: l, kind: "chart", index: i };
    setTimeout(layoutBottom, 0);
  } catch (e) { console.error(e); toast(S.chartFailed); table = table || { widget: null, layer: l, kind: "chart" }; closeTable(false); return; }
  renderLayers({ keepFocus: true });
}
$("chartPick").addEventListener("change", () => { if (table && table.kind === "chart") openChart(table.layer, Number($("chartPick").value)); });
// a map that has charts says so when it opens, since they are found in Map layers
export function chartNote() {
  try { const n = shownMap().allLayers.filter((l) => chartsOf(l).length > 0).length; return n ? " " + (n === 1 ? S.mapHasChart : t("mapHasCharts", { n })) : ""; } catch (e) { return ""; }
}
// Anything that ends with a layer gone (removed, a new map) also ends its swipe and table.
export function endLayerTools(l) {
  const within = (x) => x && (x === l || (isGroup(l) && l.allLayers && l.allLayers.includes(x)));
  if (!l || within(swipe && swipe.layer)) endSwipe();
  if (!l || within(table && table.layer)) closeTable(false);
}
async function fillLayerInfo(l, box) {
  const h = document.createElement("h3"); h.className = "lyr-info-h"; h.textContent = S.layerDescription;
  const body = document.createElement("div"); body.className = "lyr-info-body";
  box.replaceChildren(h, body);
  const item = l.portalItem;
  let frag = null;
  if (item && item.id) {
    try {
      if (item.load) await item.load();
      if (item.description) frag = safeFragment(item.description);
      else if (item.snippet) { frag = document.createElement("p"); frag.textContent = item.snippet; }
    } catch (e) { /* no description */ }
  }
  if (!frag) { frag = document.createElement("p"); frag.textContent = dataLayers.includes(l) ? t("dataLayerInfo", { n: ((l._srcDef && l._srcDef.features) || []).length }) : S.noLayerDescription; }
  body.appendChild(frag);
}
function toolButton(key, icon, label, title, onClick, pressed) {
  const b = document.createElement("button"); b.type = "button"; b.className = "lt"; b.dataset.key = key;
  b.innerHTML = icon; b.title = label; b.setAttribute("aria-label", label + ": " + title);
  if (pressed !== undefined) b.setAttribute("aria-pressed", String(!!pressed));
  b.addEventListener("click", onClick);
  return b;
}
function layerRow(l, owner, depth, pos, count) {
  const title = l.title || l.id, k = keyOf(l), u = uiOf(l), group = isGroup(l), sk = isSketch(l);
  const li = document.createElement("li"); li.className = "li lyr" + (depth ? " sub" : ""); li.dataset.key = k;
  if (sk) li.dataset.sketch = sketchKeyOfLayer(l) || "first";
  const head = document.createElement("div"); head.className = "lyr-head";
  // drag handle: drag it, or use the arrow keys on it, to change the drawing order (sketch layers move like the others)
  if (count > 1) {
    const h = document.createElement("button"); h.type = "button"; h.className = "lyr-drag"; h.dataset.key = k + ":move";
    h.innerHTML = calIcon("drag"); h.setAttribute("aria-label", t("moveLayer", { title })); h.setAttribute("aria-describedby", "layersMoveHint");
    h.title = S.moveLayerTip;
    h.addEventListener("keydown", (e) => {
      if (e.key === "ArrowUp" && pos > 0) { e.preventDefault(); moveLayer(l, owner, pos - 1); }
      else if (e.key === "ArrowDown" && pos < count - 1) { e.preventDefault(); moveLayer(l, owner, pos + 1); }
    });
    h.addEventListener("pointerdown", (e) => startDrag(e, l, owner, li));
    head.appendChild(h);
  } else if (depth === 0) { const sp = document.createElement("span"); sp.className = "lyr-drag-sp"; head.appendChild(sp); }
  if (group) {
    const g = document.createElement("button"); g.type = "button"; g.className = "lyr-open"; g.dataset.key = k + ":open";
    g.innerHTML = calIcon(u.open ? "chevron-down" : "chevron-right"); g.setAttribute("aria-expanded", String(u.open));
    g.setAttribute("aria-label", t("groupLayers", { title }));
    g.addEventListener("click", () => { u.open = !u.open; renderLayers({ focusKey: k + ":open" }); });
    head.appendChild(g);
  }
  const cbId = "lyr-" + k;
  const cb = document.createElement("input"); cb.type = "checkbox"; cb.id = cbId; cb.checked = l.visible !== false; cb.dataset.key = k + ":cb";
  const main = document.createElement("label"); main.className = "li-main"; main.htmlFor = cbId;
  const tt = document.createElement("span"); tt.className = "li-title"; tt.textContent = title; tt.title = title;
  main.appendChild(tt);
  head.appendChild(main);
  const sc = document.createElement("button"); sc.type = "button"; sc.className = "lyr-scale"; sc.dataset.key = k + ":scale";
  sc.innerHTML = calIcon("information"); sc.setAttribute("aria-label", S.outOfScaleShort + ": " + title); sc.setAttribute("aria-expanded", String(u.scale));
  const note = document.createElement("p"); note.className = "lyr-note"; note.id = "lyrnote-" + k; note.textContent = S.outOfScale; note.hidden = !u.scale;
  sc.setAttribute("aria-controls", note.id);
  sc.addEventListener("click", () => { u.scale = !u.scale; note.hidden = !u.scale; sc.setAttribute("aria-expanded", String(u.scale)); });
  head.appendChild(sc);
  const toolsId = "lyrtools-" + k;
  const tg = document.createElement("button"); tg.type = "button"; tg.className = "lyr-toggle"; tg.dataset.key = k + ":tools";
  tg.innerHTML = calIcon(u.collapsed ? "chevron-down" : "chevron-up"); tg.setAttribute("aria-expanded", String(!u.collapsed)); tg.setAttribute("aria-controls", toolsId);
  tg.setAttribute("aria-label", t("layerTools", { title })); tg.title = S.layerToolsTip;
  tg.addEventListener("click", () => { u.collapsed = !u.collapsed; renderLayers({ focusKey: k + ":tools" }); });
  head.appendChild(tg);
  head.appendChild(cb);
  const setState = () => {
    const oos = !sk && outOfScale(l);
    tt.classList.toggle("off", l.visible === false || oos);
    sc.hidden = !oos; if (!oos) note.hidden = true;
  };
  cb.addEventListener("change", () => { l.visible = cb.checked; setState(); markDirty(); });
  setState(); rowRefs.push(setState);
  li.append(head, note);

  const tools = document.createElement("div"); tools.className = "lyr-tools"; tools.id = toolsId; tools.hidden = u.collapsed;
  tools.setAttribute("role", "group"); tools.setAttribute("aria-label", t("layerTools", { title }));
  const extra = document.createElement("div"); extra.className = "lyr-extra";
  tools.appendChild(toolButton(k + ":zoom", calIcon("layer-zoom-to"), S.zoomTo, title, () => zoomToLayer(l)));
  if (sk) {   // a sketch layer: transparency, compare (2D), rename and remove
    tools.appendChild(toolButton(k + ":transp", calIcon("transparency"), S.adjustTransparency, title, () => { u.transp = !u.transp; renderLayers({ focusKey: k + ":transp" }); }, u.transp));
    if (state.mode === "2d") tools.appendChild(toolButton(k + ":swipe", calIcon("compare"), S.swipe, title, () => toggleSwipe(l), !!(swipe && swipe.layer === l)));
    if (SKETCH_LAYERS_ON) tools.appendChild(toolButton(k + ":rename", calIcon("pencil"), S.renameLayer, title, () => renameSketchLayer(l)));
    // the first layer can't be removed, only emptied; a further one goes, with its sketches
    tools.appendChild(toolButton(k + ":remove", calIcon("trash"), l === graphicsLayer ? S.removeSketches : S.removeLayer, title, () => removeSketches(l)));
  }
  if (!sk) {
    if (!group && LEGEND_TYPES.has(l.type)) tools.appendChild(toolButton(k + ":legend", calIcon("legend"), S.showLegend, title, () => { u.legend = !u.legend; renderLayers({ focusKey: k + ":legend" }); }, u.legend));
    tools.appendChild(toolButton(k + ":transp", calIcon("transparency"), S.adjustTransparency, title, () => { u.transp = !u.transp; renderLayers({ focusKey: k + ":transp" }); }, u.transp));
    if (!group && state.mode === "2d") tools.appendChild(toolButton(k + ":swipe", calIcon("compare"), S.swipe, title, () => toggleSwipe(l), !!(swipe && swipe.layer === l)));
    if (!group && TABLE_TYPES.has(l.type)) tools.appendChild(toolButton(k + ":table", calIcon("table"), S.table, title, () => openTable(l), !!(table && table.layer === l && table.kind !== "chart")));
    if (!group && chartsOf(l).length) tools.appendChild(toolButton(k + ":chart", calIcon("graph-bar"), S.chart, title, () => openChart(l), !!(table && table.layer === l && table.kind === "chart")));
    if (filterable(l)) {   // Filter: show only the features that meet some conditions (the button is marked when the layer has a filter)
      const on = hasFilter(l), fb = toolButton(k + ":filter", calIcon("filter"), on ? S.filterOn : S.filter, title, () => openFilter(l));
      if (on) fb.classList.add("on");
      tools.appendChild(fb);
    }
    tools.appendChild(toolButton(k + ":info", calIcon("information"), S.layerDescription, title, () => { u.info = !u.info; renderLayers({ focusKey: k + ":info" }); }, u.info));
    if (!group && hasLabels(l)) {
      const on = l.labelsVisible !== false;
      tools.appendChild(toolButton(k + ":labels", calIcon(on ? "label" : "label-off"), S.labels, title, () => { l.labelsVisible = !(l.labelsVisible !== false); markDirty(); renderLayers({ focusKey: k + ":labels" }); }, on));
    }
    if (dataLayers.includes(l)) {   // change the map style (type, colours, size, labels) of a spreadsheet layer
      const sb = toolButton(k + ":style", ICON_STYLE, S.changeStyle, title, () => editDataLayer(l));
      sb.dataset.styleFor = l.id; sb.classList.add("lt-svg");
      tools.appendChild(sb);
    }
    tools.appendChild(toolButton(k + ":remove", calIcon("trash"), S.removeLayer, title, () => removeLayer(l, owner, pos)));
  }
  li.appendChild(tools);
  if (!u.collapsed) {
    if (u.legend && !group && !sk) {
      const box = document.createElement("div"); box.className = "lyr-legend";
      extra.appendChild(box);
      const row = { el: null, gone: false, destroy() { this.gone = true; dropEl(this.el); } }; rowWidgets.push(row);
      toolEl("arcgis-legend", box, { view: state.view, layerInfos: [{ layer: l, title: "" }], ignoreLayerVisibility: true, hideLayersNotInCurrentView: false })
        .then((el) => { row.el = el; if (row.gone) dropEl(el); }).catch(() => { box.textContent = S.noLegend; });
    }
    if (u.transp) {
      const row = document.createElement("div"); row.className = "lyr-transp";
      const v = Math.round((1 - (typeof l.opacity === "number" ? l.opacity : 1)) * 100);
      const lo = document.createElement("span"); lo.textContent = "0%"; lo.setAttribute("aria-hidden", "true");
      const hi = document.createElement("span"); hi.textContent = "100%"; hi.setAttribute("aria-hidden", "true");
      const r = document.createElement("input"); r.type = "range"; r.min = "0"; r.max = "100"; r.step = "1"; r.value = String(v); r.dataset.key = k + ":range";
      r.setAttribute("aria-label", t("transparencyOf", { title })); r.setAttribute("aria-valuetext", v + "%");
      r.addEventListener("input", () => { const n = Number(r.value) || 0; l.opacity = Math.round((1 - n / 100) * 100) / 100; r.setAttribute("aria-valuetext", n + "%"); r.title = n + "%"; markDirty(); });
      r.title = v + "%";
      row.append(lo, r, hi);
      extra.appendChild(row);
    }
    if (u.info && !sk) { const box = document.createElement("div"); box.className = "lyr-info"; extra.appendChild(box); fillLayerInfo(l, box); }
    if (extra.childNodes.length) li.appendChild(extra);
  }
  if (group && u.open) {
    const ul = document.createElement("ul"); ul.className = "list lyr-subs";
    const subs = siblingsOf(l);
    subs.forEach((s, i) => ul.appendChild(layerRow(s, l, depth + 1, i, subs.length)));
    li.appendChild(ul);
  }
  return li;
}
// Remove all layers (Map layers, as in MapMaker): every layer in the list goes; sketches stay. It asks first, because
// the list can include a spreadsheet the person added, which isn't anywhere else until the map is saved.
// Remove on the sketch layer deletes every sketch. Sketches can't be added again as a layer from the collection can,
// so it asks first.
// What a save records about the sketch layers: the first one (its name only if renamed), then each further one.
export function sketchLayersMeta() {
  return sketchLayers.map((l) => ({ key: sketchKeyOfLayer(l), title: l === graphicsLayer && l.title === S.sketchLayer ? null : (l.title || null), visible: l.visible !== false, opacity: typeof l.opacity === "number" ? l.opacity : 1 }));
}
// The map's layers as drawn, bottom first, sketch layers among them.
export function layerOrderIds() {
  return activeMap().layers.toArray().filter((l) => l !== previewLayer).map((l) => l.id);
}
function removeSketches(l) {
  l = isSketch(l) ? l : graphicsLayer;
  const n = l.graphics.length, first = l === graphicsLayer, title = l.title || "";
  if (first && !n) return;
  if (n && !window.confirm(first ? t("removeSketchesConfirm", { n }) : t("removeSketchLayerConfirm", { title, n }))) return;
  if (state.activeSketch === l) { endSketchOps(); setSelection([]); }
  if (first) l.removeAll(); else removeSketchLayer(l);
  markDirty(); updateToolBadges();
  toast(first ? t("removedSketches", { n }) : t("removedLayer", { title }));
  if (!$("layersPanel").hidden) { renderLayers(); const h = $("layersH"); if (h) h.focus(); }
}
function renameSketchLayer(l) {
  const name = window.prompt(S.renameLayerPrompt, l.title || "");
  if (name == null) return;
  const clean = name.trim().slice(0, 200);
  if (!clean || clean === l.title) return;
  l.title = clean; markDirty(); syncSketchLayerPicker();
  renderLayers({ focusKey: keyOf(l) + ":rename" });
}
function removeAllLayers() {
  const list = siblingsOf("map").filter((l) => !isSketch(l));   // sketches stay
  if (!list.length || !window.confirm(t("removeAllConfirm", { n: list.length }))) return;
  for (const l of list) {
    endLayerTools(l);
    if (dataLayers.includes(l)) dataLayers.splice(dataLayers.indexOf(l), 1);
    else if (l.__item && portalLayers.get(l.__item.itemId) === l) portalLayers.delete(l.__item.itemId);
    removeFromMaps(l);
  }
  markDirty();
  toast(t("removedAllLayers", { n: list.length }));
  if (catalogLoaded) refreshCatalogButtons();
  renderLayers();
  const h = $("layersH"); if (h) h.focus();
}
$("layersRemoveAll").innerHTML = calIcon("trash");
$("layersRemoveAll").addEventListener("click", removeAllLayers);
function removeLayer(l, owner, pos) {
  const title = l.title || "";
  endLayerTools(l);
  if (dataLayers.includes(l)) { dataLayers.splice(dataLayers.indexOf(l), 1); removeFromMaps(l); }
  else if (l.__item && portalLayers.get(l.__item.itemId) === l) { removeFromMaps(l); portalLayers.delete(l.__item.itemId); }
  else if (owner !== "map") { try { owner.remove(l); } catch (e) { /* gone */ } }
  else removeFromMaps(l);
  markDirty();
  toast(t("removedLayer", { title }));
  if (catalogLoaded) refreshCatalogButtons();
  // focus the layer that took its place (or the one above it), else the panel heading
  const sibs = siblingsOf(owner), next = sibs[Math.min(pos, sibs.length - 1)];
  renderLayers({ focusKey: next ? keyOf(next) + ":remove" : (owner !== "map" ? keyOf(owner) + ":open" : null) });
  if (!next && owner === "map") { const h = $("layersH"); if (h) h.focus(); }
}
// Dragging a row by its handle: the rows of the same level make room, and the layer is dropped where the line shows.
function startDrag(e, l, owner, li) {
  if (e.button !== 0) return;
  const h = e.currentTarget, list = li.parentElement, y0 = e.clientY;
  let dragging = false, target = -1;
  const rows = () => [...list.children].filter((x) => x.classList.contains("lyr") && !x.classList.contains("fixed"));   // the sketch row stays on top
  const from = rows().indexOf(li);
  const clear = () => rows().forEach((r) => r.classList.remove("drop-before", "drop-after"));
  const move = (ev) => {
    if (!dragging && Math.abs(ev.clientY - y0) < 5) return;
    dragging = true; li.classList.add("dragging");
    const rs = rows();
    target = rs.length - 1;
    for (let i = 0; i < rs.length; i++) { const b = rs[i].getBoundingClientRect(); if (ev.clientY < b.top + b.height / 2) { target = i; break; } }
    clear();
    if (target !== from) { const r = rs[target]; r.classList.add(target < from ? "drop-before" : "drop-after"); }
  };
  const up = () => {
    h.removeEventListener("pointermove", move); h.removeEventListener("pointerup", up); h.removeEventListener("pointercancel", cancel);
    li.classList.remove("dragging"); clear();
    if (dragging && target >= 0 && target !== from) moveLayer(l, owner, target);
  };
  const cancel = () => { dragging = false; up(); };
  try { h.setPointerCapture(e.pointerId); } catch (err) { /* capture not available */ }
  h.addEventListener("pointermove", move); h.addEventListener("pointerup", up); h.addEventListener("pointercancel", cancel);
}
function updateScaleStates() { rowRefs.forEach((f) => f()); }
export let sketchRowShown = false;
export function renderLayers(opts) {
  { const ra = $("layersRemoveAll"); if (ra) ra.hidden = F.removeAllLayers === false || !siblingsOf("map").some((l) => !isSketch(l)); }
  opts = opts || {};
  const list = $("layersList");
  const ae = document.activeElement;
  const focusKey = opts.focusKey || ((opts.keepFocus || list.contains(ae)) && ae && ae.dataset ? ae.dataset.key : null);
  rowWidgets.forEach((w) => { try { w.destroy(); } catch (e) { /* gone */ } });
  rowWidgets = []; rowRefs = [];
  list.innerHTML = "";
  const top = siblingsOf("map");
  // The sketch layer is listed once something has been sketched: a map with no sketches has no sketch layer to show.
  sketchRowShown = graphicsLayer.graphics.length > 0;
  top.forEach((l, i) => list.appendChild(layerRow(l, "map", 0, i, top.length)));
  if (!top.length) { const p = document.createElement("li"); p.className = "empty"; p.textContent = S.noLayers; list.appendChild(p); }
  if (focusKey) { const el = list.querySelector('[data-key="' + focusKey + '"]'); if (el) el.focus(); }
  // labels show only once a layer has loaded its label classes: list again when the ones still loading are ready
  const pending = top.filter((l) => !l.loaded && l.when && !l.__lyrWaited);
  if (pending.length) {
    pending.forEach((l) => { l.__lyrWaited = true; });
    Promise.allSettled(pending.map((l) => l.when())).then(() => { if (!$("layersPanel").hidden) renderLayers({ keepFocus: true }); });
  }
}


