"""Runs Measure across a switch between 2D and 3D in Atlas 5.0 (features.keepMeasure: lab in 5.0.0-beta.77, the main app from
5.0.0-beta.78) in Chromium against the real services.

Run:  python3 tests/live-measure-carry.py [--shots DIR] [--proxy URL] [--axe PATH]
Needs network access to js.arcgis.com and www.arcgis.com, and Python Playwright with Chromium.

Checks, in the main app: an area measured in 2D is measured again in 3D by the 3D tool, the same shape with the same area,
and can still be changed; and back. A distance between two points becomes the 3D tool's straight line, and back. A 2D
path with bends is drawn in 3D with its 2D length, beside the map and on it, follows the km / mi switch, goes back to
2D as the same path, and goes away when a new distance is measured. A measurement half drawn is left behind, and the
same tool starts afresh. The Coordinates tool stays open. In the classic config, Measure stops at a switch, as it did before.
"""
import argparse, functools, glob, http.server, json, os, pathlib, re, sys, threading
from playwright.sync_api import sync_playwright
import csp_shim   # waits that work under the app's Content Security Policy; collects what it blocked

HERE = pathlib.Path(__file__).resolve().parent
APP = HERE.parent
# what the measuring component in the panel shows: its tag, state, shape and the figures it writes
INFO = """async () => { const el = document.querySelector('#measureBody > [class^="esri"], #measureBody > *:not(.measure-fixed)'); if (!el || !el.analysis) return null; const a = el.analysis;
  const v = document.querySelector('arcgis-map').view, sc = document.querySelector('arcgis-scene'), sv = sc && sc.view; const view = sv && sv.analyses.includes(a) ? sv : v;
  let av = null; try { av = await view.whenAnalysisView(a); } catch (e) {}
  const outs = []; const walk = (r) => { r.querySelectorAll('output').forEach((o) => outs.push(o.textContent.trim())); r.querySelectorAll('*').forEach((n) => { if (n.shadowRoot) walk(n.shadowRoot); }); }; if (el.shadowRoot) walk(el.shadowRoot);
  const xy = (p) => p ? [p.x, p.y] : null; const g = a.geometry;
  return { tag: el.tagName.toLowerCase(), state: el.state, valid: a.valid, interactive: !!(av && av.interactive), in3d: view === sv,
    part: g ? (g.rings ? g.rings[0] : g.paths[0]).map((p) => [p[0], p[1]]) : null, start: xy(a.startPoint), end: xy(a.endPoint),
    result: av && av.result ? JSON.parse(JSON.stringify({ area: av.result.area, length: av.result.length, horizontal: av.result.horizontalDistance })) : null, outs: outs.filter(Boolean) }; }"""
FIXED = """() => { const b = document.querySelector('#measureBody .measure-fixed'); const sc = document.querySelector('arcgis-scene'), sv = sc && sc.view;
  const gs = sv ? sv.graphics.toArray().filter((g) => g.symbol && (g.symbol.type === 'line-3d' || (g.symbol.type === 'point-3d' && g.symbol.symbolLayers.getItemAt(0).type === 'text'))) : [];
  const label = gs.find((g) => g.symbol.type === 'point-3d'), line = gs.find((g) => g.symbol.type === 'line-3d');
  return { box: !!b, out: b ? b.querySelector('output').textContent : null, note: b ? b.querySelector('.hint').textContent : null, label: label ? label.symbol.symbolLayers.getItemAt(0).text : null,
    line: line ? line.geometry.paths[0].map((p) => [p[0], p[1]]) : null, n: gs.length }; }"""
