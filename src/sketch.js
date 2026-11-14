// ============================================================ Sketch
// Drawing uses the SDK's Sketch component: the same toolbar Map Viewer uses (select, point, line with straight,
// freehand and curved segments, area, rectangle, circle, text, undo/redo, duplicate, delete, snapping). It shows on
// the map while the Sketch panel is open. The panel keeps what the SDK has no component for: each sketch's pop-up
// (title, description, picture), colour and size, and rotation for text.
import "./popups.js?v=5.0.0-beta.44";   // first: keeps the files running in the order they were written in (see app.js)
import { PALETTE_HEX } from "../lib/csv.js?v=5.0.0-beta.44";
import { SHAPE_NAME, ARROWS, TEXT_FONTS, textFont, SKETCH_LAYER_PREFIX, isSketchKey } from "../lib/doc.js?v=5.0.0-beta.44";
import { state } from "./state.js?v=5.0.0-beta.44";
import { $, fmt, cfg, F, S, t } from "./config.js?v=5.0.0-beta.44";
import { hexToRgb } from "./branding.js?v=5.0.0-beta.44";
import { GraphicsLayer, Graphic, SimpleMarkerSymbol, SimpleLineSymbol, SimpleFillSymbol, TextSymbol, densifyOperator, WebStyleSymbol, cimSymbolUtils,
  need, restGetUrl } from "./sdk.js?v=5.0.0-beta.44";
import { graphicsLayer, sketchLayers, isSketch, sketchLayerByKey, activeMap } from "./views.js?v=5.0.0-beta.44";
import { dataLayers, markDirty } from "./session.js?v=5.0.0-beta.44";
import { toast } from "./ui.js?v=5.0.0-beta.44";
import { sketchUnits } from "./legend-basemaps-measure.js?v=5.0.0-beta.44";
import { removeFromMaps } from "./maps.js?v=5.0.0-beta.44";
import { swipe, endLayerTools, sketchRowShown, renderLayers } from "./layers-panel.js?v=5.0.0-beta.44";
import { previewLayer } from "./csv-import.js?v=5.0.0-beta.44";

export const COLOUR_NAMES = String(S.colourNames || "").split(",");
let selectedGraphics = [], selectedFeature = null;   // selectedFeature: the one sketch whose pop-up is being edited
// areaShape: an area's styled fill (a point's symbol and an area's are chosen separately; on a sketch both are its "shape")
const pendingStyle = { color: PALETTE_HEX[0], size: 12, rotation: 0, shape: "", areaShape: "", pattern: "solid", arrow: "none", fill: 25, fillColor: "", outlineTransparency: 0, outlineWidth: 2,
  font: "", bold: 1, italic: 0, haloColor: "#ffffff", haloSize: 1.5 };   // text: its font, bold and italic, and its halo (size 0 = no halo)
const newUid = () => "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
// Freehand is a segment option inside the line and area tools (as in Map Viewer), not a button of its own.
const SKETCH_TOOLS = ["point", "polyline", "freehandPolyline", "polygon", "freehandPolygon", "rectangle", "circle", "text"];
export const sketch = document.createElement("arcgis-sketch");
sketch.defaultGraphicsLayerDisabled = true;   // draw on the app's sketch layer only, never a layer of its own
// It goes on the page (and its code is downloaded) when Sketch is first opened: see sketchToolsOn (5.0.0-beta.9).
let sketchPlaced = null;
const sketchOnPage = new Promise((res) => { sketchPlaced = res; });
function placeSketch() { if (!sketch.isConnected) { $("sketchBar").appendChild(sketch); sketchPlaced(); } }
// Settings go on once the component is ready: set earlier, some are lost when it starts up.
const sketchScale = () => (window.innerHeight < 820 ? "s" : "m");
window.addEventListener("resize", () => { if (sketch.isConnected && sketch.scale && sketch.scale !== sketchScale()) sketch.scale = sketchScale(); });
export const sketchReady = (async () => {
  await sketchOnPage;
  await customElements.whenDefined("arcgis-sketch");
  if (sketch.componentOnReady) await sketch.componentOnReady();
  Object.assign(sketch, {
    defaultGraphicsLayerDisabled: true, layer: state.activeSketch, view: state.view, autoDestroyDisabled: true,
    availableCreateTools: SKETCH_TOOLS, showCreateToolsText: true, showCreateToolsFreehandPolyline: true, showCreateToolsFreehandPolygon: true, hideCreateToolsMultipoint: true,
    layout: window.matchMedia && window.matchMedia("(max-width: 760px)").matches ? "horizontal" : "vertical",   // down the right of the map, beside the panel, as in Map Viewer (a phone keeps it across the top)
    scale: sketchScale(),                 // smaller buttons on a short screen, so every tool shows without the "more" menu
    hideDuplicateButton: true, hideDeleteButton: true, hideSelectionCountLabel: true,   // one bar on the map: Duplicate and Delete are in the panel
    creationMode: "update",               // as in Map Viewer: a finished sketch stays selected, ready to edit
    updateOnGraphicClickDisabled: $("sketchBar").hidden,   // outside sketching, clicking a sketch opens its pop-up
    label: S.sketch
  });
  // Tooltips on from the start (5.0.0-beta.7): beside the pointer, the place while drawing a point, and a line's length
  // or an area's size as it is drawn. The toolbar's Settings can turn them off. A config can start with them off.
  if (cfg.sketchTooltips !== false) { try { if (sketch.tooltipOptions) sketch.tooltipOptions.enabled = true; else sketch.tooltipOptions = { enabled: true }; } catch (e) { console.warn("Tooltips not turned on", e); } }
  // Also on from the start (5.0.0-beta.8), each with a config switch and each in the toolbar's Settings:
  //  - segment labels: the length of each side while a line or an area is drawn or reshaped (sketchLabels)
  //  - snapping: the pointer is pulled onto a nearby corner or edge of another sketch, and helps keep right angles
  //    and parallels within the shape being drawn (sketchSnapping)
  sketchUnits();
  if (cfg.sketchLabels !== false) { try { sketch.labelOptions.enabled = true; } catch (e) { console.warn("Labels not turned on", e); } }
  if (cfg.sketchSnapping !== false) { try { const so = sketch.snappingOptions; so.enabled = true; so.selfEnabled = true; so.featureEnabled = true; syncSnapSources(); } catch (e) { console.warn("Snapping not turned on", e); } }
})().catch((e) => console.error("Sketch couldn't start", e));

