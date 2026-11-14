// ============================================================ Toast, panels, modals (keyboard accessible)
import "./session.js?v=5.0.0-beta.42";   // first: keeps the files running in the order they were written in (see app.js)
import { state, late } from "./state.js?v=5.0.0-beta.42";
import { $, cfg, F, t } from "./config.js?v=5.0.0-beta.42";
import { need } from "./sdk.js?v=5.0.0-beta.42";
import { syncToolsToggles } from "./views.js?v=5.0.0-beta.42";
import { layoutBottom } from "./session.js?v=5.0.0-beta.42";
import { updatePopupEnabled } from "./popups.js?v=5.0.0-beta.42";
import { selectForEdit, sketchToolsOn } from "./sketch.js?v=5.0.0-beta.42";
import { ensureLegend, ensureGallery, stopMeasuring, ensureProfile, stopProfile, closeToolMenu } from "./legend-basemaps-measure.js?v=5.0.0-beta.42";
import { closeTable, syncDockHeight, renderLayers } from "./layers-panel.js?v=5.0.0-beta.42";
import { endFilter } from "./filter-panel.js?v=5.0.0-beta.42";
import { showBmList } from "./bookmarks.js?v=5.0.0-beta.42";
import { backToLayers, removePreview, leaveData } from "./csv-import.js?v=5.0.0-beta.42";
import { unsavedLayers } from "./local-files.js?v=5.0.0-beta.42";
import { renderAgol, closeUserMenu } from "./arcgis-online.js?v=5.0.0-beta.42";
import { renderVersions } from "./versions.js?v=5.0.0-beta.42";
late.toast = toast;   // for the start-up files, which run before this one (see late in state.js)

let toastTimer = 0;
export function toast(msg, ms) { const el = $("toast"); el.textContent = msg; clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.textContent = ""; }, ms || 3400); }
// Several messages, one after another, each for its own time: [[text, ms], ...], starting after `delay`.
function toastSeries(list, delay) {
  let at = delay || 0;
  for (const [msg, ms] of list) { setTimeout(() => toast(msg, ms), at); at += ms + 300; }
}
// What a save left out, said after the "saved" message has been read.
export function saveNotes(toFile) {
  const notes = [];
  if (unsavedLayers) notes.push([t("layersNotSaved", { n: unsavedLayers }), 5000]);
  if (toFile && state.privateLeftOut) notes.push([t("privateLayersLeftOut", { n: state.privateLeftOut }), 6000]);
  toastSeries(notes, 3000);
}

const PANELS = { data: "dataPanel", layers: "layersPanel", legend: "legendPanel", basemaps: "basemapsPanel",
  measure: "measurePanel", profile: "profilePanel", sketch: "sketchPanel", bookmarks: "bookmarksPanel", save: "savePanel", about: "aboutPanel", filter: "filterPanel" };
const TRIGGERS = { data: "tool-add", layers: "tool-layers", legend: "tool-legend", basemaps: "tool-basemaps",
  measure: "tool-measure", profile: "tool-measure", sketch: "tool-sketch", bookmarks: "tool-bookmarks", save: "tool-save", about: "verBtn", filter: "tool-layers" };
