import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.join(import.meta.dirname, "..", "public");
const dir = path.join(root, "locales");
const I18n = require("../public/i18n.js");
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
const load = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
const en = load("en.json");
const PLURAL = ["zero", "one", "two", "few", "many", "other"];
const phs = (s) => new Set([...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]));
const base = (k) => k.replace(new RegExp(`\\.(${PLURAL.join("|")})$`), "");
const enBases = new Set(Object.keys(en).filter((k) => k.endsWith(".other")).map(base));
const allowedKey = (k) => k in en || (PLURAL.some((c) => k.endsWith("." + c)) && enBases.has(base(k)));
const allowedPlaceholders = (k) => new Set([...phs(en[k] ?? en[`${base(k)}.other`] ?? ""), ...phs(en[`${base(k)}.other`] ?? ""), ...phs(en[`${base(k)}.one`] ?? "")]);

test("every locale file has a valid name and a valid file name", () => {
  for (const f of files) {
    assert.match(f, /^[a-z]{2,3}(-[A-Za-z0-9]+)?\.json$/, `bad file name ${f}`);
    assert.ok(load(f)["_meta.name"], `${f}: "_meta.name" is required`);
  }
});

for (const f of files.filter((x) => x !== "en.json")) {
  test(`${f}: only known keys and placeholders`, () => {
    const loc = load(f);
    for (const [k, v] of Object.entries(loc)) {
      assert.ok(allowedKey(k), `${f}: unknown key "${k}" (keys must exist in en.json)`);
      assert.equal(typeof v, "string", `${f}: "${k}" must be a string`);
      if (k.startsWith("_meta.")) continue;
      const allowed = allowedPlaceholders(k);
      for (const p of phs(v)) assert.ok(allowed.has(p), `${f}: "${k}" uses {${p}} which the English text does not`);
    }
  });
  test(`${f}: missing translations (warning only, English is used as fallback)`, (t) => {
    const loc = load(f), missing = Object.keys(en).filter((k) => !(k in loc) && !(k.endsWith(".other") ? false : false));
    const real = missing.filter((k) => !PLURAL.some((c) => k.endsWith("." + c)) || !(`${base(k)}.other` in loc));
    if (real.length) t.diagnostic(`${f}: ${real.length} untranslated key(s): ${real.slice(0, 8).join(", ")}${real.length > 8 ? " …" : ""}`);
  });
}

test("German is complete (maintained translation)", () => {
  const de = load("de.json");
  assert.deepEqual(Object.keys(en).filter((k) => !(k in de)), []);
});

// ---- the code only uses keys that exist, and English has no stale keys ----
const used = new Set();
for (const f of ["app.js", "index.html"]) {
  const src = fs.readFileSync(path.join(root, f), "utf8");
  for (const m of src.matchAll(/\btr\("([\w.]+)"/g)) used.add(m[1]);
  for (const m of src.matchAll(/data-i18n(?:-[\w-]+)?="([\w.]+)"/g)) used.add(m[1]);
}
test("every key used in the code exists in en.json", () => {
  const missing = [...used].filter((k) => !(k in en) && !(`${k}.other` in en));
  assert.deepEqual(missing, []);
});
test("en.json has no unused keys", () => {
  const unused = Object.keys(en).filter((k) => !k.startsWith("_meta.") && !used.has(k) && !used.has(base(k)));
  assert.deepEqual(unused, []);
});
test("no German text is left in the source code strings", () => {
  const src = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const bad = src.split("\n").map((l, i) => [i + 1, l]).filter(([, l]) => !/^\s*\/\//.test(l) && /"[^"]*[äöüßÄÖÜ][^"]*"/.test(l.replace(/\/\/.*$/, "")));
  assert.deepEqual(bad, []);
});

// ---- the translation function ----
test("t(): placeholders, plural forms, fallback and missing keys", () => {
  I18n._setForTest({ "a": "Hello {name}", "n.one": "{count} cat", "n.other": "{count} cats", "only.de": "nur de" }, { "fb": "fallback", "n.other": "{count} things" }, "en");
  assert.equal(I18n.t("a", { name: "Ann" }), "Hello Ann");
  assert.equal(I18n.t("n", { count: 1 }), "1 cat");
  assert.equal(I18n.t("n", { count: 5 }), "5 cats");
  assert.equal(I18n.t("fb"), "fallback");
  assert.equal(I18n.t("does.not.exist"), "does.not.exist");
  assert.equal(I18n.t("a", {}), "Hello {name}");
});
test("t(): languages with more plural forms (Polish)", () => {
  I18n._setForTest({ "n.one": "{count} plik", "n.few": "{count} pliki", "n.many": "{count} plików", "n.other": "{count} pliku" }, {}, "pl");
  assert.equal(I18n.t("n", { count: 1 }), "1 plik");
  assert.equal(I18n.t("n", { count: 3 }), "3 pliki");
  assert.equal(I18n.t("n", { count: 5 }), "5 plików");
});