// ---- Sketch styles (2.0 in 5.0.0-beta.9; 2.1 in beta.6: Map Viewer's sketch styles)
// Point symbols: the plain circle, or a symbol from one of Esri's sketch styles: the web styles in the "Esri Sketch
// Styles" group, which is where Map Viewer's Sketch gets its categories (Animals, Buildings, Pins...). A sketch keeps
// the style's item id and the symbol's name ("web:<item id>/Fox"); the symbol is fetched once, then sized (and, for a
// one-colour set, coloured) here. tint: the set takes the chosen colour; the drawn sets keep their own colours.
const PLACES_ITEM = "220936cc6ed342c9937abd8f180e7d1e";   // Esri's 2D point symbols (beta.5 saved these as "web:school")
const SYMBOL_SETS = [
  { key: "pins", item: "70ccf6bcbd304773a164be896e76edd3", tint: true },
  { key: "numbers", item: "9a13182126fd4a52ae75f7112717dd8e", tint: true },
  { key: "shapes", item: "a63b3a4631ae41d4a1bc3ba6d9c85bfe", tint: true, circle: true },
  { key: "arrows", item: "eef578633a3e41b985d0c980275c6d74", tint: true },
  { key: "places", item: PLACES_ITEM, tint: true, category: "POI-Large" },
  { key: "animals", item: "1fbb242c54e4415d9b8e8a343ca7a9d0" },
  { key: "buildings", item: "fe12ab0e0c834ca2adff4e10f68e1327", tint: true },
  { key: "vehicles", item: "0d9f00ffc3af4d128ac5771e3dbce440" },
  { key: "trees", item: "e08037675f354ea1bab42359b9a0c04b" },
  { key: "landforms", item: "45ffe981ef1c4b82933f227c17c5ff80" },
  { key: "natural1", item: "bedfab602abc49e0800482182f0c3e19" },
  { key: "natural2", item: "f2aaebea3bf04c65ba97f7f5c020ce3b" },
  { key: "human1", item: "e9cb6bb3273342b69628e0da4be1b60c" },
  { key: "human2", item: "8560ce55ee7547a0b6b1d59df76d3f6b" },
  // Styled fills for areas (2.2), from the same group. In 3D the SDK draws these as outlines only.
  { key: "hatch", item: "807adef8568448318173798e15954ee5", geom: "polygon" },
  { key: "landuse", item: "e6ad877235bc41a395a17bed100cf2f4", geom: "polygon" },
  { key: "pencil", item: "c4d80992510449289edc5cc0db28d5c0", geom: "polygon" }
].filter((x) => !Array.isArray(cfg.sketchSymbolSets) || cfg.sketchSymbolSets.includes(x.key));
const styleBase = (item) => "https://cdn.arcgis.com/sharing/rest/content/items/" + item;
function parseShape(shape) {
  if (!SHAPE_NAME.test(shape || "")) return null;
  const rest = shape.slice(4), i = rest.indexOf("/");
  const item = i === 32 ? rest.slice(0, 32) : PLACES_ITEM, name = i === 32 ? rest.slice(33) : rest;
  const set = SYMBOL_SETS.find((x) => x.item === item) || (item === PLACES_ITEM ? { key: "places", item, tint: true } : null);
  return set ? { item, name, set, key: item + "/" + name } : null;   // only the styles this app offers are ever fetched
}
const shapeThumb = (p) => styleBase(p.item) + "/resources/styles/thumbnails/" + encodeURIComponent(p.name) + ".png";
const shapeTints = (shape) => { if (!shape) return true; const p = parseShape(shape); return !!(p && p.set.tint); };
const vectorCache = new Map(), vectorLoading = new Map();
function loadVector(shape) {
  const p = parseShape(shape);
  if (!p) return Promise.reject(new Error("Not a symbol this app offers"));
  if (!vectorLoading.has(p.key)) vectorLoading.set(p.key, need("symbols")
    .then(() => new WebStyleSymbol({ styleUrl: styleBase(p.item) + "/data", name: p.name }).fetchSymbol({ acceptedFormats: ["cim"] }))
    .then((sym) => { vectorCache.set(p.key, sym); return sym; })
    .catch((e) => { vectorLoading.delete(p.key); throw e; }));
  return vectorLoading.get(p.key);
}
export function vectorSymbol(o) {
  const p = parseShape(o.shape), base = p ? vectorCache.get(p.key) : null;
  if (!base) return null;
  const sym = base.clone(), rgb = hexToRgb(o.color);
  if (p.set.geom === "polygon") return sym;   // a styled fill is used as it is
  try { if (p.set.tint) cimSymbolUtils.applyCIMSymbolColor(sym, { r: rgb[0], g: rgb[1], b: rgb[2], a: 1 }); cimSymbolUtils.scaleCIMSymbolTo(sym, Math.round((o.size || 12) * 2.5)); } catch (e) { console.warn("Couldn't style a symbol", e); }
  return sym;
}
// Lines and area outlines: solid, dashed or dotted; a line can carry an arrowhead at either end or both.
const LINE_STYLES = { solid: "solid", dash: "dash", dot: "dot", "dash-dot": "dash-dot", "long-dash": "long-dash" };
function symbolFor(kind, o) {
  const rgb = hexToRgb(o.color), style = LINE_STYLES[o.pattern] || "solid";
  if (kind === "text") {   // as Map Viewer sets text up: a font, bold and italic, a size, a colour, a halo, and its rotation
    const sym = { type: "text", text: o.text || S.textDefault, color: o.color, angle: o.rotation || 0, font: { ...textFont(o), size: Math.max(10, o.size || 16) } };
    if (o.haloSize > 0) { sym.haloColor = o.haloColor || "#ffffff"; sym.haloSize = o.haloSize; } else { sym.haloColor = null; sym.haloSize = 0; }
    return sym;
  }
  if (kind === "polyline") {
    const sym = { type: "simple-line", color: o.color, width: Math.max(2, Math.round((o.size || 12) / 4)), style };
    if (ARROWS[o.arrow]) sym.marker = { style: "arrow", placement: ARROWS[o.arrow], color: o.color };
    return sym;
  }
  if (kind === "polygon") {
    // as Map Viewer sets an area up: a fill colour and its transparency, an outline colour, its transparency and width
    const f = hexToRgb(o.fillColor || o.color), w = o.outlineWidth == null ? 2 : o.outlineWidth, ot = o.outlineTransparency || 0;
    return { type: "simple-fill", color: [f[0], f[1], f[2], (o.fill == null ? 25 : o.fill) / 100], outline: { color: [rgb[0], rgb[1], rgb[2], (100 - ot) / 100], width: w, style: w > 0 ? style : "none" } };
  }
  return { type: "simple-marker", style: "circle", color: o.color, size: o.size || 12, angle: o.rotation || 0, outline: { color: "#ffffff", width: 1.5 } };
}
const kindOf = (g) => (g.attributes && g.attributes.kind === "text" ? "text" : (g.geometry && g.geometry.type) || "point");
export const styleOf = (a) => ({ color: a.color || PALETTE_HEX[0], size: a.size || 12, rotation: a.rotation || 0, text: a.title, shape: a.shape || "", pattern: a.pattern || "solid", arrow: a.arrow || "none", fill: a.fill == null ? 25 : a.fill,
  fillColor: a.fillColor || "", outlineTransparency: a.outlineTransparency || 0, outlineWidth: a.outlineWidth == null ? 2 : a.outlineWidth,
  font: a.font || "", bold: a.bold === 0 ? 0 : 1, italic: a.italic ? 1 : 0, haloColor: a.haloColor || "#ffffff", haloSize: a.haloSize == null ? 1.5 : a.haloSize });
