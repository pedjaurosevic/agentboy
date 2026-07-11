// F2.3 E2E: the OSC 98 approval dialog and OSC 99 LED protocol, driven from a
// real shell PTY (not a synthetic DOM poke) so the xterm OSC parsers run for real.
const { test } = require("node:test");
const assert = require("node:assert/strict");
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
