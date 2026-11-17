// ============================================================ Basemap gallery
// The basemap group's items as MapMaker shows them (a two-column grid of cards): which to show in 2D and in 3D, in the
// group's own order, each card's picture, which card is the map's basemap, and moving between cards with the arrow keys.
// Pure functions (no ArcGIS SDK), so they can be unit tested.
export const BASEMAPS_VERSION = "2.0";   // 2.0 = MapMaker's card grid (1.x was Esri's stock Basemap Gallery widget)

const norm = (s) => String(s == null ? "" : s).trim().toLowerCase();

// The group's own sort, as ArcGIS Online stores it (MapMaker's basemap group: date added, newest first).
// Group content search accepts these fields; anything else falls back to the group's default order.
const SORT_FIELDS = new Set(["title", "added", "modified", "created", "owner", "type", "numviews", "avgrating"]);
/**
 * The basemap group's own sort, as search parameters: { sortField, sortOrder }, or {} for the group's default order
 * when its field is not one group search accepts.
 * @param {object} group the group's details from ArcGIS Online
 * @returns {{sortField: string, sortOrder: string}|{}}
 */
export function groupSort(group) {
  const field = SORT_FIELDS.has(norm(group && group.sortField)) ? norm(group.sortField) : "";
  const order = norm(group && group.sortOrder) === "asc" ? "asc" : "desc";
  return field ? { sortField: field, sortOrder: order } : {};
}

/**
 * Which items to show, in order. 2D: web maps only. 3D: web scenes (3D basemaps) first, then the web maps,
 * as Esri's gallery does. Items keep the group's order otherwise; duplicates are dropped.
 * @param {object[]} items the group's items
 * @param {string} mode "2d" or "3d"
 * @returns {object[]}
 */
export function basemapItems(items, mode) {
  const seen = new Set(), maps = [], scenes = [];
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || typeof it.id !== "string" || !/^[0-9a-f]{32}$/i.test(it.id) || seen.has(it.id)) continue;
    if (it.type === "Web Map") maps.push(it);
    else if (it.type === "Web Scene" && mode === "3d") scenes.push(it);
    else continue;
    seen.add(it.id);
  }
  return [...scenes, ...maps];
}

/**
 * The thumbnail's address, at a width fit for a card on a high-density screen. Only the item's own
 * thumbnail path is used ("thumbnail/<file>"), so a group item can't point the page anywhere else.
 * @param {string} portal the portal's address
 * @param {object} item { id, thumbnail }
 * @param {number} width the width to ask for, in pixels; the stored size when left out
 * @returns {string} "" when the item has no usable thumbnail
 */
export function thumbnailUrl(portal, item, width) {
  const t = item && typeof item.thumbnail === "string" ? item.thumbnail.trim() : "";
  if (!t || !/^thumbnail\/[^/?#\\]+$/i.test(t) || !/^[0-9a-f]{32}$/i.test((item && item.id) || "")) return "";
  const base = String(portal || "").replace(/\/+$/, "");
  return `${base}/sharing/rest/content/items/${item.id}/info/${t.split("/").map(encodeURIComponent).join("/")}${width ? "?w=" + width : ""}`;
}

/**
 * Which card is the map's basemap: the same item; or, for a basemap that came inside a web map (no item), the same
 * title as the card, or as the basemap inside the card's item (dataTitles: item id -> that title; the Dark Gray item's
 * basemap is called "Human Geography Dark", so a saved map that used it says that). Returns the item id or null.
 * @param {object[]} items the gallery's items
 * @param {object} basemap the map's basemap: { itemId, title }
 * @param {Map<string,string>} dataTitles item id -> the title of the basemap inside it
 * @returns {string|null}
 */
export function selectedId(items, basemap, dataTitles) {
  if (!basemap) return null;
  const list = Array.isArray(items) ? items : [];
  const id = basemap.itemId || null;
  if (id) return list.some((it) => it.id === id) ? id : null;
  const title = norm(basemap.title);
  if (!title) return null;
  const hit = list.find((it) => norm(it.title) === title) || (dataTitles ? list.find((it) => norm(dataTitles.get(it.id)) === title) : null);
  return hit ? hit.id : null;
}
/**
 * True when the only way left to find the card is the titles inside the items (worth fetching them once).
 * @param {object[]} items the gallery's items
 * @param {object} basemap the map's basemap: { itemId, title }
 * @returns {boolean}
 */
export function needsDataTitles(items, basemap) {
  return !!(basemap && !basemap.itemId && norm(basemap.title) && !selectedId(items, basemap));
}

/**
 * Arrow keys in a grid of `cols` columns: the index to move to, or null to stay.
 * @param {number} index the card with the focus
 * @param {number} count how many cards
 * @param {number} cols
 * @param {string} key the KeyboardEvent key: arrows, Home or End
 * @returns {number|null}
 */
export function gridMove(index, count, cols, key) {
  const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[key];
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (!step) return null;
  const n = index + step;
  return n >= 0 && n < count ? n : null;
}
