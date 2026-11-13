"""Checks the security changes of Atlas 5.0.0-beta.38 in a real browser, against the real map library.

Run:  python3 tests/live-security.py [--proxy URL]
Needs network access to js.arcgis.com and www.arcgis.com, and Python Playwright with Chromium.

1. The Content Security Policy: it is on the page, the app runs with nothing blocked, and it stops what it is there to
   stop (script written into the page, script from another site, an inline event handler, plug-ins). Running text as
   script (eval) is allowed, because Esri's chart component needs it and the map library needs WebAssembly: see SECURITY.md.
2. A private item's picture: the sign-in token travels in a request header, never in the address, and never reaches the
   page. There is no real sign-in here: a made-up token is registered with the map library, one item of the group is
   marked as shared with an organisation only, and the picture request is answered by this test.
3. The sign-in pop-up's callback page: it has its own policy and still hands the result to the window that opened it.
"""
import argparse, base64, functools, glob, http.server, json, os, pathlib, re, sys, threading
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
from playwright.sync_api import sync_playwright
import csp_shim   # waits that work under the app's Content Security Policy; collects what it blocked

HERE = pathlib.Path(__file__).resolve().parent
APP = HERE.parent
TOKEN = "TESTONLYTOKEN0123456789"
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==")
READY = "() => { const m = document.querySelector('arcgis-map'); return !!(m && m.view && m.view.ready); }"

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--proxy", default=os.environ.get("HTTPS_PROXY", "")); a = ap.parse_args()
    srv = http.server.ThreadingHTTPServer(("localhost", 0), functools.partial(Quiet, directory=str(APP)))
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
        browser = p.chromium.launch(**launch)
        ctx = browser.new_context(viewport={"width": 1366, "height": 900}); page = ctx.new_page()
        private = {}; thumbs = []
        def search(route):          # the group's first item becomes one shared with an organisation only
            r = route.fetch(); d = r.json()
            if not private and d.get("results"):
                it = next((x for x in d["results"] if x.get("thumbnail")), None)
                if it: private.update(id=it["id"], thumbnail=it["thumbnail"], title=it.get("title"))
            for x in d.get("results", []):
                if x["id"] == private.get("id"): x["access"] = "org"
            route.fulfill(response=r, json=d)
        def info(route):            # a picture request: noted, and the private item's answered here
            q = route.request; thumbs.append({"url": q.url, "auth": q.headers.get("x-esri-authorization", "")})
            if private and ("/items/" + private["id"] + "/") in q.url:
                if q.headers.get("x-esri-authorization") == "Bearer " + TOKEN and "token" not in q.url.lower():
                    route.fulfill(status=200, content_type="image/png", body=PNG, headers={"access-control-allow-origin": "*"})
                else: route.fulfill(status=403, content_type="application/json", body="{}", headers={"access-control-allow-origin": "*"})
            else: route.continue_()
        def untoken(route):         # the map library adds the made-up token to its own requests: taken off, so the real server answers
            u = urlsplit(route.request.url)
            if "token=" + TOKEN in u.query: route.continue_(url=urlunsplit(u._replace(query=urlencode([kv for kv in parse_qsl(u.query) if kv[0] != "token"]))))
            else: route.fallback()
        page.route("**/sharing/rest/**", untoken)
        page.route(re.compile(r"/sharing/rest/content/groups/[0-9a-f]+/search"), search)
        page.route(re.compile(r"/sharing/rest/content/items/[0-9a-f]+/info/"), info)

        print("== the Content Security Policy, in ordinary use")
        page.goto(f"{base}/index.html?config=test"); page.wait_for_function(READY, timeout=120000); page.wait_for_timeout(1500)
        pol = page.evaluate("() => { const m = document.querySelector('meta[http-equiv=\"Content-Security-Policy\"]'); return m ? m.content : ''; }")
        dirs = {d.split()[0]: d.split()[1:] for d in [x.strip() for x in pol.split(";")] if d}
        check(bool(pol) and page.evaluate("() => { const m = document.querySelector('meta[http-equiv=\"Content-Security-Policy\"]'); return [...document.head.children].indexOf(m) <= 1; }"), "the page has a policy, placed before anything it loads")
        ss = dirs.get("script-src", [])
        check("'unsafe-inline'" not in ss and "https:" not in ss and "*" not in ss and set(ss) == {"'self'", "'unsafe-eval'", "https://js.arcgis.com"}, "script may come from the app and the map library only: " + " ".join(ss))
        check(dirs.get("object-src") == ["'none'"] and dirs.get("base-uri") == ["'self'"] and dirs.get("form-action") == ["'self'"] and dirs.get("default-src") == ["'self'"], "plug-ins are off; the base address and form targets are held to the app")
        page.click("#tool-open"); page.wait_for_selector("#omList .cat-card", timeout=120000); page.wait_for_timeout(2500)
        check(not csp_shim.blocked, "the map and the Open map window load with nothing blocked" + (": " + "; ".join(sorted(set(csp_shim.blocked)))[:400] if csp_shim.blocked else ""))

        print("== a private item's picture")
        check(bool(private), "one item of the group is marked private for this test: " + str(private.get("title")))
        CARD = """(id) => { const out = []; for (const c of document.querySelectorAll('#omList .cat-card')) { const th = c.querySelector('.cat-thumb'); out.push(th ? th.style.backgroundImage : ''); }
          return { n: out.length, withId: out.filter(b => b.includes(id)), blobs: out.filter(b => b.startsWith('url("blob:')).length, plain: out.filter(b => b.startsWith('url("https://www.arcgis.com/')).length }; }"""
        c0 = page.evaluate(CARD, private["id"])
        check(c0["plain"] >= c0["n"] - 1 and c0["plain"] > 3 and not c0["withId"] and c0["blobs"] == 0 and not any(private["id"] in t["url"] for t in thumbs),
              "signed out: public items show their pictures (%d of %d); the private one is not asked for" % (c0["plain"], c0["n"]))
        page.evaluate("""async (tok) => { const [IM] = await $arcgis.import(["@arcgis/core/identity/IdentityManager.js"]); IM.registerToken({ server: "https://www.arcgis.com/sharing/rest", token: tok }); }""", TOKEN)
        page.click("#omBrowser .cat-dims button[data-dim='2d']"); page.wait_for_timeout(600); page.click("#omBrowser .cat-dims button[data-dim='all']")
        page.wait_for_function("() => [...document.querySelectorAll('#omList .cat-thumb')].some(t => t.style.backgroundImage.startsWith('url(\"blob:'))", timeout=30000)
        mine = [t for t in thumbs if private["id"] in t["url"]]
        check(len(mine) == 1 and mine[0]["auth"] == "Bearer " + TOKEN, "with a token, the private picture is asked for once, the token in a request header")
        check(mine and "token" not in mine[0]["url"].lower() and "?" not in mine[0]["url"], "and its address carries no token: " + (mine[0]["url"].replace("https://www.arcgis.com/sharing/rest", "…") if mine else ""))
        check(all(not t["auth"] for t in thumbs if private["id"] not in t["url"]) and not any(TOKEN in t["url"] for t in thumbs), "public pictures are asked for with no token at all (%d requests)" % len(thumbs))
        c1 = page.evaluate(CARD, private["id"])
        check(c1["blobs"] == 1 and not c1["withId"], "the card shows the picture from an address that holds no token (blob:)")
        blob = page.evaluate("() => { const t = [...document.querySelectorAll('#omList .cat-thumb')].find(t => t.style.backgroundImage.startsWith('url(\"blob:')); return t.style.backgroundImage.slice(5, -2); }")
        check(page.evaluate("async (u) => { const r = await fetch(u); const b = await r.blob(); return b.type + ' ' + b.size; }", blob) == "image/png %d" % len(PNG), "that address holds the picture")
        check(TOKEN not in page.evaluate("() => document.documentElement.outerHTML"), "the token is nowhere in the page")
        page.click("#omBrowser .cat-dims button[data-dim='2d']"); page.wait_for_timeout(500); page.click("#omBrowser .cat-dims button[data-dim='all']"); page.wait_for_timeout(1200)
        check(len([t for t in thumbs if private["id"] in t["url"]]) == 1 and page.evaluate(CARD, private["id"])["blobs"] == 1, "showing the list again reuses the picture: no second request")
        page.keyboard.press("Escape"); page.wait_for_timeout(300)
        page.evaluate("() => document.getElementById('signOutBtn').click()"); page.wait_for_timeout(800)
        gone = page.evaluate("async (u) => { try { await fetch(u); return 'still there'; } catch (e) { return 'gone'; } }", blob)
        left = page.evaluate("""async () => { const [IM] = await $arcgis.import(["@arcgis/core/identity/IdentityManager.js"]); return !!IM.findCredential("https://www.arcgis.com/sharing"); }""")
        check(gone == "gone" and not left, "signing out forgets the token and the private picture")
        normal = sorted(set(csp_shim.blocked))
        check(not normal, "nothing was blocked by the policy in all of that" + (": " + "; ".join(normal)[:400] if normal else ""))

        print("== what the policy stops")
        page.evaluate("""() => { window.__blocked = []; document.addEventListener('securitypolicyviolation', (e) => window.__blocked.push(e.effectiveDirective + ' ' + (e.blockedURI || ''))); }""")
        r = page.evaluate("""async () => { const out = {};
          const s = document.createElement('script'); s.textContent = 'window.__inline = 1'; document.head.appendChild(s); out.inline = window.__inline === 1;
          const d = document.createElement('div'); d.innerHTML = '<img src="data:image/png;base64,AAAA" onerror="window.__handler = 1">'; document.body.appendChild(d);
          const x = document.createElement('script'); x.src = 'https://example.com/x.js'; document.head.appendChild(x);
          const o = document.createElement('object'); o.data = 'https://example.com/x.swf'; document.body.appendChild(o);
          await new Promise(r => setTimeout(r, 1500)); out.handler = window.__handler === 1; d.remove(); o.remove(); out.blocked = window.__blocked; return out; }""")
        check(r["inline"] is False, "script written into the page does not run")
        check(r["handler"] is False, "an event handler written into markup does not run")
        check(any(b.startswith("script-src-elem https://example.com") for b in r["blocked"]), "script from another site is refused")
        check(any(b.startswith("object-src") for b in r["blocked"]), "plug-in content is refused")

        print("== the sign-in pop-up's callback page")
        cb = (APP / "oauth-callback.html").read_text()
        m = re.search(r'http-equiv="Content-Security-Policy" content="([^"]+)"', cb)
        check(bool(m) and "default-src 'none'" in m.group(1) and "script-src 'self'" in m.group(1) and "unsafe" not in m.group(1), "it has its own policy: nothing but its one script: " + (m.group(1) if m else ""))
        check(not re.search(r"<script(?![^>]*\bsrc=)", cb) and "onload=" not in cb, "and no script written in the page itself")
        page2 = ctx.new_page(); page2.goto(f"{base}/tests/fixtures/opener.html")
        got = page2.evaluate("""() => new Promise((res) => { const seen = {};
          addEventListener('arcgis:auth:hash', (e) => { seen.hash = e.detail; });
          addEventListener('arcgis:auth:location:search', (e) => { seen.search = e.detail; });
          const a = window.open('../../oauth-callback.html#state=test-only&error=none', 'cb1', 'width=300,height=200');
          setTimeout(() => { const b = window.open('../../oauth-callback.html?code=test-only', 'cb2', 'width=300,height=200');
            setTimeout(() => res({ seen, closed: a.closed && b.closed }), 2500); }, 1500); })""")
        check(got["seen"].get("hash") == "#state=test-only&error=none" and got["seen"].get("search") == "?code=test-only", "it hands the sign-in result to the window that opened it: " + json.dumps(got["seen"]))
        check(got["closed"], "and closes itself")
        browser.close()
    print(f"{checks[0] - len(failures)}/{checks[0]} checks passed")
    sys.exit(1 if failures else 0)

if __name__ == "__main__":
    main()
