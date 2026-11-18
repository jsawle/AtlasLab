"""Tablets (features.tabletLayout, Tablets 1.0, 5.0.0-beta.75; in the main app from 5.0.0-beta.76), in Chromium against
the real services.

Run:  python3 tests/live-tablet.py [--shots DIR] [--proxy URL] [--axe FILE]
Needs network access to js.arcgis.com, cdn.arcgis.com and www.arcgis.com, and Python Playwright with Chromium.

An iPad-sized page with touch. Checks: upright, the toolbar shows each tool's name under its icon, fits without
scrolling and keeps clear of the compass, scale bar and Hide tools (iPad mini to iPad Pro widths); the classic config
(the switch off) still shows icons only; the map library's buttons and the app's own small buttons are 44 pixels for fingers (Map layers,
Measure, Filter, Sketch), and stay as they were with a mouse; pressing and holding a tool shows its name and what it
does without opening it, a quick tap opens it, and moving the finger lets it go; Measure and Sketch say "tap" after a
finger or pen and "click" after a mouse (main app too); on its side the iPad keeps the names and the Sketch tools fit.
"""
import argparse, functools, glob, http.server, json, os, pathlib, sys, threading
from playwright.sync_api import sync_playwright
import csp_shim   # waits that work under the app's Content Security Policy; collects what it blocked

HERE = pathlib.Path(__file__).resolve().parent
APP = HERE.parent
QUAKES = "85997c9571e74256af71dc20566b47f1"
IPAD = "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
READY = "document.querySelector('arcgis-map') && document.querySelector('arcgis-map').view && document.querySelector('arcgis-map').view.ready"
# the toolbar: each tool's name, shown or not, and whether it fits; what it might run into
TOOLBAR = r"""(() => { const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return b.width ? [b.left, b.top, b.right, b.bottom] : null; };
  const ov = (a, b) => !!(a && b && !(a[2] <= b[0] + 1 || b[2] <= a[0] + 1 || a[3] <= b[1] + 1 || b[3] <= a[1] + 1));
  const tb = document.querySelector('.toolbar'), T = r(tb), tools = [...tb.querySelectorAll('.tool')].filter(t => t.getClientRects().length);
  const names = tools.map(t => { const l = t.querySelector('.tl'), b = l.getBoundingClientRect(), tr = t.getBoundingClientRect(), cs = getComputedStyle(l);
    const words = l.textContent.trim().split(/\s+/).length, lines = Math.round(b.height / parseFloat(cs.lineHeight || 14));
    return { text: l.textContent.trim(), shown: b.width > 2 && cs.clip !== 'rect(0px, 0px, 0px, 0px)', inside: b.left >= tr.left - 1 && b.right <= tr.right + 1 && lines <= words, size: cs.fontSize }; });
  return { scrolls: tb.scrollWidth > tb.clientWidth + 1, names, rose: ov(T, r(document.querySelector('.rose'))), scale: ov(T, r(document.querySelector('arcgis-scale-bar'))), hide: ov(T, r(document.querySelector('#toolsBtn'))) }; })()"""
# sizes of the map library's buttons (in their shadow DOM) and of chosen controls of the app
SDK_SIZES = r"""(() => { const deep = (root, sel) => { const out = [...root.querySelectorAll(sel)]; for (const e of root.querySelectorAll('*')) if (e.shadowRoot) out.push(...deep(e.shadowRoot, sel)); return out; };
  const res = {}; for (const t of ['arcgis-zoom', 'arcgis-home', 'arcgis-expand', 'arcgis-sketch']) { const el = document.querySelector('arcgis-map ' + t) || document.querySelector(t);
    if (!el || !el.getClientRects().length) continue; const s = deep(el.shadowRoot || el, 'button').map(b => b.getBoundingClientRect()).filter(b => b.width > 0).map(b => Math.round(Math.min(b.width, b.height)));
    res[t] = s.length ? Math.min(...s) : null; } return res; })()"""
