# Atlas 5.0: developer guide

For whoever changes the code next. Written for 5.0.0-beta.41. What the app does, release by release, is in [README.md](README.md); what it defends against is in [SECURITY.md](SECURITY.md).

## The short version

- Edit the **source**: `app.js`, `src/`, `lib/`, `index.html`, `config/`, `locales/`. Never edit `dist/`: it is built afresh each time.
- The source runs in a browser as it is. No build is needed to develop or to test.
- Open a pull request. GitHub Actions runs the unit tests, the linter and every browser test against the built copy. When they pass on `main`, it publishes. If anything fails, the site stays as it was.
- Bump the app version on every release (one command, below), and add a section to the README.

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
| `src/` | The app, one file for each part (27 files; the README has the list) |
| `src/state.js` | The values more than one file sets, and `late` (below) |
| `lib/` | The parts that need no browser and no map library: reading spreadsheets, the saved-file format, filters, units, config merging, wording. Unit tested |
| `config/` | One JSON file per deployment. `default.json` is the base; the others override it |
| `locales/` | Translations of the wording in `lib/strings.js` |
| `tests/` | `*.test.mjs` unit tests (Node, nothing to install); `live-*.py` browser tests (Playwright) |
| `tools/build.mjs` | The build |
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
4. `npm run lint && npm test`, open the pull request, merge when the checks pass.

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

`dist/` holds `index.html`, `app.js` (all 37 source files joined and shrunk), `app.js.map` (so a browser's developer tools show the real source), `config/`, `locales/` and the sign-in callback page.

## Conventions

- **Accessibility**: every control has a name, works from the keyboard, and keeps a visible focus. `tests/live-elevation.py` runs axe-core when given its path (`--axe`). Don't remove the browser's own zoom or text resizing.
- **Wording** goes in `lib/strings.js` (and `locales/`), never in the code.
- **Experimental features** are switched on per config under `features` and tried in `config/lab.json` first.
- **Security**: no `innerHTML` with content that came from outside the app; item descriptions go through `safeFragment`. No inline script or event handlers: the Content Security Policy refuses them. A new outside address may need adding to the policy in `index.html`; the tests will say so.
- **Not used**: CARTO, Google Earth Engine, sources from US-embargoed countries.
- **Comments** say why, in plain words, with the version that introduced the thing.
