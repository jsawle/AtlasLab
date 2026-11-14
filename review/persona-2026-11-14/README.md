# Persona review of the app, 14 November 2026

The first persona review of the app itself (5.0.0-beta.43). Earlier reviews were of lessons and their maps.

## How it was run

The method is the one in `review/personas.md` of the `jsawle/lessons` repository, applied to an app:

1. **Materials.** The app was worked through in Chrome at 1366 x 768: first open, each tool, a map opened from the collection (an earthquake lesson map), a pop-up, filter, table, a spreadsheet added, an elevation profile, 3D, save, sign in. 27 screenshots and the words on screen at each step are in `packet/notes.txt`. A keyboard-only run and the app at 300% and 400% zoom are in `packet/access.txt`. Checked facts are in `packet/facts.txt`. (The screenshots are not kept in the repository.)
2. **Reviewers.** Nine personas, each given to a separate reviewer that had not seen the code: `reports/`.
3. **Checking.** Every finding below was checked against the app before it was kept. Findings that turned out wrong are listed at the end with the reason.

| Persona | Would they use it as it stands? |
|---|---|
| T1 Mark, veteran US History teacher | Not tomorrow |
| T2 Dana, first-year teacher | Not in front of a class |
| T3 Luis, shared devices, short periods | From his own projected screen, yes; on the shared cart, not yet |
| T6 Grace, Earth science | For a ten-minute projected demonstration |
| T13 Owen, technology coach | A small trial, not a hundred teachers |
| S1 Jordan, reads below grade level | Can explore; stalls when a lesson needs steps |
| S4 Aaliyah, grade 4 | Only with her teacher beside her |
| S6 Mina, low vision, 400% zoom | No |
| S7 Devon, keyboard only | For opening, layers and saving; not Measure, Elevation or pop-ups |

## Findings kept, most serious first

### Stops a lesson

1. **A map opens with nothing saying what to do.** (T1, T2, S1, S4, T3; raised by five of nine.) "Exploring earthquakes and their causes (Guided Lesson)" opens as a map and a small "i". Checked: the "i" (About this map) holds the question "What causes earthquakes, and how do they affect people?", a description and a link to the activity, but nothing shows it unless the "i" is found. *Suggested: when a map has a description, show its first line (the question) under the title or in a panel that opens with the map, with the activity link.*
2. **Drawing on the map needs a mouse.** (S7.) Checked: Measure and Elevation say "click the map" and "double-click to finish" and offer no keyboard way to place a point; Elevation's keyboard route (choose a sketched line) only appears once a line has been sketched, which itself needs a mouse. Enter on the focused map does not open a pop-up. Opening a map, moving and zooming it, layers, Save and Escape all work by keyboard. *Suggested: a keyboard way to add a point at the map's centre and a Finish button for Measure, as Elevation now has. Pop-ups by keyboard need looking into (the map library may offer it).*
3. **At 400% zoom there is almost no map and no map list.** (S6.) Checked: on a 1366 x 768 Chromebook at 400% the map is 128 px high; the toolbar loses its labels and five tools are off the edge (it scrolls sideways, and Save can be reached, but nothing shows that it scrolls); in Open map the search box shows but no card does (the list is a 28 px strip). There is no sideways scrolling of the page, and text contrast is good. *Suggested: a small-screen layout: the header and toolbar give way to the map and the open window; the toolbar wraps or shows that it scrolls.*
4. **Nothing for a school to read.** (T13, T2, T1, T3.) Checked: there is no privacy statement, no accessibility statement, no teacher how-to, no help link in the app and no contact. The app collects very little (no account, no cookies, no server of its own), but nothing says so where a technology office would look. *Suggested: one "for schools" page linked from the app: what it stores and contacts, the addresses to allow, accessibility, a two-page how-to, a contact.*

### Slows a lesson down

