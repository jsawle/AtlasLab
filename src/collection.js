// ============================================================ Collection browser (Open map and Add layer)
// After MapMaker's Add layer dialog: search, a Categories tree (the content group's categories, with chevrons for
// sub-categories and a reset button), wide cards with an expandable description, and page numbers. Up to MAX_INDEX
// items are loaded once and filtered in the browser, with counts; a bigger group is searched in ArcGIS Online instead.
import "./topics.js?v=5.0.0-beta.42";   // first: keeps the files running in the order they were written in (see app.js)
import { MAX_INDEX, OTHER, ALL, findTopic, topicTrail, indexItems, countTopics, filterEntries, pageList } from "../lib/catalog.js?v=5.0.0-beta.42";
import { mergePairs, entryIs3d, entryIs2d } from "../lib/pairs.js?v=5.0.0-beta.42";
import { state } from "./state.js?v=5.0.0-beta.42";
import { $, cfgName, cfg, F, S, t } from "./config.js?v=5.0.0-beta.42";
import { restGet } from "./sdk.js?v=5.0.0-beta.42";
import { portalLayers } from "./session.js?v=5.0.0-beta.42";
import { toast, openPanelName, closePanels, openModal, closeModal } from "./ui.js?v=5.0.0-beta.42";
import { SKETCH_LAYERS_ON, createSketchLayer, nextSketchLayerName } from "./sketch.js?v=5.0.0-beta.42";
import { pairOn } from "./view-mode.js?v=5.0.0-beta.42";
import { openWebMapItem, openWebSceneItem, newBlankMap, addPortalLayer, removePortalLayer } from "./maps.js?v=5.0.0-beta.42";
import { calIcon } from "./layers-panel.js?v=5.0.0-beta.42";
import { getTopicTree, cleanQuery, setThumb } from "./topics.js?v=5.0.0-beta.42";
import { safeFragment } from "./item-info.js?v=5.0.0-beta.42";
import { leaveData } from "./csv-import.js?v=5.0.0-beta.42";
import { openFromDevice } from "./local-files.js?v=5.0.0-beta.42";
import { renderSavedMaps } from "./saved-maps.js?v=5.0.0-beta.42";

const PAGE_SIZE = 10;
const SVG = (d, w) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (w || 1.8) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + d + "</svg>";
const ICON_PLUS = SVG('<path d="M12 5v14M5 12h14"/>'), ICON_MINUS = SVG('<path d="M5 12h14"/>'), ICON_CHEV_R = SVG('<path d="m9 5 7 7-7 7"/>', 2), ICON_CHEV_D = SVG('<path d="m5 9 7 7 7-7"/>');
const SUPPORTED_TYPES = { "Feature Service": "typeLayer", "Feature Collection": "typeLayer", "Map Service": "typeMapLayer", "Image Service": "typeImagery",
  "Vector Tile Service": "typeTiles", "Group Layer": "typeGroup", "WMS": "typeMapLayer", "KML": "typeLayer", "GeoJson": "typeLayer", "CSV": "typeLayer" };
