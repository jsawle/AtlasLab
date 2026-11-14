// ============================================================ Pop-ups
import "./ui.js?v=5.0.0-beta.42";   // first: keeps the files running in the order they were written in (see app.js)
import { state } from "./state.js?v=5.0.0-beta.42";
import { mapView } from "./views.js?v=5.0.0-beta.42";
import { openPanelName } from "./ui.js?v=5.0.0-beta.42";

export function updatePopupEnabled() {
  const on = !state.sketchPanelOpen && !state.measureActive && openPanelName !== "profile";
  for (const v of [mapView, state.sceneView]) {
    if (!v) continue;
    v.popupEnabled = on;
    if (!on) { try { v.closePopup(); } catch (e) { /* no popup */ } }
  }
}

