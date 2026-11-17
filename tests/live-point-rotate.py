"""Rotation for a point's symbol (lab: features.pointRotation, Sketch 2.3, 5.0.0-beta.74), in Chromium against the real
services.

Run:  python3 tests/live-point-rotate.py [--shots DIR] [--proxy URL] [--axe FILE]
Needs network access to js.arcgis.com, cdn.arcgis.com and www.arcgis.com, and Python Playwright with Chromium.

Checks: in the lab, a point with an arrow (any symbol but the plain circle) has a Rotation slider under Size; an arrow
drawn turns clockwise as far as the slider says, as a text does; the slider turns the arrow selected, and only that
one; a text's rotation is its own; the turn is saved, in the symbol Map Viewer reads, and comes back; in the main
config (no slider) a turned arrow from a file still shows turned; a turned arrow keeps its direction on the map when
the map turns; the arrow stays turned in the 3D view.
"""
import argparse, functools, glob, http.server, json, os, pathlib, sys, threading
from playwright.sync_api import sync_playwright
import csp_shim   # waits that work under the app's Content Security Policy; collects what it blocked

HERE = pathlib.Path(__file__).resolve().parent
APP = HERE.parent
SK = "document.querySelector('arcgis-sketch')"
SHOWN = "(() => [...document.querySelectorAll('#sketchPanel .section, #sketchHint, #skKind')].filter(e => !e.hidden && e.getClientRects().length).map(e => e.id))()"
# where a sketch is on the page, to click it
AT = """(rot) => { const m = document.querySelector('arcgis-map'), v = m.view, l = v.map.layers.find(x => x.id === '__sketch');
  const g = l.graphics.find(x => x.attributes.rotation === rot), p = v.toScreen(g.geometry), r = m.getBoundingClientRect(); return [r.left + p.x, r.top + p.y]; }"""
# each sketch: its kind, symbol, the rotation it keeps and the turn its symbol has (clockwise, from the SDK's own reading)
SKETCHES = """(async () => { const u = await $arcgis.import('@arcgis/core/symbols/support/cimSymbolUtils.js');
  const v = document.querySelector('arcgis-map').view, l = v.map.layers.find(x => x.id === '__sketch');
  return l.graphics.toArray().map(g => ({ kind: g.attributes.kind, shape: g.attributes.shape, rotation: g.attributes.rotation, sym: g.symbol && g.symbol.type,
    turn: g.symbol && g.symbol.type === 'cim' ? Math.round(((u.getCIMSymbolRotation(g.symbol, true) % 360) + 360) % 360) : null })); })()"""
