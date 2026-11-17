// The module index in DEVELOPING.md, made from the code itself, and the checks that keep the code described.
//
//   node tools/modules.mjs          write the index into DEVELOPING.md (between the two "modules" markers)
//   node tools/modules.mjs --check  list what is missing or out of date; exit 1 if anything is
//
// For each file in src/ and lib/ the index gives its title and description (the comment block at the top of the file),
// what it exports, and which files use it. tests/structure.test.mjs runs the same checks, so a pull request fails when:
//  - a file has no description under its title (at least one full sentence);
//  - an exported function has no /** … */ description directly above it, or leaves out a @param for one of its
//    parameters (each with a {type});
//  - the index in DEVELOPING.md is not the one this file would write now.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, root), "utf8");
const START = "<!-- modules:start (made by tools/modules.mjs; do not edit by hand) -->", END = "<!-- modules:end -->";
const MIN_DESCRIPTION = 60;   // characters: a sentence, not a label

/** The .js files of src/ and lib/, each as "src/name.js", in the order the index lists them (src first). */
export function moduleFiles() {
  const list = (dir) => fs.readdirSync(new URL(dir + "/", root)).filter((f) => f.endsWith(".js")).sort().map((f) => dir + "/" + f);
  return [...list("src"), ...list("lib")];
}

/**
 * The comment block at the top of a file: its title (the words after a "// ====… " line, or the first line) and its
 * description (the comment lines after the title, up to the first line of code), each line without its "//".
 * @param {string} text the file's source
 * @returns {{title: string, description: string}}
 */
export function headerOf(text) {
  const lines = text.split("\n"), out = [];
  for (const raw of lines) {
    const l = raw.trim();
    if (l.startsWith("//")) { out.push(l.replace(/^\/\/\s?/, "")); continue; }
    if (l === "" && !out.length) continue;
    break;
  }
  let title = "", rest = out;
  if (out.length && /^=+ /.test(out[0])) { title = out[0].replace(/^=+\s*/, ""); rest = out.slice(1); }
  else if (out.length) { title = out[0].replace(/[.:]$/, ""); rest = out.slice(1); }
  const description = rest.join("\n").replace(/^\s*\n|\n\s*$/g, "");
  return { title, description };
}

/**
 * What a file exports by name: functions (with their parameters and the comment directly above, if any), and values.
 * @param {string} text the file's source
 * @returns {{functions: {name: string, params: string[], doc: string|null, line: number}[], values: string[]}}
 */
export function exportsOf(text) {
  const functions = [], values = [];
  for (const m of text.matchAll(/^export (?:async )?function\*? ?([\w$]+)\s*\(([^)]*)\)/gm)) {
    const before = text.slice(0, m.index).replace(/\s+$/, "");
    const doc = before.endsWith("*/") ? before.slice(before.lastIndexOf("/**")) : null;
    functions.push({ name: m[1], params: paramNames(m[2]), doc: doc && doc.startsWith("/**") ? doc : null, line: text.slice(0, m.index).split("\n").length });
  }
  for (const m of text.matchAll(/^export (?:const|let|var) ([^=;]+?)(?==|;|$)/gm)) {
    for (const part of m[1].split(",")) { const n = part.trim().split(/\s/)[0]; if (/^[\w$]+$/.test(n)) values.push(n); }
  }
  for (const m of text.matchAll(/^export (?:const|let) [\w$]+ = [^\n]*?,\s*([\w$]+)\s*=/gm)) if (!values.includes(m[1])) values.push(m[1]);
  return { functions, values };
}

/**
 * The names of a function's parameters, from the text between its brackets: defaults and destructuring are read
 * (a destructured parameter is named by its first key), rest parameters keep their name.
 * @param {string} list the text between the brackets of the signature
 * @returns {string[]}
 */
