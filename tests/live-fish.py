"""Checks the lab feature of Atlas 5.0.0-beta.51: fish in the sea of an elevation profile.

Run:  python3 tests/live-fish.py [--shots DIR] [--proxy URL]
Needs network access to js.arcgis.com, www.arcgis.com and Esri's elevation service, and Python Playwright with Chromium.
"""
import argparse, functools, glob, math, http.server, os, pathlib, sys, threading
from playwright.sync_api import sync_playwright
import csp_shim   # waits that work under the app's Content Security Policy; collects what it blocked

HERE = pathlib.Path(__file__).resolve().parent
APP = HERE.parent
V = "document.querySelector('arcgis-map').view"
FISH = """() => { const g = document.querySelector('#profChart .prof-fish'); if (!g) return null; const sea = +document.querySelector('#profChart .prof-sea').getAttribute('y1');
  const svg = document.querySelector('#profChart svg'), land = svg.querySelector('.prof-land');
  return { n: g.children.length, hidden: g.getAttribute('aria-hidden'), sea, behind: !!(g.compareDocumentPosition(land) & Node.DOCUMENT_POSITION_FOLLOWING),
    at: [...g.children].map((f) => { const m = /translate\\(([-\\d.]+) ([-\\d.]+)\\)/.exec(f.getAttribute('transform')); return [+m[1], +m[2]]; }) }; }"""

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
        def open_app(config, motion):
            page = browser.new_context(viewport={"width": 1366, "height": 768}, reduced_motion=motion).new_page(); page.on("dialog", lambda d: d.accept())
            page.goto(f"{base}/index.html" + (f"?config={config}" if config else ""))
            page.wait_for_function("(() => { try { return !!(" + V + ".ready); } catch (e) { return false; } })()", timeout=120000); page.wait_for_timeout(1500)
            page.evaluate("async () => { await " + V + ".goTo({ center: [-20, 39], zoom: 5 }, { animate: false }); }"); page.wait_for_timeout(1500)
            page.click("#tool-profile"); page.wait_for_selector("#profChart .prof-msg", timeout=60000)
            return page
        def scr(page, lonlat):
            x = lonlat[0] * math.pi / 180 * 6378137; y = math.log(math.tan(math.pi / 4 + lonlat[1] * math.pi / 360)) * 6378137
            return page.evaluate("([x, y]) => { const v = " + V + "; const p = v.toScreen({ type: 'point', x, y, spatialReference: { wkid: 102100 } }); const r = v.container.getBoundingClientRect(); return [p.x + r.left, p.y + r.top]; }", [x, y])
        def draw(page, a_, b_):
            p1, p2 = scr(page, a_), scr(page, b_)
            page.mouse.move(*p1); page.mouse.click(*p1); page.wait_for_timeout(700); page.mouse.move(*p2, steps=5); page.wait_for_timeout(300); page.mouse.dblclick(*p2)
            page.wait_for_selector("#profChart .prof-land", timeout=90000); page.mouse.move(5, 5); page.wait_for_timeout(600)

        print("== the main app has no fish")
        page = open_app("", "no-preference"); draw(page, [-26, 39], [-14, 39])   # across the open Atlantic
        check(page.evaluate(FISH) is None and page.is_hidden("#profFish"), "a profile across the sea has no fish and no Fish button")
        page.context.close()

        print("== lab")
        page = open_app("lab", "no-preference"); draw(page, [-26, 39], [-14, 39])
        f0 = page.evaluate(FISH)
        check(f0 and 3 <= f0["n"] <= 6 and f0["hidden"] == "true" and f0["behind"], "the chart has %s fish, hidden from screen readers and drawn behind the land" % (f0 and f0["n"]))
        check(page.is_visible("#profFish") and page.get_attribute("#profFish", "aria-pressed") == "true" and page.inner_text("#profFish") == "Fish", "a Fish button, pressed, is beside the units")
        page.wait_for_timeout(3000); f1 = page.evaluate(FISH)
        check(any(abs(a1[0] - b1[0]) > 2 for a1, b1 in zip(f0["at"], f1["at"])), "they swim: after 3 seconds they are somewhere else")
        check(all(y > f1["sea"] for _, y in f1["at"]), "all of them are below sea level")
        page.screenshot(path=str(shots / "fish.png"))
        box = page.evaluate("() => { const r = document.getElementById('profChart').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }")
        page.mouse.move(*box); page.wait_for_timeout(500); s0 = page.evaluate(FISH)["at"]; page.wait_for_timeout(2000); s1 = page.evaluate(FISH)["at"]
        check(s0 == s1 and page.is_visible("#profTip"), "while a place on the line is being read they keep still")
        page.mouse.move(5, 5); page.wait_for_timeout(300)
        page.click("#profFish"); page.wait_for_timeout(400)
        check(page.evaluate(FISH) is None and page.get_attribute("#profFish", "aria-pressed") == "false", "the Fish button takes them away")
        page.focus("#profFish"); page.keyboard.press("Enter"); page.wait_for_timeout(400)
        check(page.evaluate(FISH) is not None, "and brings them back (here by keyboard)")
        page.click("#profNew"); page.wait_for_selector("#profChart .prof-msg", timeout=30000)
        page.evaluate("async () => { await " + V + ".goTo({ center: [-4, 40], zoom: 7 }, { animate: false }); }"); page.wait_for_timeout(1500)
        draw(page, [-5, 40], [-3, 40])   # central Spain: all land
        check(page.evaluate(FISH) is None and page.is_hidden("#profFish"), "a profile over land has no fish and no Fish button")
        page.context.close()

        print("== a device set to reduce motion")
        page = open_app("lab", "reduce"); draw(page, [-26, 39], [-14, 39])
        check(page.evaluate(FISH) is None and page.is_visible("#profFish") and page.get_attribute("#profFish", "aria-pressed") == "false", "the fish start off; the button is there to turn them on")
        page.context.close(); browser.close()
    print(f"{checks[0] - len(failures)}/{checks[0]} checks passed")
    sys.exit(csp_shim.finish(failures))

if __name__ == "__main__":
    main()
