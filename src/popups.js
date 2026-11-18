// ============================================================ Pop-ups and the map by keyboard
// Turns pop-ups off while Sketch, Measure or the Elevation profile is in use, and back on after. With the map focused,
// Enter opens the pop-up of what is at the centre of the map, as a click there would, and a cross marks the centre
// while the keyboard is in use (Keyboard on the map 1.1).
import "./ui.js?v=5.0.0-beta.76";   // first: keeps the files running in the order they were written in (see app.js)
import { state } from "./state.js?v=5.0.0-beta.76";
import { mapView, onViews } from "./views.js?v=5.0.0-beta.76";
import { openPanelName, toast } from "./ui.js?v=5.0.0-beta.76";
import { $, S } from "./config.js?v=5.0.0-beta.76";
import { reactiveUtils } from "./sdk.js?v=5.0.0-beta.76";

/**
 * Turns pop-ups off while Sketch, Measure or the Elevation profile is in use, and back on after, in both views.
 */
export function updatePopupEnabled() {
  const on = !state.sketchPanelOpen && !state.measureActive && openPanelName !== "profile";
  for (const v of [mapView, state.sceneView]) {
    if (!v) continue;
    v.popupEnabled = on;
    if (!on) { try { v.closePopup(); } catch (e) { /* no popup */ } }
  }
}


// ---- The map by keyboard (5.0.0-beta.57; Keyboard on the map 1.0)
// Pop-ups needed a mouse. With the map focused, the arrow keys move it and + and - zoom (the SDK's own); now Enter opens
// what is at the centre of the map, as a click there would. A cross marks the centre while the map has the keyboard's
// focus, so it is plain which place Enter (and, in Elevation, Space) means.
/**
 * Shows or hides the cross at the centre of the map, which marks what Enter will open.
 * @param {boolean} on
 */
export function showCentre(on) { const m = $("centreMark"); if (m) m.hidden = !on; }
// The map's own surface is inside the map component (its shadow tree), where this page's styles do not reach: the ring
// and the cross are drawn over the map by the page, when the surface has the focus and the keyboard was the last thing used.
// 1.1 (5.0.0-beta.65): the app keeps track of that itself. The browser's own test (:focus-visible) also says yes when the
// map is given the focus by code after a click or tap on something that can't take the focus, and the SDK does give it the
// focus when Sketch starts drawing; in Safari a tap on a button counts, so on an iPad the ring and cross showed with no keyboard.
let byKeyboard = false, marked = false;
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "CapsLock", "Fn", "FnLock", "OS", "Hyper", "Super"]);
function surfaceFocused() {
  if (!$("mapWrap").contains(document.activeElement)) return false;
  let a = document.activeElement; while (a && a.shadowRoot && a.shadowRoot.activeElement) a = a.shadowRoot.activeElement;
  return !!(a && a.classList && a.classList.contains("esri-view-surface"));
}
function markMap() {
  const on = byKeyboard && surfaceFocused();
  if (on === marked) return;
  marked = on; showCentre(on); $("mapRing").hidden = !on;
}
document.addEventListener("keydown", (e) => { if (MODIFIER_KEYS.has(e.key) || e.metaKey || e.ctrlKey) return; byKeyboard = true; markMap(); }, true);
document.addEventListener("pointerdown", () => { byKeyboard = false; markMap(); }, true);

// Tap or click (5.0.0-beta.75): what the app tells a student to do with the map says "tap" when the last pointer on the
// page was a finger or a pen, and "click" for a mouse or trackpad. Before any pointer has been used, a device whose main
// pointer can't hover (an iPad, a phone) counts as touch. The wording is the key with "Touch" on the end, where there is one.
let touchLast = (() => { try { return matchMedia("(hover: none)").matches; } catch (e) { return false; } })();
const wordWatchers = [];
document.addEventListener("pointerdown", (e) => {
  const touch = e.pointerType === "touch" || e.pointerType === "pen";
  if (touch === touchLast) return;
  touchLast = touch;
  for (const f of wordWatchers) try { f(); } catch (err) { /* one part's wording failed: the others still change */ }
}, true);
/** Whether the last pointer used was a finger or a pen (or, before any, whether the device can't hover). @returns {boolean} */
export const usesTouch = () => touchLast;
/**
 * The wording for a key, in the words for the hand in use: S[key + "Touch"] after a finger or pen, where there is one.
 * @param {string} key a key of S
 * @returns {string}
 */
