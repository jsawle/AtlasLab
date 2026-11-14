"""Lets the live tests wait on a page that has a Content Security Policy (5.0.0-beta.38).

Playwright's wait_for_function runs a text expression with eval() inside the page, which the app's policy forbids (as it
should). Wrapping the expression in a function avoids that: Playwright then calls the function and never evals in the page.
Importing this module is enough. It also collects what the policy blocked: csp_shim.blocked is a list of console messages.
"""
import os, shutil
from playwright.sync_api import Page, Browser, BrowserContext

blocked = []

_wait = Page.wait_for_function
def _wait_for_function(self, expression, *args, **kwargs):
    wrapped = "(a) => { const v = (" + expression + "\n); return typeof v === 'function' ? v(a) : v; }"
    return _wait(self, wrapped, *args, **kwargs)
Page.wait_for_function = _wait_for_function

def _watch(page):
    def on(m):
        try: t = m.text
        except Exception: return
        if "Content Security Policy" in t: blocked.append(t.replace("\n", " ")[:500])
        if os.environ.get("CONSOLE_LOG") and m.type in ("error", "warning"): open(os.environ["CONSOLE_LOG"], "a").write(m.type + " | " + t.replace("\n", " ")[:500] + "\n")
    page.on("console", on)
    if os.environ.get("CI"): page.set_default_timeout(120000)      # CI machines have no graphics card: a heavy 3D scene can hold the page up for a long while
    if os.environ.get("CONSOLE_LOG"):
        log = lambda t: open(os.environ["CONSOLE_LOG"], "a").write(t[:400] + "\n")
        page.on("requestfailed", lambda r: log("request failed | " + str(r.failure) + " | " + r.url))
        page.on("response", lambda r: log("response %d | %s" % (r.status, r.url)) if r.status >= 400 else None)
    if os.environ.get("CONSOLE_LOG"): page.on("pageerror", lambda e: open(os.environ["CONSOLE_LOG"], "a").write("pageerror | " + str(getattr(e, "stack", "") or e)[:1500].replace("\n", " <- ") + "\n"))
    return page
for _cls in (Browser, BrowserContext):
    def _new_page(self, *a, _o=_cls.new_page, **k): return _watch(_o(self, *a, **k))
    _cls.new_page = _new_page

_goto = Page.goto
def _go(self, url, **k):      # the page's load waits for the map library from Esri's servers: allow 90 s, not Playwright's 30
    k.setdefault("timeout", 90000); return _goto(self, url, **k)
Page.goto = _go

_shot = Page.screenshot
def _screenshot(self, *a, **k):      # a busy 3D scene on a small machine can take longer than Playwright's 30 s to give a picture
    try: return _shot(self, *a, **k)
    except Exception as e:
        if "Timeout" not in str(e): raise
        print("  (screenshot was slow: trying again with longer)", flush=True); k["timeout"] = 120000; return _shot(self, *a, **k)
Page.screenshot = _screenshot

_new_context = Browser.new_context
def _context(self, *a, **k):      # clipboard permissions are Chromium's: the other browsers refuse the names
    if (os.environ.get("ATLAS_BROWSER") or "chromium").lower() != "chromium": k.pop("permissions", None)
    return _new_context(self, *a, **k)
Browser.new_context = _context

def finish(failures):
    """The exit code for a test run: 1 if a check failed or the policy blocked anything (each distinct message is printed)."""
    seen = sorted(set(blocked))
    for t in seen: print("  CSP  " + t, flush=True)
    print("policy blocked nothing" if not seen else "%d kind(s) of request blocked by the policy" % len(seen), flush=True)
    return 1 if (failures or seen) else 0

def served(app):
    """The folder a live test serves: the source as it stands, or the built copy when ATLAS_SERVE names one (CI: dist)."""
    d = os.environ.get("ATLAS_SERVE")
    if not d: return str(app)
    d = os.path.abspath(d)
    if not os.path.isfile(os.path.join(d, "index.html")): raise SystemExit("ATLAS_SERVE=%s has no index.html: run npm run build first" % d)
    fx = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")      # the tests' own pages go beside it (the published copy never has them)
    shutil.copytree(fx, os.path.join(d, "tests", "fixtures"), dirs_exist_ok=True)
    print("serving the built app from " + d, flush=True)
    return d

def launch(p, options):
    """Starts the browser a live test runs in. Chromium unless ATLAS_BROWSER says firefox or webkit (used in CI).
    The options are the test's own, written for Chromium: its program path and switches are left off for the others."""
    name = (os.environ.get("ATLAS_BROWSER") or "chromium").lower()
    if name == "chromium": return p.chromium.launch(**options)
    if name not in ("firefox", "webkit"): raise SystemExit("ATLAS_BROWSER must be chromium, firefox or webkit")
    opts = {k: v for k, v in options.items() if k not in ("executable_path", "args")}
    if name == "firefox":      # no WebGL when headless on a machine with no graphics card: with a screen (xvfb in CI) it draws in software
        opts["firefox_user_prefs"] = {"webgl.force-enabled": True, "webgl.disabled": False}
        if os.environ.get("DISPLAY"): opts["headless"] = False
    print("running in " + name, flush=True)
    return getattr(p, name).launch(**opts)
