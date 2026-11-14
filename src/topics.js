// ============================================================ Topics (the content group's categories; shared by Open map and Add layer)
import "./bookmarks.js?v=5.0.0-beta.42";   // first: keeps the files running in the order they were written in (see app.js)
import { buildTopicTree } from "../lib/catalog.js?v=5.0.0-beta.42";
import { cfg, PORTAL } from "./config.js?v=5.0.0-beta.42";
import { IdentityManager, restGet } from "./sdk.js?v=5.0.0-beta.42";

let topicTreePromise = null;
export function getTopicTree() {
  if (!topicTreePromise) topicTreePromise = restGet(`/sharing/rest/community/groups/${cfg.contentGroup}/categorySchema`)
    .then(buildTopicTree).catch((e) => { console.warn("No category schema", e); return []; });
  return topicTreePromise;
}
export const cleanQuery = (s) => String(s || "").replace(/["':()\\[\]{}^~*?]/g, " ").replace(/\s+/g, " ").trim();
// A card's picture (5.0.0-beta.41). A public item's is loaded by its address. An item only the signed-in person can see
// needs their token: it used to go on the end of the address as a query parameter, written into the page as the card's
// background, where it could be read from the page, from server and proxy logs, and from a copied address. It now travels
// in a request header, and the picture is shown from a blob address that holds no token. Signing out forgets the pictures.
const thumbBlobs = new Map();   // item id and thumbnail name -> a promise of the blob address (or null)
export function setThumb(el, item) {
  if (!el || !item || !item.thumbnail) return;
  const u = `${PORTAL}/sharing/rest/content/items/${item.id}/info/${item.thumbnail}`;
  const show = (url) => { el.style.backgroundImage = "url('" + url.replace(/'/g, "%27") + "')"; };
  if (!item.access || item.access === "public") { show(u); return; }
  const c = IdentityManager.findCredential(PORTAL + "/sharing");
  if (!c || !c.token) return;
  const key = item.id + "/" + item.thumbnail;
  if (!thumbBlobs.has(key)) thumbBlobs.set(key, fetch(u, { headers: { "X-Esri-Authorization": "Bearer " + c.token }, credentials: "omit", referrerPolicy: "no-referrer" })
    .then((r) => (r.ok && /^image\//i.test(r.headers.get("content-type") || "") ? r.blob() : null)).then((b) => (b ? URL.createObjectURL(b) : null)).catch(() => null));
  const pr = thumbBlobs.get(key);
  pr.then((url) => { if (url && thumbBlobs.get(key) === pr) show(url); });
}
export function forgetThumbs() { for (const pr of thumbBlobs.values()) pr.then((url) => { if (url) URL.revokeObjectURL(url); }); thumbBlobs.clear(); }

