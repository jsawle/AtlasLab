"""A partner's config from an ArcGIS Online item (?appid=), and the manager app's preview (?preview=1) (5.0.0-beta.58).

Run:  python3 tests/live-partner.py [--proxy URL] [--axe path/to/axe.min.js]
Needs network access to js.arcgis.com and www.arcgis.com, and Python Playwright with Chromium.

No real partner item exists yet, so the item and its data are answered by the test (Playwright routes) exactly as
ArcGIS Online answers for a public item: the same addresses, the same JSON shape, CORS allowed.
"""
import argparse, functools, glob, http.server, json, os, pathlib, sys, threading, urllib.parse
from playwright.sync_api import sync_playwright
import csp_shim   # waits that work under the app's Content Security Policy; collects what it blocked

HERE = pathlib.Path(__file__).resolve().parent
APP = HERE.parent
READY = "(() => { const m = document.querySelector('arcgis-map'); return !!(m && m.view && m.view.ready); })()"
ID = "0123456789abcdef0123456789abcdef"
MAPMAKER_ORG, OTHER_ORG = "iFGeGXTAJXnjq0YN", "someoneElsesOrg1"
# a 1 x 1 PNG, as the manager keeps a logo: inside the config
LOGO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
CONFIG = {"configVersion": 2, "appName": "Mapas Escolares Panamá", "locale": "es",
          "logo": {"url": LOGO, "alt": "Esri Panamá", "showName": True},
          "theme": {"brand": "#7a1f5c", "header": "#ffffff"},
          "portalUrl": "https://example.com"}

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--proxy", default=os.environ.get("HTTPS_PROXY", "")); ap.add_argument("--axe", default=os.environ.get("ATLAS_AXE", "")); a = ap.parse_args()
    srv = http.server.ThreadingHTTPServer(("localhost", 0), functools.partial(Quiet, directory=csp_shim.served(APP)))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    port = srv.server_port
    base, other = f"http://localhost:{port}", f"http://127.0.0.1:{port}"   # the same server under a second origin
    found = sorted(glob.glob("/opt/pw-browsers/chromium-*/chrome-linux*/chrome"))
    failures, checks = [], [0]
    def check(cond, msg):
        checks[0] += 1; print(("  ok   " if cond else "  FAIL ") + msg, flush=True)
        if not cond: failures.append(msg)
    with sync_playwright() as p:
        launch = {}
        if found: launch["executable_path"] = found[-1]
        if a.proxy: launch["proxy"] = {"server": a.proxy, "bypass": "localhost,127.0.0.1"}
        browser = csp_shim.launch(p, launch)

        def page_with_item(org, keywords=("Web Mapping Application", "AtlasLabPartnerConfig")):
            ctx = browser.new_context(viewport={"width": 1366, "height": 800})
            asked = []
            def answer(route):
                url = route.request.url; asked.append(url)
                body = CONFIG if "/data" in url else {"id": ID, "title": "Mapas Escolares (Panamá)", "orgId": org, "typeKeywords": list(keywords), "access": "public", "modified": 1}
                route.fulfill(status=200, content_type="application/json", headers={"Access-Control-Allow-Origin": "*"}, body=json.dumps(body))
            ctx.route(f"**/sharing/rest/content/items/{ID}**", answer)
            ctx.add_init_script("window.__toasts = []; document.addEventListener('DOMContentLoaded', () => { const t = document.getElementById('toast'); if (t) new MutationObserver(() => { if (t.textContent) window.__toasts.push(t.textContent); }).observe(t, { childList: true, characterData: true, subtree: true }); });")
            return ctx.new_page(), asked

        # 1. ?appid= with an item of the MapMaker organization
        page, asked = page_with_item(MAPMAKER_ORG)
        page.goto(f"{base}/index.html?appid={ID.upper()}"); page.wait_for_function(READY, timeout=120000)
        got = page.evaluate("""() => ({ title: document.title, name: document.getElementById('logoText').textContent, lang: document.documentElement.lang,
          logo: document.getElementById('logoImg').getAttribute('src') || '', logoHidden: document.getElementById('logoImg').hidden, home: document.getElementById('logoLink').getAttribute('href'),
          brand: getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() })""")
        check(got["title"] == CONFIG["appName"] and got["name"] == CONFIG["appName"], "the item's config names the app: %s" % got["title"])
        check(got["lang"] == "es", "and sets its language (es)")
        check(got["logo"].startswith("data:image/png;base64,") and not got["logoHidden"], "a logo kept inside the config is shown")
        check(got["brand"] == "#7a1f5c", "the item's brand colour is used (%s)" % got["brand"])
        check(got["home"] == "./?appid=" + ID, "the logo goes back to the same partner's app: %s" % got["home"])
        check(len([u for u in asked if "/data" in u]) == 1 and len(asked) == 2, "two requests for the item: its details and its data (%d)" % len(asked))
        page.click("#verBtn"); page.wait_for_selector("#versTable tr")
        rows = page.evaluate("() => [...document.querySelectorAll('#versTable tr')].map(r => r.innerText)")
        check(any(("ArcGIS Online item " + ID) in r and "mapmaker" not in r for r in rows), "the versions table says the config is the ArcGIS Online item")
        if a.axe:
            csp_shim.add_axe(page, a.axe)
            res = page.evaluate("async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa'] })).violations.map(v => v.id + ' (' + v.nodes.length + ')')")
            check(not res, "axe: no WCAG 2.1 A/AA problems with a partner's item config open" + ("" if not res else ": " + ", ".join(res)))
        page.context.close()

        # 2. an item from another organization is not used
        page, asked = page_with_item(OTHER_ORG)
        page.goto(f"{base}/index.html?appid={ID}"); page.wait_for_function(READY, timeout=120000); page.wait_for_timeout(1500)
        name = page.evaluate("() => document.title")
        toasts = page.evaluate("window.__toasts")
        check(name == "AtlasLab", "an item from another organization is ignored: the default app opens (%s)" % name)
        check(any(ID in t for t in toasts), "and a message says the config wasn't found")
        page.context.close()

        # 3. an item without the AtlasLab keyword is not used either
        page, asked = page_with_item(MAPMAKER_ORG, keywords=("Web Mapping Application",))
        page.goto(f"{base}/index.html?appid={ID}"); page.wait_for_function(READY, timeout=120000)
        check(page.evaluate("() => document.title") == "AtlasLab", "an item not marked as an AtlasLab config is ignored")
        page.context.close()

        # 4. the manager's preview: a page on our own site frames the app and hands it a config
        draft = dict(CONFIG, appName="Borrador")
        ctx = browser.new_context(viewport={"width": 1366, "height": 800})
        page = ctx.new_page()
        page.goto(f"{base}/tests/fixtures/preview-host.html#" + urllib.parse.quote(json.dumps(draft)))
        frame = page.frame_locator("#frame")
        page.wait_for_function("() => { const f = document.getElementById('frame').contentDocument; return !!(f && f.title === 'Borrador'); }", timeout=60000)
        fr = page.frames[1]
        fr.wait_for_function(READY, timeout=120000)
        check(fr.evaluate("() => document.getElementById('logoText').textContent") == "Borrador", "a preview shows the config the manager hands it")
        check(fr.evaluate("() => document.documentElement.lang") == "es", "in its language")
        check(page.evaluate("() => window.__readyFrom") == [base], "the app says it is ready to the page that framed it")
        ctx.close()

        # 5. a page on any other site can't hand the app a config: after 10 s the default opens
        ctx = browser.new_context(viewport={"width": 1366, "height": 800})
        page = ctx.new_page()
        page.goto(f"{other}/tests/fixtures/preview-host.html?app=" + urllib.parse.quote(f"{base}/index.html") + "#" + urllib.parse.quote(json.dumps(draft)))
        page.wait_for_timeout(2000)
        fr = page.frames[1]
        fr.wait_for_function(READY, timeout=120000)
        check(fr.evaluate("() => document.title") == "AtlasLab", "a config from a page on another site is ignored: the default app opens")
        ctx.close()

        # 6. ?preview=1 when not in a frame: nothing to wait for
        ctx = browser.new_context(viewport={"width": 1366, "height": 800})
        page = ctx.new_page()
        page.goto(f"{base}/index.html?preview=1"); page.wait_for_function(READY, timeout=30000)
        check(page.evaluate("() => document.title") == "AtlasLab", "?preview=1 outside a frame opens the default straight away")
        ctx.close()
        browser.close()
    srv.shutdown()
    print("%d/%d checks passed" % (checks[0] - len(failures), checks[0]), flush=True)
    sys.exit(csp_shim.finish(failures))

if __name__ == "__main__":
    main()
