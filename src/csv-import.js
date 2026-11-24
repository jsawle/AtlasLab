// ============================================================ Add data and Change style
// Add data: a spreadsheet saved as CSV is read (lib/csv.js), placed by its coordinates or by the countries it names
// (features.countryData; lib/countries.js), shown on the map as a preview while it is styled, and added. Change style
// opens the same panel for a spreadsheet layer already on the map. Leaving with data not yet added asks first.
import "./item-info.js?v=5.0.0-beta.77";   // first: keeps the files running in the order they were written in (see app.js)
import { PALETTE_HEX, COLOR_RAMPS, DATA_STYLES, SHAPES, readCsv, buildLayerData, styleAvailable, pickAutoStyle, pickAutoFields, aliasOf,
  buildLayerDef, stateFromLayerDef, pieFields, PIE_MIN, PIE_MAX, isAreas } from "../lib/csv.js?v=5.0.0-beta.77";
import { countryIndex, detectCountryColumn, matchRows, normCountry, simplifyRings, insidePoint } from "../lib/countries.js?v=5.0.0-beta.77";
import { COUNTRIES } from "../lib/countries-data.js?v=5.0.0-beta.77";
import { FeatureLayer } from "./sdk.js?v=5.0.0-beta.77";
import { state } from "./state.js?v=5.0.0-beta.77";
import { SDK_VERSION, $, cfg, F, S, t } from "./config.js?v=5.0.0-beta.77";
import { hexToRgb } from "./branding.js?v=5.0.0-beta.77";
import { activeMap, frameTarget, goToSafe } from "./views.js?v=5.0.0-beta.77";
import { dataLayers, markDirty } from "./session.js?v=5.0.0-beta.77";
import { toast, openPanelName, openPanel, closePanels, openModal, closeModal } from "./ui.js?v=5.0.0-beta.77";
import { COLOUR_NAMES } from "./sketch.js?v=5.0.0-beta.77";
import { keepSketchOnTop, removeFromMaps } from "./maps.js?v=5.0.0-beta.77";
import { buildDataLayer, addDataLayer } from "./data-layers.js?v=5.0.0-beta.77";
import { endLayerTools } from "./layers-panel.js?v=5.0.0-beta.77";
import { handleDroppedFile } from "./drag-drop.js?v=5.0.0-beta.77";

export let previewLayer = null, previewTimer = 0, prePreviewCam = null, dataLayerSeq = 0;
const STYLE_TEXT_AREAS = { simple: ["styleAreaSimple", "styleAreaSimpleHint"], categorical: ["styleAreaType", "styleAreaTypeHint"], area_color: ["styleAreaColor", "styleAreaColorHint"] };
const styleText = (id) => (isAreas(state.addState) && STYLE_TEXT_AREAS[id]) || STYLE_TEXT[id] || STYLE_TEXT_AREAS[id];
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
/**
 * Reads a spreadsheet's text and goes on to the next step of Add data: style it when it has latitude and longitude,
 * place it by country when it has a column of countries (features.countryData), or ask which columns hold the
 * coordinates.
 * @param {string} name the file's name
 * @param {string} text the file's text
 * @returns {Promise<void>}
 */