// what the tools draw an area with next, in a sketch's own terms
const pendingArea = () => ({ ...pendingStyle, shape: pendingStyle.areaShape });
function applyStyle(g) {
  const a = g.attributes || (g.attributes = {}), kind = kindOf(g), o = styleOf(a);
  if ((kind === "point" || kind === "polygon") && o.shape) {
    const v = vectorSymbol(o);
    if (v) { g.symbol = v; return; }
    loadVector(o.shape).then(() => { if (g.attributes && g.attributes.shape === o.shape) applyStyle(g); }).catch(() => {});   // the circle meanwhile
  }
  g.symbol = symbolFor(kind, o);
}
// What the Sketch tools draw with: the colour and size chosen with nothing selected.
async function syncSketchSymbols() {
  await sketchReady;
  const o = pendingStyle, props = (kind, opts) => { const { type, ...rest } = symbolFor(kind, opts); return rest; };   // the class sets the type
  sketch.pointSymbol = (o.shape && vectorSymbol(o)) || new SimpleMarkerSymbol(props("point", o));
  if (o.shape && !vectorSymbol(o)) loadVector(o.shape).then(() => { if (pendingStyle.shape === o.shape) syncSketchSymbols(); }).catch(() => {});
  sketch.polylineSymbol = new SimpleLineSymbol(props("polyline", o));
  const ar = pendingArea();
  sketch.polygonSymbol = (ar.shape && vectorSymbol(ar)) || new SimpleFillSymbol(props("polygon", ar));
  if (ar.shape && !vectorSymbol(ar)) loadVector(ar.shape).then(() => { if (pendingStyle.areaShape === ar.shape) syncSketchSymbols(); }).catch(() => {});
  sketch.textSymbol = new TextSymbol(props("text", { ...o, size: Math.max(14, o.size) }));
}
syncSketchSymbols();
function popupContent(event) {
  const a = (event && event.graphic && event.graphic.attributes) || {};
  const wrap = document.createElement("div");
  if (a.description) { const p = document.createElement("p"); p.className = "mm-popup-text"; p.textContent = a.description; wrap.appendChild(p); }
  if (a.imageUrl && /^data:image\//.test(a.imageUrl)) { const img = document.createElement("img"); img.className = "mm-popup-img"; img.src = a.imageUrl; img.alt = a.title || ""; wrap.appendChild(img); }
  if (!a.description && !a.imageUrl) { const p = document.createElement("p"); p.className = "mm-popup-empty"; p.textContent = S.noPopupYet; wrap.appendChild(p); }
  return wrap;
}
const popupTemplate = () => ({ title: "{title}", content: popupContent });
// The line tools can draw true curves (arcs and Bezier curves). The 3D view can't draw those, and other apps may not
// read them, so a finished curve becomes a line through many close points (within 2° of the curve).
export function straighten(g) {
  if (!g || !g.geometry || !/^(polyline|polygon)$/.test(g.geometry.type)) return;
  const j = g.geometry.toJSON();
  if (!j.curvePaths && !j.curveRings) return;
  if (!densifyOperator) { need("curves").then(() => straighten(g)).catch(() => {}); return; }   // (loaded when Sketch opens; this is for a curve finished before it arrived)
  try { g.geometry = densifyOperator.execute(g.geometry, 0, { maxAngleInDegrees: 2 }); } catch (e) { console.warn("Couldn't straighten a curve", e); }
}
export function addSketchGraphic(gj) {
  const g = Graphic.fromJSON({ geometry: gj.geometry, attributes: gj.attributes });
  g.attributes = { ...gj.attributes };
  applyStyle(g);
  g.popupTemplate = popupTemplate();
  (sketchLayerByKey(isSketchKey(gj.layer) ? gj.layer : "") || graphicsLayer).add(g);
  return g;
}
// Duplicate (and undo of a delete) bring graphics back with their attributes: give a copy its own id.
// More than one sketch layer (lab: features.sketchLayers). Off, the app has its one sketch layer, as before; a saved
// map that holds several still opens with them all.
export const SKETCH_LAYERS_ON = F.sketchLayers === true;
export const SKETCH_LAYERS_VERSION = "1.0";
const NEW_SKETCH_LAYER = "__new";
// "Drawing on" in the Sketch panel: shown when the feature is on, or when the map already has more than one sketch layer.
export function syncSketchLayerPicker() {
  const row = $("skLayerRow"), sel = $("skLayerPick");
  if (!row || !sel) return;
  row.hidden = !(SKETCH_LAYERS_ON || sketchLayers.length > 1);
  sel.innerHTML = "";
  for (const l of sketchLayers) { const o = document.createElement("option"); o.value = l.id; o.textContent = l.title || l.id; sel.appendChild(o); }
  if (SKETCH_LAYERS_ON) { const o = document.createElement("option"); o.value = NEW_SKETCH_LAYER; o.textContent = S.newSketchLayerMore; sel.appendChild(o); }
  sel.value = state.activeSketch.id;
}
export function createSketchLayer(name) {
  const l = newSketchLayer(name);
  setActiveSketch(l); markDirty();
  sketchReady.then(syncSnapSources);
  if (!$("layersPanel").hidden) renderLayers();
  toast(t("sketchLayerMade", { title: l.title }));
  return l;
}
$("skLayerPick").addEventListener("change", () => {
  const v = $("skLayerPick").value;
  if (v === NEW_SKETCH_LAYER) {
    const name = window.prompt(S.layerName, nextSketchLayerName());
    if (name == null || !name.trim()) { syncSketchLayerPicker(); return; }
    createSketchLayer(name); $("skLayerPick").focus();
    return;
  }
  setActiveSketch(sketchLayers.find((l) => l.id === v) || graphicsLayer);
});
syncSketchLayerPicker();
function watchSketchLayer(layer) {
  layer.graphics.on("change", (e) => {
    for (const g of e.added || []) {
      const a = g.attributes;
      if (!a || !a.uid) continue;
      if (sketchLayers.some((sl) => sl.graphics.some((o) => o !== g && o.attributes && o.attributes.uid === a.uid))) g.attributes = { ...a, uid: newUid() };
      if (!g.popupTemplate) g.popupTemplate = popupTemplate();
    }
    if (layer !== graphicsLayer) return;
    // The first layer's last sketch gone: it leaves Map layers, so it goes back to shown and solid. Otherwise the next
    // sketch would be drawn on a layer that is switched off, with no row to switch it on again.
    const has = graphicsLayer.graphics.length > 0;
    if (!has) { graphicsLayer.visible = true; graphicsLayer.opacity = 1; if (swipe && swipe.layer === graphicsLayer) endLayerTools(graphicsLayer); }
    if (has !== sketchRowShown && !$("layersPanel").hidden) renderLayers({ keepFocus: true });
  });
}
watchSketchLayer(graphicsLayer);
function newSketchKey() { let k; do { k = "L" + Math.random().toString(36).slice(2, 8).padEnd(6, "0"); } while (sketchLayerByKey(k)); return k; }
/** A further sketch layer, on top of the map. */
export function newSketchLayer(title, key) {
  key = isSketchKey(key) && !sketchLayerByKey(key) ? key : newSketchKey();
  const l = new GraphicsLayer({ id: SKETCH_LAYER_PREFIX + key, title: String(title || "").trim().slice(0, 200) || nextSketchLayerName(), elevationInfo: { mode: "on-the-ground" }, listMode: "hide" });
  watchSketchLayer(l); sketchLayers.push(l);
  activeMap().add(l); updatePinned();
  return l;
}
export function nextSketchLayerName() {
  const names = new Set(sketchLayers.map((l) => l.title));
  for (let n = sketchLayers.length + 1; ; n++) { const name = t("sketchLayerN", { n }); if (!names.has(name)) return name; }
}
/** The layer the Sketch tools draw on, and whose sketches a click selects. */
export function setActiveSketch(l) {
  if (!isSketch(l)) l = graphicsLayer;
  if (l !== state.activeSketch) { endSketchOps(); setSelection([]); state.activeSketch = l; sketchReady.then(() => { sketch.layer = state.activeSketch; }); }
  syncSketchLayerPicker();
}
export function removeSketchLayer(l) {
  if (l === graphicsLayer || !isSketch(l)) return;
  if (state.activeSketch === l) setActiveSketch(graphicsLayer);
  endLayerTools(l);
  sketchLayers.splice(sketchLayers.indexOf(l), 1);
  removeFromMaps(l); updatePinned();
  syncSketchLayerPicker(); sketchReady.then(syncSnapSources);
}
// The sketch layers at the very top of the map, bottom first. A layer added later goes under them (keepSketchOnTop);
// a sketch layer that has been moved below another layer is not among them and stays where it was put.
export function updatePinned() {
  const arr = activeMap().layers.toArray(); state.pinnedSketch = [];
  for (let i = arr.length - 1; i >= 0 && (isSketch(arr[i]) || arr[i] === previewLayer); i--) if (isSketch(arr[i])) state.pinnedSketch.unshift(arr[i]);
}


function popupFieldsEnabled(on) {
  for (const id of ["imgPick", "fTitle", "fDesc"]) $(id).disabled = !on;
}
function setImagePreview(dataUrl) {
  if (dataUrl) { $("imgThumb").src = dataUrl; $("imgPreview").hidden = false; $("imgPick").textContent = S.replaceImage; }
  else { $("imgThumb").removeAttribute("src"); $("imgPreview").hidden = true; $("imgPick").textContent = S.addImage; }
}
function highlightSwatch(hex) { [...$("swatches").children].forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.color === hex))); if (document.activeElement !== $("colourCustom")) $("colourCustom").value = hex; }
// The Sketch panel follows Map Viewer's Sketch pane (Sketch panel 3.0, 5.0.0-beta.6): a line saying what the tool
// in hand does; then the kind of sketch and what suits it. A point has its recent symbols and its current symbol,
// which opens a Change symbol view (category, search, the symbols, Done); colour and size. A line has colour, width,
// pattern and arrow; an area colour, fill and outline; text colour, size and rotation. A selected sketch also has
// its name, its Pop-up (a view of its own) and Duplicate and Delete, which were a second toolbar on the map.
const TOOL_KIND = { point: "point", multipoint: "point", polyline: "polyline", freehandPolyline: "polyline", polygon: "polygon", freehandPolygon: "polygon", rectangle: "polygon", circle: "polygon", text: "text" };
function sketchContext() {
  if (selectedGraphics.length) { const ks = [...new Set(selectedGraphics.map(kindOf))]; return ks.length === 1 ? ks[0] : "mixed"; }
  return TOOL_KIND[sketch.activeTool] || null;
}
function syncRotationRow() { populateSketchPanel(); }
function pressOne(hostId, attr, value) { [...$(hostId).querySelectorAll("button")].forEach((b) => b.setAttribute("aria-pressed", String(b.dataset[attr] === value))); }
let skView = "main";
function showSketchView(name, focusEl) {
  skView = name;
  for (const [id, n] of [["skMain", "main"], ["skSymbols", "symbols"], ["skPopup", "popup"]]) $(id).hidden = n !== name;
  $("sketchPanel").classList.toggle("tall", name === "symbols");   // Change symbol uses the panel's full height for the symbols
  if (name === "symbols") { ensureSymbolSet(); }
  if (focusEl) focusEl.focus();
}
const currentShape = () => (selectedGraphics.length ? (selectedGraphics[0].attributes || {}).shape || "" : (symbolGeom() === "polygon" ? pendingStyle.areaShape : pendingStyle.shape) || "");
function symbolTitle(shape) { if (!shape) return symbolGeom() === "polygon" ? S.basicPolygon : S.symbolCircle; const p = parseShape(shape); return (p && symbolTitles.get(p.key)) || (p ? p.name : shape); }
function symbolPicture(shape, size) {
  const p = parseShape(shape), box = document.createElement("span"); box.className = "sym-pic"; box.style.width = box.style.height = size + "px";
  if (p) { const im = document.createElement("img"); im.src = shapeThumb(p); im.alt = ""; im.loading = "lazy"; im.style.width = im.style.height = Math.round(size * 2.2) + "px"; box.appendChild(im); }
  else { const d = document.createElement("span"); d.className = symbolGeom() === "polygon" ? "sym-area" : "sym-dot"; box.appendChild(d); }
  return box;
}
function symbolButton(shape, title, size) {
  const b = document.createElement("button"); b.type = "button"; b.className = "sym-btn"; b.dataset.shape = shape; b.title = title; b.setAttribute("aria-label", title); b.setAttribute("aria-pressed", "false");
  b.appendChild(symbolPicture(shape, size));
  b.addEventListener("click", () => chooseSymbol(shape, title));
  return b;
}
// Recent symbols: the last few used, kept on this device for next time (a convenience; nothing is lost without it)
const recentSymbols = { point: [], polygon: [] };
for (const g of ["point", "polygon"]) {
  try { const r = JSON.parse(localStorage.getItem("atlas.recentSymbols" + (g === "point" ? "" : "." + g)) || "[]"); if (Array.isArray(r)) recentSymbols[g] = r.filter((x) => x && (x.shape === "" || parseShape(x.shape))).slice(0, 5).map((x) => ({ shape: x.shape, title: String(x.title || "").slice(0, 80) })); } catch (e) { /* no storage */ }
}
function noteRecent(geom, shape, title) {
  recentSymbols[geom] = [{ shape, title }, ...recentSymbols[geom].filter((x) => x.shape !== shape)].slice(0, 5);
  try { localStorage.setItem("atlas.recentSymbols" + (geom === "point" ? "" : "." + geom), JSON.stringify(recentSymbols[geom])); } catch (e) { /* no storage */ }
}
const symbolGeom = () => (sketchContext() === "polygon" ? "polygon" : "point");
function chooseSymbol(shape, title) {
  const geom = symbolGeom();
  noteRecent(geom, shape, title || symbolTitle(shape));
  restyleSelection(geom === "polygon" ? "areaShape" : "shape", shape);
  populateSketchPanel();
  if (skView === "symbols") pressOne("symbolGrid", "shape", shape);
}
function populateSketchPanel() {
  const many = selectedGraphics.length > 1, sel = selectedFeature, a = sel ? sel.attributes : null;
  const kind = sketchContext(), tool = sketch.activeTool || null;
  const first = selectedGraphics.length ? styleOf(selectedGraphics[0].attributes || {}) : kind === "polygon" ? pendingArea() : pendingStyle;
  if (!kind && skView !== "main") showSketchView("main");
  if (skView === "symbols" && kind !== "point" && kind !== "polygon") showSketchView("main");
  if (skView === "popup" && !sel) showSketchView("main");
  // what the tool in hand does (Map Viewer: "Click the map to add point.")
  const hint = selectedGraphics.length ? (many ? fmt(S.manySelected, { n: selectedGraphics.length }) : S.sketchHintSelected) : S["sketchHint_" + (TOOL_KIND[tool] ? (tool === "rectangle" || tool === "circle" ? "drag" : /^freehand/.test(tool) ? "freehand" : TOOL_KIND[tool]) : "none")];
  $("sketchHint").textContent = hint || "";
  $("skKind").hidden = !kind; $("skKind").textContent = kind ? S["sketchKind_" + kind] || "" : "";
  $("secFeature").hidden = !selectedGraphics.length;
  $("nameRow").hidden = !sel; $("skPopupOpen").hidden = !sel || kind === "text";
  $("nameLabel").textContent = kind === "text" ? S.sketchText : S.sketchName;
  const styledArea = kind === "polygon" && !!first.shape;   // a styled fill is used as it is: no colours or outline to set
  $("secSymbol").hidden = kind !== "point" && kind !== "polygon";
  $("recentLabel").textContent = kind === "polygon" ? S.recentPolygonSymbols : S.recentSymbols;
  $("secColour").hidden = !kind || kind === "polygon" || (kind === "point" && !shapeTints(first.shape));
  for (const id of ["secFillColour", "secFillT", "secOutlineColour", "secOutlineT", "secOutlineW"]) $(id).hidden = kind !== "polygon" || styledArea;
  $("secSize").hidden = !kind || kind === "polygon" || kind === "mixed";
  $("sizeLabel").textContent = kind === "polyline" ? S.lineWidth : S.size;
  $("secPattern").hidden = !(kind === "polyline" || (kind === "polygon" && !styledArea));
  $("patternLabel").textContent = kind === "polygon" ? S.outlinePattern : S.linePattern;
  $("secArrow").hidden = kind !== "polyline";
  if (kind === "polygon") {
    const fc = first.fillColor || first.color, ft = 100 - (first.fill == null ? 25 : first.fill);
    pressSwatch("fillSwatches", first.fill === 0 ? "none" : fc); $("fillCustom").value = fc;
    pressSwatch("outlineSwatches", first.outlineWidth === 0 ? "none" : first.color); $("outlineCustom").value = first.color;
    setPair("fFillT", ft); setPair("fOutlineT", first.outlineTransparency || 0); setPair("fOutlineW", first.outlineWidth == null ? 2 : first.outlineWidth);
  }
  $("rotSection").hidden = kind !== "text";
  for (const id of ["secFont", "secHalo"]) $(id).hidden = kind !== "text";
  $("secPlain").hidden = !styledArea;
  if (kind === "text") {
    const f = TEXT_FONTS[first.font] || TEXT_FONTS[""], drawn = textFont(first);
    $("fFont").value = TEXT_FONTS[first.font] ? first.font : "";
    // Bold and Italic are offered only where the font has them
    const setB = (id, on, can) => { const b = $(id); b.setAttribute("aria-pressed", String(on)); b.disabled = !can; b.title = can ? b.dataset.label : fmt(S.fontHasNo, { style: b.dataset.label }); };
    setB("fBold", drawn.weight === "bold", f.bold);
    setB("fItalic", drawn.style === "italic", f.italic && (f.both || !first.bold));
    const halo = first.haloSize > 0;
    $("fHalo").checked = halo; $("haloOpts").hidden = !halo;
    pressSwatch("haloSwatches", first.haloColor || "#ffffff"); $("haloCustom").value = first.haloColor || "#ffffff";
    if (halo) setPair("fHaloW", first.haloSize);
  }
  popupFieldsEnabled(!!sel);
  setImagePreview(a ? a.imageUrl || "" : "");
  if (document.activeElement !== $("fTitle")) $("fTitle").value = a ? a.title || "" : "";
  if (document.activeElement !== $("fDesc")) $("fDesc").value = a ? a.description || "" : "";
  $("skPopupState").textContent = a && (a.description || a.imageUrl) ? S.popupHasContent : "";
  highlightSwatch(first.color || PALETTE_HEX[0]);
  $("fSize").value = first.size || 12; $("sizeVal").textContent = first.size || 12;
  $("fRot").value = first.rotation || 0; $("rotVal").textContent = (first.rotation || 0) + "°";
  pressOne("patternRow", "pattern", first.pattern || "solid"); pressOne("arrowRow", "arrow", first.arrow || "none");
  if (kind === "point" || kind === "polygon") {
    const shape = first.shape || "";
    const cur = $("skSymbolOpen"); cur.replaceChildren(symbolPicture(shape, 30));
    const nm = document.createElement("span"); nm.className = "sym-cur-name"; nm.textContent = symbolTitle(shape); const ch = document.createElement("span"); ch.className = "chev"; ch.setAttribute("aria-hidden", "true"); ch.textContent = "›";
    cur.append(nm, ch); cur.setAttribute("aria-label", S.currentSymbol + ": " + symbolTitle(shape) + ". " + S.changeSymbol);
    const row = $("recentRow"); row.replaceChildren();
    // the plain one is always first, so there is a way back from a styled fill or a picture symbol
    const plain = { shape: "", title: kind === "polygon" ? S.basicPolygon : S.symbolCircle };
    const recents = [plain, ...recentSymbols[symbolGeom()].filter((x) => x.shape !== "")];
    for (const r of recents) row.appendChild(symbolButton(r.shape, r.title || symbolTitle(r.shape), 30));
    $("recentNone").hidden = recents.length > 0; $("recentNone").textContent = kind === "polygon" ? S.noRecentPolygonSymbols : S.noRecentSymbols; row.hidden = !recents.length;
    pressOne("recentRow", "shape", shape);
    if (skView === "symbols") pressOne("symbolGrid", "shape", shape);
  }
}
// What a style control may change on a sketch of each kind
const STYLE_KINDS = { shape: ["point"], areaShape: ["polygon"], arrow: ["polyline"], pattern: ["polyline", "polygon"], fill: ["polygon"], fillColor: ["polygon"], outlineTransparency: ["polygon"], outlineWidth: ["polygon"], rotation: ["text"],
  font: ["text"], bold: ["text"], italic: ["text"], haloColor: ["text"], haloSize: ["text"] };