let searchTimer = 0, descSeq = 0;
function createBrowser(o) {
  // o: { p (id prefix), query, accept(item), kind ("maps" | "layers"), descLabel, thumbOpens, decorate(button, item), run(item, button) }
  const el = (x) => $(o.p + x);
  const st = { ready: null, loaded: false, tree: [], entries: null, counts: null, other: 0, mode: "index", topic: ALL, page: 1, expanded: new Set(), token: 0, dim: "all", dims: null };
  const unitText = (n) => (n === 1 ? S[o.kind + "CountOne"] : t(o.kind + "Count", { n }));
  const countFor = (key) => (!st.counts ? null : !key ? st.entries.length : key === OTHER ? st.other : st.counts.get(key) || 0);
  const topicName = (key) => (!key ? "" : key === OTHER ? S.otherCategory : (findTopic(st.tree, key) || {}).title || "");
  function load() {
    if (st.ready) return st.ready;
    st.ready = (async () => {
      const path = `/sharing/rest/content/groups/${cfg.contentGroup}/search`, q = { num: 100, start: 1, q: o.query, sortField: "title", sortOrder: "asc" };
      const [tree, first] = await Promise.all([getTopicTree(), restGet(path, q)]);
      st.tree = tree;
      if ((first.total || 0) > MAX_INDEX) { st.mode = "server"; st.entries = null; st.counts = null; st.other = 0; return; }
      const items = (first.results || []).slice();
      for (let next = first.nextStart; next > 0 && items.length < MAX_INDEX;) { const d = await restGet(path, { ...q, start: next }); items.push(...(d.results || [])); next = d.nextStart; }
      st.mode = "index";
      st.entries = indexItems(items.filter(o.accept)); st.pairs = null;
      if (pairOn && o.kind === "maps") { const mp = mergePairs(st.entries); st.entries = mp.entries; st.pairs = mp.pairs; }
      const c = countTopics(tree, st.entries); st.counts = c.counts; st.other = c.other;
    })();
    st.ready.catch(() => { st.ready = null; });
    return st.ready;
  }
  function countBadgeFor(n) {
    const c = document.createElement("span"); c.className = "count"; c.textContent = n.toLocaleString(cfg.locale || undefined);
    const u = document.createElement("span"); u.className = "sr-only"; u.textContent = " " + (n === 1 ? S[o.kind + "UnitOne"] : S[o.kind + "Unit"]);
    c.appendChild(u); return c;
  }
  function renderTree(focusKey, focusChevron) {
    const root = el("Tree"); root.innerHTML = "";
    const addRows = (nodes, ul) => nodes.forEach((n) => {
      const c = countFor(n.key);
      if (c === 0) return;
      const kids = n.children.filter((k) => countFor(k.key) !== 0);
      const li = document.createElement("li"), row = document.createElement("div"); row.className = "tree-row";
      if (kids.length) {
        const ch = document.createElement("button"); ch.type = "button"; ch.className = "tree-chev"; ch.dataset.key = n.key; ch.innerHTML = ICON_CHEV_R;
        const open = st.expanded.has(n.key);
        ch.setAttribute("aria-expanded", String(open)); ch.setAttribute("aria-label", t("subCategoriesOf", { topic: n.title }));
        ch.addEventListener("click", () => { if (st.expanded.has(n.key)) st.expanded.delete(n.key); else st.expanded.add(n.key); renderTree(n.key, true); });
        row.appendChild(ch);
      } else { const sp = document.createElement("span"); sp.className = "tree-spacer"; row.appendChild(sp); }
      const b = document.createElement("button"); b.type = "button"; b.className = "tree-name"; b.dataset.key = n.key;
      const nm = document.createElement("span"); nm.textContent = n.title; b.appendChild(nm);
      if (c != null) b.appendChild(countBadgeFor(c));
      if (st.topic === n.key) b.setAttribute("aria-current", "true");
      b.addEventListener("click", () => select(n.key, "tree"));
      row.appendChild(b); li.appendChild(row);
      if (kids.length && st.expanded.has(n.key)) { const sub = document.createElement("ul"); sub.className = "tree-sub"; addRows(kids, sub); li.appendChild(sub); }
      ul.appendChild(li);
    });
    addRows(st.tree, root);
    if (st.counts && st.other > 0 && st.tree.length) {
      const li = document.createElement("li"), row = document.createElement("div"); row.className = "tree-row";
      const sp = document.createElement("span"); sp.className = "tree-spacer";
      const b = document.createElement("button"); b.type = "button"; b.className = "tree-name"; b.dataset.key = OTHER;
      const nm = document.createElement("span"); nm.textContent = S.otherCategory; b.append(nm, countBadgeFor(st.other));
      if (st.topic === OTHER) b.setAttribute("aria-current", "true");
      b.addEventListener("click", () => select(OTHER, "tree"));
      row.append(sp, b); li.appendChild(row); root.appendChild(li);
    }
    const has = st.tree.length > 0;
    el("CatsBtn").hidden = !has;
    if (!has) el("Body").classList.add("side-hidden");
    if (focusKey != null) { const f = [...root.querySelectorAll(focusChevron ? ".tree-chev" : ".tree-name")].find((x) => x.dataset.key === focusKey); if (f) f.focus(); }
  }
  function card(item) {
    const li = document.createElement("li"); li.className = "cat-card";
    const top = document.createElement("div"); top.className = "cat-card-top";
    const txt = document.createElement("div"); txt.className = "cat-card-text";
    const h = document.createElement("h4"); h.className = "cat-card-title"; h.textContent = item.title || S.untitled;
    const scene = item.type === "Web Scene", paired = !!(st.pairs && st.pairs.has(item.id));
    if (scene) li.classList.add("is-scene");
    if (paired) li.classList.add("is-pair");
    if (scene || paired) { const sr = document.createElement("span"); sr.className = "sr-only"; sr.textContent = " (" + (paired ? S.pairCard : S.sceneCard) + ")"; h.append(sr); }
    const sn = document.createElement("p"); sn.className = "cat-card-snippet"; sn.textContent = item.snippet || "";
    const act = document.createElement("button"); act.type = "button"; act.className = "cat-act"; act._item = item;
    o.decorate(act, item);
    act.addEventListener("click", () => o.run(item, act));
    if (o.share) {   // Share (maps): copies a link that opens this map in this app
      const row = document.createElement("div"); row.className = "cat-acts";
      const sh = document.createElement("button"); sh.type = "button"; sh.className = "cat-share"; sh.innerHTML = calIcon("share");
      const sl = document.createElement("span"); sl.textContent = S.share; sh.appendChild(sl); sh.setAttribute("aria-label", S.share + ": " + (item.title || ""));
      sh.addEventListener("click", () => o.share(item, sh));
      row.append(sh, act); txt.append(h, sn, row);
    } else txt.append(h, sn, act);
    const th = document.createElement("div"); th.className = "cat-thumb" + (o.thumbOpens ? " open" : ""); th.setAttribute("aria-hidden", "true");
    setThumb(th, item);
    if (o.thumbOpens) th.addEventListener("click", () => o.run(item, act));
    if (scene || paired) { const bd = document.createElement("span"); bd.className = "cat-3d"; bd.innerHTML = calIcon("cube"); bd.append(paired ? S.pairBadge : S.view3d); th.appendChild(bd); }   // marked on its picture, where the eye goes first
    top.append(txt, th);
    const id = "desc" + (++descSeq);
    const db = document.createElement("button"); db.type = "button"; db.className = "cat-desc-btn"; db.setAttribute("aria-expanded", "false"); db.setAttribute("aria-controls", id);
    const dl = document.createElement("span"); dl.textContent = o.descLabel(); db.appendChild(dl); db.insertAdjacentHTML("beforeend", ICON_CHEV_D);
    db.setAttribute("aria-label", o.descLabel() + ": " + (item.title || ""));
    const dd = document.createElement("div"); dd.className = "cat-desc rich"; dd.id = id; dd.hidden = true;
    db.addEventListener("click", () => {
      const open = db.getAttribute("aria-expanded") !== "true";
      if (open && !dd.childNodes.length) {
        if (item.description) dd.appendChild(safeFragment(item.description));
        else { const p = document.createElement("p"); p.textContent = item.snippet || S.noDescription; dd.appendChild(p); }
        if (item.accessInformation) { const p = document.createElement("p"); const b = document.createElement("strong"); b.textContent = S.credits + ": "; p.append(b, document.createTextNode(item.accessInformation)); dd.appendChild(p); }
      }
      db.setAttribute("aria-expanded", String(open)); dd.hidden = !open;
    });
    li.append(top, db, dd);
    return li;
  }
  function paint(items, n, pages, text, focusList) {
    const ul = el("List"); ul.innerHTML = "";
    for (const it of items) ul.appendChild(card(it));
    el("Empty").textContent = n ? "" : text ? (st.topic ? t("noMatchIn", { topic: topicName(st.topic) }) : S.noMatch) : S[o.kind === "maps" ? "noMaps" : "noLayersHere"];
    el("SearchAllRow").hidden = !(n === 0 && text && st.topic);
    renderPager(pages);
    el("Main").scrollTop = 0;
    if (focusList) ul.focus();
  }
  function setStatus(n, total, text) {
    const topic = topicName(st.topic);
    el("Status").textContent = text ? (topic ? t("matchOfIn", { n, count: unitText(total), topic }) : t("matchOf", { n, count: unitText(total) }))
      : topic ? t("inTopic", { count: unitText(n), topic }) : unitText(n);
  }
  // 2D maps and 3D scenes (Collection browser 2.1): where the collection has scenes, a row above the list chooses all of
  // them, the 2D maps or the 3D scenes. It works with the category chosen and with the search, and says how many of each.
  const DIMS = [["all", "dimAll"], ["2d", "dim2d"], ["3d", "dim3d"]];
  // A pair is one card. It is among the 2D maps and, when its scene is in the collection, among the 3D maps too, where
  // the card is the scene's and opens it.
  const shownItem = (e) => (st.dim === "3d" && e.pair && e.pair.scene ? e.pair.scene : e.item);
  function renderDims(list) {
    const any = o.kind === "maps" && st.mode !== "server" && (st.entries || []).some(entryIs3d);
    if (!any) { if (st.dims) st.dims.hidden = true; st.dim = "all"; return; }
    if (!st.dims) {
      const g = st.dims = document.createElement("div"); g.className = "cat-dims"; g.setAttribute("role", "group"); g.setAttribute("aria-label", S.dimLabel);
      for (const [key] of DIMS) { const b = document.createElement("button"); b.type = "button"; b.dataset.dim = key; b.addEventListener("click", () => { st.dim = key; st.page = 1; renderList(false); }); g.appendChild(b); }
      el("Status").before(g);
    }
    const n = { all: list.length, "2d": list.filter(entryIs2d).length, "3d": list.filter(entryIs3d).length };
    st.dims.hidden = false;
    for (const b of st.dims.children) {
      const key = b.dataset.dim, label = S[DIMS.find((d) => d[0] === key)[1]];
      b.replaceChildren(); if (key === "3d") b.insertAdjacentHTML("beforeend", calIcon("cube"));
      const nm = document.createElement("span"); nm.textContent = label; const ct = document.createElement("span"); ct.className = "cat-dim-n"; ct.textContent = String(n[key]);
      b.append(nm, " ", ct); b.setAttribute("aria-pressed", String(st.dim === key));   // its name is what it shows: the words and the number
    }
  }
  function renderList(focusList) {
    if (!st.loaded) return;
    if (st.mode === "server") { renderDims([]); serverPage(focusList); return; }
    const text = el("Search").value.trim();
    let list = filterEntries(st.entries, st.tree, st.topic, text, cfg.locale);
    renderDims(list);
    if (st.dim !== "all") {
      list = list.filter(st.dim === "3d" ? entryIs3d : entryIs2d);
      const pg = Math.max(1, Math.ceil(list.length / PAGE_SIZE)); if (st.page > pg) st.page = pg;
      paint(list.slice((st.page - 1) * PAGE_SIZE, st.page * PAGE_SIZE).map(shownItem), list.length, pg, text, focusList);
      const count = st.dim === "3d" ? (list.length === 1 ? S.scenesCountOne : t("scenesCount", { n: list.length })) : unitText(list.length), topic = topicName(st.topic);
      el("Status").textContent = topic ? t("inTopic", { count, topic }) : count;
      return;
    }
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    if (st.page > pages) st.page = pages;
    paint(list.slice((st.page - 1) * PAGE_SIZE, st.page * PAGE_SIZE).map((e) => e.item), list.length, pages, text, focusList);
    setStatus(list.length, countFor(st.topic) ?? list.length, text);
  }
  async function serverPage(focusList) {
    const token = ++st.token, text = cleanQuery(el("Search").value);
    const q = { num: PAGE_SIZE, start: (st.page - 1) * PAGE_SIZE + 1, q: o.query + (text ? " AND (" + text + ")" : "") };
    if (!text) { q.sortField = "title"; q.sortOrder = "asc"; }
    const node = st.topic && st.topic !== OTHER ? findTopic(st.tree, st.topic) : null;
    if (node) q.categories = node.path;
    el("List").setAttribute("aria-busy", "true");
    try {
      const d = await restGet(`/sharing/rest/content/groups/${cfg.contentGroup}/search`, q);
      if (token !== st.token) return;
      const total = d.total || 0;
      paint((d.results || []).filter(o.accept), total, Math.max(1, Math.ceil(total / PAGE_SIZE)), text, focusList);
      setStatus(total, total, "");
    } catch (e) { if (token === st.token) { console.error(e); el("Empty").textContent = S.groupError; } }
    if (token === st.token) el("List").removeAttribute("aria-busy");
  }
  function renderPager(pages) {
    const nav = el("Pager"); nav.innerHTML = "";
    nav.hidden = pages <= 1;
    if (pages <= 1) return;
    const btn = (label, aria, page, disabled, current) => {
      const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.setAttribute("aria-label", aria); b.disabled = !!disabled;
      if (current) b.setAttribute("aria-current", "page");
      b.addEventListener("click", () => { st.page = page; renderList(true); });
      nav.appendChild(b);
    };
    btn("‹", S.prevPage, st.page - 1, st.page <= 1);
    for (const n of pageList(st.page, pages)) {
      if (n === "…") { const sp = document.createElement("span"); sp.textContent = "…"; sp.setAttribute("aria-hidden", "true"); nav.appendChild(sp); }
      else btn(String(n), t("pageN", { n }), n, false, n === st.page);
    }
    btn("›", S.nextPage, st.page + 1, st.page >= pages);
  }
  function select(key, from) {
    st.topic = key || ALL; st.page = 1;
    const node = st.topic && st.topic !== OTHER ? findTopic(st.tree, st.topic) : null;
    if (node) for (const n of topicTrail(node)) if (n.children.length) st.expanded.add(n.key);   // show the chosen category's sub-categories
    renderTree(from === "tree" ? st.topic : null, false);
    renderList(false);
  }
  async function start() {
    if (st.loaded) { renderTree(); renderList(false); return; }
    el("List").innerHTML = ""; el("Status").textContent = ""; el("Pager").hidden = true; el("SearchAllRow").hidden = true;
    el("Empty").textContent = S.loadingMaps; el("List").setAttribute("aria-busy", "true");
    try { await load(); }
    catch (e) { console.error(e); el("Empty").textContent = S.groupError; el("List").removeAttribute("aria-busy"); return; }
    el("List").removeAttribute("aria-busy");
    st.loaded = true;
    if (st.topic && st.topic !== OTHER && !findTopic(st.tree, st.topic)) st.topic = ALL;
    renderTree(); renderList(false);
  }
  el("Search").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { st.page = 1; renderList(false); }, st.mode === "server" ? 350 : 150); });
  el("SearchAll").addEventListener("click", () => { select(ALL); el("Search").focus(); });
  el("Reset").addEventListener("click", () => { st.expanded.clear(); el("Search").value = ""; select(ALL); });
  el("CatsBtn").addEventListener("click", () => {
    const show = el("Body").classList.contains("side-hidden");
    el("Body").classList.toggle("side-hidden", !show); el("CatsBtn").setAttribute("aria-expanded", String(show));
  });
  if (window.matchMedia && window.matchMedia("(max-width: 760px)").matches) { el("Body").classList.add("side-hidden"); el("CatsBtn").setAttribute("aria-expanded", "false"); }
  return {
    start,
    forget() { st.ready = null; st.loaded = false; },
    pairFor(id) { return (st.pairs && st.pairs.get(id)) || null; },
    refreshActions() { el("List").querySelectorAll(".cat-act").forEach((b) => o.decorate(b, b._item)); }
  };
}

