// How the app's files fit together (5.0.0-beta.40). Run: node tests/structure.test.mjs
// app.js starts the app; the code is in src/. These checks keep three promises the split depends on:
//  1. one version on every address, so a new release never runs beside a cached older file;
//  2. the start-up files (loaded one at a time by app.js) never import a file that loads after them;
//  3. the other files run in one fixed order: each one's first import is the file before it.
import fs from "node:fs";
import assert from "node:assert/strict";
import { srcFiles } from "./app-source.mjs";
const root = new URL("../", import.meta.url), read = (p) => fs.readFileSync(new URL(p, root), "utf8");
let passed = 0; const ok = (c, m) => { assert.ok(c, m); passed++; console.log("  ok   " + m); };
const app = read("app.js"), html = read("index.html"), files = srcFiles(), libs = fs.readdirSync(new URL("lib/", root)).filter((f) => f.endsWith(".js")).sort();
const ver = read("src/config.js").match(/const APP_VERSION = "([^"]+)"/)[1];
const specs = (text) => [...text.matchAll(/(?:from|import)\s*\(?\s*"(\.{1,2}\/[^"?]+)\?v=([^"]+)"/g)].map((m) => ({ path: m[1], v: m[2] }));
const bare = (text) => [...text.matchAll(/(?:from|import)\s*\(?\s*"(\.{1,2}\/[^"]+\.js)"/g)].map((m) => m[1]);

// 1. versions
const all = [["app.js", app], ...files.map((f) => ["src/" + f, read("src/" + f)]), ...libs.map((f) => ["lib/" + f, read("lib/" + f)])];
const wrong = all.flatMap(([name, text]) => specs(text).filter((s) => s.v !== ver).map((s) => name + " -> " + s.path + " " + s.v));
const unversioned = all.flatMap(([name, text]) => bare(text).map((p) => name + " -> " + p));
ok(wrong.length === 0, "every import carries the app version " + ver + (wrong.length ? ": " + wrong.join("; ") : ""));
ok(unversioned.length === 0, "and none is without a version" + (unversioned.length ? ": " + unversioned.join("; ") : ""));
ok(html.includes('src="./app.js?v=' + ver + '"'), "index.html starts app.js at the same version");
const listed = [...(app.match(/const FILES = \[([\s\S]*?)\];/) || ["", ""])[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
const want = [...files.map((f) => "src/" + f), ...libs.map((f) => "lib/" + f)].sort();
ok(JSON.stringify(listed) === JSON.stringify(want) && app.includes('const V = "?v=' + ver + '";'), "app.js asks for every file in src/ and lib/ ahead of time (" + want.length + "), at the same version");
ok(!/rel="modulepreload"/.test(html), "and index.html preloads no modules, so only app.js decides the order");

// 2. the start-up files
const started = specs(app).map((s) => s.path.replace("./src/", "")), boot = started.slice(0, -1), entry = started[started.length - 1];
ok(boot.join(" ") === "config.js branding.js sdk.js views.js", "app.js loads the start-up files one after another: " + boot.join(", "));
const awaits = (app.match(/^await import\(/gm) || []).length;
ok(awaits === started.length, "each with await, so one finishes before the next begins");
const importsOf = (f) => specs(read("src/" + f)).filter((s) => s.path.startsWith("./")).map((s) => s.path.slice(2));
const early = boot.flatMap((f, i) => importsOf(f).filter((d) => d !== "state.js" && !boot.slice(0, i).includes(d)).map((d) => f + " -> " + d));
ok(early.length === 0, "a start-up file imports only state.js, lib/ and the start-up files before it" + (early.length ? ": " + early.join("; ") : ""));
// 3. the fixed order
const chain = [entry]; const rest = files.filter((f) => f !== "state.js" && !boot.includes(f));
for (;;) { const first = (read("src/" + chain[0]).match(/^import "\.\/([^"?]+)\?v=[^"]+";/m) || [])[1]; if (!first || chain.includes(first)) break; chain.unshift(first); }
ok(chain.length === rest.length && rest.every((f) => chain.includes(f)), "following each file's first import from " + entry + " reaches every other file once: " + chain.map((f) => f.replace(".js", "")).join(" > "));
const notFirst = chain.slice(1).filter((f) => { const t = read("src/" + f), m = t.match(/^import [^\n]*$/m); return !m || !/^import "\.\//.test(m[0]); });
ok(notFirst.length === 0, "and that import is the first in its file" + (notFirst.length ? ": " + notFirst.join(", ") : ""));
console.log(passed + " checks passed");
