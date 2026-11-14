"""Checks that every panel and dialog of Atlas 5.0 fits on the screen (5.0.0-beta.37), in Chromium against the real services.

Run:  python3 tests/live-panels.py [--proxy URL]
Needs network access to js.arcgis.com and www.arcgis.com, and Python Playwright with Chromium.

At four window sizes (an iPad in Safari, landscape and portrait; a small laptop; a phone) each tool's panel or dialog
is opened and must lie inside the window, with room to scroll through what it holds. Then a chart is opened under
the map and the panels over the map must use the room the tucked-away toolbar left. Last, Safari: there 100vh can be
taller than the area fixed elements fill, so the dialogs are opened with that area made 150 px shorter than the
window, and must stay inside it.
"""
import argparse, functools, glob, http.server, os, pathlib, sys, threading
from playwright.sync_api import sync_playwright
import csp_shim   # waits that work under the app's Content Security Policy; collects what it blocked
HERE = pathlib.Path(__file__).resolve().parent
APP = HERE.parent
MAP = "69874ffe9be341afbe2e93a51dbfc5c3"
SIZES = [(1148, 643, "iPad landscape (Safari)"), (820, 1010, "iPad portrait"), (1366, 650, "laptop"), (390, 660, "phone")]
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(("localhost", 0), functools.partial(Q, directory=csp_shim.served(APP))); threading.Thread(target=srv.serve_forever, daemon=True).start()
base = f"http://localhost:{srv.server_port}"; found = sorted(glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome"))
ap = argparse.ArgumentParser(); ap.add_argument("--proxy", default=os.environ.get("HTTPS_PROXY", "")); a = ap.parse_args()
failures, checks = [], [0]
def check(cond, msg):
    checks[0] += 1; print(("  ok   " if cond else "  FAIL ") + msg, flush=True)
    if not cond: failures.append(msg)
RECT = """(sel) => { const e = document.querySelector(sel); if (!e || e.hidden || !e.getClientRects().length) return null; const r = e.getBoundingClientRect();
  // the part of it the person can scroll through: the largest scrolling box inside it
  let inner = 0; for (const x of [e, ...e.querySelectorAll('*')]) { const cs = getComputedStyle(x); if (/(auto|scroll)/.test(cs.overflowY) && x.clientHeight > inner && x.scrollHeight > 0) inner = x.clientHeight; }
  return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), h: Math.round(r.height), inner, W: innerWidth, H: innerHeight }; }"""
PANELS = [("basemaps", "#tool-basemaps", "#basemapsPanel"), ("open map", "#tool-open", "#openModal .open-card"), ("map layers", "#tool-layers", "#layersPanel"),
          ("add layer", "#tool-add", "#addModal .open-card"), ("legend", "#tool-legend", "#legendPanel"), ("measure", "#tool-measure", "#measurePanel"),
          ("elevation", "#tool-profile", "#profilePanel"), ("sketch", "#tool-sketch", "#sketchPanel"), ("bookmarks", "#tool-bookmarks", "#bookmarksPanel"),
          ("save", "#tool-save", "#savePanel"), ("versions", "#verBtn", "#aboutPanel")]
with sync_playwright() as p:
    launch = {}
    if found: launch["executable_path"] = found[-1]
    if a.proxy: launch["proxy"] = {"server": a.proxy, "bypass": "localhost,127.0.0.1"}
    b = csp_shim.launch(p, launch)
    for (W, H, name) in SIZES:
        page = b.new_context(viewport={"width": W, "height": H}, has_touch=W < 1200).new_page()
        page.goto(f"{base}/index.html?config=lab&webmap={MAP}")
        page.wait_for_function("(() => { const m = document.querySelector('arcgis-map'); return !!(m && m.view && m.view.ready && m.view.map.loaded); })()", timeout=120000); page.wait_for_timeout(4000)
        print(f"== {name} {W}x{H}")
        def show(label, r, extra="", need=90):
            if not r: check(False, f"{label} is shown {extra}"); return
            bad = []
            if r["bottom"] > r["H"] + 1: bad.append(f"bottom {r['bottom']} > {r['H']}")
            if r["top"] < -1: bad.append(f"top {r['top']}")
            if r["right"] > r["W"] + 1 or r["left"] < -1: bad.append(f"sides {r['left']}..{r['right']} of {r['W']}")
            if r["inner"] and r["inner"] < need: bad.append(f"scroll area only {r['inner']}px")
            check(not bad, f"{label}: inside the window, y {r['top']}-{r['bottom']}, scroll area {r['inner']}px {'; '.join(bad)} {extra}")
        def closeall():
            page.keyboard.press("Escape"); page.wait_for_timeout(300)
            page.evaluate("document.querySelectorAll('.modal:not([hidden]) [data-modal-close], .panel:not([hidden]) [data-close], .dock:not([hidden]) [data-close]').forEach(b => b.click())"); page.wait_for_timeout(500)
        for label, btn, sel in PANELS:
            closeall()
            if btn == "#tool-measure":
                page.evaluate("document.querySelector('#tool-measure').click()"); page.wait_for_timeout(500)
                if page.is_visible("#measureMenu"): page.evaluate("document.querySelector('#menuMeasure').click()")
            elif page.evaluate(f"!!document.querySelector('{btn}') && !document.querySelector('{btn}').hidden && document.querySelector('{btn}').getClientRects().length > 0"):
                page.evaluate(f"document.querySelector('{btn}').click()")
            else:
                # the toolbar may be folded away on a narrow screen: open it
                page.evaluate("(() => { const t = document.querySelector('#toolsToggle, .tools-toggle, [aria-controls=toolbar]'); if (t) t.click(); })()"); page.wait_for_timeout(400)
                page.evaluate(f"(() => {{ const b = document.querySelector('{btn}'); if (b) b.click(); }})()")
            page.wait_for_timeout(1500)
            r = page.evaluate(RECT, sel)
            show(label, r)
        # a chart under the map, then the side panels above it
        closeall()
        page.evaluate("document.querySelector('#tool-layers').click()"); page.wait_for_timeout(1200)
        page.evaluate("document.querySelectorAll('#layersPanel [aria-expanded=\"false\"]').forEach(b => { if (b.querySelector('calcite-icon[icon=\"chevron-right\"]')) b.click(); })"); page.wait_for_timeout(800)
        page.evaluate("(() => { const b = document.querySelector('#layersPanel [data-key$=\":chart\"]'); if (b) b.click(); })()"); page.wait_for_timeout(5000)
        show("chart dock", page.evaluate(RECT, "#tableDock"))
        # the panel open before the chart: with the toolbar tucked away it gets the room the toolbar had
        page.close()
        page = b.new_context(viewport={"width": W, "height": H}, has_touch=W < 1200).new_page()
        page.goto(f"{base}/index.html?config=lab&webmap={MAP}")
        page.wait_for_function("(() => { const m = document.querySelector('arcgis-map'); return !!(m && m.view && m.view.ready && m.view.map.loaded); })()", timeout=120000); page.wait_for_timeout(4000)
        page.evaluate("document.querySelector('#tool-layers').click()"); page.wait_for_timeout(1200)
        page.evaluate("document.querySelectorAll('#layersPanel [aria-expanded=\"false\"]').forEach(b => { if (b.querySelector('calcite-icon[icon=\"chevron-right\"]')) b.click(); })"); page.wait_for_timeout(800)
        page.evaluate("(() => { const b = document.querySelector('#layersPanel [data-key$=\":chart\"]'); if (b) b.click(); })()"); page.wait_for_timeout(4000)
        r = page.evaluate(RECT, "#layersPanel"); m = page.evaluate("(() => { const r = document.getElementById('mapWrap').getBoundingClientRect(); return Math.round(r.height); })()")
        check(r and r["h"] >= min(m - 60, 400) * 0.75, f"Map layers over a chart uses the map's height: {r and r['h']}px of a {m}px map")
        page.close()
    # Safari: the area fixed elements fill made 150 px shorter than the window, as Safari's toolbars can
    for (W, H) in [(1148, 790), (390, 800)]:
        page = b.new_context(viewport={"width": W, "height": H}).new_page()
        page.goto(f"{base}/index.html?config=lab"); page.wait_for_function("(() => { const m = document.querySelector('arcgis-map'); return !!(m && m.view && m.view.ready); })()", timeout=120000); page.wait_for_timeout(2000)
        page.add_style_tag(content=".modal{ bottom:150px !important; }")
        for btn, sel in [("#tool-open", "#openModal"), ("#tool-add", "#addModal")]:
            page.evaluate(f"document.querySelector('{btn}').click()"); page.wait_for_timeout(1500)
            r = page.evaluate(f"(() => {{ const m = document.querySelector('{sel}').getBoundingClientRect(), c = document.querySelector('{sel} .open-card').getBoundingClientRect(); return [Math.round(m.bottom), Math.round(c.bottom)]; }})()")
            check(r[1] <= r[0], f"{W}x{H} {sel} stays inside a visible area shorter than 100vh: ends at {r[1]}, the area at {r[0]}")
            page.keyboard.press("Escape"); page.wait_for_timeout(400)
        page.close()
    b.close()
print(f"{checks[0] - len(failures)}/{checks[0]} checks passed")
sys.exit(csp_shim.finish(failures))
