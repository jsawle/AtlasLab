// ============================================================ Start-up
// The last file to run. Opens the map or scene the link names (webmap=, webscene=) or the map kept across a sign-in,
// says if the config asked for wasn't found, and then tells the rest of the app that start-up is done. From here on the
// Map layers count follows the map on screen: layers added or removed, another map opened.
import "./versions.js?v=5.0.0-beta.77";   // first: keeps the files running in the order they were written in (see app.js)
import { sanitizeDoc } from "../lib/doc.js?v=5.0.0-beta.77";
import { state } from "./state.js?v=5.0.0-beta.77";
import { APP_VERSION, authStash, cfgName, cfgItem, keepConfig, configMissing, localeMissing, cfg } from "./config.js?v=5.0.0-beta.77";
import { reactiveUtils } from "./sdk.js?v=5.0.0-beta.77";
import { defaultBasemap, linkedScene, linkedMap, localMap, startDone } from "./views.js?v=5.0.0-beta.77";
import { markDirty, watchBottom } from "./session.js?v=5.0.0-beta.77";
import { toast } from "./ui.js?v=5.0.0-beta.77";
import { updatePopupEnabled } from "./popups.js?v=5.0.0-beta.77";
import { listedLayerCount, updateToolBadges, openWebMapItem, openWebSceneItem } from "./maps.js?v=5.0.0-beta.77";
import { loadDocument } from "./local-files.js?v=5.0.0-beta.77";

reactiveUtils.watch(listedLayerCount, updateToolBadges, { initial: true });
state.view.when(() => {
  updatePopupEnabled();
  watchBottom(0);
  if (configMissing) toast("Config “" + configMissing + "” wasn't found, so the default is shown.", 6000);
  if (localeMissing) console.warn("No language file for \"" + localeMissing + "\" in locales/, so the app's own wording is in English unless the config supplies it.");
});
if (authStash) {
  const u = new URL(location.href); keepConfig(u.searchParams);
  if (u.search !== location.search) history.replaceState(history.state, "", u.pathname + u.search);
  if (authStash.doc) { const res = sanitizeDoc(authStash.doc); if (res.ok) { await loadDocument(res.doc); markDirty(); } }
}
// A link can open a web map (webmap=<id>, in 2D) or a web scene (webscene=<id>, in 3D). With both, the scene is opened.
const linkedOpen = linkedScene ? openWebSceneItem(linkedScene, { skipConfirm: true }) : linkedMap ? openWebMapItem(linkedMap, { skipConfirm: true }) : null;
if (linkedOpen) linkedOpen.then((ok) => { if (!ok && !localMap.basemap) localMap.basemap = defaultBasemap(); }).finally(startDone);
else startDone();
console.info(cfg.appName, "v" + APP_VERSION, "config", cfgItem ? "item " + cfgItem.id : cfgName);
