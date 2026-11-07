import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { layoutRows, totalHeight, rowAt } = createRequire(import.meta.url)("../public/layout.js");

const ratios = Array.from({ length: 500 }, (_, i) => [1.33, 0.75, 1.78, 1, 0.56, 3, 0.4][i % 7]);
const W = 900, T = 120, GAP = 10;

test("full rows fill the width exactly", () => {
  const rows = layoutRows(ratios, W, T, GAP);
  for (const r of rows.filter((x) => x.full)) {
    const sum = ratios.slice(r.start, r.end).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum * r.h + GAP * (r.end - r.start - 1) - W) < 1e-6);
  }
});

test("every item is in exactly one row, without gaps", () => {
  const rows = layoutRows(ratios, W, T, GAP);
  assert.equal(rows[0].start, 0);
  assert.equal(rows.at(-1).end, ratios.length);
  for (let i = 1; i < rows.length; i++) assert.equal(rows[i].start, rows[i - 1].end);
});

test("only the last row may be incomplete, with the target height", () => {
  const rows = layoutRows(ratios.slice(0, 40), W, T, GAP);
  assert.ok(rows.slice(0, -1).every((r) => r.full));
  const last = rows.at(-1);
  if (!last.full) assert.equal(last.h, T);
});

test("incremental loading gives the same result as one pass", () => {
  const all = layoutRows(ratios, W, T, GAP);
  let rows = [];
  for (let n = 37; n < ratios.length + 37; n += 37) rows = layoutRows(ratios.slice(0, Math.min(n, ratios.length)), W, T, GAP, rows);
  assert.deepEqual(rows, all);
});

test("rows follow each other with exactly one gap", () => {
  const rows = layoutRows(ratios, W, T, GAP);
  for (let i = 1; i < rows.length; i++) assert.ok(Math.abs(rows[i].top - (rows[i - 1].top + rows[i - 1].h + GAP)) < 1e-6);
  assert.ok(Math.abs(totalHeight(rows) - (rows.at(-1).top + rows.at(-1).h)) < 1e-9);
});

test("rowAt finds the visible row", () => {
  const rows = layoutRows(ratios, W, T, GAP);
  assert.equal(rowAt(rows, 0), 0);
  for (const i of [3, 17, rows.length - 1]) assert.equal(rowAt(rows, rows[i].top + 1), i);
  assert.equal(rowAt([], 10), -1);
});

test("empty list and single item", () => {
  assert.deepEqual(layoutRows([], W, T, GAP), []);
  const one = layoutRows([1.5], W, T, GAP);
  assert.equal(one.length, 1); assert.equal(one[0].full, false);
});

const { layoutColumns, columnsFor } = createRequire(import.meta.url)("../public/layout.js");

test("columnsFor: 5 / 3 / 1 on phones, strictly fewer columns per zoom step everywhere", () => {
  assert.deepEqual([0, 1, 2].map((z) => columnsFor(390, z)), [5, 3, 1]);
  for (const w of [320, 699, 700, 1024, 1512, 2560]) {
    const c = [0, 1, 2].map((z) => columnsFor(w, z));
    assert.ok(c[0] > c[1] && c[1] > c[2] && c[2] >= 1, `${w}: ${c}`);
  }
});

test("layoutColumns: square cells with several columns, own aspect ratio with one", () => {
  const rs = Array.from({ length: 11 }, (_, i) => [1.5, 0.75, 1][i % 3]);
  const rows = layoutColumns(rs, 300, 3, 2, []);
  assert.equal(rows.length, 4);
  const cell = (300 - 4) / 3;
  assert.ok(rows.every((r) => Math.abs(r.h - cell) < 1e-9));
  assert.equal(rows[3].end - rows[3].start, 2); assert.equal(rows[3].full, false);
  assert.ok(Math.abs(rows[1].top - (cell + 2)) < 1e-9);
  const one = layoutColumns([2, 0.5], 400, 1, 4, []);
  assert.deepEqual(one.map((r) => r.h), [200, 800]);
});

test("layoutColumns: appending equals a full layout", () => {
  const rs = Array.from({ length: 53 }, (_, i) => [1.33, 0.75, 1.78][i % 3]);
  const all = layoutColumns(rs, 390, 5, 2, []);
  let rows = []; for (let n = 7; n < rs.length + 7; n += 7) rows = layoutColumns(rs.slice(0, Math.min(n, rs.length)), 390, 5, 2, rows);
  assert.deepEqual(rows, all);
});
