# Atlas 5.0 (beta)

**Atlas 5.0** is the white-label Atlas / MapMaker app with local save, adding your own data, filtering and Map Viewer's sketch tools. The MapMaker that is live today (the Atlas Instant App) is 4.0. This repository is 5.0, version **5.0.0-beta.62**, on ArcGIS Maps SDK for JavaScript 5.2. Until beta.29 it was the `atlas-sketch/` folder of [jsawle/localmapsave](https://github.com/jsawle/localmapsave); its history came with it. It grew from a lab copy of the earlier white-label app (`localmapsave/atlas/`, 1.14.8, kept there as the demo copy): Sketch uses the SDK's Sketch component, which is Map Viewer's drawing toolbar, instead of the app's own tool buttons. The full description, versions table and known limits are in the `sketch-mapviewer` branch's `atlas/README.md` (pull request #27).

| Link | What you get |
|---|---|
| `https://jsawle.github.io/AtlasLab/` | Neutral "AtlasLab" branding |
| `…/AtlasLab/?config=mapmaker` | MapMaker's groups, units, colours and wording |
| `…/AtlasLab/?config=test` | The same as `mapmaker` (kept so earlier links still work) |
| `…/AtlasLab/?config=mapmaker-live` | The MapMaker config reading the **live** MapMaker group (`36443e9570294a1f883b5d2c5abfe6b5`), for comparing with what is live |
| `…/AtlasLab/?config=lab` | The MapMaker config with lab features switched on. Now: columns in 3D, paired 2D and 3D maps, more than one sketch layer |
| `…/AtlasLab/?config=example-es` | Spanish-language version: a 37-line config plus the shared `locales/es.json` |
| `…/AtlasLab/?appid=<item ID>` | A partner's version, its config kept in an ArcGIS Online item of the education team's (5.0.0-beta.58) |

Apart from Sketch, the two apps are the same: CSV 3.4, the Coordinates fixes, and saving (1.14.5 / 1.15.0-sketch.6). **Lab only for now (1.15.0-sketch.7): locked maps.** *Save a locked copy* writes a map that Save in this app never changes (a teacher's class map, a student's hand-in); the mark is inside the file. Opening one is just looking; Save makes your own copy. Any other map file saves back to itself on any device. 1.15.0-sketch.8 rewords the message after saving a locked copy: it used to say nobody could save over it, but Save as can still replace a locked map that wasn't opened in that session. Two people saving the same unlocked map on a shared drive: whoever saves last wins, with no warning. 1.15.0-sketch.9: picking a file in the save box that Chrome can't write (someone else's, or read-only) used to do nothing at all, because Chrome reports it the same way as Cancel. The app now says nothing was saved and to choose another name or folder. Found by the simulated Chromebook test (`localmapsave/atlas/tests/chromebook-sim/`). 1.15.0-sketch.10 (with main 1.14.7): the Save panel's notes become explanations on each tile, and Sign in is a tile beside Print. The main app gets this in its own pull request once it's been tried here.

1.15.0-sketch.11 has the same code-review fixes as the main app's 1.14.8 (a message when the map library doesn't load, save notes shown one after the other, the close-tab warning for an unadded spreadsheet).

## Partners' config items: GIS 4 Schools only (5.0.0-beta.62)

The partners' config items (`?appid=`) will be kept in GIS 4 Schools (`HNLEA4GfnbCFQZGa`), not the MapMaker organization, so `PARTNER_ORGS` now lists GIS 4 Schools alone. An item in any other organization, the MapMaker one included, opens the default app with the usual message. Tests: `config.test.mjs` (+1, a MapMaker item refused); `tests/live-partner.py` uses a GIS 4 Schools item and refuses a MapMaker one.

## Accessibility: messages that wait, the page's name, state by more than colour (5.0.0-beta.59)

Three of the "could come next" items of the draft conformance report.

- **Messages wait** (Messages 2.0; WCAG 2.2.1, 3.3.1). A message over the map was gone after 3 to 7 seconds whatever the reader was doing. Now it waits while the pointer is on it or the keyboard is in it, and has a Close button. A setting in the Versions panel, **Keep messages on screen until I close them**, keeps every message (remembered on the device). The last ten messages are listed in the Versions panel.
- **The page is named for the open map** (2.4.2, 1.3.1). The browser tab reads "Major Earthquakes · AtlasLab", and the page has a main heading saying the same to a screen reader.
- **State by more than colour** (1.4.1). The open tool has a bar along its foot and bolder words; whichever of 2D and 3D is on has a bar at its side and bolder words. Both kept their colour.

Tests: `tests/live-keyboard.py` (now 26). Wording 1.15 in `locales/es.json`.
## A partner's config in an ArcGIS Online item (5.0.0-beta.58)

The first step towards managing partners' versions (Esri distributors, National Geographic) from the education team's manager app (`jsawle/AtlasLab-manager`). Configs and language files 2.0 → 2.1. Nothing changes for any existing link.

- **`?appid=<item ID>`** opens the app with the config kept in that ArcGIS Online item's data, as an Instant App does. The config is the same JSON as a file in `config/`: it lists only what differs from the app's defaults, can start from a config here (`"extends": "mapmaker"`), and names its language (the wording still comes from `locales/`).
- **Only the education team's items are used.** The item must be public, owned by GIS 4 Schools (`HNLEA4GfnbCFQZGa`; from 5.0.0-beta.62 the only organization, the MapMaker one isn't used), and carry the type keyword `AtlasLabPartnerConfig`, which the manager sets. Anything else (another organization's item, an unmarked one, a private or deleted one, no connection) opens the default app with the usual "Config … wasn't found" message. `PARTNER_ORGS` in `src/config.js` holds the list. A config from an item can't change `portalUrl`.
- **Why an item.** Each opening of a partner's app reads the item's data, which ArcGIS Online counts as a view of that item, so views per partner come from Esri's own counts with nothing added to the app. The config also stays put when the app moves host. (A test map used only by this app's tests has 1,488 views, which says reads from an app off arcgis.com are counted; still to be confirmed on a real partner item.)
- **Logos inside the config.** A logo may now be a picture in the config itself (`data:image/png`, `jpeg`, `webp` or `svg+xml`, base64). The manager keeps partners' logos this way, so a logo is never fetched from a partner's own website, which would see every student's address.
- **Preview for the manager** (`?preview=1`, only in a frame). The app tells the page that framed it that it is ready, and takes a config from it by message. Only a page of `jsawle.github.io` or the app's own site is listened to; when the app moves host, its address goes in `PREVIEW_ORIGINS` (and a `frame-ancestors` header there must let the manager frame it). With no config within 10 seconds, or not in a frame, the default opens.
- Links the app makes keep the partner: Share, the logo, coming back from sign-in (`?appid=` instead of `?config=`). The versions table names the item. Saved-map lists are kept per partner, as they are per config.

