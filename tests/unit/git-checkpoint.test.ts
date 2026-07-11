import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  isCheckpointCommit,
  listCheckpoints,
  resetToCheckpoint,
  saveCheckpoint,
  stashIfDirty,
} from "../../src/main/git-checkpoint";

function scratchRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "agentboy-checkpoint-test-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@agentboy.local"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "AgentBoy Test"], { cwd: dir });
  writeFileSync(join(dir, "seed.txt"), "seed\n");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-q", "-m", "seed"], { cwd: dir });
  return dir;
}

const headSha = (cwd: string) =>
  execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();

test("saveCheckpoint commits with subject + trailer, and isCheckpointCommit accepts it", () => {
  const dir = scratchRepo();
  const res = saveCheckpoint(dir);
  assert.equal(res.ok, true);
  assert.equal(res.untrackedFiles, 0);
  assert.equal(isCheckpointCommit(dir, headSha(dir)), true);
});

test("saveCheckpoint counts untracked files without committing them (git add -u, not add .)", () => {
  const dir = scratchRepo();
  writeFileSync(join(dir, "secret.env"), "API_KEY=leak");
  writeFileSync(join(dir, "new-b.txt"), "b");
  const res = saveCheckpoint(dir);
  assert.equal(res.ok, true);
  assert.equal(res.untrackedFiles, 2);
  // The untracked files must NOT be tracked after the checkpoint — a stray YES
  // on a spoofed OSC 98 prompt must never sweep a new secret file into history.
  const tracked = execFileSync("git", ["ls-files"], { cwd: dir, encoding: "utf8" });
  assert.doesNotMatch(tracked, /secret\.env/);
  assert.doesNotMatch(tracked, /new-b\.txt/);
  // They are still present, just untracked (left alone, not deleted).
  assert.equal(existsSync(join(dir, "secret.env")), true);
});

test("saveCheckpoint DOES commit modifications to already-tracked files", () => {
  const dir = scratchRepo();
  writeFileSync(join(dir, "seed.txt"), "edited by the agent\n");
  const res = saveCheckpoint(dir);
  assert.equal(res.ok, true);
  // The tracked change is captured in the checkpoint commit, so restoring to
  // an earlier checkpoint can undo it.
  const committed = execFileSync("git", ["show", "HEAD:seed.txt"], { cwd: dir, encoding: "utf8" });
  assert.equal(committed, "edited by the agent\n");
});

test("a user commit literally titled 'LLM Checkpoint' is NOT treated as a checkpoint (no trailer)", () => {
  const dir = scratchRepo();
  writeFileSync(join(dir, "x.txt"), "x");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-q", "-m", "LLM Checkpoint"], { cwd: dir });
  assert.equal(isCheckpointCommit(dir, headSha(dir)), false);
  assert.equal(listCheckpoints(dir).length, 0);
});

test("listCheckpoints returns only real checkpoints, newest first", () => {
  const dir = scratchRepo();
  saveCheckpoint(dir);
  const first = headSha(dir);
  writeFileSync(join(dir, "mid.txt"), "mid");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-q", "-m", "unrelated work"], { cwd: dir });
  saveCheckpoint(dir);
  const second = headSha(dir);
  const list = listCheckpoints(dir);
  assert.equal(list.length, 2);
  assert.equal(list[0].sha, second);
  assert.equal(list[1].sha, first);
});

test("stashIfDirty stashes uncommitted changes and reports 'stashed'", () => {
  const dir = scratchRepo();
  writeFileSync(join(dir, "seed.txt"), "dirty\n");
  const result = stashIfDirty(dir);
  assert.equal(result, "stashed");
  const status = execFileSync("git", ["status", "--porcelain"], { cwd: dir, encoding: "utf8" });
  assert.equal(status.trim(), "");
  const stashList = execFileSync("git", ["stash", "list"], { cwd: dir, encoding: "utf8" });
  assert.match(stashList, /AgentBoy pre-restore autostash/);
});

test("stashIfDirty reports 'clean' on a clean tree (distinct from failure)", () => {
  const dir = scratchRepo();
  assert.equal(stashIfDirty(dir), "clean");
});

test("saveCheckpoint does NOT commit a pre-staged new file (index reset before add -u)", () => {
  const dir = scratchRepo();
  writeFileSync(join(dir, "secret.env"), "API_KEY=leak");
  execFileSync("git", ["add", "secret.env"], { cwd: dir }); // attacker/agent pre-stages it
  const res = saveCheckpoint(dir);
  assert.equal(res.ok, true);
  assert.equal(res.untrackedFiles, 1); // surfaced as a "new file" not going in
  const tracked = execFileSync("git", ["ls-files"], { cwd: dir, encoding: "utf8" });
  assert.doesNotMatch(tracked, /secret\.env/); // never entered history
  assert.equal(existsSync(join(dir, "secret.env")), true); // left on disk, just not committed
});

test("resetToCheckpoint refuses a sha that is not a real checkpoint", () => {
  const dir = scratchRepo();
  const res = resetToCheckpoint(dir, headSha(dir)); // seed commit, not a checkpoint
  assert.equal(res.ok, false);
  assert.equal(res.stashed, false);
});

test("resetToCheckpoint stashes dirty work before resetting to a real checkpoint", () => {
  const dir = scratchRepo();
  saveCheckpoint(dir);
  const cpSha = headSha(dir);
  writeFileSync(join(dir, "seed.txt"), "changed after checkpoint\n");
  writeFileSync(join(dir, "untracked-after.txt"), "new\n");
  const res = resetToCheckpoint(dir, cpSha);
  assert.equal(res.ok, true);
  assert.equal(res.stashed, true);
  assert.equal(headSha(dir), cpSha);
  // The untracked file survives only inside the stash, not in the working tree.
  assert.equal(existsSync(join(dir, "untracked-after.txt")), false);
  const stashList = execFileSync("git", ["stash", "list"], { cwd: dir, encoding: "utf8" });
  assert.match(stashList, /AgentBoy pre-restore autostash/);
});

test("resetToCheckpoint on a clean tree resets without stashing", () => {
  const dir = scratchRepo();
  saveCheckpoint(dir);
  const cpSha = headSha(dir);
  writeFileSync(join(dir, "later.txt"), "later");
  execFileSync("git", ["add", "."], { cwd: dir });
  execFileSync("git", ["commit", "-q", "-m", "later work"], { cwd: dir });
  const res = resetToCheckpoint(dir, cpSha);
  assert.equal(res.ok, true);
  assert.equal(res.stashed, false);
  assert.equal(headSha(dir), cpSha);
});

test("resetToCheckpoint rejects an invalid sha shape safely", () => {
  const dir = scratchRepo();
  const res = resetToCheckpoint(dir, "not-a-sha");
  assert.equal(res.ok, false);
});