export function paramNames(list) {
  const out = []; let depth = 0, cur = "";
  for (const ch of list) {
    if ("{[(".includes(ch)) depth++;
    if ("}])".includes(ch)) depth--;
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((p) => p.trim().replace(/^\.\.\./, "").split("=")[0].trim()).filter(Boolean)
    .map((p) => (/^[{[]/.test(p) ? "{" : p));
}

/**
 * What is wrong with a function's description: none, no @param for a parameter, or a @param without a {type}.
 * A destructured parameter needs one @param of any name.
 * @param {{name: string, params: string[], doc: string|null}} fn as exportsOf gives it
 * @returns {string[]} the problems, in words
 */
export function docProblems(fn) {
  if (!fn.doc) return ["no /** description */ above it"];
  const tags = [...fn.doc.matchAll(/@param\s+(\{(?:[^{}]|\{[^{}]*\})*\})?\s*\[?([\w$.]+)/g)].map((m) => ({ type: m[1], name: m[2] }));
  const out = [];
  const text = fn.doc.replace(/^\/\*\*|\*\/$/g, "").replace(/^\s*\*\s?/gm, "").split("@")[0].trim();
  if (text.length < 8) out.push("its description is empty");
  for (const p of fn.params) {
    const tag = p === "{" ? tags.find((x) => !fn.params.includes(x.name)) || tags[0] : tags.find((x) => x.name === p || x.name.startsWith(p + "."));
    if (!tag) out.push("no @param for " + (p === "{" ? "its options" : p));
    else if (!tag.type) out.push("no {type} for " + tag.name);
  }
  return out;
}

/** Which files import a file, and what each takes from it. @param {string} file "src/name.js" @param {Map<string,string>} texts every file's source */
export function importersOf(file, texts) {
  const base = file.split("/").pop(), out = [];
  for (const [other, text] of texts) {
    if (other === file) continue;
    const prefix = other.startsWith(file.split("/")[0] + "/") ? "./" : "../" + file.split("/")[0] + "/";
    const want = prefix + base + "?v=";
    for (const m of text.matchAll(/import\s*(\{[^}]*\})?\s*(?:from\s*)?"([^"]+)"/g)) {
      if (!m[2].startsWith(want)) continue;
      const names = m[1] ? m[1].replace(/[{}\s]/g, "").split(",").filter(Boolean) : [];
      out.push({ file: other, names });
    }
  }
  return out;
}

/**
 * Which files a file imports names from (files imported only to run them first are left out).
 * @param {string} file "src/name.js"
 * @param {string} text the file's source
 * @returns {string[]} "src/name.js" for each, in the order imported
 */
export function importsOf(file, text) {
  const dir = file.split("/")[0], out = [];
  for (const m of text.matchAll(/import\s*\{[^}]*\}\s*from\s*"(\.{1,2}\/[^"?]+)\?v=/g)) {
    const target = m[1].startsWith("./") ? dir + "/" + m[1].slice(2) : m[1].slice(3);
    if (!out.includes(target)) out.push(target);
  }
  return out;
}

/**
 * The fields of the shared state (src/state.js) a file sets and the ones it only reads.
 * @param {string} text the file's source
 * @returns {{sets: string[], reads: string[]}} each sorted A–Z
 */
export function stateUse(text) {
  const all = new Set(), sets = new Set();
  text = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "$1");   // comments name files ("state.js"), not fields
  for (const m of text.matchAll(/(?<![\w$./])state\.([\w$]+)(\s*(?:[-+*/]?=(?!=)|\+\+|--))?/g)) { all.add(m[1]); if (m[2]) sets.add(m[1]); }
  for (const m of text.matchAll(/(?:\+\+|--)\s*(?<![\w$./])state\.([\w$]+)/g)) sets.add(m[1]);
  return { sets: [...sets].sort(), reads: [...all].filter((n) => !sets.has(n)).sort() };
}

// A file's description as markdown: lines run together into paragraphs, as they read in the comment. A list in the
// comment (indented lines) keeps a line for each item, and an item's own wrapped lines (indented further) run on.
// < and > are written so they show as themselves, and a number or dash at the start of a line is not made a list.
function descriptionMarkdown(description) {
  const lines = description.split("\n"), indent = (l) => l.length - l.trimStart().length;
  let out = "";
  lines.forEach((l, i) => {
    const text = l.trim().replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/^(\d+)\. /, "$1\\. ").replace(/^- /, "\\- ");
    if (i === 0) { out = text; return; }
    const prev = lines[i - 1];
    if (!text) return;
    if (!prev.trim()) out += "\n\n" + text;
    else if (indent(l) > 0 && indent(prev) > 0 && indent(l) > indent(prev)) out += " " + text;   // an item's own next line
    else if (indent(l) > 0 || indent(prev) > 0) out += "<br>\n" + text;                            // a new item, or the end of the list
    else out += " " + text;
  });
  return out;
}

const code = (n) => "`" + n + "`";

/**
 * The index as markdown, and the list of what is missing.
 * @returns {{markdown: string, problems: string[]}}
 */
