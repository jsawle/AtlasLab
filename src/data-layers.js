// ============================================================ Data layers (CSV) — client-side FeatureLayers
import "./maps.js?v=5.0.0-beta.40";   // first: keeps the files running in the order they were written in (see app.js)
import { columnScale } from "../lib/csv.js?v=5.0.0-beta.40";
import { DATA_LAYER_PREFIX } from "../lib/doc.js?v=5.0.0-beta.40";
import { state } from "./state.js?v=5.0.0-beta.40";
import { F } from "./config.js?v=5.0.0-beta.40";
import { FeatureLayer, Graphic, Field, LabelClass, rendererJsonUtils, intl } from "./sdk.js?v=5.0.0-beta.40";
import { activeMap } from "./views.js?v=5.0.0-beta.40";
import { dataLayers, markDirty } from "./session.js?v=5.0.0-beta.40";
import { keepSketchOnTop } from "./maps.js?v=5.0.0-beta.40";

export function buildDataLayer(ld) {
  const gtype = ld.geometryType || "point";
  const rawFields = (ld.fields || []).slice();
  let oidField = ld.objectIdField;
  if (!oidField) { const o = rawFields.find((f) => f.type === "esriFieldTypeOID" || f.type === "oid"); oidField = o ? o.name : "__oid"; }
  if (!rawFields.some((f) => f.name === oidField)) rawFields.unshift({ name: oidField, alias: oidField, type: "esriFieldTypeOID" });
  const fields = rawFields.map((f) => (typeof f.type === "string" && f.type.indexOf("esriFieldType") === 0 ? Field.fromJSON(f) : f));
  const feats = (ld.features || []).map((f, i) => {
    let gj = f.geometry || null;
    if (gj && !gj.type) gj = { ...gj, type: gtype };
    const attrs = { ...(f.attributes || {}) };
    if (attrs[oidField] == null) attrs[oidField] = i + 1;
    return new Graphic({ geometry: gj, attributes: attrs });
  });
  const props = { source: feats, objectIdField: oidField, fields, geometryType: gtype, spatialReference: ld.spatialReference || { wkid: 102100 },
    title: ld.title || "Data", popupEnabled: true,
    // In 3D the features lie on the ground, drawn on the terrain with the basemap: the view has no height to work out
    // for each one, which keeps a spreadsheet layer cheap on a slow device (CSV 3.5).
    elevationInfo: { mode: "on-the-ground" } };
  if (ld.id) props.id = DATA_LAYER_PREFIX + ld.id;   // same id as its saved operational layer, so bookmarks find it again
  if (ld.renderer) { const rj = ld.renderer; props.renderer = rj.type && rj.type.indexOf("-") >= 0 ? rj : rendererJsonUtils.fromJSON(rj); }
  if (ld.labelingInfo && ld.labelingInfo.length) props.labelingInfo = ld.labelingInfo.map((l) => (l && l.symbol && l.symbol.type === "esriTS" ? LabelClass.fromJSON(l) : l));
  if (ld.definitionExpression) props.definitionExpression = ld.definitionExpression;   // the layer's filter
  if (ld.popupInfo) props.popupTemplate = { title: ld.popupInfo.title || "", content: ld.popupInfo.content || [{ type: "fields", fieldInfos: ld.popupInfo.fieldInfos || [] }], fieldInfos: ld.popupInfo.fieldInfos || [] };
  const fl = new FeatureLayer(props);
  fl._renderer2d = props.renderer || null;
  fl.labelsVisible = ld.showLabels !== false;
  const def = { ...ld }; delete def.visible; delete def.opacity; delete def.showLabels; delete def.definitionExpression;
  fl._srcDef = def;
  syncColumns(fl);
  return fl;
}
// Columns in 3D (lab, features.columns3d): a spreadsheet layer sized by a number column can stand a column on each point
// in the 3D view, its height showing the number. The layer's saved style stays the 2D one (By size and so on); the
// columns are a way of drawing it in 3D, so 2D, the saved file and other apps are unchanged.
export const COLUMNS_VERSION = "0.4";   // 0.4: kept in a saved file. 0.2: the Size slider sets how thick the columns are. 0.3: the choice is offered in the 3D view only
function columnSymbol(color, width) {
  const c = color && Number.isFinite(color.r) ? [color.r, color.g, color.b] : [0, 121, 193];
  return { type: "point-3d", symbolLayers: [{ type: "object", resource: { primitive: "cylinder" }, anchor: "bottom", width, depth: width, height: width, material: { color: c } }] };
}
function columnRenderer(fl) {
  const sc = columnScale(fl._srcDef), r2 = fl._renderer2d;
  if (!sc || !r2 || !r2.clone) return null;
  const r = r2.clone();
  const sym = (x) => columnSymbol(x && x.color, sc.width);
  if (r.type === "unique-value") { r.uniqueValueInfos = r.uniqueValueInfos.map((u) => ({ value: u.value, label: u.label, symbol: sym(u.symbol) })); r.defaultSymbol = sym(r.defaultSymbol); }
  else if (r.type === "simple") r.symbol = sym(r.symbol);
  else return null;
  const others = (r.visualVariables || []).filter((v) => v.type !== "size");
  r.visualVariables = others.concat([
    { type: "size", field: sc.field, axis: "height", valueUnit: "meters", stops: [{ value: sc.minValue, size: sc.minHeight, label: intl.formatNumber(sc.minValue) }, { value: sc.maxValue, size: sc.maxHeight, label: intl.formatNumber(sc.maxValue) }] },   // labelled, or the legend says "< 0" and "> 20"
    { type: "size", axis: "width-and-depth", useSymbolValue: true }
  ]);
  return r;
}
export function syncColumns(fl) {
  if (!fl || !fl._renderer2d) return;
  let r = null;
  if (F.columns3d === true && state.mode === "3d" && fl._srcDef && fl._srcDef.columns3d) { try { r = columnRenderer(fl); } catch (e) { console.error(e); } }
  const want = r || fl._renderer2d;
  if (r || fl._columnsOn) fl.renderer = want;
  fl._columnsOn = !!r;
}
export function addDataLayer(def, opts) {
  const fl = buildDataLayer(def);
  if (def.visible === false) fl.visible = false;
  if (typeof def.opacity === "number") fl.opacity = def.opacity;
  dataLayers.push(fl);
  activeMap().add(fl);
  keepSketchOnTop();
  if (!(opts && opts.silent)) markDirty();
  return fl;
}

