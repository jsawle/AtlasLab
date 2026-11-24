// node tests/units.test.mjs
import { guessUnits, resolveUnits, isUSTimeZone, UNITS_VERSION, wholeNumberText, metresOf, lengthText } from "../lib/units.js";
let n = 0, bad = 0;
const eq = (got, want, msg) => { n++; if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.error("FAIL " + msg + ": got " + JSON.stringify(got) + ", wanted " + JSON.stringify(want)); } };
const g = (timeZone, ...languages) => guessUnits({ timeZone, languages }).units;
eq(UNITS_VERSION, "1.2", "version");
// the time zone decides
for (const tz of ["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles", "America/Phoenix", "America/Anchorage", "Pacific/Honolulu", "America/Indiana/Knox", "America/Kentucky/Louisville", "America/North_Dakota/Center", "America/Detroit", "America/Puerto_Rico", "Pacific/Guam", "US/Eastern"]) eq(g(tz, "en-GB"), "imperial", tz + " is miles, whatever the language");
for (const tz of ["Europe/London", "Europe/Budapest", "America/Toronto", "America/Vancouver", "America/Mexico_City", "America/Sao_Paulo", "Asia/Muscat", "Africa/Johannesburg", "Australia/Sydney", "America/Panama", "America/Jamaica"]) eq(g(tz, "en-US"), "metric", tz + " is kilometres, even with a US-English browser");
eq(guessUnits({ timeZone: "Europe/London", languages: ["en-US"] }).from, "time zone", "says what decided it");
eq(isUSTimeZone("America/Argentina/Buenos_Aires"), false, "not every America/ zone");
// no usable time zone: the language's region
eq(g(undefined, "en-US"), "imperial", "no time zone, en-US");
eq(g("UTC", "en-US", "en"), "imperial", "UTC says nothing about place: en-US");
eq(g("Etc/GMT+5", "es-US"), "imperial", "Etc zones say nothing about place: es-US");
eq(g("UTC", "en-GB"), "metric", "UTC, en-GB");
eq(g("", "en", "en-US"), "imperial", "the first language with a region");
eq(g(undefined, "zh-Hans-CN"), "metric", "a language with a script");
eq(g(undefined, "en"), "metric", "nothing to go on: kilometres");
eq(guessUnits().units, "metric", "nothing given at all");
// the order: link, the person's choice, the configuration, the guess
const base = { timeZone: "America/Chicago", languages: ["en-US"] };
eq(resolveUnits({ ...base, config: "auto" }), { units: "imperial", from: "time zone" }, "auto guesses");
eq(resolveUnits({ ...base }), { units: "imperial", from: "time zone" }, "no setting is auto");
eq(resolveUnits({ ...base, config: "metric" }), { units: "metric", from: "configuration" }, "the configuration can fix the units");
eq(resolveUnits({ ...base, config: "metric", stored: "imperial" }), { units: "imperial", from: "choice" }, "the person's choice comes before the configuration");
eq(resolveUnits({ ...base, config: "auto", stored: "metric", param: "imperial" }), { units: "imperial", from: "link" }, "a link parameter comes first");
eq(resolveUnits({ ...base, config: "auto", stored: "furlongs", param: "x" }), { units: "imperial", from: "time zone" }, "anything else is ignored");
eq(wholeNumberText("12,567,744.51"), "12,567,745", "a measurement loses its decimal places, rounded");
eq(wholeNumberText("13,143.35"), "13,143", "and rounds down when it should");
eq(wholeNumberText("12.567.744,51"), "12.567.745", "a number written the continental way keeps its own marks");
eq(wholeNumberText("999.5"), "1,000".replace(",", ""), "a carry adds a digit (no grouping mark was in the number, so none is added)");
eq(wholeNumberText("9,999.99"), "10,000", "with a grouping mark in the number, the carry is grouped too");
eq(wholeNumberText("0.42"), "0.42", "a value under 1 is left alone: rounding it would say 0");
eq(wholeNumberText(" 5,694.45 "), " 5,694 ", "spaces round it are kept");
eq([wholeNumberText("1,599,282"), wholeNumberText("km"), wholeNumberText("12.5 km"), wholeNumberText("1.234.567"), wholeNumberText("")], ["1,599,282", "km", "12.5 km", "1.234.567", ""], "anything that is not one number with one or two decimal places comes back unchanged");
eq([metresOf({ value: 2.5, unit: "kilometers" }), metresOf({ value: 1, unit: "miles" }), metresOf({ value: 100, unit: "feet" })], [2500, 1609.344, 30.48], "a measured length in metres, from the SDK's units");
eq([metresOf({ value: 3, unit: "furlongs" }), metresOf(null), metresOf({ unit: "meters" })].map(Number.isNaN), [true, true, true], "an unknown unit or no value is not a length");
eq([lengthText(2312400, "metric", "en"), lengthText(2999, "metric", "en"), lengthText(3000, "metric", "en")], ["2,312 km", "2,999 m", "3 km"], "metric: metres under 3,000 m, then kilometres, as Esri's measuring tools pick them, whole numbers");
eq([lengthText(2312400, "imperial", "en"), lengthText(300, "imperial", "en"), lengthText(305, "imperial", "en")], ["1,437 mi", "984 ft", "0.19 mi"], "imperial: feet under 1,000 ft, then miles; under 1 keeps two decimal places, as the panel does");
eq([lengthText(2312400, "metric", "es"), lengthText(12345678, "metric", "de")], ["2312 km", "12.346 km"], "the number's marks are the language's");
eq([lengthText(NaN, "metric"), lengthText(-1, "metric"), lengthText(0, "metric", "xx-not-a-locale-!!")], ["", "", "0 m"], "no length, no text; an odd locale falls back to English");
console.log(bad ? `${bad} of ${n} units tests failed` : `All ${n} units tests passed.`); process.exit(bad ? 1 : 0);