export async function handleCsvText(name, text) {
  const parsed = readCsv(text, Number(cfg.csvMaxRows) || 1000, await loadHemisphereLetters());
  if (!parsed.ok) { showDataError(t(parsed.code, parsed.params)); return; }
  if (parsed.latIdx < 0 || parsed.lonIdx < 0) {
    // no coordinates: are the rows countries? (features.countryData)
    if (F.countryData) { const d = detectCountryColumn(parsed.header, parsed.rows, cIndex()); if (d.idx >= 0) { await continueCountry(name, parsed, d.idx, "point"); return; } }
    showLatLonPicker(name, parsed); return;
  }
  continueCsv(name, parsed, parsed.latIdx, parsed.lonIdx);
}
// ---- Rows placed by country (features.countryData, on by default; Countries 1.0). A file with no coordinates but a column of
// countries: each row is put at its country, as a point inside it or as its outline. The names are matched by
// lib/countries.js ("DRC", "D.R.C.", "Congo, Dem. Rep." are one country); the outlines come, when a file needs them, from
// Esri's World Countries (Generalized) layer, are thinned (lib/countries.js) and are kept for the rest of the visit.
const COUNTRY_LAYER = "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/World_Countries_(Generalized)/FeatureServer/0";
let countryIx = null, countrySeq = 0;
const countryGeoms = new Map();   // two-letter code -> { rings, point }
const cIndex = () => countryIx || (countryIx = countryIndex(COUNTRIES));
async function loadCountryGeoms(codes) {
  const need = codes.filter((k) => /^[A-Z]{2}$/.test(k) && !countryGeoms.has(k));
  if (!need.length) return;
  const r = await new FeatureLayer({ url: COUNTRY_LAYER }).queryFeatures({ where: "ISO IN (" + need.map((k) => "'" + k + "'").join(",") + ")", outFields: ["ISO"], returnGeometry: true, outSpatialReference: { wkid: 102100 } });
  const rings = new Map();   // a country can be several features (Spain and the Canaries)
  for (const f of r.features) { const k = f.attributes.ISO; if (!f.geometry || !f.geometry.rings) continue; if (!rings.has(k)) rings.set(k, []); rings.get(k).push(...f.geometry.rings); }
  for (const [k, list] of rings) { const s = simplifyRings(list), p = insidePoint(s); if (s.length && p) countryGeoms.set(k, { rings: s, point: p }); }
}
async function continueCountry(name, parsed, idx, shape) {
  const match = matchRows(parsed.rows, idx, cIndex());
  if (!match.matched) return false;
  const seq = ++countrySeq;
  toast(S.countriesFinding, 2500);
  try { await loadCountryGeoms(match.countries.map((c) => c.iso2)); }
  catch (e) { console.error(e); if (seq === countrySeq) showDataError(S.countriesFailed); return true; }
  if (seq !== countrySeq) return true;   // another file was dropped meanwhile
  placeCountries({ name, parsed, idx, match, shape }, true);
  return true;
}
function placeCountries(country, first) {
  const { name, parsed, match, shape } = country;
  const geometryOf = (r) => { const g = match.isoOf[r] ? countryGeoms.get(match.isoOf[r]) : null; return !g ? null : shape === "area" ? { rings: g.rings } : { x: g.point[0], y: g.point[1] }; };
  const data = buildLayerData(name, parsed, -1, -1, { geometryOf, keyIdx: country.idx });
  if (!data.ok) { showDataError(t(data.code, data.params)); return; }
  const keep = !first && state.addState ? state.addState.symbolChoices : null;
  restoreEditedLayer();
  state.addState = data;
  state.addState.country = country;
  state.addState.symbolChoices = keep || { shape: "esriSMSCircle", color: hexToRgb(PALETTE_HEX[0]), size: 12, ramp: "blue" };
  state.addState.style = pickAutoStyle(state.addState);
  state.addState.fieldChoices = pickAutoFields(state.addState.style, state.addState);
  removePreview(false);
  if (!prePreviewCam) { try { prePreviewCam = { center: [state.view.center.longitude, state.view.center.latitude], zoom: state.view.zoom, camera: state.mode === "3d" && state.view.camera ? state.view.camera.clone() : null }; } catch (e) { prePreviewCam = null; } }
  openPanel("data", first ? undefined : { focus: false });
  renderDataPanel();
  updatePreview(true);
}
function countrySummary(country) {
  const m = country.match, parts = [t("countryMatched", { n: m.matched, total: country.parsed.rows.length, column: country.parsed.header[country.idx] })];
  if (m.missed.length) parts.push(m.missed.length > 6 ? t("countryMissedMore", { names: m.missed.slice(0, 6).join(", "), n: m.missed.length - 6 }) : t("countryMissed", { names: m.missed.join(", ") }));
  if (m.empty) parts.push(t("countryEmpty", { n: m.empty }));
  if (country.parsed.rows.some((r) => normCountry(r[country.idx]) === "congo")) parts.push(S.countryCongo);
  return parts.join(" ");
}
for (const [id, shape] of [["countryAsPoint", "point"], ["countryAsArea", "area"]]) $(id).addEventListener("click", () => {
  const c = state.addState && state.addState.country;
  if (!c || c.shape === shape) return;
  placeCountries({ ...c, shape }, false); $(id).focus();
});
if (F.countryData) { const h = document.querySelector('[data-i18n="yourDataHint"]'); if (h) h.textContent = S.yourDataHintCountry; }
$("countryUse").addEventListener("click", async () => {
  if (!state.pendingParse) return;
  const p = state.pendingParse, idx = parseInt($("countrySel").value, 10);
  if (!(await continueCountry(p.name, p.parsed, idx, "point"))) { toast(S.pickCountryNone, 7000); return; }
  state.pendingParse = null;
});
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
  $("countryPick").hidden = !F.countryData;
  if (F.countryData) { const sel = $("countrySel"); sel.innerHTML = ""; parsed.header.forEach((h, i) => { const o = document.createElement("option"); o.value = String(i); o.textContent = h; sel.appendChild(o); }); }
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
/**
 * Change the style of a spreadsheet layer already on the map: the same panel, filled in from the layer's definition.
 * The layer is hidden while the preview shows; Cancel puts it back, Apply replaces it in the same place with the same
 * id.
 * @param {FeatureLayer} layer a spreadsheet layer (one with _srcDef)
 */
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
/**
 * Opens Map layers again after Change style, with the focus back on that layer's style button.
 * @param {string} layerId
 */
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
  const areas = isAreas(state.addState), country = !editing && state.addState.country;
  $("countryBox").hidden = !country;
  if (country) { $("countrySummary").textContent = countrySummary(country); $("countryAsPoint").setAttribute("aria-pressed", String(country.shape !== "area")); $("countryAsArea").setAttribute("aria-pressed", String(country.shape === "area")); }
  $("symH").textContent = areas ? S.areas : S.points; $("sizeRow").hidden = areas;
  let s = t(areas ? "dataSummaryAreas" : "dataSummary", { n: state.addState.features.length, num: state.addState.numeric.length, cat: (state.addState.categoricalText || state.addState.categorical).length });
  if (state.addState.dropped && !country) s += " " + t("dataSkipped", { n: state.addState.dropped });
  $("dataSummary").textContent = s;
  $("dataSize").value = state.addState.symbolChoices.size; $("dataSizeVal").textContent = state.addState.symbolChoices.size + " px";
  renderStyleList(); renderFieldRows(); renderSymbolBlocks();
}
/**
 * Draws the list of styles in Add data: the area styles for countries placed as outlines, the point styles otherwise.
 */
