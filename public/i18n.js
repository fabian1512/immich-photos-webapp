"use strict";
// Tiny i18n layer: JSON locale files in /locales, English as fallback, plural rules via Intl.PluralRules.
// Add a language by adding /locales/<code>.json (see CONTRIBUTING.md) – no code change needed.
(function (root) {
  const FALLBACK = "en";
  let dict = {}, fallback = {}, lang = FALLBACK, rules = new Intl.PluralRules(FALLBACK), languages = [];

  const fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s);

  /** t("key", { name: "x" }) – with { count } the plural form key.<one|few|many|other> is chosen. */
  function t(key, vars) {
    const forms = [];
    if (vars && typeof vars.count === "number") forms.push(`${key}.${rules.select(vars.count)}`, `${key}.other`);
    forms.push(key);
    for (const d of [dict, fallback]) for (const k of forms) if (typeof d[k] === "string") return fill(d[k], vars);
    return key; // visible hint for a missing key
  }

  /** Picks the language: saved choice → browser languages → English. */
  function pick(codes) {
    let saved = null;
    try { saved = localStorage.getItem("lang"); } catch {}
    const have = new Set(codes);
    if (saved && have.has(saved)) return saved;
    for (const l of navigator.languages || [navigator.language || FALLBACK]) {
      const low = String(l).toLowerCase();
      if (have.has(low)) return low;
      const base = low.split("-")[0];
      if (have.has(base)) return base;
    }
    return FALLBACK;
  }
  const getJSON = (url) => fetch(url, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(url))));

  async function init() {
    try { languages = await getJSON("/locales/index.json"); } catch { languages = [{ code: FALLBACK, name: "English" }]; }
    lang = pick(languages.map((l) => l.code));
    try { fallback = await getJSON(`/locales/${FALLBACK}.json`); } catch { fallback = {}; }
    dict = lang === FALLBACK ? fallback : await getJSON(`/locales/${lang}.json`).catch(() => fallback);
    try { rules = new Intl.PluralRules(lang); } catch { rules = new Intl.PluralRules(FALLBACK); }
    const meta = languages.find((l) => l.code === lang) || {};
    document.documentElement.lang = lang;
    document.documentElement.dir = meta.dir === "rtl" ? "rtl" : "ltr";
    apply(document);
    document.title = t("app.name");
  }

  /** Fills data-i18n (text), data-i18n-placeholder/-aria-label/-title attributes below `scope`. */
  function apply(scope) {
    scope.querySelectorAll("[data-i18n]").forEach((e) => (e.textContent = t(e.dataset.i18n)));
    for (const [attr, data] of [["placeholder", "i18nPlaceholder"], ["aria-label", "i18nAriaLabel"], ["title", "i18nTitle"]])
      scope.querySelectorAll(`[data-i18n-${attr}]`).forEach((e) => e.setAttribute(attr, t(e.dataset[data])));
  }

  function setLanguage(code) {
    try { localStorage.setItem("lang", code); } catch {}
    location.reload();
  }
  const api = { t, init, apply, setLanguage, get lang() { return lang; }, get languages() { return languages; }, _setForTest(d, f, l) { dict = d; fallback = f || {}; lang = l || FALLBACK; rules = new Intl.PluralRules(lang); } };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.I18n = api;
})(typeof self !== "undefined" ? self : this);
