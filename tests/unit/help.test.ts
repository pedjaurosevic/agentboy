import { test } from "node:test";
import assert from "node:assert/strict";
import { isHelpRequested } from "../../src/main/help-args";
import { HELP_SECTIONS } from "../../src/renderer/help-content";

test("isHelpRequested: recognises the help forms", () => {
  assert.ok(isHelpRequested(["electron", ".", "/help"]));
  assert.ok(isHelpRequested(["agentboy", "help"]));
  assert.ok(isHelpRequested(["--help"]));
  assert.ok(isHelpRequested(["-h"]));
});

test("isHelpRequested: false for normal launches", () => {
  assert.ok(!isHelpRequested(["electron", "."]));
  assert.ok(!isHelpRequested(["agentboy", "3"]));
  assert.ok(!isHelpRequested(["agentboy", "ninja"]));
  assert.ok(!isHelpRequested([]));
  assert.ok(!isHelpRequested(["helper"])); // substring must not match
});

test("help content covers every chassis button F1–F12", () => {
  const keys = new Set(HELP_SECTIONS.flatMap((s) => s.items.map((i) => i.key)));
  for (let n = 1; n <= 12; n++) assert.ok(keys.has(`F${n}`), `missing F${n}`);
});

test("help content documents the agent escape sequences", () => {
  const keys = HELP_SECTIONS.flatMap((s) => s.items.map((i) => i.key));
  assert.ok(keys.includes("OSC 98"));
  assert.ok(keys.includes("OSC 99"));
});
