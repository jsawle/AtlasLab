// ============================================================ ArcGIS Online: sign in, save, update
import "./print.js?v=5.0.0-beta.43";   // first: keeps the files running in the order they were written in (see app.js)
import { AUTHORING_APP, isOwnLayerJson, xyToLonLat } from "../lib/doc.js?v=5.0.0-beta.43";
import { state, late } from "./state.js?v=5.0.0-beta.43";
import { AUTH_STASH, $, cfgName, cfg, F, S, t, PORTAL } from "./config.js?v=5.0.0-beta.43";
import { IdentityManager, OAuthInfo, Portal, esriRequest, restGet } from "./sdk.js?v=5.0.0-beta.43";
import { activeMap } from "./views.js?v=5.0.0-beta.43";
import { markClean, currentTitle, setTitle } from "./session.js?v=5.0.0-beta.43";
import { toast, saveNotes, openModal, closeModal } from "./ui.js?v=5.0.0-beta.43";
import { sourceLayers } from "./maps.js?v=5.0.0-beta.43";
import { isGroup, hasLabels } from "./layers-panel.js?v=5.0.0-beta.43";
import { filterJson } from "./filter-panel.js?v=5.0.0-beta.43";
import { forgetThumbs } from "./topics.js?v=5.0.0-beta.43";
import { forgetBrowse, switchTab, openOpenModal } from "./collection.js?v=5.0.0-beta.43";
import { safeFragment } from "./item-info.js?v=5.0.0-beta.43";
import { buildDocument, buildWebMapJson } from "./local-files.js?v=5.0.0-beta.43";
late.refreshTileTips = refreshTileTips;   // for the start-up files, which run before this one (see late in state.js)

