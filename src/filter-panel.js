// ============================================================ Filter (lab)
// A Filter panel for one layer, laid out like Map Viewer's: "Show features where", then conditions (field, condition,
// value), a histogram with a slider for number fields, Add new, and Apply / Cancel. It is built from Esri's Calcite
// components and the SDK's Histogram and Slider components; Map Viewer's filter panel itself isn't published as a component.
// The filter is saved as the layer's definitionExpression (lib/filter.js), which is how Map Viewer saves one.
// While the panel is open the map previews the conditions through the layer view (no data is fetched again as a
// slider moves), and the layer itself shows everything, so the histogram, value lists and counts cover all the data.
import "./layers-panel.js?v=5.0.0-beta.44";   // first: keeps the files running in the order they were written in (see app.js)
import { MAX_CONDITIONS, OPERATORS, DEFAULT_OPERATOR, fieldKind, needsValue, conditionComplete, buildWhere, parseWhere, filterFields, isListOp } from "../lib/filter.js?v=5.0.0-beta.44";
import { state } from "./state.js?v=5.0.0-beta.44";
import { $, fmt, cfg, F, S, t } from "./config.js?v=5.0.0-beta.44";
import { hexToRgb } from "./branding.js?v=5.0.0-beta.44";
import { reactiveUtils } from "./sdk.js?v=5.0.0-beta.44";
import { isSketch } from "./views.js?v=5.0.0-beta.44";
import { markDirty } from "./session.js?v=5.0.0-beta.44";
import { toast, openPanelName, openPanel, closePanels } from "./ui.js?v=5.0.0-beta.44";
import { calIcon, TABLE_TYPES, keyOf, isGroup } from "./layers-panel.js?v=5.0.0-beta.44";
import { previewLayer } from "./csv-import.js?v=5.0.0-beta.44";

