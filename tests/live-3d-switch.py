"""Checks what happens to a web map when 3D is pressed (Atlas 5.0.0-beta.54, 2D to 3D 1.0).

Run:  python3 tests/live-3d-switch.py [--shots DIR] [--proxy URL]
Needs network access to js.arcgis.com and www.arcgis.com, and Python Playwright with Chromium. Uses two maps of the
collection as they are: the Okavango Wilderness Project (a region, with layers 3D draws differently) and the Expansion
of Islam (street scale at Mecca, with a map note).
"""
import argparse, functools, glob, http.server, math, os, pathlib, sys, threading
from playwright.sync_api import sync_playwright
import csp_shim   # waits that work under the app's Content Security Policy; collects what it blocked

HERE = pathlib.Path(__file__).resolve().parent
APP = HERE.parent
QUAKES = "95188602f74c4197a39c8f7205589c8c"   # MapMaker's Real-Time Earthquakes, a world map
OKAVANGO, ISLAM = "ff18c77b178f4c9e9241a0039c12a6ec", "2008733e277c4335a0393df9c2b6fbb6"
MV, SV = "document.querySelector('arcgis-map').view", "document.querySelector('arcgis-scene').view"
READY = "() => { const m = document.querySelector('arcgis-map'); return !!(m && m.view && m.view.ready && m.view.map && m.view.map.portalItem); }"
IN3D = "() => { const s = document.querySelector('arcgis-scene'); return !!(s && s.view && s.view.ready) && document.getElementById('tg3d').getAttribute('aria-pressed') === 'true'; }"
AT = "(v) => ({ lon: v.center.longitude, lat: v.center.latitude, scale: v.scale })"
NOTES = "(() => " + SV + ".graphics.filter((g) => g.geometry && g.geometry.type === 'point').map((g) => ({ lon: g.geometry.longitude, lat: g.geometry.latitude, visible: g.visible })).toArray())()"

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
        def open_map(mid):
            page = browser.new_page(viewport={"width": 1280, "height": 760}); page.on("dialog", lambda d: d.accept())
            page.add_init_script("window.__toasts = []; document.addEventListener('DOMContentLoaded', () => { const t = document.getElementById('toast'); if (t) new MutationObserver(() => { if (t.textContent) window.__toasts.push(t.textContent); }).observe(t, { childList: true, characterData: true, subtree: true }); });")
            page.goto(f"{base}/index.html?webmap={mid}"); page.wait_for_function(READY, timeout=120000); page.wait_for_timeout(5000)
            return page, page.evaluate("(" + AT + ")(" + MV + ")")
        def to3d(page):
            page.click("#tg3d"); page.wait_for_function(IN3D, timeout=120000); page.wait_for_timeout(4000)

        print("== a region: the Okavango Wilderness Project")
        page, m2 = open_map(OKAVANGO); to3d(page)
        try: page.wait_for_function("() => " + SV + ".camera.tilt > 28 && !" + SV + ".animation", timeout=60000)
        except Exception: pass
        s = page.evaluate("(() => { const v = " + SV + "; return { lon: v.center.longitude, lat: v.center.latitude, scale: v.viewpoint.scale, tilt: v.camera.tilt, haze: v.environment.atmosphereEnabled }; })()")
        want = m2["scale"] * math.cos(math.radians(m2["lat"]))
        check(28 < s["tilt"] < 32, "looking at a region (1:%s) the 3D view tilts 30°, enough to show it is 3D with the place still in the middle: tilt %.1f°" % (format(round(m2["scale"]), ","), s["tilt"]))
        check(abs(s["lon"] - m2["lon"]) < 0.2 and abs(s["lat"] - m2["lat"]) < 0.2, "at the same place")
        check(abs(s["scale"] / want - 1) < 0.03, "its scale is the 2D map's corrected for latitude, so the place is the same size: 1:%s, wanted 1:%s" % (format(round(s["scale"]), ","), format(round(want), ",")))
        check(s["haze"] is False, "from this far out the map is drawn without haze")
        toasts = page.evaluate("window.__toasts")
        check(any("look different in 3D" in x or "looks different in 3D" in x for x in toasts), "a note says layers look different in 3D: " + "; ".join(x for x in toasts if "3D" in x))
        page.click("#tool-layers"); page.wait_for_selector("#layersPanel:not([hidden]) .lyr", timeout=30000); page.wait_for_timeout(600)
        notes = page.evaluate("[...document.querySelectorAll('#layersPanel .lyr-3d')].map((n) => n.closest('.lyr').querySelector('.li-title').textContent + ': ' + n.textContent)")
        check(len(notes) >= 2 and any("drawn more simply" in n for n in notes) and any("not grouped" in n or "effects" in n for n in notes), "Map layers says how, layer by layer (%d layers), such as: %s" % (len(notes), notes[0] if notes else ""))
        page.screenshot(path=str(shots / "3d-switch-region.png"))
        page.click("#tg2d"); page.wait_for_function("() => document.getElementById('tg2d').getAttribute('aria-pressed') === 'true'", timeout=60000); page.wait_for_timeout(2500)
        b = page.evaluate("(" + AT + ")(" + MV + ")")
        check(abs(b["scale"] / m2["scale"] - 1) < 0.03 and abs(b["lat"] - m2["lat"]) < 0.2, "back in 2D the map is at the scale it started at: 1:%s" % format(round(b["scale"]), ","))
        check(page.evaluate("document.querySelectorAll('#layersPanel .lyr-3d').length") == 0, "and Map layers no longer says anything about 3D")
        page.close()

        print("== a map opened after 3D has been used (5.0.0-beta.69)")
        page = browser.new_page(viewport={"width": 1280, "height": 760}); page.on("dialog", lambda d: d.accept())
        page.goto(f"{base}/index.html"); page.wait_for_function("() => { const m = document.querySelector('arcgis-map'); return !!(m && m.view && m.view.ready); }", timeout=120000); page.wait_for_timeout(3000)
        page.evaluate("document.querySelector('#tool-measure').click()"); page.wait_for_timeout(500)
        if page.is_hidden("#measurePanel"): page.evaluate("document.querySelector('#menuMeasure').click()")
        page.wait_for_selector("#measurePanel:not([hidden])"); page.click("#mDist"); page.wait_for_timeout(1500)
        to3d(page); page.click("#tg2d"); page.wait_for_function("() => document.getElementById('tg2d').getAttribute('aria-pressed') === 'true'", timeout=60000); page.wait_for_timeout(2500)
        # the way a student opens it: Open map, search, Open map on its card
        page.click("#tool-open"); page.wait_for_selector("#omList .cat-card", timeout=120000); page.wait_for_timeout(1500)
        page.fill("#omSearch", "Real-Time Earthquakes"); page.wait_for_timeout(1500)
        opened = page.evaluate("(() => { const c = [...document.querySelectorAll('#omList .cat-card')].find((x) => x.querySelector('.cat-title, h3, h4') ? /^Real-Time Earthquakes$/.test(x.querySelector('.cat-title, h3, h4').textContent.trim()) : /^Real-Time Earthquakes(?! with)/.test(x.textContent.trim())); if (!c) return false; [...c.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Open map').click(); return true; })()")
        try: page.wait_for_function("() => { const m = document.querySelector('arcgis-map').view.map; return !!(m.portalItem && m.portalItem.id === '" + QUAKES + "'); }", timeout=120000)
        except Exception: opened = False
        page.wait_for_timeout(6000)
        check(opened and page.is_hidden("#measurePanel") and "active" not in (page.get_attribute("#tool-measure", "class") or ""), "opening a map ends Measure: the panel closes")
        m2 = page.evaluate("(" + AT + ")(" + MV + ")")
        to3d(page); page.wait_for_timeout(3000)
        s = page.evaluate("(() => { const v = " + SV + "; return { lon: v.center.longitude, lat: v.center.latitude, scale: v.viewpoint.scale, z: v.camera.position.z }; })()")
        want = m2["scale"] * math.cos(math.radians(m2["lat"]))
        check(abs(s["scale"] / want - 1) < 0.1 and abs(s["lon"] - m2["lon"]) < 1, "then 3D shows the same place at the same size, not a thousand times closer: 1:%s (camera %s km up), wanted 1:%s" % (format(round(s["scale"]), ","), format(round(s["z"] / 1000), ","), format(round(want), ",")))
        page.screenshot(path=str(shots / "3d-switch-after-open.png"))
        page.close()

        print("== street scale, with a map note: the Expansion of Islam, at Mecca")
        page, m2 = open_map(ISLAM); to3d(page)
        try: page.wait_for_function("() => " + SV + ".camera.tilt > 40 && !" + SV + ".animation", timeout=60000)
        except Exception: pass
        s = page.evaluate("(() => { const v = " + SV + "; return { scale: v.scale, tilt: v.camera.tilt, haze: v.environment.atmosphereEnabled, lat: v.center.latitude, lon: v.center.longitude }; })()")
        check(43 < s["tilt"] < 47 and abs(s["lat"] - m2["lat"]) < 0.01 and abs(s["lon"] - m2["lon"]) < 0.01, "at street scale the 3D view tilts 45° about the same place: tilt %.0f°" % s["tilt"])
        check(s["haze"] is True, "close in, the haze is kept")
        n = page.evaluate(NOTES)
        check(len(n) == 1 and n[0]["visible"] and abs(n[0]["lat"] - 21.42) < 0.05 and abs(n[0]["lon"] - 39.83) < 0.05, "the map note at Mecca, which the 3D view cannot show as a layer, is drawn on the view: %s" % n)
        page.evaluate("(() => { " + SV + ".map.allLayers.find((l) => l.type === 'map-notes').visible = false; })()"); page.wait_for_timeout(600)
        off = page.evaluate(NOTES)
        page.evaluate("(() => { " + SV + ".map.allLayers.find((l) => l.type === 'map-notes').visible = true; })()"); page.wait_for_timeout(600)
        check(len(off) == 1 and not off[0]["visible"] and page.evaluate(NOTES)[0]["visible"], "it goes and comes back with its layer's switch")
        count = page.evaluate("(() => " + SV + ".map.allLayers.length)()")
        page.wait_for_timeout(6000); page.screenshot(path=str(shots / "3d-switch-note.png"))
        page.click("#tg2d"); page.wait_for_function("() => document.getElementById('tg2d').getAttribute('aria-pressed') === 'true'", timeout=60000); page.wait_for_timeout(1500)
        check(page.evaluate("(() => " + SV + ".graphics.length)()") == 0 and page.evaluate("(() => " + MV + ".map.allLayers.length)()") == count, "back in 2D the copy is taken away; the map has the layers it had")
        page.close(); browser.close()
    print(f"{checks[0] - len(failures)}/{checks[0]} checks passed")
    sys.exit(csp_shim.finish(failures))

if __name__ == "__main__":
    main()