5. **Nothing shows that the map is still loading.** (T2, T3, T6.) Checked: on the test machine (no graphics card) 3D took about 100 seconds to finish drawing and showed bare ground with no message meanwhile; the Legend panel was empty for a few seconds before filling. A teacher cannot tell slow from broken. Real devices will be faster, but school connections are slow. *Suggested: a small "Loading…" indicator while the view is updating.*
6. *Withdrawn.* "Saved work stays on one device" (T3, T13). Students sign in to a cart laptop with their school identity, so a saved file goes to their own workspace and follows them (Jason Sawle, 14 November). Left to confirm on a real managed device: whether the "My map files" list, which the browser keeps per device, starts empty on a different laptop.
7. **The toolbar disappears when the table or elevation chart is open.** (T1, T2, S4.) Checked: by design, to give the map room; a 32 px button with nine dots brings it back. It has a name for screen readers ("Show map tools") but no visible label. *Suggested: give the button a visible word ("Tools").*
8. **Layer tools are small unlabelled icons, with Remove beside the others.** (T1, T2, S1, S4, S7.) Each layer has up to eight icons about 16 to 18 px; the bin sits beside information. They have tooltips, which do not help on a tablet. *Suggested: larger targets, and move Remove apart or into a "more" menu.*
9. **Wide screens show white bands beside a world map.** (T6 noticed the cut-off.) Checked: the earthquake lesson map opens at world zoom on a 1366 px screen with white bands left and right, because the map is narrower than the screen at that zoom. The app's own start-up view was fixed for this in beta.35, but a map opened from the collection is not. *Suggested: apply the same minimum zoom when a map opens zoomed out.*
10. **Words that stop younger or weaker readers.** (S1, S4.) Quoted from the screen: "Basemaps", "Legend", "Elevation profile", "Vertical exaggeration", "Show features where", "Histogram", "Swap latitude and longitude", "1 number columns, 1 category columns" (also a grammar slip), "Total climb and descent for lines up to 31 mi", ".amap", "Save as…" beside "Save map". The 22-word Elevation instruction is too long for them. *Suggested: fix the plural; shorten the Elevation instruction; consider plainer labels in a config for younger grades ("Background map", "Map key").*
11. **Open map is long to get through.** (S1, S7.) 121 maps over 13 pages with adult descriptions; by keyboard it takes 22 presses of Tab to reach the first card. Search works well. *Suggested: a skip link to the list; put Search first in focus.*

### Minor

12. **Focus is hard to see in places.** (S7.) Checked: no focus ring on the map itself when it has focus; the toolbar's ring is thin. *Suggested: a clear ring on the map container and a thicker one on the toolbar.*
13. **Pop-up and filter details.** (T6, S4.) "USGS PAGER ALERT: No PAGER Issued" and "1 of 17" are unexplained; these come from the map's author and the map library, not the app. The filter's histogram has no axis labels.
14. **Elevation profile.** (T6.) The vertical exaggeration is stated, which she liked. The height axis does not start at sea level, and the source line is a list of names.
15. **The threat model was out of date.** (T13.) It said `.mmap` for the file type and was headed beta.38. The file type is corrected in this change; the rest is due a refresh.
16. **Who provides it is unclear.** (T13.) "School Atlas", MapMaker, Esri and National Geographic all appear, at a personal github.io address, in a test version with test content. Expected at this stage; it matters before wider use.

## Feedback from people shown the app (not from the personas)

- **Tooltips should say what each tool does**, without nagging experienced users. Built in the lab config in 5.0.0-beta.44: a one-line tip after about a second, with a Tips on/off switch.
- **A lesson's questions should be available in the app.** The same gap as finding 1. Built in the lab config in 5.0.0-beta.44: questions under a heading "Questions" in a map's description show beside the map.
- **Saving on a laptop cart** is not the risk finding 6 said: see above.

## Findings dropped after checking

- **"No warning before unsaved work is replaced"** (T1, T2, T3, S1, T13). There is one: the browser's own "discard changes?" dialog. The screenshot tool dismissed it automatically, so it never appeared in the packet.
- **"The Legend is empty"** (T1, T2, T3, T6, S1, S4, S6). It fills in after a few seconds; the screenshot was taken too soon. Kept only as part of finding 5.
- **"Half the Ring of Fire is missing"** (T6). The southern part was off the bottom of the screen, not missing.
- **"3D shows no layers"** (T2, T6). It had not finished drawing after 45 seconds on the test machine; at about 100 seconds it had. Kept as part of finding 5.
- **"The Distance tool failed"** (T1, T6). The walk-through's own click was blocked by an open pop-up; the tool works (`tests/live-components.py`).
- **"Add to map gives no confirmation"** (T2). The layer count on Map layers changes and the points appear, but there is no message; left as it is unless it comes up with real users.

## Limits

- The reviewers saw screenshots and text, not the live app, and one walk through one map. A US History map was not opened.
- Phones, a managed Chromebook, a real screen reader and Safari were not part of this review.
- The personas are invented. They find likely problems; they do not replace trying it with real teachers and students.
