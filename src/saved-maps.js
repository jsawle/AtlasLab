// ============================================================ Saved maps on this device (Open map > My map files)
// Every save adds the map to a list kept in this browser (lib/recent.js), newest first. In Chrome and Edge the list keeps
// a handle to the file, so Open reads the file itself and Save goes on writing to it; browsers that can only download
// (Safari, Firefox) keep a copy of the saved map instead, as they can't open a file again by themselves.
import "./local-files.js?v=5.0.0-beta.44";   // first: keeps the files running in the order they were written in (see app.js)
import { makeEntry, openRecentStore } from "../lib/recent.js?v=5.0.0-beta.44";
import { state } from "./state.js?v=5.0.0-beta.44";
import { APP_VERSION, $, cfgName, cfg, S, t } from "./config.js?v=5.0.0-beta.44";
import { bindOpened, confirmDiscard, currentTitle, titleFromFileName } from "./session.js?v=5.0.0-beta.44";
import { toast } from "./ui.js?v=5.0.0-beta.44";
import { openDocText } from "./local-files.js?v=5.0.0-beta.44";

let recentStore = null, recentFailed = false, savedSeq = 0;
async function recentDb() {
  if (recentStore || recentFailed) return recentStore;
  try { recentStore = await openRecentStore(window.indexedDB, cfgName); }
  catch (e) { console.warn("This browser isn't keeping a list of saved maps", e); recentFailed = true; }
  return recentStore;
}
async function mapPicture() {
  try { return (await state.view.takeScreenshot({ width: 300, height: 200, format: "jpg", quality: 72 })).dataUrl; } catch (e) { return null; }
}
export async function recordSave(o) {
  try {
    const db = await recentDb();
    if (!db) return;
    const picture = mapPicture();   // taken now, while the map shows what was saved
    const entry = makeEntry({ scope: cfgName, title: currentTitle(), fileName: o.fileName, handle: o.handle || null, json: o.json || null, appVersion: APP_VERSION });
    const stored = await db.record(entry, o.handle ? (h) => h.isSameEntry(o.handle) : null);
    const showing = () => !$("openModal").hidden && !$("paneDevice").hidden;
    if (showing()) renderSavedMaps();
    const thumb = await picture;
    if (thumb) { await db.setThumb(stored.id, thumb); if (showing()) renderSavedMaps(); }
  } catch (e) { console.warn("Couldn't add the map to the saved list", e); }
}
function savedWhen(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  try { return d.toLocaleString(cfg.locale || undefined, { dateStyle: "medium", timeStyle: "short" }); } catch (e) { return d.toLocaleString(); }
}
function savedCard(r) {
  const title = titleFromFileName(r.fileName) || r.title || S.untitled;   // the name the map opens with (from its file)
  const li = document.createElement("li"); li.className = "cat-card"; li.dataset.id = r.id;
  const top = document.createElement("div"); top.className = "cat-card-top";
  const txt = document.createElement("div"); txt.className = "cat-card-text";
  const h = document.createElement("h4"); h.className = "cat-card-title"; h.textContent = title;
  const meta = document.createElement("p"); meta.className = "dev-meta"; meta.textContent = [t("savedOn", { date: savedWhen(r.savedAt) }), r.fileName].filter(Boolean).join(" · ");
  const acts = document.createElement("div"); acts.className = "dev-acts";
  const rm = document.createElement("button"); rm.type = "button"; rm.className = "cat-act quiet"; rm.textContent = S.removeFromList;
  rm.setAttribute("aria-label", S.removeFromList + ": " + title);   // the visible words first, then the map
  rm.addEventListener("click", () => removeSavedMap(r.id, title));
  const open = document.createElement("button"); open.type = "button"; open.className = "cat-act"; open.textContent = S.openThisMap;
  open.setAttribute("aria-label", S.openThisMap + ": " + title);
  open.addEventListener("click", () => openSavedMap(r.id));
  acts.append(rm, open);
  txt.append(h, meta, acts);
  const th = document.createElement("div"); th.className = "cat-thumb open" + (r.thumb ? "" : " blank"); th.setAttribute("aria-hidden", "true");
  if (r.thumb) th.style.backgroundImage = "url('" + r.thumb + "')";   // a checked data: URL (lib/recent.js)
  else th.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" focusable="false"><path d="M2.5 6.5 9 4l6 2.5L21.5 4v13.5L15 20l-6-2.5-6.5 2.5z"/><path d="M9 4v13.5M15 6.5V20"/></svg>';
  th.addEventListener("click", () => openSavedMap(r.id));
  top.append(txt, th);
  li.appendChild(top);
  return li;
}
export async function renderSavedMaps(focusAfter) {
  const seq = ++savedSeq, list = $("savedList"), status = $("savedStatus"), note = $("savedNote");
  const db = await recentDb();
  let rows = null;
  if (db) { try { rows = await db.list(); } catch (e) { console.warn(e); } }
  if (seq !== savedSeq) return;
  list.innerHTML = "";
  if (!rows) { status.textContent = S.savedMapsUnavailable; note.textContent = ""; return; }
  status.textContent = !rows.length ? S.savedMapsNone : rows.length === 1 ? S.savedMapsCountOne : t("savedMapsCount", { n: rows.length });
  note.textContent = !rows.length ? "" : rows.some((r) => !r.hasHandle) ? S.savedMapsNoteCopy : S.savedMapsNote;
  for (const r of rows) list.appendChild(savedCard(r));
  if (focusAfter != null) {
    const cards = [...list.querySelectorAll(".cat-card")];
    const f = cards[Math.min(focusAfter, cards.length - 1)];
    (f ? f.querySelector(".cat-act:not(.quiet)") : $("browseDevice")).focus();
  }
}
async function removeSavedMap(id, title) {
  const db = await recentDb();
  if (!db) return;
  const index = [...$("savedList").querySelectorAll(".cat-card")].findIndex((li) => li.dataset.id === id);
  try { await db.remove(id); toast(t("removedFromList", { title })); } catch (e) { console.warn(e); }
  renderSavedMaps(Math.max(0, index));
}
async function openSavedMap(id) {
  const db = await recentDb();
  const r = db && await db.get(id).catch(() => null);
  if (!r) { renderSavedMaps(); return; }
  const name = (r.handle && r.handle.name) || r.fileName;
  if (r.handle) {
    let text;
    try {
      // The browser asks once whether this site may open the file again (it may remember the answer).
      let perm = r.handle.queryPermission ? await r.handle.queryPermission({ mode: "read" }) : "granted";
      if (perm !== "granted") perm = await r.handle.requestPermission({ mode: "read" });
      if (perm !== "granted") { toast(t("savedMapDenied", { name }), 6000); return; }
      text = await (await r.handle.getFile()).text();
    } catch (e) {
      if (e && e.name === "NotFoundError") toast(t("savedMapMissing", { name }), 7000);
      else if (e && (e.name === "NotAllowedError" || e.name === "SecurityError")) toast(t("savedMapDenied", { name }), 6000);
      else { console.error(e); toast(S.cantRead, 5000); }
      return;
    }
    if (!confirmDiscard()) return;
    if (await openDocText(text, name)) bindOpened(r.handle, text);
    return;
  }
  if (typeof r.json !== "string") { toast(S.cantRead, 5000); return; }
  if (!confirmDiscard()) return;
  if (await openDocText(r.json, name)) bindOpened(null, r.json);
}

