// The manager app's side of the preview, as small as it can be (tests/live-partner.py).
const frame = document.getElementById("frame");
const app = new URLSearchParams(location.search).get("app") || new URL("../../index.html", location.href).href;
const target = new URL(app);
target.searchParams.set("preview", "1");
const config = JSON.parse(decodeURIComponent(location.hash.slice(1) || "{}"));
window.__readyFrom = [];
addEventListener("message", (e) => {
  if (e.source !== frame.contentWindow || !e.data || e.data.type !== "atlaslab-preview-ready") return;
  window.__readyFrom.push(e.origin);
  frame.contentWindow.postMessage({ type: "atlaslab-preview-config", config }, target.origin);
});
frame.src = target.href;
