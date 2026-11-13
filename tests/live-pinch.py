"""Checks that a two-finger pinch zooms the map and never the page (Atlas 5.0.0-beta.38).

Run:  python3 tests/live-pinch.py [--proxy URL]
Needs network access to js.arcgis.com and www.arcgis.com, and Python Playwright with Chromium.

On a touchscreen a pinch that starts on the header, a toolbar or a panel used to zoom the whole page, leaving the app
enlarged and half off screen. The page now takes one-finger scrolling only; the map still takes the pinch itself.
Chromium's touch emulation stands in for a tablet here: Safari on an iPad is not checked by this test.
"""
import argparse, functools, glob, http.server, os, pathlib, sys, threading
from playwright.sync_api import sync_playwright
import csp_shim   # waits that work under the app's Content Security Policy; collects what it blocked

HERE = pathlib.Path(__file__).resolve().parent
APP = HERE.parent
SCROLLED = """() => { let e = document.querySelector('#omList'); while (e && !(e.scrollHeight > e.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(e).overflowY))) e = e.parentElement; return e ? e.scrollTop : -1; }"""   # how far the list (its scrolling box) has moved
READY = "() => { const m = document.querySelector('arcgis-map'); return !!(m && m.view && m.view.ready); }"

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
        launch = {"args": ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]}
        if found: launch["executable_path"] = found[-1]
        if a.proxy: launch["proxy"] = {"server": a.proxy, "bypass": "localhost,127.0.0.1"}
        browser = p.chromium.launch(**launch)
        ctx = browser.new_context(viewport={"width": 1180, "height": 820}, has_touch=True, is_mobile=True)
        page = ctx.new_page(); cdp = ctx.new_cdp_session(page)
        def pinch(x, y, start=40, end=170, steps=12):     # two fingers moving apart, level with each other, about (x, y)
            pts = lambda d: [{"x": x - d, "y": y, "id": 0}, {"x": x + d, "y": y, "id": 1}]
            cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": pts(start)})
            for k in range(1, steps + 1):
                cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": pts(start + (end - start) * k / steps)}); page.wait_for_timeout(30)
            cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []}); page.wait_for_timeout(900)
        scale = lambda: round(page.evaluate("() => window.visualViewport.scale"), 3)
        mid = lambda sel: page.evaluate("(s) => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }", sel)
        page.goto(f"{base}/index.html"); page.wait_for_function(READY, timeout=120000); page.wait_for_timeout(1500)
        check(scale() == 1, "the page opens at its normal size")
        x, y = mid("header"); pinch(x, y)
        check(scale() == 1, "a pinch on the header leaves the page its normal size (scale %s)" % scale())
        page.click("#tool-sketch"); page.wait_for_timeout(900)
        x, y = mid("#sketchPanel"); pinch(x, y, 30, 120)
        check(scale() == 1, "so does a pinch on the Sketch panel (scale %s)" % scale())
        page.click("#tool-open"); page.wait_for_selector("#omList .cat-card", timeout=120000); page.wait_for_timeout(1200)
        x, y = page.evaluate("""() => { let e = document.querySelector('#omList'); while (e && !(e.scrollHeight > e.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(e).overflowY))) e = e.parentElement;
          const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }""")      # the middle of the list's scrolling box
        pinch(x, y)
        check(scale() == 1, "and on the Open map window (scale %s)" % scale())
        top0 = page.evaluate(SCROLLED)
        cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y + 150}]})
        for k in range(1, 11): cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x, "y": y + 150 - 30 * k}]}); page.wait_for_timeout(30)
        cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []}); page.wait_for_timeout(900)
        top1 = page.evaluate(SCROLLED)
        check(top1 > top0 + 100, "one finger still scrolls a list (%d px)" % (top1 - top0))
        page.keyboard.press("Escape"); page.wait_for_timeout(400)
        page.evaluate("() => { const p = document.querySelector('#sketchPanel'); if (p && !p.hidden) document.querySelector('#tool-sketch').click(); }"); page.wait_for_timeout(500)
        z0 = page.evaluate("() => document.querySelector('arcgis-map').view.zoom")
        r = page.evaluate("() => { const r = document.querySelector('arcgis-map').getBoundingClientRect(); return [r.left + r.width * 0.5, r.top + r.height * 0.6]; }")
        pinch(r[0], r[1], 50, 260, 16); page.wait_for_timeout(1500)
        z1 = page.evaluate("() => document.querySelector('arcgis-map').view.zoom")
        check(z1 > z0 + 0.5 and scale() == 1, "a pinch on the map zooms the map (zoom %.1f to %.1f), not the page (scale %s)" % (z0, z1, scale()))
        browser.close()
    print(f"{checks[0] - len(failures)}/{checks[0]} checks passed")
    sys.exit(csp_shim.finish(failures))

if __name__ == "__main__":
    main()
