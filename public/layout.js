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

  /**
   * Column grid: `cols` items per row. With several columns every row is one square cell high (the photo is cropped or
   * fitted into the cell when drawn); with one column the row has the photo's own aspect ratio at full width.
   * Same incremental behaviour as layoutRows: only an incomplete last row is recomputed.
   */
  function layoutColumns(ratios, W, cols, gap, rows) {
    rows = rows || [];
    let i = 0;
    if (rows.length) { const last = rows[rows.length - 1]; if (last.full) i = last.end; else { rows.pop(); i = last.start; } }
    const cell = cols === 1 ? W : (W - gap * (cols - 1)) / cols;
    let top = rows.length ? rows[rows.length - 1].top + rows[rows.length - 1].h + gap : 0;
    for (; i < ratios.length; i += cols) {
      const end = Math.min(i + cols, ratios.length), h = cols === 1 ? W / ratios[i] : cell;
      rows.push({ start: i, end, top, h, full: end - i === cols });
      top += h + gap;
    }
    return rows;
  }

  /** Items per row for a zoom step (0 = smallest photos ... 2 = largest): 5 / 3 / 1 on phones, scaled with the width on larger screens. */
  function columnsFor(W, zoom) {
    const c = W < 700 ? [5, 3, 1] : [Math.round(W / 110), Math.round(W / 190), Math.max(1, Math.round(W / 560))];
    c[1] = Math.min(c[1], c[0] - 1); c[2] = Math.max(1, Math.min(c[2], c[1] - 1));
    return c[Math.max(0, Math.min(2, zoom))];
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

  const api = { layoutRows, layoutColumns, columnsFor, totalHeight, rowAt };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.Layout = api;
})(typeof self !== "undefined" ? self : this);
