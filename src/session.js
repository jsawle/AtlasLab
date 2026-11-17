// ============================================================ The map being worked on: its file, title and unsaved changes
// Which file the map came from and whether Save may write back to it; whether the map has changes not yet saved (asked
// about before they would be lost, and when the tab is closed); and the map's title, in the header, the browser tab and
// the page heading. Also keeps the bottom of the map clear of the toolbar (layoutBottom).
// Saving. A map file saves back to itself, whichever device it's opened on. A locked map (marked inside the file; see
// LOCK_PROP) is never saved over from this app: opening one is just looking, and Save makes the person's own copy.
// Chrome empties a file as soon as it's picked in the save dialog (File System Access spec), before the app sees which
// file it was. So the text of each locked file opened is kept: if it's picked, it's written straight back, unchanged.
// (A locked file that wasn't opened in this session can't be put back: see README, Known limits.)
import { isLockedText } from "../lib/doc.js?v=5.0.0-beta.75";
import { state, late } from "./state.js?v=5.0.0-beta.75";
import { $, S, t, cfg } from "./config.js?v=5.0.0-beta.75";
import { unfinishedData } from "./csv-import.js?v=5.0.0-beta.75";
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
/**
 * After a map is opened from a file: unlocked, Save writes back to it; locked, Save makes a copy.
 * @param {FileSystemFileHandle|null} h the file opened, where the browser gives one
 * @param {string} text the file's text
 */
export function bindOpened(h, text) {
  state.openedLocked = isLockedText(text);
  state.currentFileHandle = state.openedLocked ? null : h || null;
  if (state.openedLocked) rememberOpened(h, text);
  $("lockedNote").hidden = !state.openedLocked;
}
/**
 * Forgets the file the map came from, so Save asks where to save.
 */
export function unbindFile() { state.currentFileHandle = null; state.openedLocked = false; $("lockedNote").hidden = true; }
export const lockedBase = () => t("lockedFileName", { name: titleSlug() });
export const copyBase = () => {   // "Coast_survey_locked" -> "Coast_survey - my copy"
  const suffix = t("lockedFileName", { name: "" }), base = titleSlug();
  return t("copyFileName", { name: suffix && base.toLowerCase().endsWith(suffix.toLowerCase()) ? base.slice(0, -suffix.length) : base });
};
/**
 * The record kept for a locked file that was opened, if this handle is that file.
 * @param {FileSystemFileHandle} h
 * @returns {Promise<object|null>}
 */
export async function openedEntry(h) {
  for (const o of openedHandles) { try { if (o.h === h || await o.h.isSameEntry(h)) return o; } catch (e) { /* not comparable */ } }
  return null;
}
/**
 * Writes a locked file's original text back to it, after a save went to that same file by mistake.
 * @param {object} o the record from openedEntry
 * @param {FileSystemFileHandle} picked the file that was saved over
 * @returns {Promise<boolean>} whether it worked
 */
export async function restoreOpened(o, picked) {
  try { const w = await picked.createWritable(); await w.write(o.text); await w.close(); return true; } catch (e) { console.error("Couldn't put the opened file back", e); return false; }
}
/**
 * Notes that the map has changes not yet saved.
 */
export function markDirty() { state.dirty = true; }
/**
 * Notes that the map has just been saved or opened.
 */
export function markClean() { state.dirty = false; }
/**
 * Unsaved map changes, or data in Add data / Change style that isn't on the map yet.
 * @returns {boolean} true when there is nothing to lose or the student agrees to lose it
 */
export function confirmDiscard() { return (!state.dirty && !unfinishedData()) || window.confirm(S.discard); }
window.addEventListener("beforeunload", (e) => { if (state.dirty || unfinishedData()) { e.preventDefault(); e.returnValue = ""; } });
function sizeTitle() { const el = $("docTitle"); el.size = Math.max(8, Math.min(60, (el.value || el.placeholder || "").length + 2)); }
$("docTitle").addEventListener("input", () => { markDirty(); sizeTitle(); });
/**
 * The map's title as typed, or "Untitled map" (in the app's language).
 * @returns {string}
 */
