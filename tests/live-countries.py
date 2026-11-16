"""Rows placed by country in Add data (lab, features.countryData; Countries 1.0, CSV 3.7), in Chromium against the
real services: the ArcGIS Maps SDK and Esri's World Countries (Generalized) layer.

Run:  python3 tests/live-countries.py [--shots DIR] [--proxy URL] [--axe FILE]

Checks: a file with a column of countries and no coordinates is placed by country; names written many ways are one
country (DRC, U.K., USA, Côte d'Ivoire); what wasn't found is listed, and plain Congo is explained; points to start with,
at a place inside each country; Its outline makes areas, with their own styles (Areas, By type, By number), shaded by the
number column; the areas go on the map as a polygon layer of a sensible size; Change style opens it as areas; it is
kept in a saved file and comes back; the 3D view takes it; a file with latitude and longitude is placed as before; a
file with neither offers a country column to choose; and the main app, where this is off, doesn't.
"""
import argparse, functools, glob, http.server, json, os, pathlib, sys, threading
from playwright.sync_api import sync_playwright
import csp_shim   # waits that work under the app's Content Security Policy; collects what it blocked

HERE = pathlib.Path(__file__).resolve().parent; APP = HERE.parent
CSV = ("Site,Latitude,Longitude,Area,Fast Food wrappers,Bottles,Cans\n"
       "Market St,32.7115,-117.1601,Street,12,3,1\nIsland Ave,32.7098,-117.1585,Park,5,8,2\nJ St,32.7076,-117.1612,Street,9,1,3\n"
       "K St,32.7066,-117.1590,Park,2,2,4\nG St,32.7127,-117.1570,Street,20,6,5\nHarbor Dr,32.7060,-117.1640,Park,0,4,6\n")