const SIGN = cfg.signIn || {};
const signInConfigured = F.signIn !== false && /^[A-Za-z0-9_-]{8,}$/.test(SIGN.clientId || "");
let oauthInfo = null;
if (signInConfigured) {
  oauthInfo = new OAuthInfo({ appId: SIGN.clientId, portalUrl: PORTAL, popup: SIGN.popup !== false });
  IdentityManager.registerOAuthInfos([oauthInfo]);
  IdentityManager.checkSignInStatus(PORTAL + "/sharing").then(onSignedIn).catch(() => { /* not signed in */ });
}
async function onSignedIn() {
  try {
    const portal = new Portal({ url: PORTAL, authMode: "immediate" });
    await portal.load();
    state.portalUser = portal.user;
  } catch (e) { console.error("Portal load failed", e); state.portalUser = null; }
  if (state.portalUser && state.currentSource && state.currentSource.item && state.currentSource.item.owner === state.portalUser.username) state.currentAgolItem = { id: state.currentSource.itemId, owner: state.portalUser.username, title: state.currentSource.title };
  renderUser();
  return state.portalUser;
}
// Signed out, Save and Save as write a file on this device. Signed in, the same two tiles go to the user's ArcGIS Online account instead
// (Save overwrites the map's own item, Save as asks for a new name), so a file can't carry a map that includes content only that account can see.
// Opening a file works either way.
function applySaveMode() {
  const local = F.localSave !== false, signed = !!state.portalUser;
  for (const id of ["saveTile", "saveAsTile"]) $(id).hidden = !(local || signed);
  $("lockTile").hidden = !local || signed || !F.lockedCopy;   // a locked copy is a file; signed in, maps save to ArcGIS Online. Off unless a config turns it on (features.lockedCopy)
  refreshTileTips();
}
function renderUser() {
  const on = !!state.portalUser;
  $("signInBtn").hidden = on || F.signIn === false || SIGN.headerButton === false;
  $("userWrap").hidden = !on;
  forgetBrowse();
  $("tabArcgis").hidden = !on;
  if (on) {
    const name = state.portalUser.fullName || state.portalUser.username;
    $("userName").textContent = name;
    $("userBtn").setAttribute("aria-label", S.account + ": " + name);
    const av = $("avatar");
    const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    av.textContent = initials;
    try { if (state.portalUser.thumbnailUrl) { av.style.backgroundImage = "url('" + state.portalUser.thumbnailUrl + "')"; av.textContent = ""; } } catch (e) { /* initials */ }
  }
  renderAgol();
  applySaveMode();
}
export function renderAgol() {
  const on = !!state.portalUser;
  $("signInTile").hidden = on || F.signIn === false; $("agolSignedIn").hidden = !on;
}
function startSignIn() {
  if (!signInConfigured) {
    $("signInH").textContent = S.signIn;
    const b = $("signInBody"); b.innerHTML = "";
    for (const k of ["signInNotSet", "signInNotSetAdmin"]) { const p = document.createElement("p"); p.textContent = S[k]; b.appendChild(p); }
    $("signInGo").hidden = true;
    openModal("signInModal");
    return;
  }
  $("signInGo").hidden = false;
  if (SIGN.onboardingTitle || SIGN.onboardingHtml) {
    $("signInH").textContent = SIGN.onboardingTitle || S.signIn;
    const b = $("signInBody"); b.innerHTML = ""; b.appendChild(safeFragment(SIGN.onboardingHtml || ""));
    openModal("signInModal", $("signInGo"));
  } else doSignIn();
}
function stashBeforeRedirect() {
  const rec = { config: cfgName, t: Date.now() };
  if (state.dirty) { try { rec.doc = buildDocument(); } catch (e) { /* skip */ } }
  try { sessionStorage.setItem(AUTH_STASH, JSON.stringify(rec)); }
  catch (e) { try { delete rec.doc; sessionStorage.setItem(AUTH_STASH, JSON.stringify(rec)); } catch (e2) { /* no storage */ } }
  history.replaceState(history.state, "", location.pathname);   // a fixed redirect address (the config is restored after sign-in)
  state.dirty = false;                                                  // the work is stashed; don't block the redirect
}
function doSignIn() {
  closeModal("signInModal");
  if (oauthInfo.popup === false) stashBeforeRedirect();
  IdentityManager.getCredential(PORTAL + "/sharing", { oAuthPopupConfirmation: false })
    .then(onSignedIn)
    .then((u) => { if (u) toast(t("signedInAs", { name: u.fullName || u.username })); })
    .catch((err) => {
      if (!err) return;
      if (err.name === "identity-manager:popup-blocked") toast(S.popupBlocked, 7000);
      else if (err.name !== "identity-manager:user-aborted") toast(t("signInFailed", { msg: err.message || err.name }), 7000);
    });
}
$("signInBtn").addEventListener("click", startSignIn);
$("signInTile").addEventListener("click", startSignIn);
// Save panel tiles: a short explanation on mouse-over and keyboard focus (and to screen readers, as each
// tile's description). It can be dismissed with Escape and hovered over (WCAG 1.4.13).
// eslint-disable-next-line no-var
var TILE_TIPS = {   // var: the config step can ask for the tips before this line has run
  saveTile: () => (state.portalUser ? S.tipSaveSignedIn : window.showSaveFilePicker ? S.tipSave : S.tipSaveDownloads),
  saveAsTile: () => (state.portalUser ? S.tipSaveAsSignedIn : S.tipSaveAs),
  lockTile: () => S.tipLock, shotTile: () => S.tipShot, printTile: () => S.tipPrint, signInTile: () => S.tipSignIn
};
function refreshTileTips() { if (!TILE_TIPS) return; for (const [id, f] of Object.entries(TILE_TIPS)) { const d = $("tip-" + id); if (d) d.textContent = f(); } }
let tipFor = null, tipHide = 0;
function showTileTip(tile) {
  clearTimeout(tipHide);
  const tip = $("tileTip"), f = TILE_TIPS[tile.id];
  if (!f || tile.hidden) return;
  tip.textContent = f(); tip.hidden = false; tipFor = tile;
  const r = tile.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight, gap = 8;
  const below = r.bottom + gap + h <= window.innerHeight - 4 || r.top - gap - h < 4;
  const left = Math.max(6, Math.min(window.innerWidth - w - 6, r.left + r.width / 2 - w / 2));
  tip.style.left = left + "px"; tip.style.top = (below ? r.bottom + gap : r.top - gap - h) + "px";
  tip.dataset.side = below ? "below" : "above";
  tip.style.setProperty("--arrow-x", Math.max(12, Math.min(w - 12, r.left + r.width / 2 - left)) + "px");
}
function hideTileTip(now) { clearTimeout(tipHide); const go = () => { $("tileTip").hidden = true; tipFor = null; }; if (now) go(); else tipHide = setTimeout(go, 150); }
for (const id of Object.keys(TILE_TIPS)) {
  const tile = $(id);
  tile.addEventListener("mouseenter", () => showTileTip(tile));
  tile.addEventListener("mouseleave", () => hideTileTip(false));
  tile.addEventListener("focus", () => { if (tile.matches(":focus-visible")) showTileTip(tile); });
  tile.addEventListener("blur", () => hideTileTip(true));
  tile.addEventListener("click", () => hideTileTip(true));
}
$("tileTip").addEventListener("mouseenter", () => clearTimeout(tipHide));
$("tileTip").addEventListener("mouseleave", () => hideTileTip(false));
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && tipFor) { e.stopPropagation(); e.preventDefault(); hideTileTip(true); } }, true);
window.addEventListener("scroll", () => hideTileTip(true), true);
applySaveMode();   // which Save tiles are offered, and their tips (5.0.0-beta.43: at start-up too, not only after signing in or out)

