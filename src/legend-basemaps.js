// ============================================================ Legend and basemaps
// The Legend panel (the SDK's legend component, made the first time it opens) and the Basemaps panel: the basemap
// group's maps as a grid of cards in the group's own order (lib/basemaps.js), with the map's basemap marked; the arrow
// keys move between the cards.
import "./sketch.js?v=5.0.0-beta.75";   // first: keeps the files running in the order they were written in (see app.js)
import { groupSort, basemapItems, thumbnailUrl, selectedId, needsDataTitles, gridMove } from "../lib/basemaps.js?v=5.0.0-beta.75";
import { state } from "./state.js?v=5.0.0-beta.75";
import { $, cfg, S, PORTAL } from "./config.js?v=5.0.0-beta.75";
import { Basemap, reactiveUtils, toolEl, restGet } from "./sdk.js?v=5.0.0-beta.75";
import { activeMap } from "./views.js?v=5.0.0-beta.75";
import { markDirty } from "./session.js?v=5.0.0-beta.75";
import { toast } from "./ui.js?v=5.0.0-beta.75";
import { shownMap } from "./maps.js?v=5.0.0-beta.75";

export let legend = null, legendMaking = null;
/**
 * Makes the legend the first time it is needed (loading its code), and points it at the view on screen.
 * @returns {Promise<void>}
 */
export async function ensureLegend() {
  if (!legend) { legendMaking = legendMaking || toolEl("arcgis-legend", $("legendBody"), { view: state.view }); try { legend = await legendMaking; } catch (e) { legendMaking = null; throw e; } }
  legend.view = state.view;
}

// Basemaps, as MapMaker shows them: the basemap group's web maps (and, in 3D, its web scenes) as a two-column grid of
// cards, in the group's own order (MapMaker's: date added, newest first). The card for the map's basemap is selected.
export const gallery = { items: null, loading: null, dataTitles: null, fetchingTitles: false };
async function loadGalleryItems() {
  if (gallery.items) return gallery.items;
  if (!gallery.loading) gallery.loading = (async () => {
    const group = await restGet(`/sharing/rest/community/groups/${cfg.basemapGroup}`);
    const d = await restGet(`/sharing/rest/content/groups/${cfg.basemapGroup}/search`, { q: "*", num: 100, start: 1, ...groupSort(group) });
    return d.results || [];
  })();
  try { gallery.items = await gallery.loading; return gallery.items; }
  catch (e) { console.error("Basemaps couldn't load", e); return null; }
  finally { gallery.loading = null; }
}
const galleryList = () => basemapItems(gallery.items || [], state.mode);
function currentBasemapInfo() {
  const m = shownMap(), b = m && m.basemap;
  return b ? { itemId: (b.portalItem && b.portalItem.id) || null, title: b.title || "" } : null;
}
/**
 * Marks the basemap the map uses now in the Basemaps panel.
 */
export function syncGallerySelection() {
  if (!gallery.items) return;
  const list = galleryList(), info = currentBasemapInfo();
  const sel = selectedId(list, info, gallery.dataTitles);
  $("basemapsGrid").querySelectorAll(".bmg-card").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.id === sel)));
  // A basemap from inside a web map (a saved file, a collection map) is named as in its item's data, which can differ
  // from the card's name: fetch those names once, then look again.
  if (!sel && !gallery.dataTitles && !gallery.fetchingTitles && needsDataTitles(list, info)) {
    gallery.fetchingTitles = true;
    Promise.all(gallery.items.map((it) => restGet(`/sharing/rest/content/items/${it.id}/data`).then((d) => [it.id, (d && d.baseMap && d.baseMap.title) || ""], () => [it.id, ""])))
      .then((pairs) => { gallery.dataTitles = new Map(pairs); }).finally(() => { gallery.fetchingTitles = false; syncGallerySelection(); });
  }
}
/**
 * Draws the Basemaps panel's list of basemaps again, keeping the keyboard's place in it.
 */
export function renderGallery() {
  if (!gallery.items) return;
  const grid = $("basemapsGrid"), list = galleryList();
  const hadFocus = grid.contains(document.activeElement) ? document.activeElement.dataset.id : null;
  grid.innerHTML = "";
  for (const it of list) {
    const li = document.createElement("li");
    const b = document.createElement("button"); b.type = "button"; b.className = "bmg-card"; b.dataset.id = it.id;
    const src = thumbnailUrl(PORTAL, it, 400);
    const pic = document.createElement(src ? "img" : "span"); pic.className = "bmg-thumb";
    if (src) { pic.alt = ""; pic.loading = "lazy"; pic.decoding = "async"; pic.src = src; } else pic.setAttribute("aria-hidden", "true");
    const name = document.createElement("span"); name.className = "bmg-title"; name.textContent = String(it.title || "").trim() || S.untitled;
    b.append(pic, name);
    b.addEventListener("click", () => chooseBasemap(it));
    li.appendChild(b); grid.appendChild(li);
  }
  $("basemapsStatus").textContent = list.length ? "" : S.basemapsNone;
  syncGallerySelection();
  if (hadFocus) { const f = grid.querySelector('.bmg-card[data-id="' + hadFocus + '"]'); if (f) f.focus(); }
}
/**
 * Fills the Basemaps panel, fetching the basemap group's items the first time; afterwards it only draws the list again.
 * @returns {Promise<void>}
 */
export async function ensureGallery() {
  if (gallery.items) { renderGallery(); return; }
  const st = $("basemapsStatus");
  st.textContent = S.basemapsLoading; $("basemapsGrid").innerHTML = "";
  if (await loadGalleryItems()) { renderGallery(); return; }
  st.textContent = S.basemapsError;
  const again = document.createElement("button"); again.type = "button"; again.className = "btn"; again.textContent = S.tryAgain;
  again.addEventListener("click", () => { ensureGallery().then(() => { const f = $("basemapsGrid").querySelector(".bmg-card"); if (f) f.focus(); }); });
  st.append(document.createElement("br"), again);
}
function chooseBasemap(it) {
  const m = activeMap(), cur = m.basemap;
  if (cur && cur.portalItem && cur.portalItem.id === it.id) return;
  const bm = new Basemap({ portalItem: { id: it.id } });
  m.basemap = bm;
  markDirty();
  syncGallerySelection();
  bm.load().catch((e) => { console.error("Basemap failed", e); toast(S.basemapFailed); });
}
$("basemapsGrid").addEventListener("keydown", (e) => {
  const cards = [...$("basemapsGrid").querySelectorAll(".bmg-card")], i = cards.indexOf(document.activeElement);
  if (i < 0) return;
  const cols = getComputedStyle($("basemapsGrid")).gridTemplateColumns.split(" ").filter(Boolean).length || 2;
  const n = gridMove(i, cards.length, cols, e.key);
  if (n == null) return;
  e.preventDefault(); cards[n].focus();
});
// The selected card follows the map's basemap, wherever it changes (another map opened, a file, a new map).
reactiveUtils.watch(() => { const m = shownMap(), b = m && m.basemap; return b ? ((b.portalItem && b.portalItem.id) || "") + "|" + (b.title || "") : ""; }, syncGallerySelection);
// Units (1.0 in 5.0.0-beta.12): kilometres and metres, or miles and feet, for Measure, Elevation and Sketch's
