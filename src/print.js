// ============================================================ Print (in the browser; nothing is sent to a print service)
import "./saved-maps.js?v=5.0.0-beta.44";   // first: keeps the files running in the order they were written in (see app.js)
import { state } from "./state.js?v=5.0.0-beta.44";
import { $, cfg, S } from "./config.js?v=5.0.0-beta.44";
import { isSketch } from "./views.js?v=5.0.0-beta.44";
import { currentTitle } from "./session.js?v=5.0.0-beta.44";
import { toast } from "./ui.js?v=5.0.0-beta.44";
import { eachToggleableLayer } from "./layers-panel.js?v=5.0.0-beta.44";

$("printTile").addEventListener("click", async () => {
  try {
    const w = 1600, h = Math.round(1600 * Math.max(0.4, Math.min(1.2, state.view.height / Math.max(1, state.view.width))));
    const shot = await state.view.takeScreenshot({ width: w, height: h, format: "png" });
    const sheet = $("printSheet"); sheet.innerHTML = "";
    const h1 = document.createElement("h1"); h1.textContent = currentTitle();
    const img = document.createElement("img"); img.src = shot.dataUrl; img.alt = currentTitle();
    const meta = document.createElement("div"); meta.className = "meta";
    const shown = []; eachToggleableLayer((l, id, title) => { if (l.visible !== false && (!isSketch(l) || l.graphics.length)) shown.push(title); });
    const credits = [...document.querySelectorAll(".esri-attribution__sources")].map((e) => e.textContent.trim()).filter(Boolean)[0] || "";
    const lines = [S.printLayers + ": " + (shown.join(", ") || "—"), credits ? S.printCredits + ": " + credits : "",
      cfg.disclaimer || "", cfg.appName + " · " + new Date().toLocaleDateString(cfg.locale || undefined)];
    for (const line of lines.filter(Boolean)) { const p = document.createElement("p"); p.style.margin = "0 0 3pt"; p.textContent = line; meta.appendChild(p); }
    sheet.append(h1, img, meta);
    await new Promise((res) => { if (img.complete) res(); else { img.onload = res; img.onerror = res; } });
    window.print();
  } catch (e) { console.error(e); toast(S.shotFailed); }
});