$("signInGo").addEventListener("click", doSignIn);
export function closeUserMenu(focusBtn) { $("userMenu").hidden = true; $("userBtn").setAttribute("aria-expanded", "false"); if (focusBtn) $("userBtn").focus(); }
$("userBtn").addEventListener("click", () => {
  const open = $("userMenu").hidden;
  $("userMenu").hidden = !open; $("userBtn").setAttribute("aria-expanded", String(open));
  if (open) $("myMapsBtn").focus();
});
$("userMenu").addEventListener("keydown", (e) => {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  e.preventDefault();
  const items = [...$("userMenu").querySelectorAll("button")], i = items.indexOf(document.activeElement);
  items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length].focus();
});
document.addEventListener("click", (e) => { if (!$("userMenu").hidden && !$("userWrap").contains(e.target)) closeUserMenu(false); });
$("myMapsBtn").addEventListener("click", () => { closeUserMenu(false); openOpenModal("tabArcgis"); });
$("signOutBtn").addEventListener("click", () => {
  closeUserMenu(false);
  IdentityManager.destroyCredentials(); forgetThumbs();
  state.portalUser = null; state.currentAgolItem = null;
  renderUser();
  if (!$("tabArcgis").hidden) switchTab("tabGroup");
  ($("signInBtn").hidden ? $("tool-save") : $("signInBtn")).focus();
  if (state.currentSource && state.currentSource.restricted) toast(S.signedOutPrivateLayers, 8000);   // replaces "Signed out." so it isn't missed
  else toast(S.signedOut);
});

const LAYER_TYPE_JSON = { feature: "ArcGISFeatureLayer", "map-image": "ArcGISMapServiceLayer", tile: "ArcGISTiledMapServiceLayer", "vector-tile": "VectorTileLayer",
  imagery: "ArcGISImageServiceLayer", "imagery-tile": "ArcGISTiledImageServiceLayer", csv: "CSV", geojson: "GeoJSON", kml: "KML", wms: "WMS", wfs: "WFS",
  "web-tile": "WebTiledLayer", "geo-rss": "GeoRSS", stream: "ArcGISStreamLayer", "ogc-feature": "OGCFeatureLayer" };
