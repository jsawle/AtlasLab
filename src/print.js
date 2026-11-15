// ============================================================ Print (in the browser; nothing is sent to a print service)
import "./saved-maps.js?v=5.0.0-beta.60";   // first: keeps the files running in the order they were written in (see app.js)
import { OUTLINE_MAPS, outlineUrl, outlineShapes, outlineLabel } from "../lib/outline.js?v=5.0.0-beta.60";
import { state } from "./state.js?v=5.0.0-beta.60";
import { $, cfg, F, S } from "./config.js?v=5.0.0-beta.60";
import { isSketch } from "./views.js?v=5.0.0-beta.60";
import { currentTitle } from "./session.js?v=5.0.0-beta.60";
import { toast, openModal, closeModal } from "./ui.js?v=5.0.0-beta.60";
import { eachToggleableLayer } from "./layers-panel.js?v=5.0.0-beta.60";

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


// Print an outline map (lab: features.outlinePrint; lib/outline.js, Outline maps 1.0). A blank map for a class to label
// and colour: the world with its continents, a continent with its countries, the United States with its states. It is
// drawn here as SVG from Esri's public boundary layers, not from the map on screen, so it prints as clean black lines
// on white at any size. Nothing is sent anywhere; the boundaries are fetched once for each map chosen.
const SVG = "http://www.w3.org/2000/svg", outlineData = new Map();
let outlineSeq = 0;
function outlineSvg(map, features, names) {
  const { width, height, shapes } = outlineShapes(map, features, 1000);
  const svg = document.createElementNS(SVG, "svg"); svg.setAttribute("viewBox", `0 0 ${width} ${height}`); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", S[map.label]);
  const bg = document.createElementNS(SVG, "rect"); bg.setAttribute("width", width); bg.setAttribute("height", height); bg.setAttribute("fill", "#fff"); svg.appendChild(bg);
  for (const sh of shapes) { const p = document.createElementNS(SVG, "path"); p.setAttribute("d", sh.d); p.setAttribute("fill", "#fff"); p.setAttribute("stroke", "#000"); p.setAttribute("stroke-width", "0.9"); p.setAttribute("stroke-linejoin", "round"); svg.appendChild(p); }
  if (names) for (const sh of shapes) { const l = outlineLabel(sh); if (!l) continue;
    const t = document.createElementNS(SVG, "text"); t.setAttribute("x", sh.x.toFixed(1)); t.setAttribute("y", (sh.y + l.size * 0.35).toFixed(1)); t.setAttribute("text-anchor", "middle"); t.setAttribute("font-size", l.size); t.setAttribute("font-family", "Arial, Helvetica, sans-serif"); t.setAttribute("fill", "#000"); t.textContent = l.text; svg.appendChild(t); }
  svg.dataset.wide = String(width >= height);
  return svg;
}
async function drawOutline() {
  const seq = ++outlineSeq, map = OUTLINE_MAPS.find((m) => m.id === $("outlineMap").value) || OUTLINE_MAPS[0], box = $("outlinePreview");
  $("outlinePrintBtn").disabled = true; $("outlineStatus").textContent = S.outlineDrawing;
  try {
    if (!outlineData.has(map.id)) { const r = await fetch(outlineUrl(map)); if (!r.ok) throw new Error("HTTP " + r.status); const d = await r.json(); if (!d || !Array.isArray(d.features) || !d.features.length) throw new Error("no features"); outlineData.set(map.id, d.features); }
    if (seq !== outlineSeq) return;
    box.replaceChildren(outlineSvg(map, outlineData.get(map.id), $("outlineNames").checked));
    $("outlineStatus").textContent = S.outlineReady; $("outlinePrintBtn").disabled = false;
  } catch (e) { if (seq !== outlineSeq) return; console.error(e); box.replaceChildren(); $("outlineStatus").textContent = S.outlineFailed; }
}
if (F.outlinePrint) {
  for (const m of OUTLINE_MAPS) { const o = document.createElement("option"); o.value = m.id; o.textContent = S[m.label]; $("outlineMap").appendChild(o); }
  $("outlineTile").addEventListener("click", () => { openModal("outlineModal"); drawOutline(); });
  $("outlineMap").addEventListener("change", drawOutline); $("outlineNames").addEventListener("change", drawOutline);
  $("outlinePrintBtn").addEventListener("click", () => {
    const svg = $("outlinePreview").querySelector("svg"); if (!svg) return;
    const wide = svg.dataset.wide === "true", sheet = $("printSheet"); sheet.innerHTML = ""; sheet.classList.add("outline"); sheet.classList.toggle("tall", !wide);
    const line = document.createElement("p"); line.className = "name-line"; line.textContent = S.outlineNameDate;
    const meta = document.createElement("div"); meta.className = "meta"; meta.textContent = S.outlineSource + " · " + cfg.appName;
    sheet.append(line, svg.cloneNode(true), meta);
    const page = document.createElement("style"); page.textContent = `@media print{ @page{ size:${wide ? "landscape" : "portrait"}; margin:10mm; } }`; document.head.appendChild(page);
    const done = () => { page.remove(); sheet.classList.remove("outline", "tall"); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    closeModal("outlineModal"); window.print();
  });
}
