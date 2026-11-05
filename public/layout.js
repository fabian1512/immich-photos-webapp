"use strict";
// Pure layout maths for the photo grid (no DOM, therefore unit-testable).
// A row: { start, end, top, h, full } – start..end-1 are indices into `ratios`.
(function (root) {
  /**
   * Computes rows for aspect ratios (width/height).
   * Finished rows stay untouched; only an incomplete last row is recomputed.
   * @param {number[]} ratios  aspect ratios of all items
   * @param {number} W         width of the grid in px
   * @param {number} T         target row height in px
   * @param {number} gap       spacing in px
   * @param {Array} rows       existing rows (extended and returned)
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

  /** Index of the first row that is still visible at y (row end >= y). */
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