SIZE = "sel => [...document.querySelectorAll(sel)].filter(e => e.getClientRects().length).map(e => { const b = e.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; })"
AXE = "axe.run('#app', { runOnly: ['wcag2a','wcag2aa','wcag21a','wcag21aa'] }).then(r => r.violations.map(v => v.id + ': ' + v.nodes.map(n => n.target.join(' ')).slice(0,3).join(', ')))"

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
        errors = []
        def open_page(w, h, cfg, touch=True, webmap=True):
            ctx = browser.new_context(viewport={"width": w, "height": h}, has_touch=touch, is_mobile=touch, **({"user_agent": IPAD} if touch else {}))
            page = ctx.new_page(); page.on("pageerror", lambda e: errors.append(str(e)[:300]))
            page.goto(f"{base}/index.html?config={cfg}" + (f"&webmap={QUAKES}" if webmap else "")); page.wait_for_function(READY, timeout=120000); page.wait_for_timeout(6000)
            return ctx, page
        def axe(page, what):
            if not a.axe: return
            if not page.evaluate("typeof axe !== 'undefined'"): csp_shim.add_axe(page, a.axe)
            v = page.evaluate(AXE); check(not v, what + ": no WCAG 2.1 A/AA violations (axe-core): " + "; ".join(v))
        def hold(cdp, page, sel, ms=900, move=0):
            b = page.locator(sel).first.bounding_box(); x, y = b["x"] + b["width"] / 2, b["y"] + b["height"] / 2
            cdp.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]})
            if move:
                page.wait_for_timeout(120)
                for i in range(1, 6): cdp.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x - move * i / 5, "y": y}]}); page.wait_for_timeout(30)
            page.wait_for_timeout(ms)
            cdp.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []}); page.wait_for_timeout(700)
        def tip(page): return page.evaluate("(() => { const t = document.getElementById('tileTip'); return t.hidden ? null : { name: (t.querySelector('.tip-name') || {}).textContent || '', text: t.textContent }; })()")

        print("== upright iPads: the tools' names under their icons")
        for w, h in [(744, 1133), (810, 1080), (820, 1180), (1024, 1366)]:
            ctx, page = open_page(w, h, "mapmaker", webmap=False)
            tb = page.evaluate(TOOLBAR)
            check(all(n["shown"] and n["inside"] for n in tb["names"]) and not tb["scrolls"],
                  f"{w} wide: all {len(tb['names'])} names show, inside their tools with no word broken, and the toolbar fits without scrolling: " + ", ".join(n["text"] + ("" if n["shown"] and n["inside"] else "(!)") for n in tb["names"]))
            check(not (tb["rose"] or tb["scale"] or tb["hide"]), f"{w} wide: the toolbar is clear of the compass, the scale bar and Hide tools ({tb['rose']}, {tb['scale']}, {tb['hide']})")
            if w == 820: page.screenshot(path=str(shots / "tablet-toolbar-820.png"), clip={"x": 0, "y": h - 150, "width": w, "height": 150})
            ctx.close()
        ctx, page = open_page(820, 1180, "classic", webmap=False)
        tb = page.evaluate(TOOLBAR)
        check(not any(n["shown"] for n in tb["names"]), "the classic config (the switch off) keeps icons only at the same size")
        ctx.close()

        print("== big buttons for fingers, iPad upright")
        ctx, page = open_page(820, 1180, "mapmaker"); cdp = ctx.new_cdp_session(page)
        sdk = page.evaluate(SDK_SIZES)
        check(all(v and v >= 44 for k, v in sdk.items() if k != "arcgis-sketch") and len(sdk) >= 3, "the map library's Search, Home and Zoom buttons are 44 pixels: " + json.dumps(sdk))
        page.locator("#tool-layers").tap(); page.wait_for_selector("#layersPanel:not([hidden])"); page.wait_for_timeout(1500)
        lt = page.evaluate(SIZE, "#layersPanel .lt, #layersPanel .panel-head .x-btn")
        check(lt and all(min(x) >= 44 for x in lt), "Map layers: the layer's tools, Remove all and Close are 44 pixels: " + str(sorted(set(map(tuple, lt)))))
        rows = page.evaluate("[...new Set([...document.querySelectorAll('#layersPanel .lyr-tools .lt')].filter(e => e.getClientRects().length).map(e => Math.round(e.getBoundingClientRect().top)))].length")
        check(rows == 1, "and the layer's tools stay on one row: %d row(s)" % rows)
        cb = page.evaluate(SIZE, "#layersPanel .lyr-head input[type=checkbox]")
        check(cb and all(min(x) >= 24 for x in cb), "the layer's check box is at least 24 pixels: " + str(cb))
        page.screenshot(path=str(shots / "tablet-layers.png"), clip={"x": 360, "y": 64, "width": 460, "height": 260})
        axe(page, "iPad upright with Map layers open")

        print("== press and hold")
        hold(cdp, page, "#tool-legend")
        t = tip(page)
        check(t and t["name"] == "Legend" and "key" in t["text"].lower() or (t and t["name"] == "Legend" and len(t["text"]) > 12), "holding Legend shows its name and what it does: " + json.dumps(t))
        check(page.is_hidden("#legendPanel"), "and the Legend does not open")
        page.screenshot(path=str(shots / "tablet-hold.png"), clip={"x": 120, "y": 900, "width": 600, "height": 280})
        hold(cdp, page, "#layersPanel .lt[data-key$=':table']")
        t = tip(page)
        check(bool(t) and t["name"] == "Table" and page.is_hidden("#tableDock"), "holding a layer's Table icon names it and doesn't open the table: " + json.dumps(t) + " table shown: " + str(page.is_visible("#tableDock")) + " layers: " + str(page.is_visible("#layersPanel")))
        page.touchscreen.tap(400, 500); page.wait_for_timeout(600)
        check(tip(page) is None, "the next touch puts the tip away")
        hold(cdp, page, "#tool-legend", ms=700, move=60)
        check(tip(page) is None, "moving the finger while holding lets the tool go: no tip")
        page.locator("#tool-legend").tap(); page.wait_for_timeout(1200)
        check(page.is_visible("#legendPanel") and tip(page) is None, "a quick tap opens the Legend, with no tip")
        page.locator("#tool-legend").tap(); page.wait_for_timeout(800)

        print("== tap or click")
        page.locator("#tool-measure").tap(); page.wait_for_timeout(1000)
        if page.is_visible("#menuMeasure"): page.locator("#menuMeasure").tap(); page.wait_for_timeout(1000)
        check("tap the map" in page.inner_text("#measureHint").lower(), "Measure, after a finger: " + page.inner_text("#measureHint"))
        mb = page.evaluate(SIZE, "#measurePanel .btn, #measurePanel .units-seg button, #measurePanel .panel-head .x-btn")
        check(mb and all(x[1] >= 44 for x in mb), "Measure's buttons are 44 pixels high: " + str(sorted(set(x[1] for x in mb))))
        page.mouse.click(400, 500); page.wait_for_timeout(600)
        check("click on the map" in page.inner_text("#measureHint").lower(), "after a mouse click it says click: " + page.inner_text("#measureHint"))
        page.locator("#measurePanel [data-close]").first.click(); page.wait_for_timeout(600)
        page.locator("#tool-sketch").tap(); page.wait_for_function("document.querySelector('arcgis-sketch') && document.querySelector('arcgis-sketch').state === 'ready'", timeout=120000); page.wait_for_timeout(2500)
        page.evaluate("async () => { try { await document.querySelector('arcgis-sketch').create('point'); } catch (e) {} }"); page.wait_for_timeout(1200)
        page.touchscreen.tap(300, 700); page.wait_for_timeout(300)   # the finger on the map: the hint follows
        page.evaluate("async () => { try { await document.querySelector('arcgis-sketch').create('polyline'); } catch (e) {} }"); page.wait_for_timeout(1200)
        check(page.inner_text("#sketchHint").startswith("Tap to start the line"), "Sketch's line tool, after a finger: " + page.inner_text("#sketchHint"))
        sdk = page.evaluate(SDK_SIZES)
        check(sdk.get("arcgis-sketch", 0) >= 44, "the Sketch tools are 44 pixels: " + json.dumps(sdk))
        page.screenshot(path=str(shots / "tablet-sketch.png"), clip={"x": 300, "y": 64, "width": 520, "height": 800})
        page.evaluate("(() => { try { document.querySelector('arcgis-sketch').cancel(); } catch (e) {} })()")
        page.locator("#sketchPanel [data-close]").first.click(); page.wait_for_timeout(800)

        print("== Filter")
        page.locator("#tool-layers").tap() if page.is_hidden("#layersPanel") else None; page.wait_for_timeout(800)
        page.locator("#layersPanel .lt[data-key$=':filter']").first.tap(); page.wait_for_selector("#filterPanel:not([hidden])", timeout=30000); page.wait_for_timeout(3000)
        fb = page.evaluate(SIZE, "#filterPanel calcite-button, #filterPanel .lt, #filterPanel .panel-head .x-btn")
        check(fb and all(x[1] >= 44 for x in fb), "Filter's buttons are 44 pixels high: " + str(sorted(set(x[1] for x in fb))))
        page.screenshot(path=str(shots / "tablet-filter.png"), clip={"x": 360, "y": 64, "width": 460, "height": 700})
        ctx.close()

        print("== the same with a mouse (no touch screen): sizes as before")
        ctx, page = open_page(820, 1180, "mapmaker", touch=False)
        sdk = page.evaluate(SDK_SIZES)
        check(all(v and v < 40 for v in sdk.values()), "with a mouse the map library's buttons are as before (32): " + json.dumps(sdk))
        page.click("#tool-layers"); page.wait_for_selector("#layersPanel:not([hidden])"); page.wait_for_timeout(1200)
        lt = page.evaluate(SIZE, "#layersPanel .lt")
        check(lt and all(max(x) <= 34 for x in lt), "and the layer's tools as before: " + str(sorted(set(map(tuple, lt)))))
        ctx.close()

        print("== the classic config on an iPad: tap, not click (not behind the switch), and the old sizes")
        ctx, page = open_page(820, 1180, "classic", webmap=False)
        page.locator("#tool-measure").tap(); page.wait_for_timeout(1000)
        if page.is_visible("#menuMeasure"): page.locator("#menuMeasure").tap(); page.wait_for_timeout(1000)
        check("tap the map" in page.inner_text("#measureHint").lower(), "Measure says tap with the switch off too: " + page.inner_text("#measureHint"))
        sdk = page.evaluate(SDK_SIZES)
        check(all(v and v < 40 for v in sdk.values()), "and its buttons are as they were (the bigger ones follow the switch): " + json.dumps(sdk))
        ctx.close()

        print("== iPad on its side")
        ctx, page = open_page(1180, 820, "mapmaker")
        tb = page.evaluate(TOOLBAR)
        check(all(n["shown"] for n in tb["names"]) and not tb["scrolls"] and not (tb["rose"] or tb["scale"] or tb["hide"]), "the names show as before, the toolbar fits and is clear of the rest: " + json.dumps({k: tb[k] for k in ("scrolls", "rose", "scale", "hide")}))
        page.locator("#tool-sketch").tap(); page.wait_for_function("document.querySelector('arcgis-sketch') && document.querySelector('arcgis-sketch').state === 'ready'", timeout=120000); page.wait_for_timeout(3000)
        fits = page.evaluate("""(() => { const s = document.querySelector('arcgis-sketch').getBoundingClientRect(), t = document.querySelector('.toolbar').getBoundingClientRect(); return { bottom: Math.round(s.bottom), toolbarTop: Math.round(t.top), scroll: document.querySelector('arcgis-sketch').scrollHeight - document.querySelector('arcgis-sketch').clientHeight }; })()""")
        check(fits["bottom"] <= fits["toolbarTop"], "the bigger Sketch tools end above the toolbar: " + json.dumps(fits))
        page.screenshot(path=str(shots / "tablet-landscape-sketch.png"))
        ctx.close()
        check(not errors, "no script errors: " + " | ".join(errors[:3]))
        browser.close()
    print(f"{checks[0] - len(failures)}/{checks[0]} checks passed")
    sys.exit(csp_shim.finish(failures))

if __name__ == "__main__":
    main()