export function buildIndex() {
  const files = moduleFiles(), texts = new Map(files.map((f) => [f, read(f)])), problems = [];
  const parts = ["What each file of the app does, from the comment at the top of the file, and what it exports, uses and is used by, " +
    "from the code. `src/` files are listed in the order they run (see How the files load); `lib/` files need no browser or map library " +
    "and have unit tests in `tests/`. Each exported function has a description, with its parameters, directly above it in the file.\n"];
  const order = srcOrder(texts);
  const ordered = [...order.filter((f) => texts.has(f)), ...files.filter((f) => !order.includes(f))];
  for (const f of ordered) {
    const text = texts.get(f), h = headerOf(text), ex = exportsOf(text), used = importersOf(f, texts);
    if (!h.description || h.description.replace(/\s+/g, " ").length < MIN_DESCRIPTION) problems.push(f + ": no description under its title (at least a sentence)");
    for (const fn of ex.functions) for (const p of docProblems(fn)) problems.push(f + ":" + fn.line + " " + fn.name + "(): " + p);
    const names = [...ex.functions.map((x) => x.name + "()"), ...ex.values];
    const uses = importsOf(f, text).map((x) => code(x.startsWith("lib/") ? x : x.split("/").pop()));
    const users = used.filter((u) => u.names.length).map((u) => code(u.file.startsWith("lib/") ? u.file : u.file.split("/").pop())).filter((v, i, a) => a.indexOf(v) === i);
    const st = f.startsWith("src/") && f !== "src/state.js" ? stateUse(text) : null;
    const rows = [
      "- **Exports:** " + (names.length ? names.map(code).join(", ") : "nothing; it sets up its part of the page when it runs"),
      "- **Uses:** " + (uses.length ? uses.join(", ") : "no other file of the app"),
      "- **Used by:** " + (users.length ? users.join(", ") : f.startsWith("lib/") ? "nothing in src/ yet" : "no file imports anything from it; it runs for its effect on the page")
    ];
    if (st && (st.sets.length || st.reads.length)) rows.push("- **Shared state:** " + [st.sets.length ? "sets " + st.sets.map(code).join(", ") : "", st.reads.length ? "reads " + st.reads.map(code).join(", ") : ""].filter(Boolean).join("; "));
    parts.push("### `" + f + "`: " + h.title + "\n\n" + descriptionMarkdown(h.description) + "\n\n" + rows.join("\n") + "\n");
  }
  return { markdown: parts.join("\n"), problems };
}

// src/ in the order the files run: app.js's start-up files, then the chain of first imports back from startup.js.
function srcOrder(texts) {
  const app = read("app.js"), boot = [...app.matchAll(/await import\("\.\/(src\/[\w-]+\.js)\?v=/g)].map((m) => m[1]);
  const chain = []; let cur = "src/startup.js";
  while (cur && texts.has(cur) && !chain.includes(cur)) { chain.unshift(cur); const m = texts.get(cur).match(/^import "\.\/([\w-]+\.js)\?v=/m); cur = m ? "src/" + m[1] : null; }
  return ["src/state.js", ...boot.filter((f) => f !== "src/startup.js"), ...chain.filter((f) => !boot.includes(f) || f === "src/startup.js")].filter((v, i, a) => a.indexOf(v) === i);
}

/** DEVELOPING.md with the index put in (or brought up to date). @param {string} doc DEVELOPING.md now @param {string} markdown the index */
export function withIndex(doc, markdown) {
  const block = START + "\n\n" + markdown.trim() + "\n\n" + END;
  if (doc.includes(START) && doc.includes(END)) return doc.slice(0, doc.indexOf(START)) + block + doc.slice(doc.indexOf(END) + END.length);
  return doc.trimEnd() + "\n\n## Modules\n\n" + block + "\n";
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {   // run, not imported
  const { markdown, problems } = buildIndex(), doc = read("DEVELOPING.md"), next = withIndex(doc, markdown);
  if (process.argv.includes("--check")) {
    if (next !== doc) problems.push("DEVELOPING.md: the module index is out of date (run node tools/modules.mjs)");
    for (const p of problems) console.log("  " + p);
    console.log(problems.length ? problems.length + " to fix" : "Every module and exported function is described, and the index is up to date.");
    process.exit(problems.length ? 1 : 0);
  }
  fs.writeFileSync(new URL("DEVELOPING.md", root), next);
  console.log("Wrote the module index (" + moduleFiles().length + " files) into DEVELOPING.md." + (problems.length ? " Still to describe: " + problems.length + " (node tools/modules.mjs --check)." : ""));
}
