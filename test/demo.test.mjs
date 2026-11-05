import test from "node:test";
import assert from "node:assert/strict";
import { assets, months, ALBUMS, byId, columnar, CITIES } from "../demo/data.mjs";
import { picture, avatar, THEMES } from "../demo/art.mjs";

test("demo library is consistent", () => {
  assert.ok(assets.length > 5000);
  assert.equal(new Set(assets.map((a) => a.id)).size, assets.length);
  assert.equal(months.reduce((n, m) => n + m.count, 0), assets.length);
  assert.ok(ALBUMS.length >= 5 && ALBUMS.every((a) => a.assets.length > 0));
  assert.ok(assets.every((a) => byId.get(a.id) === a));
});
test("columnar bucket has equally long columns", () => {
  const c = columnar(assets.slice(0, 20));
  for (const [k, v] of Object.entries(c)) assert.equal(v.length, 20, k);
});
test("dummy pictures are valid SVG and deterministic", () => {
  for (const t of THEMES) {
    const s = picture("x", t, 1.5);
    assert.match(s, /^<svg [^>]*viewBox="0 0 600 400"/);
    assert.equal(s, picture("x", t, 1.5));
  }
  assert.match(avatar("p1"), /^<svg /);
  assert.ok(CITIES.length > 5);
});
