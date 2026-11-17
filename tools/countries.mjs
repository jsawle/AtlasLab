// Builds lib/countries-data.js: the countries the app can place by name, and the names each is known by.
//
//   npm install --no-save i18n-iso-countries
//   node tools/countries.mjs
//
// The countries, their two-letter codes and the name shown for each come from Esri's World Countries (Generalized)
// layer, which is also where the app gets their outlines, so every name here has a place on the map. The three-letter
// codes and the names in each language come from the i18n-iso-countries package (MIT), which follows ISO 3166-1. The
// MORE list below adds the everyday and data-table spellings (the World Bank's "Congo, Dem. Rep.", "DRC", "UK").
// A name that would point at two countries is left out and listed when this runs, unless it is the layer's own name for
// one of them or is in MORE.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { normCountry } from "../lib/countries.js";
const require = createRequire(import.meta.url);
const iso = require("i18n-iso-countries");
const LANGS = ["en", "es", "fr", "de", "pt", "ar"];
const SERVICE = "https://services.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/World_Countries_(Generalized)/FeatureServer/0";

const MORE = {
  CD: ["DRC", "DR Congo", "D.R. Congo", "Dem. Rep. Congo", "Dem. Rep. of the Congo", "Democratic Republic of Congo", "Congo, Dem. Rep.", "Congo, Democratic Republic of the", "Congo, Democratic Republic", "Congo-Kinshasa", "Congo (Kinshasa)", "Congo DR", "RDC", "RD Congo", "Zaire"],
  CG: ["Congo", "Republic of Congo", "Rep. of the Congo", "Congo, Rep.", "Congo, Republic of the", "Congo, Republic of", "Congo-Brazzaville", "Congo (Brazzaville)", "Congo Republic"],
  US: ["America", "United States", "U.S. of A.", "EEUU", "EE. UU.", "EUA", "États-Unis", "Estados Unidos de América"],
  GB: ["U.K.", "Britain", "United Kingdom of Great Britain and Northern Ireland", "Great Britain and Northern Ireland"],
  AE: ["UAE", "U.A.E.", "Emirates"],
  KR: ["Korea, Rep.", "Korea (South)", "Korea South", "S. Korea", "Korea Republic", "Rep. of Korea"],
  KP: ["DPRK", "Korea, Dem. People's Rep.", "Korea, Democratic People's Republic of", "Democratic People's Republic of Korea", "Korea (North)", "Korea North", "N. Korea", "Korea DPR"],
  CN: ["PRC", "People's Republic of China", "Mainland China"], RU: ["Russia"], CZ: ["Czechia", "Czech Rep."], TR: ["Turkey", "Türkiye", "Turkiye"], CI: ["Ivory Coast", "Cote d'Ivoire", "Cote dIvoire"],
  MM: ["Burma"], SZ: ["Swaziland", "eSwatini"], CV: ["Cape Verde"], TL: ["East Timor", "Timor Leste"], MK: ["Macedonia", "FYR Macedonia", "Macedonia, FYR"],
  NL: ["Holland", "The Netherlands"], PS: ["Palestine", "State of Palestine", "West Bank and Gaza", "Palestinian Territories", "Occupied Palestinian Territory"],
  VA: ["Vatican", "Holy See", "Vatican City State"], SY: ["Syrian Arab Republic"], IR: ["Iran, Islamic Rep.", "Islamic Republic of Iran", "Iran (Islamic Republic of)"],
  EG: ["Egypt, Arab Rep.", "Arab Republic of Egypt"], VE: ["Venezuela, RB", "Venezuela (Bolivarian Republic of)", "Bolivarian Republic of Venezuela"],
  YE: ["Yemen, Rep.", "Republic of Yemen"], GM: ["The Gambia", "Gambia, The"], BS: ["The Bahamas", "Bahamas, The"], LA: ["Lao PDR", "Laos", "Lao"],
  KG: ["Kyrgyz Republic", "Kirghizia"], SK: ["Slovak Republic"], FM: ["Micronesia, Fed. Sts.", "Federated States of Micronesia", "FS Micronesia"],
  BN: ["Brunei"], VN: ["Viet Nam"], BO: ["Bolivia (Plurinational State of)", "Plurinational State of Bolivia"], TZ: ["United Republic of Tanzania", "Tanzania, United Republic of"],
  MD: ["Republic of Moldova", "Moldova, Republic of"], ST: ["São Tomé and Príncipe", "Sao Tome & Principe"], TT: ["Trinidad & Tobago"], AG: ["Antigua & Barbuda"],
  BA: ["Bosnia", "Bosnia & Herzegovina", "Bosnia-Herzegovina"], KN: ["St. Kitts and Nevis", "St Kitts & Nevis"], VC: ["St. Vincent and the Grenadines", "St Vincent"],
  DO: ["Dominican Rep."], CF: ["Central African Rep.", "CAR"], GQ: ["Eq. Guinea"], SS: ["S. Sudan"], ZA: ["RSA"], NZ: ["Aotearoa"], WS: ["Western Samoa"],
  FK: ["Falklands", "Falkland Islands (Malvinas)", "Malvinas"], VI: ["Virgin Islands (U.S.)", "U.S. Virgin Islands", "United States Virgin Islands"], VG: ["Virgin Islands (British)"],
  CW: ["Curaçao"], RE: ["Reunion"], BL: ["Saint Barthélemy", "St. Barts"], SX: ["Sint Maarten (Dutch part)"], MF: ["Saint Martin (French part)"], SJ: ["Svalbard and Jan Mayen"],
  CC: ["Cocos (Keeling) Islands", "Keeling Islands"], PN: ["Pitcairn Islands"], SH: ["St. Helena", "Saint Helena, Ascension and Tristan da Cunha"], BQ: ["Caribbean Netherlands", "Bonaire, Sint Eustatius and Saba", "BES Islands"]
};
// Names that people use for more than one country: never matched, so they are listed for the student to fix.
const NEVER = ["Korea", "Virgin Islands", "Guinea Bissau Guinea", "Samoa Islands", "Sahara"];

