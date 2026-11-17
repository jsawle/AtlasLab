// ============================================================ Units
// Units 1.0: which units the app starts in (kilometres and metres, or miles and feet), and measurements shown as whole
// numbers.
// With "units": "auto" the app guesses from two things the browser already knows, and nothing is sent anywhere:
//   1. the device's time zone. A time zone of the United States or its territories means miles and feet; any other
//      known time zone means kilometres and metres.
//   2. if the time zone is not known (missing, or plain UTC), the browser's language: a US region (en-US, es-US) means
//      miles and feet.
// The person's own choice, made with the units switch, comes before the guess; a units= link parameter before that.
export const UNITS_VERSION = "1.1";   // 1.1 (5.0.0-beta.47): measurements shown as whole numbers

/**
 * A measurement as a whole number: "12,567,744.51" becomes "12,567,745", and "12.567.744,51" becomes "12.567.745".
 * The text must be one number with one or two decimal places and nothing else; anything else comes back unchanged. A
 * value under 1 is left as it is ("0.42"), because rounding it would say 0. The number's own grouping mark is kept.
 * @param {string} text
 * @returns {string}
 */
export function wholeNumberText(text) {
  const m = /^(\s*)(\d[\d.,\s\u00a0\u202f']*?)([.,])(\d{1,2})(\s*)$/.exec(String(text == null ? "" : text));
  if (!m) return text;
  const whole = m[2], digits = whole.replace(/\D/g, "");
  if (!digits || /[.,]$/.test(whole) || whole.includes(m[3])) return text;      // the "decimal" mark also groups: not a number we understand
  const value = parseFloat(digits + "." + m[4]);
  if (!(value >= 1) || value > 9e15) return text;
  const group = (whole.match(/\D/) || [""])[0];
  return m[1] + String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, group) + m[5];
}

// IANA time zones of the United States and its territories (and the old "US/..." names some systems still report).
const US_ZONES = new Set(["America/New_York", "America/Detroit", "America/Chicago", "America/Menominee", "America/Denver", "America/Boise", "America/Phoenix",
  "America/Los_Angeles", "America/Anchorage", "America/Juneau", "America/Sitka", "America/Metlakatla", "America/Yakutat", "America/Nome", "America/Adak",
  "Pacific/Honolulu", "America/Puerto_Rico", "America/St_Thomas", "America/Virgin", "Pacific/Guam", "Pacific/Saipan", "Pacific/Pago_Pago", "Pacific/Samoa",
  "America/Indianapolis", "America/Fort_Wayne", "America/Louisville", "America/Knox_IN", "America/Shiprock", "America/Atka", "Navajo"]);
const US_PREFIXES = ["America/Indiana/", "America/Kentucky/", "America/North_Dakota/", "US/"];

/**
 * Whether a time zone is one of the United States or its territories.
 * @param {string} tz an IANA time zone
 * @returns {boolean}
 */
export function isUSTimeZone(tz) { return typeof tz === "string" && (US_ZONES.has(tz) || US_PREFIXES.some((p) => tz.startsWith(p))); }
/**
 * Whether a time zone says where the device is.
 * a time zone that says where the device is: not missing, and not a bare UTC / GMT / Etc zone
 * @param {string} tz an IANA time zone
 * @returns {boolean}
 */
export function isPlaceTimeZone(tz) { return typeof tz === "string" && tz.includes("/") && !tz.startsWith("Etc/"); }
function regionOf(lang) { const m = /^[a-z]{2,3}(?:[-_][A-Za-z]{4})?[-_]([A-Za-z]{2})\b/.exec(String(lang || "")); return m ? m[1].toUpperCase() : ""; }

/**
 * The units to start in when no one has chosen:
 * "imperial" or "metric", and what decided it ("time zone", "language" or "default")
 * @param {object} hints { timeZone, languages }: the browser's
 * @returns {{units: string, from: string}}
 */
export function guessUnits({ timeZone, languages } = {}) {
  if (isPlaceTimeZone(timeZone)) return { units: isUSTimeZone(timeZone) ? "imperial" : "metric", from: "time zone" };
  const region = (languages || []).map(regionOf).find(Boolean);
  if (region) return { units: region === "US" ? "imperial" : "metric", from: "language" };
  return { units: "metric", from: "default" };
}
const one = (v) => (v === "imperial" || v === "metric" ? v : null);
/**
 * The units the app starts in: the link's, else the person's saved choice, else the config's, else the guess
 * (guessUnits).
 * param: the units= link parameter; stored: the person's saved choice; config: the configuration's "units"
 * @param {object} opts { param, stored, config, timeZone, languages }
 * @returns {{units: string, from: string}} from: "link", "choice", "configuration" or what guessUnits says
 */
export function resolveUnits({ param, stored, config, timeZone, languages } = {}) {
  if (one(param)) return { units: param, from: "link" };
  if (one(stored)) return { units: stored, from: "choice" };
  if (one(config)) return { units: config, from: "configuration" };
  return guessUnits({ timeZone, languages });
}
