// ============================================================ CSV import (configure panel with live preview)
import "./item-info.js?v=5.0.0-beta.42";   // first: keeps the files running in the order they were written in (see app.js)
import { PALETTE_HEX, COLOR_RAMPS, DATA_STYLES, SHAPES, readCsv, buildLayerData, styleAvailable, pickAutoStyle, pickAutoFields, aliasOf,
  buildLayerDef, stateFromLayerDef, pieFields, PIE_MIN, PIE_MAX } from "../lib/csv.js?v=5.0.0-beta.42";
import { state } from "./state.js?v=5.0.0-beta.42";
import { SDK_VERSION, $, cfg, F, S, t } from "./config.js?v=5.0.0-beta.42";
import { hexToRgb } from "./branding.js?v=5.0.0-beta.42";
import { activeMap, frameTarget, goToSafe } from "./views.js?v=5.0.0-beta.42";
import { dataLayers, markDirty } from "./session.js?v=5.0.0-beta.42";
import { toast, openPanelName, openPanel, closePanels, openModal, closeModal } from "./ui.js?v=5.0.0-beta.42";
import { COLOUR_NAMES } from "./sketch.js?v=5.0.0-beta.42";
import { keepSketchOnTop, removeFromMaps } from "./maps.js?v=5.0.0-beta.42";
import { buildDataLayer, addDataLayer } from "./data-layers.js?v=5.0.0-beta.42";
import { endLayerTools } from "./layers-panel.js?v=5.0.0-beta.42";
import { handleDroppedFile } from "./drag-drop.js?v=5.0.0-beta.42";

export let previewLayer = null, previewTimer = 0, prePreviewCam = null, dataLayerSeq = 0;
const STYLE_TEXT = { simple: ["styleSimple", "styleSimpleHint"], categorical: ["styleCategorical", "styleCategoricalHint"], graduated: ["styleGraduated", "styleGraduatedHint"],
  numeric_color_size: ["styleNumericColorSize", "styleNumericColorSizeHint"], categorical_size: ["styleCategoricalSize", "styleCategoricalSizeHint"], pie_chart: ["stylePie", "stylePieHint"] };