const res = await fetch(SERVICE + "/query?where=1%3D1&outFields=COUNTRY,ISO&returnGeometry=false&orderByFields=ISO&f=json");
const feats = (await res.json()).features.map((f) => f.attributes);
const ROOT = { BQ: "Bonaire, Sint Eustatius and Saba", ES: "Spain", PT: "Portugal", TF: "French Southern Territories" };   // codes the layer splits into parts
const byIso = new Map();
for (const f of feats) { if (!byIso.has(f.ISO)) byIso.set(f.ISO, { iso2: f.ISO, name: ROOT[f.ISO] || f.COUNTRY, parts: [] }); byIso.get(f.ISO).parts.push(f.COUNTRY); }

const owner = new Map(), clash = new Map(), never = new Set(NEVER.map(normCountry));
const claim = (key, iso2, rank) => {   // rank 0: the layer's own name, 1: MORE, 2: the package
  if (!key || never.has(key)) return;
  const had = owner.get(key);
  if (!had) { owner.set(key, { iso2, rank }); return; }
  if (had.iso2 === iso2) { had.rank = Math.min(had.rank, rank); return; }
  if (rank < had.rank) { owner.set(key, { iso2, rank }); return; }
  if (rank === had.rank) clash.set(key, [had.iso2, iso2]);
};
const raw = new Map();   // iso2 -> the names as written, in the order claimed
const add = (iso2, name, rank) => { if (!name) return; if (!raw.has(iso2)) raw.set(iso2, []); raw.get(iso2).push([String(name), rank]); claim(normCountry(name), iso2, rank); };
for (const c of byIso.values()) { add(c.iso2, c.name, 0); for (const p of c.parts) if (c.parts.length === 1) add(c.iso2, p, 0); }
for (const [k, list] of Object.entries(MORE)) { if (!byIso.has(k)) throw new Error("MORE has a code the layer lacks: " + k); for (const n of list) add(k, n, 1); }
for (const lang of LANGS) {
  const names = require("i18n-iso-countries/langs/" + lang + ".json").countries;
  for (const [k, v] of Object.entries(names)) { if (!byIso.has(k)) continue; for (const n of [].concat(v)) add(k, n, 2); }
}
for (const [key] of clash) { const o = owner.get(key); if (o && o.rank === 2) owner.delete(key); }
const out = [];
for (const c of [...byIso.values()].sort((a, b) => a.iso2.localeCompare(b.iso2))) {
  const iso3 = iso.alpha2ToAlpha3(c.iso2) || "";
  const seen = new Set([normCountry(c.name)]), names = [];
  for (const [n] of raw.get(c.iso2) || []) { const k = normCountry(n), o = owner.get(k); if (!o || o.iso2 !== c.iso2 || seen.has(k)) continue; seen.add(k); names.push(n); }
  out.push([c.iso2, iso3, c.name, names]);
}
const missing = Object.keys(require("i18n-iso-countries/langs/en.json").countries).filter((k) => !byIso.has(k));
console.log(out.length + " countries, " + out.reduce((a, c) => a + c[3].length + 1, 0) + " names.");
console.log("Left out (two countries share the name): " + [...clash].filter(([k]) => !owner.has(k)).map(([k, v]) => k + " (" + v.join("/") + ")").join(", "));
console.log("ISO codes the layer has no outline for: " + missing.join(", "));
const head = "// ============================================================ Countries data\n// Made by tools/countries.mjs: do not edit by hand. The countries in Esri's World Countries (Generalized) layer:\n// [two-letter code, three-letter code, the name shown, the other names it is known by].\n";
writeFileSync(new URL("../lib/countries-data.js", import.meta.url), head + "export const COUNTRY_DATA_DATE = " + JSON.stringify(new Date().toISOString().slice(0, 10)) + ";\nexport const NO_OUTLINE = " + JSON.stringify(missing) + ";\nexport const COUNTRIES = [\n" + out.map((c) => JSON.stringify(c)).join(",\n") + "\n];\n");
