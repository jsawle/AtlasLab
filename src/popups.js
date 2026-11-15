// ============================================================ Pop-ups
import "./ui.js?v=5.0.0-beta.65";   // first: keeps the files running in the order they were written in (see app.js)
import { state } from "./state.js?v=5.0.0-beta.65";
import { mapView, onViews } from "./views.js?v=5.0.0-beta.65";
import { openPanelName, toast } from "./ui.js?v=5.0.0-beta.65";
import { $, S } from "./config.js?v=5.0.0-beta.65";
import { reactiveUtils } from "./sdk.js?v=5.0.0-beta.65";

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
export function showCentre(on) { const m = $("centreMark"); if (m) m.hidden = !on; }
// The map's own surface is inside the map component (its shadow tree), where this page's styles do not reach: the ring
// and the cross are drawn over the map by the page, when the surface takes the keyboard's focus.
// 1.1 (5.0.0-beta.65): only when the focus was moved there with the keyboard. The browser's own :focus-visible is also
// true when a script gives the map the focus (seen on an iPad at start-up, with nobody near a keyboard), so the page
// keeps its own note of whether the last thing used was a key or a pointer or finger.
let byKeys = false;
window.addEventListener("keydown", (e) => { if (!e.metaKey && !e.ctrlKey && !e.altKey) byKeys = true; }, true);
for (const ev of ["pointerdown", "touchstart"]) window.addEventListener(ev, () => { byKeys = false; if (!$("mapRing").hidden) { showCentre(false); $("mapRing").hidden = true; } }, { capture: true, passive: true });
$("mapWrap").addEventListener("focusin", (e) => {
  const t = (e.composedPath && e.composedPath()[0]) || e.target;
  const on = !!(byKeys && t && t.classList && t.classList.contains("esri-view-surface") && t.matches(":focus-visible"));
  showCentre(on); $("mapRing").hidden = !on;
});
$("mapWrap").addEventListener("focusout", () => { showCentre(false); $("mapRing").hidden = true; });
async function popupAtCentre() {
  const v = state.view; if (!v) return;
  const at = { x: v.width / 2, y: v.height / 2 };
  let found = false;
  try { const hit = await v.hitTest(at); found = hit.results.some((r) => r.type === "graphic" && r.graphic && r.graphic.layer && r.graphic.layer.popupEnabled !== false && (r.graphic.layer.popupTemplate || r.graphic.popupTemplate || r.graphic.layer.type === "graphics")); } catch (e) { /* nothing there */ }
  if (!found) { toast(S.nothingAtCentre, 5000); return; }
  try {
    await v.openPopup({ location: v.toMap(at), fetchFeatures: true });
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
