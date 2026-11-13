"""Checks where Atlas 5.0 opens: zoomed in far enough that the world fills the map's width (5.0.0-beta.35).

Run:  python3 tests/live-start.py [--proxy URL]
Needs network access to js.arcgis.com and www.arcgis.com, and Python Playwright with Chromium.

The map library does not repeat the world sideways when zoomed out, so a world narrower than the map leaves white bands
either side. The app opens at the config's zoom, or closer when that would happen; a config's own closer zoom is kept.
"""
import argparse, functools, glob, http.server, os, pathlib, sys, threading
from playwright.sync_api import sync_playwright
import csp_shim   # waits that work under the app's Content Security Policy; collects what it blocked

HERE = pathlib.Path(__file__).resolve().parent
APP = HERE.parent
READY = "(() => { const m = document.querySelector('arcgis-map'); return !!(m && m.view && m.view.ready); })()"
# the colours at the left and right edges of the map, from the view's own picture (transparent where nothing is drawn)
EDGES = """async () => { const v = document.querySelector('arcgis-map').view;
  for (let i = 0; i < 60 && (v.updating || i < 4); i++) await new Promise(r => setTimeout(r, 500));   // until the map has finished drawing
  await new Promise(r => setTimeout(r, 1000));
  const s = await v.takeScreenshot({ format: 'png' }), d = s.data, at = (x, y) => d.data[(y * d.width + x) * 4 + 3];
  const y = Math.round(d.height / 2); return { zoom: v.zoom, left: at(20, y), right: at(d.width - 20, y), width: v.width }; }"""

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--proxy", default=os.environ.get("HTTPS_PROXY", "")); a = ap.parse_args()
    srv = http.server.ThreadingHTTPServer(("localhost", 0), functools.partial(Quiet, directory=str(APP)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://localhost:{srv.server_port}"
    found = sorted(glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome"))
    failures, checks = [], [0]
    def check(cond, msg):
        checks[0] += 1; print(("  ok   " if cond else "  FAIL ") + msg, flush=True)
        if not cond: failures.append(msg)
    with sync_playwright() as p:
        launch = {}
        if found: launch["executable_path"] = found[-1]
        if a.proxy: launch["proxy"] = {"server": a.proxy, "bypass": "localhost,127.0.0.1"}
        browser = p.chromium.launch(**launch)
        def opened(query, w, h):
            page = browser.new_context(viewport={"width": w, "height": h}).new_page()
            page.goto(f"{base}/index.html{query}"); page.wait_for_function(READY, timeout=120000); page.wait_for_timeout(1500)
            e = page.evaluate(EDGES); page.close(); return e
        e = opened("", 1907, 990)
        check(e["zoom"] == 3 and e["left"] > 0 and e["right"] > 0, "a 1907 px wide screen opens at zoom 3, with the map drawn right to both edges (zoom %s)" % e["zoom"])
        e = opened("", 1366, 768)
        check(e["zoom"] == 3 and e["left"] > 0 and e["right"] > 0, "so does a 1366 px wide screen (zoom %s)" % e["zoom"])
        e = opened("", 1000, 700)
        check(e["zoom"] == 2 and e["left"] > 0 and e["right"] > 0, "a map up to 1,024 px wide keeps the config's zoom 2, which already fills it (zoom %s)" % e["zoom"])
        e = opened("?config=mapmaker", 2560, 1300)
        check(e["zoom"] == 4 and e["left"] > 0 and e["right"] > 0, "a 2560 px wide screen opens at zoom 4 (zoom %s)" % e["zoom"])
        e = opened("?config=example-es", 1907, 990)
        check(e["zoom"] == 7, "a config's own closer zoom is kept (Panama, zoom %s)" % e["zoom"])
        browser.close()
    print(f"{checks[0] - len(failures)}/{checks[0]} checks passed")
    sys.exit(csp_shim.finish(failures))

if __name__ == "__main__":
    main()
