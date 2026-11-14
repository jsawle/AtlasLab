"""Checks that "Save a locked copy" is off unless a config turns it on (Atlas 5.0.0-beta.43).

Run:  python3 tests/live-lock.py [--proxy URL]
Needs network access to js.arcgis.com and www.arcgis.com, and Python Playwright with Chromium.

The Save panel offers Save and Save as. The third tile, Save a locked copy, is hidden by default; a config that sets
features.lockedCopy brings it back. (A file already saved as locked is still respected: that is in lib/doc.js and src/session.js.)
"""
import argparse, functools, glob, http.server, json, os, pathlib, sys, threading
from playwright.sync_api import sync_playwright
import csp_shim   # waits that work under the app's Content Security Policy; collects what it blocked

HERE = pathlib.Path(__file__).resolve().parent
APP = HERE.parent
READY = "() => { const m = document.querySelector('arcgis-map'); return !!(m && m.view && m.view.ready); }"
TILES = "() => Object.fromEntries(['saveTile', 'saveAsTile', 'lockTile'].map((id) => { const e = document.getElementById(id); return [id, !!e && !e.hidden && e.getBoundingClientRect().width > 0]; }))"

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--proxy", default=os.environ.get("HTTPS_PROXY", "")); a = ap.parse_args()
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
        page = browser.new_page(viewport={"width": 1366, "height": 800})
        for cfg in ("", "?config=lab", "?config=mapmaker"):
            page.goto(f"{base}/index.html{cfg}"); page.wait_for_function(READY, timeout=120000); page.wait_for_timeout(800)
            page.click("#tool-save"); page.wait_for_timeout(600); t = page.evaluate(TILES)
            check(t["saveTile"] and t["saveAsTile"] and not t["lockTile"], "%s: the Save panel offers Save and Save as, and no locked copy" % (cfg or "the default config"))
        def on(route):      # the lab config, with the switch turned on
            r = route.fetch(); d = r.json(); d.setdefault("features", {})["lockedCopy"] = True; route.fulfill(response=r, body=json.dumps(d))
        page.route("**/config/lab.json*", on)
        page.goto(f"{base}/index.html?config=lab"); page.wait_for_function(READY, timeout=120000); page.wait_for_timeout(800)
        page.click("#tool-save"); page.wait_for_timeout(600); t = page.evaluate(TILES)
        check(t["saveTile"] and t["saveAsTile"] and t["lockTile"], "a config that sets features.lockedCopy brings Save a locked copy back")
        browser.close()
    print(f"{checks[0] - len(failures)}/{checks[0]} checks passed")
    sys.exit(csp_shim.finish(failures))

if __name__ == "__main__":
    main()
