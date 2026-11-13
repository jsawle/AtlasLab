// The linter's settings (5.0.0-beta.39). Run: npm install, then npm run lint. It also runs on every pull request.
// It catches what the browser only finds when a line runs: a misspelt or missing name, a second declaration of a name,
// code that can never run. It does not check style.
import js from "@eslint/js";
import globals from "globals";

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
  { files: ["app.js", "src/**/*.js", "lib/**/*.js"], languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: { ...globals.browser, $arcgis: "readonly" } } },
  { files: ["oauth-callback.js"], languageOptions: { ecmaVersion: 2022, sourceType: "script", globals: { ...globals.browser } }, rules: { "no-var": "off" } },   // Esri's file, kept as it came
  { files: ["tests/**/*.mjs", "eslint.config.mjs"], languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: { ...globals.node } } },
];
