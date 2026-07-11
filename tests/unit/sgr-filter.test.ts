import { test } from "node:test";
import assert from "node:assert/strict";
import { makeSgrDimFilter } from "../../src/renderer/sgr-filter";

const ESC = "\x1b";

test("inactive: stream passes through untouched", () => {
  const f = makeSgrDimFilter();
  const s = `a${ESC}[2mdim${ESC}[0mb`;
  assert.equal(f(s, false), s);
});

test("active: lone dim attribute is stripped, sequence dropped entirely", () => {
  const f = makeSgrDimFilter();
  assert.equal(f(`a${ESC}[2mb`, true), "ab");
});

test("active: dim removed from combined params, others kept", () => {
  const f = makeSgrDimFilter();
  assert.equal(f(`${ESC}[1;2;31mX`, true), `${ESC}[1;31mX`);
  assert.equal(f(`${ESC}[4;2mY`, true), `${ESC}[4mY`);
});

test('active: "2" as truecolor subparam of 38/48/58 is preserved', () => {
  const f = makeSgrDimFilter();
  const truecolor = `${ESC}[38;2;10;20;30mX`;
  assert.equal(f(truecolor, true), truecolor);
  const bg = `${ESC}[48;2;1;2;3mX`;
  assert.equal(f(bg, true), bg);
  // dim + truecolor together: dim goes, color stays
  assert.equal(f(`${ESC}[2;38;2;10;20;30mX`, true), `${ESC}[38;2;10;20;30mX`);
});

test('active: "2" as 256-color index of 38;5 is preserved', () => {
  const f = makeSgrDimFilter();
  const c256 = `${ESC}[38;5;2mX`;
  assert.equal(f(c256, true), c256);
});

test("active: escape split across chunks is held back and rejoined", () => {
  const f = makeSgrDimFilter();
  assert.equal(f(`abc${ESC}[`, true), "abc"); // incomplete CSI held
  assert.equal(f("2mdef", true), "def"); // rejoined, dim stripped
});

test("active: bare ESC at chunk end is held back too", () => {
  const f = makeSgrDimFilter();
  assert.equal(f(`x${ESC}`, true), "x");
  assert.equal(f("[2my", true), "y");
});

test("non-SGR sequences and plain text are untouched", () => {
  const f = makeSgrDimFilter();
  const s = `${ESC}[2J${ESC}[H hello ${ESC}[31mred${ESC}[0m`;
  assert.equal(f(s, true), s);
});
