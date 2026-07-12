import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeChoicePrompt } from "../../src/renderer/led-heuristics";

// NOTE: lines are most-recent-FIRST (as collected walking the buffer bottom-up).

test("y/n question on the last row → waiting", () => {
  assert.ok(looksLikeChoicePrompt(["Do you want to continue? (y/n)"]));
  assert.ok(looksLikeChoicePrompt(["Overwrite? [Y/n]", "some earlier output"]));
});

test("aider-style lettered prompt → waiting", () => {
  assert.ok(looksLikeChoicePrompt(["Add file to the chat? (Y)es/(N)o/(A)ll [Yes]:"]));
  assert.ok(looksLikeChoicePrompt(["Commit changes? (Y)es/(N)o"]));
});

test("a y/n token mid-sentence is not a prompt → not waiting", () => {
  assert.ok(!looksLikeChoicePrompt(["The flag accepts (y/n) to toggle the feature."]));
});

test("numbered menu with the selector on the last row → waiting", () => {
  assert.ok(
    looksLikeChoicePrompt([
      "❯ 2. No, cancel",
      "1. Yes, run the command",
      "Choose an option:",
    ])
  );
});

test("numbered menu with a hint line at the bottom → waiting", () => {
  assert.ok(
    looksLikeChoicePrompt([
      "Enter to select, Esc to cancel",
      "2. No",
      "1. Yes",
    ])
  );
});

test("boxed menu (frame char on the last row) → waiting", () => {
  assert.ok(
    looksLikeChoicePrompt([
      "╰──────────────╯",
      "│ 2. Reject    │",
      "│ 1. Accept    │",
      "╭──────────────╮",
    ])
  );
});

test("agent printed something AFTER the menu → not waiting", () => {
  assert.ok(
    !looksLikeChoicePrompt([
      "Done, running option 1.",
      "❯ 2. No",
      "1. Yes",
    ])
  );
});

test("a single numbered line is not a menu", () => {
  assert.ok(!looksLikeChoicePrompt(["1. First step: install deps"]));
});

test("plain output → not waiting", () => {
  assert.ok(!looksLikeChoicePrompt(["$ ls", "file.txt  dir/"]));
  assert.ok(!looksLikeChoicePrompt([]));
});