Tests: `config.test.mjs` (16 more: an item is used, extended and given its language; another organization's, an unmarked, a missing and an empty item are refused; no connection; a preview); `tests/live-partner.py` (16, with an axe scan): the app dressed by an item, refused items, a preview from our site, and one from another site ignored. The item is answered by the test exactly as ArcGIS Online answers a public item, since no real one exists yet.

## Accessibility: the map by keyboard, 400% zoom, focus that shows (5.0.0-beta.57)

Three gaps from the persona review (findings 2, 3 and 12), ahead of an accessibility conformance report. The standard aimed at is WCAG 2.1 Level AA.

- **The map shows when it has the keyboard's focus**: a ring round it and a cross at its centre. The toolbar's focus ring is thicker and drawn inside each tool (the toolbar clipped one drawn outside). A screen reader is told what the keys do on the map.
- **Pop-ups by keyboard.** With the map focused, Enter opens the pop-up for what is under the cross, and says so; Tab moves into it; Escape closes it and puts the focus back on the map. Where there is nothing under the cross it says that.
- **An elevation profile without a mouse.** Space on the map, or the new **Add point at map centre** button, puts a point of the line under the cross; the arrow keys move the map for the next; Enter or Finish line ends the line.
- **400% zoom and short screens** (`max-height: 440px`; a 1280 x 1024 screen at 400% is 320 x 256). The header and toolbar shrink and the compass is left out, so the map has 218 of the 256 pixels (it had 192). A panel, and the Open map window, takes the whole screen and scrolls as one piece, up and down only. The toolbar still scrolls sideways; its edge now fades where more tools are off to the side, and a tool the keyboard reaches is brought into view. Measure, Sketch and Filter keep their place over the map, which they are used with.

Still needing a pointer: **Measure** and **Sketch** (drawing a shape). Both are the SDK's own components.

Found while checking, and put right:

- **The accessibility scans were not running.** Seventeen browser tests scan panels with axe-core (WCAG 2.1 A and AA), but only when given its path, and the workflow never gave it; since the Content Security Policy of beta.38 the way the tests loaded it was refused as well. The workflow now installs axe-core 4.14.0 for the tests (it is not part of the app) and the tests load it in a way the policy allows. Run by hand across 21 states of the app, the scan found one fault: the Versions panel scrolls and could not be reached by keyboard. Fixed.
- **Edges of buttons and fields** were #d0d0d0 on white, 1.5 to 1; WCAG 1.4.11 asks 3 to 1 for the edge of a field. Now #767676, 4.5 to 1.
- At 400% the 2D / 3D row in Open map pushed the window 13 pixels sideways. It wraps.

Tests: `tests/live-keyboard.py` (18). Keyboard on the map 1.0; Small screens and zoom 1.0. Wording 1.14 in `locales/es.json`. Not tested: a screen reader.

## The time slider has one handle (5.0.0-beta.56)

From people who used it: the slider was too complicated, and two handles that pull apart were confusing. Time 2.0.

- **One handle: the date the map is showing.** Everything up to that date is on the map (the Time Bar's "cumulative from start"), whatever way the map's author saved. The span, the steps and the speed are still the author's. Play, back and forward are as before.
- **The date is written above the handle**, always.
- **No settings button.** It offered the other ways of showing time, stops, speed and time zone.
- A config can have the map's own way and the settings button back: `"timeMode": "map"`.
- A map saved from here keeps its author's time settings; one made with two handles is saved with the start of its span as the first, so it opens in Map Viewer as it was made.
- The control is the SDK's Time Bar (new in 5.2, which this app has used since it moved to 5.2). It is the same control as Map Viewer's new time slider of November 2026.
- Five of the 118 maps in the test group have time settings: three were saved with two handles, two with one. All five show events building up over time, which suits this. A map that needs one period at a time (say, one year's sea ice) would pile its periods up; none in the group does, and `timeMode` or a later per-map switch is the way out if one arrives.

## Some tilt at region scale (5.0.0-beta.55)

Pressing 3D on a map of a region now tilts the camera 30°: the far edge curves away, so it is plain the view is 3D, and the map's subject stays in the middle (beta.54 looked straight down there, which did not read as 3D; before that 60° put the subject on the skyline). From 1:5,000,000 in, the tilt still grows to `threeDTilt` (45°) at town scale. Beyond 1:10,000,000 it falls away to none at 1:25,000,000, where the globe itself shows the view is 3D and a tilt only pushes the globe down the screen. 2D to 3D 1.1.

## Pressing 3D on a web map: camera, scale, haze, map notes, and a note of what differs (5.0.0-beta.54)

From a review of the 2D to 3D switch: all 118 web maps of the test group were surveyed and 11 put through the switch, 2D against 3D. The 3D button hands the same web map to the SDK's 3D view. At least 56 of the 118 open with a layer the 3D view draws differently (a floor: layers styled by their service were not counted). 2D to 3D 1.0, `lib/threed.js`.

Fixed here:

- **The camera tilts by how far out the map is.** It used to tilt 60° always; looking at a region that put the map's subject on the skyline. Now it looks straight down at 1:5,000,000 and beyond, and the tilt grows as the map zooms in, to `threeDTilt` (now 45°, was 60°) at 1:250,000 and closer.
- **A place stays the same size.** The 2D map's scale is measured on the Web Mercator grid and the 3D view's on the ground, so the 3D view showed a place smaller (1.6 times at London's latitude, measured). The scale is corrected for latitude in both directions, and for paired maps.
- **No haze from far out.** At 1:1,000,000 and beyond a web map is drawn without the 3D view's haze, which washed out its colours. A scene keeps its own sky.
- **Map notes show.** The SDK has no 3D form of a map notes layer (Map Viewer's sketches and labels): it did not draw at all. Its drawings are now copied onto the 3D view, shown and hidden with the layer's switch and scale range, and removed on leaving 3D. Nothing is added to the map, the layer list or a saved file.
- **A note of what differs.** Once for each map: "3 layers look different in 3D. Map layers says how." Map layers then says, under each such layer: colours and patterns drawn more simply (polygon and line symbols made in ArcGIS Pro), effects not drawn, no blending with the map beneath, points not grouped.

Not fixed, known:

- Polygon and line symbols made in ArcGIS Pro (CIM) fall back to dark outlines in 3D (at least 13 maps with polygons, 6 with lines). Effects are not drawn (31 maps); multiply blending is ignored on feature layers (17); clusters are not drawn (3). A map whose look depends on these can be tagged `atlas-2d-only`, or paired with a scene.
- A tiled layer with few zoom levels (John Snow's cholera map) is not drawn when the 3D view is tilted at a scale where 2D shows it; looking straight down it is. Believed, not confirmed, to be the tilted view asking for coarser tiles than the layer has.
- Labels along lines become repeated point labels.
- Seen only on the test machine, which draws 3D without a graphics chip: white grid lines across the globe on imagery layers. Not confirmed on a real device.

Tests: `tests/threed.test.mjs` (17) and `tests/live-3d-switch.py` (13). Wording 1.13 in `locales/es.json`.

## The compass hides only while a chart or table is open (5.0.0-beta.53)

Corrects beta.52. The compass is hidden only while a table or the elevation chart is open and has taken the tools away, when the map is small. With the map at full size, Hide tools leaves the compass, which students use. Hide the toolbar 1.4.

## The compass hides with the tools (5.0.0-beta.52)

When the tools are hidden (Hide tools, or while a table or the elevation chart is open), the compass is hidden too, so the map has the space. Show tools brings both back. The scale bar stays. Hide the toolbar 1.3.

## The keyboard's ring and cross on the map: only after the keyboard (5.0.0-beta.65)

Keyboard on the map 1.1. The ring round the map and the cross at its centre (5.0.0-beta.57) were shown whenever the browser said the map had a visible focus (`:focus-visible`). Browsers also say so when code gives the map the focus after a click on something that can't take the focus, and the SDK gives the map the focus when Sketch starts drawing. In Safari a tap on a button counts as such a click, so on an iPad the ring and cross showed after using Sketch, with no keyboard. Now the app keeps track itself: any key (not Shift, Ctrl, Alt or Cmd alone) counts as the keyboard, any press of a pointer or finger as not, and the ring and cross show only when the map has the focus and the keyboard was the last thing used. Seen in Chromium by clicking the header and then starting Sketch; Safari wasn't available to test here. Test: `tests/live-keyboard.py`.

## In the main app since 5.0.0-beta.64: the plain Filter panel and styled fills laid on the ground in 3D

`features.plainFilter` and `features.drapeFills` are on by default (Filter 1.5, 2D to 3D 1.3). `config/classic.json` turns both off; the tests of the Filter panel and of fills as they were use it. Seen with a hatch, a land-use and a pencil fill: the swatch's clear edge and border are now left off each repeat, which showed as seams.

## Sketched areas with a styled fill, in 3D (5.0.0-beta.63)

The 3D view draws a hatch, land-use or pencil fill as a thin outline only. From 2D to 3D 1.2, each such area gets a helper drawing in 3D that is the view's own (`syncFills3d` in `src/view-mode.js`): a thicker outline and a light tint. Nothing is added to the sketch, the layer list or a saved file, and it is taken away on going back to 2D.

**Lab** (`features.drapeFills`): the fill itself is drawn into a picture cut to the area's shape and laid on the ground (a MediaLayer the list doesn't show; sizes from `drapeSize` in `lib/threed.js`). The pattern is fixed to the ground (about six repeats across the area), where 2D keeps it the same size on screen, so it grows and softens as you zoom in. At most 40 areas get a picture.

Test: `tests/live-fills-3d.py`.

## Lab: the Filter panel in plain words (5.0.0-beta.60)

Lab config only (`?config=lab`, `features.plainFilter`, Filter 1.3). The main app keeps the panel it had. For students:

- the heading names the layer ("Show Earthquakes (Major) where"); "Add another condition"; "has a value" / "has no value";
- a label that can be seen above each box (Look at, Keep where it, Number / Words / Any of these, From, To), and each box's own name starts with those words (WCAG 2.5.3);
- the conditions offered first are the few most used (number: greater than, less than, at least, at most, between, is; text: is, is one of, includes), with More… for the rest (`SIMPLE_OPERATORS`);
- "Histogram" is "Chart of values", with a caption that says what the bars are, the average marked on the chart, the value shown over the slider's handle, and the word histogram given at the end;
- the filter is said back as a sentence ("Showing Earthquakes (Major) where Magnitude is at least 8."), `describeFilter` in `lib/filter.js`, with the numbers on their own line at the right ("60 shown, 889 hidden, out of 949"). Filter 1.4 (5.0.0-beta.61): that line, and is greater than / is less than in the short list of number conditions.

Test: `tests/live-filter-plain.py`.

## Lab: fish in the sea of an elevation profile (5.0.0-beta.51)

Lab config only (`?config=lab`, `features.profileFish`, `lib/fish.js`, Fish in the profile 1.0). A light-hearted extra, expected to be taken out again.

- Where a profile goes below sea level, three to six small fish wander at random in the upper water of the chart, turning back at the chart's edges and at land, and staying between sea level and the sea bed.
- They are decoration, not data: not to scale (the chart is stretched many times over), hidden from screen readers, never in the pointer's way, and still while a place on the line is being read.
- A **Fish** button beside the units turns them on and off. They start off on a device set to reduce motion.
- Tests: `tests/fish.test.mjs` (10) and `tests/live-fish.py` (10). Wording 1.12 in `locales/es.json`.

## The rest of the lab features move to the main app (5.0.0-beta.50)

Lesson questions (`features.lessonQuestions`), paired 2D and 3D maps (`features.pairs`), columns in 3D (`features.columns3d`) and sketch layers (`features.sketchLayers`) are on by default in every config. The lab config now turns on nothing extra; it stays as the place for the next experiment. A config can still turn any of them off: `config/basic.json` does, and the browser tests use it to check the app with them off.

- **The version button is in the header**, at the right, so it is off the map.
- **Hide tools sits at the bottom right, level with the toolbar** and beside it; where the screen is too narrow for both, it moves above the toolbar as before.

## Tool tips, Hide tools and outline maps move to the main app (5.0.0-beta.49)

- **In the main app now** (on by default in every config): tool tips (`features.toolTips`), hiding the toolbar (`features.hideToolbar`) and Print an outline map (`features.outlinePrint`). Still lab only: lesson questions, paired 2D and 3D maps, columns in 3D, sketch layers.
- **The Tips on/off switch is taken away for now** (Tool tips 1.2); it looked out of place. The tips are on. A config can bring the switch back with `features.tipsSwitch`; that path has no browser test at present.
- **The Tools button reads Hide tools or Show tools, and is at the bottom right** beside the version button (Hide the toolbar 1.1). One button serves 2D and 3D. Its words are its name for a screen reader, so it no longer also reports an expanded state.
- Wording 1.11 in `locales/es.json`.

## Lab: print an outline map (5.0.0-beta.48)

Lab config only (`?config=lab`). From teachers, who print world, continent and country outline maps for class and found Print (a picture of the screen, basemap and all) a poor fit. Outline maps 1.0 (`features.outlinePrint`, `lib/outline.js`).

- **Print an outline map**, a new tile in the Save panel. Choose one of eight maps: the world with its continents; Africa, Asia, Europe, North America, South America, or Australia and Oceania with their countries; the United States with its states. **Show names** adds the names; without it the map is blank for the class to label.
- **Black lines on white**, drawn by the app as a vector picture from Esri's public boundary layers, not from the map on screen: no basemap, no colours, sharp at any size, fills the page. A line for the student's name and the date is printed above it. Wide maps ask for a landscape page.
- **Projections keep areas true**: Equal Earth for the world, an azimuthal equal-area projection centred on each continent, Albers for the United States, with Alaska and Hawaii in boxes at the bottom left.
- **Choices worth knowing.** Esri's layer files Russia (all but Kaliningrad) and Papua New Guinea under Asia; here Russia is also on the map of Europe, running off the page's edge as on any map of Europe, and Papua New Guinea is with Oceania. Small Pacific islands east of 180° are off the Oceania page. A country too small for its name at this size is left unnamed (US states fall back to their two letters). Disputed borders are as Esri's layer draws them.
- Nothing is sent anywhere; the boundaries for a map are fetched once when it is chosen (0.1 to 1.4 MB).
- Wording 1.10 in `locales/es.json`. Tests: `tests/outline.test.mjs` (19) and `tests/live-outline.py` (10). Not tested: a real printer.

## Whole numbers in Measure; the app is named AtlasLab; no Sign in button in the header (5.0.0-beta.47)

All configs.

- **Measure shows whole numbers.** The panel's distance, area and perimeter have no decimal places: "12,567,745 km²", not "12,567,744.51 km²" (Units 1.1, `wholeNumberText` in `lib/units.js`). A value under 1 is left as it is, because rounding it would say 0. **Not changed: the figure drawn on the map itself.** Esri's measurement component draws it as part of the map picture and has no setting for decimal places, so it still shows two. In 3D the same applies.
- **The app's name is AtlasLab** where a config gives no name of its own (it was "School Atlas"). The MapMaker config keeps its name.
- **No Sign in button in the header.** Sign-in is still offered in the Save panel, where it is used. A config can bring the header button back (`"signIn": { "headerButton": true }`).
- Tests: `tests/units.test.mjs` (50) and a new check in `tests/live-components.py` (20).

## Lab: hide the toolbar to give the map the whole screen (5.0.0-beta.46)

Lab config only (`?config=lab`). From people shown the app. Hide the toolbar 1.0 (`features.hideToolbar`).

- **A Tools button at the bottom left of the map**, with its word, hides the row of tools at any time and brings it back. Until now the toolbar was only tucked away while a table or the elevation chart was open, and the button that brought it back was nine dots with no word (finding 6 of the persona review).
- Hidden stays hidden, including after a table or the elevation chart has been opened and closed, until the button is used again. It is not remembered when the page is opened again: the app always starts with its tools showing.
- The button says "Hide map tools" or "Show map tools" to a screen reader, works by keyboard, and has a tip.
- Wording 1.9 in `locales/es.json`. `tests/live-toolbar-hide.py` (7).

## Lab: tips on every tool, not only the toolbar (5.0.0-beta.45)

Lab config only (`?config=lab`). Tool tips 1.1.

- **Every tool of the app's own now has a tip**, for consistency: a layer's tools in Map layers (zoom to, legend, transparency, swipe, table, chart, filter, description, rename, remove, the drag handle and the tools toggle), Remove all layers, Measure's Distance, Area, Coordinates and Clear, About this map, Questions, the compass, the button that shows the map tools, Add bookmark and the versions button. 35 tips with the toolbar's twelve. Same behaviour and the same Tips switch as before.
- **Not covered:** the map library's own controls (Search, Home, Zoom, the Sketch toolbar), which keep its tooltips, and buttons whose words already say what they do (Apply, Cancel, Open map).
- **Screen readers** get each tip as the tool's description whether the Tips switch is on or off; the switch is about what appears on screen.
- One set of listeners on the page now serves every tip, in place of listeners on each tool, so tools made later (a layer's tools are rebuilt often) need only a `data-tip-key`.
- Wording 1.8 in `locales/es.json`. `tests/live-tips-questions.py` is now 22 checks.

## Lab: tool tips with a Tips switch, and a lesson's questions beside the map (5.0.0-beta.44)

Lab config only (`?config=lab`), to try. Both come from people shown the app, and from the persona review of 14 November (`review/persona-2026-11-14/`).

- **Tool tips** (`features.toolTips`, Tool tips 1.0). Resting the pointer on a toolbar tool for about a second shows one line on what it does ("The key: what the colours and symbols on the map mean."). A quick click never sees it. By keyboard the tip shows on focus, and it is the tool's description for a screen reader. **Tips: on / off** beside the version button turns them off and back on; the choice is kept in that browser. Off, a tool's tooltip is its name, as before. A config can start with them off (`"tipsStart": "off"`). Tooltips do not appear on a tablet.
- **Lesson questions** (`features.lessonQuestions`, Lesson questions 1.0, `lib/questions.js`). A map's author puts the questions in the item's description under a heading **Questions** (the word on its own line, bold or a heading; a numbered or bulleted list under it). The app then shows a **Questions** button beside the map's title, and the questions open beside the map when it opens. Closing the panel is respected; the button brings it back. If the item's summary is itself a question, it is shown above the list, and a map with only that gets the button without the panel opening by itself. "Preguntas" works as the heading too.
- Wording 1.7 in `locales/es.json`; lab config version up by one.
- Tests: `tests/questions.test.mjs` (8) and `tests/live-tips-questions.py` (17). The live test adds a Questions list to a real map's description as it is fetched: no map in the test group has one yet.
- The persona review record now shows the "saving on a shared cart" finding as withdrawn (students sign in with their school identity, so a saved file follows them) and lists the feedback from real users.

## "Save a locked copy" is off (5.0.0-beta.43)

All configs. The third tile in the Save panel confused a group shown the app, and the case it guards against is narrow, so it is hidden.

- **What changed.** The Save panel offers Save and Save as. Save a locked copy is hidden unless a config sets `features.lockedCopy` to `true`; none does, including the lab.
- **What did not.** A file already saved as locked is still respected: opening it shows "This map is locked. Save makes your own copy.", and Save never writes over it. The file format is unchanged.
- **What the lock was for, so the decision can be revisited.** In Chrome and Edge on a laptop or Chromebook, Save writes back to the file that was opened. If a class shares one writable copy of a map (a shared folder students can write to, or a shared computer where the next class opens the same file), one student's Save changes it for everyone after. The lock prevented that. It does not arise where each student gets their own copy (a download from a learning platform or a link), where the shared folder is read-only for students, or in Safari and Firefox, which always save a new file.
- Wording 1.6 in `locales/es.json` (a note about locked maps shortened). `tests/live-lock.py` (4) checks the tile is off by default and that the switch brings it back.

## Clearer wording for finishing a profile line by touch, and for 2D or 3D being unavailable (5.0.0-beta.42)

All configs. From use on an iPad.

- **Elevation profile on a touchscreen.** The message said "then tap Finish line", but the button is at the bottom right and easy to miss. It now reads "Tap for each point of the line. Double-tap the last point to finish, or use the Finish line button below." Double-tap already worked; it was not mentioned. The first message, before any point, says the same. Wording 1.5 in `locales/es.json`.
- **2D or 3D unavailable.** When a map is a 3D scene with no 2D version, or is set to 2D only, the greyed 2D or 3D button showed the "no entry" pointer. It now keeps the ordinary pointer, and its tooltip (and the message when it is chosen) starts with what is unavailable: "Not available in 2D: this is a 3D map." or "Not available in 3D: this map is set to 2D only." The tooltip is the browser's own, so it appears after about a second.
- Tests: `tests/live-touch.py` checks the new message. The rest run in GitHub Actions before publishing.

## A build step, browser tests on every change, a developer guide (5.0.0-beta.41)

**No visible change.** How the app is checked and published, not what it does.

- **Build** (`npm run build`, `tools/build.mjs`). The 37 source files are joined and shrunk into one, `dist/app.js`: 526 KB becomes 287 KB (164 KB becomes 102 KB as sent, compressed), and 38 requests become one. The source still runs in a browser as it is; that is how it is developed. Code structure 3.0 in the versions table.
- **Every browser test now runs in GitHub Actions** (`.github/workflows/site.yml`) on each pull request and each change to `main`: all 23 live tests in Chromium against the built copy, side by side, in about ten minutes. Until now they were run by hand.
- **Firefox and WebKit** run a short set (start-up, Open map, panels, units, security). They pass. WebKit also starts the app from the unbuilt source, which is the first check of the 38-file loading in Safari's engine. It is Playwright's build of WebKit on Linux, not Safari on an iPad, and it is a current WebKit, so it does not show how Safari before version 27 behaves. These runs are reported but do not yet hold up publishing.
- **Publishing waits for the tests.** The `publish` job puts `dist/` on GitHub Pages only when the unit tests, the linter and every Chromium browser test pass. A failure leaves the site as it was. **It needs one setting changed: Settings > Pages > Source, to "GitHub Actions".** Until then the job says so and stops, and Pages serves the source from `main` as before.
- **Every Monday** the whole workflow runs with nothing changed, to notice when Esri's hosted map library or a service changes under the app.
- **[DEVELOPING.md](DEVELOPING.md)**: the developer guide. Where things are, the three rules that keep the files loading in order, how to release (`npm run bump -- <version>` sets the version everywhere it must match), how to run the tests.
- **Found on the way: a fault in Esri's Coordinates component.** It sometimes throws a script error on its first drawing (it asks for two sets of wording and fails when the older one arrives first), then draws correctly. It comes and goes with network timing and is in Esri's code at `js.arcgis.com`, not the app's. The Coordinates tool still works in every run. `tests/live-components.py` now notes it without failing; any other script error still fails.
- Test tools: `ATLAS_SERVE=dist` points any live test at the built copy and `ATLAS_BROWSER=firefox` or `webkit` picks the browser (`tests/csp_shim.py`).

## Restructure, part 2: `app.js` split into 27 files (5.0.0-beta.40)

**No visible change.** `app.js` was one file of 4,790 lines. It is now a short file that starts the app, and the code is in `src/`, one file for each of the sections the old file was labelled with. The code inside each file is unchanged apart from `import` and `export` lines; a script did the split from the code's own scopes, and the linter confirms that no name is missing or imported without being used.

| File | What it holds | Lines |
|---|---|---|
| `src/state.js` | What the files share and set (Code structure 2.0) | 42 |
| `src/config.js` | Config (a start-up file) | 74 |
| `src/branding.js` | Branding and text (a start-up file) | 134 |
| `src/sdk.js` | ArcGIS SDK (a start-up file) | 82 |
| `src/views.js` | Map, views and widgets (a start-up file) | 174 |
| `src/session.js` | The open map: changed or saved, its title, its lists of layers | 89 |
| `src/ui.js` | Toast, panels, modals | 137 |
| `src/popups.js` | Pop-ups | 15 |
| `src/sketch.js` | Sketch | 660 |
| `src/legend-basemaps-measure.js` | Legend, basemaps, measure | 611 |
| `src/view-mode.js` | 2D / 3D | 206 |
| `src/maps.js` | Maps and layers | 404 |
| `src/data-layers.js` | Data layers | 85 |
| `src/layers-panel.js` | Map layers panel | 466 |
| `src/filter-panel.js` | Filter | 301 |
| `src/bookmarks.js` | Bookmarks | 75 |
| `src/topics.js` | Topics | 33 |
| `src/collection.js` | Collection browser | 369 |
| `src/item-info.js` | Map and item information | 46 |
| `src/csv-import.js` | CSV import | 350 |
| `src/drag-drop.js` | Drag and drop | 39 |
| `src/local-files.js` | Local save and open | 213 |
| `src/saved-maps.js` | Saved maps on this device | 116 |
| `src/print.js` | Print | 28 |
| `src/arcgis-online.js` | ArcGIS Online: sign in, save, update | 277 |
| `src/versions.js` | Versions | 56 |
| `src/startup.js` | Start-up | 30 |

How the files are loaded, and why:

- **The four start-up files** each wait for something (the config, the map library, the map). `app.js` loads them one after another, each finished before the next begins. Safari before version 27 goes wrong when two files wait on a third that is still loading ([WebKit bug 242740](https://bugs.webkit.org/show_bug.cgi?id=242740)); loading them in turn avoids that. Not tested in Safari itself.
- **The other 22 files** import from each other freely, and still run in the order they were written in: each one's first import is the file before it. That keeps start-up exactly as it was.
- **Five functions** that a start-up file calls but that live in a later file are reached through `late` in `src/state.js`.
- **`app.js` asks for all 37 files at once** (`src/` and `lib/`) as it starts, so they download together while the map library loads. These are plain requests that fill the browser's cache, not `modulepreload`: I could not check how Safari's older module loader treats preloaded modules, and plain requests cannot affect the order the files run in.
- New checks: `tests/structure.test.mjs` (10: one version on every address, the start-up rule, the fixed order, the list of files), and a linter rule that only the start-up files may wait at their top level.

Loading, measured here on a local server (no network delay, so this shows only that nothing got slower to run): ready in a median 4.4 s against 4.3 s before, which is no real difference; 38 files of the app's own JavaScript against 12; 540 KB against 516 KB before compression. On a slow school connection more files could cost more; that is what the build step (next) is for, and it has not been measured.

- Tests: the full live set passes (23 runs, 619 checks) with nothing blocked by the security policy; unit tests and linter pass.

## Restructure, part 1: a linter and shared state (5.0.0-beta.39)

**No visible change.** The first step of splitting `app.js` into separate files.

- **Linter.** ESLint (`eslint.config.mjs`; `npm install`, then `npm run lint`) runs on every pull request beside the unit tests. It found 23 things, none of them a fault a user could meet: unused imports and variables, one unused function (`showItemInfo`), two needless escapes. All removed.
- **Shared state** (`src/state.js`, Code structure 1.0 in the versions table). The 21 values that more than one section of `app.js` sets (the view in use, 2D or 3D, the open map, who is signed in, the sketch layer being drawn on, and so on) are now read and set as `state.name` from one place: 477 references changed, by a script that follows the code's own scopes rather than by search and replace. Once the sections are separate files they cannot set each other's variables, so this had to come first.
- Tests: the full live set passes (23 runs, 619 checks) with nothing blocked by the security policy, and the unit tests.

## Security: the token out of thumbnail links, a Content Security Policy, a threat model; pinch zooms the map only (5.0.0-beta.38)

All configs. Nothing looks different except the pinch.

- **Private thumbnails no longer carry the sign-in token.** For an item that isn't public, the card's picture address used to end `?token=…`, written into the page. The token now goes in a request header (`X-Esri-Authorization`) and the picture is shown from a `blob:` address. Signing out forgets those pictures. Public items are loaded as before, with no token.
- **Content Security Policy** (a `<meta>` tag, as GitHub Pages can't send headers). Script runs only from the app's files and `js.arcgis.com`; script written into the page, inline event handlers, script from other sites and plug-ins are refused. `'unsafe-eval'` had to stay: Esri's chart component needs it (without it no chart draws). The sign-in callback page has its own, stricter policy, and its script moved to `oauth-callback.js`.
- **[SECURITY.md](SECURITY.md)**: the threat model. What is protected, what is in place, and eight things still open. The main ones: the map library still puts the token in the address of its own requests when signed in; every page under `jsawle.github.io` shares one origin; a meta policy can't stop framing.
- **A pinch zooms the map, never the page.** On a touchscreen, a pinch that began on the header, a toolbar or a panel enlarged the whole app. The page now takes one-finger scrolling only (`touch-action`). Safari's own zoom (the aA menu) and the device's Zoom accessibility setting still work, which is what keeps text resizable for people who need it.
- Tests: `tests/live-security.py` (23) and `tests/live-pinch.py` (6, which failed before the change). Every live test now fails if the policy blocks anything (`tests/csp_shim.py`); the full set passes with nothing blocked. Not tested: a real sign-in (a made-up token and an answering test stood in), and Safari itself.

## Panels and dialogs fit the screen, including in Safari (5.0.0-beta.37)

All configs. Reported on an iPad: the Open map dialog ran off the bottom of the screen.

- **Open map and Add layer** were `100vh` minus a margin tall. In Safari `100vh` can be taller than the area between its toolbars, which is what a full-screen dialog actually fills, so the bottom of the card was cut off. They now fill the dialog's own area, which is always the visible screen. A stand-in in Chromium (that area made 150 px shorter than the window) put both 126 px off the bottom in beta.36; they now fit.
- **Panels over a chart, table or profile.** With one of those open under the map the toolbar is tucked away, but the panels still kept 88 px for it (58 px on narrower screens), so on an iPad Map layers was squeezed to its heading. They now use that room: Map layers over a chart grew from 128 px to 237 px on a 1148 × 643 window, and on phones the panels sit lower and can be taller.
- **Docks** (chart, table, profile) and the phone layout of Open map's categories use the visible height (`dvh`), with `vh` kept for browsers that don't know it.
- Tests: `tests/live-panels.py` (56): every tool's panel or dialog inside the window at 1148 × 643 and 820 × 1010 (an iPad in Safari), 1366 × 650 and 390 × 660; Map layers over a chart at all four; the two dialogs inside a visible area shorter than `100vh`. Not tested in Safari itself.

## Elevation profile 3.4: drawing with a finger (5.0.0-beta.36)

All configs. Elevation profile 3.3 → 3.4. Reported on an iPad: drawing a profile line by touch was slow or didn't work.

- **The line so far is drawn through the places tapped, with a dot at each.** It used to follow the mouse pointer, which a finger doesn't have, so on a touch screen nothing showed between taps.
- **Finish line and Undo point buttons** appear in the dock while a line is being drawn, for every kind of pointer. Before, the only ways to finish were a double-click (a double-tap on touch) or Enter, which an iPad without a keyboard doesn't have. Double-click and Enter still work.
- **Touch wording.** "Tap the map for each point of a line, then tap Finish line." on a device without a hovering pointer, and once a finger has been used.
- **Panning with a finger no longer asks the map what is under it.** One finger pan in 3D with the tool open made 20 hit tests (110 ms on the test machine; more on a tablet); now none. While drawing, the line no longer jumps to the finger as the map pans.
- **Handles are easier to hit with a finger** (24 px instead of 12), measured from where the finger first touched, since the map reports a drag's start a few pixels later.
- **Saving:** the My map files note no longer mentions a USB stick ("such as your computer or a school drive"), in English and Spanish.
- Tests: `tests/live-touch.py` (13 in 2D with an axe-core scan, 12 with `--3d`), using Chromium's touch input on an iPad-sized page. `tests/live-elevation.py` still passes (67). Not tested on a real iPad or in Safari.

## Opens zoomed in to fill the map; charts kept with a layer's item (5.0.0-beta.35)

All configs. Charts 1.0 → 1.1.

- **The app opens at the zoom where the world fills the map's width.** The map library doesn't repeat the world sideways when zoomed out, so the built-in zoom 2 (a world 1,024 px wide) left white bands either side on a wider screen. The app now opens at the config's zoom, or closer when that would happen. Typical results: zoom 3 at 1366 and 1907 px wide, zoom 4 at 2560 px. A config's own closer zoom (example-es: 7) is kept, and New map goes back to the same place.
- **Charts kept with a layer's own item.** Map Viewer can keep a chart in the map or, with "Save layer", in the layer's item. The SDK reads the item's charts only once the layer has loaded, after the map has opened, so the opening message didn't say "This map has a chart" for those. It now says so once the layers have loaded. The Chart button already worked.
- **"Sunken ships of WWII" (88b2015479344fce817ec4398f3774f1) is broken in its content, not in the app.** Its two ship layers point at layer 69 of the *Sunken Ships of the Second World War* service (owner mapsterman), which was republished in August 2026 and now has a single layer, 68. Both layers fail to load, with their 7 charts, here and in the live MapMaker, which uses the same map. The layer items (7760bf14…, 1cd0d026…, owner mm.atlas) need their URL changed to `…/FeatureServer/68` and the layer id in their data changed from 69 to 68.
- Tests: `tests/live-start.py` (5): the opening zoom at four widths, with the map drawn to both edges, and a config's own zoom kept. `tests/live-charts.py` (25): a chart moved from the map to the layer's item is announced, has its Chart button and draws. `live-charts`, `live-components`, `live-elevation` and `live-units` now wait for the app to create the map before looking at it.

## Elevation profile 3.3: change a drawn line, and New profile (5.0.0-beta.34)

All configs. Elevation profile 3.2 → 3.3.

- **Change a drawn line by dragging, as in MapMaker.** Its points are orange handles, and a white handle halfway along each part adds a point. Drag a handle and the line follows; the heights are found again when it is let go. Double-click a point to take it out (a line keeps at least two). The map does not pan while a handle is dragged, in 2D or 3D. Over a handle the pointer is a hand. A line chosen on the map (a sketch, a feature) has no handles: change it with Sketch.
- **"New line" is now "New profile"** ("Nuevo perfil" in Spanish), as in MapMaker.
- **"Total climb and descent for lines up to 50 km"** now reads as one phrase, without the gap of a label and its figure.
- Dragging is not the only way to get a different line: New profile and clicking the points again does the same with single clicks, as WCAG 2.2's dragging-movements rule asks.
- Tests: `tests/live-elevation.py` (68, with an axe-core scan): handles on a drawn line and not on a sketched one, the hand pointer, a press without a move changing nothing, a halfway handle dragged into a new point, the map not panning, an end dragged, a point double-clicked out, New profile clearing everything. Dragging in 3D checked by hand-run script (the camera did not move).

## Elevation profile 3.2: honest scales (5.0.0-beta.33)

All configs. Elevation profile 3.1 → 3.2.

- **Vertical exaggeration is shown.** The chart stretches heights to fill its space, so a profile is always drawn taller than true. How much depends on the line and the screen: 64 times for an Atlantic crossing on a 1366 × 768 screen, 132 times for 65 km of the Hungarian plain on a wide one. The figure is now under the chart ("Vertical exaggeration ×64"), told to screen readers, and explained on hover ("Heights are drawn 64 times as tall as distances. Slopes look steeper than they are."). Close to 1 it reads "×1 (true shape)". It follows the chart when the window changes size.
- **The same line gives the same figures on every screen.** Heights are always taken at 512 points along the line. Before, a narrower screen took fewer (402 at 1024 × 640), which changed the highest and lowest points and the totals.
- **Total climb and total descent only for lines up to 50 km (31 mi).** They add up every rise and fall between the points, so on a long line they count bumps between points kilometres apart, and grow with every extra point: Venezuela to Mali gave 18,310 m of climb from 128 points, 36,769 m from 512 and 60,751 m from 4,096. Up to 50 km the points are 100 m apart or less. A longer line says "Total climb and descent for lines up to 50 km" in their place.
- **At least three heights on the scale.** On a 1366 × 768 screen an ocean line showed only 0 and −5,000 m; it now shows 0, −2,500 and −5,000 m.
- **Not changed:** the height scale still fits the line's own range, so it starts at the lowest point, not at 0 (on land), and the heights still come from Esri's World Elevation TopoBathy service at its "auto" resolution.
- Tests: `tests/live-elevation.py` (57, with an axe-core scan): the figure row, a short line with its totals, three heights at 1366 × 768, the vertical exaggeration shown against the one measured on the chart (×64 against ×63.8), and the same figures from 512 points at 1366 × 768 and 1024 × 640.

## Sketch layer work brought over from the old folder (5.0.0-beta.32)

Two changes were released into `localmapsave/atlas-sketch/` on 13 November after 5.0 had moved here: *The sketch layer in Map layers* (there as beta.30) and *Sketch layers: move them, and make more than one* (there as beta.31). Both are in this repository from 5.0.0-beta.32, unchanged, beside paired 2D and 3D maps. The numbers beta.30 and beta.31 here are the move and paired maps.

- **Together with paired maps:** every sketch layer goes across when a pair swaps versions, and your own layers (sketch layers, spreadsheets, added layers) keep the drawing order you gave them, above the version's own layers.
- `?config=lab` has both lab features on: paired 2D and 3D maps, and more than one sketch layer.

## Sketch layers: move them, and make more than one (5.0.0-beta.32)

Saved-map format 3.6; Sketch layers part 1.0.

**All configs**
- A sketch layer is **moved in the drawing order like any other layer** (drag, or the arrow keys on its handle). Before, sketches were always on top.
- A layer you add later (from the collection, or a spreadsheet) goes **under the sketch layers that are on top**, so new data doesn't cover sketches. A sketch layer you have moved down stays where you put it.
- The layer order is saved and put back when the map is opened, sketch and spreadsheet layers included. (Before, spreadsheet layers came back above the map's own layers whatever their place had been.)

**Lab (`?config=lab`, `features.sketchLayers`): more than one sketch layer**
- The first sketch still needs nothing: it goes on "My sketches", made for you.
- **Add layer > New sketch layer**: name it, and Sketch opens drawing on it.
- **Sketch > Drawing on**: says which layer the tools draw on and lets you switch; "New sketch layer…" is at the end of the list.
- In Map layers each sketch layer has its own row and tools, with **Rename**. Remove takes a further layer away with its sketches (it asks first if it has any). "My sketches" can be emptied, not removed.
- A further layer is listed even when empty; "My sketches" only once it has a sketch.

**In the file.** "My sketches" is saved exactly as before. A further layer's parts have ids `__sketch_<key>_points` and so on, and carry its key and name in an app property (`atlasSketchLayer`). Map Viewer and the marking app still see ordinary sketch layers; the marking app reads them as one set. A map with several sketch layers opens with them in any config, with the Drawing on picker, but only the lab config can make new ones.

**Not in this version**
- Moving a sketch from one layer to another.
- Clicking a sketch on another layer to edit it: choose its layer in Drawing on first. (With Sketch closed, clicking any sketch opens its pop-up as before.)
- The marking app reporting per sketch layer.

Tests: `tests/sketch-layers.test.mjs` (22, the file format) and `tests/live-sketch-layer.py` (45, in the browser).

## The sketch layer in Map layers (5.0.0-beta.32)

Saved-map format 3.5. All configs.

- **Listed only when it has sketches.** Map layers showed "My sketches" for every map, including a web map just opened with nothing sketched on it. The row now appears with the first sketch and goes with the last.
- **Layer tools.** The sketch layer had Zoom to only. It now has Adjust transparency, Swipe (2D, as for other layers) and **Delete all sketches**, which asks first because sketches can't be added back. Not given: legend, table, filter and description, which don't apply to sketches.
- **Transparency is saved** with the map (file and ArcGIS Online) and comes back when it is opened.
- When the last sketch goes, the layer is set back to shown and solid, so the next sketch isn't drawn on a hidden layer with no row to show it.
- Still one sketch layer per map. More than one is a larger change (the Sketch tool, the saved file, bookmarks and the marking app all assume one) and is not in this release.
- Test: `tests/live-sketch-layer.py` (17).
## Paired 2D and 3D maps (5.0.0-beta.31, lab)

Paired maps 1.0; Collection browser 2.1 unchanged apart from the pair's card. On in `?config=lab` only (`features.pairs`).

The 3D button draws a web map in the 3D view as it is, and the result is often not what its author would have made. An author can now make the 3D version themselves, as a web scene with 3D symbols, and tell the app the two belong together. The 3D button then opens the scene, and the 2D button on the scene opens the web map.

**For authors: two tags.** In ArcGIS Online, on each item's page:

| On | Add the tag |
|---|---|
| the web map | `atlas-3d-<the scene's item ID>` |
| the web scene | `atlas-2d-<the web map's item ID>` |

The item ID is the 32 characters after `id=` in the item's address. Capitals don't matter. Both items need to be public, and for one card in Open map both need to be in the content group. Tag both: a scene opened from a link only knows its 2D version from its own tag.

**What goes across** when the button swaps one version for the other:

- **Kept:** sketches, spreadsheet layers, layers added with Add layer, bookmarks made in the app, the map's title, and the place being looked at (same centre and scale; 3D is tilted as usual).
- **Each version's own:** the author's layers, so filters and layers switched on or off stay with the version they were set on. The author's bookmarks are replaced by the other version's (a scene's slides).
- **While the pair is open** a version already visited is kept as it was left, so going 2D, 3D, 2D finds the 2D filters still on. The first swap says what happened; later ones say only which version is open.

**Open map.** A pair is one card marked **2D + 3D**. Under *All* and *2D maps* it is the web map's card and opens in 2D. Under *3D maps* it is the scene's card and opens in 3D. It counts in both. Either item's words and categories find it. If the scene is tagged but not in the group, the web map's card is still marked and the buttons still work, but the pair is not under *3D maps*.

**Saved maps.** A saved file is still a web map (saved from 2D) or a web scene (saved from 3D). It names the pair (`atlasPair`, beside `atlasLocked` and `atlas2dOnly`), so it can still swap after it is opened again.

- **If the partner can't be opened** (deleted, not public, the wrong kind of item): going to 3D draws the web map in 3D as before, with a message; going to 2D stays in 3D, with a message.
- **`atlas-2d-only` comes first:** a web map with that tag stays 2D whatever else it is tagged.
- **Not included:** a file saved from 3D does not hold filters set on the 2D version, and the other way round. A collection of more than 1,000 maps (searched in ArcGIS Online, not in the browser) shows the two as separate cards. Two web maps naming the same scene: the first in the list has it.
- **Also fixed on the way:** swapping a basemap between the 2D and 3D views and back made the SDK log an error (`openGlyphPorts`). For a pair, the 2D view now keeps the web map while its scene is on screen, which also makes going back quicker.
- Tests: `node tests/pairs.test.mjs` (39) and `python3 tests/live-pairs.py` (37 checks, with axe-core scans). Until the test group has a pair its author tagged, the live test adds the two tags to what ArcGIS Online answers for "Volcanoes Around the World" and the La Palma scene; everything else in it is real.

## Its own repository (5.0.0-beta.30)

No visible change. 5.0 moved from `jsawle/localmapsave/atlas-sketch/` to this repository, with its commit history, and is published at `https://jsawle.github.io/AtlasLab/`. The old address sends people here, keeping whatever followed it in the link (`?config=…&webmap=…`), so shared links still open the same map.

- **Saved maps and settings carry over.** Both addresses are on the same site (`jsawle.github.io`), so *My map files*, the km / mi choice and the other things kept in the browser are the same as before.
- **Sign-in** needs `https://jsawle.github.io/AtlasLab/oauth-callback.html` added as a redirect URI on the app's client ID in ArcGIS Online.
- **Tests** run from the repository's top folder: `node tests/<name>.test.mjs` and `python3 tests/live-<name>.py`. The unit tests run on every pull request (`.github/workflows/tests.yml`).

## A map saved in 3D opens in 3D, with its columns (5.0.0-beta.29)

Saved-map format 3.4; Columns in 3D part 0.4.

- **The 3D view.** A map saved to a file while in 3D opened in 2D. The file now notes the 3D view and where it was seen from, and opens in 3D from the same place. A map saved from 2D opens in 2D as before. All configs.
- **Columns (lab).** Show as columns in 3D is now kept with the layer in the file, so the columns come back, whether the file was saved from 3D or 2D.
- **How it is stored.** The file is still an ArcGIS web map and each layer's saved style is still the 2D one, since a web map has no 3D view or 3D symbols of its own. The two notes are properties of this app's (`atlas3d` on the map, `atlasColumns3d` on the layer), as `atlasLocked` and `atlas2dOnly` already are. So in Map Viewer the map is a normal 2D map with sized points, and a file opened with a config that has columns switched off opens in 3D with sized points.
- **Not included:** saving to ArcGIS Online does not note the 3D view (the columns note is on the layer either way). A 3D map (web scene) already kept its camera; it now keeps columns too.
- Tests: `columns.test.mjs` (24) and `live-columns.py` (36: save in 3D, open again, same camera and columns; the 2D copy; a config without the switch).

## Switching to 3D keeps the place (5.0.0-beta.28)

Switching from 2D to 3D tilts the view. The app asked the 3D view for the tilt alone, and the view tilted about a different point: zoomed in to street level it ended up a few kilometres to one side (4 km south, over the bay, for a spreadsheet in San Diego), so data that had been in view was gone. The move now names the place and scale the 2D map had, so the 3D view looks at the same spot, tilted. All configs; it was the same with no spreadsheet and in beta.21. At small scales (a country, the world) the shift was too small to see, which is why it went unnoticed.

## Reverse colours; columns offered in 3D only (5.0.0-beta.27)

- **Reverse colours** (all configs, spreadsheet data 3.6): Color & size has a tick box under the colour ramps. Ticked, the ramp runs the other way: low values get its dark end. The ramp buttons flip to show it. It is part of the saved style, so it comes back from a file and in Change style.
- **Lab, Show as columns in 3D** is now offered in the 3D view only (part 0.3). In 2D it was there but changed nothing on screen. A layer that has columns keeps them when its style is changed in 2D.
- The heading COLUMNS in that panel is the older one for choosing spreadsheet columns ("Size points by", "Label points with"). It isn't about 3D columns; the two uses of the word can be confused.

## A spreadsheet dropped in 3D is shown at an angle (5.0.0-beta.26)

Dropping a spreadsheet moved the 3D view to the points but kept looking straight down, which hides anything with height. Now, in 3D, a view that isn't tilted yet is tilted to 55° when it goes to the new points; a tilt you have already set is kept, and so is the heading. Cancel puts the 3D view back as it was, tilt included. 2D is unchanged. All configs.

## Lab: the Size slider sets column thickness (5.0.0-beta.25)

With columns on (`?config=lab`), the Size slider did nothing in 3D: column width was fixed from the spread of the points. Now it sets how thick the columns are (12 is the starting width, 24 twice as thick, 6 half). Height is unchanged, since height is what shows the number. The slider still reads "px", which is right for 2D only. Columns in 3D part 0.2.

## Pie charts aren't offered in 3D (5.0.0-beta.24)

Pie-chart layers only draw in 2D, but Add data still offered Pie charts in the 3D view. Now the tile is greyed out there, with the reason on hover ("Pie charts only draw in 2D. Switch to 2D to use them."), and comes back when you switch to 2D with the panel open. A layer that is already pie charts keeps its choice in Change style.

## Lab: a spreadsheet as columns in 3D (5.0.0-beta.23)

Only with `?config=lab` (`features.columns3d`); the other configs are unchanged. A trial to see what it looks like.

Points sized by a number are flat circles on the ground, and in a tilted 3D view their sizes can't be compared. With the switch on, the styles that size points (By size, Color & size, Type & size) get a tick box, **Show as columns in 3D**. Ticked, each point is a column in the 3D view and its height shows the number.

- **Height.** From zero when no value is below zero, so a column twice as tall is a number twice as big; a zero is a thin disc so the point can still be seen and clicked. With values below zero the lowest value gets the shortest column.
- **Scale.** Heights are real metres, set from how far apart the points are: the tallest column is about a sixth of the distance across the points and a column is a sixtieth of it wide. Six points across 1 km of a city give a tallest column of about 165 m.
- **Legend** shows a tall and a short column with the top and bottom numbers.
- **Colour** follows the style: one colour, a colour ramp, or a colour per type.
- **2D is unchanged**, and so is the saved style: a web map can't hold 3D symbols, so the file has the 2D style. **The tick is not kept in a saved file yet**; a reopened map shows sized points until it is ticked again.
- Not done: a column style for Locations (pins), labels checked against columns, many points (only tens tried), real devices.
- Columns in 3D part 0.1. Tests: `tests/columns.test.mjs` (12, the scale) and `tests/live-columns.py` (13, in the browser).
- Found while testing, not caused by this: replacing the Add data preview in the 3D view raises a script error whose message is just "n". It happens with columns off too. Not investigated.

## A 3D map's slides turn layers on and off (5.0.0-beta.22)

A slide in a web scene records which layers it shows. The app made each slide a bookmark with its camera only, so choosing one moved the view and left the layers as they were. Now a bookmark made from a slide turns the scene's layers on and off as the slide says (3D maps part 1.1).

- Only the scene's own layers change, those inside group layers too. The sketch layer, and layers you add after opening, stay as they are.
- Map layers shows the same ticks afterwards, and a saved copy keeps each slide's layers.
- **Not applied:** a slide's basemap, ground and lighting (date, time, weather). In the three test scenes every slide uses the scene's one basemap.
- Test: `tests/live-slides.py` (16 checks) reads what each slide should show from the scene's JSON, for the Garden and La Palma scenes of the test group. No test scene has group layers, so that path is untested.

## "3D maps", not "3D scenes" (5.0.0-beta.21)

What a person reads in the app now says **3D map** wherever it said 3D scene: the row in Open map (All, 2D maps, 3D maps), a card's button (Open 3D map), the count (3 3D maps), the words a screen reader gets after a card's title, the reason 2D is unavailable, and the note about saving to ArcGIS Online. English and Spanish. Nothing else changes: the items are still ArcGIS web scenes, the link parameter is still `webscene=`, and earlier sections of this file keep the word they were written with.

## Which content group the app reads (5.0.0-beta.20)

While 5.0 is a pilot it reads the test group **"Schools Living Atlas – 5.0 test"** (`c3ac404ac811494ea6fa116abc0cf39b`, GIS 4 Schools org, owner Si_Claudius) on every link: with no `config`, and with `default`, `mapmaker`, `example-es` and `test`. That group ID is now the app's built-in content group; before, the built-in one was the live MapMaker group, and only `config=test` read the test group.

- `config=mapmaker-live` reads the live MapMaker group, and is the only link that does.
- Basemaps still come from MapMaker's basemap group (`406646c98d0f4c608a9438d40ce2df9e`) on every link; there is no test copy of it.
- The test group's 183 original items are the live MapMaker items shared into it, not copies.
- The older `atlas/` and `whitelabel/` folders are unchanged and still read the live group.

To go back, or to launch on another group, change `contentGroup` in `DEFAULT_CONFIG` (app.js) or set `"contentGroup"` in a config.

## 3D scenes in Open map (5.0.0-beta.19)

A scene was an ordinary card with a small "3D" after its title, and there was no way to see only the 3D content. Now (Collection browser 2.1):

- **A row above the maps: All, 2D maps, 3D scenes**, each with how many there are. It works with the category chosen and with the search, so "Earth Science" plus "3D scenes" is one click. The row appears only when the collection has at least one scene, so a collection of maps alone looks as it did.
- **A scene's card is marked on its picture**: a "3D" label with a cube on the corner of the thumbnail, and the button reads **Open 3D scene**. A screen reader is told "(3D scene)" after the title, as before.

No "3D" category is needed in the group for this: the app tells maps from scenes by the item's type. A scene still shows under a subject only if it has that group category; one with none is under "Other".

Not done: the category list's counts still say "maps" for maps and scenes together; and in a collection too big to list in the browser (searched on the server instead) the row is not shown.

Tests: `python3 tests/live-openmap.py` (15 checks, with axe-core scans), against the test content group.

## A layer that already has a filter (5.0.0-beta.18)

A layer the map's author had filtered with a list (`Dates IN ('April 19, 1775', ...)`) opened in the Filter panel as a block of SQL that could not be changed, with conditions only added on top of it; and a condition added and applied was folded into that block the next time the panel was opened. Now (Filter 1.2):

- **"is one of" and "is not one of"** are conditions for text and number fields, written as `IN (...)` / `NOT IN (...)`. The values chosen are chips in the value box; more can be picked from the field's values or typed, up to 250.
- **An author's list filter opens as that ordinary condition**, so it can be changed, added to or removed like any other. Every filter in the live MapMaker collection is now read as conditions: 33 layers in 15 of 115 web maps (25 single comparisons, 2 joined with AND, 6 lists).
- **No SQL is shown.** A filter the panel still can't read (hand-written SQL in another form; none in MapMaker today) stays on, and the panel says so in one line.
- **No "Condition" heading** on a card: the field, the comparison and the value, with the bin beside the field. The card is still named for a screen reader.
- The count is of the whole layer ("Showing 21 of 121 features"), and Clear all shows every feature.

Tests: `node tests/filter.test.mjs` (17) and `python3 tests/live-filter.py` (52 checks; the new ones use "1775-1776 Revolutionary Battles").

Also: the automatic checks now parse `app.js` as a module (`node --check` on the `.js` file had passed a file with a syntax error) and run the config and language tests.

## Docks that can be resized (5.0.0-beta.17)

The chart, the table and Elevation open in a dock under the map. The dock now has a bar along its top (Docks 1.0):

- **Drag** the bar up or down to make the dock taller or shorter. The chart, table or Elevation chart redraws to fit and the map takes the rest.
- **Keyboard:** with the bar in focus, Up and Down change the height by 20px, Page Up and Page Down by 100px, Home and End go to the tallest and shortest. The bar is a `separator` that reports its height to a screen reader.
- **Double-click** the bar for the usual height.
- Limits: at least 150px, and the map keeps at least 120px.
- The height is kept for each kind of dock (chart, table, Elevation) while the app is open; it is not saved between visits.

Tests: `live-charts.py` is now 24 checks (drag, limits, keyboard, remembered height, double-click, axe-core).

## Charts (5.0.0-beta.16)

A chart that a map's author set up on a layer in Map Viewer can now be seen in the app (Charts 1.0). This was the last item on the list for parity with MapMaker 4.0.

| | |
|---|---|
| Where | **Map layers**, then the layer's **Chart** button. Only a layer that has a chart gets the button. When a map with a chart opens, the opening message says so |
| What is drawn | The author's chart as set up (title, axes, series, colours), by the SDK's chart component (`arcgis-chart`) from the layer's `charts` in the web map. Only a scatter plot has been tried so far |
| Where it goes | The dock under the map, where the table goes; the chart and the table take turns. A layer with several charts gets a chooser |
| Its tools | The component's own toolbar: legend, selection, only what is in view, zoom, rotate, save as a picture or CSV |
| Chart and map | What is selected on the chart is highlighted on the map (the layer is added to the view's selection manager while its chart is open) |
| Saved maps | The chart set-up is kept in a saved `.amap` file and is there when the file is opened |

Not built: making or editing a chart in the app; charts for spreadsheet layers added in the app; a mark on a map's card in Open map to say it has a chart (the app would have to download every map to know).

Tests: `python3 tests/live-charts.py` (16 checks, with an axe-core scan), against "Real-Time Earthquakes with chart" in the test content group.

## Configs and shared language files (5.0.0-beta.15)

One app, one config per partner. A config in `config/` lists only what differs from the app's defaults; everything else is inherited.

| Piece | Where | What it holds |
|---|---|---|
| Defaults | `DEFAULT_CONFIG` in `app.js` | Neutral "School Atlas", English, the live MapMaker content group, every tool on |
| A config | `config/<name>.json`, opened with `?config=<name>` | Name, logo, colours, language, content group, start view, units, links, sign-in text, tool switches |
| Starting from another config | `"extends": "<name>"` in a config | `config/test.json` is three lines: the MapMaker config with another content group. Up to three levels |
| A language | `locales/<locale>.json`, chosen by `"locale"` in a config | All 515 pieces of the app's wording, the text direction (`"dir": "ltr"` or `"rtl"`), and a version. `es-PA` falls back to `es.json` |
| A config's own wording | `"strings"` in a config | Laid over the language file, for a partner's own terms ("MapMaker maps") |

`config/example-es.json` is the model for a distributor: 37 lines, no wording of its own. Before this release it carried its own copy of the whole Spanish translation (511 pieces, four behind the app); that is now `locales/es.json`, complete, and shared by any Spanish-language config.

`node tests/config.test.mjs` checks every config and language file: it parses, IDs are IDs, colours are colours, what it extends exists, its language has a file, and each language file has every piece of wording with the same `{placeholders}` as the English. The About table shows the config, what it extends, and the language file with its version.

Not done: right-to-left layout (the page direction is set from the language file, but the app's own styles are written left-to-right); a config kept as an ArcGIS Online item; `atlas/` (1.14.8) still uses whole-file configs.

## Text as Map Viewer sets it up, and a way back from a styled fill (5.0.0-beta.14)

**Text.** Map Viewer's text options are Content, Font, Size, colour and a Halo switch with its colour and size (Esri's "Create sketch layers" help). The text tool now has those, plus bold and italic, and the rotation it already had (Sketch styles 2.3, Sketch panel 3.2).

| Option | What it does |
|---|---|
| Font | Eleven fonts from Esri's font service, the ones map text can be drawn in: the standard one (Arial Unicode MS), Noto Sans, Atkinson Hyperlegible, Noto Serif, Merriweather, Playfair Display, Josefin Slab, Ubuntu Mono, Special Elite (typewriter), Caveat and Patrick Hand (handwriting) |
| Bold, Italic | Offered only where the font has them on the service (checked for both the 2D and the 3D font files); otherwise the button is off and says why |
| Colour | The eight colours, and now a colour of your own (points and lines have this too) |
| Size | As before |
| Halo | On or off; its colour (the eight, white, black, or your own) and its size, 0.5 to 6 px |
| Rotation | As before |

A style carries on to the next text drawn, as in Map Viewer. Text made before this release has none of the new settings and stays as it was: bold, with a white halo.

**Saved files** (writer 3.3): each text keeps `font`, `bold`, `italic`, `haloColor` and `haloSize` (0 = no halo), and its label symbol in the web map has the font family, weight, style and halo, so other ArcGIS apps draw it the same. Rotation is kept for this app only: a web map's label symbol has no angle.

Not built: text alignment and multi-line options, a background box, recent text styles, and Map Viewer's full font list.

**A way back from a styled fill.** After choosing a hatch or another styled fill there was no obvious way back to the fill colour and outline settings: "Basic polygon" was only in the first category of Change symbol. Now:

- the plain fill is always the first of the recent polygon symbols (and the plain circle the first for points);
- under the current symbol the panel says a styled fill has no colours or outline to set, with a **Use a plain fill instead** button;
- Basic polygon is the first choice in every category of Change symbol.

The MapMaker config also gains American spellings for the area, halo and units wording that had been left British.

Tests: `python3 tests/live-sketch-text.py` (37 checks, with axe-core scans); `node tests/scenes.test.mjs` is now 36 checks.

## The last widgets become components (5.0.0-beta.13)

Esri deprecated every widget at SDK 5.0 and plans to remove them at 6.0 (Q1 2027). The five the app still used are now the SDK's components; with Sketch, the views, Search, Home, Zoom, the scale bar and the time bar already moved, and Elevation the app's own, the app's code asks for no widget class.

| Tool | Was (widget) | Now (component) |
|---|---|---|
| Legend panel, and a layer's own legend | `Legend` | `arcgis-legend` |
| Measure: distance, area | `Measurement` | `arcgis-distance-measurement-2d`, `arcgis-area-measurement-2d`, and in 3D `arcgis-direct-line-measurement-3d`, `arcgis-area-measurement-3d` |
| Measure: coordinates | `CoordinateConversion` | `arcgis-coordinate-conversion` |
| Swipe | `Swipe` | `arcgis-swipe` |
| Table | `FeatureTable` | `arcgis-feature-table` |

What is different to use:

- **Measure has one units control.** The component's own units menu is hidden; the km / mi switch sets the units.
- A component's code is still downloaded only when its tool is first used (the SDK fetches it when the element is made).
- The table's progress bar had no name for a screen reader (axe-core, WCAG 4.1.2); the app gives it one.

Found on the way: asking the SDK for the old Coordinates widget's translations (for the hemisphere letters a pasted spreadsheet column may use) left that bundle cached, and after a table had been opened the Coordinates component was handed it and failed its first drawing with a script error. The letters are now read from the component's own translation file.

Still Esri's to finish: `arcgis-feature-table` downloads the `FeatureTable` widget class inside itself in SDK 5.2. Esri's transition plan says widgets stay until their component no longer wraps them, so this needs no change here, but it is worth a look when 6.0 arrives.

Also in this release: an Elevation line across the 180° meridian is now tested (Japan to Alaska: one piece, the great-circle length, the dot on the line on both sides).

Tests: `python3 tests/live-components.py` (24 checks, with axe-core scans); `live-elevation.py` is now 49 checks.

## Units that fit where the device is (5.0.0-beta.12)

With `"units": "auto"` (now the default, and what the MapMaker config uses; it was fixed to imperial) the app starts in miles and feet on a device in the United States and in kilometres and metres elsewhere. This covers Measure, Elevation, and Sketch's tooltips and side labels. The scale bar is unchanged (`scalebar`, both by default).

**How it decides** (`lib/units.js`, Units 1.0), first match wins:

1. `units=imperial` or `units=metric` in the link.
2. The person's own choice, made with the **km / mi** switch in Measure and Elevation. It is kept on the device (`localStorage`, key `atlas.units`).
3. `"units": "imperial"` or `"metric"` in the config.
4. The device's time zone: a zone of the United States or its territories is miles and feet, any other is kilometres and metres.
5. If the time zone isn't known (missing, or plain UTC), the browser's language: a US region (`en-US`, `es-US`) is miles and feet.
6. Otherwise kilometres and metres.

No IP address lookup and no request to any service: the time zone and language are read from the browser. The time zone comes before the language because many browsers outside the US are left on US English. `"unitsSwitch": false` hides the switch (and ignores a remembered choice).

Limits: a device set to the wrong time zone starts in the wrong units (the switch puts it right). Only the United States is treated as a miles country. The Measure tool's own units menu still works but its choice isn't remembered. Sketch's side labels take their units from the SDK's portal setting, as its documentation describes.

Tests: `node tests/units.test.mjs` (42 checks) and `python3 tests/live-units.py` (18 checks, run with the browser set to Chicago and to London).

## Elevation: drawn lines take the shortest way round (5.0.0-beta.11)

A line drawn in the Elevation tool is now geodesic (Elevation profile 3.1): between the places clicked it follows the great circle, the shortest way over the Earth, and the heights are read along that path. On the flat (Web Mercator) map a long line therefore shows as a curve, bowing towards the pole; a short line looks as it did. Before, the line was straight on the map, which is a line of constant compass bearing and a longer way round. The line being drawn is shown the same way before it is finished. A line that crosses the 180° meridian stays in one piece.

A line **chosen** on the map (a sketch, a line feature) is still followed exactly as it is drawn there, so the dot stays on the sketched line. Lines are kept between 85°N and 85°S (Web Mercator has no poles). Also: the chart's surface line is 1px (was 2px), and the last distance label no longer runs off the right edge.

Tests: `python3 tests/live-elevation.py` (44 checks).

## Elevation: the app's own chart (5.0.0-beta.10)

The Elevation tool no longer uses Esri's Elevation Profile widget (one of the widgets SDK 6.0 removes; it could not be given a sea-level line or a filled chart). The tool and its chart are now the app's own (Elevation profile 3.0).

| | What it does |
|---|---|
| Layout | The chart runs the whole width under the map. The line's figures (length, highest, lowest, total climb, total descent) are one row beneath it |
| Text | Scale labels 13px, figure labels 14px, figures 16px bold, near-black on white |
| Sea level | Where the line goes below sea level the water is drawn and a dashed line, named "Sea level", marks it. Heights come from Esri's World Elevation **TopoBathy 3D** service, which has the sea floor |
| Earth colours | The land is filled with a gradient, lightest at the line's highest point and darker down to the bottom of the chart |
| Dot on the map | Moving over the chart, or the arrow keys when the chart has focus (Home, End, Shift for bigger steps), puts a dot at that place on the line on the map, with its distance and height shown on the chart. Works for a drawn line and for a sketched line |
| Choosing a line | Over a line that can be chosen (a sketched line, or a line feature of a layer) the pointer becomes the hand; a click charts it. Sketched lines are also in a list, for keyboard use. Elsewhere the pointer is a crosshair: click for each point, double-click or Enter to finish, Escape to give up |

Heights are read at up to 512 points along the line in one request. Units follow `units` in the config. Not built: drawing a new line with the keyboard alone (a sketched line can be chosen from the list); the slope figures the widget had.

Tests: `python3 tests/live-elevation.py` (39 checks, with an axe-core scan).

## Segment labels, snapping, whole-number measurements (5.0.0-beta.8)

On from the start while sketching, each with a switch in the toolbar's Settings and in a config:

| What | Config | Notes |
|---|---|---|
| Tooltips | `sketchTooltips` | Since beta.7. |
| Segment labels | `sketchLabels` | The length of each side while a line or area is drawn or reshaped. |
| Snapping | `sketchSnapping` | To other sketches, and to right angles and parallels within the shape being drawn. The SDK snaps within 5 pixels. Since beta.9 sketches are the only snapping layer (beta.8 included spreadsheet layers); `"sketchSnapTo": "sketches-and-data"` in a config adds them back. Layers of the opened map are not snapping layers. |
| Decimal places | `sketchDecimals` | Lengths and areas in tooltips and labels are shown with none ("1,199 km", "8,610 m²"). A number gives that many places; `null` leaves the SDK's two. |

**How the rounding is done.** The SDK has no setting for decimal places: the Sketch component's value options choose units only. The tooltips and labels are ordinary page text inside the map component, so the app rounds that text as it is written. It depends on how the SDK writes those texts today, so an SDK update could bring the decimals back; the live test would then fail. Coordinates and angles are left as they are. The SDK still changes unit with scale (km, then m), so short lengths do not become "0 km".

Tests: `python3 tests/live-sketch-measure.py` (12 checks): the four side labels of a rectangle, no decimals on any length or area, and a line started 4 pixels from a sketched point starting exactly on it (0.00 m apart where a pixel was 19,568 m), against the same start with snapping off (70 km away), and against a spreadsheet point, which is not snapped to. Not tested: labels, snapping and rounding in 3D; snapping to edges and to right angles.

## Areas as Map Viewer sets them up, and tooltips (5.0.0-beta.7)

For an area (polygon, rectangle, circle, freehand) the panel now has, in Map Viewer's order:

| Control | Notes |
|---|---|
| Recent polygon symbols | The last five styled fills used; says so when there are none. |
| Current symbol | "Basic polygon", or a styled fill. Opens Change symbol with three categories from Esri's sketch styles: Hatch fill (20), Land use and land cover (56), Pencil landscape (13). |
| Fill colour | The eight palette colours, a colour of your own (the browser's colour picker), or No fill. |
| Fill transparency | Slider and number box, 0 to 100%. Starts at 75, as before. |
| Outline colour | As Fill colour, with No outline. |
| Outline transparency | Slider and number box. |
| Outline width | Slider and number box, 0 to 12 px. |
| Outline pattern | The five line patterns (this app's addition; Map Viewer puts patterns under the symbol). |

With a styled fill chosen only the symbol is offered: it is used as it is. **In 3D the SDK draws a styled fill as its outline only** (seen in a test of four of them); the Change symbol view says so. Esri's "Polygon Fill" style (127 plain colour fills) is left out, since Fill colour does that job.

Saved-map format 3.2: an area keeps `fillColor`, `outlineTransparency` and `outlineWidth`; `fill` is still how solid the fill is. Earlier files open as they did.

**Tooltips** are on from the start while drawing (the place under the pointer, a line's length, an area's size), as in the Map Viewer screenshot. The toolbar's Settings turns them off; `"sketchTooltips": false` in a config starts with them off.

Tests: `python3 tests/live-sketch-styles.py` (59 checks).

## Sketch panel and symbols, second pass (5.0.0-beta.6)

**Where Map Viewer's symbols come from.** ArcGIS Online names four groups of styles in its settings (`…/sharing/rest/portals/self`). Map Viewer's Sketch uses `2DSketchStylesGroupQuery`: the group "Esri Sketch Styles" (`045b1ef5300f4ba98f5cfb2a55754921`, owner esri_en), 23 web styles. Sixteen hold point symbols. This app offers 13 of them plus the Places set from beta.5:

| Category | Symbols | Takes the chosen colour | Named |
|---|---|---|---|
| Pins | 16 | yes | yes |
| Numbers | 40 (numbered pins and circles) | yes | yes |
| Shapes | 78, plus the plain circle | yes | yes |
| Arrows | 50 | yes | yes |
| Places | 61 (School, Park, Hospital…) | yes | yes |
| Animals | 48 (Fox, Bear, Turtle…) | no | yes |
| Buildings | 58 | yes | yes |
| Vehicles | 54 | no | yes |
| Trees | 81 | no | numbered only |
| Landforms | 161 | no | numbered only |
| Natural landscape 1, 2 | 125, 211 | no | numbered only |
| Human landscape 1, 2 | 120, 88 | no | numbered only |

Left out: Calcite Symbols (609 interface icons), Animated and Firefly. `sketchSymbolSets` in a config lists the categories to offer; `sketchSymbolsLeftOut` names single symbols to leave out (default Bar, Casino, Vineyard). The sets Esri only numbers ("Symbol 12") are announced to a screen reader as "Trees, Symbol 12": there is no better name to give.

**The panel**, laid out like Map Viewer's Sketch pane:

- A line at the top says what the tool in hand does ("Click the map to add a point.").
- Point: Recent symbols (the last five, kept on the device), Current symbol, Colour (when the symbol takes one), Size. Current symbol opens **Change symbol**: Category, Search, the symbols using the panel's full height, Done.
- A selected sketch: Name, Pop-up (a view of its own: description and image), Duplicate, Delete.
- One toolbar on the map. The Sketch component's own Duplicate and Delete made a second bar when a sketch was selected; they are turned off and the panel's buttons call the same component methods.
- "Go to the drawing tools" is still the first thing Tab reaches in the panel, and is shown only when it has focus.

A sketch's symbol is saved as `web:<style item id>/<symbol name>`; beta.5's `web:school` still opens. Tests: `python3 tests/live-sketch-styles.py` (45 checks).

## Sketch styles (5.0.0-beta.5)

Modelled on Map Viewer's sketch tools: a toolbar on the map, and a pane that changes with the tool in use.

| What | How it works |
|---|---|
| Toolbar | The SDK's Sketch component, laid out vertically on the right of the map beside the Sketch panel (across the top on a phone). Smaller buttons on a screen under 820 px high, so every tool shows without a "more" menu. |
| Panel | Shows what suits the tool chosen or the sketch selected. Point: Symbol, Colour, Size. Line: Colour, Width, Pattern, Arrow. Area: Colour, Outline, Fill. Text: Colour, Size, Rotation. A selected sketch also has its Pop-up. With no tool and nothing selected, only a hint. |
| Point symbols | Esri's vector point symbols: the "2D point symbols" web style (item `220936cc6ed342c9937abd8f180e7d1e`), which is the default vector set in Map Viewer. Two sets: Shapes (35) and Places and pins (61: School, Park, Hospital, Airport, pins…). They take the chosen colour and size. Bar, Casino and Vineyard are left out; `sketchSymbolsLeftOut` in a config changes that list. |
| Lines | Five patterns (solid, dashed, dotted, dash and dot, long dashes) and arrows (none, end, start, both). |
| Areas | How solid the fill is (0 to 100%), and the outline's pattern. |
| Carry on | A style chosen applies to the selected sketch and to the next ones drawn, as in Map Viewer. |
| Saved | Each sketch keeps its choices (`shape`, `pattern`, `arrow`, `fill`), and the file's renderer holds the real symbols: a `CIMSymbolReference` for a vector point, `esriSLS` styles with a `marker` for arrows. Saved-map format 3.1. Files saved before open as they did. |

Not done, or not tested: Map Viewer's other symbol sets (animals, arrows, and so on) and uploading your own picture; fonts for text; line and outline transparency; a custom colour picker. The new styles were tested in 2D; in 3D they were seen to draw (vector symbol, dashes, arrowhead) in one check by eye, not in the automated tests. Opening a saved map in Map Viewer itself has not been tried.

Tests: `python3 tests/live-sketch-styles.py` (30 checks).

## Sketch in 3D, and loading on a slow connection (5.0.0-beta.4)

**Sketch in 3D.** The Sketch toolbar (the SDK's Sketch component) works in the 3D view of a map and in a web scene with the same tools as in 2D: point, line, area, rectangle, circle and text. Nothing had to be built for drawing. One thing was wrong: a sketch drawn in 3D was saved with a height of 0 on every point. Sketches lie on the ground, so they are now saved as flat shapes, the same as ones drawn in 2D. Not tested: moving and reshaping a sketch in 3D, freehand drawing in 3D, and drawing on a tilted view.

**Loading.** Opening `?config=mapmaker&webmap=…` (Major Earthquakes) with an empty cache on a connection held to 1.6 Mbit/s with 150 ms delay, one run each:

| | beta.3 | beta.4 |
|---|---|---|
| Usable (map drawn, layers listed) | 37.0 s | 30.2 s |
| Requests | 683 | 349 |
| Downloaded | 4.0 MB | 3.1 MB |

What changed: the opened map's item and JSON were each downloaded twice, now once; a linked map starts downloading at once and no default basemap is loaded first; the code for Legend, Measure, Coordinates, Elevation and Sketch is downloaded when the tool is first opened. Of what is left, 1.7 MB in 275 requests is the SDK itself. The test serves the app's own files uncompressed (435 kB); GitHub Pages compresses them.

Measure it: `python3 tests/perf.py` (add `--fast` for no throttling). Tests: `python3 tests/live-sketch3d.py` (16 checks).

## Filtering and spreadsheet data in 3D (5.0.0-beta.3)

| What | How it works |
|---|---|
| Filter in 3D | The Filter panel works in the 3D view of a web map and in a web scene, the same way as in 2D: the view follows a typed value without Apply, Cancel puts it back, Apply keeps it in both views and in the saved file. It needed no new code, only testing. It covers the layer types Filter already covers (feature, CSV, GeoJSON, WFS, OGC feature); a scene's 3D building, mesh and point cloud layers have no Filter button. |
| Spreadsheet data in 3D | A CSV can be added while in 3D or in a scene. Its features lie on the ground (`elevationInfo: on-the-ground`), drawn on the terrain with the basemap, so the view has no height to work out per feature. Symbols therefore lie flat when the view is tilted. The 1,000-row limit is unchanged. In a scene the layer is saved in the scene file and comes back, with its filter. CSV 3.5. |
| 3D quality | `threeDQuality` in a config, or `?quality=low|medium|high` in a link. The default, `auto`, picks the SDK's low quality profile (smaller textures, less memory, no shadows or stars) on a device with 4 GB of memory or less, 4 processor cores or fewer, or no graphics chip, and medium otherwise. |

Fixed on the way: in a scene the layer count on the Map layers tool stayed at 0, and the basemap gallery followed the 2D view (both looked at the 2D view's map only); a move of the view asked for while 3D was still tilting into place could be mixed up with it, and now waits for it.

Not known: how 3D performs on real school devices. The test browser draws 3D in software at one or two frames a second, which says nothing about a Chromebook with a graphics chip. The live test lifts the test scene's camera to look straight down from 30 km for that reason. One of the test's runs in three reported a script error with no message or stack that later runs didn't repeat; its cause isn't found.

Tests: `python3 tests/live-3d-data.py` (21 checks).

## 3D scenes and the 2D-only tag (5.0.0-beta.2)

| What | How it works |
|---|---|
| Open a web scene | From a link, `?webscene=<item id>`, or from Open map, where the collection's web scenes are listed beside its web maps and marked **3D**. With `webmap` and `webscene` in one link, the scene opens. |
| A scene is 3D only | It opens in 3D and the 2D button is unavailable, with the reason. Its slides are the bookmarks, each with its camera. |
| A web map can be 2D only | Add the tag `atlas-2d-only` to the web map's ArcGIS Online item. The 3D button is then unavailable, with the reason. A copy saved to a device keeps this (`"atlas2dOnly": true` in the file). |
| Save a scene | The `.amap` file holds a web scene (Web Scene Specification 1.40): the scene's layers, ground and lighting, the camera, bookmarks as slides, sketches and spreadsheet layers. A scene has `viewingMode` and `ground`, which is how the app tells it from a web map. Saved-map format 3.0. |
| Share | Share on a scene's card copies a `webscene=` link. |
| Views | The 2D and 3D views are the SDK's `arcgis-map` and `arcgis-scene` components. Search, Home, Zoom, the 3D navigation toggle and the scale bar are components in their slots (they were widgets, which SDK 6 removes). |

Not done yet, or not tested:

- A scene can't be saved to ArcGIS Online from the app (signed in); it says so. Saving to a device works.
- Sketching in a scene, and a spreadsheet layer in a scene, are saved by the same code as in a web map, and the unit tests cover the file. Drawing in 3D has not been tested in a browser.
- Local scenes (flat, not a globe) are handled in code but no local scene has been opened in a test.
- A scene or map with a layer that isn't shared publicly makes the SDK ask the reader to sign in. Three of Esri's older sample scenes do this. Content for classes needs every layer public.
- Measurement, Coordinate Conversion, Legend, Swipe and Feature Table were moved to components in beta.13. (Elevation Profile was replaced by the app's own chart in beta.10.)

Tests: `node tests/scenes.test.mjs` (24 checks on the file format) and `python3 tests/live-scenes.py` (35 checks in Chromium against the real SDK and ArcGIS Online). The MapMaker collection has no web scene and no tagged map yet, so the live test adds the tag, and puts a scene in the list, by changing the services' answers on their way to the app. It also leaves a city scene's 3D buildings out, because the test browser draws 3D in software.

## Parity with MapMaker 4.0 (since 5.0.0-beta.1)

A tool-by-tool inventory of the live MapMaker (11 November 2026) found seven things 4.0 has that this app didn't. Four are added here:

| 4.0 feature | In 5.0 |
|---|---|
| **Elevation** as its own toolbar tool | Added, after Measure. Measure now opens its panel directly. A version that prefers the old menu sets `"elevationTool": "menu"` |
| **Remove all layers** in Map layers | Added (the bin in the panel's heading). It asks first, because the list can hold a spreadsheet that isn't saved anywhere else. Sketches stay. Switch off with `features.removeAllLayers: false` |
| **Share** on each map in Open map | Added. It copies a link that opens that map in this app with the same settings (`?config=…&webmap=…`). Switch off with `features.share: false` |
| **Time tool** for time-aware maps | Added: the SDK's Time Bar component (new in 5.2), shown above the toolbar on maps saved with time settings, set up from those settings. Saved maps keep the settings and the slider's place (`widgets.timeSlider`, Web Map Specification). Switch off with `features.time: false` |
| **Charts** beside a layer's table | Added in 5.0.0-beta.16 (Charts 1.0); charts kept with a layer's item announced from 5.0.0-beta.35 (1.1) |
| **Built on map and scene components** | Done in 5.0.0-beta.13 |
| **Layer search, buffer tool, parquet layers** (options added to the Atlas template in November 2026; MapMaker 4.0 does not switch them on) | Not built |

Where 5.0 is ahead of 4.0: local save, Save as and locked copies; the list of saved map files; adding a spreadsheet; filtering; creating bookmarks; print; labels on/off; and Sketch in 3D (4.0 takes Sketch off the toolbar in 3D).

Tests: `python3 tests/live-parity.py` runs these tools on the real SDK against MapMaker's own maps (29 checks, with axe-core scans).

## Filter (from 1.15.0-sketch.12)

1.15.0-sketch.13 (Filter 1.1): a condition shows on the map as it's typed or the slider moves, for any field (before, only fields the layer draws with did; others changed the count but not the map until Apply). The panel is tall enough for one condition without scrolling and may reach down over the toolbar. The count stays in view above Apply / Cancel.

Each layer in **Map layers** that holds features has a **Filter** button beside Table. It opens a panel laid out like Map Viewer's filter: the layer's name, *Show features where*, then one or more conditions (field, condition, value), **Add new**, **Clear all**, and **Apply** / **Cancel**.

- **Number fields:** is, is not, is at least, is at most, is greater than, is less than, is between, is blank, is not blank. A histogram of the field's values has a slider on it; the slider and the number box move together, and the bars the condition includes are coloured.
- **Text fields:** is, is not (with the field's own values to choose from), includes, does not include, starts with, ends with, is blank, is not blank.
- **Several conditions** (up to 6) match all or at least one, under *Filter results*.
- **A count** under the conditions says how many features are shown ("Showing 368 of 949 features"). Map Viewer doesn't show one; it's there because the count is often the answer to the question a student is asking.
- **The map follows as you go.** Apply keeps the filter; Cancel, ×, Escape or opening another tool puts the layer back as it was. The Filter button is marked, and named "Filter (on)", when its layer has a filter.
- **Fields offered** are the ones the layer's pop-up shows (under their aliases); if the pop-up has no field list, every number and text field.
- **Spreadsheet (CSV) layers** can be filtered too. All their rows stay in the saved map.

**What it's built from.** Map Viewer's filter panel isn't published as a component, so the panel is assembled from the same standard parts: Esri's Calcite components (`calcite-select`, `calcite-input-number`, `calcite-input-text`, `calcite-combobox`, `calcite-button`) and the SDK's **Histogram** and **Slider** components (`arcgis-histogram` inside `arcgis-slider`, as in Esri's "Histogram Range Slider" sample; these replace the HistogramRangeSlider widget, deprecated in SDK 5.0). The layout, the logic that turns conditions into SQL and back (`lib/filter.js`, Filter 1.1) and the count are this app's.

**How it's saved.** A filter is the layer's `definitionExpression` in the web map (`layerDefinition.definitionExpression`, Web Map Specification), which is how Map Viewer saves one, so the `.amap` still holds only what the specification defines and the filter shows in other ArcGIS apps. Nothing else is stored: when a map is opened, the conditions are read back from that SQL. A filter that was cleared from a layer that came with one is saved as `1=1`, so the layer's original filter doesn't return.

**Known limits**
- **Dates** can't be filtered yet (number and text fields only), and there's no filter by area or distance.
- **A filter written elsewhere** in a form the panel doesn't have (IN lists, functions, AND mixed with OR) is kept as it is and shown as text; conditions added in the panel are added to it, and Clear all leaves it on.
- **A map's own filter can be cleared** by anyone, as in Map Viewer. A map that relies on a filter to hide data shouldn't.
- **Only layers that hold features** have the button (feature, CSV, GeoJSON and WFS layers). Tile, imagery and map-image layers can't be filtered this way.
- **"Apply", not Map Viewer's "Save":** in this app Save means saving the map, and a filter isn't saved until the map is.
- **Switching 2D/3D** while the panel is open closes it without applying.
- **The histogram** needs the field to have a range of values; with one value, or if the components don't load, the number box still works.
- **Tests:** `node tests/filter.test.mjs` (the SQL logic and saved time settings, 13 tests) and `python3 tests/live-filter.py` (the panel on the real SDK against MapMaker's Major Earthquakes map: 37 checks, with an axe-core scan of the panel).

The demo copy stays at `https://jsawle.github.io/localmapsave/atlas/` (1.14.8, frozen), so the two can be shown side by side.

- **Saved maps** use the same `.amap` format, so a file saved in either app opens in the other. Both apps are on the same site, so *My map files* lists the same maps in both.
- **Sign-in** needs `https://jsawle.github.io/AtlasLab/oauth-callback.html` added as a redirect URI on the app's client ID in ArcGIS Online.
