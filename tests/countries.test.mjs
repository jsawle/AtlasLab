// Countries by name (lib/countries.js with the list in lib/countries-data.js).
import { COUNTRIES_VERSION, normCountry, countryIndex, matchCountry, detectCountryColumn, matchRows, simplifyRings, insidePoint } from "../lib/countries.js";
import { COUNTRIES, NO_OUTLINE } from "../lib/countries-data.js";
let n = 0, bad = 0; const ok = (c, m) => { n++; if (!c) bad++; console.log((c ? "  ok   " : "  FAIL ") + m); };
const ix = countryIndex(COUNTRIES), is = (text) => { const c = matchCountry(text, ix); return c ? c.iso2 : null; };
const all = (code, names) => names.every((x) => is(x) === code) || names.filter((x) => is(x) !== code).map((x) => x + " -> " + is(x)).join(", ");
const same = (got, m) => ok(got === true, m + (got === true ? "" : ": " + got));

ok(/^\d+\.\d+$/.test(COUNTRIES_VERSION), "has a version: " + COUNTRIES_VERSION);
ok(COUNTRIES.length > 240 && COUNTRIES.every((c) => /^[A-Z]{2}$/.test(c[0]) && c[2]), COUNTRIES.length + " countries, each with a two-letter code and a name");
ok(new Set(COUNTRIES.map((c) => c[0])).size === COUNTRIES.length, "no code twice");
{ const seen = new Map(), twice = []; for (const c of COUNTRIES) for (const x of [c[2]].concat(c[3])) { const k = normCountry(x); if (seen.has(k) && seen.get(k) !== c[0]) twice.push(x); seen.set(k, c[0]); }
  ok(!twice.length, "no name points at two countries" + (twice.length ? ": " + twice.join(", ") : "")); }

ok(normCountry(" D.R.C. ") === "drc" && normCountry("Côte d'Ivoire") === "cote divoire" && normCountry("The Gambia") === "gambia" && normCountry("St. Lucia") === "saint lucia" && normCountry("Trinidad & Tobago") === "trinidad and tobago", "names are compared without case, accents, dots, 'the' and with St as Saint");
same(all("CD", ["DRC", "drc", "D.R.C.", "DR Congo", "Democratic Republic of the Congo", "Congo, Dem. Rep.", "Congo-Kinshasa", "Congo (Kinshasa)", "Congo DRC", "COD", "cd", "Zaire", "República Democrática del Congo", "RDC"]), "the Democratic Republic of the Congo, however it is written");
same(all("CG", ["Congo", "congo", "Republic of the Congo", "Congo, Rep.", "Congo-Brazzaville", "COG", "CG"]), "plain Congo is the Republic of the Congo (its ISO name)");
same(all("US", ["USA", "U.S.A.", "US", "U.S.", "United States", "United States of America", "America", "Estados Unidos", "EEUU", "États-Unis", "Vereinigte Staaten"]), "the United States");
same(all("GB", ["UK", "U.K.", "United Kingdom", "Great Britain", "Britain", "GBR", "GB", "Reino Unido", "Royaume-Uni"]), "the United Kingdom");
ok(is("England") === null && is("Scotland") === null, "England and Scotland are not the United Kingdom, so they are not matched");
same(all("KR", ["South Korea", "Korea, Rep.", "Republic of Korea", "Korea, Republic of", "KOR"]), "South Korea");
same(all("KP", ["North Korea", "DPRK", "Korea, Dem. People's Rep.", "PRK"]), "North Korea");
ok(is("Korea") === null && is("Virgin Islands") === null, "a name two countries share (Korea, Virgin Islands) is not matched");
same(all("CI", ["Côte d'Ivoire", "Cote d'Ivoire", "Ivory Coast", "CIV"]), "Côte d'Ivoire");
ok(is("Turkey") === "TR" && is("Türkiye") === "TR" && is("Czechia") === "CZ" && is("Czech Republic") === "CZ" && is("Burma") === "MM" && is("Swaziland") === "SZ" && is("Holland") === "NL" && is("Russia") === "RU" && is("Viet Nam") === "VN" && is("Lao PDR") === "LA", "older and everyday names");
ok(is("Gambia, The") === "GM" && is("Bahamas, The") === "BS" && is("Iran, Islamic Rep.") === "IR" && is("Egypt, Arab Rep.") === "EG" && is("Venezuela, RB") === "VE" && is("Micronesia, Fed. Sts.") === "FM" && is("Bolivia (Plurinational State of)") === "BO" && is("Tanzania, United Republic of") === "TZ", "names as data tables write them, round a comma or with brackets");
ok(is("Georgia") === "GE" && is("Guinea") === "GN" && is("Guinea-Bissau") === "GW" && is("Niger") === "NE" && is("Nigeria") === "NG" && is("Dominica") === "DM" && is("Dominican Republic") === "DO" && is("Sudan") === "SD" && is("South Sudan") === "SS", "names that are close to each other stay apart");
ok(is("") === null && is("   ") === null && is("Narnia") === null && is("12") === null && is("ZZ") === null, "nothing, a made-up name, a number and an unused code are not matched");
ok(is("مصر") === "EG" && is("Deutschland") === "DE" && is("Brasil") === "BR" && is("España") === "ES" && is("Espagne") === "ES", "names in Arabic, German, Portuguese, Spanish and French");
ok(NO_OUTLINE.includes("TW") && NO_OUTLINE.includes("XK") && is("Taiwan") === null && is("Kosovo") === null && is("Hong Kong") === null, "places the layer has no outline for (Taiwan, Kosovo, Hong Kong) are not matched");
ok(matchCountry("drc", ix).name === "Congo DRC" && matchCountry("uk", ix).iso3 === "GBR", "a match gives the name shown and the three-letter code");

