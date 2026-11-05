import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { layoutRows, totalHeight, rowAt } = createRequire(import.meta.url)("../public/layout.js");

const ratios = Array.from({ length: 500 }, (_, i) => [1.33, 0.75, 1.78, 1, 0.56, 3, 0.4][i % 7]);
const W = 900, T = 120, GAP = 10;

test("volle Zeilen füllen die Breite exakt", () => {
  const rows = layoutRows(ratios, W, T, GAP);
  for (const r of rows.filter((x) => x.full)) {
    const sum = ratios.slice(r.start, r.end).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum * r.h + GAP * (r.end - r.start - 1) - W) < 1e-6);
  }
});

test("jedes Element liegt in genau einer Zeile, ohne Lücken", () => {
  const rows = layoutRows(ratios, W, T, GAP);
  assert.equal(rows[0].start, 0);
  assert.equal(rows.at(-1).end, ratios.length);
  for (let i = 1; i < rows.length; i++) assert.equal(rows[i].start, rows[i - 1].end);
});

test("nur die letzte Zeile darf unvollständig sein, mit Zielhöhe", () => {
  const rows = layoutRows(ratios.slice(0, 40), W, T, GAP);
  assert.ok(rows.slice(0, -1).every((r) => r.full));
  const last = rows.at(-1);
  if (!last.full) assert.equal(last.h, T);
});

test("schrittweises Nachladen ergibt dasselbe Ergebnis wie ein Durchlauf", () => {
  const all = layoutRows(ratios, W, T, GAP);
  let rows = [];
  for (let n = 37; n < ratios.length + 37; n += 37) rows = layoutRows(ratios.slice(0, Math.min(n, ratios.length)), W, T, GAP, rows);
  assert.deepEqual(rows, all);
});

test("Zeilen folgen mit exakt einem Abstand aufeinander", () => {
  const rows = layoutRows(ratios, W, T, GAP);
  for (let i = 1; i < rows.length; i++) assert.ok(Math.abs(rows[i].top - (rows[i - 1].top + rows[i - 1].h + GAP)) < 1e-6);
  assert.ok(Math.abs(totalHeight(rows) - (rows.at(-1).top + rows.at(-1).h)) < 1e-9);
});

test("rowAt findet die sichtbare Zeile", () => {
  const rows = layoutRows(ratios, W, T, GAP);
  assert.equal(rowAt(rows, 0), 0);
  for (const i of [3, 17, rows.length - 1]) assert.equal(rowAt(rows, rows[i].top + 1), i);
  assert.equal(rowAt([], 10), -1);
});

test("leere Liste und einzelnes Element", () => {
  assert.deepEqual(layoutRows([], W, T, GAP), []);
  const one = layoutRows([1.5], W, T, GAP);
  assert.equal(one.length, 1); assert.equal(one[0].full, false);
});
