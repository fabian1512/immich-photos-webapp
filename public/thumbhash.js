"use strict";
// Dekodiert ThumbHash (https://evanw.github.io/thumbhash/, Evan Wallace, MIT-Lizenz) in ein kleines RGBA-Bild.
// Immich liefert pro Foto einen solchen Hash; daraus entsteht die unscharfe Vorschau vor dem eigentlichen Bild.
(function (root) {
  function aspectRatio(hash) {
    const header = hash[3], hasAlpha = hash[2] & 0x80, isLandscape = hash[4] & 0x80;
    const lx = isLandscape ? (hasAlpha ? 5 : 7) : header & 7;
    const ly = isLandscape ? header & 7 : hasAlpha ? 5 : 7;
    return lx / ly;
  }
  function toRGBA(hash) {
    const { PI, min, max, cos, round } = Math;
    const header24 = hash[0] | (hash[1] << 8) | (hash[2] << 16);
    const header16 = hash[3] | (hash[4] << 8);
    const l_dc = (header24 & 63) / 63, p_dc = ((header24 >> 6) & 63) / 31.5 - 1, q_dc = ((header24 >> 12) & 63) / 31.5 - 1;
    const l_scale = ((header24 >> 18) & 31) / 31, hasAlpha = header24 >> 23;
    const p_scale = ((header16 >> 3) & 63) / 63, q_scale = ((header16 >> 9) & 63) / 63;
    const isLandscape = header16 >> 15;
    const lx = max(3, isLandscape ? (hasAlpha ? 5 : 7) : header16 & 7);
    const ly = max(3, isLandscape ? header16 & 7 : hasAlpha ? 5 : 7);
    const a_dc = hasAlpha ? (hash[5] & 15) / 15 : 1, a_scale = (hash[5] >> 4) / 15;
    const ac_start = hasAlpha ? 6 : 5;
    let ac_index = 0;
    const decodeChannel = (nx, ny, scale) => {
      const ac = [];
      for (let cy = 0; cy < ny; cy++)
        for (let cx = cy ? 0 : 1; cx * ny < nx * (ny - cy); cx++)
          ac.push(((((hash[ac_start + (ac_index >> 1)] >> ((ac_index++ & 1) << 2)) & 15) / 7.5) - 1) * scale);
      return ac;
    };
    const l_ac = decodeChannel(lx, ly, l_scale), p_ac = decodeChannel(3, 3, p_scale * 1.25), q_ac = decodeChannel(3, 3, q_scale * 1.25);
    const a_ac = hasAlpha ? decodeChannel(5, 5, a_scale) : null;
    const ratio = aspectRatio(hash);
    const w = round(ratio > 1 ? 32 : 32 * ratio), h = round(ratio > 1 ? 32 / ratio : 32);
    const rgba = new Uint8ClampedArray(w * h * 4), fx = [], fy = [];
    for (let y = 0, i = 0; y < h; y++) {
      for (let x = 0; x < w; x++, i += 4) {
        let l = l_dc, p = p_dc, q = q_dc, a = a_dc;
        for (let cx = 0, n = max(lx, hasAlpha ? 5 : 3); cx < n; cx++) fx[cx] = cos((PI / w) * (x + 0.5) * cx);
        for (let cy = 0, n = max(ly, hasAlpha ? 5 : 3); cy < n; cy++) fy[cy] = cos((PI / h) * (y + 0.5) * cy);
        for (let cy = 0, j = 0; cy < ly; cy++)
          for (let cx = cy ? 0 : 1, fy2 = fy[cy] * 2; cx * ly < lx * (ly - cy); cx++, j++) l += l_ac[j] * fx[cx] * fy2;
        for (let cy = 0, j = 0; cy < 3; cy++)
          for (let cx = cy ? 0 : 1, fy2 = fy[cy] * 2; cx < 3 - cy; cx++, j++) { const f = fx[cx] * fy2; p += p_ac[j] * f; q += q_ac[j] * f; }
        if (a_ac) for (let cy = 0, j = 0; cy < 5; cy++)
          for (let cx = cy ? 0 : 1, fy2 = fy[cy] * 2; cx < 5 - cy; cx++, j++) a += a_ac[j] * fx[cx] * fy2;
        const b = l - (2 / 3) * p, r = (3 * l - b + q) / 2, g = r - q;
        rgba[i] = max(0, 255 * min(1, r)); rgba[i + 1] = max(0, 255 * min(1, g));
        rgba[i + 2] = max(0, 255 * min(1, b)); rgba[i + 3] = max(0, 255 * min(1, a));
      }
    }
    return { w, h, rgba };
  }
  const urlCache = new Map();
  /** base64-Hash (wie von Immich) → data:-URL eines winzigen PNG, oder null. Nur im Browser. */
  function toDataURL(b64) {
    if (!b64) return null;
    if (urlCache.has(b64)) return urlCache.get(b64);
    let url = null;
    try {
      const bin = atob(b64), hash = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) hash[i] = bin.charCodeAt(i);
      if (hash.length >= 5) {
        const { w, h, rgba } = toRGBA(hash), c = document.createElement("canvas");
        c.width = w; c.height = h; c.getContext("2d").putImageData(new ImageData(rgba, w, h), 0, 0);
        url = c.toDataURL();
      }
    } catch { /* ungültiger Hash: dann eben ohne Vorschau */ }
    if (urlCache.size > 5000) urlCache.clear();
    urlCache.set(b64, url);
    return url;
  }
  const api = { toRGBA, aspectRatio, toDataURL };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.ThumbHash = api;
})(typeof self !== "undefined" ? self : this);
