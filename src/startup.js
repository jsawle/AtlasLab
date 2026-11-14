// ============================================================ Start-up
// The Map layers count follows the map on screen: layers added or removed, another map opened.
import "./versions.js?v=5.0.0-beta.41";   // first: keeps the files running in the order they were written in (see app.js)
import { sanitizeDoc } from "../lib/doc.js?v=5.0.0-beta.41";
import { state } from "./state.js?v=5.0.0-beta.41";
import { APP_VERSION, authStash, cfgName, configMissing, localeMissing, cfg } from "./config.js?v=5.0.0-beta.41";
import { reactiveUtils } from "./sdk.js?v=5.0.0-beta.41";
import { defaultBasemap, linkedScene, linkedMap, localMap, startDone } from "./views.js?v=5.0.0-beta.41";
import { markDirty, watchBottom } from "./session.js?v=5.0.0-beta.41";
import { toast } from "./ui.js?v=5.0.0-beta.41";
import { updatePopupEnabled } from "./popups.js?v=5.0.0-beta.41";
import { listedLayerCount, updateToolBadges, openWebMapItem, openWebSceneItem } from "./maps.js?v=5.0.0-beta.41";
import { loadDocument } from "./local-files.js?v=5.0.0-beta.41";

reactiveUtils.watch(listedLayerCount, updateToolBadges, { initial: true });
state.view.when(() => {
  updatePopupEnabled();
  watchBottom(0);
  if (configMissing) toast("Config “" + configMissing + "” wasn't found, so the default is shown.", 6000);
  if (localeMissing) console.warn("No language file for \"" + localeMissing + "\" in locales/, so the app's own wording is in English unless the config supplies it.");
});
if (authStash) {
  if (cfgName !== "default") { const u = new URL(location.href); u.searchParams.set("config", cfgName); history.replaceState(history.state, "", u.pathname + u.search); }
  if (authStash.doc) { const res = sanitizeDoc(authStash.doc); if (res.ok) { await loadDocument(res.doc); markDirty(); } }
}
// A link can open a web map (webmap=<id>, in 2D) or a web scene (webscene=<id>, in 3D). With both, the scene is opened.
const linkedOpen = linkedScene ? openWebSceneItem(linkedScene, { skipConfirm: true }) : linkedMap ? openWebMapItem(linkedMap, { skipConfirm: true }) : null;
if (linkedOpen) linkedOpen.then((ok) => { if (!ok && !localMap.basemap) localMap.basemap = defaultBasemap(); }).finally(startDone);
else startDone();
console.info(cfg.appName, "v" + APP_VERSION, "config", cfgName);