// Operational layer JSON for a layer added from the collection. A layer that came from a saved map keeps its saved JSON.
// A layer's web map JSON as it is now: shown or not, transparency, labels on or off, and for a group its layers in
// their current order (any removed in Map layers left out).
function patchOpJson(op, l) {
  const out = { ...op, visibility: l.visible !== false, opacity: typeof l.opacity === "number" ? l.opacity : 1 };
  if (hasLabels(l)) out.showLabels = l.labelsVisible !== false;
  if (isGroup(l) && Array.isArray(op.layers)) {
    out.layers = l.layers.toArray().map((s) => { const o = op.layers.find((x) => x && x.id === s.id); return o ? patchOpJson(o, s) : layerToJson(s); }).filter(Boolean);
  }
  return filterJson(out, l);
}
export function layerToJson(l) {
  const visibility = l.visible !== false, opacity = typeof l.opacity === "number" ? l.opacity : 1;
  if (l.__opJson) return { ...patchOpJson(l.__opJson, l), id: l.id, title: l.title || l.__opJson.title };
  const base = { id: l.id, title: l.title, visibility, opacity };
  if (hasLabels(l)) base.showLabels = l.labelsVisible !== false;
  if (l.type === "group") { const layers = l.layers.toArray().map(layerToJson).filter(Boolean); return layers.length ? { ...base, layerType: "GroupLayer", layers } : null; }
  const layerType = LAYER_TYPE_JSON[l.type];
  if (!layerType) { console.warn("Can't save a layer of type", l.type, l.title); return null; }
  const out = { ...base, layerType };
  if (l.portalItem && l.portalItem.id) out.itemId = l.portalItem.id;
  if (l.type === "feature") { if (l.url) out.url = l.layerId != null ? l.url + "/" + l.layerId : l.url; }
  else if (l.type === "vector-tile") { if (l.url) out.styleUrl = /\.json(\?|$)/i.test(l.url) ? l.url : l.url.replace(/\/?$/, "/resources/styles/root.json"); }
  else if (l.type === "web-tile") { if (l.urlTemplate) out.templateUrl = l.urlTemplate; }
  else if (l.url) out.url = l.url;
  return out.url || out.styleUrl || out.templateUrl || out.itemId ? filterJson(out, l) : null;
}
export async function currentBaseMapJson(toFile) {
  const b = activeMap().basemap;
  const id = b && b.portalItem && b.portalItem.id;
  if (toFile && !id && state.currentSource && state.currentSource.restricted) return null;   // a private map's own basemap: the file uses the default one
  if (id) { try { const d = await restGet(`/sharing/rest/content/items/${id}/data`); if (d && d.baseMap) return d.baseMap; } catch (e) { /* fall through */ } }
  if (state.currentSource && state.currentSource.data && state.currentSource.data.baseMap && !id) return state.currentSource.data.baseMap;
  try { const j = b.toJSON(); if (j && j.baseMapLayers && j.baseMapLayers.length) return j; } catch (e) { /* fall through */ }
  try { const d = await restGet(`/sharing/rest/content/items/${cfg.defaultBasemap}/data`); if (d && d.baseMap) return d.baseMap; } catch (e) { /* offline */ }
  return null;   // the file still opens: the app's default basemap is used
}
// The opened map's own layers as they are now, in map order; layers removed in Map layers are left out.
export function sourceLayersJson(toFile) {
  if (!state.currentSource || !state.currentSource.data) return [];
  const ops = (state.currentSource.data.operationalLayers || []).filter((op) => !isOwnLayerJson(op));
  if (toFile && state.currentSource.restricted) { state.privateLeftOut = ops.length; return []; }
  return sourceLayers().map((l) => { const op = ops.find((o) => o.id === l.id); return op ? patchOpJson(op, l) : null; }).filter(Boolean);
}
async function screenshotBlob(w, h) {
  try { const s = await state.view.takeScreenshot({ width: w, height: h, format: "png" }); return await (await fetch(s.dataUrl)).blob(); } catch (e) { return null; }
}
function agolStatus(html) { $("agolStatus").innerHTML = ""; if (html) $("agolStatus").appendChild(html); }
async function saveToArcGIS(update) {
  if (!state.portalUser) { startSignIn(); return; }
  const user = state.portalUser.username;
  // A role without the create-content privilege can't add items. The portal lists a user's privileges; if it doesn't, the server's own error is shown instead.
  if (!update && Array.isArray(state.portalUser.privileges) && state.portalUser.privileges.length && !state.portalUser.privileges.includes("portal:user:createItem")) {
    const s = document.createElement("span"); s.textContent = S.arcgisNoPrivilege; agolStatus(s); return;
  }
  if (state.sceneOnly) { const s = document.createElement("span"); s.textContent = S.sceneNoArcgisSave; agolStatus(s); return; }   // scenes save to this device for now
  const p = document.createElement("span"); p.textContent = S.arcgisSaving; agolStatus(p);
  try {
    const ext = state.view.extent.clone();
    const wmJson = await buildWebMapJson();
    const sw = xyToLonLat(ext.xmin, ext.ymin), ne = xyToLonLat(ext.xmax, ext.ymax);
    const form = new FormData();
    form.append("f", "json");
    // Save overwrites the map's own item and keeps the title in the header; Save as takes the name typed in the dialog.
    const title = update ? currentTitle() : ($("agolTitle").value.trim() || currentTitle());
    form.append("title", title);
    if (!update) {
      form.append("type", "Web Map");
      form.append("typeKeywords", "ArcGIS Online,Explorer Web Map,Map,Online Map,Web Map," + AUTHORING_APP);
      form.append("tags", [...(cfg.agolTags || []), cfg.appName].filter(Boolean).join(","));
      if ($("agolSummary").value.trim()) form.append("snippet", $("agolSummary").value.trim().slice(0, 2048));
    }
    form.append("text", JSON.stringify(wmJson));
    form.append("extent", [sw[0], sw[1], ne[0], ne[1]].map((n) => n.toFixed(6)).join(","));
    const thumb = await screenshotBlob(600, 400);
    if (thumb) form.append("thumbnail", thumb, "thumbnail.png");
    const url = update ? `${PORTAL}/sharing/rest/content/users/${encodeURIComponent(state.currentAgolItem.owner)}/items/${state.currentAgolItem.id}/update`
      : `${PORTAL}/sharing/rest/content/users/${encodeURIComponent(user)}/addItem`;
    const r = await esriRequest(url, { method: "post", body: form, responseType: "json" });
    const d = r.data || {};
    if (d.error || d.success === false) throw new Error((d.error && d.error.message) || "error");
    const id = d.id || (state.currentAgolItem && state.currentAgolItem.id);
    state.currentAgolItem = { id, owner: user, title };
    setTitle(title);   // the name given in the Save dialog becomes the map's name in the header
    markClean();
    renderAgol();
    const box = document.createElement("span");
    box.appendChild(document.createTextNode(S.arcgisSaved + " "));
    const a2 = document.createElement("a"); a2.href = `${PORTAL}/home/item.html?id=${id}`; a2.target = "_blank"; a2.rel = "noopener"; a2.textContent = S.openItemPage;
    box.append(a2);
    agolStatus(box);
    toast(S.arcgisSaved);
    saveNotes(false);
  } catch (e) {
    console.error("Save to ArcGIS Online failed", e);
    const s = document.createElement("span"); s.textContent = t("arcgisFailed", { msg: e.message || e.name || "" }); agolStatus(s);
  }
}
// Signed in: Save overwrites the map's own ArcGIS Online item (a map with none yet, or one that isn't the user's, asks for a name like Save as).
// Save as always opens the dialog and makes a new item.
export function saveToAgol(asNew) {
  if (!asNew && state.currentAgolItem && state.currentAgolItem.owner === state.portalUser.username) { saveToArcGIS(true); return; }
  $("agolTitle").value = currentTitle(); $("agolSummary").value = ""; openModal("agolModal", $("agolTitle"));
}
$("agolConfirm").addEventListener("click", () => { closeModal("agolModal"); saveToArcGIS(false); });