// ---------- Open map
const openCollectionMap = (it) => { const o = { title: it.title, pair: mapBrowser.pairFor(it.id) }; return it.type === "Web Scene" ? openWebSceneItem(it.id, o) : openWebMapItem(it.id, o); };
// The collection's web maps and, where 3D is on, its web scenes (5.0.0-beta.9); a scene's card says 3D.
const mapBrowser = createBrowser({ p: "om", query: F.threeD === false ? 'type:"Web Map"' : '(type:"Web Map" OR type:"Web Scene")', accept: () => true, kind: "maps", thumbOpens: true, descLabel: () => S.mapDescription,
  decorate(b, item) { const w = item.type === "Web Scene" ? S.openThisScene : S.openThisMap; b.textContent = w; b.setAttribute("aria-label", w + ": " + (item.title || "")); },
  share: F.share === false ? null : shareMapLink,
  run(item) { openCollectionMap(item); } });
// The link Share copies: this app (and these settings) opening that map. Nothing about the person is in it.
function mapLink(itemId, scene) {
  const u = new URL(location.origin + location.pathname);
  if (cfgName !== "default") u.searchParams.set("config", cfgName);
  u.searchParams.set(scene ? "webscene" : "webmap", itemId);
  return u.href;
}
async function shareMapLink(item) {
  const link = mapLink(item.id, item.type === "Web Scene");
  try { await navigator.clipboard.writeText(link); toast(t("linkCopied", { title: item.title || "" }), 5000); }
  catch (e) { window.prompt(S.linkCopyManually, link); }   // no clipboard access (an old browser, or permission refused): show the link to copy
}
export function forgetBrowse() { mapBrowser.forget(); addBrowser.forget(); }
const agolState = { start: 1, loading: false };
function mapCard(item, onOpen) {     // My ArcGIS Online maps
  const li = document.createElement("li"); li.className = "map-card";
  const th = document.createElement("div"); th.className = "card-thumb"; th.setAttribute("aria-hidden", "true");
  setThumb(th, item);
  th.addEventListener("click", () => onOpen(item));
  const body = document.createElement("div"); body.className = "card-body";
  const h = document.createElement("h4"); h.className = "card-title"; h.textContent = item.title || S.untitled;
  const sn = document.createElement("p"); sn.className = "card-snippet"; sn.textContent = item.snippet || "";
  const acts = document.createElement("div"); acts.className = "card-actions";
  const open = document.createElement("button"); open.type = "button"; open.className = "btn primary"; open.textContent = S.openThisMap;
  open.setAttribute("aria-label", S.openThisMap + ": " + (item.title || ""));
  open.addEventListener("click", () => onOpen(item));
  acts.append(open);
  body.append(h, sn, acts); li.append(th, body);
  return li;
}
async function loadAgolMaps(reset) {
  if (!state.portalUser || agolState.loading) return;
  agolState.loading = true;
  if (reset) { agolState.start = 1; $("agolGrid").innerHTML = ""; }
  $("agolStatus2").textContent = S.loadingMaps;
  const text = cleanQuery($("agolSearch").value);
  try {
    const d = await restGet("/sharing/rest/search", { num: 24, start: agolState.start, sortField: "modified", sortOrder: "desc",
      q: 'owner:"' + state.portalUser.username + '" AND type:"Web Map"' + (text ? " AND (" + text + ")" : "") });
    for (const item of d.results || []) $("agolGrid").appendChild(mapCard(item, (it) => openWebMapItem(it.id, { title: it.title })));
    agolState.start = d.nextStart;
    $("agolMoreRow").hidden = !(d.nextStart > 0);
    $("agolStatus2").textContent = $("agolGrid").children.length ? "" : (text ? S.noMatch : S.noMaps);
  } catch (e) { console.error(e); $("agolStatus2").textContent = S.groupError; }
  agolState.loading = false;
}
function setupTabs(tabs, onSwitch) {
  const sw = (tabId) => { for (const [tb, pane] of tabs) { const on = tb === tabId; $(tb).setAttribute("aria-selected", String(on)); $(tb).tabIndex = on ? 0 : -1; $(pane).hidden = !on; } onSwitch(tabId); };
  tabs.forEach(([tb]) => $(tb).addEventListener("click", () => sw(tb)));
  $(tabs[0][0]).parentElement.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const vis = tabs.map((x) => x[0]).filter((id) => !$(id).hidden);
    const i = vis.indexOf(document.activeElement && document.activeElement.id);
    if (i < 0) return;
    const next = vis[(i + (e.key === "ArrowRight" ? 1 : vis.length - 1)) % vis.length];
    $(next).focus(); sw(next);
  });
  return sw;
}
export const switchTab = setupTabs([["tabGroup", "paneGroup"], ["tabDevice", "paneDevice"], ["tabArcgis", "paneArcgis"]], (tabId) => {
  if (tabId === "tabGroup") mapBrowser.start();
  if (tabId === "tabDevice") renderSavedMaps();
  if (tabId === "tabArcgis") loadAgolMaps(true);
});
export function openOpenModal(tabId) { openModal("openModal"); switchTab(tabId || "tabGroup"); }
$("tool-open").addEventListener("click", () => openOpenModal("tabGroup"));
$("agolSearch").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => loadAgolMaps(true), 350); });
$("agolMore").addEventListener("click", () => loadAgolMaps(false));
$("browseDevice").addEventListener("click", openFromDevice);
$("newMapBtn").addEventListener("click", newBlankMap);

