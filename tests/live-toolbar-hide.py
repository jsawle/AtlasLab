"""Checks the lab feature of Atlas 5.0.0-beta.46: a Tools button that hides the toolbar to give the map the whole screen.

Run:  python3 tests/live-toolbar-hide.py [--shots DIR] [--proxy URL]
Needs network access to js.arcgis.com and www.arcgis.com, and Python Playwright with Chromium.
"""
import argparse, functools, glob, http.server, os, pathlib, sys, threading
from playwright.sync_api import sync_playwright
import csp_shim   # waits that work under the app's Content Security Policy; collects what it blocked

HERE = pathlib.Path(__file__).resolve().parent
APP = HERE.parent
READY = "() => { const m = document.querySelector('arcgis-map'); return !!(m && m.view && m.view.ready); }"
STATE = """() => { const vis = (e) => !!e && e.getBoundingClientRect().width > 0; const b = [...document.querySelectorAll('.tools-toggle')].find(vis);
  const stack = [...document.querySelectorAll('.ll-stack')].find(vis), wrap = document.getElementById('mapWrap').getBoundingClientRect();
  return { button: !!b, text: b ? b.innerText.trim() : '', label: b ? b.getAttribute('aria-label') : '', expanded: b ? b.getAttribute('aria-expanded') : '', w: b ? Math.round(b.getBoundingClientRect().width) : 0, h: b ? Math.round(b.getBoundingClientRect().height) : 0,
    toolbar: vis(document.getElementById('tool-save')), gap: stack ? Math.round(wrap.bottom - stack.getBoundingClientRect().bottom) : -1 }; }"""

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
        page = browser.new_page(viewport={"width": 1366, "height": 768})
        page.goto(f"{base}/index.html"); page.wait_for_function(READY, timeout=120000); page.wait_for_timeout(2500)
        s = page.evaluate(STATE)
        check(not s["button"] and s["toolbar"], "the default config has no Tools button: the toolbar is always there")
        page.goto(f"{base}/index.html?config=lab"); page.wait_for_function(READY, timeout=120000); page.wait_for_timeout(2500)
        s0 = page.evaluate(STATE)
        check(s0["button"] and s0["text"] == "Tools" and s0["expanded"] == "true" and s0["label"] == "Hide map tools" and s0["toolbar"], "lab: a Tools button, with its word, sits at the bottom left; the toolbar is showing")
        check(s0["h"] >= 24 and s0["w"] >= 44, "it is big enough to press (%d x %d pixels)" % (s0["w"], s0["h"]))
        page.click(".tools-toggle >> visible=true"); page.wait_for_timeout(700); s1 = page.evaluate(STATE)
        check(not s1["toolbar"] and s1["button"] and s1["expanded"] == "false" and s1["label"] == "Show map tools", "pressing it hides the toolbar; the button stays and now reads Show map tools to a screen reader")
        page.screenshot(path=str(shots / "toolbar-hidden.png"))
        page.keyboard.press("Tab"); page.keyboard.press("Shift+Tab"); page.keyboard.press("Enter"); page.wait_for_timeout(700); s2 = page.evaluate(STATE)
        check(s2["toolbar"] and s2["expanded"] == "true", "pressing it again (here by keyboard) brings the toolbar back")
        page.click(".tools-toggle >> visible=true"); page.wait_for_timeout(400)
        page.evaluate("() => document.getElementById('tool-profile').click()"); page.wait_for_timeout(1500); page.evaluate("() => { const x = document.querySelector('#profilePanel .x-btn'); if (x) x.click(); }"); page.wait_for_timeout(800)
        s3 = page.evaluate(STATE)
        check(not s3["toolbar"] and s3["expanded"] == "false", "hidden stays hidden after the elevation chart has been opened and closed")
        page.click(".tools-toggle >> visible=true"); page.wait_for_timeout(500)
        check(page.evaluate(STATE)["toolbar"], "and the button still brings it back")
        browser.close()
    print(f"{checks[0] - len(failures)}/{checks[0]} checks passed")
    sys.exit(csp_shim.finish(failures))

if __name__ == "__main__":
    main()
