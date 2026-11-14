// ============================================================ Map and item information (ⓘ)
import "./collection.js?v=5.0.0-beta.43";   // first: keeps the files running in the order they were written in (see app.js)
import { state } from "./state.js?v=5.0.0-beta.43";
import { $, S, PORTAL } from "./config.js?v=5.0.0-beta.43";
import { currentTitle } from "./session.js?v=5.0.0-beta.43";
import { openModal } from "./ui.js?v=5.0.0-beta.43";

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
$("infoBtn").addEventListener("click", () => { fillInfo(state.currentSource ? state.currentSource.item : null); openModal("infoModal"); });

