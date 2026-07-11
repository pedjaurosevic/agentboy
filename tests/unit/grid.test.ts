import { test } from "node:test";
import assert from "node:assert/strict";
import { containsPoint, distanceToRect, nearestColumn, rowFor, gridRectFor } from "../../src/renderer/grid";

const WORK = { x: 0, y: 30, w: 1200, h: 770 }; // toolbar eats the top 30px
const FULL = { x: 0, y: 0, w: 1200, h: 800 };

test("containsPoint: inside / edge / outside", () => {
  assert.ok(containsPoint(WORK, 600, 400));
  assert.ok(containsPoint(WORK, 0, 30)); // top-left corner is inside
  assert.ok(!containsPoint(WORK, 1200, 400)); // right edge is exclusive
  assert.ok(!containsPoint(WORK, 600, 10)); // above the work area
});

test("distanceToRect: zero inside, squared distance outside", () => {
  assert.equal(distanceToRect(WORK, 600, 400), 0);
  assert.equal(distanceToRect(WORK, -3, 400), 9);
  assert.equal(distanceToRect(WORK, -3, 26), 9 + 16);
});

test("nearestColumn picks the closest third", () => {
  assert.equal(nearestColumn(WORK, 100), 0);
  assert.equal(nearestColumn(WORK, 600), 1);
  assert.equal(nearestColumn(WORK, 1100), 2);
});

test("rowFor splits at the vertical middle of the work area", () => {
  assert.equal(rowFor(WORK, 100), 0);
  assert.equal(rowFor(WORK, 700), 1);
});

test("3×2 grid: six cells tile the work area exactly", () => {
  const cells = [];
  for (const row of [0, 1]) for (const col of [0, 1, 2]) cells.push(gridRectFor(WORK, col, row, false));
  // widths of a row sum to the full width, heights of a column to full height
  const rowWidth = cells[0].w + cells[1].w + cells[2].w;
  assert.equal(rowWidth, WORK.w);
  assert.equal(cells[0].h + cells[3].h, WORK.h);
  // third column absorbs the non-divisible remainder up to the right edge
  const c2 = gridRectFor(WORK, 2, 0, false);
  assert.equal(c2.x + c2.w, WORK.x + WORK.w);
});

test("non-divisible width: right column still ends at the work edge", () => {
  const oddWork = { x: 7, y: 0, w: 1000, h: 600 };
  const c2 = gridRectFor(oddWork, 2, 1, false);
  assert.equal(c2.x + c2.w, oddWork.x + oddWork.w);
  assert.equal(c2.y + c2.h, oddWork.y + oddWork.h); // bottom row ends at bottom
});

test("tall column: full work height, toolbar untouched", () => {
  const tall = gridRectFor(WORK, 1, 0, true);
  assert.deepEqual(tall, { x: 400, y: 30, w: 400, h: 770 });
});

test("coverToolbar: expands to the display's FULL bounds vertically", () => {
  const exp = gridRectFor(WORK, 1, 0, true, true, FULL);
  assert.equal(exp.y, FULL.y);
  assert.equal(exp.h, FULL.h);
  assert.equal(exp.x, 400); // horizontal snap unchanged
});

test("coverToolbar without fullHeight is ignored (small cells never cover)", () => {
  const small = gridRectFor(WORK, 0, 0, false, true, FULL);
  assert.equal(small.y, WORK.y);
  assert.equal(small.h, Math.floor(WORK.h / 2));
});
