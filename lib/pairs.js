// Paired 2D and 3D maps: a web map and a web scene their author made as the 2D and 3D versions of one map.
// Pure functions (no ArcGIS SDK), so they can be unit tested. Created by Jason Sawle.
//
// The author says so with a tag on each ArcGIS Online item, naming the other one:
//   on the web map:   atlas-3d-<the scene's item ID>
//   on the web scene: atlas-2d-<the web map's item ID>
// The app reads an item's tags when it opens it, so it knows the partner without searching for it.
export const PAIRS_VERSION = "1.0";
export const TAG_3D_PARTNER = "atlas-3d-";   // on a web map: its 3D version
export const TAG_2D_PARTNER = "atlas-2d-";   // on a web scene: its 2D version
export const PAIR_PROP = "atlasPair";        // in a saved map: { webmap: <id>, scene: <id> }

const HEX32 = /^[0-9a-f]{32}$/;
const cleanId = (v) => { const s = String(v == null ? "" : v).trim().toLowerCase(); return HEX32.test(s) ? s : null; };

// The item ID a tag with this prefix names, or null. "atlas-2d-only" names none: "only" is not an item ID.
export function partnerFromTags(tags, prefix) {
  for (const tg of Array.isArray(tags) ? tags : []) {
    const s = String(tg == null ? "" : tg).trim().toLowerCase();
    if (s.startsWith(prefix)) { const id = cleanId(s.slice(prefix.length)); if (id) return id; }
  }
  return null;
}

// The pair kept in a saved map, or null. Both IDs must be item IDs, and different.
export function savedPair(raw) {
  const p = raw && typeof raw === "object" ? raw[PAIR_PROP] : null;
  if (!p || typeof p !== "object") return null;
  const webmap = cleanId(p.webmap), scene = cleanId(p.scene);
  return webmap && scene && webmap !== scene ? { webmap, scene } : null;
}

// The pair an ArcGIS Online item belongs to: { webmap, scene }, or null. Its tags decide; an item saved from this
// app without the tag can carry the pair in its map (data).
export function pairOf(item, data) {
  const id = cleanId(item && item.id);
  if (id && item.type === "Web Map") { const scene = partnerFromTags(item.tags, TAG_3D_PARTNER); if (scene && scene !== id) return { webmap: id, scene }; }
  if (id && item.type === "Web Scene") { const webmap = partnerFromTags(item.tags, TAG_2D_PARTNER); if (webmap && webmap !== id) return { webmap, scene: id }; }
  const saved = savedPair(data);
  return saved && id && (saved.webmap === id || saved.scene === id) ? saved : null;
}

// The collection's entries (catalog.js indexItems) with each pair as one entry: the web map's, with
// pair.scene = the scene's item. It is found in either's categories and by either's words.
// A web map whose scene isn't in the collection keeps its entry with pair.scene = null (the switch still works);
// a scene whose web map isn't in the collection keeps its own entry, marked pair.webmap = null.
// Returns { entries, pairs }: pairs maps an item ID (either of the two) to its { webmap, scene }.
export function mergePairs(entries) {
  const list = entries || [], byId = new Map(list.map((e) => [e.item.id, e]));
  const sceneOf = new Map(), mapOf = new Map();   // web map ID -> scene ID, and back: the first to say so wins
  for (const e of list) {
    const p = pairOf(e.item);
    if (p && !sceneOf.has(p.webmap) && !mapOf.has(p.scene)) { sceneOf.set(p.webmap, p.scene); mapOf.set(p.scene, p.webmap); }
  }
  const pairs = new Map(), out = [];
  for (const e of list) {
    const id = e.item.id;
    if (e.item.type === "Web Map" && sceneOf.has(id)) {
      const sid = sceneOf.get(id), se = byId.get(sid), scene = se && se.item.type === "Web Scene" ? se : null;
      pairs.set(id, { webmap: id, scene: sid });
      if (scene) pairs.set(sid, { webmap: id, scene: sid });
      out.push(scene ? { ...e, keys: [...new Set([...e.keys, ...scene.keys])], hay: e.hay + " " + scene.hay, pair: { scene: scene.item } } : { ...e, pair: { scene: null } });
    } else if (e.item.type === "Web Scene" && mapOf.has(id)) {
      const me = byId.get(mapOf.get(id));
      if (me && me.item.type === "Web Map") continue;   // shown on the web map's card
      pairs.set(id, { webmap: mapOf.get(id), scene: id });
      out.push({ ...e, pair: { webmap: null } });
    } else out.push(e);
  }
  return { entries: out, pairs };
}
// How many entries each choice of the 2D / 3D row shows. A pair with both in the collection counts in both.
export const entryIs3d = (e) => e.item.type === "Web Scene" || !!(e.pair && e.pair.scene);
export const entryIs2d = (e) => e.item.type !== "Web Scene";