export function handWords(key) { return (touchLast && S[key + "Touch"]) || S[key]; }
/**
 * Runs fn whenever the hand in use changes between touch and a mouse, so wording on screen can follow.
 * @param {function} fn
 */
export function onHandChange(fn) { wordWatchers.push(fn); }
$("mapWrap").addEventListener("focusin", markMap);
$("mapWrap").addEventListener("focusout", () => { if (marked) { marked = false; showCentre(false); $("mapRing").hidden = true; } });
async function popupAtCentre() {
  const v = state.view; if (!v) return;
  const at = { x: v.width / 2, y: v.height / 2 };
  let found = false, features = null;
  // inside a fill laid on the ground in 3D: what is there is found apart (view-mode.js, 5.0.0-beta.71)
  const draped = state.drapedPopup && state.drapedPopup(v, v.toMap(at), at);
  if (draped) { features = await draped; found = features.length > 0; }
  else try { const hit = await v.hitTest(at); found = hit.results.some((r) => r.type === "graphic" && r.graphic && r.graphic.layer && r.graphic.layer.popupEnabled !== false && (r.graphic.layer.popupTemplate || r.graphic.popupTemplate || r.graphic.layer.type === "graphics")); } catch (e) { /* nothing there */ }
  if (!found) { toast(S.nothingAtCentre, 5000); return; }
  try {
    await v.openPopup(features ? { features, location: v.toMap(at), updateLocationEnabled: false } : { location: v.toMap(at), fetchFeatures: true });
    // the keyboard goes into the pop-up once it has something to show, and back to the map when it closes
    const got = await Promise.race([reactiveUtils.whenOnce(() => v.popup && v.popup.visible && v.popup.selectedFeature).then(() => true), new Promise((res) => setTimeout(() => res(false), 6000))]);
    if (!got) { try { v.closePopup(); } catch (e) { /* none open */ } toast(S.nothingAtCentre, 5000); return; }      // something was there, with nothing to say
    toast(S.popupOpened, 6000);      // said to a screen reader; moving the focus into the pop-up below does not always take
    setTimeout(() => {
      try {
        const root = v.container.getRootNode(), box = root.querySelector(".esri-popup") || root.querySelector(".esri-features") || v.popup.container;      // the pop-up is drawn inside the map component
        const first = box && box.querySelector("calcite-action, button, a[href]");
        if (box && !box.dataset.atlasEsc) { box.dataset.atlasEsc = "1"; box.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); v.closePopup(); } }); }
        if (first && typeof first.setFocus === "function") first.setFocus(); else if (first) first.focus(); else v.popup.focus();
      } catch (e) { /* stays on the map */ }
    }, 300);
    reactiveUtils.whenOnce(() => !(v.popup && v.popup.visible)).then(() => { if (state.view === v) v.focus(); }).catch(() => {});
  } catch (e) { toast(S.nothingAtCentre, 5000); }
}
onViews("key-down", (e) => {
  if (e.key === "Escape" && state.view && state.view.popup && state.view.popup.visible) { e.stopPropagation(); state.view.closePopup(); return; }      // Escape on the map closes an open pop-up
  if (e.key !== "Enter" || e.repeat) return;
  const v = state.view; if (!v || !v.popupEnabled) return;      // off while sketching, measuring or drawing a profile: Enter is theirs there
  e.stopPropagation(); popupAtCentre();
});
