"""Runs paired 2D and 3D maps (lab) of Atlas 5.0 in Chromium against the real services.

Run:  python3 tests/live-pairs.py [--shots DIR] [--proxy URL] [--axe FILE]
Needs network access to js.arcgis.com and www.arcgis.com, and Python Playwright with Chromium.

The pair is two real public items of the test content group: the web map "Volcanoes Around the World" and the web
scene "La Palma drone imagery". Until the group has a pair its author tagged, the test adds the two tags to what
ArcGIS Online answers (atlas-3d-<scene> on the web map, atlas-2d-<web map> on the scene); everything else is real.

Checks: Open map shows the pair as one card marked 2D + 3D, counted among the 2D maps and the 3D maps, and under 3D
maps the card is the scene's; the 3D button on the web map opens the scene at the same place with the sketch, the
spreadsheet layer and a bookmark made here, and the scene's own bookmarks in place of the web map's; 2D is not locked on
the scene and goes back to the web map as it was left (its filter still on); the saved file names the pair and can
switch after it is opened again; a link to the scene alone can go to 2D; a partner that can't be opened falls back to
drawing the map in 3D; with the feature off (config=mapmaker) the same tags change nothing.
"""
import argparse, functools, glob, http.server, json, os, pathlib, sys, threading
from playwright.sync_api import sync_playwright
import csp_shim   # waits that work under the app's Content Security Policy; collects what it blocked

HERE = pathlib.Path(__file__).resolve().parent
APP = HERE.parent
WEBMAP = "86b6cdb66fea47a0a413120a0b49ae95"   # Volcanoes Around the World
SCENE = "87bf66faa047472bb3bf3d8cfe23ffc2"    # La Palma drone imagery - Lava Flow for MM
MISSING = "0123456789abcdef0123456789abcdef"  # no such item
CSV = "Site,Latitude,Longitude,Ash\nTodoque,28.6130,-17.9000,12\nLa Laguna,28.6290,-17.9110,5\nTajuya,28.6150,-17.8780,9\n"
AXE = "(sel) => axe.run(sel, { runOnly: ['wcag2a','wcag2aa','wcag21a','wcag21aa'] }).then(r => r.violations.map(v => v.id + ': ' + v.nodes.map(n => n.target.join(' ')).slice(0,3).join(', ')))"
MODE = "({ p2: document.querySelector('#tg2d').getAttribute('aria-pressed'), p3: document.querySelector('#tg3d').getAttribute('aria-pressed'), d2: document.querySelector('#tg2d').getAttribute('aria-disabled'), d3: document.querySelector('#tg3d').getAttribute('aria-disabled'), sceneShown: !document.querySelector('#sceneDiv').hidden, mapShown: !document.querySelector('#viewDiv').hidden })"
# what is on screen: which view, the kind of map and its item, its layers, and where it is looking
NOW = """(() => { const s = document.querySelector('arcgis-scene'), m = document.querySelector('arcgis-map'); const in3 = !!s && !document.querySelector('#sceneDiv').hidden; const v = in3 ? s.view : m.view, mp = v.map;
  const sk = mp.layers.find(x => x.id === '__sketch'), c = v.center;
  return { in3, kind: mp.declaredClass, item: mp.portalItem ? mp.portalItem.id : null, ready: !!v.ready, layers: mp.layers.map(l => l.title || l.id).toArray(), ids: mp.layers.map(l => l.id).toArray(),
    sketches: sk ? sk.graphics.length : -1, drawn: Object.fromEntries(mp.layers.filter(l => String(l.id).startsWith('__sketch')).map(l => [l.title, l.graphics.length]).toArray()), sketchTop: !!sk && mp.layers.getItemAt(mp.layers.length - 1) === sk, lon: c ? c.longitude : null, lat: c ? c.latitude : null, scale: v.scale, tilt: in3 && v.camera ? v.camera.tilt : 0 }; })()"""
