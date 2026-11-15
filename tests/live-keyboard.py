"""Checks the keyboard on the map, messages, and the layout at 400% zoom (Atlas 5.0.0-beta.57 and .58).

Run:  python3 tests/live-keyboard.py [--shots DIR] [--proxy URL]
Needs network access to js.arcgis.com, www.arcgis.com and Esri's elevation service, and Python Playwright with Chromium.
"""
import argparse, functools, glob, http.server, os, pathlib, sys, threading
from playwright.sync_api import sync_playwright
import csp_shim   # waits that work under the app's Content Security Policy; collects what it blocked

HERE = pathlib.Path(__file__).resolve().parent
APP = HERE.parent
QUAKES = "85997c9571e74256af71dc20566b47f1"
V = "document.querySelector('arcgis-map').view"
READY = "() => { const m = document.querySelector('arcgis-map'); return !!(m && m.view && m.view.ready); }"
ON_MAP = "(() => { let e = document.activeElement; while (e && e.shadowRoot && e.shadowRoot.activeElement) e = e.shadowRoot.activeElement; return !!(e && e.classList.contains('esri-view-surface')); })()"

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

        print("== the map by keyboard")
        page = browser.new_page(viewport={"width": 1180, "height": 760}); page.on("dialog", lambda d: d.accept())
        page.goto(f"{base}/index.html?webmap={QUAKES}"); page.wait_for_function("() => { const m = document.querySelector('arcgis-map'); return !!(m && m.view && m.view.ready && m.view.map && m.view.map.portalItem); }", timeout=120000); page.wait_for_timeout(7000)
        check(page.is_hidden("#mapRing") and page.is_hidden("#centreMark"), "with the keyboard elsewhere the map has no ring and no cross")
        page.evaluate("(() => " + V + ".container.querySelector('.esri-view-surface').focus())()"); page.wait_for_timeout(300)
        check(page.evaluate(ON_MAP) and page.is_hidden("#mapRing") and page.is_hidden("#centreMark"), "a script giving the map the focus shows no ring and no cross (1.1)")
        page.evaluate("document.activeElement && document.activeElement.blur()"); page.keyboard.press("Shift+Tab"); page.keyboard.press("Tab"); page.wait_for_timeout(200)
        n = 0
        for n in range(1, 60):
            page.keyboard.press("Tab"); page.wait_for_timeout(50)
            if page.evaluate(ON_MAP): break
        check(page.evaluate(ON_MAP) and page.is_visible("#mapRing") and page.is_visible("#centreMark"), "Tab reaches the map (%d presses): it shows a ring, and a cross at its centre" % n)
        box = page.evaluate("(() => { const r = " + V + ".container.getBoundingClientRect(); return [r.left + 80, r.top + r.height / 2]; })()")
        page.mouse.click(box[0], box[1]); page.wait_for_timeout(400)
        check(page.is_hidden("#mapRing") and page.is_hidden("#centreMark"), "a click on the map takes the ring and the cross away")
        for _ in range(1, 60):
            page.keyboard.press("Shift+Tab"); page.wait_for_timeout(50)
            if not page.evaluate(ON_MAP): break
        for _ in range(1, 60):
            page.keyboard.press("Tab"); page.wait_for_timeout(50)
            if page.evaluate(ON_MAP): break
        check(page.evaluate(ON_MAP) and page.is_visible("#centreMark"), "and Tab back to the map brings them back")
        label = page.evaluate("(() => " + V + ".container.querySelector('.esri-view-surface').getAttribute('aria-label'))()")
        check(label and "Enter opens" in label and "Arrow keys" in label, "a screen reader is told what the keys do: " + str(label))
        page.screenshot(path=str(shots / "keyboard-map.png"))
        page.evaluate("(async () => { const v = " + V + "; const l = v.map.allLayers.find((x) => x.type === 'feature' && x.visible && x.geometryType === 'point'); const lv = await v.whenLayerView(l); const r = await lv.queryFeatures({ where: '1=1', returnGeometry: true, num: 1 }); await v.goTo({ target: r.features[0].geometry, zoom: 8 }, { animate: false }); })()"); page.wait_for_timeout(3000)
        for _ in range(3):      # on a slow machine the features may not be drawn yet: Enter then finds nothing, and says so
            try: page.wait_for_function("() => !" + V + ".updating", timeout=60000)
            except Exception: pass
            page.wait_for_timeout(1500); page.keyboard.press("Enter")
            try: page.wait_for_function("() => { const p = " + V + ".popup; return !!(p && p.visible && p.selectedFeature); }", timeout=20000); break
            except Exception: page.wait_for_timeout(6000)
        pop = page.evaluate("(() => { const p = " + V + ".popup; return { visible: !!(p && p.visible), n: p && p.featureCount }; })()")
        check(pop["visible"] and (pop["n"] or 0) >= 1, "Enter opens the pop-up for what is at the centre of the map (%s feature(s))" % pop["n"])
        page.wait_for_timeout(300)
        check("pop-up has opened" in page.inner_text("#toast"), "and says so: " + page.inner_text("#toast"))
        page.keyboard.press("Escape"); page.wait_for_timeout(1200)
        check(not page.evaluate("!!(" + V + ".popup && " + V + ".popup.visible)") and page.evaluate(ON_MAP), "Escape closes it and the keyboard is back on the map: " + str(page.evaluate("(() => { let e = document.activeElement; const pth = []; while (e) { pth.push(e.tagName + '.' + String(e.className).split(' ')[0]); e = e.shadowRoot && e.shadowRoot.activeElement; } return [!!(" + V + ".popup && " + V + ".popup.visible), pth.join('>')]; })()")))
        page.evaluate("(async () => { await " + V + ".goTo({ center: [-140, -50], zoom: 9 }, { animate: false }); })()"); page.wait_for_timeout(3500); page.keyboard.press("Enter")
        try: page.wait_for_function("document.getElementById('toast').textContent.includes('Nothing to open')", timeout=15000)
        except Exception: pass
        check("Nothing to open" in page.inner_text("#toast"), "where there is nothing at the centre it says so: " + page.inner_text("#toast"))

        print("== messages that wait, the page's name, state shown by more than colour")
        title = page.title(); h1 = page.inner_text("#pageH1")
        check(title.endswith(" · AtlasLab") and len(title) > 14 and h1.startswith("AtlasLab: "), "the browser tab and the page's main heading name the open map: " + title)
        check("Nothing to open" in page.inner_text("#toast") and page.is_visible("#toastClose"), "a message has a Close button")
        box = page.evaluate("(() => { const r = document.getElementById('toast').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()")
        page.mouse.move(*box); page.wait_for_timeout(7000)
        check("Nothing to open" in page.inner_text("#toast"), "with the pointer on it, a 5 second message is still there after 7")
        page.mouse.move(5, 300); page.wait_for_timeout(3500)
        check(page.inner_text("#toast") == "", "and goes a little after the pointer leaves")
        page.evaluate(V + ".focus()"); page.keyboard.press("Enter"); page.wait_for_function("document.getElementById('toast').textContent.includes('Nothing to open')", timeout=15000)
        page.click("#toastClose"); page.wait_for_timeout(200)
        check(page.inner_text("#toast") == "" and page.is_hidden("#toastWrap"), "Close takes a message away at once")
        page.click("#verBtn"); page.wait_for_selector("#aboutPanel:not([hidden])", timeout=20000); page.wait_for_timeout(500)
        rec = page.evaluate("[...document.querySelectorAll('#recentMsgs li')].map((l) => l.textContent)")
        check(len(rec) >= 2 and "Nothing to open" in rec[0], "the Versions panel lists recent messages, newest first (%d)" % len(rec))
        page.check("#keepMsgs"); page.keyboard.press("Escape"); page.wait_for_timeout(400)
        page.evaluate(V + ".focus()"); page.keyboard.press("Enter"); page.wait_for_function("document.getElementById('toast').textContent.includes('Nothing to open')", timeout=15000); page.mouse.move(5, 300); page.wait_for_timeout(8000)
        check("Nothing to open" in page.inner_text("#toast"), "with Keep messages on, a message stays until it is closed")
        page.click("#toastClose"); page.click("#verBtn"); page.wait_for_selector("#aboutPanel:not([hidden])", timeout=20000); page.uncheck("#keepMsgs"); page.keyboard.press("Escape"); page.wait_for_timeout(400)
        page.click("#tool-legend"); page.wait_for_selector("#legendPanel:not([hidden])", timeout=20000)
        st = page.evaluate("(() => { const a = getComputedStyle(document.getElementById('tool-legend')), l = getComputedStyle(document.querySelector('#tool-legend .tl')), b = getComputedStyle(document.getElementById('tool-save')), on = getComputedStyle(document.getElementById('tg2d')), off = getComputedStyle(document.getElementById('tg3d')); return { bar: a.boxShadow !== 'none' && b.boxShadow === 'none', bold: l.fontWeight, seg: on.boxShadow !== 'none' && off.boxShadow === 'none' && on.fontWeight === '700' && off.fontWeight !== '700' }; })()")
        check(st["bar"] and st["bold"] == "700" and st["seg"], "the open tool has a bar and bolder words, and so has whichever of 2D and 3D is on, as well as the colour")
        page.keyboard.press("Escape"); page.wait_for_timeout(400)

        print("== an elevation profile without a mouse")
        page.evaluate("document.getElementById('tool-profile').click()"); page.wait_for_selector("#profChart .prof-msg", timeout=60000)
        check("With the keyboard" in page.inner_text("#profChart") and page.is_visible("#profCentre"), "the hint says how, and there is an Add point at map centre button")
        page.evaluate("(async () => { await " + V + ".goTo({ center: [-90, 38], zoom: 6 }, { animate: false }); " + V + ".focus(); })()"); page.wait_for_timeout(2500)
        page.keyboard.press("Space"); page.wait_for_timeout(500)
        check(page.inner_text("#profStatus").startswith("Point 1 added") and page.is_visible("#profUndo"), "Space on the map puts the first point at its centre: " + page.inner_text("#profStatus")[:40])
        page.keyboard.press("Space"); page.wait_for_timeout(400)
        check("already on the line" in page.inner_text("#profStatus"), "pressed again without moving the map, it says to move the map first")
        for _ in range(6): page.keyboard.press("ArrowRight"); page.wait_for_timeout(350)
        page.wait_for_timeout(1500); page.focus("#profCentre")
        check(page.is_visible("#centreMark"), "the cross shows while the Add point button has the focus")
        page.keyboard.press("Enter"); page.wait_for_timeout(600)
        check(page.inner_text("#profStatus").startswith("Point 2 added") and page.is_visible("#profFinish"), "the button adds the second point; Finish line is offered")
        page.focus("#profFinish"); page.keyboard.press("Enter")
        try: page.wait_for_selector("#profChart .prof-land", timeout=90000); charted = True
        except Exception: charted = False
        check(charted and page.is_hidden("#profCentre"), "Finish line charts the line, all without a mouse")
        page.close()

        print("== a 1280 x 1024 screen at 400% (320 x 256)")
        page = browser.new_page(viewport={"width": 320, "height": 256}); page.on("dialog", lambda d: d.accept())
        page.goto(f"{base}/index.html"); page.wait_for_function(READY, timeout=120000); page.wait_for_timeout(4000)
        m = page.evaluate("(() => { const r = document.getElementById('mapWrap').getBoundingClientRect(), tb = document.getElementById('toolbar'), d = document.documentElement; return { map: Math.round(r.height), sx: d.scrollWidth > innerWidth + 1, sy: d.scrollHeight > innerHeight + 1, more: tb.classList.contains('more-right'), rose: [...document.querySelectorAll('.rose')].some((x) => x.offsetParent) }; })()")
        check(m["map"] >= 210 and not m["sx"] and not m["sy"], "the map has %d of the 256 pixels; the page does not scroll" % m["map"])
        check(m["more"] and not m["rose"], "the toolbar's edge fades where more tools are off to the right; the compass is left out")
        page.evaluate("document.getElementById('tool-save').focus()"); page.wait_for_timeout(500)
        check(page.evaluate("(() => { const r = document.getElementById('tool-save').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1; })()"), "a tool that was off the edge is brought into view when the keyboard reaches it")
        page.keyboard.press("Enter"); page.wait_for_selector("#savePanel:not([hidden])", timeout=20000); page.wait_for_timeout(500)
        s = page.evaluate("(() => { const p = document.getElementById('savePanel').getBoundingClientRect(), b = document.querySelector('#savePanel .panel-body'); return { w: Math.round(p.width), h: Math.round(p.height), scrolls: b.scrollHeight > b.clientHeight, sideways: b.scrollWidth > b.clientWidth + 1 }; })()")
        check(s["w"] == 320 and s["h"] == 256 and s["scrolls"] and not s["sideways"], "a panel takes the whole screen and scrolls up and down only")
        page.screenshot(path=str(shots / "keyboard-400-save.png"))
        page.keyboard.press("Escape"); page.wait_for_timeout(500)
        page.evaluate("document.getElementById('tool-open').click()"); page.wait_for_selector("#omList .cat-card", timeout=90000); page.wait_for_timeout(1500)
        o = page.evaluate("(() => { const c = document.querySelector('#openModal .open-card'); const card = document.querySelector('#omList .cat-card'); c.scrollTop = card.offsetTop; const r = card.getBoundingClientRect(); return { scrolls: c.scrollHeight > c.clientHeight + 50, sideways: c.scrollWidth > c.clientWidth + 1, cardTop: Math.round(r.top), cardW: Math.round(r.width) }; })()")
        check(o["scrolls"] and not o["sideways"] and o["cardTop"] < 200 and o["cardW"] <= 320, "Open map scrolls as one piece down to its maps, up and down only: " + str(o))
        page.screenshot(path=str(shots / "keyboard-400-open.png"))
        page.close(); browser.close()
    print(f"{checks[0] - len(failures)}/{checks[0]} checks passed")
    sys.exit(csp_shim.finish(failures))

if __name__ == "__main__":
    main()
