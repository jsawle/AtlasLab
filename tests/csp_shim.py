"""Lets the live tests wait on a page that has a Content Security Policy (5.0.0-beta.38).

Playwright's wait_for_function runs a text expression with eval() inside the page, which the app's policy forbids (as it
should). Wrapping the expression in a function avoids that: Playwright then calls the function and never evals in the page.
Importing this module is enough. It also collects what the policy blocked: csp_shim.blocked is a list of console messages.
"""
import os
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
    return page
for _cls in (Browser, BrowserContext):
    def _new_page(self, *a, _o=_cls.new_page, **k): return _watch(_o(self, *a, **k))
    _cls.new_page = _new_page

def finish(failures):
    """The exit code for a test run: 1 if a check failed or the policy blocked anything (each distinct message is printed)."""
    seen = sorted(set(blocked))
    for t in seen: print("  CSP  " + t, flush=True)
    print("policy blocked nothing" if not seen else "%d kind(s) of request blocked by the policy" % len(seen), flush=True)
    return 1 if (failures or seen) else 0
