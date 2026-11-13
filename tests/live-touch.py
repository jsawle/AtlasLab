"""Runs the Elevation profile with a finger (touch) in Atlas 5.0, in Chromium against the real services (5.0.0-beta.36).

Run:  python3 tests/live-touch.py [--3d] [--proxy URL] [--axe FILE]
Needs network access to js.arcgis.com and www.arcgis.com, and Python Playwright with Chromium.

An iPad-sized page with touch. Checks: taps add points and the line so far is drawn through them, with a dot at each;
the message says "tap"; Undo point takes the last one away; Finish line charts the line; panning with a finger while
drawing doesn't pull the line to the finger or ask the map what is under the finger; a drawn line's handles can be
hit with a finger and dragged.
"""
import argparse, functools, glob, http.server, os, pathlib, sys, threading
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
APP = HERE.parent
UA = "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--3d", dest="three", action="store_true"); ap.add_argument("--proxy", default=os.environ.get("HTTPS_PROXY", "")); ap.add_argument("--axe", default="")
    a = ap.parse_args()
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
        ctx = browser.new_context(viewport={"width": 1180, "height": 820}, has_touch=True, user_agent=UA)
        page = ctx.new_page(); errors = []
        cdp = ctx.new_cdp_session(page)
        def swipe(s, e, steps=12, pause=35):   # a real finger drag, through Chromium's touch input
            cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": s[0], "y": s[1]}]})
            for k in range(1, steps + 1):
                page.wait_for_timeout(pause)
                cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": s[0] + (e[0] - s[0]) * k / steps, "y": s[1] + (e[1] - s[1]) * k / steps}]})
            cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
        page.on("pageerror", lambda e: errors.append(str(e)[:300]))
        page.goto(f"{base}/index.html?config=lab")
        page.wait_for_function("(() => { const m = document.querySelector('arcgis-map'); return !!(m && m.view && m.view.ready); })()", timeout=120000); page.wait_for_timeout(1500)
        V = "document.querySelector('arcgis-map').view"
        if a.three:
            page.evaluate("document.querySelector('#tg3d').click()")
            page.wait_for_function("(() => { const s = document.querySelector('arcgis-scene'); return !!(s && s.view && s.view.ready); })()", timeout=180000); page.wait_for_timeout(5000)
            V = "document.querySelector('arcgis-scene').view"
        page.evaluate("async () => { await " + V + ".goTo({ center: [20, -10], zoom: 4 }, { animate: false }); }"); page.wait_for_timeout(2500)
        # count the map's hit tests (what the tool asks the map about the place under a pointer)
        page.evaluate("(() => { const v = " + V + "; const h = v.hitTest.bind(v); window.__hits = 0; v.hitTest = (...x) => { window.__hits++; return h(...x); }; })()")
        page.evaluate("document.querySelector('#tool-profile').click()"); page.wait_for_selector("#profChart .prof-msg", timeout=60000); page.wait_for_timeout(800)
        box = page.evaluate("(() => { const r = " + V + ".container.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; })()")
        pt = lambda fx, fy: (box[0] + box[2] * fx, box[1] + box[3] * fy)
        DRAFT = "(() => { const v = " + V + "; const d = v.graphics.find(g => g.symbol && g.symbol.style === 'short-dash'); const m = v.graphics.find(g => g.geometry && g.geometry.type === 'multipoint'); return { line: d ? d.geometry.paths[0].length : 0, dots: m ? m.geometry.points.length : 0, finish: !document.getElementById('profFinish').hidden, undo: !document.getElementById('profUndo').hidden }; })()"

        print("== drawing with taps")
        page.touchscreen.tap(*pt(0.35, 0.45)); page.wait_for_timeout(900)
        d1 = page.evaluate(DRAFT); msg = page.inner_text("#profChart")
        check(d1["dots"] == 1 and d1["line"] == 0 and d1["undo"] and not d1["finish"], "the first tap shows a dot, and Undo point: " + str(d1))
        check(msg.startswith("Tap for each point") and "Finish line" in msg, "the message says tap, then Finish line: " + msg)
        page.touchscreen.tap(*pt(0.5, 0.55)); page.wait_for_timeout(900)
        d2 = page.evaluate(DRAFT)
        check(d2["dots"] == 2 and d2["line"] > 2 and d2["finish"], "the second tap draws the line so far, and Finish line appears: " + str(d2))
        # a finger panning the map while drawing
        h0 = page.evaluate("window.__hits"); c0 = page.evaluate("(() => { const c = " + V + ".center; return [c.longitude, c.latitude]; })()")
        s = pt(0.6, 0.3); e = pt(0.45, 0.35)
        swipe(s, e)
        page.wait_for_timeout(1500)
        d3 = page.evaluate(DRAFT); h1 = page.evaluate("window.__hits"); c1 = page.evaluate("(() => { const c = " + V + ".center; return [c.longitude, c.latitude]; })()")
        check(d3["dots"] == 2 and d3["line"] == d2["line"], "panning with a finger doesn't pull the line to the finger: " + str(d3))
        check(h1 == h0, "nor ask the map what is under the finger while it moves: %d hit tests" % (h1 - h0))
        check(abs(c1[0] - c0[0]) > 0.5 or abs(c1[1] - c0[1]) > 0.5, "the map panned: %.1f, %.1f to %.1f, %.1f" % (c0[0], c0[1], c1[0], c1[1]))
        page.touchscreen.tap(*pt(0.62, 0.45)); page.wait_for_timeout(900)
        check(page.evaluate(DRAFT)["dots"] == 3, "a third tap adds a third point")
        page.tap("#profUndo"); page.wait_for_timeout(500)
        check(page.evaluate(DRAFT)["dots"] == 2, "Undo point takes the last one away")
        page.tap("#profFinish")
        try: page.wait_for_selector("#profChart .prof-land", timeout=60000); ok = True
        except Exception: ok = False
        page.wait_for_timeout(800); d4 = page.evaluate(DRAFT)
        check(ok and d4["dots"] == 0 and d4["line"] == 0 and not d4["finish"] and not d4["undo"], "Finish line charts the line; the drawing dots and the buttons go: " + str(d4))
        check(page.is_visible("#profNew"), "and New profile is offered")
        page.screenshot(path="/tmp/touch-profile.png")
        if a.axe:
            page.add_script_tag(path=a.axe)
            v = page.evaluate("async () => (await axe.run('#profilePanel', { runOnly: ['wcag2a','wcag2aa','wcag21a','wcag21aa'] })).violations.map(v => v.id)")
            check(not v, "the dock passes the accessibility scan: " + ", ".join(v))

        print("== a handle with a finger")
        vtx = page.evaluate("(() => { const v = " + V + "; const h = v.graphics.find(g => g.attributes && g.attributes.kind === 'vertex' && g.attributes.i === 1); const p = v.toScreen(h.geometry); const r = v.container.getBoundingClientRect(); return [p.x + r.left, p.y + r.top, h.geometry.x, h.geometry.y]; })()")
        s = (vtx[0] + 16, vtx[1] + 10); e = (vtx[0] + 16, vtx[1] + 90)   # 19 px from the handle's centre: off it for a mouse (12 px), on it for a finger (24 px)
        swipe(s, e, 14, 45)
        page.wait_for_timeout(4000)
        moved = page.evaluate("(() => { const v = " + V + "; const h = v.graphics.find(g => g.attributes && g.attributes.kind === 'vertex' && g.attributes.i === 1); return [h.geometry.x, h.geometry.y]; })()")
        check(abs(moved[1] - vtx[3]) > 1000, "a finger near a handle (19 px off) drags it: the point moved %.0f km" % (abs(moved[1] - vtx[3]) / 1000))

        check(not errors, "no script errors: " + " | ".join(errors[:2]))
        browser.close()
    print(f"{checks[0] - len(failures)}/{checks[0]} checks passed")
    sys.exit(1 if failures else 0)

if __name__ == "__main__":
    main()