// the column that holds countries
{ const rows = [["Kenya", "54", "x"], ["DRC", "96", "y"], ["Narnia", "1", "z"], ["U.K.", "67", "x"]];
  const d = detectCountryColumn(["Place", "Population", "Group"], rows, ix);
  ok(d.idx === 0 && d.matched === 3 && d.filled === 4, "a column is countries when 70% of its cells are: " + JSON.stringify(d));
  ok(detectCountryColumn(["Town", "Group"], [["Leeds", "x"], ["Georgia", "y"], ["Paris", "x"]], ix).idx === -1, "one country among towns is not a column of countries");
  ok(detectCountryColumn(["State", "n"], [["Georgia", "1"], ["Texas", "2"], ["Ohio", "3"]], ix).idx === -1, "US states under State are not countries");
  ok(detectCountryColumn(["City", "Country"], [["Lagos", "Nigeria"], ["Niger", "Narnia"], ["Chad", "Oz"]], ix).idx === 1, "a column headed Country is taken ahead of one that happens to hold more country names");
  ok(detectCountryColumn(["Name", "ISO3"], [["A", "KEN"], ["B", "COD"]], ix).idx === 1, "a column of three-letter codes");
  ok(detectCountryColumn(["a", "b"], [["1", "2"], ["3", "4"]], ix).idx === -1, "no countries: -1");
  const m = matchRows(rows, 0, ix);
  ok(m.matched === 3 && m.isoOf.join() === "KE,CD,,GB" && m.missed.join() === "Narnia" && m.countries.length === 3, "each row's country, and the names not matched: " + JSON.stringify(m.missed));
  const m2 = matchRows([["Oz"], ["oz"], [""], ["Peru"]], 0, ix);
  ok(m2.missed.join() === "Oz" && m2.empty === 1 && m2.matched === 1, "a name not matched is listed once; an empty cell is counted apart"); }

// outlines
{ const big = []; for (let i = 0; i <= 400; i++) { const a = i / 400 * 2 * Math.PI; big.push([1e6 * Math.cos(a) + (i % 2) * 20, 1e6 * Math.sin(a)]); } big[400] = big[0].slice();
  const speck = [[3e6, 0], [3e6 + 1000, 0], [3e6 + 1000, 1000], [3e6, 1000], [3e6, 0]];
  const island = [[2e6, 0], [2e6 + 2e5, 0], [2e6 + 2e5, 2e5], [2e6, 2e5], [2e6, 0]];
  const s = simplifyRings([big, speck, island]);
  ok(s.length === 2 && s[0].length < 120 && s[0].length > 20 && s[1].length === 5, "an outline keeps fewer points, keeps a real island and drops a speck: " + s.map((r) => r.length).join(", ") + " points");
  ok(s.every((r) => r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] && r.every((p) => Number.isInteger(p[0]) && Number.isInteger(p[1]))), "each ring is still closed, in whole metres");
  ok(simplifyRings([speck]).length === 1 && simplifyRings([]).length === 0, "a country that is only a speck is kept; nothing gives nothing");
  const p = insidePoint([speck, big]); ok(Math.abs(p[0]) < 2000 && Math.abs(p[1]) < 2000, "the point for a country is in the middle of its largest part");
  const crescent = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 9], [9, 9], [9, 1], [0, 1], [0, 0]];
  const q = insidePoint([crescent]); ok(q[0] >= 9 && q[0] <= 10 && q[1] > 1 && q[1] < 9, "for a crescent the point is moved onto the land: " + q.join(", "));
  ok(insidePoint([]) === null, "no outline: no point"); }
console.log(`${n - bad}/${n} checks passed`); if (bad) process.exit(1);
