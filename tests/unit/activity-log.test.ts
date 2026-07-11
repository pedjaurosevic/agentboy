import { test } from "node:test";
import assert from "node:assert/strict";
import { pushActivity, formatActivity, formatClock, MAX_ACTIVITY } from "../../src/renderer/activity-log";
import type { ActivityEvent } from "../../src/renderer/activity-log";

test("pushActivity appends and stamps a time", () => {
  const log: ActivityEvent[] = [];
  pushActivity(log, { kind: "approval", text: "Run?", approved: true, where: "~/app" });
  assert.equal(log.length, 1);
  assert.equal(log[0].kind, "approval");
  assert.ok(typeof log[0].at === "number");
});

test("pushActivity caps the log at MAX_ACTIVITY, dropping oldest", () => {
  const log: ActivityEvent[] = [];
  for (let i = 0; i < MAX_ACTIVITY + 25; i++)
    pushActivity(log, { kind: "checkpoint", text: `c${i}` });
  assert.equal(log.length, MAX_ACTIVITY);
  assert.equal(log[0].text, "c25"); // first 25 dropped
  assert.equal(log[log.length - 1].text, `c${MAX_ACTIVITY + 24}`);
});

test("formatClock is zero-padded HH:MM:SS", () => {
  const at = new Date(2026, 0, 1, 4, 3, 9).getTime();
  assert.equal(formatClock(at), "04:03:09");
});

test("formatActivity: approvals show APPROVED/DENIED + where", () => {
  const at = new Date(2026, 0, 1, 14, 3, 12).getTime();
  const yes = formatActivity({ kind: "approval", at, text: "Run migration?", approved: true, where: "~/app" });
  assert.match(yes, /✓ APPROVED/);
  assert.match(yes, /Run migration\?/);
  assert.match(yes, /\(~\/app\)/);
  const no = formatActivity({ kind: "approval", at, text: "Delete?", approved: false });
  assert.match(no, /✗ DENIED/);
  assert.doesNotMatch(no, /\(/); // no where → no parens
});

test("formatActivity: checkpoint and restore have their own tags", () => {
  const at = Date.now();
  assert.match(formatActivity({ kind: "checkpoint", at, text: "auto" }), /CHECKPOINT/);
  assert.match(formatActivity({ kind: "restore", at, text: "to abc123" }), /RESTORE/);
});