// Change symbol: each category is one of the sketch styles; its list (names, titles, small pictures) is fetched when first chosen.
const symbolLists = new Map(), symbolTitles = new Map();
const LEFT_OUT = new Set((Array.isArray(cfg.sketchSymbolsLeftOut) ? cfg.sketchSymbolsLeftOut : ["bar", "casino", "vineyard"]).map((x) => String(x).toLowerCase()));   // not for a school atlas; a config can choose
function loadSymbolSet(set) {
  if (!symbolLists.has(set.key)) symbolLists.set(set.key, restGetUrl(styleBase(set.item) + "/data").then((d) => {
    const items = (d.items || []).filter((it) => it && it.itemType === (set.geom === "polygon" ? "polygonSymbol" : "pointSymbol") && (!set.category || it.category === set.category) && SHAPE_NAME.test("web:" + set.item + "/" + it.name) && !LEFT_OUT.has(String(it.name).toLowerCase()))
      .map((it) => ({ shape: "web:" + set.item + "/" + it.name, title: String(it.title || it.name).slice(0, 80), tags: (Array.isArray(it.tags) ? it.tags.join(" ") : "").toLowerCase() }));
    for (const it of items) symbolTitles.set(set.item + "/" + it.shape.slice(37), it.title);
    return items;
  }).catch((e) => { symbolLists.delete(set.key); throw e; }));
  return symbolLists.get(set.key);
}
let symbolSeq = 0;
async function ensureSymbolSet() {
  const geom = symbolGeom(), sets = SYMBOL_SETS.filter((x) => (x.geom || "point") === geom);
  if ($("symbolSet").dataset.geom !== geom) {   // the categories for points, or for areas
    $("symbolSet").replaceChildren(...sets.map((x) => { const o = document.createElement("option"); o.value = x.key; o.textContent = S["symbolSet_" + x.key] || x.key; return o; }));
    $("symbolSet").dataset.geom = geom;
  }
  $("symbolNote").hidden = geom !== "polygon";
  const set = sets.find((x) => x.key === $("symbolSet").value) || sets[0], grid = $("symbolGrid"), seq = ++symbolSeq;
  if (!set) return;
  $("symbolStatus").textContent = S.symbolsLoading;
  let items;
  try { items = await loadSymbolSet(set); } catch (e) { console.error("Symbols not loaded", e); if (seq === symbolSeq) { grid.replaceChildren(); $("symbolStatus").textContent = S.symbolsFailed; } return; }
  if (seq !== symbolSeq) return;
  const q = $("symbolSearch").value.trim().toLowerCase();
  const shown = q ? items.filter((it) => it.title.toLowerCase().includes(q) || it.tags.includes(q)) : items;
  grid.replaceChildren();
  if (set.circle && (!q || S.symbolCircle.toLowerCase().includes(q))) grid.appendChild(symbolButton("", S.symbolCircle, 36));
  if (geom === "polygon" && (!q || S.basicPolygon.toLowerCase().includes(q))) grid.appendChild(symbolButton("", S.basicPolygon, 36));   // back to the plain fill
  const setName = S["symbolSet_" + set.key] || set.key;
  for (const it of shown) grid.appendChild(symbolButton(it.shape, /^Symbol \d/.test(it.title) ? setName + ", " + it.title : it.title, 36));   // the drawn sets only number their symbols
  $("symbolStatus").textContent = q ? t("symbolsFound", { n: grid.children.length }) : "";
  pressOne("symbolGrid", "shape", currentShape());
}
export function setSelection(graphics) {
  selectedGraphics = (graphics || []).filter((g) => g && isSketch(g.layer));
  selectedFeature = selectedGraphics.length === 1 ? selectedGraphics[0] : null;
  populateSketchPanel();
}
export function selectForEdit(g) { setSelection(g ? [g] : []); }
// Colour, size and rotation change every selected sketch, or (with none selected) what the tools draw next.
function restyleSelection(key, value) {
  if (selectedGraphics.length) {
    for (const g of selectedGraphics) { if (STYLE_KINDS[key] && !STYLE_KINDS[key].includes(kindOf(g))) continue; g.attributes[key === "areaShape" ? "shape" : key] = value; applyStyle(g); }
    markDirty();
  }
  // the choice is also what the tools draw with next (as in Map Viewer, where a style carries on to the next sketch)
  pendingStyle[key] = value; syncSketchSymbols();
}
PALETTE_HEX.forEach((hex, i) => {
  const b = document.createElement("button");
  b.type = "button"; b.className = "swatch"; b.style.background = hex; b.dataset.color = hex;
  b.setAttribute("aria-label", (COLOUR_NAMES[i] || hex).trim()); b.title = (COLOUR_NAMES[i] || hex).trim(); b.setAttribute("aria-pressed", "false");
  b.addEventListener("click", () => { restyleSelection("color", hex); highlightSwatch(hex); });
  $("swatches").appendChild(b);
});
$("fTitle").addEventListener("input", () => { if (!selectedFeature) return; selectedFeature.attributes.title = $("fTitle").value; if (kindOf(selectedFeature) === "text") applyStyle(selectedFeature); markDirty(); });
$("fDesc").addEventListener("input", () => { if (!selectedFeature) return; selectedFeature.attributes.description = $("fDesc").value; markDirty(); });
function fileToDataUrl(file, cb) {     // downscale to 1200px JPEG so images don't bloat the map file; no EXIF/GPS survives the canvas
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      try {
        let w = img.width, h = img.height; const max = 1200;
        if (w > max || h > max) { const s = Math.min(max / w, max / h); w = Math.round(w * s); h = Math.round(h * s); }
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        cb(c.toDataURL("image/jpeg", 0.85));
      } catch (e) { toast(S.imageFailed); }
    };
    img.onerror = () => toast(S.imageFailed);
    img.src = reader.result;
  };
  reader.onerror = () => toast(S.imageFailed);
  reader.readAsDataURL(file);
}
$("imgPick").addEventListener("click", () => { if (!$("imgPick").disabled) $("fImageFile").click(); });
$("fImageFile").addEventListener("change", () => {
  const file = $("fImageFile").files && $("fImageFile").files[0];
  $("fImageFile").value = "";
  if (!file || !selectedFeature) return;
  if (!/^image\//.test(file.type)) { toast(S.imageOnly); return; }
  const target = selectedFeature;
  fileToDataUrl(file, (url) => { target.attributes.imageUrl = url; if (target === selectedFeature) setImagePreview(url); markDirty(); });
});
$("imgRemove").addEventListener("click", () => { if (!selectedFeature) return; selectedFeature.attributes.imageUrl = ""; setImagePreview(""); markDirty(); });
$("fSize").addEventListener("input", () => { const v = parseInt($("fSize").value, 10); $("sizeVal").textContent = v; restyleSelection("size", v); });
$("fRot").addEventListener("input", () => { const v = parseInt($("fRot").value, 10); $("rotVal").textContent = v + "°"; restyleSelection("rotation", v); });
// Areas: fill and outline colours (the palette, a colour of your own, or none), transparencies and width, each a slider with its number box
function pressSwatch(hostId, value) { [...$(hostId).querySelectorAll("button")].forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.color === value))); }
function setPair(id, v) { $(id).value = v; $(id + "N").value = v; }
function swatchRow(hostId, customId, onColour, onNone, noneLabel) {
  PALETTE_HEX.forEach((hex, i) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "swatch"; b.style.background = hex; b.dataset.color = hex;
    const name = (COLOUR_NAMES[i] || hex).trim(); b.setAttribute("aria-label", name); b.title = name; b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => { onColour(hex); populateSketchPanel(); });
    $(hostId).appendChild(b);
  });
  const n = document.createElement("button"); n.type = "button"; n.className = "swatch none"; n.dataset.color = "none"; n.setAttribute("aria-label", noneLabel); n.title = noneLabel; n.setAttribute("aria-pressed", "false");
  n.addEventListener("click", () => { onNone(); populateSketchPanel(); });
  $(hostId).appendChild(n);
  $(customId).addEventListener("input", () => { onColour($(customId).value.toLowerCase()); pressSwatch(hostId, $(customId).value.toLowerCase()); });
}
swatchRow("fillSwatches", "fillCustom", (hex) => { restyleSelection("fillColor", hex); if ((selectedGraphics.length ? styleOf(selectedGraphics[0].attributes).fill : pendingStyle.fill) === 0) restyleSelection("fill", 25); }, () => restyleSelection("fill", 0), S.noFill);
swatchRow("outlineSwatches", "outlineCustom", (hex) => { restyleSelection("color", hex); if ((selectedGraphics.length ? styleOf(selectedGraphics[0].attributes).outlineWidth : pendingStyle.outlineWidth) === 0) restyleSelection("outlineWidth", 2); }, () => restyleSelection("outlineWidth", 0), S.noOutline);
function pair(id, key, toValue) {
  const set = (raw) => { const el = $(id), v = Math.min(Number(el.max), Math.max(Number(el.min), Number(raw))); if (!Number.isFinite(v)) return; setPair(id, v); restyleSelection(key, toValue ? toValue(v) : v); };
  $(id).addEventListener("input", () => set($(id).value));
  $(id + "N").addEventListener("change", () => set($(id + "N").value));
}
pair("fFillT", "fill", (t) => 100 - t);            // kept as how solid the fill is; shown, as in Map Viewer, as its transparency
pair("fOutlineT", "outlineTransparency");
pair("fOutlineW", "outlineWidth");
// Text: font, bold and italic, halo
{
  const sel = $("fFont");
  for (const key of Object.keys(TEXT_FONTS)) { const o = document.createElement("option"); o.value = key; o.textContent = key ? TEXT_FONTS[key].family : S.fontDefault; sel.appendChild(o); }
  sel.addEventListener("change", () => { restyleSelection("font", sel.value); populateSketchPanel(); });
  const cur = () => (selectedGraphics.length ? styleOf(selectedGraphics[0].attributes || {}) : pendingStyle);
  for (const [id, key, label] of [["fBold", "bold", S.bold], ["fItalic", "italic", S.italic]]) {
    const b = $(id); b.dataset.label = label; b.setAttribute("aria-label", label); b.title = label;
    b.addEventListener("click", () => { restyleSelection(key, b.getAttribute("aria-pressed") === "true" ? 0 : 1); populateSketchPanel(); });
  }
  let lastHalo = 1.5;
  $("fHalo").addEventListener("change", () => { if (!$("fHalo").checked) lastHalo = cur().haloSize || lastHalo; restyleSelection("haloSize", $("fHalo").checked ? lastHalo : 0); populateSketchPanel(); });
  PALETTE_HEX.concat(["#ffffff", "#000000"].filter((h) => !PALETTE_HEX.includes(h))).forEach((hex) => {
    const i = PALETTE_HEX.indexOf(hex), name = (i >= 0 ? COLOUR_NAMES[i] : hex === "#ffffff" ? S.colourWhite : S.colourBlack) || hex;
    const b = document.createElement("button"); b.type = "button"; b.className = "swatch"; b.style.background = hex; b.dataset.color = hex; b.setAttribute("aria-label", name.trim()); b.title = name.trim(); b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", () => { restyleSelection("haloColor", hex); populateSketchPanel(); });
    $("haloSwatches").appendChild(b);
  });
  $("haloCustom").addEventListener("input", () => { const v = $("haloCustom").value.toLowerCase(); restyleSelection("haloColor", v); pressSwatch("haloSwatches", v); });
  pair("fHaloW", "haloSize");
  $("skPlainFill").addEventListener("click", () => chooseSymbol("", S.basicPolygon));
  // a colour of your own for a point, a line or text, as areas already had
  $("colourCustom").addEventListener("input", () => { const v = $("colourCustom").value.toLowerCase(); restyleSelection("color", v); highlightSwatch(v); });
}
// Pattern and arrow choices: small pictures of the line, each a button
{
  const NS = "http://www.w3.org/2000/svg", DASH = { solid: "", dash: "7 4", dot: "2 4", "dash-dot": "8 3 2 3", "long-dash": "12 4" };
  const pic = (draw) => { const svg = document.createElementNS(NS, "svg"); svg.setAttribute("viewBox", "0 0 44 16"); svg.setAttribute("aria-hidden", "true"); svg.setAttribute("focusable", "false"); draw(svg); return svg; };
  const line = (svg, x1, x2, dash) => { const l = document.createElementNS(NS, "line"); l.setAttribute("x1", x1); l.setAttribute("x2", x2); l.setAttribute("y1", 8); l.setAttribute("y2", 8); l.setAttribute("stroke", "currentColor"); l.setAttribute("stroke-width", 2.5); if (dash) l.setAttribute("stroke-dasharray", dash); svg.appendChild(l); };
  const head = (svg, x, dir) => { const p = document.createElementNS(NS, "path"); p.setAttribute("d", dir > 0 ? `M${x} 8 ${x - 9} 3v10z` : `M${x} 8 ${x + 9} 3v10z`); p.setAttribute("fill", "currentColor"); svg.appendChild(p); };
  const button = (hostId, attr, value, label, draw) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "pat-btn"; b.dataset[attr] = value; b.title = label; b.setAttribute("aria-label", label); b.setAttribute("aria-pressed", "false");
    b.appendChild(pic(draw)); b.addEventListener("click", () => { restyleSelection(attr, value); pressOne(hostId, attr, value); });
    $(hostId).appendChild(b);
  };
  for (const p of Object.keys(DASH)) button("patternRow", "pattern", p, S["pattern_" + p] || p, (svg) => line(svg, 3, 41, DASH[p]));
  button("arrowRow", "arrow", "none", S.arrow_none, (svg) => line(svg, 3, 41));
  button("arrowRow", "arrow", "end", S.arrow_end, (svg) => { line(svg, 3, 34); head(svg, 42, 1); });
  button("arrowRow", "arrow", "start", S.arrow_start, (svg) => { line(svg, 10, 41); head(svg, 2, -1); });
  button("arrowRow", "arrow", "both", S.arrow_both, (svg) => { line(svg, 10, 34); head(svg, 42, 1); head(svg, 2, -1); });
  $("symbolSet").addEventListener("change", () => { $("symbolSearch").value = ""; ensureSymbolSet(); });
  let searchTimer = 0;
  $("symbolSearch").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(ensureSymbolSet, 150); });
  $("skSymbolOpen").addEventListener("click", () => {
    $("symbolSearch").value = ""; showSketchView("symbols", $("skSymbolsH"));
    const p = parseShape(currentShape()); if (p && [...$("symbolSet").options].some((o) => o.value === p.set.key) && $("symbolSet").value !== p.set.key) { $("symbolSet").value = p.set.key; ensureSymbolSet(); }   // open on the current symbol's own category
  });
  for (const id of ["skSymbolsBack", "skSymbolsDone"]) $(id).addEventListener("click", () => showSketchView("main", $("skSymbolOpen")));
  $("skPopupOpen").addEventListener("click", () => showSketchView("popup", $("skPopupH")));
  for (const id of ["skPopupBack", "skPopupDone"]) $(id).addEventListener("click", () => { showSketchView("main", $("skPopupOpen")); populateSketchPanel(); });
  // Duplicate and Delete for the selected sketches (the toolbar's own buttons for these made a second bar on the map)
  $("skDuplicate").addEventListener("click", () => { try { sketch.duplicate(); } catch (e) { console.warn("Duplicate failed", e); } });
  $("skDelete").addEventListener("click", () => { try { sketch.delete(); } catch (e) { console.warn("Delete failed", e); } $("sketchH").focus(); });
}

