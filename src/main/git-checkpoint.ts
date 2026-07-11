// AgentBoy git-checkpoint core logic — pure functions over a cwd string, no
// Electron/IPC dependency, so they can run in a scratch git repo under
// node:test. Wired to IPC handlers in index.ts.

import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

// A commit only counts as an AgentBoy checkpoint if it carries BOTH the
// "LLM Checkpoint" subject AND an "Agentboy-Checkpoint: <id>" trailer. This is
// a convenience marker, NOT a security boundary: the trailer format is public,
// so anyone can craft a matching commit. It only guards against *accidentally*
// treating an unrelated commit named "LLM Checkpoint" as a checkpoint. The real
// safety gate on the destructive restore is the native confirmation dialog in
// the main process (see git:restoreTo in index.ts), which a compromised
// renderer cannot fabricate.
export const CHECKPOINT_SUBJECT = "LLM Checkpoint";
const CHECKPOINT_TRAILER = /^Agentboy-Checkpoint: [0-9a-f]{8}$/m;

export function isCheckpointCommit(cwd: string, sha: string): boolean {
  try {
    const body = execFileSync("git", ["log", "-1", "--pretty=%B", sha], {
      cwd,
      encoding: "utf8",
      timeout: 3000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const subject = (body.split("\n")[0] ?? "").trim();
    return subject === CHECKPOINT_SUBJECT && CHECKPOINT_TRAILER.test(body);
  } catch {
    return false;
  }
}

// Stash any uncommitted work before a destructive reset so a restore can
// never silently discard it — recoverable afterward via `git stash list`.
// Tri-state on purpose: "clean" (nothing to protect) and "failed" (dirty tree
// but the stash did NOT succeed) must be distinguishable, so the caller can
// REFUSE the reset when protection failed instead of silently destroying work.
export type StashResult = "clean" | "stashed" | "failed";
export function stashIfDirty(cwd: string): StashResult {
  let status: string;
  try {
    status = execFileSync("git", ["status", "--porcelain"], {
      cwd,
      encoding: "utf8",
      timeout: 3000,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    // Can't even read status — treat as unsafe, not clean.
    return "failed";
  }
  if (!status.trim()) return "clean";
  try {
    const label = `AgentBoy pre-restore autostash ${new Date().toISOString()}`;
    execFileSync("git", ["stash", "push", "-u", "-m", label], { cwd, timeout: 5000 });
    return "stashed";
  } catch {
    return "failed";
  }
}

// Hard-reset the pane's repo to a specific checkpoint. Guarded: the target
// sha must itself carry the checkpoint subject AND trailer (isCheckpointCommit),
// so this can never be aimed at an arbitrary revision or a same-named user
// commit, even if the renderer is compromised. This is the ONLY reset path —
// there used to be a second "undo last checkpoint" (HEAD~1) path with
// different semantics; it is gone, restore always means "go TO a checkpoint".
export function resetToCheckpoint(cwd: string, sha: string): { ok: boolean; stashed: boolean } {
  if (!isCheckpointCommit(cwd, sha)) return { ok: false, stashed: false };
  const stash = stashIfDirty(cwd);
  // Dirty tree we couldn't stash → REFUSE the reset. Better to do nothing than
  // to `reset --hard` over uncommitted work with no recovery point.
  if (stash === "failed") return { ok: false, stashed: false };
  const stashed = stash === "stashed";
  try {
    execFileSync("git", ["reset", "--hard", sha], { cwd, timeout: 5000 });
    return { ok: true, stashed };
  } catch {
    return { ok: false, stashed };
  }
}

export interface CheckpointSaveResult {
  ok: boolean;
  untrackedFiles: number;
}

// Create a checkpoint commit in cwd capturing ONLY already-tracked changes.
// A YES on a (possibly spoofed) OSC 98 prompt must never sweep a new file
// holding a secret into a commit — including a file the pane's shell already
// `git add`-ed. So we first unstage everything (reset the index to HEAD), then
// stage only tracked modifications (`git add -u`). Untracked and pre-staged
// new files are therefore never committed; the count of such "new" files is
// returned so the caller can surface it for transparency. This is also
// consistent with restore: `reset --hard` never deletes untracked files.
export function saveCheckpoint(cwd: string): CheckpointSaveResult {
  try {
    const status = execFileSync("git", ["status", "--porcelain"], {
      cwd,
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    // New files that will NOT enter the checkpoint: untracked ("??") and
    // staged-new (index status "A", e.g. "A " / "AM").
    const untrackedFiles = status
      .split("\n")
      .filter((l) => l.startsWith("??") || l[0] === "A").length;
    const trailer = randomBytes(4).toString("hex");
    // Unstage everything first so a pre-staged new file can't ride into the
    // commit. Best-effort: on an unborn HEAD there is nothing to reset.
    try {
      execFileSync("git", ["reset", "-q"], { cwd, timeout: 5000 });
    } catch {
      /* unborn HEAD / nothing staged — fine */
    }
    execFileSync("git", ["add", "-u"], { cwd, timeout: 10000 });
    execFileSync(
      "git",
      ["commit", "-m", CHECKPOINT_SUBJECT, "-m", `Agentboy-Checkpoint: ${trailer}`, "--allow-empty"],
      { cwd, timeout: 10000 }
    );
    return { ok: true, untrackedFiles };
  } catch {
    return { ok: false, untrackedFiles: 0 };
  }
}

export interface CheckpointEntry {
  sha: string;
  when: string;
  subject: string;
}

// List this repo's AgentBoy checkpoints (newest first). Each entry must pass
// isCheckpointCommit (subject AND trailer) — restoreToCheckpoint re-checks
// before resetting regardless.
export function listCheckpoints(cwd: string): CheckpointEntry[] {
  try {
    // --grep matches against the WHOLE commit message, not just the subject
    // line — with the trailer now making messages multi-line, an anchored
    // `^...$` pattern would never match. Anchor only the start; the .filter()
    // below (and isCheckpointCommit, again in resetToCheckpoint) enforces the
    // exact subject/trailer match, so a looser pre-filter here is safe.
    //
    // No `-- <pathspec>` here: checkpoints are taken with --allow-empty
    // (checkpoint happens BEFORE the agent's approved action runs, so the
    // tree is often still clean at that point) — a `-- .` pathspec silently
    // excludes empty commits from `git log`, which made checkpoints vanish
    // from this list in exactly the common case. Found by the unit tests
    // below, not by inspection.
    const out = execFileSync(
      "git",
      ["log", "-n", "50", `--grep=^${CHECKPOINT_SUBJECT}`, "--pretty=%H%x1f%cr%x1f%s"],
      { cwd, encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "ignore"] }
    );
    return out
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [sha, when, subject] = line.split("\x1f");
        return { sha, when, subject };
      })
      .filter((c) => c.subject === CHECKPOINT_SUBJECT && isCheckpointCommit(cwd, c.sha));
  } catch {
    return [];
  }
}