const FIELD_LABEL = { color: "colorBy", size: "sizeBy", label: "labelBy" };
const NONE = "__none__";
function showDataError(msg) {
  restoreEditedLayer(); state.addState = null; removePreview(true);
  openPanel("data");
  $("dataH").textContent = S.addData;
  $("dataError").textContent = msg; $("dataError").hidden = false;
  $("llPicker").hidden = true; $("dataControls").hidden = true; $("dataSubmit").disabled = true;
}
// The hemisphere letters the map's Coordinates tool writes in this app's language (from the SDK's own translations),
// so a column copied from that tool reads correctly: N/S/E/W in English, O for west in Spanish, O for east in German...
let hemisphereLetters = null;
async function loadHemisphereLetters() {
  if (hemisphereLetters) return hemisphereLetters;
  // Read from the Coordinates component's own translation file. (Not through the SDK's message bundles: asking those for
  // the old widget's bundle left it cached, and the component was then handed it and failed its first drawing.)
  hemisphereLetters = {};
  const loc = String(cfg.locale || "en"), tries = [...new Set([loc, loc.split("-")[0], "en"])];
  for (const l of tries) {
    try {
      const r = await fetch(`https://js.arcgis.com/${SDK_VERSION}/map-components/assets/coordinate-conversion/t9n/messages.${l}.json`);
      if (!r.ok) continue;
      const m = await r.json(); if (m && m.abbreviatedDirections) { hemisphereLetters = m.abbreviatedDirections; break; }
    } catch (e) { console.warn("Hemisphere letters not loaded; English letters only", e); }
  }
  return hemisphereLetters;
}
export async function handleCsvText(name, text) {
  const parsed = readCsv(text, Number(cfg.csvMaxRows) || 1000, await loadHemisphereLetters());
  if (!parsed.ok) { showDataError(t(parsed.code, parsed.params)); return; }
  if (parsed.latIdx < 0 || parsed.lonIdx < 0) { showLatLonPicker(name, parsed); return; }
  continueCsv(name, parsed, parsed.latIdx, parsed.lonIdx);
}
function showLatLonPicker(name, parsed) {
  restoreEditedLayer(); state.addState = null; removePreview(true);
  state.pendingParse = { name, parsed };
  openPanel("data");
  $("dataH").textContent = S.addData;
  $("dataError").hidden = true; $("dataControls").hidden = true; $("dataSubmit").disabled = true; $("llPicker").hidden = false;
  for (const [id, guess] of [["latSel", parsed.latIdx], ["lonSel", parsed.lonIdx]]) {
    const sel = $(id); sel.innerHTML = "";
    parsed.header.forEach((h, i) => { const o = document.createElement("option"); o.value = String(i); o.textContent = h; sel.appendChild(o); });
    sel.value = String(guess >= 0 ? guess : (id === "lonSel" && parsed.header.length > 1 ? 1 : 0));
  }
}
$("llUse").addEventListener("click", () => {
  if (!state.pendingParse) return;
  const la = parseInt($("latSel").value, 10), lo = parseInt($("lonSel").value, 10);
  // the same column in both boxes: it holds both coordinates (copied from the Coordinates tool, say)
  if (la === lo && !buildLayerData(state.pendingParse.name, state.pendingParse.parsed, la, lo).ok) { toast(S.pickOneColumn, 7000); return; }
  const p = state.pendingParse; state.pendingParse = null;
  continueCsv(p.name, p.parsed, la, lo);
});
function continueCsv(name, parsed, latIdx, lonIdx) {
  const data = buildLayerData(name, parsed, latIdx, lonIdx);
  if (!data.ok) { showDataError(t(data.code, data.params)); return; }
  restoreEditedLayer();
  state.addState = data;
  state.addState.src = { name, parsed, latIdx, lonIdx };   // for Swap latitude and longitude
  state.addState.symbolChoices = { shape: "esriSMSCircle", color: hexToRgb(PALETTE_HEX[0]), size: 12, ramp: "blue" };
  state.addState.style = pickAutoStyle(state.addState);
  state.addState.fieldChoices = pickAutoFields(state.addState.style, state.addState);
  removePreview(false);
  if (!prePreviewCam) { try { prePreviewCam = { center: [state.view.center.longitude, state.view.center.latitude], zoom: state.view.zoom, camera: state.mode === "3d" && state.view.camera ? state.view.camera.clone() : null }; } catch (e) { prePreviewCam = null; } }
  openPanel("data");
  renderDataPanel();
  updatePreview(true);
}
// Change the style of a spreadsheet layer already on the map: the same panel, filled in from the layer's definition.
// The layer is hidden while the preview shows; Cancel puts it back, Apply replaces it in the same place with the same id.
export function editDataLayer(layer) {
  if (openPanelName === "data") closePanels(false);
  const st = stateFromLayerDef(layer._srcDef);
  if (!st.ok) { toast(S.styleCantChange); return; }
  st.editing = { layer, wasVisible: layer.visible !== false };
  state.addState = st;
  removePreview(false); prePreviewCam = null;
  layer.visible = false;
  openPanel("data");
  renderDataPanel();
  styleAtStart = styleDef();   // so leaving without changing anything doesn't ask
}
function restoreEditedLayer() { if (state.addState && state.addState.editing) state.addState.editing.layer.visible = state.addState.editing.wasVisible; }
export function backToLayers(layerId) {
  openPanel("layers", { focus: false });
  const b = [...$("layersList").querySelectorAll("[data-style-for]")].find((x) => x.dataset.styleFor === layerId);
  if (b) b.focus(); else { const h = $("layersH"); if (h) h.focus(); }
}
function renderDataPanel() {
  const editing = !!state.addState.editing;
  $("dataH").textContent = editing ? t("changeStyleTitle", { title: state.addState.editing.layer.title || "" }) : S.dataLooksGood;
  $("dataSubmit").textContent = editing ? S.applyStyle : S.addToMap;
  $("swapRow").hidden = editing || !state.addState.src || state.addState.swappable === false;   // in Change style the points are already placed
  $("dataError").hidden = true; $("llPicker").hidden = true; $("dataControls").hidden = false; $("dataSubmit").disabled = false;
  // categories counted as text columns only: number codes are offered under "By type" but are counted as numbers
  let s = t("dataSummary", { n: state.addState.features.length, num: state.addState.numeric.length, cat: (state.addState.categoricalText || state.addState.categorical).length });
  if (state.addState.dropped) s += " " + t("dataSkipped", { n: state.addState.dropped });
  $("dataSummary").textContent = s;
  $("dataSize").value = state.addState.symbolChoices.size; $("dataSizeVal").textContent = state.addState.symbolChoices.size + " px";
  renderStyleList(); renderFieldRows(); renderSymbolBlocks();
}
export function renderStyleList() {
  const wrap = $("styleList"); wrap.innerHTML = "";
  for (const style of DATA_STYLES) {
    // Pie charts only draw in 2D, so in the 3D view they aren't offered (a layer that is already pie charts keeps its choice).
    const not3d = style.id === "pie_chart" && state.mode === "3d" && state.addState.style.id !== "pie_chart";
    const ok = styleAvailable(style, state.addState) && !not3d;
    const b = document.createElement("button"); b.type = "button"; b.className = "style-card"; b.disabled = !ok;
    b.setAttribute("aria-pressed", String(state.addState.style.id === style.id));
    b.title = ok ? S[STYLE_TEXT[style.id][1]] : (not3d && styleAvailable(style, state.addState) ? S.pieOnly2d : S.styleNeeds);
    b.innerHTML = '<span class="s-ico" aria-hidden="true">' + style.icon + '</span><span class="s-name"></span>';
    b.querySelector(".s-name").textContent = S[STYLE_TEXT[style.id][0]];
    if (ok) b.addEventListener("click", () => { state.addState.style = style; state.addState.fieldChoices = pickAutoFields(style, state.addState); renderStyleList(); renderFieldRows(); renderSymbolBlocks(); });
    wrap.appendChild(b);
  }
  $("styleDesc").textContent = S[STYLE_TEXT[state.addState.style.id][0]] + " — " + S[STYLE_TEXT[state.addState.style.id][1]];
}
function fieldOptions(key) {
  if (key === "size") return state.addState.numeric;
  if (key === "color") return state.addState.style.id === "numeric_color_size" ? state.addState.numeric : state.addState.categorical;
  return state.addState.fields.filter((f) => f.type !== "esriFieldTypeOID" && !state.addState.coordNames.includes(f.name)).map((f) => f.name);
}
export function renderFieldRows() {
  const wrap = $("fieldRows"); wrap.innerHTML = "";
  state.addState.style.fields.forEach((key, i) => {
    const id = "fld-" + key + "-" + i;
    const lbl = document.createElement("label"); lbl.className = "lbl"; lbl.htmlFor = id; lbl.textContent = S[FIELD_LABEL[key]];
    const sel = document.createElement("select"); sel.className = "field"; sel.id = id;
    if (key === "label") { const o = document.createElement("option"); o.value = NONE; o.textContent = S.none; sel.appendChild(o); }
    for (const name of fieldOptions(key)) { const o = document.createElement("option"); o.value = name; o.textContent = aliasOf(state.addState, name); sel.appendChild(o); }
    const cur = state.addState.fieldChoices[key];
    sel.value = cur == null ? (key === "label" ? NONE : sel.value) : cur;
    if (key !== "label" && cur == null && sel.options.length) state.addState.fieldChoices[key] = sel.value;
    sel.addEventListener("change", () => { state.addState.fieldChoices[key] = sel.value === NONE ? null : sel.value; renderSymbolBlocks(); });
    wrap.append(lbl, sel);
  });
  if (state.addState.style.id === "pie_chart") wrap.appendChild(pieColumnsBox());
  // Offered in the 3D view only: in 2D it would change nothing on screen. A layer that has it keeps it while styled in 2D.
  if (F.columns3d === true && state.mode === "3d" && state.addState.style.fields.includes("size") && state.addState.style.id !== "pie_chart") {
    const row = document.createElement("div"); row.className = "pie-col col3d";
    const cb = document.createElement("input"); cb.type = "checkbox"; cb.id = "columns3dBox"; cb.checked = !!state.addState.columns3d;
    cb.setAttribute("aria-describedby", "columns3dHint");
    const lb = document.createElement("label"); lb.htmlFor = cb.id; lb.textContent = S.columns3d;
    const hint = document.createElement("p"); hint.className = "hint"; hint.id = "columns3dHint"; hint.textContent = S.columns3dHint;
    cb.addEventListener("change", () => { state.addState.columns3d = cb.checked; renderSymbolBlocks(); });
    row.append(cb, lb); wrap.append(row, hint);
  }
}
// Which number columns make up each pie (2 to 8); each pie is sized by the total of those columns only.
function pieColumnsBox() {
  const c = state.addState.fieldChoices;
  c.pie = pieFields(state.addState);
  const fs = document.createElement("fieldset"); fs.className = "pie-cols";
  const lg = document.createElement("legend"); lg.textContent = S.pieColumns;
  const hint = document.createElement("p"); hint.className = "hint"; hint.id = "pieColsHint"; hint.textContent = t("pieColumnsHint", { min: PIE_MIN, max: PIE_MAX });
  fs.setAttribute("aria-describedby", "pieColsHint");
  fs.append(lg, hint);
  const boxes = [];
  const sync = () => { const n = c.pie.length; boxes.forEach((b) => { b.disabled = (b.checked && n <= PIE_MIN) || (!b.checked && n >= PIE_MAX); }); };
  state.addState.numeric.forEach((name, i) => {
    const row = document.createElement("div"); row.className = "pie-col";
    const cb = document.createElement("input"); cb.type = "checkbox"; cb.id = "pieCol" + i; cb.value = name; cb.checked = c.pie.includes(name);
    const lb = document.createElement("label"); lb.htmlFor = cb.id; lb.textContent = aliasOf(state.addState, name);
    cb.addEventListener("change", () => {
      c.pie = state.addState.numeric.filter((n) => (n === name ? cb.checked : c.pie.includes(n)));
      sync(); renderSymbolBlocks();
    });
    boxes.push(cb); row.append(cb, lb); fs.appendChild(row);
  });
  sync();
  return fs;
}
$("dataSwap").addEventListener("click", () => {
  if (!state.addState || !state.addState.src || state.addState.editing) return;
  const { name, parsed, latIdx, lonIdx, swapped } = state.addState.src;
  const pair = latIdx === lonIdx;   // one column with both: turn its order round instead of swapping columns
  const data = pair ? buildLayerData(name, parsed, latIdx, lonIdx, { swapped: !swapped }) : buildLayerData(name, parsed, lonIdx, latIdx);
  if (!data.ok) { toast(S.swapNoPoints, 6000); return; }
  const before = state.addState;
  data.src = pair ? { name, parsed, latIdx, lonIdx, swapped: !swapped } : { name, parsed, latIdx: lonIdx, lonIdx: latIdx };
  data.symbolChoices = before.symbolChoices;
  const keepStyle = styleAvailable(before.style, data);
  data.style = keepStyle ? before.style : pickAutoStyle(data);
  data.fieldChoices = keepStyle ? before.fieldChoices : pickAutoFields(data.style, data);
  state.addState = data;
  renderDataPanel();
  updatePreview(true);
  toast(t("swappedLatLon", { n: data.features.length }));
  $("dataSwap").focus();
});
function renderSymbolBlocks() {
  const c = state.addState.symbolChoices, isPie = state.addState.style.id === "pie_chart";
  const single = state.addState.style.id === "simple" || state.addState.style.id === "graduated";
  const ramp = state.addState.style.id === "numeric_color_size" && !!state.addState.fieldChoices.color;
  $("shapeRow").hidden = isPie; $("colorRow").hidden = isPie || !single; $("rampRow").hidden = !ramp;
  const sw = $("shapeOptions"); sw.innerHTML = "";
  for (const s of SHAPES) {
    const b = document.createElement("button"); b.type = "button"; b.className = "shape-btn"; b.textContent = s.glyph;
    b.setAttribute("aria-label", s.id.replace("esriSMS", "")); b.setAttribute("aria-pressed", String(c.shape === s.id));
    b.addEventListener("click", () => { c.shape = s.id; renderSymbolBlocks(); }); sw.appendChild(b);
  }
  const cw = $("dataSwatches"); cw.innerHTML = "";
  PALETTE_HEX.forEach((hex, i) => {
    const rgb = hexToRgb(hex);
    const b = document.createElement("button"); b.type = "button"; b.className = "swatch"; b.style.background = hex;
    b.setAttribute("aria-label", (COLOUR_NAMES[i] || hex).trim()); b.setAttribute("aria-pressed", String(c.color.join(",") === rgb.join(",")));
    b.addEventListener("click", () => { c.color = rgb; renderSymbolBlocks(); }); cw.appendChild(b);
  });
  const rl = $("rampList"); rl.innerHTML = "";
  if (ramp) for (const r of COLOR_RAMPS) {
    const b = document.createElement("button"); b.type = "button"; b.className = "ramp-btn"; b.setAttribute("aria-label", r.name); b.title = r.name;
    b.setAttribute("aria-pressed", String(c.ramp === r.id));
    b.style.background = "linear-gradient(" + (c.rampReverse ? 270 : 90) + "deg," + r.colors.map((col) => "rgb(" + col.join(",") + ")").join(",") + ")";   // drawn low to high, as it will be used
    b.addEventListener("click", () => { c.ramp = r.id; renderSymbolBlocks(); }); rl.appendChild(b);
  }
  $("rampRevRow").hidden = !ramp; $("rampReverse").checked = !!c.rampReverse;
  updateConfigSummary();
  updatePreview(false);
}
$("rampReverse").addEventListener("change", () => { if (state.addState) { state.addState.symbolChoices.rampReverse = $("rampReverse").checked; renderSymbolBlocks(); } });
function updateConfigSummary() {
  const c = state.addState.fieldChoices, A = (n) => (n ? aliasOf(state.addState, n) : "—");
  const numColor = state.addState.style.id === "numeric_color_size";
  let s;
  switch (state.addState.style.id) {
    case "pie_chart": s = t("sumPie", { n: pieFields(state.addState).length }); break;
    case "numeric_color_size": s = t("sumColorSize", { color: A(c.color), size: A(c.size) }); break;
    case "categorical_size": s = t(numColor ? "sumColorSize" : "sumTypeSize", { color: A(c.color), size: A(c.size) }); break;
    case "categorical": s = t(numColor ? "sumShade" : "sumType", { color: A(c.color) }); break;
    case "graduated": s = t("sumSize", { size: A(c.size) }); break;
    default: s = S.sumSimple;
  }
  if (c.label) s += t("sumLabels", { label: A(c.label) });
  $("cfgSummary").textContent = s;
}
export function removePreview(restoreCam) {
  clearTimeout(previewTimer); previewTimer = 0;
  if (previewLayer) { removeFromMaps(previewLayer); previewLayer = null; }
  if (restoreCam && prePreviewCam) goToSafe(state.mode === "3d" && prePreviewCam.camera ? prePreviewCam.camera : { center: prePreviewCam.center, zoom: prePreviewCam.zoom }, { animate: false });   // in 3D: the tilt and heading too
  if (restoreCam) prePreviewCam = null;
}
function updatePreview(frame) {
  if (!state.addState) return;
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => {
    previewTimer = 0;
    if (!state.addState) return;
    if (previewLayer) { removeFromMaps(previewLayer); previewLayer = null; }
    let fl;
    try { fl = buildDataLayer(buildLayerDef(state.addState, "csvPreview")); } catch (e) { console.error(e); return; }
    previewLayer = fl; activeMap().add(fl); keepSketchOnTop();
    if (frame) fl.when().then(() => fl.queryExtent()).then((r) => { if (r && r.extent) goToSafe(frameTarget(r.extent.expand(1.2)), { animate: false }); }).catch(() => {});
  }, frame ? 0 : 200);
}
function submitData() {
  if (!state.addState) { closePanels(); return; }
  if (state.addState.editing) { applyStyleEdit(); return; }
  const def = buildLayerDef(state.addState, "csv" + Date.now().toString(36) + (++dataLayerSeq));
  const n = state.addState.features.length;
  removePreview(false); prePreviewCam = null;
  let fl;
  try { fl = addDataLayer(def); } catch (e) { console.error(e); toast(S.layerFailed.replace("{title}", def.title)); return; }
  state.addState = null;
  closePanels();
  fl.when().then(() => fl.queryExtent()).then((r) => { if (r && r.extent) goToSafe(frameTarget(r.extent.expand(1.2)), { animate: false }); }).catch(() => {});
  toast(t("addedPoints", { n }));
}
function applyStyleEdit() {
  const { layer: old, wasVisible } = state.addState.editing, src = old._srcDef;
  endLayerTools(old);
  const def = buildLayerDef(state.addState, src.id, src.title || old.title);
  removePreview(false);
  let fl;
  try { fl = buildDataLayer(def); } catch (e) { console.error(e); toast(S.styleCantChange); return; }
  fl.visible = wasVisible; fl.opacity = old.opacity; fl.definitionExpression = old.definitionExpression;
  const m = activeMap(), at = m.layers.indexOf(old);
  dataLayers[dataLayers.indexOf(old)] = fl;
  removeFromMaps(old);
  if (at >= 0) m.add(fl, at); else m.add(fl);
  keepSketchOnTop();
  state.addState = null;   // so closing the panel doesn't put the old layer back
  markDirty();
  closePanels(false);
  backToLayers(fl.id);
  toast(t("styleChanged", { title: fl.title }));
}
$("dataSubmit").addEventListener("click", submitData);
$("dataCancel").addEventListener("click", () => closePanels());
$("dataClose").addEventListener("click", () => closePanels());

