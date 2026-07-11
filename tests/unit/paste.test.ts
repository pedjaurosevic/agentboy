import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizePasteText } from "../../src/renderer/paste";

test("CRLF and lone CR normalise to LF", () => {
  assert.equal(sanitizePasteText("a\r\nb\rc\n"), "a\nb\nc\n");
});

test("non-breaking spaces become regular spaces", () => {
  assert.equal(sanitizePasteText("if (x) {"), "if (x) {");
});

test("zero-width characters are removed", () => {
  assert.equal(sanitizePasteText("a​b‌c‍d﻿e"), "abcde");
});

test("indentation and newlines survive untouched", () => {
  const code = "def f():\n    return [\n        1,\n    ]\n";
  assert.equal(sanitizePasteText(code), code);
});

test("tabs survive untouched", () => {
  assert.equal(sanitizePasteText("a\tb\tc"), "a\tb\tc");
});

test("bare ESC and other C0 controls are stripped", () => {
  assert.equal(sanitizePasteText("a\x1bb"), "ab");
  assert.equal(sanitizePasteText("x\x07\x08y"), "xy");
});

test("a bracketed-paste terminator is stripped (paste-injection guard)", () => {
  assert.equal(sanitizePasteText("evil\x1b[201~rm -rf"), "evil[201~rm -rf");
});

test("C1 controls and DEL are stripped", () => {
  assert.equal(sanitizePasteText("a\x7fb\x9bc"), "abc");
});
