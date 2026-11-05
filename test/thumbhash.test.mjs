import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const TH = createRequire(import.meta.url)("../public/thumbhash.js");
const bytes = (b64) => Uint8Array.from(Buffer.from(b64, "base64"));

// Echte Hashes aus der Immich-Synchronisation (Fotos mit 1600×1200 und 4032×3024 laut Server).
const HASHES = ["HQgGHYRZRpWORptUi/uZqIeQcgUZ", "mI1or/DEQLbpYG9RDDQ0qBGNKCc="].filter(Boolean);

test("Seitenverhältnis wird aus dem Hash gelesen", () => {
  assert.ok(Math.abs(TH.aspectRatio(bytes(HASHES[0])) - 4 / 3) < 0.35);
});
test("Dekodierung liefert ein gültiges, nicht leeres Bild", () => {
  for (const h of HASHES) {
    const { w, h: ht, rgba } = TH.toRGBA(bytes(h));
    assert.ok(w > 0 && ht > 0 && w <= 32 && ht <= 32);
    assert.equal(rgba.length, w * ht * 4);
    assert.ok(rgba.every((v) => Number.isFinite(v) && v >= 0 && v <= 255));
    const lum = [...rgba].filter((_, i) => i % 4 === 0);
    assert.ok(Math.max(...lum) - Math.min(...lum) > 3 || lum.length === 1, "Bild ist nicht einfarbig");
    assert.ok(rgba.filter((_, i) => i % 4 === 3).every((a) => a === 255), "ohne Transparenz");
  }
});
test("Zufällige Hashes lassen den Dekoder nicht abstürzen", () => {
  for (let n = 0; n < 200; n++) {
    const h = Uint8Array.from({ length: 25 + (n % 5) }, () => Math.floor(Math.random() * 256));
    const { rgba } = TH.toRGBA(h);
    assert.ok(rgba.every((v) => v >= 0 && v <= 255));
  }
});
