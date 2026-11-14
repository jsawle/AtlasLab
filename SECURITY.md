# Atlas 5.0: threat model

Written for 5.0.0-beta.38 (13 November 2026). Short on purpose: what the app holds, who could misuse it, what stops them, and what is still open. Update it when sign-in, saving, hosting or the map library's version changes.

## What the app is

A page of static files (HTML, CSS, JavaScript, JSON configs) served by GitHub Pages at `jsawle.github.io/AtlasLab/`. There is no server of ours and no database. The page loads Esri's map library from `js.arcgis.com`, reads maps and layers from ArcGIS Online, and reads whatever data addresses a map or a person gives it. Most use is with no sign-in at all.

## What is worth protecting

| Thing | Where it lives | Why it matters |
|---|---|---|
| **ArcGIS sign-in token** (only if someone signs in) | In the page's memory, held by the map library. Not written to storage by the app | Whoever has it can act as that person in ArcGIS Online until it expires: read their private items, change or delete their content |
| **A student's work**: sketches, added spreadsheets, bookmarks, the current map | In memory; in `.amap` files the student saves; recent maps in the browser's IndexedDB | Loss or tampering; a spreadsheet may hold personal data |
| **The published files** (`app.js`, configs) | The GitHub repository and Pages | Whoever can change them controls every user's page |
| **What students see** | Content groups in ArcGIS Online named in the config | Wrong or unsuitable content shown in class |

## Who we are defending against

1. **Someone who writes content the app shows**: an item description, a layer's pop-up, a spreadsheet, a `.amap` or web map handed to a student, a `?config=` link. They want their script to run in the page (to take a token or alter what is shown).
2. **Someone who can read addresses**: server and proxy logs, browser history, a shared screen, a copied link.
3. **Another page on the same site**. Every project page under `jsawle.github.io` is one origin to the browser.
4. **Someone who gets into a supplier**: Esri's CDN, GitHub, or the content groups' owner account.

A person with the device in their hands, or a hostile browser extension, is out of scope: nothing in a web page stops them.

## What is in place

| Risk | Control | Checked by |
|---|---|---|
| Script injected through content | Item descriptions pass through an allow-list (`safeFragment`): no script, style, iframe, form or event attributes; links `https` only, opened with `noopener noreferrer`. Everything else is set as text, not markup. Pop-ups from layers are cleaned by the map library | Code review (no test injects hostile content yet) |
| The same, if a gap is found | **Content Security Policy** (beta.38). Script runs only from the app's own files and `js.arcgis.com`: script written into the page, inline event handlers and script from any other site are refused. No plug-ins; forms and the base address are held to the app | `tests/live-security.py`; every live test fails if the policy blocks anything in normal use |
| Token read from an address | **Private thumbnails** (beta.38) send the token in a request header and show the picture from a `blob:` address. Before, `?token=…` was written into the page for every private item listed | `tests/live-security.py` |
| Token left behind | Sign out destroys the credentials and the cached private pictures. The app stores no token. During a full-page sign-in, `sessionStorage` briefly holds the map in progress and where to return to, and is cleared on return | `tests/live-security.py` |
| Sign-in result intercepted | The callback page allows one script and nothing else (`default-src 'none'`), sends no referrer, and can only hand the result to a window of this same site. The sign-in flow itself is the map library's | `tests/live-security.py` |
| A file that is not what it claims | `.amap` and web map JSON are parsed as data and passed through `sanitizeDoc`; images inside must be `data:image/…` | unit tests (`lib/doc.js`) |
| Sign-in the school did not expect | Sign-in is off unless a config sets a client ID. A map saved to ArcGIS Online is created private (ArcGIS Online's default); the app has no sharing step | Code review |

## The policy, and its limits

```
default-src 'self';
script-src 'self' 'unsafe-eval' https://js.arcgis.com;
style-src 'self' 'unsafe-inline' https://js.arcgis.com;
img-src 'self' data: blob: https:;   font-src 'self' data: https:;
connect-src 'self' https: data: blob:;   worker-src 'self' blob:;   child-src 'self' blob:;
media-src 'self' https: blob:;   frame-src 'self' https://www.arcgis.com;
object-src 'none';   base-uri 'self';   form-action 'self'
```

- **`'unsafe-eval'` is allowed, and that is a real concession.** Esri's chart component builds its checking code with `new Function`; without it no chart draws (found by `tests/live-charts.py`, three failures). The map library also needs WebAssembly. Nothing in the app's own code evals text. What still holds: an attacker's text cannot become a `<script>` or an event handler, which is how injection normally starts.
- **`'unsafe-inline'` for styles.** The page's stylesheet is in `index.html` and the map components set styles as they run. An injected style could restyle or hide things; it cannot run script.
- **Data can be fetched from, and so sent to, any `https` address** (`connect-src`, `img-src`). This is what the app is for: maps name their own servers. It means the policy does not stop a script that did get in from sending data out.
- **It is a `<meta>` tag**, because GitHub Pages cannot send headers. A meta policy cannot stop the page being framed by another site (`frame-ancestors`), cannot report violations anywhere, and does not cover anything loaded before it. A real header becomes possible when hosting moves.

## Still open

| # | Risk | How serious | What would close it |
|---|---|---|---|
| 1 | **The map library still puts the token in the address of its own requests** to ArcGIS Online (`…?f=json&token=…`) when signed in: My maps, opening a private item. Seen here with a made-up token. It is over HTTPS and never in the page, so the exposure is server logs and browser tooling, not other people. This is Esri's normal behaviour | Low to medium | A request interceptor that sends it as a header works for the request itself (tried here), but takes over the library's handling of expired tokens. Needs testing with a real account before it ships |
| 2 | **Shared origin.** Any page under `jsawle.github.io` (class-marking, the demo copy, any future repo) can read this app's recent maps in IndexedDB and, while a signed-in tab is open, could open the app and reach into it. A flaw in any one of them is a flaw in all | Medium | Its own domain or sub-domain for the app. (Hosting is being handled separately.) |
| 3 | **Esri's CDN is trusted completely**, and loaded without a fixed fingerprint (the address `js.arcgis.com/5.2/` serves patch releases, so a fingerprint cannot be pinned). A change there is a change here | Low likelihood, high impact | Bundling a fixed copy at build time (decision 2 in the plan keeps the CDN, with a weekly test run to notice changes) |
| 4 | **No framing protection** (see the meta limit above). Another site could show the app in a frame and trick clicks | Low: there is little a click can do without sign-in | A `frame-ancestors` header at the new host |
| 5 | **`?config=`** takes letters, digits, `-` and `_` only, so it can load only files in `config/`, but a config decides which groups and links appear. A config file is trusted like code | Low | Review of config changes; keep configs in the repository |
| 6 | **Content groups.** Whoever can add to a group decides what students see; descriptions are cleaned, but the maps themselves are not vetted by the app | Depends on group management | Group membership kept tight in ArcGIS Online |
| 7 | **No real signed-in test.** The token changes were checked with a made-up token and an answering test, not a real account | Unknown until tried | One manual pass signed in: My maps thumbnails appear, and the browser's network panel shows no `token=` on `/info/` requests |
| 8 | **The repository.** One account, merges without a second reviewer | Process | Branch protection and two-factor sign-in on the account that can publish |

## Reporting a problem

Tell Jason Sawle directly rather than opening a public issue.
