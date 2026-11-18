"""Phones (Small screens and zoom 1.1, 5.0.0-beta.76), in Chromium against the real services.

Run:  python3 tests/live-phone.py [--shots DIR] [--proxy URL] [--axe FILE]
Needs network access to js.arcgis.com, cdn.arcgis.com and www.arcgis.com, and Python Playwright with Chromium.

An iPhone-sized page with touch, on the earthquakes map. Checks: upright, a pop-up docks at the bottom and ends above
the toolbar ("1 of N" can be seen), the compass stands aside while it is open and comes back after; the compass and
scale bar sit above the toolbar, in 2D and 3D; opening a layer's table closes Map layers. On its side, the pop-up docks
too, with its heading inside the map, and tapping the map away from a feature closes it. An upright iPad is unchanged:
its pop-up floats beside the feature and the view keeps no padding.
"""
import argparse, functools, glob, http.server, json, os, pathlib, sys, threading
from playwright.sync_api import sync_playwright
import csp_shim   # waits that work under the app's Content Security Policy; collects what it blocked

HERE = pathlib.Path(__file__).resolve().parent
APP = HERE.parent
QUAKES = "85997c9571e74256af71dc20566b47f1"
IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
IPAD = "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
READY = "document.querySelector('arcgis-map') && document.querySelector('arcgis-map').view && document.querySelector('arcgis-map').view.ready"
# the view on screen, its pop-up, the toolbar and the compass/scale bar stack
STATE = r"""(() => { const el = document.querySelector('arcgis-map');
  const v = el.view, p = v.popup, r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return b.width ? [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)] : null; };
  const deep = (root, out = []) => { for (const e of root.querySelectorAll('*')) { out.push(e); if (e.shadowRoot) deep(e.shadowRoot, out); } return out; };
  const all = deep(document), own = (e) => [...e.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim();
  const pager = all.filter(e => /^\d+ of \d+$/.test(own(e)) && e.getClientRects().length).map(r)[0] || null;
  const title = p && p.visible && p.title ? all.filter(e => own(e) === p.title.trim() && e.getClientRects().length).map(r)[0] || null : null;
  const st = el.querySelector('.ll-stack');
  return { popup: !!(p && p.visible), dock: p && p.visible ? p.currentDockPosition || null : null, pager, title, toolbar: r(document.querySelector('.toolbar')),
    stack: r(st), stackShown: !!st && getComputedStyle(st).visibility !== 'hidden', pad: (v.padding && v.padding.bottom) || 0, view: r(el) }; })()"""
QUAKE_AT = r"""(async () => { const m = document.querySelector('arcgis-map'), v = m.view, r = m.getBoundingClientRect();
  const fl = v.map.allLayers.find(l => l.type === 'feature' && l.visible); const lv = await v.whenLayerView(fl); const q = lv.createQuery(); q.geometry = v.extent; q.returnGeometry = true;
  const fs = (await lv.queryFeatures(q)).features; const tb = document.querySelector('.toolbar').getBoundingClientRect();
  const out = []; for (const f of fs) { const s = v.toScreen(f.geometry); if (!s) continue; const x = r.left + s.x, y = r.top + s.y;
    if (x > 70 && y > r.top + 50 && x < innerWidth - 70 && y < tb.top - 40) out.push([x, y]); if (out.length >= 6) break; } return out; })()"""