PRESSED = "() => ['mDist', 'mArea', 'mCoord'].filter((id) => document.getElementById(id).getAttribute('aria-pressed') === 'true')"

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
        page = browser.new_context(viewport={"width": 1366, "height": 768}).new_page(); errors = []
        page.on("pageerror", lambda e: errors.append(str(e)[:300]))
        page.on("dialog", lambda d: d.accept())
        def axe(sel, what):
            if not a.axe: return
            csp_shim.add_axe(page, a.axe)
            v = page.evaluate("async (s) => { const r = await axe.run(s, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] }); return r.violations.map((x) => x.id + ': ' + x.nodes.length + ' ' + (x.nodes[0] && x.nodes[0].target.join(' '))); }", sel)
            check(not v, what + " passes the accessibility scan" + (": " + "; ".join(v) if v else ""))
        def info():
            return page.evaluate(INFO)
        def wait_info(pred, timeout=30000):
            t = 0; r = None
            while t < timeout:
                r = info()
                if r and pred(r): return r
                page.wait_for_timeout(500); t += 500
            return r
        def click_at(x, y, double=False):
            page.mouse.move(x - 20, y - 10); page.mouse.move(x, y, steps=5); page.wait_for_timeout(500)
            (page.mouse.dblclick if double else page.mouse.click)(x, y); page.wait_for_timeout(500)
        def draw(points):
            for xy in points[:-1]: click_at(*xy)
            click_at(*points[-1], double=True); page.wait_for_timeout(1200)
        def open_measure():
            if not page.is_hidden("#measurePanel"): return
            page.evaluate("document.querySelector('#tool-measure').click()"); page.wait_for_timeout(500)
            if page.is_hidden("#measurePanel"): page.evaluate("document.querySelector('#menuMeasure').click()")
            page.wait_for_selector("#measurePanel:not([hidden])")
        def to3d():
            page.click("#tg3d")
            page.wait_for_function("document.querySelector('arcgis-scene') && document.querySelector('arcgis-scene').view && document.querySelector('arcgis-scene').view.ready && document.querySelector('#tg3d').getAttribute('aria-pressed') === 'true'", timeout=120000)
            page.wait_for_timeout(2500)
        def to2d():
            page.click("#tg2d"); page.wait_for_function("document.querySelector('#tg2d').getAttribute('aria-pressed') === 'true'", timeout=60000); page.wait_for_timeout(2500)
        near = lambda p, q, tol=1: abs(p[0] - q[0]) < tol and abs(p[1] - q[1]) < tol
        same_part = lambda a_, b_: a_ is not None and b_ is not None and len(a_) == len(b_) and all(near(p, q) for p, q in zip(a_, b_))

        print("== an area")
        page.goto(f"{base}/index.html?config=mapmaker&units=metric")
        page.wait_for_function("document.querySelector('arcgis-map') && document.querySelector('arcgis-map').view && document.querySelector('arcgis-map').view.ready", timeout=120000)
        page.wait_for_timeout(2500)
        open_measure()
        page.click("#mArea"); page.wait_for_selector("#measureBody arcgis-area-measurement-2d", timeout=60000); page.wait_for_timeout(1500)
        draw([(520, 300), (680, 300), (680, 420), (520, 420)])
        a2 = wait_info(lambda r: r["state"] == "measured")
        check(a2 and a2["state"] == "measured" and a2["result"]["area"], "an area is measured in 2D: " + (", ".join(a2["outs"]) if a2 else "nothing"))
        to3d()
        a3 = wait_info(lambda r: r["tag"] == "arcgis-area-measurement-3d" and r["state"] == "measured" and r["result"] and r["result"].get("area"), 45000)
        check(page.is_visible("#measurePanel") and page.evaluate(PRESSED) == ["mArea"], "the Measure panel stays open with Area chosen")
        check(a3 and a3["tag"] == "arcgis-area-measurement-3d" and a3["in3d"] and a3["state"] == "measured", "the 3D view's area tool shows it measured")
        check(a3 and same_part(a3["part"], a2["part"]), "it is the same shape")
        ar2, ar3 = (a2["result"]["area"] or {}), ((a3 or {}).get("result") or {}).get("area") or {}
        check(ar3.get("value") and ar2.get("value") and ar3.get("unit") == ar2.get("unit") and abs(ar3["value"] - ar2["value"]) / ar2["value"] < 0.01, f"with the same area: {ar2.get('value')} and {ar3.get('value')} {ar2.get('unit')}")
        check(a3 and a3["interactive"] and all("." not in o for o in a3["outs"]), "and it can still be changed, with whole numbers in the panel: " + ", ".join((a3 or {}).get("outs", [])))
        check(page.evaluate("document.querySelectorAll('#measureBody > *').length") == 1 and page.evaluate("document.querySelector('arcgis-map').view.analyses.length") == 0, "the 2D tool and its shape are gone; one tool in the panel")
        page.screenshot(path=str(shots / "measure-carry-area-3d.png"))
        to2d()
        a22 = wait_info(lambda r: r["tag"] == "arcgis-area-measurement-2d" and r["state"] == "measured")
        check(a22 and same_part(a22["part"], a2["part"]) and page.evaluate("document.querySelector('arcgis-scene').view.analyses.length") == 0, "and back in 2D it is the same area again, and the 3D one is gone")

        print("== a distance between two points")
        page.click("#mDist"); page.wait_for_selector("#measureBody arcgis-distance-measurement-2d", timeout=60000); page.wait_for_timeout(1500)
        draw([(520, 330), (700, 300)])
        d2 = wait_info(lambda r: r["state"] == "measured")
        check(d2 and d2["state"] == "measured" and len(d2["part"]) == 2, "a straight distance is measured in 2D: " + (", ".join(d2["outs"]) if d2 else "nothing"))
        to3d()
        d3 = wait_info(lambda r: r["tag"] == "arcgis-direct-line-measurement-3d" and r["state"] == "measured")
        check(d3 and d3["tag"] == "arcgis-direct-line-measurement-3d" and d3["state"] == "measured" and d3["interactive"], "in 3D it is the 3D tool's line, measured, and can still be changed")
        check(d3 and near(d3["start"], d2["part"][0]) and near(d3["end"], d2["part"][-1]), "between the same two points")
        l2 = d2["result"]["length"]; h3 = ((d3 or {}).get("result") or {}).get("horizontal") or {}
        check(h3.get("value") and h3.get("unit") == l2["unit"] and abs(h3["value"] - l2["value"]) / l2["value"] < 0.01, f"its horizontal distance is the 2D length: {l2['value']:.1f} and {h3.get('value') or 0:.1f} {l2['unit']}")
        to2d()
        d22 = wait_info(lambda r: r["tag"] == "arcgis-distance-measurement-2d" and r["state"] == "measured")
        check(d22 and same_part(d22["part"], d2["part"]), "and back in 2D it is the same line")

        print("== a path with bends")
        page.click("#mDist"); page.wait_for_selector("#measureBody arcgis-distance-measurement-2d", timeout=60000); page.wait_for_timeout(1500)
        draw([(500, 300), (600, 400), (720, 300)])
        b2 = wait_info(lambda r: r["state"] == "measured")
        shown2 = [o for o in (b2 or {}).get("outs", []) if re.search(r"\d", o)]
        check(b2 and len(b2["part"]) == 3 and shown2, "a path with a bend is measured in 2D: " + ", ".join(shown2))
        to3d()
        page.wait_for_timeout(1500)
        f3 = page.evaluate(FIXED)
        check(f3["box"] and page.evaluate("document.querySelector('#measureBody arcgis-direct-line-measurement-3d')") is None and page.evaluate(PRESSED) == ["mDist"], "in 3D there is no 3D tool for it: the panel says what it is, Distance still chosen")
        num = lambda t: re.sub(r"[^\d]", "", t or "")
        check(f3["out"] and shown2 and num(f3["out"]) == num(shown2[0]) and f3["out"].endswith("km"), f"with the length 2D gave it: {f3['out']} (2D: {shown2[0] if shown2 else '?'})")
        check(f3["note"] and "2D" in f3["note"], "and how to change it: " + (f3["note"] or ""))
        check(f3["n"] == 2 and same_part(f3["line"], b2["part"]) and f3["label"] == f3["out"], "on the map: the same path, labelled with the same length")
        page.screenshot(path=str(shots / "measure-carry-path-3d.png")); axe("#measurePanel", "the Measure panel with a 2D path shown in 3D")
        page.evaluate("document.querySelector('arcgis-scene').view.goTo({ tilt: 55 }, { animate: false })"); page.wait_for_timeout(2500)
        page.screenshot(path=str(shots / "measure-carry-path-3d-tilted.png"))
        page.click("#measurePanel .units-seg button[data-units='imperial']"); page.wait_for_timeout(800)
        fm = page.evaluate(FIXED)
        check(fm["out"] and fm["out"].endswith("mi") and fm["label"] == fm["out"], "the km / mi switch changes it: " + (fm["out"] or ""))
        page.click("#measurePanel .units-seg button[data-units='metric']"); page.wait_for_timeout(500)
        to2d()
        b22 = wait_info(lambda r: r["tag"] == "arcgis-distance-measurement-2d" and r["state"] == "measured")
        check(b22 and same_part(b22["part"], b2["part"]) and b22["interactive"] and page.evaluate(FIXED)["n"] == 0, "back in 2D it is the same path, measured, to be changed there; nothing left in 3D")
        to3d(); page.wait_for_timeout(1000)
        check(page.evaluate(FIXED)["n"] == 2, "in 3D again it is drawn again")
        page.click("#mDist"); page.wait_for_selector("#measureBody arcgis-direct-line-measurement-3d", timeout=60000); page.wait_for_timeout(1000)
        f4 = page.evaluate(FIXED); d4 = info()
        check(not f4["box"] and f4["n"] == 0 and d4 and d4["state"] in ("measuring", "ready"), "choosing Distance in 3D takes it away and starts a new 3D measurement: " + str(d4 and d4["state"]))

        print("== half drawn, and Coordinates")
        to2d()
        d5 = wait_info(lambda r: r["tag"] == "arcgis-distance-measurement-2d")
        check(d5 and d5["state"] in ("measuring", "ready") and not d5["valid"], "a measurement half drawn in 3D is left behind: 2D starts a new distance (" + str(d5 and d5["state"]) + ")")
        click_at(560, 320)
        to3d()
        d6 = wait_info(lambda r: r["tag"] == "arcgis-direct-line-measurement-3d")
        check(d6 and not d6["valid"] and page.evaluate(PRESSED) == ["mDist"], "and one begun in 2D: 3D starts afresh, Distance still chosen")
        page.click("#mCoord"); page.wait_for_selector("#coordWrap:not([hidden])", timeout=60000); page.wait_for_timeout(1500)
        to2d()
        check(page.is_visible("#coordWrap") and page.evaluate(PRESSED) == ["mCoord"], "the Coordinates tool stays open across a switch")
        page.click("#mClear"); page.wait_for_timeout(500)
        check(page.evaluate(PRESSED) == [] and page.evaluate("document.querySelectorAll('#measureBody > *').length") == 0, "Clear still ends it all")

        print("== the classic config: Measure stops, as it did before")
        page.goto(f"{base}/index.html?config=classic&units=metric")
        page.wait_for_function("document.querySelector('arcgis-map') && document.querySelector('arcgis-map').view && document.querySelector('arcgis-map').view.ready", timeout=120000)
        page.wait_for_timeout(2500)
        open_measure()
        page.click("#mArea"); page.wait_for_selector("#measureBody arcgis-area-measurement-2d", timeout=60000); page.wait_for_timeout(1500)
        draw([(520, 300), (680, 300), (680, 420)])
        to3d()
        check(page.evaluate(PRESSED) == [] and page.evaluate("document.querySelectorAll('#measureBody > *').length") == 0, "switching to 3D ends the measurement and lifts Area")

        check(not errors, "no page errors" + (": " + " | ".join(errors[:3]) if errors else ""))
        browser.close()
    print(f"{checks[0] - len(failures)}/{checks[0]} checks passed")
    sys.exit(csp_shim.finish(failures))

if __name__ == "__main__":
    main()
