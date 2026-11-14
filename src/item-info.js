// ============================================================ Map and item information (ⓘ)
import "./collection.js?v=5.0.0-beta.44";   // first: keeps the files running in the order they were written in (see app.js)
import { state } from "./state.js?v=5.0.0-beta.44";
import { questionsFrom, isQuestionsHeading } from "../lib/questions.js?v=5.0.0-beta.44";
import { $, S, F, PORTAL } from "./config.js?v=5.0.0-beta.44";
import { currentTitle } from "./session.js?v=5.0.0-beta.44";
import { openModal, openPanel, closePanels } from "./ui.js?v=5.0.0-beta.44";

export function safeFragment(html) {
  const src = new DOMParser().parseFromString(String(html || ""), "text/html").body;
  const frag = document.createDocumentFragment();
  const ALLOWED = new Set(["P", "BR", "STRONG", "B", "EM", "I", "U", "UL", "OL", "LI", "A", "SPAN", "DIV", "BLOCKQUOTE", "IMG", "SUB", "SUP", "FIGURE", "FIGCAPTION", "TABLE", "THEAD", "TBODY", "TR", "TD", "TH"]);
  const DROP = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "FORM", "INPUT", "BUTTON", "TEXTAREA", "SELECT", "SVG", "MATH", "LINK", "META"]);
  const copy = (node, into) => {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) { into.appendChild(document.createTextNode(n.nodeValue)); continue; }
      if (n.nodeType !== 1 || DROP.has(n.tagName)) continue;
      let tag = n.tagName;
      if (/^H[1-6]$/.test(tag)) tag = "STRONG";
      if (!ALLOWED.has(tag) && tag !== "STRONG") { copy(n, into); continue; }
      const el = document.createElement(tag);
      if (tag === "A") { const href = n.getAttribute("href") || ""; if (/^https?:\/\//i.test(href)) { el.href = href; el.target = "_blank"; el.rel = "noopener noreferrer"; } }
      if (tag === "IMG") { const s = n.getAttribute("src") || ""; if (!/^https:\/\//i.test(s)) continue; el.src = s; el.alt = n.getAttribute("alt") || ""; el.loading = "lazy"; }
      copy(n, el);
      into.appendChild(el);
      if (n.tagName !== tag) into.appendChild(document.createElement("br"));
    }
  };
  copy(src, frag);
  return frag;
}
function fillInfo(item) {
  $("infoH").textContent = item ? item.title : currentTitle();
  const body = $("infoBody"); body.innerHTML = "";
  if (!item) {
    const p = document.createElement("p"); p.textContent = S.aboutLocal; body.appendChild(p);
    $("infoItemLink").hidden = true;
    return;
  }
  if (item.snippet) { const p = document.createElement("p"); const s = document.createElement("strong"); s.textContent = item.snippet; p.appendChild(s); body.appendChild(p); }
  if (item.description) body.appendChild(safeFragment(item.description));
  else if (!item.snippet) { const p = document.createElement("p"); p.textContent = S.noDescription; body.appendChild(p); }
  if (item.accessInformation) { const h = document.createElement("p"); const s = document.createElement("strong"); s.textContent = S.credits + ": "; h.appendChild(s); h.appendChild(document.createTextNode(item.accessInformation)); body.appendChild(h); }
  $("infoItemLink").href = `${PORTAL}/home/item.html?id=${item.id}`; $("infoItemLink").hidden = false;
}
const showInfo = () => { fillInfo(state.currentSource ? state.currentSource.item : null); openModal("infoModal"); };
$("infoBtn").addEventListener("click", showInfo);

// A lesson's questions beside the map (lab: features.lessonQuestions; lib/questions.js). A map's author puts them in
// the item's description under a heading "Questions"; the item's summary, when it is a question, leads. A Questions
// button then shows beside the map's title, and the panel opens with the map when there is a list of questions (once
// for each map opened: closing it is respected). With neither, there is no button.
function descriptionBlocks(html) {      // the description in reading order, as lib/questions.js wants it
  const body = new DOMParser().parseFromString(String(html || ""), "text/html").body, out = [];
  const BLOCK = "p,div,li,ul,ol,h1,h2,h3,h4,h5,h6,table,blockquote";
  const lines = (el) => { const c = el.cloneNode(true); c.querySelectorAll("br").forEach((b) => b.replaceWith("\n")); return c.textContent.split("\n").map((x) => x.trim()).filter(Boolean); };
  const walk = (node) => { for (const el of node.children) {
    if (/^H[1-6]$/.test(el.tagName)) { out.push({ kind: "heading", text: el.textContent }); continue; }
    if (el.querySelector(BLOCK)) { walk(el); continue; }      // a wrapper: its own blocks are read in turn
    const kind = el.tagName === "LI" ? "item" : "text", bold = [...el.querySelectorAll("b,strong")].map((b) => b.textContent).join("").trim();
    const ls = lines(el);
    ls.forEach((text, i) => out.push({ kind: kind === "text" && (isQuestionsHeading(text) || (ls.length === 1 && bold && bold === text)) ? "heading" : kind, text })); } };
  walk(body);
  return out;
}
let questionsFor = null;      // the item whose questions were last put on show
function syncQuestions() {
  const item = state.currentSource && state.currentSource.item;
  const q = F.lessonQuestions && item ? questionsFrom(descriptionBlocks(item.description), item.snippet) : null;
  const btn = $("questionsBtn"), panel = $("questionsPanel");
  btn.hidden = !q;
  if (!q) { if (!panel.hidden) closePanels(); questionsFor = null; return; }
  $("questionsLead").textContent = q.lead; $("questionsLead").hidden = !q.lead;
  const ol = $("questionsList"); ol.replaceChildren(...q.questions.map((text) => { const li = document.createElement("li"); li.textContent = text; return li; })); ol.hidden = !q.questions.length;
  const fresh = questionsFor !== item.id; questionsFor = item.id;
  if (fresh && q.questions.length && panel.hidden && !document.querySelector(".panel:not([hidden]), .modal:not([hidden])")) openPanel("questions");
}
$("questionsMore").addEventListener("click", showInfo);
// Every way a map is opened sets state.currentSource, so that is where the questions are looked for: a setter on it,
// in place of a call at each of those six places.
if (F.lessonQuestions) {
  let current = state.currentSource;
  Object.defineProperty(state, "currentSource", { get: () => current, set(v) { current = v; queueMicrotask(syncQuestions); }, enumerable: true, configurable: true });
  syncQuestions();
}

