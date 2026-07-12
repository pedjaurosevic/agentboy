// F2.3 E2E: the OSC 98 approval dialog and OSC 99 LED protocol, driven from a
// real shell PTY (not a synthetic DOM poke) so the xterm OSC parsers run for real.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const {
  withApp,
  evalInPage,
  nativeClick,
  insertText,
  pressEnter,
  waitFor,
  sleep,
} = require("./harness");

const PORT = 9242;

// Type a shell command into the focused PTY and submit it.
async function runInShell(ws, command) {
  await evalInPage(
    ws,
    `document.querySelector('.xterm-helper-textarea').focus(), true`
  );
  await insertText(ws, command);
  await pressEnter(ws);
}

test("OSC 98 opens an approval dialog on the chassis; NO dismisses it", async () => {
  await withApp({ port: PORT }, async ({ ws }) => {
    await runInShell(ws, String.raw`printf '\033]98;prompt=Delete everything?\007'`);
    await sleep(1300);

    const info = await evalInPage(
      ws,
      `(() => {
         const d = document.querySelector('.gb-dialog');
         const scr = document.querySelector('.gb-screen');
         if (!d || d.hidden) return { shown: false };
         const dr = d.getBoundingClientRect();
         const sr = scr.getBoundingClientRect();
         return {
           shown: true,
           onChassis: d.parentElement.classList.contains('gb'),
           overhangsBelowScreen: dr.bottom > sr.bottom + 1,
           badge: document.querySelector('.gb-dialog-badge').textContent,
           origin: document.querySelector('.gb-dialog-origin').textContent,
         };
       })()`
    );

    assert.ok(info.shown, "OSC 98 did not open the dialog");
    assert.ok(info.onChassis, "dialog is not a child of the chassis (.gb)");
    assert.ok(
      info.overhangsBelowScreen,
      "dialog does not overhang the screen onto the plastic (anti-spoofing signature)"
    );
    assert.match(info.badge, /APPROVAL/, "missing approval badge");
    assert.match(info.origin, /repo|shell|git/, "origin line not populated");

    // Clicking NO resolves the dialog and hides it (writes 'n' to the PTY).
    await nativeClick(ws, ".gb-dialog-btn.no");
    await sleep(300);
    const stillShown = await evalInPage(
      ws,
      `(() => { const d = document.querySelector('.gb-dialog'); return !!d && !d.hidden; })()`
    );
    assert.equal(stillShown, false, "dialog stayed open after clicking NO");
  });
});

test("OSC 98 YES auto-checkpoints the pane's git repo (tracked changes only)", async () => {
  // Scratch git repo OUTSIDE the agentboy tree, so a YES checkpoint lands here
  // and never touches this repo. execFileSync (array argv) — no shell.
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "agentboy-ckpt-"));
  const git = (args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" });
  git(["init", "-q"]);
  git(["config", "user.email", "e2e@agentboy.test"]);
  git(["config", "user.name", "E2E"]);
  fs.writeFileSync(path.join(repo, "tracked.txt"), "one\n");
  // An untracked "secret" that must NOT be swept into the checkpoint (saveCheckpoint
  // stages tracked modifications only — this test is also that guard's E2E proof).
  fs.writeFileSync(path.join(repo, "secret.env"), "TOKEN=shhh\n");
  git(["add", "tracked.txt"]);
  git(["commit", "-q", "-m", "init"]);

  const countCheckpoints = () =>
    git(["log", "--grep=^LLM Checkpoint", "--pretty=%H"]).split("\n").filter(Boolean).length;
  assert.equal(countCheckpoints(), 0, "precondition: repo has no checkpoints yet");

  await withApp({ port: PORT + 2 }, async ({ ws }) => {
    // `cd && change && printf OSC` as ONE command: the && chain guarantees the
    // dialog only opens if cd into the scratch repo succeeded, so a YES can
    // never checkpoint the wrong (agentboy) repo.
    await runInShell(
      ws,
      String.raw`cd ${repo} && echo two >> tracked.txt && printf '\033]98;prompt=Write the file?\007'`
    );
    await sleep(1300);
    const shown = await evalInPage(
      ws,
      `(() => { const d = document.querySelector('.gb-dialog'); return !!d && !d.hidden; })()`
    );
    assert.ok(shown, "OSC 98 dialog did not open (cd into scratch repo may have failed)");

    // YES: auto-checkpoint the pane's repo, then answer 'y'.
    await nativeClick(ws, ".gb-dialog-btn.yes");
    await sleep(1600); // gitSave is async (reset -> add -u -> commit)
  });

  assert.equal(countCheckpoints(), 1, "YES did not create exactly one checkpoint commit");
  const body = git(["log", "-1", "--pretty=%B"]);
  assert.match(body, /^LLM Checkpoint/, "checkpoint has wrong subject");
  assert.match(body, /Agentboy-Checkpoint: [0-9a-f]{8}/, "checkpoint missing trailer");
  const files = git(["show", "--name-only", "--pretty=format:", "HEAD"])
    .split("\n")
    .filter(Boolean);
  assert.ok(files.includes("tracked.txt"), "tracked change was not captured in the checkpoint");
  assert.ok(
    !files.includes("secret.env"),
    "untracked secret leaked into the checkpoint (saveCheckpoint guard failed)"
  );

  fs.rmSync(repo, { recursive: true, force: true });
});

test("OSC 99 led=off drives the semafor to the off state", async () => {
  await withApp({ port: PORT + 1 }, async ({ ws }) => {
    const before = await evalInPage(
      ws,
      `document.querySelector('.gb-semafor').classList.contains('status-off')`
    );
    assert.equal(before, false, "semafor started already off (bad precondition)");

    // Emit the OSC then hold the shell busy (sleep) so no fresh prompt output
    // clobbers the LED — every PTY chunk re-drives the LED to "agent" (see the
    // onData handler in spawnPane), so the OSC only holds while the shell is quiet.
    await runInShell(ws, String.raw`printf '\033]99;led=off\007'; sleep 3`);
    const wentOff = await waitFor(
      ws,
      `document.querySelector('.gb-semafor').classList.contains('status-off')`,
      { timeoutMs: 2500 }
    );
    assert.ok(wentOff, "OSC 99 led=off did not drive the semafor to status-off");
  });
});
