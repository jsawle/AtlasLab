// Reading a config and its language file. No SDK and no DOM, so it runs under Node for the tests.
// A config (config/<name>.json) lists only what differs from the app's defaults. It may start from another config
// with "extends": "<name>", and it names a language with "locale": the wording then comes from locales/<locale>.json,
// one shared file per language, with the config's own "strings" laid over it.
export const CONFIG_VERSION = "2.1";   // 2.1: a partner's config from an ArcGIS Online item (?appid=) or from the manager's preview. 2.0: "extends" and shared language files (1.0: one file per config, wording inside it)
// The type keyword that marks an ArcGIS Online item as an AtlasLab partner config (2.1). The education team's manager app sets it.
export const PARTNER_KEYWORD = "AtlasLabPartnerConfig";
// What a config from outside the repository (an item, a preview) may not set: the app always talks to ArcGIS Online itself.
const NOT_FROM_OUTSIDE = ["portalUrl"];

export function mergeConfig(base, over) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const k of Object.keys(over || {})) {
    const b = base ? base[k] : undefined, o = over[k];
    out[k] = b && o && typeof b === "object" && typeof o === "object" && !Array.isArray(b) && !Array.isArray(o) ? mergeConfig(b, o) : o;
  }
  return out;
}
const clean = (s) => String(s || "").replace(/[^\w-]/g, "");

// fetchJson(path) resolves to the parsed file, or throws when it isn't there.
// Returns { raw, name, chain, missing, localeFile, localeMissing }.
export async function loadConfig(requested, fetchJson) {
  let name = clean(requested) || "default", raw = {}, missing = null;
  try { raw = await fetchJson(`./config/${name}.json`); }
  catch (e) {
    if (name !== "default") { missing = name; name = "default"; try { raw = await fetchJson("./config/default.json"); } catch (e2) { raw = {}; } }
  }
  return { ...(await finishConfig(raw, [name], fetchJson)), name, missing };
}

// A config kept in the data of an ArcGIS Online item (2.1), opened with ?appid=<item id>. Accepted only from a public item
// owned by one of `orgs` and carrying PARTNER_KEYWORD, so nobody else can make an item that dresses the app in their
// own name, links and content. It may start from a config in config/ ("extends"), like any other.
// Returns what loadConfig returns, plus `item` ({ id, title, orgId, modified }), or `refused` (why it wasn't used).
export async function loadItemConfig(appid, { portal, orgs, fetchJson }) {
  const id = String(appid || "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(id)) return { refused: "not an item ID" };
  const base = String(portal || "https://www.arcgis.com").replace(/\/+$/, "") + "/sharing/rest/content/items/" + id;
  let item, data;
  try { [item, data] = await Promise.all([fetchJson(base + "?f=json"), fetchJson(base + "/data?f=json")]); }
  catch (e) { return { refused: "couldn't be reached" }; }
  if (!item || item.error || !item.id) return { refused: "no such public item" };
  if (!(orgs || []).includes(item.orgId)) return { refused: "not from the education team's organization" };
  if (!(item.typeKeywords || []).includes(PARTNER_KEYWORD)) return { refused: "not marked as an AtlasLab config" };
  if (!data || typeof data !== "object" || Array.isArray(data) || data.error) return { refused: "no config in the item" };
  const out = await finishConfig(fromOutside(data), ["item " + id], fetchJson);
  return { ...out, name: "item-" + id, missing: null, item: { id, title: item.title || "", orgId: item.orgId, modified: item.modified || 0 } };
}

// A config the manager app hands to a preview of the app (2.1). Treated like an item's config.
export async function loadPreviewConfig(raw, fetchJson) {
  const out = await finishConfig(fromOutside(raw), ["preview"], fetchJson);
  return { ...out, name: "preview", missing: null };
}

function fromOutside(data) {
  const raw = JSON.parse(JSON.stringify(data || {}));
  for (const k of NOT_FROM_OUTSIDE) delete raw[k];
  return raw;
}

// What every kind of config goes through: the configs it extends, then its language file.
async function finishConfig(raw, chain, fetchJson) {
  chain = chain.slice();
  for (let i = 0; i < 3 && typeof raw.extends === "string"; i++) {
    const parent = clean(raw.extends);
    const { extends: _x, ...own } = raw;
    if (!parent || chain.includes(parent)) { raw = own; break; }
    try { raw = mergeConfig(await fetchJson(`./config/${parent}.json`), own); chain.push(parent); }
    catch (e) { raw = own; break; }
  }
  if ("extends" in raw) { const { extends: _x, ...rest } = raw; raw = rest; }
  let localeFile = null, localeMissing = null;
  const loc = clean(raw.locale) || "en", base = loc.split("-")[0];
  if (base.toLowerCase() !== "en") {
    for (const l of [...new Set([loc, base])]) {
      try { const f = await fetchJson(`./locales/${l}.json`); if (f && typeof f === "object") { localeFile = { ...f, name: l }; break; } } catch (e) { /* try the next */ }
    }
    if (!localeFile) localeMissing = loc;
  }
  if (raw.dir == null && localeFile && localeFile.dir) raw = { ...raw, dir: localeFile.dir };
  return { raw, chain, localeFile, localeMissing };
}

// The wording the app shows: English, then the language file, then the config's own.
export const buildStrings = (defaults, localeFile, cfg) => ({ ...defaults, ...((localeFile && localeFile.strings) || {}), ...((cfg && cfg.strings) || {}) });
