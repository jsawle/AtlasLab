// Sets the app version everywhere it must match. Run: npm run bump -- 5.0.0-beta.42
// Changes the ?v= on every import (app.js, src/, index.html) and APP_VERSION in src/config.js. It leaves comments alone,
// so a note like "(5.0.0-beta.38)" beside a piece of code goes on saying when that code arrived.
// Still to do by hand: the README (first paragraph and a new section), and any part's own version that changed.
import fs from "node:fs";
const next = process.argv[2];
if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(next || "")) { console.error("usage: npm run bump -- 5.0.0-beta.42"); process.exit(1); }
const root = new URL("../", import.meta.url), p = (f) => new URL(f, root);
const old = fs.readFileSync(p("src/config.js"), "utf8").match(/const APP_VERSION = "([^"]+)"/)[1];
const files = ["app.js", "index.html", ...fs.readdirSync(p("src/")).filter((f) => f.endsWith(".js")).map((f) => "src/" + f)];
let n = 0;
for (const f of files) { const a = fs.readFileSync(p(f), "utf8");
  const b = a.split("?v=" + old).join("?v=" + next).replace(`const APP_VERSION = "${old}"`, `const APP_VERSION = "${next}"`);
  if (b !== a) { fs.writeFileSync(p(f), b); n++; } }
console.log(`${old} -> ${next} in ${n} files. Now: the README, and node tests/structure.test.mjs`);
