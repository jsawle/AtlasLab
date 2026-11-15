"""Runs the plain Filter panel (features.plainFilter, Filter 1.3; in the main app since 5.0.0-beta.64) in Chromium against the real services:
the ArcGIS Maps SDK from Esri's CDN, ArcGIS Online, and MapMaker's "Major Earthquakes (1950-2023)" map.

Run:  python3 tests/live-filter-plain.py [--shots DIR] [--proxy URL] [--axe FILE]

Checks: the heading names the layer; each box has a label that can be seen, and the box's own name starts with those
words; a short list of conditions with More, which shows them all; the chart is called "Chart of values", says what
its bars are and marks the average, and the slider shows its value; the filter is said back as a sentence with its
count; two conditions joined with "and"/"or"; "has no value"; no WCAG A/AA violations; and config/classic.json still gives the panel as it was.
"""
import argparse, functools, glob, http.server, json, os, pathlib, re, sys, threading
from playwright.sync_api import sync_playwright
import csp_shim   # waits that work under the app's Content Security Policy; collects what it blocked

HERE = pathlib.Path(__file__).resolve().parent
APP = HERE.parent
QUAKES = "85997c9571e74256af71dc20566b47f1"
SPEC_ROOT = {"operationalLayers", "baseMap", "spatialReference", "version", "authoringApp", "authoringAppVersion", "initialState", "bookmarks", "presentation", "atlasLocked"}
CSV = "Site,Latitude,Longitude,Area,Plastic,Glass,Metal\nMarket St,32.7115,-117.1601,Street,12,3,4\nIsland Ave,32.7098,-117.1585,Park,5,8,2\nJ St,32.7076,-117.1612,Street,9,1,7\nK St,32.7066,-117.1590,Park,2,2,1\n"
AXE = "axe.run('#filterPanel', { runOnly: ['wcag2a','wcag2aa','wcag21a','wcag21aa'] }).then(r => r.violations.map(v => v.id + ': ' + v.nodes.map(n => n.target.join(' ')).slice(0,3).join(', ')))"

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
        checks[0] += 1
        print(("  ok   " if cond else "  FAIL ") + msg)
        if not cond: failures.append(msg)

    with sync_playwright() as p:
        launch = {"args": ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]}
        if chrome: launch["executable_path"] = chrome
        if a.proxy: launch["proxy"] = {"server": a.proxy, "bypass": "localhost,127.0.0.1"}
        browser = csp_shim.launch(p, launch)
        ctx = browser.new_context(viewport={"width": 1366, "height": 768}, accept_downloads=True)
        ctx.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker;")   # saves become downloads the test can read
        page = ctx.new_page(); errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.on("dialog", lambda d: d.accept())

        # ---- helpers: Calcite and SDK components are set the way a person's input sets them (value, then the component's event)
        def select(part, value, card=0):
            page.evaluate("""([part, value, card]) => { const s = document.querySelectorAll('#filterConds .flt-cond')[card].querySelector('[data-part="' + part + '"]'); s.value = value; s.dispatchEvent(new CustomEvent('calciteSelectChange')); }""", [part, value, card])
            page.wait_for_timeout(600)
        def type_number(value, card=0, part="value"):
            page.evaluate("""([value, card, part]) => { const n = document.querySelectorAll('#filterConds .flt-cond')[card].querySelector('[data-part="' + part + '"]'); n.value = value; n.dispatchEvent(new CustomEvent('calciteInputNumberInput')); }""", [value, card, part])
        def type_text(value, card=0):
            page.evaluate("""([value, card]) => { const n = document.querySelectorAll('#filterConds .flt-cond')[card].querySelector('[data-part="value"]'); n.value = value; n.dispatchEvent(new CustomEvent('calciteInputTextInput')); }""", [value, card])
        def val(part, card=0):
            return page.evaluate("""([part, card]) => { const c = document.querySelectorAll('#filterConds .flt-cond')[card]; const e = c && c.querySelector('[data-part="' + part + '"]'); return e ? String(e.value ?? '') : null; }""", [part, card])
        def count_is(text, timeout=30000):
            try: page.wait_for_function("t => document.querySelector('#filterCount').textContent.includes(t)", arg=text, timeout=timeout); return True
            except Exception: return False
        def count(): return page.inner_text("#filterCount")
        def open_layers():
            if not page.is_visible("#layersPanel"): page.click("#tool-layers")
            page.wait_for_selector('#layersList [data-key$=":filter"]', timeout=30000)
        def open_filter(nth=0):
            open_layers(); page.locator('#layersList [data-key$=":filter"]').nth(nth).click()
            page.wait_for_selector("#filterPanel:not([hidden]) .flt-cond", timeout=30000)
        def filter_btn(nth=0): return page.locator('#layersList [data-key$=":filter"]').nth(nth)
        def save_map(name):
            if not page.is_visible("#savePanel"): page.click("#tool-save")
            page.click("#saveTile"); page.wait_for_selector("#nameModal:not([hidden])"); page.fill("#fileNameInput", name)
            with page.expect_download() as dl: page.click("#nameConfirm")
            return json.loads(pathlib.Path(dl.value.path()).read_text())
        def drop(name, text, mime):
            page.evaluate("""([name, text, mime]) => { const dt = new DataTransfer(); dt.items.add(new File([text], name, { type: mime })); window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); }""", [name, text, mime])

        print("== the plain panel (the main app)")
        page.goto(f"{base}/index.html?config=mapmaker&webmap={QUAKES}")
        page.wait_for_function("document.querySelector('#layersBadge') && document.querySelector('#layersBadge').textContent === '1'", timeout=120000)
        open_filter()
        check(page.inner_text("#filterShowH") == "Show Earthquakes (Major) where", "the heading names the layer: " + page.inner_text("#filterShowH"))
        check(page.inner_text("#filterAdd").strip() == "Add another condition", "Add another condition")
        check(count_is("Showing all 949. Choose below to show fewer."), "nothing filtered yet: " + count())
        labs = page.evaluate("[...document.querySelectorAll('#filterConds .flt-field')].map(w => [w.querySelector('.flt-lab').textContent, w.lastElementChild.getAttribute('label')])")
        check([x[0] for x in labs][:2] == ["Look at", "Keep where it"] and len(labs) == 3, "labels that can be seen above the boxes: " + str([x[0] for x in labs]))
        check(all(x[1] and x[1].startswith(x[0]) for x in labs), "each box's own name starts with the words shown (Label in Name): " + str([x[1] for x in labs]))
        ops = lambda card=0: page.evaluate("(card) => [...document.querySelectorAll('#filterConds .flt-cond')[card].querySelector('[data-part=\"op\"]').querySelectorAll('calcite-option')].map(o => o.textContent)", card)
        select("field", "mag"); page.wait_for_selector("#filterConds arcgis-slider", timeout=40000)
        check(ops() == ["is greater than", "is less than", "is at least", "is at most", "is between", "is", "More\u2026"], "a number field offers six conditions and More: " + str(ops()))
        type_number("8")
        check(count_is("60 shown") and page.inner_text("#filterCount .flt-said") == "Showing Earthquakes (Major) where Magnitude is at least 8." and page.inner_text("#filterCount .flt-num") == "60 shown, 889 hidden, out of 949" and page.evaluate("getComputedStyle(document.querySelector('#filterCount .flt-num')).textAlign") == "right", "the filter is said back as a sentence, with the numbers explained on the right: " + count())
        check(page.inner_text("#filterConds .flt-hist summary") == "Chart of values", "the chart is called Chart of values")
        page.wait_for_selector("#filterConds .flt-cap", timeout=30000); cap = page.inner_text("#filterConds .flt-cap")
        check("Each bar shows how many have about that Magnitude" in cap and "average, 7.35" in cap and "histogram" in cap, "its caption says what the bars are, the average and the chart's name: " + cap)
        check(page.evaluate("document.querySelector('#filterConds arcgis-slider').valueLabelsDisplay") == "always" and abs(page.evaluate("document.querySelector('#filterConds arcgis-histogram').average") - 7.35) < 0.01, "the slider shows its value and the average is marked")
        page.screenshot(path=str(shots / "filter-plain.png"))
        if a.axe:
            csp_shim.add_axe(page, a.axe); v = page.evaluate(AXE)
            check(not v, "plain Filter panel: no WCAG 2.1 A/AA violations (axe-core): " + "; ".join(v))
        page.click("#filterAdd"); page.wait_for_function("document.querySelectorAll('#filterConds .flt-cond').length === 2")
        select("field", "place", 1)
        check(ops(1) == ["is", "is one of", "includes", "More\u2026"], "a text field offers three conditions and More: " + str(ops(1)))
        select("op", "contains", 1); type_text("Chile", 1)
        check(count_is("where Magnitude is at least 8 and Place includes \u201cChile\u201d."), "two conditions joined with and: " + count())
        mt = page.evaluate("[...document.querySelectorAll('#filterMatchRow calcite-option')].map(o => o.textContent)")
        check(mt == ["Show what fits every condition", "Show what fits any one condition"], "the match choice in plain words: " + str(mt))
        page.evaluate("(() => { const s = document.querySelector('#filterMatchRow calcite-select'); s.value = 'any'; s.dispatchEvent(new CustomEvent('calciteSelectChange')); })()")
        check(count_is("is at least 8 or Place includes"), "and with or: " + count())
        select("op", "__more", 1); page.wait_for_timeout(800)
        check(len(ops(1)) == 10 and "has no value" in ops(1) and "More\u2026" not in ops(1) and val("op", 1) == "contains", "More shows every condition, in plain words, and keeps the one chosen: " + str(ops(1)))
        select("op", "blank", 1)
        check(count_is("or Place has no value."), "has no value: " + count())
        page.click("#filterCancel")

        print("== config/classic.json: the panel as it was")
        page.goto(f"{base}/index.html?config=classic&webmap={QUAKES}")
        page.wait_for_function("document.querySelector('#layersBadge') && document.querySelector('#layersBadge').textContent === '1'", timeout=120000)
        open_filter()
        check(page.inner_text("#filterShowH") == "Show features where" and count_is("Showing all 949 features") and not page.query_selector("#filterConds .flt-lab"), "Show features where, no labels above the boxes")
        check(len(page.evaluate("[...document.querySelector('#filterConds [data-part=\"op\"]').querySelectorAll('calcite-option')].map(o => o.textContent)")) >= 10, "and every condition in the list")
        check(not errors, "no uncaught errors: " + " | ".join(errors[:3]))
        browser.close()
    print(f"{checks[0] - len(failures)}/{checks[0]} checks passed")
    sys.exit(csp_shim.finish(failures))

if __name__ == "__main__":
    main()
