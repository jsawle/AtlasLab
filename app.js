// Atlas: a white-label build of the MapMaker classroom map app.
// ArcGIS Maps SDK for JavaScript 5.2. Everything a distributor changes lives in config/<name>.json.
// Created by Jason Sawle.
//
// This file only starts the app. The code is in src/, one file for each part of the app, and lib/ (the parts that need
// no browser, which have unit tests). The first four files each wait for something (the config, the map library, the
// map), so they are loaded one after another, each finished before the next begins: Safari before version 27 goes
// wrong when two files wait on a third that is still loading. The last line loads everything else; those files run in
// the order they are listed in src/startup.js's chain of imports, which is the order they were written in.
const V = "?v=5.0.0-beta.44";
// Every file of the app, asked for now so they all download together while the map library loads. This only fills the
// browser's cache: the imports below then find each file already there. (Plain requests, not modulepreload, so that
// nothing but the lines below decides the order the files run in.) tests/structure.test.mjs checks the list is complete.
const FILES = [
  "src/state.js", "src/config.js", "src/branding.js", "src/sdk.js", "src/views.js", "src/session.js", "src/ui.js", "src/popups.js", "src/sketch.js",
  "src/legend-basemaps-measure.js", "src/view-mode.js", "src/maps.js", "src/data-layers.js", "src/layers-panel.js", "src/filter-panel.js",
  "src/bookmarks.js", "src/topics.js", "src/collection.js", "src/item-info.js", "src/csv-import.js", "src/drag-drop.js", "src/local-files.js",
  "src/saved-maps.js", "src/print.js", "src/arcgis-online.js", "src/versions.js", "src/startup.js", "lib/basemaps.js", "lib/catalog.js",
  "lib/config.js", "lib/csv.js", "lib/doc.js", "lib/filter.js", "lib/pairs.js", "lib/questions.js", "lib/recent.js", "lib/strings.js", "lib/units.js"
];
for (const f of FILES) fetch("./" + f + V).catch(() => {});
// Each ?v= is the app version, so a new release never runs beside a cached older file (tests/structure.test.mjs checks they match).
await import("./src/config.js?v=5.0.0-beta.44");    // which config and language: reads them
await import("./src/branding.js?v=5.0.0-beta.44");  // the name, colours and wording, onto the page
await import("./src/sdk.js?v=5.0.0-beta.44");       // the ArcGIS map library
await import("./src/views.js?v=5.0.0-beta.44");     // the map and its 2D view
await import("./src/startup.js?v=5.0.0-beta.44");   // every tool and panel, then start-up
