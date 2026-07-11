import { test } from "node:test";
import assert from "node:assert/strict";
import { formatApprovalOrigin } from "../../src/renderer/approval-origin";

test("git repo: names the cwd and the repo a YES will commit", () => {
  const s = formatApprovalOrigin({ cwd: "~/agentboy/src", gitRoot: "~/agentboy" });
  assert.match(s, /~\/agentboy\/src/);
  assert.match(s, /checkpoints the git repo at ~\/agentboy/);
});

test("non-git cwd: says no checkpoint will happen", () => {
  const s = formatApprovalOrigin({ cwd: "~/tmp", gitRoot: null });
  assert.match(s, /~\/tmp/);
  assert.match(s, /not a git repo/);
  assert.doesNotMatch(s, /checkpoints/);
});

test("unknown shell: warns there is no origin and no checkpoint", () => {
  const s = formatApprovalOrigin({ cwd: null, gitRoot: null });
  assert.match(s, /unknown shell/);
  assert.doesNotMatch(s, /checkpoints/);
});