AXE = "axe.run('#app', { runOnly: ['wcag2a','wcag2aa','wcag21a','wcag21aa'] }).then(r => r.violations.map(v => v.id + ': ' + v.nodes.map(n => n.target.join(' ')).slice(0,3).join(', ')))"

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def overlaps(a, b): return bool(a and b and not (a[2] <= b[0] + 1 or b[2] <= a[0] + 1 or a[3] <= b[1] + 1 or b[3] <= a[1] + 1))

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
        def open_page(w, h, ua):
            ctx = browser.new_context(viewport={"width": w, "height": h}, has_touch=True, is_mobile=True, user_agent=ua, device_scale_factor=2)
            page = ctx.new_page(); page.on("pageerror", lambda e: errors.append(str(e)[:300]))
            page.goto(f"{base}/index.html?config=mapmaker&webmap={QUAKES}"); page.wait_for_function(READY, timeout=120000); page.wait_for_timeout(9000)
            return ctx, page
        def tap_quake(page):   # a few earthquakes on screen, until one opens its pop-up (a symbol not yet drawn can't be tapped)
            for pt in page.evaluate(QUAKE_AT) or []:
                page.touchscreen.tap(pt[0], pt[1])
                try: page.wait_for_function("document.querySelector('arcgis-map').view.popup && document.querySelector('arcgis-map').view.popup.visible", timeout=8000)
                except Exception: continue
                page.wait_for_timeout(3000); return True
            return False

        print("== an upright phone")
        ctx, page = open_page(393, 852, IPHONE)
        s = page.evaluate(STATE)
        check(s["stack"] and not overlaps(s["stack"], s["toolbar"]), "the compass and scale bar sit above the toolbar: %s / %s" % (s["stack"], s["toolbar"]))
        check(s["pad"] > 0, "the map's working area stops above the toolbar (view padding %d)" % s["pad"])
        if a.axe:
            csp_shim.add_axe(page, a.axe); v = page.evaluate(AXE); check(not v, "no WCAG 2.1 A/AA violations (axe-core): " + "; ".join(v))
        ok = tap_quake(page); s = page.evaluate(STATE)
        check(ok and s["dock"] and s["dock"].startswith("bottom"), "tapping an earthquake opens its pop-up docked at the bottom: " + str(s["dock"]))
        check(s["pager"] and s["toolbar"] and s["pager"][3] <= s["toolbar"][1], "the pop-up ends above the toolbar: its \"1 of N\" can be seen (%s, toolbar top %s)" % (s["pager"], s["toolbar"] and s["toolbar"][1]))
        check(not s["stackShown"], "the compass stands aside while the pop-up is open")
        page.screenshot(path=str(shots / "phone-popup.png"))
        page.evaluate("document.querySelector('arcgis-map').view.closePopup()"); page.wait_for_timeout(1200)
        check(page.evaluate(STATE)["stackShown"], "and comes back when it closes")
        page.locator("#tool-layers").tap(); page.wait_for_selector("#layersPanel:not([hidden])"); page.wait_for_timeout(1200)
        page.locator("#layersPanel .lt[data-key$=':table']").first.tap(); page.wait_for_timeout(5000)
        check(page.is_visible("#tableDock") and page.is_hidden("#layersPanel"), "opening a layer's table closes Map layers, so the map can be seen")
        page.screenshot(path=str(shots / "phone-table.png"))
        page.locator("#tableClose").tap(); page.wait_for_timeout(1200)
        page.locator("#tg3d").scroll_into_view_if_needed(); page.locator("#tg3d").tap()
        page.wait_for_function("(() => { const s = document.querySelector('arcgis-scene'); return !!(s && s.view && s.view.ready); })()", timeout=120000); page.wait_for_timeout(9000)
        st3 = page.evaluate("""(() => { const s = document.querySelector('arcgis-scene'), st = s.querySelector('.ll-stack'), r = (e) => { const b = e.getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)]; };
          return { stack: st ? r(st) : null, toolbar: r(document.querySelector('.toolbar')) }; })()""")
        check(st3["stack"] and not overlaps(st3["stack"], st3["toolbar"]), "in 3D the compass is off the toolbar too: %s / %s" % (st3["stack"], st3["toolbar"]))
        page.screenshot(path=str(shots / "phone-3d.png"))
        ctx.close()

        print("== a phone on its side")
        ctx, page = open_page(852, 393, IPHONE)
        ok = tap_quake(page); s = page.evaluate(STATE)
        check(ok and bool(s["dock"]), "the pop-up docks (the map is too short for one beside the feature): " + str(s["dock"]))
        check(s["pager"] and s["view"] and s["pager"][1] >= s["view"][1] and s["pager"][3] <= s["toolbar"][1], "its heading (\"1 of N\") is inside the map, not cut off at the top: %s in %s" % (s["pager"], s["view"]))
        page.screenshot(path=str(shots / "phone-landscape-popup.png"))
        page.touchscreen.tap(60, s["view"][1] + 90 if s["view"] else 150); page.wait_for_timeout(2500)
        check(not page.evaluate(STATE)["popup"], "tapping the map away from a feature closes it")
        ctx.close()

        print("== an upright iPad: as before")
        ctx, page = open_page(820, 1180, IPAD)
        ok = tap_quake(page); s = page.evaluate(STATE)
        check(ok and not s["dock"] and s["pad"] == 0, "the pop-up floats beside the feature and the view keeps no padding: dock %s, padding %d" % (s["dock"], s["pad"]))
        ctx.close()
        check(not errors, "no script errors: " + " | ".join(errors[:3]))
        browser.close()
    print(f"{checks[0] - len(failures)}/{checks[0]} checks passed")
    sys.exit(csp_shim.finish(failures))

if __name__ == "__main__":
    main()