AXE = "axe.run('#sketchPanel', { runOnly: ['wcag2a','wcag2aa','wcag21a','wcag21aa'] }).then(r => r.violations.map(v => v.id + ': ' + v.nodes.map(n => n.target.join(' ')).slice(0,3).join(', ')))"
READY = "document.querySelector('arcgis-map') && document.querySelector('arcgis-map').view && document.querySelector('arcgis-map').view.ready"

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
        checks[0] += 1; print(("  ok   " if cond else "  FAIL ") + msg, flush=True)
        if not cond: failures.append(msg)
    with sync_playwright() as p:
        launch = {"args": ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]}
        if chrome: launch["executable_path"] = chrome
        if a.proxy: launch["proxy"] = {"server": a.proxy, "bypass": "localhost,127.0.0.1"}
        browser = csp_shim.launch(p, launch)
        ctx = browser.new_context(viewport={"width": 1366, "height": 768})
        ctx.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker;")
        page = ctx.new_page(); errors = []
        page.on("pageerror", lambda e: errors.append(str(e)[:300]))
        page.on("dialog", lambda d: d.accept())
        def axe(what):
            if not a.axe: return
            if not page.evaluate("typeof axe !== 'undefined'"): csp_shim.add_axe(page, a.axe)
            v = page.evaluate(AXE); check(not v, what + ": no WCAG 2.1 A/AA violations (axe-core): " + "; ".join(v))
        def start(tool):
            page.evaluate("async (t) => { try { await " + SK + ".create(t); } catch (e) {} }", tool); page.wait_for_timeout(900)
        def sketches(): return page.evaluate(SKETCHES)
        def wait_sketches(cond, timeout=30000):   # cond: a test of s, the list SKETCHES gives (read in a loop: it needs an await)
            for _ in range(timeout // 500):
                if page.evaluate("async () => { const s = await " + SKETCHES + "; return !!(" + cond + "); }"): return True
                page.wait_for_timeout(500)
            return False
        def set_rot(v):
            page.evaluate("v => { const r = document.querySelector('#fRot'); r.value = v; r.dispatchEvent(new Event('input', { bubbles: true })); }", v); page.wait_for_timeout(600)
        def open_sketch():
            page.click("#tool-sketch"); page.wait_for_function(SK + ".state === 'ready' && !!" + SK + ".view", timeout=120000); page.wait_for_timeout(2000)
        def save_map(name):
            if not page.is_visible("#savePanel"): page.click("#tool-save")
            page.click("#saveTile"); page.wait_for_selector("#nameModal:not([hidden])"); page.fill("#fileNameInput", name)
            with page.expect_download() as dl: page.click("#nameConfirm")
            return json.loads(pathlib.Path(dl.value.path()).read_text())
        def drop(name, text):
            page.evaluate("""([name, text]) => { const dt = new DataTransfer(); dt.items.add(new File([text], name, { type: 'application/json' })); window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); }""", [name, text])

        print("== the lab: a Rotation slider for an arrow")
        page.goto(f"{base}/index.html?config=lab"); page.wait_for_function(READY, timeout=120000)
        # a quiet stretch of ocean to draw on, so the arrows show clearly in the pictures
        page.evaluate("document.querySelector('arcgis-map').view.goTo({ center: [-35, 30], zoom: 4 }, { animate: false })"); page.wait_for_timeout(3000)
        open_sketch(); start("point"); page.wait_for_function("!document.querySelector('#secSymbol').hidden", timeout=10000)
        check("rotSection" not in page.evaluate(SHOWN), "the plain circle has no Rotation slider (it looks the same however it is turned): " + ", ".join(page.evaluate(SHOWN)))
        page.click("#skSymbolOpen"); page.wait_for_selector("#skSymbols:not([hidden])")
        page.select_option("#symbolSet", "arrows"); page.wait_for_function("document.querySelector('#symbolStatus').textContent === '' && document.querySelectorAll('#symbolGrid .sym-btn').length > 5", timeout=60000)
        names = page.evaluate("[...document.querySelectorAll('#symbolGrid .sym-btn')].map(b => b.getAttribute('aria-label'))")
        pick = "Arrow 15" if "Arrow 15" in names else names[0]
        page.click('#symbolGrid .sym-btn[aria-label="%s"]' % pick); page.click("#skSymbolsDone"); page.wait_for_selector("#skMain:not([hidden])")
        shown = page.evaluate(SHOWN)
        check("rotSection" in shown and shown.index("rotSection") == shown.index("secSize") + 1, "with %s chosen, Rotation shows, straight after Size: %s" % (pick, ", ".join(shown)))
        check(page.inner_text("#rotSection label") == "Rotation" and page.inner_text("#rotVal") == "0°" and page.get_attribute("#fRot", "aria-valuetext") == "0°", "it is labelled Rotation and starts at 0°")
        axe("Sketch panel, an arrow with its Rotation slider")
        set_rot(90)
        check(page.inner_text("#rotVal") == "90°" and page.get_attribute("#fRot", "aria-valuetext") == "90°", "the slider says 90°, to screen readers too")
        page.wait_for_timeout(2500)   # the symbol is fetched once
        page.mouse.click(520, 330)
        ok = wait_sketches("s.length === 1 && s[0].sym === 'cim'")
        sk = sketches()
        check(ok and sk[0]["rotation"] == 90 and sk[0]["turn"] == 90, "an arrow drawn now keeps 90 and its symbol is turned 90° clockwise: " + json.dumps(sk))
        page.screenshot(path=str(shots / "point-rotate-90.png"), clip={"x": 420, "y": 230, "width": 200, "height": 200})
        page.wait_for_function("!document.querySelector('#secFeature').hidden", timeout=10000)
        check(page.inner_text("#rotVal") == "90°" and "rotSection" in page.evaluate(SHOWN), "selected, the arrow shows its own 90°")

        print("== the slider turns the arrow selected, and only that one")
        start("point")
        try: page.wait_for_function("document.querySelector('#secFeature').hidden", timeout=5000); ended = True
        except Exception: ended = False
        check(ended, "picking the point tool again ends the selection, so the slider is for the next arrow")
        set_rot(0); page.wait_for_timeout(500)
        page.mouse.click(720, 330); ok = wait_sketches("s.length === 2 && s.every(x => x.sym === 'cim')")
        sk = sketches()
        check(ok and sk[1]["rotation"] == 0 and sk[1]["turn"] == 0 and sk[0]["turn"] == 90, "a second arrow drawn at 0° is upright; the first is still at 90°: " + json.dumps(sk))
        page.screenshot(path=str(shots / "point-rotate-two.png"), clip={"x": 420, "y": 230, "width": 400, "height": 200})
        page.evaluate("(() => { try { " + SK + ".cancel(); } catch (e) {} })()"); page.wait_for_timeout(800)
        page.mouse.click(*page.evaluate(AT, 90))
        page.wait_for_function("document.querySelector('#rotVal').textContent === '90°' && !document.querySelector('#secFeature').hidden", timeout=10000)
        check(True, "clicking the first arrow selects it, and the slider shows its 90°")
        set_rot(180); ok = wait_sketches("s.some(x => x.turn === 180) && s.some(x => x.turn === 0)")
        sk = sketches()
        check(ok and sorted((x["rotation"], x["turn"]) for x in sk) == [(0, 0), (180, 180)], "with the first selected, the slider turns it to 180°, and the other stays at 0°: " + json.dumps(sk))
        page.screenshot(path=str(shots / "point-rotate-180.png"), clip={"x": 420, "y": 230, "width": 400, "height": 200})

        print("== a text's rotation is its own")
        page.evaluate("(() => { try { " + SK + ".cancel(); } catch (e) {} })()"); page.wait_for_timeout(500)
        start("text"); page.wait_for_function("!document.querySelector('#rotSection').hidden", timeout=10000)
        check(page.inner_text("#rotVal") == "0°", "the text tool's Rotation starts at its own 0°, not the arrow's: " + page.inner_text("#rotVal"))
        page.evaluate("(() => { try { " + SK + ".cancel(); } catch (e) {} })()"); page.wait_for_timeout(500)

        print("== saved, and read back")
        saved = save_map("turned_arrows"); (shots / "turned_arrows.json").write_text(json.dumps(saved))
        pts = [o for o in saved["operationalLayers"] if o.get("id") == "__sketch_points"]
        feats = pts[0]["featureCollection"]["layers"][0]["featureSet"]["features"] if pts else []
        check(sorted(f["attributes"].get("rotation") for f in feats) == [0, 180], "the file keeps each arrow's rotation (0 and 180): " + str([f["attributes"].get("rotation") for f in feats]))
        body = json.dumps(pts[0]["featureCollection"]["layers"][0].get("layerDefinition", {}).get("drawingInfo", {})) if pts else ""
        check('"CIMSymbolReference"' in body and '"angle"' in body, "and the symbol Map Viewer reads carries the turn (a CIM symbol with an angle)")
        page.goto(f"{base}/index.html?config=lab"); page.wait_for_function(READY, timeout=120000); page.wait_for_timeout(2000)
        drop("turned_arrows.amap", json.dumps(saved))
        ok = wait_sketches("s.length === 2 && s.every(x => x.sym === 'cim')", 60000)
        check(ok and sorted(str(x["turn"]) for x in sketches()) == ["0", "180"], "opened again, the arrows are at 0° and 180°: " + json.dumps(sketches()))
        align = page.evaluate("(() => { const l = document.querySelector('arcgis-map').view.map.layers.find(x => x.id === '__sketch'); return Object.fromEntries(l.graphics.toArray().map(g => [g.attributes.rotation, g.symbol.data.symbol.angleAlignment || ''])); })()")
        check(align.get("180") == "Map" and align.get("0") == "Map", "in the lab both arrows keep their direction on the map when it turns (angleAlignment Map): " + json.dumps(align))
        page.evaluate("document.querySelector('arcgis-map').view.rotation = 90"); page.wait_for_timeout(3000)
        at2 = [page.evaluate(AT, 0), page.evaluate(AT, 180)]; xs, ys = [q[0] for q in at2], [q[1] for q in at2]
        page.screenshot(path=str(shots / "point-rotate-map-turned.png"), clip={"x": min(xs) - 80, "y": min(ys) - 80, "width": max(xs) - min(xs) + 160, "height": max(ys) - min(ys) + 160})
        page.evaluate("document.querySelector('arcgis-map').view.rotation = 0"); page.wait_for_timeout(1000)

        print("== the main app: no slider, but a turned arrow from a file stays turned")
        page.goto(f"{base}/index.html?config=mapmaker"); page.wait_for_function(READY, timeout=120000); page.wait_for_timeout(2000)
        drop("turned_arrows.amap", json.dumps(saved))
        ok = wait_sketches("s.length === 2 && s.every(x => x.sym === 'cim')", 60000)
        check(ok and sorted(str(x["turn"]) for x in sketches()) == ["0", "180"], "the arrows are still drawn at 0° and 180°: " + json.dumps(sketches()))
        align = page.evaluate("(() => { const l = document.querySelector('arcgis-map').view.map.layers.find(x => x.id === '__sketch'); return Object.fromEntries(l.graphics.toArray().map(g => [g.attributes.rotation, g.symbol.data.symbol.angleAlignment || ''])); })()")
        check(align.get("180") == "Map" and align.get("0") != "Map", "in the main app the turned arrow follows the map; an unturned symbol is as it was before: " + json.dumps(align))
        open_sketch()
        page.mouse.click(*page.evaluate(AT, 180))
        page.wait_for_function("!document.querySelector('#secFeature').hidden", timeout=10000)
        check("rotSection" not in page.evaluate(SHOWN), "with the arrow selected there is no Rotation slider in the main app: " + ", ".join(page.evaluate(SHOWN)))

        print("== in 3D")
        page.goto(f"{base}/index.html?config=lab"); page.wait_for_function(READY, timeout=120000); page.wait_for_timeout(2000)
        drop("turned_arrows.amap", json.dumps(saved)); wait_sketches("s.length === 2 && s.every(x => x.sym === 'cim')", 60000)
        page.click("#tg3d")
        page.wait_for_function("(() => { const s = document.querySelector('arcgis-scene'); return !!(s && s.view && s.view.ready) && document.querySelector('#tg3d').getAttribute('aria-pressed') === 'true'; })()", timeout=120000)
        page.wait_for_timeout(15000)
        shown3d = page.evaluate("(() => { const v = document.querySelector('arcgis-scene').view, l = v.map.layers.find(x => x.id === '__sketch'); return !!l && l.graphics.length === 2 && l.graphics.every(g => g.symbol && g.symbol.type === 'cim'); })()")
        check(shown3d, "the 3D view shows the same two arrows, with the same turned symbols")
        at3d = page.evaluate("(() => { const s = document.querySelector('arcgis-scene'), v = s.view, l = v.map.layers.find(x => x.id === '__sketch'), r = s.getBoundingClientRect(); return l.graphics.toArray().map(g => { const p = v.toScreen(g.geometry); return [r.left + p.x, r.top + p.y]; }); })()")
        xs, ys = [q[0] for q in at3d], [q[1] for q in at3d]
        page.screenshot(path=str(shots / "point-rotate-3d.png"), clip={"x": min(xs) - 80, "y": min(ys) - 80, "width": max(xs) - min(xs) + 160, "height": max(ys) - min(ys) + 160})
        check(not errors, "no script errors: " + " | ".join(errors[:3]))
        browser.close()
    print(f"{checks[0] - len(failures)}/{checks[0]} checks passed")
    sys.exit(csp_shim.finish(failures))

if __name__ == "__main__":
    main()