const FILTER_ON = F.filter !== false;
let filterState = null;
const filterOrigin = new WeakMap();   // the filter each layer had when its panel was first opened ("" for none)
export const filterable = (l) => FILTER_ON && !!l && !isGroup(l) && l !== previewLayer && !isSketch(l) && TABLE_TYPES.has(l.type) && "definitionExpression" in l;
export const filterText = (l) => (typeof l.definitionExpression === "string" ? l.definitionExpression.trim() : "");
export const hasFilter = (l) => { const s = filterText(l); return !!s && !/^1\s*=\s*1$/.test(s); };
const fmtNum = (n) => { try { return Number(n).toLocaleString(cfg.locale || "en"); } catch (e) { return String(n); } };
function popupFieldNames(l) {
  const names = [], pt = l.popupTemplate;
  const take = (list) => (list || []).forEach((fi) => { if (fi && fi.fieldName && fi.visible !== false) names.push(fi.fieldName); });
  if (pt) { take(pt.fieldInfos); (Array.isArray(pt.content) ? pt.content : []).forEach((el) => { if (el && el.type === "fields") take(el.fieldInfos); }); }
  return names;
}
const filterField = (name) => filterState.all.find((f) => f.name === name);
function newCondition() {
  const f = filterState.fields[0], kind = fieldKind(f);
  return { field: f.name, op: DEFAULT_OPERATOR[kind], value: "", value2: "", values: [] };
}
export async function openFilter(l) {
  if (openPanelName === "filter") closePanels(false);
  try { await l.load(); } catch (e) { console.error(e); toast(S.filterCantOpen); return; }
  const all = (l.fields || []).filter((f) => fieldKind(f));
  const original = filterText(l);
  if (!filterOrigin.has(l)) filterOrigin.set(l, hasFilter(l) ? original : "");
  const parsed = parseWhere(original, all);
  const offered = filterFields(l.fields || [], popupFieldNames(l), l.objectIdField);
  for (const c of parsed.conditions) { const f = all.find((x) => x.name === c.field); if (f && !offered.includes(f)) offered.push(f); }   // a field the map's own filter uses
  if (!offered.length) { toast(S.filterNoFields, 5000); return; }
  // The map previews a condition in the browser, against the fields the layer has loaded, and a layer loads only the
  // fields it draws with. So the fields the panel offers are asked for here; without this a condition on any other
  // field (Depth, on a layer drawn by Magnitude) changed the count but not the map. (Filter 1.1)
  if ("outFields" in l) {
    const have = Array.isArray(l.outFields) ? l.outFields : [];
    const add = offered.map((f) => f.name).filter((n) => !have.includes(n));
    if (!have.includes("*") && add.length) l.outFields = [...have, ...add];
  }
  const st = filterState = { layer: l, all, fields: offered, original, base: parsed.base, conditions: parsed.conditions, match: parsed.match,
    layerView: null, lvFilter: null, sliders: [], stats: new Map(), values: new Map(), total: null, countSeq: 0, saved: false, previewTimer: 0 };
  if (!st.conditions.length) st.conditions = [newCondition()];
  openPanel("filter");
  renderFilter();
  try {
    const [FeatureFilter] = await $arcgis.import(["@arcgis/core/layers/support/FeatureFilter.js"]);
    st.FeatureFilter = FeatureFilter;
    st.layerView = await state.view.whenLayerView(l);
  } catch (e) { st.layerView = null; }   // no layer view (the layer isn't drawn): the preview sets the layer's own filter instead
  if (filterState !== st) return;
  applyFilterPreview();
  if (st.layerView) l.definitionExpression = st.base || null;
}
// The conditions as SQL, without the part that can't be shown as conditions.
const filterOwn = () => buildWhere(filterState.conditions, filterState.match, filterState.all);
const filterFull = () => buildWhere(filterState.conditions, filterState.match, filterState.all, filterState.base);
function applyFilterPreview() {
  const st = filterState; if (!st) return;
  if (st.layerView && st.FeatureFilter) { const own = filterOwn(); st.lvFilter = own ? new st.FeatureFilter({ where: own }) : null; st.layerView.filter = st.lvFilter; }
  else st.layer.definitionExpression = filterFull() || null;
  updateFilterCount();
}
function scheduleFilterPreview() { const st = filterState; if (!st) return; clearTimeout(st.previewTimer); st.previewTimer = setTimeout(applyFilterPreview, 120); }
async function updateFilterCount() {
  const st = filterState, l = st.layer, token = ++st.countSeq, full = filterFull();
  try {
    if (st.total == null) st.total = await l.queryFeatureCount({ where: st.base || "1=1" });
    const filtered = !!full && full !== st.base;
    const n = filtered ? await l.queryFeatureCount({ where: full }) : st.total;
    if (filterState !== st || token !== st.countSeq) return;
    $("filterCount").textContent = filtered ? t("filterCount", { n: fmtNum(n), total: fmtNum(st.total) }) : t("filterCountAll", { total: fmtNum(st.total) });
  } catch (e) { if (filterState === st) $("filterCount").textContent = ""; }
}
function calSelect(label, options, value, onChange) {
  const s = document.createElement("calcite-select"); s.setAttribute("label", label); s.setAttribute("scale", "m");
  for (const [v, text] of options) { const o = document.createElement("calcite-option"); o.value = v; o.label = text; o.textContent = text; if (v === value) o.selected = true; s.appendChild(o); }
  s.addEventListener("calciteSelectChange", () => onChange(s.value));
  return s;
}
function calNumber(label, value, onInput) {
  const n = document.createElement("calcite-input-number"); n.setAttribute("label", label); n.setAttribute("step", "any"); n.setAttribute("placeholder", S.filterValuePh);
  n.value = value == null ? "" : String(value);
  n.addEventListener("calciteInputNumberInput", () => onInput(n.value));
  return n;
}
function destroyFilterSliders() { const st = filterState; if (!st) return; st.sliders.forEach((s) => { try { s.destroy(); } catch (e) { /* gone */ } }); st.sliders = []; }
// The values a text field holds, for the list under "is" and "is not" (up to 250; anything else can still be typed).
async function fillTextValues(c, box) {
  const st = filterState, l = st.layer;
  try {
    let list = st.values.get(c.field);
    if (!list) {
      const r = await l.queryFeatures({ where: st.base || "1=1", outFields: [c.field], returnDistinctValues: true, returnGeometry: false, orderByFields: [c.field], num: 250 });
      list = [...new Set(r.features.map((g) => g.attributes[c.field]).filter((v) => (typeof v === "string" && v !== "") || (typeof v === "number" && Number.isFinite(v))).map(String))].slice(0, 250);
      st.values.set(c.field, list);
    }
    if (filterState !== st || !box.isConnected) return;
    const have = new Set(isListOp(c.op) ? c.values || [] : [c.value]);
    for (const v of list) { if (have.has(v)) continue; const it = document.createElement("calcite-combobox-item"); it.value = v; it.setAttribute("heading", v); it.setAttribute("text-label", v); box.appendChild(it); }
  } catch (e) { console.warn("Couldn't list the field's values", e); }
}
// The histogram of a number field with a slider on it, kept in step with the number box(es). These are the SDK's
// Histogram and Slider components (the replacements for its older HistogramRangeSlider widget), put together as in
// Esri's own "Histogram Range Slider" sample: the histogram sits in the slider's content-start slot, and the bars the
// condition includes are coloured through the histogram's colour stops.
function histogramStops(op, vals, h) {
  const color = hexToRgb(cfg.theme.brand || "#0b5c8e"), stop = (a, b) => (b > a ? [{ color, minValue: a, maxValue: b }] : []);
  if (op === "atLeast" || op === "greater") return stop(vals[0], h.max);
  if (op === "atMost" || op === "less") return stop(h.min, vals[0]);
  if (op === "between") return stop(Math.min(vals[0], vals[1]), Math.max(vals[0], vals[1]));
  if (op === "isNot") return stop(h.min, h.max);
  return [];   // "is": one value, so no range of bars to colour
}
const whenDefinedSoon = (tag, ms) => Promise.race([customElements.whenDefined(tag).then(() => true), new Promise((r) => setTimeout(() => r(false), ms))]);
async function fillHistogram(c, body, inputs) {
  const st = filterState, l = st.layer, f = filterField(c.field);
  try {
    const [histogram, summaryStatistics] = await $arcgis.import(["@arcgis/core/smartMapping/statistics/histogram.js", "@arcgis/core/smartMapping/statistics/summaryStatistics.js"]);
    let h = st.stats.get(c.field);
    if (!h) {
      const s = await summaryStatistics({ layer: l, field: c.field });
      if (!(s && Number.isFinite(s.min) && Number.isFinite(s.max) && s.max > s.min)) h = { none: true };
      else { const r = await histogram({ layer: l, field: c.field, numBins: 30, minValue: s.min, maxValue: s.max }); h = { min: s.min, max: s.max, bins: r.bins }; }
      st.stats.set(c.field, h);
    }
    if (filterState !== st || !body.isConnected) return;
    if (h.none) { body.textContent = S.filterNoHistogram; body.classList.add("none"); return; }
    const sl = document.createElement("arcgis-slider"), hg = document.createElement("arcgis-histogram");
    if (!(await whenDefinedSoon("arcgis-slider", 15000)) || !(await whenDefinedSoon("arcgis-histogram", 15000))) throw new Error("The Slider and Histogram components didn't load");
    if (filterState !== st || !body.isConnected) return;
    const whole = /integer|long/i.test(f.type), span = h.max - h.min, precision = whole ? 0 : span < 10 ? 2 : span < 1000 ? 1 : 0;
    const round = (v) => Number(Number(v).toFixed(precision)), clampV = (v) => Math.min(h.max, Math.max(h.min, v));
    const cur = (v, d) => { const n = Number(v); return v !== "" && v != null && Number.isFinite(n) ? clampV(n) : d; };
    const between = c.op === "between";
    // A condition with no value yet starts with its slider where everything is shown; the box stays empty until it's moved.
    const low = c.op === "atMost" || c.op === "less" ? h.max : h.min;
    const values = between ? [cur(c.value, h.min), cur(c.value2, h.max)].sort((a, b) => a - b) : [cur(c.value, low)];
    hg.slot = "content-start"; hg.style.flex = "1"; hg.style.setProperty("--arcgis-histogram-bar-color", "#c2c2c2");
    hg.bins = h.bins; hg.min = h.min; hg.max = h.max; hg.colorStops = histogramStops(c.op, values, h);
    sl.min = h.min; sl.max = h.max; sl.values = values; sl.precision = precision;
    sl.setAttribute("show-range-labels", ""); sl.setAttribute("range-labels-placement", "end");
    sl.setAttribute("label", t("filterSliderLabel", { field: f.alias || f.name })); sl.setAttribute("aria-label", t("filterSliderLabel", { field: f.alias || f.name }));
    sl.appendChild(hg);
    const host = document.createElement("div"); host.className = "flt-hist-host"; host.appendChild(sl); body.replaceChildren(host);
    st.sliders.push({ destroy: () => host.remove() });
    const fromSlider = () => {
      const vals = (sl.values || []).map(Number);
      if (!vals.length || vals.some((v) => !Number.isFinite(v)) || filterState !== st) return;
      c.value = String(round(vals[0])); inputs[0].value = c.value;
      if (between && vals.length > 1) { c.value2 = String(round(vals[1])); inputs[1].value = c.value2; }
      hg.colorStops = histogramStops(c.op, vals, h);
      scheduleFilterPreview();
    };
    sl.addEventListener("arcgisInput", fromSlider); sl.addEventListener("arcgisChange", fromSlider);
    // typing in a box moves the slider
    body.__setSlider = () => {
      if (c.value === "" || (between && c.value2 === "")) return;
      const next = (between ? [Number(c.value), Number(c.value2)] : [Number(c.value)]);
      if (next.some((v) => !Number.isFinite(v))) return;
      const vals = next.map(clampV).sort((x, y) => x - y);
      try { sl.values = vals; hg.colorStops = histogramStops(c.op, vals, h); } catch (e) { /* out of range */ }
    };
  } catch (e) { console.warn("Histogram not available", e); if (body.isConnected) { body.textContent = S.filterNoHistogram; body.classList.add("none"); } }
}
function conditionCard(c, i) {
  const st = filterState, f = filterField(c.field), kind = fieldKind(f), n = i + 1, many = st.conditions.length > 1;
  const card = document.createElement("div"); card.className = "flt-cond"; card.setAttribute("role", "group"); card.dataset.i = String(i);
  const name = many ? t("filterConditionN", { n }) : S.filterCondition; card.setAttribute("aria-label", name);
  // no heading: the field, the comparison and the value, with the bin beside the field (the group is still named for a screen reader)
  const head = document.createElement("div"); head.className = "flt-cond-head";
  const rm = document.createElement("button"); rm.type = "button"; rm.className = "lt flt-rm"; rm.innerHTML = calIcon("trash"); rm.title = S.filterRemove; rm.setAttribute("aria-label", t("filterRemoveN", { n }));
  rm.addEventListener("click", () => { st.conditions.splice(i, 1); if (!st.conditions.length) st.conditions.push(newCondition()); renderFilter({ focus: Math.min(i, st.conditions.length - 1) }); applyFilterPreview(); });
  card.appendChild(head);
  const redraw = (part) => { const fresh = conditionCard(c, i); card.replaceWith(fresh); const el = fresh.querySelector('[data-part="' + part + '"]'); if (el && el.setFocus) el.setFocus(); applyFilterPreview(); };
  const fs = calSelect(t("filterFieldLabel", { n }), st.fields.map((x) => [x.name, x.alias || x.name]), c.field, (v) => {
    const k2 = fieldKind(filterField(v));
    c.field = v; c.value = ""; c.value2 = ""; c.values = []; if (!OPERATORS[k2].includes(c.op) || k2 !== kind) c.op = DEFAULT_OPERATOR[k2];
    redraw("field");
  });
  fs.dataset.part = "field"; head.append(fs, rm);
  const os = calSelect(t("filterOpLabel", { n }), OPERATORS[kind].map((op) => [op, S["filterOp_" + op]]), c.op, (v) => {
    const was = c.op; c.op = v;
    // between "is" and "is one of" what was chosen is kept: one value becomes a list of one, a list gives its first value
    if (isListOp(v) && !isListOp(was)) { c.values = (was === "is" || was === "isNot") && c.value !== "" && c.value != null ? [String(c.value)] : []; c.value = ""; c.value2 = ""; }
    else if (!isListOp(v) && isListOp(was)) { c.value = (v === "is" || v === "isNot") && c.values && c.values.length ? c.values[0] : ""; c.values = []; }
    else if (kind === "text" && !isListOp(v) && (was === "is" || was === "isNot") !== (v === "is" || v === "isNot")) c.value = "";
    if (v !== "between") c.value2 = "";
    redraw("op");
  });
  os.dataset.part = "op"; card.appendChild(os);
  if (!needsValue(c.op)) return card;
  if (isListOp(c.op)) {
    // a list: every value chosen is a chip; more can be chosen from the field's values, or typed
    const cb = document.createElement("calcite-combobox"); cb.setAttribute("label", t("filterValueLabel", { n })); cb.setAttribute("selection-mode", "multiple"); cb.setAttribute("allow-custom-values", "");
    cb.setAttribute("selection-display", "fit"); cb.setAttribute("placeholder", S.filterChooseManyPh); cb.setAttribute("overlay-positioning", "fixed"); cb.dataset.part = "value";
    for (const v of c.values || []) { const it = document.createElement("calcite-combobox-item"); it.value = v; it.setAttribute("heading", v); it.setAttribute("text-label", v); it.selected = true; cb.appendChild(it); }
    cb.addEventListener("calciteComboboxChange", () => { const v = cb.value; c.values = (Array.isArray(v) ? v : v ? [v] : []).map(String).filter(Boolean); note.textContent = fmt(S.filterListCount, { n: c.values.length }); scheduleFilterPreview(); });
    card.appendChild(cb);
    const note = document.createElement("p"); note.className = "flt-list-note"; note.textContent = fmt(S.filterListCount, { n: (c.values || []).length }); card.appendChild(note);
    fillTextValues(c, cb);
  } else if (kind === "number") {
    const inputs = [];
    let body = null;
    const box = (key, label) => { const el = calNumber(label, c[key], (v) => { c[key] = v; if (body && body.__setSlider) body.__setSlider(); scheduleFilterPreview(); }); el.dataset.part = key; inputs.push(el); return el; };
    if (c.op === "between") {
      const row = document.createElement("div"); row.className = "flt-between";
      const and = document.createElement("span"); and.textContent = S.filterAnd;
      row.append(box("value", t("filterValueFromLabel", { n })), and, box("value2", t("filterValueToLabel", { n })));
      card.appendChild(row);
    } else card.appendChild(box("value", t("filterValueLabel", { n })));
    const det = document.createElement("details"); det.className = "flt-hist"; det.open = st.histOpen !== false;
    const sum = document.createElement("summary"); sum.textContent = S.filterHistogram; det.appendChild(sum);
    det.addEventListener("toggle", () => { st.histOpen = det.open; });
    body = document.createElement("div"); body.className = "flt-hist-body"; body.textContent = S.filterLoading; det.appendChild(body);
    card.appendChild(det);
    fillHistogram(c, body, inputs);
  } else if (c.op === "is" || c.op === "isNot") {
    const cb = document.createElement("calcite-combobox"); cb.setAttribute("label", t("filterValueLabel", { n })); cb.setAttribute("selection-mode", "single"); cb.setAttribute("allow-custom-values", "");
    cb.setAttribute("placeholder", S.filterChoosePh); cb.setAttribute("overlay-positioning", "fixed"); cb.setAttribute("clear-disabled", ""); cb.dataset.part = "value";
    if (c.value) { const it = document.createElement("calcite-combobox-item"); it.value = c.value; it.setAttribute("heading", c.value); it.setAttribute("text-label", c.value); it.selected = true; cb.appendChild(it); }
    cb.addEventListener("calciteComboboxChange", () => { const v = cb.value; c.value = Array.isArray(v) ? (v[0] || "") : (v || ""); scheduleFilterPreview(); });
    card.appendChild(cb);
    fillTextValues(c, cb);
  } else {
    const tx = document.createElement("calcite-input-text"); tx.setAttribute("label", t("filterValueLabel", { n })); tx.setAttribute("placeholder", S.filterTextPh); tx.value = c.value || ""; tx.dataset.part = "value";
    tx.addEventListener("calciteInputTextInput", () => { c.value = tx.value; scheduleFilterPreview(); });
    card.appendChild(tx);
  }
  return card;
}
function renderFilter(opts) {
  const st = filterState; if (!st) return;
  destroyFilterSliders();
  $("filterLayer").textContent = st.layer.title || "";
  $("filterBase").hidden = !st.base;   // a filter the panel can't read stays on, and is said in a line (no SQL is shown)
  const many = st.conditions.length > 1;
  $("filterMatchRow").hidden = !many;
  if (many) $("filterMatchRow").replaceChildren(calSelect(S.filterMatch, [["all", S.filterMatchAll], ["any", S.filterMatchAny]], st.match, (v) => { st.match = v; applyFilterPreview(); }));
  $("filterConds").replaceChildren(...st.conditions.map(conditionCard));
  $("filterAdd").disabled = st.conditions.length >= MAX_CONDITIONS;
  if (opts && opts.focus != null) { const card = $("filterConds").children[opts.focus], el = card && card.querySelector('[data-part="field"]'); if (el && el.setFocus) setTimeout(() => el.setFocus(), 0); }
}
// Leaving the panel without Apply puts the layer back as it was.
export function endFilter() {
  const st = filterState; if (!st) return;
  clearTimeout(st.previewTimer);
  destroyFilterSliders();
  const l = st.layer, lv = st.layerView, mine = st.lvFilter;
  if (!st.saved) l.definitionExpression = st.original || null;
  // take the preview off once the layer has drawn its own filter, so nothing flashes in between
  if (lv) { const off = () => { if (lv.filter === mine) lv.filter = null; }; reactiveUtils.whenOnce(() => !lv.updating).then(off, off); setTimeout(off, 4000); }
  filterState = null;
  $("filterCount").textContent = "";
}
function backToLayerTool(l, key) {
  openPanel("layers", { focus: false });
  const b = $("layersList").querySelector('[data-key="' + keyOf(l) + ":" + key + '"]');
  if (b) b.focus(); else { const h = $("layersH"); if (h) h.focus(); }
}
function applyFilter() {
  const st = filterState; if (!st) return;
  const l = st.layer, full = filterFull();
  const unfinished = st.conditions.some((c) => !conditionComplete(c, st.all) && (c.value || c.value2));
  l.definitionExpression = full || null;
  st.saved = true;
  if (full !== st.original) markDirty();
  closePanels(false);
  backToLayerTool(l, "filter");
  toast(unfinished ? S.filterUnfinished : full && full !== st.base ? t("filterApplied", { title: l.title || "" }) : t("filterRemoved", { title: l.title || "" }), unfinished ? 6000 : 3400);
}
$("filterApply").addEventListener("click", applyFilter);
$("filterCancel").addEventListener("click", () => { const l = filterState && filterState.layer; closePanels(false); if (l) backToLayerTool(l, "filter"); });
$("filterAdd").addEventListener("click", () => { const st = filterState; if (!st || st.conditions.length >= MAX_CONDITIONS) return; st.conditions.push(newCondition()); renderFilter({ focus: st.conditions.length - 1 }); applyFilterPreview(); });
$("filterClear").addEventListener("click", () => { const st = filterState; if (!st) return; st.conditions = [newCondition()]; st.match = "all"; renderFilter({ focus: 0 }); applyFilterPreview(); $("layersLive").textContent = S.filterClearedSr; });
// The layer's filter as the web map stores it: layerDefinition.definitionExpression (Web Map Specification).
// A layer that came with a filter and has had it cleared is written "1=1", so the filter in its item doesn't come back.
export function filterJson(out, l) {
  if (isGroup(l) || !("definitionExpression" in l)) return out;
  const ld = { ...(out.layerDefinition || {}) };
  const de = hasFilter(l) ? filterText(l) : (filterOrigin.get(l) ? "1=1" : "");
  if (de) ld.definitionExpression = de; else if (filterOrigin.has(l)) delete ld.definitionExpression;
  if (Object.keys(ld).length) out.layerDefinition = ld; else delete out.layerDefinition;
  return out;
}