CARDS = "[...document.querySelectorAll('#omList .cat-card')].map(c => ({ title: c.querySelector('.cat-card-title').textContent.trim(), scene: c.classList.contains('is-scene'), pair: c.classList.contains('is-pair'), badge: (c.querySelector('.cat-thumb .cat-3d') || {}).textContent || '', act: c.querySelector('.cat-act').textContent }))"
DIMS = "Object.fromEntries([...document.querySelectorAll('#omBrowser .cat-dims button')].map(b => [b.dataset.dim, +b.querySelector('.cat-dim-n').textContent]))"

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--shots", default=str(HERE / ".shots")); ap.add_argument("--proxy", default=os.environ.get("HTTPS_PROXY", "")); ap.add_argument("--axe", default="")
    a = ap.parse_args()
    shots = pathlib.Path(a.shots); shots.mkdir(parents=True, exist_ok=True)
    srv = http.server.ThreadingHTTPServer(("localhost", 0), functools.partial(Quiet, directory=str(APP)))
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
        browser = p.chromium.launch(**launch)
        ctx = browser.new_context(viewport={"width": 1366, "height": 768})
        ctx.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker;")   # saves become downloads the test can read
        page = ctx.new_page(); errors = []
        page.on("pageerror", lambda e: (errors.append(str(e)[:300]), print("  (page error: " + str(getattr(e, "stack", e))[:700] + ")", flush=True)))
        page.on("dialog", lambda d: d.accept())
        def wf(expr, arg=None, timeout=120000):   # checked on a timer: the software-drawn 3D view gives a frame or two a second
            try: return page.wait_for_function(expr, arg=arg, timeout=timeout, polling=500)
            except Exception: print("  (timed out waiting for: " + expr[:130] + ")", flush=True); raise
        def jsclick(sel): page.evaluate("(s) => document.querySelector(s).click()", sel)
        def toast(): return page.inner_text("#toast")
        def now(): return page.evaluate(NOW)
        def axe(sel, what):
            if not a.axe: return
            if not page.evaluate("typeof axe !== 'undefined'"): page.add_script_tag(path=a.axe)
            v = page.evaluate(AXE, sel); check(not v, what + ": no WCAG 2.1 A/AA violations (axe-core): " + "; ".join(v))
        def drop(name, text, mime):
            page.evaluate("""([name, text, mime]) => { const dt = new DataTransfer(); dt.items.add(new File([text], name, { type: mime })); window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); }""", [name, text, mime])
        def save_map(name):
            if not page.is_visible("#savePanel"): jsclick("#tool-save")
            jsclick("#saveTile"); wf("!document.querySelector('#nameModal').hidden"); page.fill("#fileNameInput", name)
            with page.expect_download() as dl: jsclick("#nameConfirm")
            return json.loads(pathlib.Path(dl.value.path()).read_text())
        def bm_titles():
            if not page.is_visible("#bookmarksPanel"): jsclick("#tool-bookmarks")
            page.wait_for_timeout(800)
            return page.evaluate("[...document.querySelectorAll('#bmList .bm-title')].map(e => e.textContent)")
        def in_3d(item, timeout=180000):
            wf("(id) => { const s = document.querySelector('arcgis-scene'); return !!(s && s.view && s.view.ready && s.view.map && s.view.map.portalItem && s.view.map.portalItem.id === id && s.view.map.loaded) && document.querySelector('#tg3d').getAttribute('aria-pressed') === 'true' && !document.querySelector('#tg3d').hasAttribute('aria-busy'); }", arg=item, timeout=timeout)
        def in_2d(timeout=180000):
            wf("(() => { const m = document.querySelector('arcgis-map'); return !!(m && m.view && m.view.ready) && document.querySelector('#tg2d').getAttribute('aria-pressed') === 'true' && !document.querySelector('#viewDiv').hidden && !document.querySelector('#tg2d').hasAttribute('aria-busy'); })()", timeout=timeout)
        def app_ready():
            wf("(() => { const m = document.querySelector('arcgis-map'); return !!(m && m.view && m.view.ready); })()"); page.wait_for_timeout(1500)

        # The two tags, added to what ArcGIS Online says about the two items (and to the group's list of them).
        tags = {WEBMAP: "atlas-3d-" + SCENE, SCENE: "Atlas-2D-" + WEBMAP.upper()}   # capitals don't matter
        state = {"tag_scene": True, "scene_target": SCENE}
        def tag_for(i): return ("atlas-3d-" + state["scene_target"]) if i == WEBMAP else (tags[i] if state["tag_scene"] else None)
        def tagged(route):
            r = route.fetch(); j = r.json()
            def add(it):
                if isinstance(it, dict) and it.get("id") in tags and tag_for(it["id"]): it["tags"] = [x for x in (it.get("tags") or []) if x] + [tag_for(it["id"])]
            if isinstance(j.get("results"), list): [add(x) for x in j["results"]]
            else: add(j)
            route.fulfill(response=r, json=j)
        page.route(lambda u: (f"/content/items/{WEBMAP}?" in u or f"/content/items/{SCENE}?" in u or ("/content/groups/" in u and "/search" in u)), tagged)

        print("== Open map: the pair is one card")
        page.goto(f"{base}/index.html?config=lab"); app_ready()
        jsclick("#tool-open"); wf("document.querySelectorAll('#omList .cat-card').length > 0"); page.wait_for_timeout(1500)
        d = page.evaluate(DIMS)
        check(d["3d"] == 3 and d["all"] == d["2d"] + 2, f"the pair counts among the 2D maps and the 3D maps, once in all: {d}")
        page.fill("#omSearch", "volcanoes around"); page.wait_for_timeout(900)
        cards = page.evaluate(CARDS); pc = next((c for c in cards if c["title"].startswith("Volcanoes Around the World")), None)
        check(pc and pc["pair"] and not pc["scene"] and pc["badge"] == "2D + 3D" and "2D and 3D versions" in pc["title"], "under All the card is the web map's, marked 2D + 3D on its picture and in its name: " + json.dumps(pc))
        page.fill("#omSearch", "la palma"); page.wait_for_timeout(900)
        cards = page.evaluate(CARDS)
        check(len(cards) >= 1 and all("La Palma drone" not in c["title"] for c in cards) and any(c["pair"] for c in cards), "the scene has no card of its own under All; its words find the pair's card: " + json.dumps([c["title"][:40] for c in cards]))
        page.fill("#omSearch", ""); page.wait_for_timeout(600)
        jsclick("#omBrowser .cat-dims button[data-dim='3d']"); page.wait_for_timeout(900)
        cards = page.evaluate(CARDS); sc = next((c for c in cards if c["title"].startswith("La Palma drone")), None)
        check(len(cards) == 3 and sc and sc["scene"] and sc["pair"] and sc["badge"] == "2D + 3D" and sc["act"] == "Open 3D map", "under 3D maps the pair's card is the scene's, marked 2D + 3D, and opens the 3D map: " + json.dumps(sc))
        page.screenshot(path=str(shots / "pairs-openmap-3d.png")); axe("#openModal", "Open map with a pair")
        jsclick("#omBrowser .cat-dims button[data-dim='2d']"); page.wait_for_timeout(600); page.fill("#omSearch", "volcanoes around"); page.wait_for_timeout(900)
        cards = page.evaluate(CARDS)
        check(any(c["pair"] and c["title"].startswith("Volcanoes Around") for c in cards), "and it is among the 2D maps")

        print("== the web map, then its 3D version")
        page.evaluate("[...document.querySelectorAll('#omList .cat-card')].find(c => c.querySelector('.cat-card-title').textContent.startsWith('Volcanoes Around')).querySelector('.cat-act').click()")
        wf("(id) => { const v = document.querySelector('arcgis-map').view; return !!(v.map && v.map.portalItem && v.map.portalItem.id === id && v.map.loaded && v.ready); }", arg=WEBMAP); page.wait_for_timeout(3000)
        st = page.evaluate(MODE); n0 = now()
        check(st["p2"] == "true" and st["d3"] is None and n0["kind"] == "esri.WebMap", "the card opens the web map in 2D, with 3D available")
        own2d = [l for l, i in zip(n0["layers"], n0["ids"]) if i != "__sketch"]
        drop("ash.csv", CSV, "text/csv")
        wf("!document.querySelector('#dataPanel').hidden && !!document.querySelector('#dataSubmit')"); page.wait_for_timeout(1500); jsclick("#dataSubmit")
        wf("(() => { const v = document.querySelector('arcgis-map').view; return v.map.layers.some(l => l.title === 'ash') && Math.abs(v.center.longitude + 17.9) < 0.5; })()"); page.wait_for_timeout(4000)
        # a sketch: a point at the middle of the map
        jsclick("#tool-sketch"); wf("(() => { const s = document.querySelector('arcgis-sketch'); return !!s && s.state === 'ready' && !!s.view; })()"); page.wait_for_timeout(2500)
        page.evaluate("document.querySelector('arcgis-sketch').create('point')"); page.wait_for_timeout(2500)
        box = page.locator("#viewDiv").bounding_box(); x, y = box["x"] + box["width"] * 0.45, box["y"] + box["height"] * 0.5
        page.mouse.move(x, y); page.wait_for_timeout(1200); page.mouse.click(x, y); page.wait_for_timeout(3000)
        page.evaluate("(() => { const s = document.querySelector('arcgis-sketch'); try { if (s.state === 'active') s.cancel(); } catch (e) {} })()"); page.wait_for_timeout(1000)
        page.keyboard.press("Escape"); jsclick("#tool-sketch"); page.wait_for_timeout(800)
        # a second sketch layer (lab too), with one sketch
        jsclick("#tool-add"); page.wait_for_selector("#addModal:not([hidden])"); jsclick("#tabSketchLayer"); page.wait_for_selector("#paneSketchLayer:not([hidden])")
        page.fill("#sketchLayerName", "Rivers"); jsclick("#sketchLayerCreate"); page.wait_for_timeout(1500)
        wf("(() => { const s = document.querySelector('arcgis-sketch'); return !!s && s.state === 'ready' && !!s.view; })()"); page.wait_for_timeout(1500)
        page.evaluate("document.querySelector('arcgis-sketch').create('point')"); page.wait_for_timeout(2500)
        page.mouse.move(x + 90, y - 60); page.wait_for_timeout(1200); page.mouse.click(x + 90, y - 60); page.wait_for_timeout(3000)
        page.evaluate("(() => { const s = document.querySelector('arcgis-sketch'); try { if (s.state === 'active') s.cancel(); } catch (e) {} })()"); page.wait_for_timeout(1000)
        page.keyboard.press("Escape"); jsclick("#tool-sketch"); page.wait_for_timeout(800)
        bm2d = bm_titles()
        jsclick("#bmAddBtn"); page.fill("#bmTitleInput", "My place"); jsclick("#bmSave"); page.wait_for_timeout(600)
        jsclick("#tool-bookmarks"); page.wait_for_timeout(500)
        # a filter on the web map's own layer: it belongs to the 2D version
        vol = page.evaluate("(() => { const v = document.querySelector('arcgis-map').view; const l = v.map.allLayers.find(x => x.type === 'feature' && x.id !== '__sketch' && x.title !== 'ash' && x.fields && x.fields.length); if (!l) return null; l.definitionExpression = '1=1'; return l.title; })()")
        before = now()
        check(before["sketches"] == 1 and "ash" in before["layers"] and abs(before["lon"] + 17.9) < 0.2, f"a spreadsheet, a sketch and a bookmark are added in 2D, looking at La Palma ({before['lon']:.3f}, {before['lat']:.3f})")
        page.screenshot(path=str(shots / "pairs-2d.png"))
        jsclick("#tg3d"); in_3d(SCENE); page.wait_for_timeout(1500); note = toast(); page.wait_for_timeout(8000)
        n3 = now(); st = page.evaluate(MODE)
        check(n3["in3"] and n3["kind"] == "esri.WebScene" and n3["item"] == SCENE, "3D opens the map's own 3D version (the web scene), not the web map drawn in 3D")
        check("its own 3D version" in note and "came with you" in note, "and says so the first time: " + note)
        check(n3["sketches"] == 1 and "ash" in n3["layers"], f"the sketch and the spreadsheet layer came across: {n3['layers']}")
        check(n3["drawn"] == {"My sketches": 1, "Rivers": 1} and n3["layers"][-3:] == before["layers"][-3:], f"both sketch layers did, and your own layers are on top in the order they had: {n3['layers'][-3:]}")
        check(not any(l in n3["layers"] for l in own2d), "the web map's own layers did not: the scene has its own")
        check(abs(n3["lon"] - before["lon"]) < 0.05 and abs(n3["lat"] - before["lat"]) < 0.05, f"the 3D view looks at the same place ({n3['lon']:.3f}, {n3['lat']:.3f}), tilted {n3['tilt']:.0f}°")
        check(st["p3"] == "true" and st["d2"] is None and not page.get_attribute("#tg2d", "title"), "2D is not locked on a 3D map that has a 2D version")
        bm3d = bm_titles()
        check("My place" in bm3d and not any(b in bm3d for b in bm2d if b != "My place"), f"the bookmark made here is kept; the web map's own ({len(bm2d)}) give way to the scene's: {bm3d}")
        jsclick("#tool-bookmarks"); page.wait_for_timeout(400)
        page.screenshot(path=str(shots / "pairs-3d.png")); axe("#viewSeg", "the 2D / 3D buttons")
        saved3 = save_map("pair_in_3d")
        ops = saved3.get("operationalLayers", [])
        check(saved3.get("atlasPair") == {"webmap": WEBMAP, "scene": SCENE} and "viewingMode" in saved3 and any(str(o.get("id", "")).startswith("__sketch") for o in ops), "saved from 3D: a web scene file that names the pair and holds the sketch")

        print("== back to the 2D version")
        jsclick("#tg2d"); in_2d(); page.wait_for_timeout(1200); note2 = toast(); page.wait_for_timeout(4000)
        n2 = now(); st = page.evaluate(MODE)
        check(not n2["in3"] and n2["kind"] == "esri.WebMap" and n2["item"] == WEBMAP and st["d3"] is None, "2D goes back to the web map")
        check(n2["drawn"] == {"My sketches": 1, "Rivers": 1} and n2["layers"][-3:] == before["layers"][-3:] and "ash" in n2["layers"] and all(l in n2["layers"] for l in own2d), f"with the sketch, the spreadsheet and its own layers: {n2['layers']}")
        kept = page.evaluate("(t) => { const l = document.querySelector('arcgis-map').view.map.allLayers.find(x => x.title === t); return l ? l.definitionExpression : null; }", vol) if vol else "1=1"
        check(kept == "1=1", "as it was left: the filter on its own layer is still on")
        check(abs(n2["lon"] - n3["lon"]) < 0.05 and abs(n2["lat"] - n3["lat"]) < 0.05, f"looking at the same place ({n2['lon']:.3f}, {n2['lat']:.3f})")
        bm = bm_titles()
        check("My place" in bm and all(b in bm for b in bm2d), f"its own bookmarks are back, with the one made here: {bm}"); jsclick("#tool-bookmarks")
        check(note2 == "2D version open.", "a short note the second time: " + note2)
        jsclick("#tg3d"); in_3d(SCENE); page.wait_for_timeout(5000); n3b = now()
        check(n3b["item"] == SCENE and n3b["sketches"] == 1 and "ash" in n3b["layers"], "and to 3D again, the same scene with the same work")
        jsclick("#tg2d"); in_2d(); page.wait_for_timeout(3000)
        saved2 = save_map("pair_in_2d")
        check(saved2.get("atlasPair") == {"webmap": WEBMAP, "scene": SCENE} and "atlas3d" not in saved2, "saved from 2D: a web map file that names the pair")

        print("== a saved file can still switch")
        page.goto(f"{base}/index.html?config=lab"); app_ready()
        drop("pair_in_2d.amap", json.dumps(saved2), "application/json"); wf("document.querySelector('#toast').textContent.includes('pair in 2d')"); page.wait_for_timeout(3000)
        f2 = now(); st = page.evaluate(MODE)
        check(f2["kind"] == "esri.WebMap" and f2["sketches"] == 1 and "ash" in f2["layers"] and st["d3"] is None, "the 2D file opens in 2D with its work")
        jsclick("#tg3d"); in_3d(SCENE); page.wait_for_timeout(6000); f3 = now()
        check(f3["item"] == SCENE and f3["sketches"] == 1 and "ash" in f3["layers"], "its 3D button opens the scene, with the work")
        drop("pair_in_3d.amap", json.dumps(saved3), "application/json"); wf("document.querySelector('#toast').textContent.includes('pair in 3d')"); page.wait_for_timeout(6000)
        st = page.evaluate(MODE); g3 = now()
        check(g3["in3"] and g3["kind"] == "esri.WebScene" and st["d2"] is None, "the 3D file opens in 3D, with 2D available")
        jsclick("#tg2d"); in_2d(); page.wait_for_timeout(4000); g2 = now()
        check(g2["item"] == WEBMAP and g2["sketches"] == 1 and "ash" in g2["layers"], "and its 2D button opens the web map, with the work")

        print("== a link to the scene")
        page.goto(f"{base}/index.html?config=lab&webscene={SCENE}"); in_3d(SCENE); page.wait_for_timeout(5000)
        st = page.evaluate(MODE)
        check(st["d2"] is None, "a scene opened from a link knows its 2D version from its own tag")
        jsclick("#tg2d"); in_2d(); page.wait_for_timeout(3000)
        check(now()["item"] == WEBMAP, "and 2D opens it")

        print("== a 3D version that can't be opened")
        state["scene_target"] = MISSING
        page.goto(f"{base}/index.html?config=lab&webmap={WEBMAP}"); app_ready()
        wf("(id) => { const v = document.querySelector('arcgis-map').view; return !!(v.map && v.map.portalItem && v.map.portalItem.id === id && v.map.loaded); }", arg=WEBMAP); page.wait_for_timeout(2000)
        jsclick("#tg3d")
        wf("(() => { const s = document.querySelector('arcgis-scene'); return !!(s && s.view && s.view.ready) && document.querySelector('#tg3d').getAttribute('aria-pressed') === 'true'; })()", timeout=180000); page.wait_for_timeout(3000)
        m = now()
        check(m["in3"] and m["kind"] == "esri.WebMap" and m["item"] == WEBMAP, "the map is drawn in 3D as it is, as a map without a partner would be")
        jsclick("#tg2d"); in_2d(); check(now()["kind"] == "esri.WebMap", "and 2D works as usual")
        state["scene_target"] = SCENE

        print("== the feature off (config=mapmaker)")
        page.goto(f"{base}/index.html?config=mapmaker&webmap={WEBMAP}"); app_ready()
        wf("(id) => { const v = document.querySelector('arcgis-map').view; return !!(v.map && v.map.portalItem && v.map.portalItem.id === id && v.map.loaded); }", arg=WEBMAP); page.wait_for_timeout(2000)
        jsclick("#tg3d")
        wf("(() => { const s = document.querySelector('arcgis-scene'); return !!(s && s.view && s.view.ready) && document.querySelector('#tg3d').getAttribute('aria-pressed') === 'true'; })()", timeout=180000); page.wait_for_timeout(3000)
        off = now()
        check(off["kind"] == "esri.WebMap" and off["item"] == WEBMAP, "the tags are ignored: 3D draws the web map itself")
        page.goto(f"{base}/index.html?config=mapmaker&webscene={SCENE}"); in_3d(SCENE); page.wait_for_timeout(3000); st = page.evaluate(MODE)
        check(st["d2"] == "true", "and a scene is 3D only, as before")
        jsclick("#tool-open"); wf("document.querySelectorAll('#omList .cat-card').length > 0"); page.wait_for_timeout(1500)
        check(page.evaluate("document.querySelectorAll('#omList .is-pair').length") == 0, "Open map has no paired cards")

        check(not errors, "no uncaught errors: " + " | ".join(errors[:3]))
        browser.close()
    print(f"{checks[0] - len(failures)}/{checks[0]} checks passed")
    sys.exit(csp_shim.finish(failures))

if __name__ == "__main__":
    main()
