"""Checks the two lab features of Atlas 5.0.0-beta.44: tool tips with their Tips switch, and a lesson's questions beside the map.

Run:  python3 tests/live-tips-questions.py [--shots DIR] [--proxy URL]
Needs network access to js.arcgis.com and www.arcgis.com, and Python Playwright with Chromium.

Tool tips (features.toolTips): resting the pointer on a tool for about a second shows one line on what it does; a
quick click never sees it; the keyboard gets it on focus; the Tips switch turns them off and the choice is kept.
Lesson questions (features.lessonQuestions): a map whose description has a heading "Questions" gets a Questions button
and its questions open beside the map. The map used is real; its description is given a Questions list by this test.
Neither feature shows in the default config.
"""
import argparse, functools, glob, http.server, json, os, pathlib, re, sys, threading
from playwright.sync_api import sync_playwright
import csp_shim   # waits that work under the app's Content Security Policy; collects what it blocked

HERE = pathlib.Path(__file__).resolve().parent
APP = HERE.parent
QUAKES = "85997c9571e74256af71dc20566b47f1"
READY = "() => { const m = document.querySelector('arcgis-map'); return !!(m && m.view && m.view.ready); }"
TIP = "() => { const t = document.getElementById('tileTip'); return t.hidden ? '' : t.textContent; }"
EXTRA = "<p><b>Questions</b></p><ol><li>Where do most large earthquakes happen?</li><li>How does that pattern compare with the plate boundaries?</li><li>Which places with many people are close to them?</li></ol><p><b>Links</b></p><ul><li>Not a question</li></ul>"

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
        ctx = browser.new_context(viewport={"width": 1366, "height": 768}); page = ctx.new_page()
        mid = lambda sel: page.evaluate("(s) => { const r = document.querySelector(s).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }", sel)

        print("== the default config has neither")
        page.goto(f"{base}/index.html?webmap={QUAKES}"); page.wait_for_function(READY, timeout=120000); page.wait_for_timeout(6000)
        page.mouse.move(*mid("#tool-legend")); page.wait_for_timeout(1500)
        check(page.is_hidden("#tipsBtn") and page.evaluate(TIP) == "" and page.get_attribute("#tool-legend", "title") == "Legend", "no Tips switch, and a tool's tooltip is its name")
        check(page.is_hidden("#questionsBtn"), "no Questions button")

        print("== tool tips (lab)")
        page.mouse.move(5, 5); page.goto(f"{base}/index.html?config=lab"); page.wait_for_function(READY, timeout=120000); page.wait_for_timeout(2500)
        check(page.is_visible("#tipsBtn") and page.inner_text("#tipsBtn") == "Tips: on" and page.get_attribute("#tipsBtn", "aria-pressed") == "true", "the Tips switch is beside the version button, and on")
        page.mouse.move(*mid("#tool-legend")); page.wait_for_timeout(350)
        check(page.evaluate(TIP) == "", "nothing shows in the first moment on a tool")
        page.wait_for_timeout(1100); tip = page.evaluate(TIP)
        check(tip == "The key: what the colours and symbols on the map mean." and not page.get_attribute("#tool-legend", "title"), "after about a second it says what the tool does, in place of the browser's own tooltip: " + tip)
        page.screenshot(path=str(shots / "tips-legend.png"))
        page.mouse.move(*mid("#tool-measure")); page.wait_for_timeout(300); page.mouse.click(*mid("#tool-measure")); page.wait_for_timeout(1300)
        check(page.evaluate(TIP) == "" and page.is_visible("#measurePanel"), "a quick click opens the tool and never sees a tip")
        page.keyboard.press("Escape"); page.mouse.move(5, 5); page.wait_for_timeout(300)
        page.focus("#tool-open"); page.keyboard.press("Tab"); page.wait_for_timeout(300)
        check(page.evaluate(TIP) == "Turn layers on and off, change their order, filter them and see their tables." and page.get_attribute("#tool-layers", "aria-describedby") == "tip-tool-layers", "by keyboard the tip shows on focus, and is the tool's description for a screen reader")
        page.keyboard.press("Escape"); page.wait_for_timeout(200)
        check(page.evaluate(TIP) == "", "Escape takes it away")
        names = page.evaluate("() => ['tool-basemaps','tool-open','tool-layers','tool-add','tool-legend','tool-measure','tool-profile','tool-sketch','tg2d','tg3d','tool-bookmarks','tool-save'].map((id) => (document.getElementById('tip-' + id) || {}).textContent || '')")
        check(all(len(x) > 10 for x in names) and max(len(x) for x in names) <= 90, "all twelve tools have a tip of one short line (longest %d characters)" % max(len(x) for x in names))
        page.click("#tipsBtn"); page.wait_for_timeout(200); page.mouse.move(*mid("#tool-legend")); page.wait_for_timeout(1400)
        check(page.inner_text("#tipsBtn") == "Tips: off" and page.evaluate(TIP) == "" and page.get_attribute("#tool-legend", "title") == "Legend" and not page.get_attribute("#tool-layers", "aria-describedby"), "Tips: off stops them, and the tool's tooltip is its name again")
        page.mouse.move(5, 5); page.reload(); page.wait_for_function(READY, timeout=120000); page.wait_for_timeout(1500)
        check(page.inner_text("#tipsBtn") == "Tips: off", "the choice is kept when the page is opened again")
        page.click("#tipsBtn")

        print("== lesson questions (lab)")
        def item(route):      # the real item, with a Questions list added to its description
            r = route.fetch(); d = r.json()
            if "description" in d: d["description"] = (d.get("description") or "") + EXTRA
            route.fulfill(response=r, body=json.dumps(d))
        page.route(re.compile(r"/sharing/rest/content/items/%s\?" % QUAKES), item)
        page.goto(f"{base}/index.html?config=lab&webmap={QUAKES}"); page.wait_for_function(READY, timeout=120000); page.wait_for_timeout(7000)
        qs = page.evaluate("() => [...document.querySelectorAll('#questionsList li')].map((l) => l.textContent)")
        check(page.is_visible("#questionsBtn") and page.is_visible("#questionsPanel"), "a map with a Questions heading shows a Questions button, and its questions open with the map")
        check(len(qs) == 3 and qs[0] == "Where do most large earthquakes happen?" and "Not a question" not in " ".join(qs), "the three questions under the heading are listed, and nothing from the next heading: " + " | ".join(qs))
        lead = page.inner_text("#questionsLead")
        check(lead.endswith("?") or page.is_hidden("#questionsLead"), "the map's summary leads when it is a question: " + (lead or "(not a question, so not shown)"))
        page.screenshot(path=str(shots / "questions-panel.png"))
        page.click("#questionsPanel .x-btn"); page.wait_for_timeout(400)
        check(page.is_hidden("#questionsPanel") and page.is_visible("#questionsBtn") and page.get_attribute("#questionsBtn", "aria-expanded") == "false", "closing it leaves the button to bring it back")
        page.click("#questionsBtn"); page.wait_for_timeout(400); page.click("#questionsMore"); page.wait_for_timeout(600)
        check(page.is_visible("#infoModal"), "About this map opens from the panel")
        page.keyboard.press("Escape"); page.unroute(re.compile(r"/sharing/rest/content/items/%s\?" % QUAKES))
        page.goto(f"{base}/index.html?config=lab"); page.wait_for_function(READY, timeout=120000); page.wait_for_timeout(2500)
        check(page.is_hidden("#questionsBtn") and page.is_hidden("#questionsPanel"), "a map with no description has no Questions button")
        browser.close()
    print(f"{checks[0] - len(failures)}/{checks[0]} checks passed")
    sys.exit(csp_shim.finish(failures))

if __name__ == "__main__":
    main()
