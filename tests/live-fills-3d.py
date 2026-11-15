"""Sketched areas with a styled fill, in 3D (2D to 3D 1.2), in Chromium against the real services.

Run:  python3 tests/live-fills-3d.py [--shots DIR] [--proxy URL]

Checks: an area drawn with a pencil fill gets, in 3D, a helper drawing of the view's own (a thicker outline and a
light tint); nothing is added to the sketch or the map; it goes when the area is deleted and on going back to 2D. In
the lab config the fill is also laid on the ground as a picture (a media layer the list doesn't show), and then the
helper has no tint; the layer list and its count don't change, and the picture goes on going back to 2D.
"""
import argparse, functools, glob, http.server, json, os, pathlib, re, sys, threading
from playwright.sync_api import sync_playwright
import csp_shim   # waits that work under the app's Content Security Policy; collects what it blocked

HERE = pathlib.Path(__file__).resolve().parent
APP = HERE.parent

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--shots", default=str(HERE / ".shots")); ap.add_argument("--proxy", default=os.environ.get("HTTPS_PROXY", "")); ap.add_argument("--axe", default=os.environ.get("ATLAS_AXE", ""))
    a = ap.parse_args()
    shots = pathlib.Path(a.shots); shots.mkdir(parents=True, exist_ok=True)
    srv = http.server.ThreadingHTTPServer(("localhost", 0), functools.partial(Quiet, directory=csp_shim.served(APP)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://localhost:{srv.server_port}"
    found = sorted(glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome"))
    chrome = os.environ.get("CHROME") or (found[-1] if found else None)
    failures, checks = [], [0]
    def check(cond, msg):
        checks[0] += 1
        print(("  ok   " if cond else "  FAIL ") + msg)
        if not cond: failures.append(msg)

    with sync_playwright() as p:
        launch = {"args": ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]}
        if chrome: launch["executable_path"] = chrome
        if a.proxy: launch["proxy"] = {"server": a.proxy, "bypass": "localhost,127.0.0.1"}
        browser = csp_shim.launch(p, launch)
        ctx = browser.new_context(viewport={"width": 1366, "height": 768}, accept_downloads=True)
        ctx.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker;")   # saves become downloads the test can read
        page = ctx.new_page(); errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("dialog", lambda d: d.accept())

        SK = "document.querySelector('arcgis-sketch')"
        SV = "document.querySelector('arcgis-scene').view"
        HELP = "(() => { const v = " + SV + "; return v.graphics.filter(g => g.symbol && g.symbol.type === 'simple-fill').map(g => [g.symbol.outline.width, g.symbol.color.a]).toArray(); })()"
        MEDIA = "(() => { const l = " + SV + ".map.layers.find(x => x.id === '__fills3d'); return l ? [l.type, l.listMode, l.source.elements.length] : null; })()"
        def run(config, lab):
            print("== " + config)
            page.goto(f"{base}/index.html?config={config}")
            page.wait_for_function("document.querySelector('arcgis-map') && document.querySelector('arcgis-map').view && document.querySelector('arcgis-map').view.ready", timeout=120000)
            page.click("#tool-sketch"); page.wait_for_function(SK + ".state === 'ready' && !!" + SK + ".view", timeout=120000); page.wait_for_timeout(2500)
            page.evaluate("async () => { await " + SK + ".create('rectangle'); }"); page.wait_for_timeout(900)
            page.click("#skSymbolOpen"); page.wait_for_selector("#skSymbols:not([hidden])")
            page.select_option("#symbolSet", "pencil"); page.wait_for_function("document.querySelector('#symbolStatus').textContent === '' && document.querySelectorAll('#symbolGrid .sym-btn').length > 3", timeout=60000)
            check("tint" in page.inner_text("#symbolNote"), "the symbol list says how a styled fill looks in 3D: " + page.inner_text("#symbolNote"))
            page.click('#symbolGrid .sym-btn[aria-label="Mountains"]'); page.click("#skSymbolsDone"); page.wait_for_timeout(2500)
            page.mouse.move(420, 200); page.mouse.down(); page.mouse.move(600, 320, steps=5); page.mouse.move(700, 400, steps=3); page.mouse.up()
            page.wait_for_function("(() => { const v = document.querySelector('arcgis-map').view; return v.map.layers.find(x => x.id === '__sketch').graphics.some(g => g.symbol && g.symbol.type === 'cim' && g.geometry.type === 'polygon'); })()", timeout=30000)
            page.evaluate("(() => { try { " + SK + ".complete(); } catch (e) {} })()"); page.click("#tool-sketch"); page.wait_for_timeout(1000)
            badge = page.inner_text("#layersBadge")
            page.click("#tg3d"); page.wait_for_function("document.querySelector('arcgis-scene') && document.querySelector('arcgis-scene').view && document.querySelector('arcgis-scene').view.ready", timeout=120000)
            page.wait_for_function(HELP + ".length === 1", timeout=60000); page.wait_for_timeout(1500 if not lab else 6000)
            h = page.evaluate(HELP)[0]
            check(h[0] == 2.5, "in 3D the area has a thicker outline of the view's own: %s" % h[0])
            sk = page.evaluate("(() => { const l = " + SV + ".map.layers.find(x => x.id === '__sketch'); return [l.graphics.length, l.graphics.getItemAt(0).symbol.type]; })()")
            check(sk == [1, "cim"], "the sketch itself is untouched: " + str(sk))
            if lab:
                page.wait_for_function(MEDIA + " !== null", timeout=60000); page.wait_for_timeout(2500)
                m = page.evaluate(MEDIA); h = page.evaluate(HELP)[0]
                check(m == ["media", "hide", 1], "lab: the fill is laid on the ground as a picture, in a layer the list doesn't show: " + str(m))
                check(h[1] == 0, "and then the helper has no tint: %s" % h[1])
                check(page.inner_text("#layersBadge") == badge, "the layer count doesn't change: " + page.inner_text("#layersBadge"))
            else:
                check(abs(h[1] - 0.16) < 0.01, "and a light tint: %s" % h[1])
                check(page.evaluate(MEDIA) is None, "the main app lays no picture")
            page.wait_for_timeout(6000); page.screenshot(path=str(shots / ("fills-3d-" + config + ".png")))
            page.click("#tg2d"); page.wait_for_function("document.querySelector('arcgis-map').view.ready && !document.querySelector('arcgis-map').closest('[hidden]')", timeout=60000); page.wait_for_timeout(2500)
            check(page.evaluate(HELP + ".length") == 0 and page.evaluate(MEDIA) is None, "back in 2D the helper%s gone" % (" and the picture are" if lab else " is"))
            two = page.evaluate("(() => { const l = document.querySelector('arcgis-map').view.map.layers.find(x => x.id === '__sketch'); return [l.graphics.length, l.graphics.getItemAt(0).symbol.type]; })()")
            check(two == [1, "cim"], "and the area has its pencil fill in 2D: " + str(two))
            page.click("#tg3d"); page.wait_for_function(HELP + ".length === 1", timeout=60000)
            page.evaluate(SV + ".map.layers.find(x => x.id === '__sketch').graphics.removeAll()")
            page.wait_for_function(HELP + ".length === 0" + (" && " + MEDIA + " === null" if lab else ""), timeout=30000)
            check(True, "deleting the area in 3D takes its helper%s away" % (" and picture" if lab else ""))
        run("mapmaker", False)
        run("lab", True)
        check(not errors, "no uncaught errors: " + " | ".join(errors[:3]))
        browser.close()
    print(f"{checks[0] - len(failures)}/{checks[0]} checks passed")
    sys.exit(csp_shim.finish(failures))

if __name__ == "__main__":
    main()
