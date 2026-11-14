// Atlas: a white-label build of the MapMaker classroom map app.
// ArcGIS Maps SDK for JavaScript 5.2. Everything a distributor changes lives in config/<name>.json.
// Created by Jason Sawle.
// Each ?v= is the app version, so a new release never runs beside a cached older module (tests/run.mjs checks they match).
import { mergeConfig, loadConfig, buildStrings } from "../lib/config.js?v=5.0.0-beta.42";
import { DEFAULT_STRINGS } from "../lib/strings.js?v=5.0.0-beta.42";

export const APP_VERSION = "5.0.0-beta.42";
export const COMPASS_VERSION = "1.1";
export const CHARTS_VERSION = "1.1";
export const PROFILE_VERSION = "3.4";
export const SKETCH_VERSION = "2.2";   // 1.1: rotation only for text. 2.0: the SDK's Sketch component (Map Viewer's tools) replaces the app's own. 2.1: freehand segments. 2.2: keyboard route to the drawing tools
export const CONFIG_SCHEMA = 2;
export const SDK_VERSION = "5.2";
export const AUTH_STASH = "atlas.authReturn";

export const $ = (id) => document.getElementById(id);
export const fmt = (s, o) => String(s == null ? "" : s).replace(/\{(\w+)\}/g, (_, k) => (o && o[k] != null ? o[k] : ""));
export const HEX32 = /^[0-9a-f]{32}$/i;
export const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// ============================================================ Config
const DEFAULT_CONFIG = {
  configVersion: 1,
  appName: "School Atlas",
  locale: "en", dir: "ltr",
  logo: { url: "", compactUrl: "", alt: "", link: "", showName: false },
  showAppName: true,       // false: no name in the header (the browser tab still uses appName)
  headerLinks: [],
  partnerLogos: [],
  theme: { brand: "#0b5c8e", brandInk: "", brandSoft: "", toolActive: "", toolActiveInk: "", header: "#ffffff", headerInk: "", headerLine: "#e1e1e1", pill: "#000000", pillInk: "", font: "" },
  portalUrl: "https://www.arcgis.com",
  contentGroup: "c3ac404ac811494ea6fa116abc0cf39b",   // "Schools Living Atlas – 5.0 test" (GIS 4 Schools), while 5.0 is a pilot (5.0.0-beta.41). The live MapMaker group is 36443e9570294a1f883b5d2c5abfe6b5: config/mapmaker-live.json
  basemapGroup: "406646c98d0f4c608a9438d40ce2df9e",
  defaultBasemap: "a82ff7ce1c3a493f9d82aa89f5a1ddcf",
  startView: { center: [0, 20], zoom: 2 },
  threeDTilt: 60,          // degrees the camera tilts when switching to 3D, so the change is obvious (0 = stay looking straight down)
  threeDQuality: "auto",   // how much work the 3D view does: "auto" (low on a weak device, else medium), "low", "medium" or "high"
  units: "auto",            // "auto": miles and feet on a device set to a US time zone, kilometres and metres elsewhere (lib/units.js); or "metric" / "imperial"
  unitsSwitch: true,        // the km / mi switch in Measure and Elevation; the choice is remembered on the device
  scalebar: "dual",
  disclaimer: "",
  signIn: { clientId: "", popup: true, headerButton: true, onboardingTitle: "", onboardingHtml: "" },
  agolTags: ["school map"],
  csvMaxRows: 1000,
  features: { openMap: true, addLayer: true, csv: true, layers: true, legend: true, basemaps: true, measure: true, sketch: true,
    bookmarks: true, threeD: true, save: true, localSave: true, screenshot: true, print: true, search: true, signIn: true, compass: true, elevationProfile: true, filter: true },
  strings: {}
};
function readAuthStash() {
  try {
    const s = JSON.parse(sessionStorage.getItem(AUTH_STASH) || "null");
    sessionStorage.removeItem(AUTH_STASH);
    if (s && Date.now() - (s.t || 0) < 30 * 60 * 1000) return s;
  } catch (e) { /* storage unavailable */ }
  return null;
}
export const params = new URLSearchParams(location.search);
const returningFromSignIn = params.has("code") && params.has("state");
export const authStash = returningFromSignIn ? readAuthStash() : null;
export let cfgName = (params.get("config") || (authStash && authStash.config) || "default").replace(/[^\w-]/g, "") || "default";
const fetchJson = async (path) => { const r = await fetch(path, { cache: "no-cache" }); if (!r.ok) throw new Error(String(r.status)); return r.json(); };
const loaded = await loadConfig(cfgName, fetchJson);
cfgName = loaded.name;
export const rawCfg = loaded.raw, cfgChain = loaded.chain, configMissing = loaded.missing, localeFile = loaded.localeFile, localeMissing = loaded.localeMissing;
if (configMissing) console.warn("Config not found:", configMissing);
export const cfg = mergeConfig(DEFAULT_CONFIG, rawCfg);
for (const k of ["contentGroup", "basemapGroup", "defaultBasemap"]) if (!HEX32.test(cfg[k] || "")) { console.warn("Config " + k + " isn't a 32-character item or group ID; using the default."); cfg[k] = DEFAULT_CONFIG[k]; }
export const F = cfg.features;
export const S = buildStrings(DEFAULT_STRINGS, localeFile, cfg);
const APPV = { app: cfg.appName };
export const t = (key, o) => fmt(S[key] != null ? S[key] : key, { ...APPV, ...(o || {}) });
export const PORTAL = String(cfg.portalUrl || "https://www.arcgis.com").replace(/\/+$/, "");

