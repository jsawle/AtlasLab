// ============================================================ State
import { isLockedText } from "../lib/doc.js?v=5.0.0-beta.44";
import { state, late } from "./state.js?v=5.0.0-beta.44";
import { $, S, t } from "./config.js?v=5.0.0-beta.44";
import { unfinishedData } from "./csv-import.js?v=5.0.0-beta.44";
late.layoutBottom = layoutBottom;   // for the start-up files, which run before this one (see late in state.js)

export const dataLayers = [];              // FeatureLayers from CSV files (each keeps its definition in _srcDef)
export const portalLayers = new Map();    // itemId -> layer added from the collection
// Saving. A map file saves back to itself, whichever device it's opened on. A locked map (marked inside the file; see
// LOCK_PROP) is never saved over from this app: opening one is just looking, and Save makes the person's own copy.
// Chrome empties a file as soon as it's picked in the save dialog (File System Access spec), before the app sees which
// file it was. So the text of each locked file opened is kept: if it's picked, it's written straight back, unchanged.
// (A locked file that wasn't opened in this session can't be put back: see README, Known limits.)
const openedHandles = [];
function rememberOpened(h, text) { if (h && typeof text === "string" && !openedHandles.some((o) => o.h === h)) openedHandles.push({ h, text }); }
// After a map is opened from a file: unlocked, Save writes back to it; locked, Save makes a copy.
export function bindOpened(h, text) {
  state.openedLocked = isLockedText(text);
  state.currentFileHandle = state.openedLocked ? null : h || null;
  if (state.openedLocked) rememberOpened(h, text);
  $("lockedNote").hidden = !state.openedLocked;
}
export function unbindFile() { state.currentFileHandle = null; state.openedLocked = false; $("lockedNote").hidden = true; }
export const lockedBase = () => t("lockedFileName", { name: titleSlug() });
export const copyBase = () => {   // "Coast_survey_locked" -> "Coast_survey - my copy"
  const suffix = t("lockedFileName", { name: "" }), base = titleSlug();
  return t("copyFileName", { name: suffix && base.toLowerCase().endsWith(suffix.toLowerCase()) ? base.slice(0, -suffix.length) : base });
};
export async function openedEntry(h) {
  for (const o of openedHandles) { try { if (o.h === h || await o.h.isSameEntry(h)) return o; } catch (e) { /* not comparable */ } }
  return null;
}
export async function restoreOpened(o, picked) {
  try { const w = await picked.createWritable(); await w.write(o.text); await w.close(); return true; } catch (e) { console.error("Couldn't put the opened file back", e); return false; }
}
export function markDirty() { state.dirty = true; }
export function markClean() { state.dirty = false; }
// Unsaved map changes, or data in Add data / Change style that isn't on the map yet.
export function confirmDiscard() { return (!state.dirty && !unfinishedData()) || window.confirm(S.discard); }
window.addEventListener("beforeunload", (e) => { if (state.dirty || unfinishedData()) { e.preventDefault(); e.returnValue = ""; } });
function sizeTitle() { const el = $("docTitle"); el.size = Math.max(8, Math.min(60, (el.value || el.placeholder || "").length + 2)); }
$("docTitle").addEventListener("input", () => { markDirty(); sizeTitle(); });
export function currentTitle() { return ($("docTitle").value || "").trim() || S.untitled; }
function updateTitleShown() { $("hdrTitle").classList.toggle("empty", !($("docTitle").value || "").trim() && document.activeElement !== $("docTitle")); }
export function setTitle(v) { $("docTitle").value = (v && String(v).trim()) || ""; sizeTitle(); updateTitleShown(); }
$("docTitle").addEventListener("blur", updateTitleShown);
// Saved maps are .amap files (Atlas map). .mmap files from versions before 1.7 open too.
export const FILE_EXT = ".amap", OPEN_EXTS = [".amap", ".mmap", ".json"];
export const titleFromFileName = (name) => String(name || "").replace(/\.(amap|mmap|json)$/i, "").replace(/[_-]+/g, " ").trim();
sizeTitle(); updateTitleShown();
// Keep the disclaimer and credit clear of the toolbar: lift them above it when they would overlap.
function layoutCorner() {
  const c = document.querySelector(".corner"), tb = $("toolbar");
  if (!c || !tb) return;
  c.classList.remove("raised");
  const a = c.getBoundingClientRect(), b = tb.getBoundingClientRect();
  if (a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top) c.classList.add("raised");
}
// Keep the toolbar clear of the attribution bar (it grows when the disclaimer wraps on phones), and lift the
// compass and scale bar above the toolbar when the toolbar would cover them (phones, narrower laptops).
const uiBottom = new WeakMap(), uiBase = new WeakMap();
export function layoutBottom() {
  const v = state.view, root = v && v.container;
  const attr = root && root.querySelector(".esri-attribution");
  if (attr) $("mapWrap").style.setProperty("--attr-h", Math.ceil(attr.getBoundingClientRect().height || 16) + "px");
  layoutCorner();
  const tb = $("toolbar").getBoundingClientRect(), stack = root && root.querySelector(".ll-stack");
  if (!v || !v.ui || !stack) return;
  if (!uiBase.has(v)) { const p = v.ui.padding || {}; uiBase.set(v, { top: p.top ?? 15, left: p.left ?? 15, right: p.right ?? 15, bottom: p.bottom ?? 30 }); }
  const base = uiBase.get(v), s = stack.getBoundingClientRect(), wrap = $("mapWrap").getBoundingClientRect();
  const covered = tb.width > 0 && s.width > 0 && s.left < tb.right && s.right > tb.left;
  const bottom = covered ? Math.round(wrap.bottom - tb.top) + 8 : base.bottom;   // the SDK's own padding already allows for the attribution
  if (uiBottom.get(v) === bottom) return;
  uiBottom.set(v, bottom);
  try { v.ui.padding = { ...base, bottom }; } catch (e) { /* keep the SDK default */ }
}
const bottomObserver = window.ResizeObserver ? new ResizeObserver(() => layoutBottom()) : null;
export function watchBottom(tries) {
  const root = state.view && state.view.container, attr = root && root.querySelector(".esri-attribution"), stack = root && root.querySelector(".ll-stack");
  if (bottomObserver) { bottomObserver.disconnect(); bottomObserver.observe($("toolbar")); if (attr) bottomObserver.observe(attr); if (stack) bottomObserver.observe(stack); }
  layoutBottom();
  if ((!attr || !stack) && (tries || 0) < 20) setTimeout(() => watchBottom((tries || 0) + 1), 500);
}
window.addEventListener("resize", layoutBottom);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(layoutBottom);
layoutCorner();
export function titleSlug() { return currentTitle().replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "map"; }