// ---------- Add layer
export let catalogLoaded = false;
const addBrowser = createBrowser({ p: "al", query: '-type:"Web Map"', accept: (it) => !!SUPPORTED_TYPES[it.type], kind: "layers", thumbOpens: false, descLabel: () => S.layerDescription,
  decorate(b, item) {
    const on = portalLayers.has(item.id), label = on ? S.removeThisLayer : S.addThisLayer;
    b.innerHTML = (on ? ICON_MINUS : ICON_PLUS) + "<span></span>"; b.lastChild.textContent = label;
    b.classList.toggle("on", on); b.setAttribute("aria-label", label + ": " + (item.title || ""));
  },
  async run(item, b) {
    if (portalLayers.has(item.id)) removePortalLayer(item.id);
    else { b.disabled = true; await addPortalLayer({ itemId: item.id, type: item.type, title: item.title }); b.disabled = false; }
    refreshCatalogButtons(); b.focus();
  } });
export function refreshCatalogButtons() { addBrowser.refreshActions(); }
$("tabSketchLayer").hidden = !SKETCH_LAYERS_ON;
const switchAddTab = setupTabs([["tabLayers", "paneLayers"], ["tabOwnData", "paneOwnData"], ["tabSketchLayer", "paneSketchLayer"]], (tabId) => {
  if (tabId === "tabLayers") { addBrowser.start(); catalogLoaded = true; }
  if (tabId === "tabSketchLayer") { $("sketchLayerName").value = nextSketchLayerName(); }
});
// Add layer > New sketch layer: make it, then open Sketch, drawing on it.
$("sketchLayerForm").addEventListener("submit", (e) => {
  e.preventDefault();
  if (!SKETCH_LAYERS_ON) return;
  const name = $("sketchLayerName").value;
  closeModal("addModal");
  createSketchLayer(name);
  if (openPanelName !== "sketch") $("tool-sketch").click();
});
function openAddModal(tabId) { closePanels(false); openModal("addModal"); switchAddTab(tabId || "tabLayers"); }
$("tool-add").addEventListener("click", () => leaveData(() => openAddModal("tabLayers")));

