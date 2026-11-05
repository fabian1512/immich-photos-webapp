"use strict";
// Reine Layout-Rechnung für das Raster (ohne DOM, deshalb testbar).
// Eine Zeile: { start, end, top, h, full } – start..end-1 sind Indizes in `ratios`.
(function (root) {
  /**
   * Berechnet Zeilen für Seitenverhältnisse (Breite/Höhe).
   * Fertige Zeilen bleiben unverändert; nur eine unvollständige letzte Zeile wird neu berechnet.
   * @param {number[]} ratios  Seitenverhältnisse aller Elemente
   * @param {number} W         Breite des Rasters in px
   * @param {number} T         Zielhöhe einer Zeile in px
   * @param {number} gap       Abstand in px
   * @param {Array} rows       bisherige Zeilen (wird ergänzt und zurückgegeben)
   */
  function layoutRows(ratios, W, T, gap, rows) {
    rows = rows || [];
    let i = 0;
    if (rows.length) {
      const last = rows[rows.length - 1];
      if (last.full) i = last.end; else { rows.pop(); i = last.start; }
    }
    let top = rows.length ? rows[rows.length - 1].top + rows[rows.length - 1].h + gap : 0;
    let start = i, sum = 0;
    for (; i < ratios.length; i++) {
      sum += ratios[i];
      const n = i - start + 1;
      if (sum * T + gap * (n - 1) >= W) {
        const h = (W - gap * (n - 1)) / sum;
        rows.push({ start, end: i + 1, top, h, full: true });
        top += h + gap; start = i + 1; sum = 0;
      }
    }
    if (start < ratios.length) rows.push({ start, end: ratios.length, top, h: T, full: false });
    return rows;
  }

  const totalHeight = (rows) => (rows.length ? rows[rows.length - 1].top + rows[rows.length - 1].h : 0);

  /** Index der ersten Zeile, die bei y noch sichtbar ist (Zeilenende >= y). */
  function rowAt(rows, y) {
    let lo = 0, hi = rows.length - 1;
    if (hi < 0) return -1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (rows[mid].top + rows[mid].h < y) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  const api = { layoutRows, totalHeight, rowAt };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Layout = api;
})(typeof self !== "undefined" ? self : this);