// Elevation profile is a toolbar tool of its own, beside Measure, as in MapMaker today. A version that would rather
// keep it inside Measure's menu sets "elevationTool": "menu" in its settings.
const ELEV_IN_TOOLBAR = cfg.elevationTool !== "menu" && F.elevationProfile !== false;
if (ELEV_IN_TOOLBAR) {
  TRIGGERS.profile = "tool-profile"; $("menuProfile").hidden = true;
  const mb = $("tool-measure"); mb.removeAttribute("aria-haspopup"); mb.setAttribute("aria-controls", "measurePanel");   // Measure opens its panel directly
} else $("tool-profile").hidden = true;
export let openPanelName = null;
function setExpanded(name) {
  // A tool that opens a menu (Measure) shows its open panel by colour; aria-expanded is kept for the menu itself.
  new Set(Object.values(TRIGGERS)).forEach((id) => { const el = $(id); if (!el) return; if (el.getAttribute("aria-haspopup") === "menu") el.classList.remove("active"); else el.setAttribute("aria-expanded", "false"); });
  const el = name && $(TRIGGERS[name]);
  if (el) { if (el.getAttribute("aria-haspopup") === "menu") el.classList.add("active"); else el.setAttribute("aria-expanded", "true"); }
  $("menuMeasure").classList.toggle("active", name === "measure"); $("menuProfile").classList.toggle("active", name === "profile");
}
export function openPanel(name, opts) {
  if (openPanelName && openPanelName !== name) panelClosing(openPanelName);
  for (const [k, id] of Object.entries(PANELS)) $(id).hidden = k !== name;
  openPanelName = name;
  setExpanded(name);
  panelOpening(name);
  updatePopupEnabled();
  if (!opts || opts.focus !== false) { const h = $(PANELS[name]).querySelector("h2"); if (h) h.focus(); }
}
export function closePanels(restoreFocus) {
  const name = openPanelName;
  if (!name) return;
  panelClosing(name);
  const panel = $(PANELS[name]);
  const hadFocus = panel.contains(document.activeElement);
  for (const id of Object.values(PANELS)) $(id).hidden = true;
  openPanelName = null;
  setExpanded(null);
  updatePopupEnabled();
  if (restoreFocus !== false && hadFocus && $(TRIGGERS[name])) $(TRIGGERS[name]).focus();
}
export function togglePanel(name) { if (openPanelName === name) closePanels(); else leaveData(() => openPanel(name)); }
function panelOpening(name) {
  if (name === "sketch") { state.sketchPanelOpen = true; sketchToolsOn(true); selectForEdit(null); need("curves").catch(() => {}); }
  if (name === "layers") renderLayers();
  if (name === "bookmarks") showBmList();
  if (name === "save") renderAgol();
  if (name === "about") renderVersions();
  if (name === "legend") ensureLegend().catch(() => {});
  if (name === "basemaps") ensureGallery();
  if (name === "profile") { closeTable(false); setTimeout(() => { if (openPanelName === "profile") syncDockHeight($("profilePanel")); }, 0); $("app").classList.add("docked"); $("app").classList.remove("tools-shown"); syncToolsToggles(); need("profile").then(() => { if (openPanelName === "profile") ensureProfile(); }).catch(() => {}); }
}
function panelClosing(name) {
  if (name === "sketch") { sketchToolsOn(false); state.sketchPanelOpen = false; }
  if (name === "measure") stopMeasuring();
  if (name === "filter") endFilter();
  if (name === "profile") { stopProfile(); $("app").classList.remove("docked", "tools-shown"); syncToolsToggles(); setTimeout(layoutBottom, 0); }
  if (name === "data") {
    const ed = state.addState && state.addState.editing;
    state.addState = null; state.pendingParse = null; removePreview(true);
    if (ed) {   // editing a layer's style: put the layer back as it was, and go back to Map layers
      ed.layer.visible = ed.wasVisible;
      setTimeout(() => { if (!openPanelName && !modalStack.length) backToLayers(ed.layer.id); }, 0);
    }
  }
}
document.querySelectorAll("[data-panel]").forEach((b) => b.addEventListener("click", () => togglePanel(b.dataset.panel)));
document.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", () => closePanels()));
$("verBtn").addEventListener("click", () => togglePanel("about"));

const modalStack = [];
export function openModal(id, focusEl) {
  const m = $(id);
  if (!m.hidden) return;
  modalStack.push({ id, ret: document.activeElement });
  m.hidden = false;
  setTimeout(() => { const f = focusEl || m.querySelector("h2"); if (f) f.focus(); }, 0);
}
export function closeModal(id) {
  const m = $(id);
  if (!m || m.hidden) return;
  m.hidden = true;
  const i = modalStack.findIndex((x) => x.id === id);
  const rec = i >= 0 ? modalStack.splice(i, 1)[0] : null;
  if (rec && rec.ret && document.contains(rec.ret) && rec.ret.focus) rec.ret.focus();
}
document.querySelectorAll(".modal").forEach((m) => m.addEventListener("click", (e) => { if (e.target === m) closeModal(m.id); }));
document.querySelectorAll("[data-modal-close]").forEach((b) => b.addEventListener("click", () => closeModal(b.closest(".modal").id)));
function focusables(root) { return [...root.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])')].filter((el) => el.offsetParent !== null); }
document.addEventListener("keydown", (e) => {
  if (e.key === "Tab" && modalStack.length) {
    const m = $(modalStack[modalStack.length - 1].id), f = focusables(m);
    if (!f.length) return;
    if (e.shiftKey && (document.activeElement === f[0] || !m.contains(document.activeElement))) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    return;
  }
  if (e.key !== "Escape") return;   // Delete for sketches is the Sketch tools' own
  if (modalStack.length) { e.preventDefault(); closeModal(modalStack[modalStack.length - 1].id); return; }
  if (!$("measureMenu").hidden) { closeToolMenu(true); return; }
  if (!$("userMenu").hidden) { closeUserMenu(true); return; }
  if (openPanelName) closePanels();
});

