import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const TH = createRequire(import.meta.url)("../public/thumbhash.js");
const bytes = (b64) => Uint8Array.from(Buffer.from(b64, "base64"));

// Real hashes from an Immich sync stream (photos of 1600×1200 and 4032×3024 according to the server).
const HASHES = ["HQgGHYRZRpWORptUi/uZqIeQcgUZ", "mI1or/DEQLbpYG9RDDQ0qBGNKCc="].filter(Boolean);

test("aspect ratio is read from the hash", () => {
  assert.ok(Math.abs(TH.aspectRatio(bytes(HASHES[0])) - 4 / 3) < 0.35);
});
test("decoding yields a valid, non-empty image", () => {
  for (const h of HASHES) {
    const { w, h: ht, rgba } = TH.toRGBA(bytes(h));
    assert.ok(w > 0 && ht > 0 && w <= 32 && ht <= 32);
    assert.equal(rgba.length, w * ht * 4);
    assert.ok(rgba.every((v) => Number.isFinite(v) && v >= 0 && v <= 255));
    const lum = [...rgba].filter((_, i) => i % 4 === 0);
    assert.ok(Math.max(...lum) - Math.min(...lum) > 3 || lum.length === 1, "image is not a single colour");
    assert.ok(rgba.filter((_, i) => i % 4 === 3).every((a) => a === 255), "without transparency");
  }
});
test("random hashes do not crash the decoder", () => {
  for (let n = 0; n < 200; n++) {
    const h = Uint8Array.from({ length: 25 + (n % 5) }, () => Math.floor(Math.random() * 256));
    const { rgba } = TH.toRGBA(h);
    assert.ok(rgba.every((v) => v >= 0 && v <= 255));
  }
});