const sketchBusy = () => sketch.state === "active";
export function endSketchOps() {
  if (!sketchBusy()) return;
  try { if (sketch.createGraphic) sketch.cancel(); else sketch.complete(); } catch (e) { /* idle */ }
}
// The Sketch panel turns the toolbar on and off. Closed, clicking a sketch opens its pop-up instead of selecting it.
// What sketches snap to: other sketches only (5.0.0-beta.9; beta.8 also snapped to spreadsheet layers). That is what
// tidy map making needs: areas that share a border, lines that meet. A config can add the spreadsheet layers
// ("sketchSnapTo": "sketches-and-data"). The opened map's own layers are never snapping layers by default.
function syncSnapSources() {
  if (cfg.sketchSnapping === false || !sketch.snappingOptions) return;
  const fs = sketch.snappingOptions.featureSources, want = cfg.sketchSnapTo === "sketches-and-data" ? [...sketchLayers, ...dataLayers] : [...sketchLayers];
  try {
    fs.removeMany(fs.filter((src) => !want.includes(src.layer)).toArray());
    for (const layer of want) if (!fs.some((src) => src.layer === layer)) fs.add({ layer, enabled: true });
  } catch (e) { console.warn("Snapping layers not set", e); }
}
let toolWatch = 0, toolSeen = null;
export function sketchToolsOn(on) {
  if (on) { placeSketch(); showSketchView("main"); sketchReady.then(syncSnapSources); }
  // the panel follows the tool chosen on the toolbar
  clearInterval(toolWatch); toolWatch = 0;
  if (on) toolWatch = setInterval(() => { const t = sketch.activeTool || null; if (t !== toolSeen) { toolSeen = t; populateSketchPanel(); } }, 250);
  if (!on) endSketchOps();
  $("sketchBar").hidden = !on;
  sketchReady.then(() => { sketch.updateOnGraphicClickDisabled = $("sketchBar").hidden; });
  if (!on) { setSelection([]); try { sketch.dismissFloatingElements(); } catch (e) { /* none open */ } }
}
sketch.addEventListener("arcgisCreate", (e) => {
  const { state, graphic, tool } = e.detail || {};
  if (state === "start") syncRotationRow();
  if (state !== "complete" || !graphic) return;
  straighten(graphic);
  const isText = tool === "text" || (graphic.symbol && graphic.symbol.type === "text");
  const typed = isText && graphic.symbol && graphic.symbol.text;
  graphic.attributes = { uid: newUid(), kind: isText ? "text" : (graphic.geometry && graphic.geometry.type) || "point",
    title: isText ? (typed && typed !== "hello world" ? typed : S.textDefault) : "", description: "", imageUrl: "",
    color: pendingStyle.color, size: isText ? Math.max(14, pendingStyle.size) : pendingStyle.size, rotation: isText ? pendingStyle.rotation : 0,
    shape: isText ? "" : graphic.geometry && graphic.geometry.type === "polygon" ? pendingStyle.areaShape : graphic.geometry && graphic.geometry.type === "point" ? pendingStyle.shape : "",
    pattern: pendingStyle.pattern, arrow: pendingStyle.arrow, fill: pendingStyle.fill, fillColor: pendingStyle.fillColor, outlineTransparency: pendingStyle.outlineTransparency, outlineWidth: pendingStyle.outlineWidth,
    font: pendingStyle.font, bold: pendingStyle.bold, italic: pendingStyle.italic, haloColor: pendingStyle.haloColor, haloSize: pendingStyle.haloSize };
  applyStyle(graphic);
  graphic.popupTemplate = popupTemplate();
  markDirty();
  if (!$("layersPanel").hidden) renderLayers();
  if (isText) setTimeout(() => { if (selectedFeature === graphic) { $("fTitle").focus(); $("fTitle").select(); } }, 0);
  // A finished sketch stays selected for editing, and the toolbar normally says so (an update event). With a vector
  // point symbol it doesn't, so the selection is read from the toolbar itself.
  setTimeout(() => { const ug = sketch.updateGraphics, arr = ug ? (ug.toArray ? ug.toArray() : [...ug]) : []; if (arr.length && !selectedGraphics.length) setSelection(arr); }, 60);
});
sketch.addEventListener("arcgisUpdate", (e) => {
  const { state, graphics, toolEventInfo } = e.detail || {};
  if (state === "complete") { (graphics ? (graphics.toArray ? graphics.toArray() : [...graphics]) : []).forEach(straighten); setSelection([]); return; }
  setSelection(graphics ? (graphics.toArray ? graphics.toArray() : [...graphics]) : []);
  if (toolEventInfo && /-stop$|^vertex-(add|remove)$/.test(toolEventInfo.type || "")) markDirty();
});
sketch.addEventListener("arcgisDelete", () => { setSelection([]); markDirty(); if (!$("layersPanel").hidden) renderLayers(); });
for (const ev of ["arcgisUndo", "arcgisRedo"]) sketch.addEventListener(ev, () => { markDirty(); if (!$("layersPanel").hidden) renderLayers(); });
// Keyboard: the button in the panel moves focus to the first drawing tool (the toolbar sits on the map, away from the panel).
function firstSketchAction(root) {
  for (const el of root.querySelectorAll("*")) {
    if (el.tagName === "CALCITE-ACTION" && el.offsetParent !== null && !el.disabled) return el;
    if (el.shadowRoot) { const f = firstSketchAction(el.shadowRoot); if (f) return f; }
  }
  return null;
}
$("sketchToolsJump").addEventListener("click", async () => {
  await sketchReady;
  const a = firstSketchAction(sketch.shadowRoot || sketch);
  if (a) { if (a.setFocus) await a.setFocus(); else a.focus(); }
});
// Escape while drawing or editing is the Sketch tools' (cancel or finish), not a reason to close the panel.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || $("sketchBar").hidden || !sketchBusy()) return;
  e.stopPropagation(); e.preventDefault();
  endSketchOps();
}, true);

