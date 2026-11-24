# Atlas 5.0: developer guide

For whoever changes the code next. Written for 5.0.0-beta.41 and brought up to date in 5.0.0-beta.73; the Modules section at the end is made from the code, so it is always current. What the app does, release by release, is in [README.md](README.md); what it defends against is in [SECURITY.md](SECURITY.md).

## The short version

- Edit the **source**: `app.js`, `src/`, `lib/`, `index.html`, `config/`, `locales/`. Never edit `dist/`: it is built afresh each time.
- The source runs in a browser as it is. No build is needed to develop or to test.
- Open a pull request. GitHub Actions runs the unit tests, the linter and every browser test against the built copy. When they pass on `main`, it publishes. If anything fails, the site stays as it was.
- Bump the app version on every release (one command, below), and add a section to the README.
- Describe what you add. Each file starts with a comment saying what it does, and each exported function has a `/** */` description with its parameters and their types. [Modules](#modules), at the end of this guide, is made from those and from the code (`node tools/modules.mjs`); the tests fail when one is missing or that section is out of date.

## Run it on your own machine

```
python3 -m http.server 8000        # in the repository folder
```

Then open `http://localhost:8000/`. Add `?config=lab` (or any name in `config/`) to choose a config. It must be served, not opened as a file: browsers do not load modules from `file://`.

For the tools (linter, build):

```
npm install
npm run lint       # ESLint
npm test           # the unit tests
npm run build      # writes dist/
```

To try the built copy: `npm run build`, then serve `dist/` the same way.

## Where things are

| Path | What it is |
|---|---|
| `index.html` | The page: all the markup and all the CSS |
| `app.js` | Starts the app: loads the files of `src/` in order. No app code |
| `src/` | The app, one file for each part. [Modules](#modules) says what each does |
| `src/state.js` | The values more than one file sets, and `late` (below) |
| `lib/` | The parts that need no browser and no map library: reading spreadsheets, the saved-file format, filters, units, config merging, wording. Unit tested |
| `config/` | One JSON file per deployment. `default.json` is the base; the others override it |
| `locales/` | Translations of the wording in `lib/strings.js` |
| `tests/` | `*.test.mjs` unit tests (Node, nothing to install); `live-*.py` browser tests (Playwright) |
| `tools/build.mjs` | The build |
| `tools/bump.mjs` | Changes the app version everywhere it must match (`npm run bump`) |
| `tools/modules.mjs` | Writes [Modules](#modules) from the code, and lists any file or exported function that isn't described (`--check`) |
| `tools/countries.mjs` | Makes `lib/countries-data.js` from Esri's World Countries layer |
| `.github/workflows/site.yml` | Test, build, publish |

## How the files load, and the three rules that keep it working

`tests/structure.test.mjs` and the linter enforce these, so a mistake fails the pull request rather than a classroom.

**1. Start-up files load one at a time.** `config.js`, `branding.js`, `sdk.js` and `views.js` each wait for something at their top level (the config file, the map library, the map). `app.js` loads them with `await import(...)`, each finished before the next begins. Safari before version 27 goes wrong when two files wait on a third that is still loading ([WebKit bug 242740](https://bugs.webkit.org/show_bug.cgi?id=242740)). So:

- Only those files and `startup.js` may use `await` outside a function (linter rule `atlas/top-level-await`).
- A start-up file imports only `state.js`, `lib/` and the start-up files before it. If it needs a function from a later file, it calls it through `late` in `src/state.js`: the later file sets `late.name = name` when it loads. There are five of these; add to them only when there is no other way.

**2. The other files run in a fixed order.** They import from each other freely, in circles too. What keeps the order is that each file's **first import is the file before it** (`import "./ui.js?v=…";` at the top of `popups.js`, and so on back to `session.js`). `app.js` loads the last one, `startup.js`, and the chain runs them first to last. To add a file, put it in the chain: make its first import the file it should follow, and change the next file's first import to point at it.

**3. Every import carries the app version** (`?v=5.0.0-beta.41`). GitHub Pages lets browsers keep files for ten minutes; the version in the address stops a new release running beside a cached older file. A file must be imported by exactly the same address everywhere, or the browser loads it twice as two separate copies. The build removes these (one file has no such problem).

## Shared state

A value that more than one file **sets** lives in `state` (`src/state.js`): `state.view`, `state.mode`, `state.dirty`, and so on. A file cannot assign to a variable it imported, so this is not a style choice. A value only one file sets stays in that file and is exported; other files import it and always see its current value.

## Releasing

1. Change the version everywhere it must match:
   ```
   npm run bump -- 5.0.0-beta.42
   ```
   That rewrites the `?v=` on every import and `APP_VERSION`; it leaves comments alone.
2. If a part's behaviour changed, bump that part's version too (`PROFILE_VERSION`, `CHARTS_VERSION`, …) and its line in the versions table (`src/versions.js`). Wording changes bump `"version"` in `locales/es.json`.
3. Add a section at the top of the release notes in `README.md`, and update the version in its first paragraph.
4. If you added a file or an exported function, or changed what one does, describe it and run `node tools/modules.mjs` (the structure test says when it is needed).
5. `npm run lint && npm test`, open the pull request, merge when the checks pass.

## Tests

**Unit tests** (`tests/*.test.mjs`): `npm test`, or `node tests/filter.test.mjs` for one. They cover `lib/` and the structure rules.

**Browser tests** (`tests/live-*.py`): each starts a local server, opens the app in a real browser against the real map library and ArcGIS Online, and checks what a user would see.

```
pip install -r tests/requirements.txt
python -m playwright install chromium
python tests/live-start.py                      # against the source
ATLAS_SERVE=dist python tests/live-start.py     # against the built copy
ATLAS_BROWSER=firefox python tests/live-start.py
```

- `tests/csp_shim.py` is imported by every one. It makes Playwright's waits work under the app's Content Security Policy, fails the test if the policy blocked anything, and chooses the folder and the browser from the two variables above.
- They use live services, so one can fail on a slow answer. CI runs a failed test once more before it counts.
- The touch and pinch tests drive Chromium directly and only run there.

**In CI** (`site.yml`): every browser test runs in Chromium against the built copy and must pass before publishing. A short set runs in Firefox and WebKit and is reported, but does not yet hold up publishing. The whole workflow also runs every Monday with nothing changed: the map library comes from Esri's servers (`js.arcgis.com/5.2/`), so a change there shows up as a failed Monday run rather than a failed lesson.

## Publishing

`publish` in `site.yml` puts `dist/` on GitHub Pages. It needs **Settings > Pages > Source** set to **GitHub Actions**. Until that is set, the job says so and stops, and Pages serves the source from `main` as it did before (which works: the source runs as it is).

`dist/` holds `index.html`, `app.js` (all the source files joined and shrunk), `app.js.map` (so a browser's developer tools show the real source), `config/`, `locales/` and the sign-in callback page.

## Conventions

- **Accessibility**: every control has a name, works from the keyboard, and keeps a visible focus. Seventeen of the browser tests scan what they open with axe-core (WCAG 2.1 A and AA) when given its path, by `--axe` or in `ATLAS_AXE`; the workflow installs axe-core for them and sets `ATLAS_AXE`. To run them here: `npm install --no-save --prefix /tmp/axe axe-core@4.14.0`, then `ATLAS_AXE=/tmp/axe/node_modules/axe-core/axe.min.js python3 tests/live-parity.py`. Don't remove the browser's own zoom or text resizing.
- **Wording** goes in `lib/strings.js` (and `locales/`), never in the code.
- **Experimental features** are switched on per config under `features` and tried in `config/lab.json` first.
- **Security**: no `innerHTML` with content that came from outside the app; item descriptions go through `safeFragment`. No inline script or event handlers: the Content Security Policy refuses them. A new outside address may need adding to the policy in `index.html`; the tests will say so.
- **Not used**: CARTO, Google Earth Engine, sources from US-embargoed countries.
- **Comments** say why, in plain words, with the version that introduced the thing.
- **Descriptions**: the comment at the top of a file says what the file does (a title line `// ====… Title`, then at least a sentence). An exported function's `/** */` says what it does or gives back, with an `@param {type}` for each parameter and, where it helps, `@returns`. Keep them true when the code changes: the index is rebuilt from them, but only a reader can tell when one has gone stale.

## Modules

<!-- modules:start (made by tools/modules.mjs; do not edit by hand) -->

What each file of the app does, from the comment at the top of the file, and what it exports, uses and is used by, from the code. `src/` files are listed in the order they run (see How the files load); `lib/` files need no browser or map library and have unit tests in `tests/`. Each exported function has a description, with its parameters, directly above it in the file.

### `src/state.js`: Shared state

What the parts of the app share and change. Each part of the app is its own file in src/; a value that more than one of them sets lives here, so every part sees the same one. Read and set them as state.name. A value only one part sets stays in that part (other files can import and read it, but cannot set it). `late` holds the few functions the start-up files call before the files that define them have loaded.

- **Exports:** `STATE_VERSION`, `state`, `late`
- **Uses:** no other file of the app
- **Used by:** `arcgis-online.js`, `bookmarks.js`, `branding.js`, `collection.js`, `csv-import.js`, `data-layers.js`, `filter-panel.js`, `item-info.js`, `layers-panel.js`, `legend-basemaps.js`, `local-files.js`, `maps.js`, `measure.js`, `popups.js`, `print.js`, `profile.js`, `saved-maps.js`, `sdk.js`, `session.js`, `sketch.js`, `startup.js`, `ui.js`, `versions.js`, `view-mode.js`, `views.js`

### `src/config.js`: Config, wording and version numbers

The first file app.js loads. It reads the config the link asks for (config/&lt;name&gt;.json, an ArcGIS Online item with ?appid=, or the manager app's preview; lib/config.js), lays it over DEFAULT_CONFIG, and builds the wording (S, t) from lib/strings.js, the language file and the config. It also holds the app's version numbers, the feature switches (F), what was kept across an ArcGIS Online sign-in (authStash), and small helpers every file uses ($, fmt, HEX32). Atlas is a white-label build of the MapMaker classroom map app, on the ArcGIS Maps SDK for JavaScript 5.2: everything a distributor changes lives in a config. Created by Jason Sawle. Each ?v= on an import is the app version, so a new release never runs beside a cached older module (tests/structure.test.mjs checks they match).

- **Exports:** `keepConfig()`, `APP_VERSION`, `COMPASS_VERSION`, `CHARTS_VERSION`, `PROFILE_VERSION`, `SKETCH_VERSION`, `CONFIG_SCHEMA`, `SDK_VERSION`, `AUTH_STASH`, `$`, `fmt`, `HEX32`, `reduceMotion`, `params`, `authStash`, `cfgName`, `PARTNER_ORGS`, `appId`, `previewing`, `rawCfg`, `cfgItem`, `cfg`, `F`, `S`, `t`, `PORTAL`, `cfgChain`
- **Uses:** `lib/config.js`, `lib/strings.js`
- **Used by:** `arcgis-online.js`, `bookmarks.js`, `branding.js`, `collection.js`, `csv-import.js`, `data-layers.js`, `drag-drop.js`, `filter-panel.js`, `item-info.js`, `layers-panel.js`, `legend-basemaps.js`, `local-files.js`, `maps.js`, `measure.js`, `popups.js`, `print.js`, `profile.js`, `saved-maps.js`, `sdk.js`, `session.js`, `sketch.js`, `startup.js`, `topics.js`, `ui.js`, `versions.js`, `view-mode.js`, `views.js`

### `src/branding.js`: Branding and text

Dresses the page in the config's brand: its colours (with the text colour on each worked out so it stays readable), the header's logo, name and links, and every piece of wording the page shows. Draws the toolbar's built-in outline icons first, then swaps in Esri's Calcite icons once the SDK has loaded them.

- **Exports:** `hexToRgb()`, `upgradeIcons()`
- **Uses:** `state.js`, `config.js`
- **Used by:** `csv-import.js`, `filter-panel.js`, `sketch.js`, `views.js`

### `src/sdk.js`: ArcGIS SDK

Loads the ArcGIS Maps SDK for JavaScript and hands its modules to the rest of the app. Code that not every class uses (the Elevation profile's, curved lines', sketch symbols'; the legend, swipe, table and coordinates components) is fetched only when it is first needed (need, toolEl). Also the two helpers for ArcGIS REST requests. The map library comes from js.arcgis.com. A school network can block it or be slow to deliver it; without it nothing on the page works, so the page says so (with a Reload button) and doesn't leave a toolbar that does nothing.

- **Exports:** `need()`, `toolEl()`, `dropEl()`, `restGetUrl()`, `restGet()`, `WebMap`, `WebScene`, `Camera`, `GraphicsLayer`, `FeatureLayer`, `Graphic`, `Basemap`, `Layer`, `ElevationLayer`, `densifyOperator`, `WebStyleSymbol`, `cimSymbolUtils`
- **Uses:** `state.js`, `config.js`
- **Used by:** `arcgis-online.js`, `bookmarks.js`, `collection.js`, `csv-import.js`, `data-layers.js`, `filter-panel.js`, `layers-panel.js`, `legend-basemaps.js`, `local-files.js`, `maps.js`, `measure.js`, `popups.js`, `profile.js`, `sketch.js`, `startup.js`, `topics.js`, `ui.js`, `view-mode.js`, `views.js`

### `src/views.js`: Map, views and widgets

Makes the 2D view from the SDK's map component (the 3D view is made by view-mode.js when first needed), the starting map and the first sketch layer, and puts the app's controls on each view: search, home, zoom, the compass rose, the scale bar. Starts downloading the map named in the link early. Holds what the rest of the app uses to work with whichever view is on screen: activeMap, onViews, goToSafe, frameTarget.

- **Exports:** `takePreloaded()`, `componentView()`, `setViewMap()`, `startZoom()`, `onViews()`, `activeMap()`, `scaleControls()`, `growControls()`, `addViewUI()`, `syncToolsToggles()`, `frameTarget()`, `goToSafe()`, `graphicsLayer`, `defaultBasemap`, `linkedScene`, `linkedMap`, `sketchLayers`, `isSketch`, `sketchKeyOfLayer`, `sketchLayerByKey`, `sketchCount`, `sketchListed`, `localMap`, `startCenter`, `viewEls`, `mapView`, `viewHandlers`, `startDone`, `bigTargets`
- **Uses:** `lib/doc.js`, `state.js`, `config.js`, `branding.js`, `sdk.js`
- **Used by:** `arcgis-online.js`, `bookmarks.js`, `csv-import.js`, `data-layers.js`, `filter-panel.js`, `layers-panel.js`, `legend-basemaps.js`, `local-files.js`, `maps.js`, `measure.js`, `popups.js`, `print.js`, `profile.js`, `sketch.js`, `startup.js`, `ui.js`, `view-mode.js`
- **Shared state:** sets `activeSketch`, `pinnedSketch`, `view`, `viewSettled`; reads `mode`, `sceneView`

### `src/session.js`: The map being worked on: its file, title and unsaved changes

Which file the map came from and whether Save may write back to it; whether the map has changes not yet saved (asked about before they would be lost, and when the tab is closed); and the map's title, in the header, the browser tab and the page heading. Also keeps the bottom of the map clear of the toolbar (layoutBottom). Saving. A map file saves back to itself, whichever device it's opened on. A locked map (marked inside the file; see LOCK_PROP) is never saved over from this app: opening one is just looking, and Save makes the person's own copy. Chrome empties a file as soon as it's picked in the save dialog (File System Access spec), before the app sees which file it was. So the text of each locked file opened is kept: if it's picked, it's written straight back, unchanged. (A locked file that wasn't opened in this session can't be put back: see README, Known limits.)

- **Exports:** `bindOpened()`, `unbindFile()`, `openedEntry()`, `restoreOpened()`, `markDirty()`, `markClean()`, `confirmDiscard()`, `currentTitle()`, `setTitle()`, `layoutBottom()`, `watchBottom()`, `titleSlug()`, `dataLayers`, `portalLayers`, `lockedBase`, `copyBase`, `FILE_EXT`, `titleFromFileName`, `OPEN_EXTS`
- **Uses:** `lib/doc.js`, `state.js`, `config.js`, `csv-import.js`
- **Used by:** `arcgis-online.js`, `bookmarks.js`, `collection.js`, `csv-import.js`, `data-layers.js`, `drag-drop.js`, `filter-panel.js`, `item-info.js`, `layers-panel.js`, `legend-basemaps.js`, `local-files.js`, `maps.js`, `print.js`, `saved-maps.js`, `sketch.js`, `startup.js`, `ui.js`, `view-mode.js`
- **Shared state:** sets `currentFileHandle`, `dirty`, `openedLocked`; reads `view`

### `src/ui.js`: Messages, panels and dialogs

How every tool talks to the student and opens its controls: short messages at the bottom of the map (toast), also read by screen readers and listed in Recent messages; the side panels, one open at a time, with the keyboard's focus moved in and back; and dialogs that keep the keyboard inside them until they close.

- **Exports:** `toast()`, `saveNotes()`, `openPanel()`, `closePanels()`, `togglePanel()`, `openModal()`, `closeModal()`, `openPanelName`
- **Uses:** `state.js`, `config.js`, `sdk.js`, `views.js`, `session.js`, `popups.js`, `sketch.js`, `legend-basemaps.js`, `measure.js`, `profile.js`, `layers-panel.js`, `filter-panel.js`, `bookmarks.js`, `csv-import.js`, `local-files.js`, `arcgis-online.js`, `versions.js`
- **Used by:** `arcgis-online.js`, `collection.js`, `csv-import.js`, `drag-drop.js`, `filter-panel.js`, `item-info.js`, `layers-panel.js`, `legend-basemaps.js`, `local-files.js`, `maps.js`, `measure.js`, `popups.js`, `print.js`, `profile.js`, `saved-maps.js`, `sketch.js`, `startup.js`, `view-mode.js`
- **Shared state:** sets `addState`, `pendingParse`, `sketchPanelOpen`; reads `privateLeftOut`

### `src/popups.js`: Pop-ups and the map by keyboard

Turns pop-ups off while Sketch, Measure or the Elevation profile is in use, and back on after. With the map focused, Enter opens the pop-up of what is at the centre of the map, as a click there would, and a cross marks the centre while the keyboard is in use (Keyboard on the map 1.1).

- **Exports:** `updatePopupEnabled()`, `showCentre()`, `handWords()`, `onHandChange()`, `usesTouch`
- **Uses:** `state.js`, `views.js`, `ui.js`, `config.js`, `sdk.js`
- **Used by:** `arcgis-online.js`, `measure.js`, `profile.js`, `sketch.js`, `startup.js`, `ui.js`, `view-mode.js`
- **Shared state:** reads `drapedPopup`, `measureActive`, `sceneView`, `sketchPanelOpen`, `view`

### `src/sketch.js`: Sketch

Drawing uses the SDK's Sketch component: the same toolbar Map Viewer uses (select, point, line with straight, freehand and curved segments, area, rectangle, circle, text, undo/redo, duplicate, delete, snapping). It shows on the map while the Sketch panel is open. The panel keeps what the SDK has no component for: each sketch's pop-up (title, description, picture), colour and size, symbols, line and fill styles, and rotation for text (and, in the lab, for a point's symbol: features.pointRotation). Also the sketch layers: the first always exists, and a student can make more (features.sketchLayers).

- **Exports:** `vectorSymbol()`, `straighten()`, `addSketchGraphic()`, `syncSketchLayerPicker()`, `createSketchLayer()`, `newSketchLayer()`, `nextSketchLayerName()`, `setActiveSketch()`, `removeSketchLayer()`, `updatePinned()`, `setSelection()`, `selectForEdit()`, `endSketchOps()`, `sketchToolsOn()`, `COLOUR_NAMES`, `sketch`, `sketchReady`, `styleOf`, `SKETCH_LAYERS_ON`, `SKETCH_LAYERS_VERSION`
- **Uses:** `lib/csv.js`, `lib/doc.js`, `state.js`, `config.js`, `branding.js`, `sdk.js`, `views.js`, `session.js`, `ui.js`, `popups.js`, `measure.js`, `maps.js`, `layers-panel.js`, `csv-import.js`
- **Used by:** `collection.js`, `csv-import.js`, `layers-panel.js`, `local-files.js`, `maps.js`, `measure.js`, `ui.js`, `versions.js`, `view-mode.js`
- **Shared state:** sets `activeSketch`, `pinnedSketch`; reads `view`

### `src/legend-basemaps.js`: Legend and basemaps

The Legend panel (the SDK's legend component, made the first time it opens) and the Basemaps panel: the basemap group's maps as a grid of cards in the group's own order (lib/basemaps.js), with the map's basemap marked; the arrow keys move between the cards.

- **Exports:** `ensureLegend()`, `syncGallerySelection()`, `renderGallery()`, `ensureGallery()`, `legend`, `gallery`, `legendMaking`
- **Uses:** `lib/basemaps.js`, `state.js`, `config.js`, `sdk.js`, `views.js`, `session.js`, `ui.js`, `maps.js`
- **Used by:** `maps.js`, `ui.js`, `view-mode.js`
- **Shared state:** reads `mode`, `view`

### `src/measure.js`: Measure, units and coordinates

The Measure tool's menu: distance, area and the coordinates of a place, with the SDK's measurement and coordinate components, and what Measure keeps when the view switches between 2D and 3D (features.keepMeasure). And the units the app shows lengths in (kilometres or miles): worked out at start (lib/units.js), changed with the units switch, and followed by the Sketch tools and the Elevation profile too.

- **Exports:** `sketchUnits()`, `takeMeasure()`, `putMeasure()`, `stopMeasuring()`, `closeToolMenu()`, `coordWidget`, `units`
- **Uses:** `lib/units.js`, `lib/threed.js`, `state.js`, `config.js`, `sdk.js`, `views.js`, `ui.js`, `popups.js`, `sketch.js`, `csv-import.js`, `profile.js`
- **Used by:** `profile.js`, `sketch.js`, `ui.js`, `view-mode.js`
- **Shared state:** sets `measureActive`; reads `mode`, `sceneView`, `view`

### `src/profile.js`: Elevation profile

The Elevation tool: a line drawn on the map (or a line already there, chosen with a click), the height of the land and sea floor along it from Esri's TopoBathy elevation service, and the chart of it with sea level, the distance, and total climb and descent. The tool and chart are the app's own; how and why is set out below, after the imports.

- **Exports:** `profShow()`, `ensureProfile()`, `stopProfile()`, `syncDraftButtons()`, `profileUnitsChanged()`, `PROF_KEYS`, `profActive`
- **Uses:** `lib/doc.js`, `lib/fish.js`, `state.js`, `config.js`, `sdk.js`, `views.js`, `ui.js`, `popups.js`, `measure.js`
- **Used by:** `measure.js`, `ui.js`, `view-mode.js`
- **Shared state:** sets `profDraft`; reads `sceneView`, `view`

### `src/view-mode.js`: 2D / 3D

Switching between the 2D map and the 3D view (setMode): the place looked at, the open pop-up and the Elevation profile's line go across, and so does Measure (features.keepMeasure; the classic config stops it instead), and the 3D camera tilts when it arrives close in (lib/threed.js). Also what the 3D view needs that 2D does not: its quality setting, haze, map notes and styled fills drawn for 3D, a note about layers that look different there, which views a map allows, and paired 2D and 3D maps (features.pairs).

- **Exports:** `usePair()`, `syncViewLocks()`, `setMode()`, `pairOn`, `mapPair`, `idleMap`, `sourceBms`, `partnerFor`, `isScene`, `has2dOnlyTag`
- **Uses:** `lib/doc.js`, `lib/threed.js`, `state.js`, `config.js`, `sdk.js`, `views.js`, `session.js`, `ui.js`, `popups.js`, `sketch.js`, `legend-basemaps.js`, `measure.js`, `profile.js`, `maps.js`, `data-layers.js`, `layers-panel.js`, `bookmarks.js`, `collection.js`, `csv-import.js`
- **Used by:** `collection.js`, `local-files.js`, `maps.js`
- **Shared state:** sets `bookmarks`, `currentAgolItem`, `currentSource`, `drapedPopup`, `mode`, `profDraft`, `sceneOnly`, `sceneView`, `view`, `viewSettled`; reads `addState`, `portalUser`, `twoDOnly`

### `src/maps.js`: Maps and layers

Opening a map: a web map or web scene from ArcGIS Online or from a file, or a new blank map. Opening one clears the work on screen (resetWorkspace), after asking about unsaved changes; a saved map then puts its own sketches, spreadsheets and added layers back. Between 2D and 3D, and between the two versions of a paired map, the sketch layers go across (setActiveMap). Also the order of the map's layers, the time slider, the toolbar badges, and adding or removing a layer from the collection.

- **Exports:** `setActiveMap()`, `timeWidgetsJson()`, `shownMap()`, `listedLayerCount()`, `updateToolBadges()`, `keepSketchOnTop()`, `applyLayerOrder()`, `removeFromMaps()`, `resetWorkspace()`, `sourceLayers()`, `basemapFrom()`, `basemapRef()`, `restoreSketchLayers()`, `loadedItemJson()`, `openWebMapItem()`, `layersDeep()`, `slidesToBookmarks()`, `openWebSceneItem()`, `openWebSceneFile()`, `openWebMapFile()`, `newBlankMap()`, `addPortalLayer()`, `removePortalLayer()`, `timeBar`
- **Uses:** `lib/doc.js`, `lib/pairs.js`, `state.js`, `config.js`, `sdk.js`, `views.js`, `session.js`, `ui.js`, `sketch.js`, `legend-basemaps.js`, `view-mode.js`, `data-layers.js`, `layers-panel.js`, `bookmarks.js`, `collection.js`, `csv-import.js`
- **Used by:** `arcgis-online.js`, `bookmarks.js`, `collection.js`, `csv-import.js`, `data-layers.js`, `layers-panel.js`, `legend-basemaps.js`, `local-files.js`, `sketch.js`, `startup.js`, `view-mode.js`
- **Shared state:** sets `addState`, `bookmarks`, `currentAgolItem`, `currentSource`, `pinnedSketch`, `sceneOnly`, `twoDOnly`; reads `mode`, `portalUser`, `sceneView`, `view`

### `src/data-layers.js`: Spreadsheet layers

The layers made from a spreadsheet in Add data: a feature layer kept in the browser, made from the definition lib/csv.js writes and saved with the map, placed under the sketches; and, in 3D, columns standing on its points (features.columns3d).

- **Exports:** `buildDataLayer()`, `syncColumns()`, `addDataLayer()`, `COLUMNS_VERSION`
- **Uses:** `lib/csv.js`, `lib/doc.js`, `state.js`, `config.js`, `sdk.js`, `views.js`, `session.js`, `maps.js`
- **Used by:** `csv-import.js`, `local-files.js`, `maps.js`, `versions.js`, `view-mode.js`
- **Shared state:** reads `mode`

### `src/layers-panel.js`: Map layers panel

Every layer of the map, top first: show and hide, opacity, labels, reorder (by dragging or with the keys), zoom to, remove, and rename for sketch layers; and each layer's tools: Swipe, the attribute table, charts, Filter and Change style. Also what a saved map needs from the list: the sketch layers' names and settings, and the order of the layers.

- **Exports:** `eachToggleableLayer()`, `hasLabels()`, `endSwipe()`, `closeTable()`, `syncDockHeight()`, `chartNoteWhenLoaded()`, `chartNote()`, `endLayerTools()`, `sketchLayersMeta()`, `layerOrderIds()`, `renderLayers()`, `calIcon`, `TABLE_TYPES`, `keyOf`, `rowWidgets`, `isGroup`, `sketchRowShown`, `rowRefs`
- **Uses:** `state.js`, `config.js`, `lib/threed.js`, `sdk.js`, `views.js`, `session.js`, `ui.js`, `sketch.js`, `maps.js`, `filter-panel.js`, `collection.js`, `item-info.js`, `csv-import.js`
- **Used by:** `arcgis-online.js`, `bookmarks.js`, `collection.js`, `csv-import.js`, `filter-panel.js`, `local-files.js`, `maps.js`, `print.js`, `sketch.js`, `ui.js`, `view-mode.js`
- **Shared state:** reads `activeSketch`, `mode`, `sceneView`, `view`

### `src/filter-panel.js`: Filter

A Filter panel for one layer, laid out like Map Viewer's: "Show features where", then conditions (field, condition, value), a histogram with a slider for number fields, Add new, and Apply / Cancel. It is built from Esri's Calcite components and the SDK's Histogram and Slider components; Map Viewer's filter panel itself isn't published as a component. The filter is saved as the layer's definitionExpression (lib/filter.js), which is how Map Viewer saves one. While the panel is open the map previews the conditions through the layer view (no data is fetched again as a slider moves), and the layer itself shows everything, so the histogram, value lists and counts cover all the data.

- **Exports:** `openFilter()`, `endFilter()`, `filterJson()`, `filterable`, `filterText`, `hasFilter`
- **Uses:** `lib/filter.js`, `state.js`, `config.js`, `branding.js`, `sdk.js`, `views.js`, `session.js`, `ui.js`, `layers-panel.js`, `csv-import.js`
- **Used by:** `arcgis-online.js`, `layers-panel.js`, `local-files.js`, `ui.js`
- **Shared state:** reads `view`

### `src/bookmarks.js`: Bookmarks

The Bookmarks panel: a bookmark keeps a place, which layers are switched on and a small picture of the map. Bookmarks can be made, renamed, moved to and deleted; a map's own bookmarks (or a web scene's slides) come with it.

- **Exports:** `showBmList()`
- **Uses:** `state.js`, `config.js`, `sdk.js`, `views.js`, `session.js`, `maps.js`, `layers-panel.js`, `csv-import.js`
- **Used by:** `local-files.js`, `maps.js`, `ui.js`, `view-mode.js`
- **Shared state:** reads `bookmarks`, `mode`, `sceneView`, `view`

### `src/topics.js`: Topics and card pictures

The content group's categories as a tree of topics (fetched once), shared by Open map and Add layer; and the pictures on the cards. A card's picture (5.0.0-beta.41). A public item's is loaded by its address. An item only the signed-in person can see needs their token: it used to go on the end of the address as a query parameter, written into the page as the card's background, where it could be read from the page, from server and proxy logs, and from a copied address. It now travels in a request header, and the picture is shown from a blob address that holds no token. Signing out forgets the pictures.

- **Exports:** `getTopicTree()`, `setThumb()`, `forgetThumbs()`, `cleanQuery`
- **Uses:** `lib/catalog.js`, `config.js`, `sdk.js`
- **Used by:** `arcgis-online.js`, `collection.js`

### `src/collection.js`: Collection browser (Open map and Add layer)

After MapMaker's Add layer dialog: search, a Categories tree (the content group's categories, with chevrons for sub-categories and a reset button), wide cards with an expandable description, and page numbers. Up to MAX_INDEX items are loaded once and filtered in the browser, with counts; a bigger group is searched in ArcGIS Online instead. Also the tabs of the Open map and Add layer dialogs, the signed-in student's own maps, and Share (a link to the map).

- **Exports:** `forgetBrowse()`, `openOpenModal()`, `refreshCatalogButtons()`, `switchTab`, `catalogLoaded`
- **Uses:** `lib/catalog.js`, `lib/pairs.js`, `state.js`, `config.js`, `sdk.js`, `session.js`, `ui.js`, `sketch.js`, `view-mode.js`, `maps.js`, `layers-panel.js`, `topics.js`, `item-info.js`, `csv-import.js`, `local-files.js`, `saved-maps.js`
- **Used by:** `arcgis-online.js`, `layers-panel.js`, `local-files.js`, `maps.js`, `view-mode.js`
- **Shared state:** reads `portalUser`

### `src/item-info.js`: Map information and lesson questions

The ⓘ dialog: the open map's summary, description (with only safe HTML kept), credits and a link to its item. And a lesson's questions beside the map, read from the map's description (features.lessonQuestions; lib/questions.js).

- **Exports:** `safeFragment()`
- **Uses:** `state.js`, `lib/questions.js`, `config.js`, `session.js`, `ui.js`
- **Used by:** `arcgis-online.js`, `collection.js`, `layers-panel.js`
- **Shared state:** reads `currentSource`

### `src/csv-import.js`: Add data and Change style

Add data: a spreadsheet saved as CSV is read (lib/csv.js), placed by its coordinates or by the countries it names (features.countryData; lib/countries.js), shown on the map as a preview while it is styled, and added. Change style opens the same panel for a spreadsheet layer already on the map. Leaving with data not yet added asks first.

- **Exports:** `handleCsvText()`, `editDataLayer()`, `backToLayers()`, `renderStyleList()`, `renderFieldRows()`, `removePreview()`, `unfinishedData()`, `leaveData()`, `previewLayer`, `previewTimer`
- **Uses:** `lib/csv.js`, `lib/countries.js`, `lib/countries-data.js`, `sdk.js`, `state.js`, `config.js`, `branding.js`, `views.js`, `session.js`, `ui.js`, `sketch.js`, `maps.js`, `data-layers.js`, `layers-panel.js`, `drag-drop.js`
- **Used by:** `bookmarks.js`, `collection.js`, `drag-drop.js`, `filter-panel.js`, `layers-panel.js`, `maps.js`, `measure.js`, `session.js`, `sketch.js`, `ui.js`, `view-mode.js`
- **Shared state:** sets `addState`, `pendingParse`; reads `mode`, `view`

### `src/drag-drop.js`: Drag and drop

A file dropped on the page: a saved map opens, a CSV goes to Add data, a spreadsheet in another format gets a message saying to save it as CSV, and anything else a message saying what can be dropped.

- **Exports:** `readText()`, `handleDroppedFile()`
- **Uses:** `config.js`, `session.js`, `ui.js`, `csv-import.js`, `local-files.js`
- **Used by:** `csv-import.js`, `local-files.js`

### `src/local-files.js`: Save and open on this device (.amap; older .mmap files open too)

Saves the map as a file: a web map (or, for a web scene, a web scene) with the app's own document inside it (lib/doc.js), written back to the same file where the browser allows it and downloaded where it doesn't. Opens such a file again, or any web map or web scene JSON, from the file picker or from a drop. A sketch drawn in 3D carries a height of 0 on every point (the sketch layer lies on the ground). Saved sketches are flat shapes, as the ones drawn in 2D are: x and y only (Sketch 3D 1.0).

- **Exports:** `buildDocument()`, `loadDocument()`, `openDocText()`, `openFromDevice()`, `buildWebMapJson()`, `unsavedLayers`
- **Uses:** `lib/doc.js`, `lib/pairs.js`, `state.js`, `config.js`, `sdk.js`, `views.js`, `session.js`, `ui.js`, `sketch.js`, `view-mode.js`, `maps.js`, `data-layers.js`, `layers-panel.js`, `filter-panel.js`, `bookmarks.js`, `collection.js`, `drag-drop.js`, `saved-maps.js`, `arcgis-online.js`
- **Used by:** `arcgis-online.js`, `collection.js`, `drag-drop.js`, `saved-maps.js`, `startup.js`, `ui.js`
- **Shared state:** sets `bookmarks`, `currentFileHandle`, `openedLocked`, `privateLeftOut`; reads `currentSource`, `mode`, `portalUser`, `sceneOnly`, `sceneView`, `twoDOnly`, `view`

### `src/saved-maps.js`: Saved maps on this device (Open map > My map files)

Every save adds the map to a list kept in this browser (lib/recent.js), newest first. In Chrome and Edge the list keeps a handle to the file, so Open reads the file itself and Save goes on writing to it; browsers that can only download (Safari, Firefox) keep a copy of the saved map instead, as they can't open a file again by themselves.

- **Exports:** `recordSave()`, `renderSavedMaps()`
- **Uses:** `lib/recent.js`, `state.js`, `config.js`, `session.js`, `ui.js`, `local-files.js`
- **Used by:** `collection.js`, `local-files.js`
- **Shared state:** reads `view`

### `src/print.js`: Print

Printing happens in the browser; nothing is sent to a print service. Print map lays out the map as it is on screen, with its title, the layers shown and the map's credits. Print an outline map draws a blank map for a class to label and colour (features.outlinePrint; lib/outline.js).

- **Exports:** nothing; it sets up its part of the page when it runs
- **Uses:** `lib/outline.js`, `state.js`, `config.js`, `views.js`, `session.js`, `ui.js`, `layers-panel.js`
- **Used by:** no file imports anything from it; it runs for its effect on the page
- **Shared state:** reads `view`

### `src/arcgis-online.js`: ArcGIS Online: sign in, save, update

Signing in to ArcGIS Online (the map being worked on is kept across the sign-in page and put back), the signed-in student's menu, and saving the map as a web map item: Save overwrites the student's own item, Save as makes a new one, with a picture of the map as its thumbnail. Also the tips on the sign-in tiles and each tool's tooltip.

- **Exports:** `renderAgol()`, `closeUserMenu()`, `layerToJson()`, `currentBaseMapJson()`, `sourceLayersJson()`, `saveToAgol()`
- **Uses:** `lib/doc.js`, `state.js`, `config.js`, `sdk.js`, `views.js`, `popups.js`, `session.js`, `ui.js`, `maps.js`, `layers-panel.js`, `filter-panel.js`, `topics.js`, `collection.js`, `item-info.js`, `local-files.js`
- **Used by:** `local-files.js`, `ui.js`
- **Shared state:** sets `currentAgolItem`, `dirty`, `portalUser`, `privateLeftOut`; reads `currentSource`, `sceneOnly`, `view`

### `src/versions.js`: Versions

The Versions table in About: the app's version and the version of each part of it, with what changed, and where the config came from (a file in config/, an ArcGIS Online item, or the manager app's preview).

- **Exports:** `renderVersions()`
- **Uses:** `lib/threed.js`, `lib/fish.js`, `lib/countries.js`, `lib/countries-data.js`, `lib/outline.js`, `lib/questions.js`, `lib/basemaps.js`, `lib/catalog.js`, `lib/config.js`, `lib/csv.js`, `lib/doc.js`, `lib/filter.js`, `lib/pairs.js`, `lib/recent.js`, `lib/units.js`, `state.js`, `config.js`, `sketch.js`, `data-layers.js`
- **Used by:** `ui.js`

### `src/startup.js`: Start-up

The last file to run. Opens the map or scene the link names (webmap=, webscene=) or the map kept across a sign-in, says if the config asked for wasn't found, and then tells the rest of the app that start-up is done. From here on the Map layers count follows the map on screen: layers added or removed, another map opened.

- **Exports:** nothing; it sets up its part of the page when it runs
- **Uses:** `lib/doc.js`, `state.js`, `config.js`, `sdk.js`, `views.js`, `session.js`, `ui.js`, `popups.js`, `maps.js`, `local-files.js`
- **Used by:** no file imports anything from it; it runs for its effect on the page
- **Shared state:** reads `view`

### `lib/basemaps.js`: Basemap gallery

The basemap group's items as MapMaker shows them (a two-column grid of cards): which to show in 2D and in 3D, in the group's own order, each card's picture, which card is the map's basemap, and moving between cards with the arrow keys. Pure functions (no ArcGIS SDK), so they can be unit tested.

- **Exports:** `groupSort()`, `basemapItems()`, `thumbnailUrl()`, `selectedId()`, `needsDataTitles()`, `gridMove()`, `BASEMAPS_VERSION`
- **Uses:** no other file of the app
- **Used by:** `legend-basemaps.js`, `versions.js`

### `lib/catalog.js`: Topics (the collection's categories)

The content group's categories, used to browse its maps in Open map and Add layer: the tree of topics, how many maps each topic holds, search that ignores accents and case, and the page numbers. Pure functions (no ArcGIS SDK), so they can be unit tested. Created by Jason Sawle.

- **Exports:** `buildTopicTree()`, `flattenTopics()`, `findTopic()`, `topicTrail()`, `inTopic()`, `indexItems()`, `countTopics()`, `filterEntries()`, `chipSet()`, `pageList()`, `CATALOG_VERSION`, `MAX_INDEX`, `OTHER`, `ALL`, `topicKey`, `fold`, `searchTokens`
- **Uses:** no other file of the app
- **Used by:** `collection.js`, `topics.js`, `versions.js`

### `lib/config.js`: Configs

Reading a config and its language file. A config (config/&lt;name&gt;.json) lists only what differs from the app's defaults. It may start from another config with "extends": "&lt;name&gt;", and it names a language with "locale": the wording then comes from locales/&lt;locale&gt;.json, one shared file per language, with the config's own "strings" laid over it. A partner's config can also come from an ArcGIS Online item (?appid=) or the manager app's preview; those are checked before they are used. No SDK and no DOM, so it runs under Node for the tests.

- **Exports:** `mergeConfig()`, `loadConfig()`, `loadItemConfig()`, `loadPreviewConfig()`, `CONFIG_VERSION`, `PARTNER_KEYWORD`, `buildStrings`
- **Uses:** no other file of the app
- **Used by:** `config.js`, `versions.js`

### `lib/countries-data.js`: Countries data

Made by tools/countries.mjs: do not edit by hand. The countries in Esri's World Countries (Generalized) layer: [two-letter code, three-letter code, the name shown, the other names it is known by].

- **Exports:** `COUNTRY_DATA_DATE`, `NO_OUTLINE`, `COUNTRIES`
- **Uses:** no other file of the app
- **Used by:** `csv-import.js`, `versions.js`

### `lib/countries.js`: Countries by name

Add data can place a row by the country it names: this file works out which country a piece of text means, finds the column of a table that holds countries, and gets a country's outline ready to draw (fewer points; a point inside it). The list of countries and names is lib/countries-data.js, made by tools/countries.mjs. Pure functions; no browser or SDK needed, so they are unit-tested in tests/countries.test.mjs.

- **Exports:** `normCountry()`, `countryIndex()`, `matchCountry()`, `detectCountryColumn()`, `matchRows()`, `simplifyRings()`, `insidePoint()`, `COUNTRIES_VERSION`, `OUTLINE`
- **Uses:** no other file of the app
- **Used by:** `csv-import.js`, `versions.js`

### `lib/csv.js`: Spreadsheets (CSV)

Reads a spreadsheet saved as CSV and turns it into a layer definition for Add data: the delimiter and the columns; coordinates in any of the forms people type or the Coordinates tool copies (or, for rows placed by country, the shapes they are given); which columns are numbers and which are types; and the styles Add data offers, with their renderers, labels and pop-ups as ArcGIS REST JSON, so the same definition saves to a file and to a web map. Pure functions only (no ArcGIS SDK), so they can be unit-tested in Node. Nothing here sends the file anywhere: parsing happens in the browser.

- **Exports:** `normName()`, `sniffDelimiter()`, `parseRows()`, `readCsv()`, `detectLatLon()`, `usesDecimalComma()`, `toNumber()`, `sanitizeFieldName()`, `lonLatToWebMercator()`, `directionTable()`, `cleanCoordText()`, `parseCoord()`, `utmToLonLat()`, `mgrsToLonLat()`, `webMercatorToLonLat()`, `parseCoordPair()`, `detectPairColumn()`, `buildLayerData()`, `columnKinds()`, `defaultPieFields()`, `stateFromLayerDef()`, `styleAvailable()`, `pickAutoStyle()`, `pickAutoFields()`, `pieFields()`, `aliasOf()`, `buildRenderer()`, `columnScale()`, `buildLabelingInfo()`, `buildLayerDef()`, `CSV_VERSION`, `PALETTE_HEX`, `PALETTE_RGB`, `COLOR_RAMPS`, `DATA_STYLES`, `AREA_STYLES`, `isAreas`, `SHAPES`, `COORD_KEYS`, `ENGLISH_DIRS`, `PIE_MAX`, `PIE_MIN`
- **Uses:** no other file of the app
- **Used by:** `csv-import.js`, `data-layers.js`, `sketch.js`, `versions.js`

### `lib/doc.js`: Saved maps (web map and web scene JSON)

Saved maps are ArcGIS web maps: the same JSON (Web Map Specification) whether saved to an .amap file on the device or to ArcGIS Online, and a web scene that was opened is saved as a web scene. This file writes and reads that JSON, and still reads the older .mmap documents. Anything opened from a file is checked first: only https web addresses, known layer types, and a limit on how many features. Pure functions only (no ArcGIS SDK), so they can be unit-tested in Node.

- **Exports:** `geometryKind()`, `textFont()`, `cleanSketchAttributes()`, `cleanDataLayer()`, `cleanBasemap()`, `cleanBookmarks()`, `sanitizeDoc()`, `sketchToOperationalLayers()`, `operationalLayersToSketch()`, `dataDefToOperationalLayer()`, `operationalLayerToDataDef()`, `isOwnLayerJson()`, `lonLatToXY()`, `xyToLonLat()`, `zoomToScale()`, `scaleToZoom()`, `bookmarksToSpec()`, `specToBookmarks()`, `cleanTimeWidgets()`, `docToWebMap()`, `sketchLayersIn()`, `sketchOpacityOf()`, `isLockedMap()`, `isLockedText()`, `looksLikeWebMap()`, `readWebMap()`, `saved3dCamera()`, `looksLikeWebScene()`, `docToWebScene()`, `readWebScene()`, `DOC_TYPE`, `DOC_VERSION`, `WEBMAP_WRITER_VERSION`, `WEBMAP_SPEC_VERSION`, `WEBSCENE_SPEC_VERSION`, `ITEM_LAYER_PREFIX`, `DATA_LAYER_PREFIX`, `SKETCH_GRAPHICS_ID`, `AUTHORING_APP`, `MAX_FEATURES`, `TEXT_FONTS`, `SHAPE_NAME`, `LINE_PATTERNS`, `ARROWS`, `SKETCH_LAYER_PREFIX`, `COLUMNS_3D_PROP`, `SKETCH_LAYER_PROP`, `isSketchKey`, `sketchKeyOf`, `sketchLayerId`, `LOCK_PROP`, `VIEW_3D_PROP`, `TWO_D_ONLY_PROP`
- **Uses:** no other file of the app
- **Used by:** `arcgis-online.js`, `data-layers.js`, `local-files.js`, `maps.js`, `profile.js`, `session.js`, `sketch.js`, `startup.js`, `versions.js`, `view-mode.js`, `views.js`

### `lib/filter.js`: Filter conditions and SQL

The conditions a person builds in the Filter panel, and the SQL they are saved as. A layer's filter is saved in the web map as its definitionExpression (Web Map Specification, layerDefinition), which is how Map Viewer saves filters too. Nothing else is stored, so the conditions shown in the panel are read back from the SQL: the forms this module writes are the forms it reads. SQL it can't read (written by hand, or by another app in a form not listed here) is kept as it is and stays on; conditions added in the panel are added to it. No ArcGIS SDK here, so it runs in Node for the unit tests.

- **Exports:** `fieldKind()`, `rangeTypeFor()`, `conditionComplete()`, `conditionToSql()`, `buildWhere()`, `parseWhere()`, `filterFields()`, `describeFilter()`, `FILTER_VERSION`, `MAX_CONDITIONS`, `OPERATORS`, `DEFAULT_OPERATOR`, `SIMPLE_OPERATORS`, `needsValue`, `isListOp`, `MAX_LIST`
- **Uses:** no other file of the app
- **Used by:** `filter-panel.js`, `versions.js`

### `lib/fish.js`: Fish in the elevation profile

Fish in the sea of an elevation profile (lab: features.profileFish). A light-hearted extra, not data: a few small fish wander at random in the upper water of the chart. This file is the movement only, with no drawing, so it can be tested. The chart is stretched many times over, so the fish are not to scale and say nothing about where sea life is found.

- **Exports:** `waterColumn()`, `spawnFish()`, `stepFish()`, `FISH_VERSION`
- **Uses:** no other file of the app
- **Used by:** `profile.js`, `versions.js`

### `lib/outline.js`: Outline maps for printing

A teacher prints a blank map for a class to label and colour: the world with its continents, a continent with its countries, the United States with its states (5.0.0-beta.48). The boundaries are Esri's public layers; this file turns them into the lines of a drawing. The app draws those lines as SVG, so they print sharp at any size and nothing is sent anywhere. No browser needed: unit tested.

- **Exports:** `equalEarth()`, `azimuthal()`, `albers()`, `outlineUrl()`, `outlineShapes()`, `outlineLabel()`, `OUTLINE_VERSION`, `OUTLINE_MAPS`
- **Uses:** no other file of the app
- **Used by:** `print.js`, `versions.js`

### `lib/pairs.js`: Paired 2D and 3D maps

A web map and a web scene their author made as the 2D and 3D versions of one map. Pure functions (no ArcGIS SDK), so they can be unit tested. Created by Jason Sawle.

The author says so with a tag on each ArcGIS Online item, naming the other one:<br>
on the web map:   atlas-3d-&lt;the scene's item ID&gt;<br>
on the web scene: atlas-2d-&lt;the web map's item ID&gt;<br>
The app reads an item's tags when it opens it, so it knows the partner without searching for it.

- **Exports:** `partnerFromTags()`, `savedPair()`, `pairOf()`, `mergePairs()`, `PAIRS_VERSION`, `TAG_3D_PARTNER`, `TAG_2D_PARTNER`, `PAIR_PROP`, `entryIs3d`, `entryIs2d`
- **Uses:** no other file of the app
- **Used by:** `collection.js`, `local-files.js`, `maps.js`, `versions.js`

### `lib/questions.js`: Lesson questions

A lesson's questions, read from a map's own description (5.0.0-beta.44). A map's author can put the questions for students in the item's description, under a heading "Questions". The app shows them beside the map. The item's summary, when it is itself a question, is shown above them as the main question. No browser needed: unit tested.

- **Exports:** `questionsFrom()`, `QUESTIONS_VERSION`, `isQuestionsHeading`
- **Uses:** no other file of the app
- **Used by:** `item-info.js`, `versions.js`

### `lib/recent.js`: Saved maps on this device

The list behind Open map &gt; My map files. The list lives in this browser's IndexedDB, on this device only. In Chrome and Edge each entry also keeps a handle to the saved file, so Open reads the file itself (and Save keeps writing to it). Browsers that can only download files (Safari, Firefox) can't open a file again by themselves, so there the entry keeps a copy of the saved map. Handles sit in their own store and are read back only for the one map being opened (or a save to a file of the same name): showing the list never reads them. The pure functions are unit tested; openRecentStore needs a browser (or any IndexedDB).

- **Exports:** `newId()`, `makeEntry()`, `sortEntries()`, `pruneEntries()`, `candidates()`, `openRecentStore()`, `RECENT_VERSION`, `RECENT_MAX`, `RECENT_DB`
- **Uses:** no other file of the app
- **Used by:** `saved-maps.js`, `versions.js`

### `lib/strings.js`: Wording

Every word the app shows, in English (DEFAULT_STRINGS), keyed by name. A language file in locales/ and a config's own "strings" can replace any of them (see config/example-es.json); src/config.js puts the three together.

- **Exports:** `DEFAULT_STRINGS`
- **Uses:** no other file of the app
- **Used by:** `config.js`

### `lib/threed.js`: 2D to 3D

Going from the 2D map to the 3D view (5.0.0-beta.54): the scale handed across, how far the camera tilts, when haze is left off, what about a layer the 3D view can't draw as 2D does, and the size of the picture a styled fill is drawn into. Plain functions with no map in them, so they can be tested. Why each is here is in the README: a review of how a selection of the collection's maps look after pressing 3D.

- **Exports:** `tiltForScale()`, `layerDiffers3d()`, `drapeSize()`, `distinctPoints()`, `pathIn3d()`, `halfwayAlong()`, `THREED_VERSION`, `scaleTo3d`, `scaleTo2d`, `TILT_FULL_SCALE`, `HAZE_SCALE`, `hazeOn`, `FILL3D`, `TILT_REGION_SCALE`
- **Uses:** no other file of the app
- **Used by:** `layers-panel.js`, `measure.js`, `versions.js`, `view-mode.js`

### `lib/units.js`: Units

Units 1.0: which units the app starts in (kilometres and metres, or miles and feet), and measurements shown as whole numbers. With "units": "auto" the app guesses from two things the browser already knows, and nothing is sent anywhere:<br>
1\. the device's time zone. A time zone of the United States or its territories means miles and feet; any other known time zone means kilometres and metres.<br>
2\. if the time zone is not known (missing, or plain UTC), the browser's language: a US region (en-US, es-US) means miles and feet.<br>
The person's own choice, made with the units switch, comes before the guess; a units= link parameter before that.

- **Exports:** `wholeNumberText()`, `metresOf()`, `lengthText()`, `isUSTimeZone()`, `isPlaceTimeZone()`, `guessUnits()`, `resolveUnits()`, `UNITS_VERSION`
- **Uses:** no other file of the app
- **Used by:** `measure.js`, `versions.js`

<!-- modules:end -->
