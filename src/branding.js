// ============================================================ Branding and text
import { late } from "./state.js?v=5.0.0-beta.40";
import { APP_VERSION, $, cfgName, cfg, F, S, t } from "./config.js?v=5.0.0-beta.40";

export function hexToRgb(hex) {
  let h = String(hex || "").replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [0, 0, 0];
}
function luminance(hex) { return hexToRgb(hex).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0); }
function contrast(a, b) { const la = luminance(a), lb = luminance(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }
const bestInk = (bg) => (contrast(bg, "#ffffff") >= contrast(bg, "#000000") ? "#ffffff" : "#000000");
function mix(hex, withHex, w) { const a = hexToRgb(hex), b = hexToRgb(withHex); return "#" + a.map((v, i) => Math.round(v * (1 - w) + b[i] * w).toString(16).padStart(2, "0")).join(""); }
const cssString = (v) => '"' + String(v).replace(/[\\"]/g, "\\$&").replace(/[\n\r\f]/g, " ") + '"';
const safeUrl = (u) => (typeof u === "string" && /^(https:\/\/|\.\/|\/|[\w-]+\.(png|svg|jpe?g|webp))/i.test(u) ? u : "");

function applyTheme() {
  const th = cfg.theme, r = document.documentElement.style;
  const set = (k, v) => { if (v) r.setProperty(k, v); };
  const soft = th.brandSoft || mix(th.brand, "#ffffff", 0.88);
  let strong = th.brand;   // brand-coloured text on the soft tint must still reach 4.5:1
  for (let i = 0; i < 20 && contrast(strong, soft) < 4.5; i++) strong = mix(strong, "#000000", 0.08);
  set("--brand", th.brand); set("--brand-ink", th.brandInk || bestInk(th.brand)); set("--brand-soft", soft); set("--brand-strong", strong);
  set("--header-bg", th.header); set("--header-ink", th.headerInk || bestInk(th.header)); set("--header-line", th.headerLine);
  set("--pill-dark", th.pill); set("--pill-dark-ink", th.pillInk || bestInk(th.pill));
  const active = th.toolActive || soft;
  set("--tool-active", active); set("--tool-active-ink", th.toolActiveInk || bestInk(active));
  if (th.font) set("--font", th.font);
  if (contrast(th.brand, th.brandInk || bestInk(th.brand)) < 4.5) console.warn("Theme: brand colour and its text colour are below WCAG 4.5:1 contrast.");
}
function applyStrings(root) {
  root = root || document;
  root.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll("[data-i18n-aria]").forEach((el) => el.setAttribute("aria-label", t(el.dataset.i18nAria)));
  root.querySelectorAll("[data-i18n-title]").forEach((el) => el.setAttribute("title", t(el.dataset.i18nTitle)));
  root.querySelectorAll("[data-i18n-ph]").forEach((el) => el.setAttribute("placeholder", t(el.dataset.i18nPh)));
}
function applyHeader() {
  document.documentElement.lang = cfg.locale || "en";
  document.documentElement.dir = cfg.dir === "rtl" ? "rtl" : "ltr";
  document.title = cfg.appName;
  const logo = cfg.logo || {};
  const link = $("logoLink");
  link.href = safeUrl(logo.link) || ("./" + (cfgName !== "default" ? "?config=" + encodeURIComponent(cfgName) : ""));
  if (logo.link) { link.target = "_blank"; link.rel = "noopener"; }
  const wide = safeUrl(logo.url), compact = safeUrl(logo.compactUrl) || wide;
  if (wide) {
    $("logoImg").src = wide; $("logoImg").alt = logo.alt || cfg.appName; $("logoImg").hidden = false;
    $("logoCompact").src = compact; $("logoCompact").alt = logo.alt || cfg.appName; $("logoCompact").hidden = false;
  }
  const showName = cfg.showAppName !== false && (!wide || logo.showName);
  $("logoText").textContent = showName ? cfg.appName : "";
  $("logoText").hidden = !showName;
  link.hidden = !wide && !showName;   // nothing to show: no empty link
  const links = $("hdrLinks"); links.innerHTML = "";
  for (const l of cfg.headerLinks || []) {
    if (!l || !/^https:\/\//i.test(l.url || "") || !l.label) continue;
    const a = document.createElement("a");
    a.className = "pill " + (l.style === "outline" ? "outline" : "dark");
    a.href = l.url; a.target = "_blank"; a.rel = "noopener"; a.textContent = l.label;
    links.appendChild(a);
  }
  links.hidden = !links.children.length;
  const partners = $("hdrPartners"); partners.innerHTML = "";
  for (const p of cfg.partnerLogos || []) {
    const src = safeUrl(p && p.url);
    if (!src) continue;
    const img = document.createElement("img"); img.src = src; img.alt = p.alt || "";
    if (p.link && /^https:\/\//i.test(p.link)) { const a = document.createElement("a"); a.href = p.link; a.target = "_blank"; a.rel = "noopener"; a.appendChild(img); partners.appendChild(a); }
    else partners.appendChild(img);
  }
  // The disclaimer sits in the attribution bar, before "Powered by Esri", as in MapMaker.
  if (cfg.disclaimer) $("mapWrap").style.setProperty("--atlas-disclaimer", cssString(String(cfg.disclaimer).replace(/\s+/g, " ").trim() + " | "));
  $("docTitle").placeholder = S.untitled;
  $("docTitle").setAttribute("aria-label", S.mapTitle);
  $("verBtn").textContent = "v" + APP_VERSION;
  $("verBtn").setAttribute("aria-label", S.versions + " v" + APP_VERSION);
  $("tabGroup").textContent = t("tabGroup");
  $("tabLayers").textContent = t("layersFrom");
  document.querySelectorAll("[data-feature]").forEach((el) => { if (F[el.dataset.feature] === false) el.hidden = true; });
  $("signInBtn").hidden = F.signIn === false || (cfg.signIn || {}).headerButton === false;
  $("signInTile").hidden = F.signIn === false;
  if (late.refreshTileTips) late.refreshTileTips();
}
// Toolbar icons. The page starts with these built-in outline icons; once the ArcGIS SDK has loaded Esri's
// Calcite icons (the set MapMaker uses), each one is swapped in as soon as it has drawn.
const ICON_SVG = {
  "basemap": '<path d="M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z"/><path d="M3 8.5 6.5 5 11 9M15 3v4h6M3 18l3-2 5 2.5M17 13v8M13 17h8"/>',
  "map": '<path d="M3 3h18v18H3z"/><path d="M8.5 21c.5-2.5 2.5-3.5 1.5-6s-3-2.5-1.5-5S13 8 13.5 3M14 21c.5-2 2-3 4-3s2.5-1.5 3-2"/>',
  "layer-map": '<path d="M2.5 6.5 9 4l6 2.5L21.5 4v13.5L15 20l-6-2.5-6.5 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
  "plus-circle": '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v9M7.5 12h9"/>',
  "legend": '<path d="M4 4.5h3v3H4zM4 10.5h3v3H4zM5.5 16.5 7 19H4zM10 6h10M10 12h10M10 18h10"/>',
  "measure": '<path d="M3 15h18v5H3z"/><path d="M6 15v2M9 15v3M12 15v2M15 15v3M18 15v2M3 8h7M5 6 3 8l2 2M14 8h7M19 6l2 2-2 2"/>',
  "altitude": '<path d="M3 21h18M3 11l3-4 3 3 3-5M17 3v18M14.5 5.5 17 3l2.5 2.5M14.5 18.5 17 21l2.5-2.5M14 3h6"/>',
  "pencil-mark": '<path d="M15 4.5 19.5 9 10 18.5H5.5V14z"/><path d="m13 6.5 4.5 4.5"/><path d="M3.5 21c2-1 3-1 5-1M3 10c1.5-4 4-5 5.5-3.5"/>',
  "cube": '<path d="M12 2.5 20.5 7v10L12 21.5 3.5 17V7z"/><path d="M3.5 7 12 11.5 20.5 7M12 11.5v10"/>',
  "bookmark": '<path d="M6 3h12v18l-6-5.5L6 21z"/>',
  "save": '<path d="M4 3h13l3 3v15H4z"/><path d="M8 3v5h8V3M7 21v-7h10v7"/>'
};
function paintIcons() {
  document.querySelectorAll(".ti[data-icon]").forEach((el) => {
    if (el.querySelector("svg, calcite-icon")) return;
    el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" focusable="false">' + (ICON_SVG[el.dataset.icon] || "") + "</svg>";
  });
}
export async function upgradeIcons() {
  if (!window.customElements) return;
  const ready = await Promise.race([customElements.whenDefined("calcite-icon").then(() => true), new Promise((r) => setTimeout(() => r(false), 15000))]);
  if (!ready) return;
  const pending = [...document.querySelectorAll(".ti[data-icon]")].map((span) => {
    const ic = document.createElement("calcite-icon");
    ic.setAttribute("icon", span.dataset.icon); ic.setAttribute("scale", span.classList.contains("sm") ? "s" : span.classList.contains("md") ? "m" : "l");
    ic.setAttribute("aria-hidden", "true"); ic.className = "pending";
    span.appendChild(ic);
    return { span, ic };
  });
  const drawn = (ic) => { const root = ic.shadowRoot; const path = root && root.querySelector("path"); return !!(path && (path.getAttribute("d") || "").length > 4); };
  const started = Date.now();
  const timer = setInterval(() => {
    for (let i = pending.length - 1; i >= 0; i--) {
      const { span, ic } = pending[i];
      if (!drawn(ic)) continue;
      [...span.childNodes].forEach((n) => { if (n !== ic) n.remove(); });
      ic.classList.remove("pending"); pending.splice(i, 1);
    }
    if (!pending.length || Date.now() - started > 120000) { clearInterval(timer); pending.forEach(({ ic }) => ic.remove()); }
  }, 400);
}
applyTheme();
applyStrings();
applyHeader();
paintIcons();

