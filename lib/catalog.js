// ============================================================ Topics (the collection's categories)
// The content group's categories, used to browse its maps in Open map and Add layer: the tree of topics, how many maps
// each topic holds, search that ignores accents and case, and the page numbers.
// Pure functions (no ArcGIS SDK), so they can be unit tested. Created by Jason Sawle.
export const CATALOG_VERSION = "2.1";   // 2.0 = MapMaker's category tree, cards and pages; shared by Open map and Add layer. 2.1: Open map can show only the 2D maps or only the 3D scenes
export const MAX_INDEX = 1000;        // up to this many web maps are loaded once and filtered in the browser
export const OTHER = "__other__";     // maps that sit in no topic of the group's category list
export const ALL = "";

// "/Categories/Human Geography/" and "/categories/human geography" are the same topic.
export const topicKey = (path) => String(path || "").trim().replace(/\/+$/, "").replace(/\/{2,}/g, "/").toLowerCase();

/**
 * Category schema (…/community/groups/<id>/categorySchema) -> tree of topics.
 * Each node: { title, path, key, depth, parent, children }.
 * @param {object} schema the group's categorySchema reply
 * @returns {object[]} the top-level topics
 */
export function buildTopicTree(schema) {
  const tree = [];
  const walk = (nodes, parentPath, depth, parent) => (Array.isArray(nodes) ? nodes : [])
    .filter((n) => n && typeof n.title === "string" && n.title.trim())
    .map((n) => {
      const path = parentPath + "/" + n.title;
      const node = { title: n.title.trim(), path, key: topicKey(path), depth, parent, children: [] };
      node.children = walk(n.categories, path, depth + 1, node);
      return node;
    });
  const roots = (schema && Array.isArray(schema.categorySchema)) ? schema.categorySchema : [];
  for (const root of roots) if (root && root.title) tree.push(...walk(root.categories, "/" + root.title, 0, null));
  return tree;
}
/**
 * Every topic in the tree, each before its children.
 * @param {object[]} tree from buildTopicTree
 * @returns {object[]}
 */
export function flattenTopics(tree) { const out = []; const go = (ns) => ns.forEach((n) => { out.push(n); go(n.children); }); go(tree || []); return out; }
/**
 * The topic with this key, or null.
 * @param {object[]} tree from buildTopicTree
 * @param {string} key
 * @returns {object|null}
 */
export function findTopic(tree, key) { return flattenTopics(tree).find((n) => n.key === key) || null; }
/**
 * A topic and the topics above it, top first (for the breadcrumb).
 * @param {object} node a topic
 * @returns {object[]}
 */
export function topicTrail(node) { const t = []; for (let n = node; n; n = n.parent) t.unshift(n); return t; }

/**
 * A map is in a topic when one of its group categories is that topic or sits below it.
 * @param {string[]} keys the map's category keys
 * @param {string} key a topic key; ALL ("") matches every map
 * @returns {boolean}
 */
export function inTopic(keys, key) { return !key || keys.some((k) => k === key || k.startsWith(key + "/")); }

// Accent- and case-insensitive text, so "Geografia" finds "Geografía".
export const fold = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export const searchTokens = (text) => fold(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const stripTags = (html) => String(html || "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");

/**
 * Group search results -> entries ready for filtering: { item, keys, title, hay }.
 * @param {object[]} items the items found
 * @returns {object[]}
 */
export function indexItems(items) {
  return (items || []).filter((it) => it && it.id).map((item) => ({
    item,
    keys: (Array.isArray(item.groupCategories) ? item.groupCategories : []).map(topicKey).filter(Boolean),
    title: fold(item.title),
    hay: fold([item.title, item.snippet, (item.tags || []).join(" "), stripTags(item.description)].join(" "))
  }));
}

/**
 * Number of maps per topic (a map counts once for each topic it sits in, and for that topic's parents).
 * @param {object[]} tree from buildTopicTree
 * @param {object[]} entries from indexItems
 * @returns {{counts: Map<string,number>, other: number, total: number}}
 */
export function countTopics(tree, entries) {
  const nodes = flattenTopics(tree), tops = (tree || []).map((n) => n.key);
  const counts = new Map(nodes.map((n) => [n.key, 0]));
  let other = 0;
  for (const e of entries || []) {
    for (const n of nodes) if (inTopic(e.keys, n.key)) counts.set(n.key, counts.get(n.key) + 1);
    if (!tops.some((k) => inTopic(e.keys, k))) other++;
  }
  return { counts, other, total: (entries || []).length };
}

/**
 * Maps in a topic (ALL, OTHER or a topic key) that match the search text.
 * With search text, maps whose title matches come first; otherwise A–Z by title.
 * @param {object[]} entries from indexItems
 * @param {object[]} tree from buildTopicTree
 * @param {string} key ALL, OTHER or a topic key
 * @param {string} text the search text
 * @param {string} locale for sorting titles
 * @returns {object[]}
 */
export function filterEntries(entries, tree, key, text, locale) {
  const tokens = searchTokens(text), tops = (tree || []).map((n) => n.key);
  const out = (entries || []).filter((e) => {
    if (key === OTHER) { if (tops.some((k) => inTopic(e.keys, k))) return false; }
    else if (key && !inTopic(e.keys, key)) return false;
    return tokens.every((tk) => e.hay.includes(tk));
  });
  const byTitle = (a, b) => String(a.item.title || "").localeCompare(String(b.item.title || ""), locale || undefined, { sensitivity: "base", numeric: true });
  const rank = (e) => (tokens.length && tokens.every((tk) => e.title.includes(tk)) ? 0 : 1);
  return out.sort((a, b) => rank(a) - rank(b) || byTitle(a, b));
}

/**
 * Which topic chips to show under the heading: the children of the chosen topic,
 * or, for a topic with no children, its brothers and sisters. Topics with no maps are left out when counts are known.
 * @param {object|null} node the chosen topic
 * @param {Map<string,number>} counts from countTopics, when known
 * @returns {{parent: object, chips: object[]}|null}
 */
export function chipSet(node, counts) {
  const has = (n) => !counts || (counts.get(n.key) || 0) > 0;
  if (!node) return null;
  if (node.children.some(has)) return { parent: node, chips: node.children.filter(has) };
  if (node.parent) return { parent: node.parent, chips: node.parent.children.filter(has) };
  return null;
}

/**
 * Page buttons to show: every page when there are few, otherwise the first, the last and those around the current one.
 * @param {number} current the page shown, from 1
 * @param {number} total how many pages
 * @returns {Array<number|string>} page numbers, with "…" where pages are left out
 */
export function pageList(current, total) {
  total = Math.max(1, Math.floor(total || 1)); current = Math.min(total, Math.max(1, Math.floor(current || 1)));
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out = [1];
  const from = Math.max(2, Math.min(current - 1, total - 4)), to = Math.min(total - 1, Math.max(current + 1, 5));
  if (from > 2) out.push("…");
  for (let i = from; i <= to; i++) out.push(i);
  if (to < total - 1) out.push("…");
  out.push(total);
  return out;
}
