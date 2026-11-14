// Builds the app for publishing (5.0.0-beta.41). Run: npm run build. Output: dist/, which is what GitHub Pages serves.
//
// The source (app.js, src/, lib/) runs in a browser as it is: that is how it is developed and tested. For publishing,
// this joins the 37 files into one and shrinks it, so a classroom downloads one file in place of 38. Nothing in dist/
// is ever edited by hand: every build writes it afresh.
//
// The files are joined in the order app.js loads them. app.js loads the start-up files one at a time with
// await import(...); here those lines become plain imports in the same order, which gives the same order inside one
// file (and with one file, Safari's trouble with files that wait on each other cannot arise).
import { build } from "esbuild";
import fs from "node:fs";

const root = new URL("../", import.meta.url), out = new URL("dist/", root);
const read = (p) => fs.readFileSync(new URL(p, root), "utf8");
const app = read("app.js");
const loads = [...app.matchAll(/^await import\("(\.\/src\/[^"?]+)\?v=([^"]+)"\);/gm)];
if (loads.length < 2) throw new Error("build: app.js has no 'await import' lines to follow");
const version = loads[0][2];
if (loads.some((m) => m[2] !== version)) throw new Error("build: app.js loads files at more than one version");
const header = app.split("\n").filter((l, i) => i < 3 && l.startsWith("//")).join("\n");

fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out, { recursive: true });
const result = await build({
  stdin: { contents: loads.map((m) => `import "${m[1]}?v=${version}";`).join("\n"), resolveDir: new URL(".", root).pathname, sourcefile: "app-entry.js", loader: "js" },
  bundle: true, format: "esm", target: "es2022", minify: true, sourcemap: true, legalComments: "none",
  outfile: new URL("app.js", out).pathname, metafile: true, logLevel: "warning",
  banner: { js: `${header}\n// Version ${version}. Built from the source at https://github.com/jsawle/AtlasLab: edit that, not this file.` },
  plugins: [{ name: "drop-version", setup(b) {      // "./x.js?v=1.2.3" is the file ./x.js: the version is only for the browser's cache
    b.onResolve({ filter: /\?v=[^/]+$/ }, (args) => ({ path: new URL(args.path.replace(/\?v=.*$/, ""), "file://" + args.resolveDir + "/").pathname })); } }],
});
for (const f of ["index.html", "oauth-callback.html", "oauth-callback.js"]) fs.copyFileSync(new URL(f, root), new URL(f, out));
for (const d of ["config", "locales"]) fs.cpSync(new URL(d + "/", root), new URL(d + "/", out), { recursive: true });
fs.writeFileSync(new URL(".nojekyll", out), "");
if (!fs.readFileSync(new URL("index.html", out), "utf8").includes(`src="./app.js?v=${version}"`)) throw new Error("build: index.html does not start app.js at version " + version);

const inputs = Object.keys(result.metafile.inputs).length - 1, size = fs.statSync(new URL("app.js", out)).size;
const before = Object.keys(result.metafile.inputs).filter((f) => f !== "app-entry.js").reduce((n, f) => n + result.metafile.inputs[f].bytes, 0);
fs.writeFileSync(new URL("build.json", out), JSON.stringify({ version, files: inputs, sourceBytes: before, builtBytes: size }, null, 1) + "\n");
console.log(`built ${version}: ${inputs} files, ${Math.round(before / 1024)} KB -> dist/app.js ${Math.round(size / 1024)} KB`);
