"""Checks the lab feature of Atlas 5.0.0-beta.48: Print an outline map.

Run:  python3 tests/live-outline.py [--shots DIR] [--proxy URL]
Needs network access to js.arcgis.com, www.arcgis.com and services.arcgis.com, and Python Playwright with Chromium.
The boundaries are fetched from Esri's public layers, as in use. Printing itself is not done: the browser's print
dialog is replaced by a note of what would have been printed.
"""
import argparse, functools, glob, http.server, os, pathlib, sys, threading
from playwright.sync_api import sync_playwright
import csp_shim   # waits that work under the app's Content Security Policy; collects what it blocked

HERE = pathlib.Path(__file__).resolve().parent
APP = HERE.parent
READY = "() => { const m = document.querySelector('arcgis-map'); return !!(m && m.view && m.view.ready); }"
DRAWN = "() => !document.getElementById('outlinePrintBtn').disabled"
SVG = "() => { const s = document.querySelector('#outlinePreview svg'); if (!s) return null; const vb = s.getAttribute('viewBox').split(' ').map(Number); return { paths: s.querySelectorAll('path').length, names: [...s.querySelectorAll('text')].map((t) => t.textContent), w: vb[2], h: vb[3], strokes: [...new Set([...s.querySelectorAll('path')].map((p) => p.getAttribute('stroke') + '/' + p.getAttribute('fill')))].join(' '), label: s.getAttribute('aria-label') }; }"

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--shots", default=str(HERE / ".shots")); ap.add_argument("--proxy", default=os.environ.get("HTTPS_PROXY", "")); a = ap.parse_args()
    shots = pathlib.Path(a.shots); shots.mkdir(parents=True, exist_ok=True)
    srv = http.server.ThreadingHTTPServer(("localhost", 0), functools.partial(Quiet, directory=csp_shim.served(APP)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://localhost:{srv.server_port}"
    found = sorted(glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome"))
    failures, checks = [], [0]
    def check(cond, msg):
        checks[0] += 1; print(("  ok   " if cond else "  FAIL ") + msg, flush=True)
        if not cond: failures.append(msg)
    with sync_playwright() as p:
        launch = {"args": ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]}
        if found: launch["executable_path"] = found[-1]
        if a.proxy: launch["proxy"] = {"server": a.proxy, "bypass": "localhost,127.0.0.1"}
        browser = csp_shim.launch(p, launch)
        page = browser.new_page(viewport={"width": 1366, "height": 900})
        page.goto(f"{base}/index.html"); page.wait_for_function(READY, timeout=120000); page.wait_for_timeout(1500)
        page.click("#tool-save"); page.wait_for_timeout(500)
        check(page.is_visible("#printTile") and page.is_visible("#outlineTile") and page.inner_text("#outlineTile").strip().startswith("Print an outline map"), "the Save panel offers Print, and Print an outline map")
        page.click("#outlineTile"); page.wait_for_function(DRAWN, timeout=90000)
        opts = page.evaluate("() => [...document.getElementById('outlineMap').options].map((o) => o.textContent)")
        check(len(opts) == 8 and opts[0] == "The world: continents" and opts[-1] == "United States: states", "eight maps to choose from: " + "; ".join(opts))
        w = page.evaluate(SVG)
        check(w and w["paths"] == 8 and not w["names"] and w["strokes"] == "#000/#fff" and w["w"] > w["h"] * 1.8, "the world is drawn as 8 continents, black lines on white, with no names, about twice as wide as tall")
        page.click("#outlineNames"); page.wait_for_function(DRAWN, timeout=30000); page.wait_for_timeout(300); w = page.evaluate(SVG)
        check(set(["Africa", "Asia", "Europe", "North America", "South America"]) <= set(w["names"]), "Show names writes the continents' names: " + ", ".join(w["names"]))
        page.screenshot(path=str(shots / "outline-world.png"))
        page.select_option("#outlineMap", "africa"); page.wait_for_function("() => (document.querySelector('#outlinePreview svg') || {}).getAttribute && document.querySelector('#outlinePreview svg').getAttribute('aria-label') === 'Africa: countries' && !document.getElementById('outlinePrintBtn').disabled", timeout=90000); f = page.evaluate(SVG)
        check(f["paths"] >= 50 and set(["Nigeria", "Egypt", "South Africa", "Kenya"]) <= set(f["names"]), "Africa is drawn with its countries, named: %d shapes, %d names" % (f["paths"], len(f["names"])))
        page.select_option("#outlineMap", "europe"); page.wait_for_function("() => document.querySelector('#outlinePreview svg').getAttribute('aria-label') === 'Europe: countries' && !document.getElementById('outlinePrintBtn').disabled", timeout=90000); e = page.evaluate(SVG)
        check("Russian Federation" in e["names"] and "France" in e["names"], "the map of Europe includes Russia")
        page.select_option("#outlineMap", "us-states"); page.wait_for_function("() => document.querySelector('#outlinePreview svg').getAttribute('aria-label') === 'United States: states' && !document.getElementById('outlinePrintBtn').disabled", timeout=90000); u = page.evaluate(SVG)
        check(u["paths"] == 51 and set(["Texas", "Alaska", "Kansas"]) <= set(u["names"]) and len(u["names"]) >= 48, "the United States is drawn as 50 states and the District of Columbia, named (%d names; a state too small for its name uses its two letters)" % len(u["names"]))
        page.screenshot(path=str(shots / "outline-us.png"))
        page.click("#outlineNames"); page.wait_for_function(DRAWN, timeout=30000); page.wait_for_timeout(300)
        page.evaluate("() => { window.__printed = null; window.print = () => { const s = document.getElementById('printSheet'); window.__printed = { cls: s.className, line: (s.querySelector('.name-line') || {}).textContent || '', paths: s.querySelectorAll('svg path').length, names: s.querySelectorAll('svg text').length, meta: (s.querySelector('.meta') || {}).textContent || '', page: [...document.head.querySelectorAll('style')].map((x) => x.textContent).filter((t) => /@page\\{ size:/.test(t)).join('') }; }; }")
        page.click("#outlinePrintBtn"); page.wait_for_timeout(600); pr = page.evaluate("window.__printed")
        check(pr and pr["paths"] == 51 and pr["names"] == 0 and "outline" in pr["cls"] and pr["line"].startswith("Name ") and "Date" in pr["line"], "Print sends the blank map to the printer with a line for a name and a date")
        check("size:landscape" in pr["page"] and "Boundaries: Esri" in pr["meta"] and page.is_hidden("#outlineModal"), "on a landscape page, with its source beneath; the window closes")
        browser.close()
    print(f"{checks[0] - len(failures)}/{checks[0]} checks passed")
    sys.exit(csp_shim.finish(failures))

if __name__ == "__main__":
    main()