export function currentTitle() { return ($("docTitle").value || "").trim() || S.untitled; }
// The browser tab and the page's main heading name the map that is open (5.0.0-beta.58; WCAG 2.4.2, 1.3.1).
function namePage() { const tl = ($("docTitle").value || "").trim(); document.title = tl ? tl + " · " + cfg.appName : cfg.appName; const h = $("pageH1"); if (h) h.textContent = tl ? cfg.appName + ": " + tl : cfg.appName; }
function updateTitleShown() { $("hdrTitle").classList.toggle("empty", !($("docTitle").value || "").trim() && document.activeElement !== $("docTitle")); namePage(); }
/**
 * Sets the map's title in the header, and the browser tab and page heading with it.
 * @param {string} v
 */
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
// The compass and scale bar of a view. They are in the map or scene component's bottom-left slot, outside the view's own
// container (which is inside the component), so they are looked for in the component (5.0.0-beta.75: looked for in the
// container, they were never found, and nothing was ever lifted above the toolbar).
const stackOf = (root) => { const host = root && root.getRootNode && root.getRootNode().host; return ((host || root) && (host || root).querySelector(".ll-stack")) || null; };
// The toolbar scrolls sideways when the screen is too narrow for it; its edges show where there is more (index.html).
function toolbarEdges() { const tb = $("toolbar"); if (!tb) return; tb.classList.toggle("more-left", tb.scrollLeft > 4); tb.classList.toggle("more-right", tb.scrollLeft + tb.clientWidth < tb.scrollWidth - 4); }
$("toolbar").addEventListener("scroll", toolbarEdges, { passive: true });
$("toolbar").addEventListener("focusin", (e) => { const b = e.target && e.target.closest && e.target.closest(".tool, .seg button"); if (b && b.scrollIntoView) b.scrollIntoView({ block: "nearest", inline: "nearest" }); });
/**
 * Fits the bottom of the map round the toolbar: the attribution's height, the corner buttons, and the view's padding so
 * the SDK's controls sit above the toolbar.
 */
export function layoutBottom() {
  toolbarEdges();
  const v = state.view, root = v && v.container;
  const attr = root && root.querySelector(".esri-attribution");
  if (attr) $("mapWrap").style.setProperty("--attr-h", Math.ceil(attr.getBoundingClientRect().height || 16) + "px");
  layoutCorner();
  const tb = $("toolbar").getBoundingClientRect(), stack = stackOf(root);
  if (!v || !stack) return;
  // Lift the compass and scale bar above the toolbar where the toolbar runs into them (5.0.0-beta.75). The view's
  // padding was meant to do it (until 5.0.0-beta.74), but it never found them in the map component's slot (see stackOf):
  // on an upright iPad the scale bar sat under the toolbar's left end and the compass touched it. Phones (640 pixels
  // wide or less) are left as they are for now: their layout is to be reworked.
  stack.style.translate = "";
  const own = stack.getBoundingClientRect(), under = tb.width > 0 && own.width > 0 && window.innerWidth > 640
    && Math.min(own.right, tb.right) - Math.max(own.left, tb.left) > 4 && own.bottom > tb.top - 6;
  stack.style.translate = under ? "0 " + -Math.ceil(own.bottom - tb.top + 8) + "px" : "";
}
const bottomObserver = window.ResizeObserver ? new ResizeObserver(() => layoutBottom()) : null;
/**
 * Watches the toolbar, the attribution and the lower-left controls for size changes and lays out the bottom again;
 * tries again every half second (20 times) until the view's controls exist.
 * @param {number} tries how many times it has tried; leave out
 */
export function watchBottom(tries) {
  const root = state.view && state.view.container, attr = root && root.querySelector(".esri-attribution"), stack = stackOf(root);
  if (bottomObserver) { bottomObserver.disconnect(); bottomObserver.observe($("toolbar")); if (attr) bottomObserver.observe(attr); if (stack) bottomObserver.observe(stack); }
  layoutBottom();
  if ((!attr || !stack) && (tries || 0) < 20) setTimeout(() => watchBottom((tries || 0) + 1), 500);
}
window.addEventListener("resize", layoutBottom);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(layoutBottom);
layoutCorner();
/**
 * The map's title made safe for a file name: letters, digits, - and _ only, 60 characters at most.
 * @returns {string}
 */
export function titleSlug() { return currentTitle().replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "map"; }

