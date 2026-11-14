// The linter's settings (5.0.0-beta.39). Run: npm install, then npm run lint. It also runs on every pull request.
// It catches what the browser only finds when a line runs: a misspelt or missing name, a second declaration of a name,
// code that can never run. It does not check style.
import js from "@eslint/js";
import globals from "globals";

// The app's own rule. A file that waits at its top level (await outside any function) holds up every file that imports
// it, and Safari before version 27 goes wrong when two files wait on a third. So only the files app.js loads one at a
// time may do it: the start-up files, and the last file of the chain.
const TOP_LEVEL_AWAIT_OK = ["app.js", "src/config.js", "src/sdk.js", "src/views.js", "src/startup.js"];
const atlas = { rules: { "top-level-await": {
  meta: { type: "problem", schema: [], messages: { no: "Only the start-up files may wait at their top level (see app.js). Move this into a function." } },
  create(context) {
    const file = context.filename.replace(/\\/g, "/");
    if (TOP_LEVEL_AWAIT_OK.some((f) => file.endsWith("/" + f))) return {};
    const inFunction = (node) => { for (let n = node.parent; n; n = n.parent) if (/Function/.test(n.type)) return true; return false; };
    return { AwaitExpression(node) { if (!inFunction(node)) context.report({ node, messageId: "no" }); }, ForOfStatement(node) { if (node.await && !inFunction(node)) context.report({ node, messageId: "no" }); } };
  } } } };

export default [
  { ignores: ["node_modules/**", "tests/.shots/**", "dist/**"] },
  js.configs.recommended,
  {
    rules: {
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none", varsIgnorePattern: "^_", ignoreRestSiblings: true }],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-irregular-whitespace": ["error", { skipRegExps: true, skipStrings: true, skipTemplates: true, skipComments: true }],   // the spreadsheet reader names odd spaces in its patterns on purpose
      "no-use-before-define": ["error", { functions: false, classes: true, variables: false }],
      "eqeqeq": ["error", "always", { null: "ignore" }],
      "no-var": "error",
      "prefer-const": ["error", { destructuring: "all" }],
    },
  },
  { files: ["app.js", "src/**/*.js", "lib/**/*.js"], plugins: { atlas }, rules: { "atlas/top-level-await": "error" }, languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: { ...globals.browser, $arcgis: "readonly" } } },
  { files: ["oauth-callback.js"], languageOptions: { ecmaVersion: 2022, sourceType: "script", globals: { ...globals.browser } }, rules: { "no-var": "off" } },   // Esri's file, kept as it came
  { files: ["tests/**/*.mjs", "tools/**/*.mjs", "eslint.config.mjs"], languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: { ...globals.node } } },
];