// Opening another tool while Add data holds a file that isn't on the map yet (or Change style holds changes that
// aren't applied) would lose that work, so ask first. Cancel, × and Escape in the panel itself discard straight away.
let leaveNext = null, styleAtStart = null;
function styleDef() {
  try { const ed = state.addState.editing, src = ed.layer._srcDef; return JSON.stringify(buildLayerDef(state.addState, src.id, src.title || ed.layer.title)); }
  catch (e) { return null; }
}
export function unfinishedData() {
  if (openPanelName !== "data") return null;
  if (state.addState && state.addState.editing) return styleDef() === styleAtStart ? null : { style: true, title: state.addState.editing.layer.title || "" };
  if (state.addState) return { style: false, title: state.addState.fileName || "" };
  if (state.pendingParse && !$("llPicker").hidden) return { style: false, title: state.pendingParse.name || "" };
  return null;
}
export function leaveData(next) {
  const u = unfinishedData();
  if (!u) { next(); return; }
  leaveNext = next;
  $("leaveH").textContent = u.style ? S.leaveStyleTitle : S.leaveDataTitle;
  $("leaveText").textContent = t(u.style ? "leaveStyleText" : "leaveDataText", { title: u.title });
  $("leaveDiscard").textContent = u.style ? S.discardChanges : S.discardData;
  openModal("leaveModal", $("leaveKeep"));
}
$("leaveDiscard").addEventListener("click", () => {
  const next = leaveNext; leaveNext = null;
  closeModal("leaveModal");
  closePanels(false);
  if (next) next();
});
$("dataSize").addEventListener("input", () => {
  const v = parseInt($("dataSize").value, 10) || 12;
  $("dataSizeVal").textContent = v + " px";
  if (state.addState) { state.addState.symbolChoices.size = v; updateConfigSummary(); updatePreview(false); }
});
function pickCsv() {
  const input = document.createElement("input"); input.type = "file"; input.accept = ".csv,text/csv,.txt";
  input.addEventListener("change", () => { const f = input.files && input.files[0]; if (f) { closeModal("addModal"); handleDroppedFile(f); } });
  input.click();
}
$("csvPick").addEventListener("click", pickCsv);

