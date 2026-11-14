// The app's own code as one text, for the tests that check what it says: app.js and every file in src/.
import fs from "node:fs";
const root = new URL("../", import.meta.url);
export const srcFiles = () => fs.readdirSync(new URL("src/", root)).filter((f) => f.endsWith(".js")).sort();
export const appSource = () => [fs.readFileSync(new URL("app.js", root), "utf8"), ...srcFiles().map((f) => fs.readFileSync(new URL("src/" + f, root), "utf8"))].join("\n");