export function renderStyleList() {
  const wrap = $("styleList"); wrap.innerHTML = "";
  for (const style of DATA_STYLES) {
    if (isAreas(state.addState) ? !STYLE_TEXT_AREAS[style.id] : !!style.areas) continue;   // areas and points each have their own styles
    // Pie charts only draw in 2D, so in the 3D view they aren't offered (a layer that is already pie charts keeps its choice).
    const not3d = style.id === "pie_chart" && state.mode === "3d" && state.addState.style.id !== "pie_chart";
    const ok = styleAvailable(style, state.addState) && !not3d;
    const b = document.createElement("button"); b.type = "button"; b.className = "style-card"; b.disabled = !ok;
    b.setAttribute("aria-pressed", String(state.addState.style.id === style.id));
    b.title = ok ? S[styleText(style.id)[1]] : (not3d && styleAvailable(style, state.addState) ? S.pieOnly2d : S.styleNeeds);
    b.innerHTML = '<span class="s-ico" aria-hidden="true">' + style.icon + '</span><span class="s-name"></span>';
    b.querySelector(".s-name").textContent = S[styleText(style.id)[0]];
    if (ok) b.addEventListener("click", () => { state.addState.style = style; state.addState.fieldChoices = pickAutoFields(style, state.addState); renderStyleList(); renderFieldRows(); renderSymbolBlocks(); });
    wrap.appendChild(b);
  }
  $("styleDesc").textContent = S[styleText(state.addState.style.id)[0]] + " — " + S[styleText(state.addState.style.id)[1]];
}
function fieldOptions(key) {
  if (key === "size") return state.addState.numeric;
  if (key === "color") return state.addState.style.id === "numeric_color_size" || state.addState.style.id === "area_color" ? state.addState.numeric : state.addState.categorical;
  return state.addState.fields.filter((f) => f.type !== "esriFieldTypeOID" && !state.addState.coordNames.includes(f.name)).map((f) => f.name);
}
/**
 * Draws the rows of the columns chosen for the style (one per column, with its own controls).
 */
export function renderFieldRows() {
  const wrap = $("fieldRows"); wrap.innerHTML = "";
  state.addState.style.fields.forEach((key, i) => {
    const id = "fld-" + key + "-" + i;
    const lbl = document.createElement("label"); lbl.className = "lbl"; lbl.htmlFor = id; lbl.textContent = isAreas(state.addState) ? (key === "label" ? S.labelByArea : state.addState.style.id === "area_color" ? S.shadeByArea : S.colorByArea) : S[FIELD_LABEL[key]];
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
  const ramp = (state.addState.style.id === "numeric_color_size" || state.addState.style.id === "area_color") && !!state.addState.fieldChoices.color;
  $("shapeRow").hidden = isPie || isAreas(state.addState); $("colorRow").hidden = isPie || !single; $("rampRow").hidden = !ramp;
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
    case "area_color": s = t("sumAreaShade", { color: A(c.color) }); break;
    default: s = S.sumSimple;
  }
  if (isAreas(state.addState)) { if (state.addState.style.id === "simple") s = S.sumAreaSimple; else if (state.addState.style.id === "categorical") s = t("sumAreaType", { color: A(c.color) }); }
  if (c.label) s += t("sumLabels", { label: A(c.label) });
  $("cfgSummary").textContent = s;
}
/**
 * Takes the preview of the data off the map.
 * @param {boolean} restoreCam true goes back to where the map was looking before the preview
 */
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
  toast(t(def.geometryType === "polygon" ? "addedAreas" : "addedPoints", { n }));
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
/**
 * What would be lost by leaving Add data now: data not yet on the map, or a style changed but not applied.
 * @returns {{style: boolean, title: string}|null} null when nothing would be lost
 */
export function unfinishedData() {
  if (openPanelName !== "data") return null;
  if (state.addState && state.addState.editing) return styleDef() === styleAtStart ? null : { style: true, title: state.addState.editing.layer.title || "" };
  if (state.addState) return { style: false, title: state.addState.fileName || "" };
  if (state.pendingParse && !$("llPicker").hidden) return { style: false, title: state.pendingParse.name || "" };
  return null;
}
/**
 * Runs next straight away when nothing in Add data would be lost; otherwise asks first, and runs it only if the student
 * agrees to lose it.
 * @param {function} next
 */
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

