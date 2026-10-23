/**
 * TaxPlot — tiny i18n loader, shared by app.js and ca.js.
 *
 * i18n prep only: this wires every screen's copy through t("some.key") into
 * locales/en.json instead of inline strings, so a future locale file can be
 * dropped in without touching app.js/ca.js. We are NOT translating yet —
 * en.json is still the only locale and its values are plain English.
 *
 * No build step, so locale data is loaded with a synchronous XHR (same
 * origin, tiny file) rather than fetch() — fetch is always async, and this
 * app renders its first screen synchronously on DOMContentLoaded. Keeping
 * the load synchronous means t() is usable immediately and nothing has to
 * wait on a promise. If the load fails for any reason, t() falls back to
 * returning the key itself so a missing/broken locale shows up as a visibly
 * wrong label instead of blank UI.
 */
function loadLocale(path) {
  try {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", path, false);
    xhr.send(null);
    return JSON.parse(xhr.responseText);
  } catch (e) {
    console.error("TaxPlot: failed to load locale " + path, e);
    return {};
  }
}

// Replaces {{name}} in a string with vars.name, leaving the placeholder
// untouched if that var is missing. Shared by t() and the glossary (task
// 4b) — glossary entries interpolate live TAX_CONFIG figures the same way
// locale strings do, so a rupee threshold never gets duplicated as a
// hardcoded literal in a content file.
function interpolate(val, vars) {
  if (!vars) return val;
  return val.replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{{${k}}}`));
}

// t("a.b.c", {name: "X"}) looks up locale.a.b.c and replaces {{name}} with
// vars.name. Returns the dotted key unchanged if the string isn't found.
function makeT(locale) {
  return function t(key, vars) {
    const val = key.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), locale);
    if (typeof val !== "string") return key;
    return interpolate(val, vars);
  };
}