AXE = "(sel) => axe.run(sel, { runOnly: ['wcag2a','wcag2aa','wcag21a','wcag21aa'] }).then(r => r.violations.map(v => v.id + ': ' + v.nodes.map(n => n.target.join(' ')).slice(0,3).join(', ')))"
LAYER = "(() => { const s = document.querySelector('arcgis-scene'), m = document.querySelector('arcgis-map'); const v = (s && !document.querySelector('#sceneDiv').hidden) ? s.view : m.view; return v.map.layers.toArray().filter(l => String(l.id).startsWith(PFX))[0]; })()"
REND = "(() => { const l = " + LAYER + "; if (!l) return null; const r = l.renderer, sym = r.symbol || (r.uniqueValueInfos && r.uniqueValueInfos[0] && r.uniqueValueInfos[0].symbol) || {}; const sl = sym.symbolLayers && sym.symbolLayers.getItemAt(0); const h = (r.visualVariables || []).find(v => v.type === 'size' && v.axis === 'height'); return { type: r.type, sym: sym.type, prim: sl && sl.resource && sl.resource.primitive, width: sl && sl.width, color: sl && sl.material && sl.material.color && sl.material.color.toHex(), field: h && h.field, stops: h && h.stops && h.stops.map(s => [s.value, s.size]) }; })()"

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
        ctx = browser.new_context(viewport={"width": 1366, "height": 768})
        ctx.add_init_script("delete window.showSaveFilePicker; delete window.showOpenFilePicker;")
        page = ctx.new_page(); errors = []
        page.on("pageerror", lambda e: errors.append((str(e) + " @ " + str(getattr(e, "stack", "") or "")).replace("\n", " ")[:900]))
        page.on("dialog", lambda d: d.accept())
        def wf(expr, arg=None, timeout=120000): return page.wait_for_function(expr, arg=arg, timeout=timeout, polling=500)
        def wv(sel, timeout=90000): return wf("s => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0; }", arg=sel, timeout=timeout)
        def js(sel): page.evaluate("(s) => document.querySelector(s).click()", sel)
        def start(config):
            page.goto(f"{base}/index.html?config={config}")
            wf("(() => { const m = document.querySelector('arcgis-map'); return !!(m && m.view && m.view.ready); })()"); page.wait_for_timeout(2000)
        def drop(name, text, kind="text/csv"):
            page.evaluate("""([name, text, kind]) => { const dt = new DataTransfer(); dt.items.add(new File([text], name, { type: kind })); window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); }""", [name, text, kind])
        STYLES = "[...document.querySelectorAll('#styleList .style-card')].map(b => b.querySelector('.s-name').textContent + (b.disabled ? ' (off)' : '') + (b.getAttribute('aria-pressed') === 'true' ? ' *' : ''))"
        PREVIEW = "(() => { const v = document.querySelector('arcgis-map').view; const l = v.map.layers.find(x => x.type === 'feature'); if (!l) return null; const g = l.source.getItemAt(0); return { type: l.geometryType, n: l.source.length, renderer: l.renderer.type, sym: (l.renderer.symbol || l.renderer.defaultSymbol || {}).type, vv: (l.renderer.visualVariables || []).map(x => x.type + ':' + x.field), size: JSON.stringify(l._srcDef).length, first: g.attributes, at: g.geometry.type === 'point' ? [g.geometry.longitude, g.geometry.latitude] : null }; })()"
        CSV = "Country,Population (millions),Region,Capital\nNigeria,223.8,West,Abuja\nEthiopia,126.5,East,Addis Ababa\nEgypt,112.7,North,Cairo\nDRC,102.3,Central,Kinshasa\nTanzania,67.4,East,Dodoma\nSouth Africa,60.4,Southern,Pretoria\nKenya,55.1,East,Nairobi\nCongo,6.1,Central,Brazzaville\nCôte d'Ivoire,28.9,West,Yamoussoukro\nU.K.,67.7,Europe,London\nUSA,334.9,Americas,Washington\nNarnia,1,Nowhere,Cair Paravel\nKorea,51,Asia,Seoul\n"

        print("== a file of countries, in the lab")
        start("lab")
        check("country names" in page.evaluate("document.querySelector('[data-i18n=\"yourDataHint\"]').textContent"), "Add layer says a file can have a column of country names")
        drop("africa.csv", CSV)
        wv("#dataPanel:not([hidden]) #countryBox:not([hidden])", timeout=120000); wf(PREVIEW + " !== null"); page.wait_for_timeout(1500)
        cs = page.inner_text("#countrySummary")
        check(cs.startswith("Placed 11 of 13 rows by the country in “Country”."), "11 of 13 rows are placed by country: " + cs[:60])
        check("Not found: Narnia, Korea." in cs, "the two that aren't countries are listed (Korea could be either)")
        check("“Congo” is read as the Republic of the Congo" in cs and "DRC" in cs, "plain Congo is explained")
        pv = page.evaluate(PREVIEW)
        check(pv["type"] == "point" and pv["n"] == 11 and page.get_attribute("#countryAsPoint", "aria-pressed") == "true", "points to start with: " + str({k: pv[k] for k in ("type", "n")}))
        check(pv["first"]["Country"] == "Nigeria" and 3 < pv["at"][0] < 14 and 4 < pv["at"][1] < 14, "Nigeria's point is in Nigeria: %.1f, %.1f" % tuple(pv["at"]))
        st = page.evaluate(STYLES)
        check(st == ["Locations", "By type", "By size", "Color & size (off)", "Type & size *", "Pie charts (off)"], "the point styles, coloured by Region and sized by the number to start with: " + str(st))
        check(page.evaluate("document.querySelector('#fieldRows select').value") == "Region", "not coloured by the country column itself")
        check("Found 11 points" in page.inner_text("#dataSummary") and "skipped" not in page.inner_text("#dataSummary"), "the summary counts the points and doesn't talk of latitude")
        if a.axe:
            csp_shim.add_axe(page, a.axe)
            v = page.evaluate("async () => (await axe.run('#dataPanel', { runOnly: ['wcag2a','wcag2aa','wcag21a','wcag21aa'] })).violations.map(v => v.id + ' ' + v.nodes.map(n => n.target.join(' ')).join(' | '))")
            check(not v, "the panel passes the accessibility scan: " + "; ".join(v))

        print("== as outlines")
        page.click("#countryAsArea"); wf(PREVIEW + " !== null && " + PREVIEW + ".type === 'polygon'"); page.wait_for_timeout(1200)
        pv = page.evaluate(PREVIEW); st = page.evaluate(STYLES)
        check(pv["type"] == "polygon" and pv["n"] == 11 and pv["sym"] == "simple-fill", "Its outline: 11 areas, filled: " + str({k: pv[k] for k in ("type", "n", "sym")}))
        check(st == ["Areas", "By type", "By number *"], "areas have their own styles, By number to start with: " + str(st))
        check(pv["vv"] == ["color:Population__millions"] and page.inner_text("#cfgSummary").startswith("Each area shaded by Population (millions)"), "shaded by the number column: " + page.inner_text("#cfgSummary"))
        check(page.is_hidden("#shapeRow") and page.is_hidden("#sizeRow") and page.is_visible("#rampRow") and page.inner_text("#symH").lower() == "areas", "no shape or size for areas; the colours can be chosen")
        check(30000 < pv["size"] < 200000, "the 11 outlines are small enough to keep in a file: %d KB" % (pv["size"] // 1024))
        check(page.evaluate("document.activeElement && document.activeElement.id") == "countryAsArea", "the keyboard's focus stays on the choice")
        page.evaluate("[...document.querySelectorAll('#styleList .style-card')][1].click()"); page.wait_for_timeout(1200)
        pv = page.evaluate(PREVIEW)
        check(pv["renderer"] == "unique-value" and page.inner_text("#cfgSummary").startswith("Each area colored by Region"), "By type colours the areas by Region: " + page.inner_text("#cfgSummary"))
        page.evaluate("[...document.querySelectorAll('#styleList .style-card')][2].click()"); page.wait_for_timeout(800)
        page.screenshot(path=str(shots / "countries-areas.png"))
        page.click("#dataSubmit"); wf("document.querySelector('#layersBadge').textContent === '1'"); page.wait_for_timeout(1500)
        check("Added 11 area(s)" in page.inner_text("#toast"), "Add to map says 11 areas were added: " + page.inner_text("#toast")[:40])
        pv = page.evaluate(PREVIEW)
        check(pv["type"] == "polygon" and pv["n"] == 11 and pv["vv"] == ["color:Population__millions"], "and the layer on the map is the areas")

        print("== change style, 3D, save and open again")
        js("#tool-layers"); wv("#layersPanel:not([hidden])"); page.evaluate("document.querySelector('#layersList [data-style-for]').click()"); wv("#dataPanel:not([hidden]) #dataSubmit"); page.wait_for_timeout(1200)
        check(page.evaluate(STYLES) == ["Areas", "By type", "By number *"] and page.is_hidden("#countryBox") and page.is_hidden("#sizeRow"), "Change style opens the layer as areas, By number chosen")
        page.evaluate("document.querySelector('#rampList .ramp-btn[aria-label=\"Greens\"]').click()"); page.wait_for_timeout(500); page.click("#dataSubmit"); page.wait_for_timeout(2000)
        first = page.evaluate("(() => { const v = document.querySelector('arcgis-map').view; const l = v.map.layers.find(x => x.type === 'feature'); return l.renderer.visualVariables[0].stops[0].color.toJSON().slice(0, 3).join(); })()")
        check(first == "237,248,233", "and Apply changes its colours (Greens): " + first)
        js("#tool-save"); js("#saveTile"); wv("#nameModal:not([hidden])"); page.fill("#fileNameInput", "countries")
        with page.expect_download() as dl: js("#nameConfirm")
        text = pathlib.Path(dl.value.path()).read_text(); saved = json.loads(text)
        own = next(o for o in saved["operationalLayers"] if str(o.get("id", "")).startswith("__data_"))
        ld = own["featureCollection"]["layers"][0]
        check(ld["layerDefinition"]["geometryType"] == "esriGeometryPolygon" and len(ld["featureSet"]["features"]) == 11 and "rings" in ld["featureSet"]["features"][0]["geometry"], "the saved file holds the 11 areas (%d KB in all)" % (len(text) // 1024))
        js("#tg3d"); wf("(() => { const s = document.querySelector('arcgis-scene'); return !!(s && s.view && s.view.ready); })()", timeout=180000); page.wait_for_timeout(6000)
        check(page.evaluate("(() => { const v = document.querySelector('arcgis-scene').view; const l = v.map.layers.find(x => x.type === 'feature'); return !!l && l.geometryType === 'polygon' && v.layerViews.some(lv => lv.layer === l); })()"), "the 3D view takes the areas")
        page.screenshot(path=str(shots / "countries-3d.png"))
        start("lab")
        drop("countries.amap", text, "application/json")
        wf("document.querySelector('#toast').textContent.includes('countries')", timeout=120000); wf(PREVIEW + " !== null"); page.wait_for_timeout(1500)
        pv = page.evaluate(PREVIEW)
        check(pv["type"] == "polygon" and pv["n"] == 11 and pv["vv"] == ["color:Population__millions"] and pv["first"]["Country"] == "Nigeria", "opened again, the areas are back, shaded as before")

        print("== other files")
        start("lab")
        drop("towns.csv", "Name,Latitude,Longitude,Country\nLagos,6.45,3.39,Nigeria\nCairo,30.04,31.24,Egypt\n")
        wv("#dataPanel:not([hidden]) #dataControls:not([hidden])"); wf(PREVIEW + " !== null"); page.wait_for_timeout(800)
        pv = page.evaluate(PREVIEW)
        check(page.is_hidden("#countryBox") and pv["type"] == "point" and abs(pv["at"][0] - 3.39) < 0.01, "a file with latitude and longitude is placed by them, as before, even with a country column")
        page.click("#dataCancel"); page.wait_for_timeout(600)
        drop("codes.csv", "Code,Score\nKEN,4\nCOD,7\nGBR,9\n")
        wv("#dataPanel:not([hidden]) #countryBox:not([hidden])", timeout=120000); wf(PREVIEW + " !== null")
        check(page.inner_text("#countrySummary").startswith("Placed 3 of 3 rows by the country in “Code”."), "a column of three-letter codes is found without being called Country")
        page.click("#dataCancel"); page.wait_for_timeout(600)
        drop("things.csv", "Thing,Count,Where\nApples,4,Narnia\nPears,7,Peru\nPlums,2,Oz\n")
        wv("#llPicker:not([hidden])")
        check(page.is_visible("#countryPick") and page.evaluate("document.querySelector('#countrySel').options.length") == 3, "a file with neither asks, and offers a country column to choose")
        page.select_option("#countrySel", "0"); page.click("#countryUse"); page.wait_for_timeout(1200)
        check(page.is_visible("#llPicker") and "None of that column" in page.inner_text("#toast"), "a column with no countries in it is refused: " + page.inner_text("#toast")[:50])
        page.select_option("#countrySel", "2"); page.click("#countryUse")
        wv("#dataPanel:not([hidden]) #countryBox:not([hidden])", timeout=120000); wf(PREVIEW + " !== null")
        check(page.inner_text("#countrySummary").startswith("Placed 1 of 3 rows") and "Not found: Narnia, Oz." in page.inner_text("#countrySummary"), "the chosen column places what it can: " + page.inner_text("#countrySummary")[:70])
        page.click("#dataCancel"); page.wait_for_timeout(600)

        print("== the main app: off")
        start("mapmaker")
        check("country" not in page.evaluate("document.querySelector('[data-i18n=\"yourDataHint\"]').textContent"), "Add layer doesn't mention countries")
        drop("africa.csv", CSV)
        wv("#llPicker:not([hidden])")
        check(page.is_hidden("#countryPick") and page.is_hidden("#dataControls"), "a file of countries asks for latitude and longitude, as before, with no country choice")

        check(not errors, "no script errors: " + " | ".join(errors[:2]))
        browser.close()
    print(f"\n{checks[0] - len(failures)}/{checks[0]} checks passed"); sys.exit(csp_shim.finish(failures))

if __name__ == "__main__": main()
