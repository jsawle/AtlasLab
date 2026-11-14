// ============================================================ ArcGIS SDK
// The map library comes from js.arcgis.com. A school network can block it or be slow to deliver it; without it nothing
// on the page works, so the page says so (with a Reload button) and doesn't leave a toolbar that does nothing.
import { late } from "./state.js?v=5.0.0-beta.40";
import { $, cfg, S, PORTAL } from "./config.js?v=5.0.0-beta.40";

const SDK_SLOW_MS = 20000;
function loadNote(text, failed) {
  const box = $("loadNote");
  if (!box) return;
  $("loadNoteText").textContent = text || "";
  $("loadNoteBtn").hidden = !failed;
  box.classList.toggle("failed", !!failed);
  box.hidden = !text;
  if (failed) { $("toolbar").inert = true; $("loadNoteBtn").focus(); }
}
$("loadNoteBtn").addEventListener("click", () => location.reload());
async function loadSdk(paths) {
  const slow = setTimeout(() => loadNote(S.sdkSlow, false), SDK_SLOW_MS);
  try {
    if (typeof $arcgis === "undefined" || !$arcgis.import) throw new Error("The ArcGIS Maps SDK script didn't load");
    const mods = await $arcgis.import(paths);
    clearTimeout(slow); loadNote("", false);
    return mods;
  } catch (e) {
    clearTimeout(slow); loadNote(S.sdkFailed, true);
    throw e;
  }
}
export const [EsriMap, WebMap, WebScene, Camera, GraphicsLayer, FeatureLayer, Graphic, Basemap, Layer,
  Field, LabelClass, rendererJsonUtils, Extent, esriConfig, intl, IdentityManager, OAuthInfo, Portal, esriRequest, reactiveUtils,
  SimpleMarkerSymbol, SimpleLineSymbol, SimpleFillSymbol, TextSymbol] = await loadSdk([
  "@arcgis/core/Map.js", "@arcgis/core/WebMap.js", "@arcgis/core/WebScene.js", "@arcgis/core/Camera.js",
  "@arcgis/core/layers/GraphicsLayer.js", "@arcgis/core/layers/FeatureLayer.js", "@arcgis/core/Graphic.js",
  "@arcgis/core/Basemap.js", "@arcgis/core/layers/Layer.js",
  "@arcgis/core/layers/support/Field.js", "@arcgis/core/layers/support/LabelClass.js", "@arcgis/core/renderers/support/jsonUtils.js",
  "@arcgis/core/geometry/Extent.js", "@arcgis/core/config.js", "@arcgis/core/intl.js", "@arcgis/core/identity/IdentityManager.js",
  "@arcgis/core/identity/OAuthInfo.js", "@arcgis/core/portal/Portal.js", "@arcgis/core/request.js", "@arcgis/core/core/reactiveUtils.js",
  "@arcgis/core/symbols/SimpleMarkerSymbol.js", "@arcgis/core/symbols/SimpleLineSymbol.js", "@arcgis/core/symbols/SimpleFillSymbol.js", "@arcgis/core/symbols/TextSymbol.js"
]);
// The SDK code for a tool is downloaded when the tool is first opened, not when the app starts (5.0.0-beta.4): on a slow
// connection the map is there sooner, and a class that never measures never downloads Measure.
export let ElevationLayer, densifyOperator, WebStyleSymbol, cimSymbolUtils;
const TOOL_CODE = {
  profile: [["@arcgis/core/layers/ElevationLayer.js", (m) => { ElevationLayer = m; }]],
  curves: [["@arcgis/core/geometry/operators/densifyOperator.js", (m) => { densifyOperator = m; }]],
  symbols: [["@arcgis/core/symbols/WebStyleSymbol.js", (m) => { WebStyleSymbol = m; }], ["@arcgis/core/symbols/support/cimSymbolUtils.js", (m) => { cimSymbolUtils = m; }]]
};
const toolCode = {};
export function need(tool) {
  if (!toolCode[tool]) {
    toolCode[tool] = $arcgis.import(TOOL_CODE[tool].map((x) => x[0])).then((mods) => { TOOL_CODE[tool].forEach((x, i) => x[1](mods[i])); })
      .catch((e) => { toolCode[tool] = null; console.error("Couldn't load the " + tool + " tool", e); late.toast(S.sdkFailed, 6000); throw e; });
  }
  return toolCode[tool];
}
// Legend, Measure, Coordinates, Swipe and the table are the SDK's components (5.0.0-beta.13; before, its widgets, which
// SDK 6 removes). A component's code is downloaded by the SDK when its element is first made, so these are still
// fetched only when the tool is first used. Settings go on once the component is ready (set earlier, some are lost).
export async function toolEl(tag, host, props) {
  const el = document.createElement(tag);
  if (host) host.appendChild(el);
  let timer = 0;
  try {
    await Promise.race([customElements.whenDefined(tag), new Promise((_, no) => { timer = setTimeout(() => no(new Error(tag + " did not load")), 45000); })]);
    if (el.componentOnReady) await el.componentOnReady();
  } catch (e) { el.remove(); console.error("Couldn't load " + tag, e); late.toast(S.sdkFailed, 6000); throw e; }
  finally { clearTimeout(timer); }
  Object.assign(el, props || {});
  return el;
}
export function dropEl(el) { if (!el) return; try { if (el.destroy) el.destroy(); } catch (e) { /* gone */ } try { el.remove(); } catch (e) { /* gone */ } }
esriConfig.portalUrl = PORTAL;
try { if (cfg.locale && cfg.locale !== "en") intl.setLocale(cfg.locale); } catch (e) { console.warn("Locale not supported", e); }

export async function restGetUrl(url) { const r = await esriRequest(url, { query: { f: "json" }, responseType: "json" }); if (r.data && r.data.error) throw new Error(r.data.error.message || "Request failed"); return r.data; }
export async function restGet(path, query) {
  const r = await esriRequest(PORTAL + path, { query: { f: "json", ...(query || {}) }, responseType: "json" });
  if (r.data && r.data.error) throw new Error(r.data.error.message || "Request failed");
  return r.data;
}

