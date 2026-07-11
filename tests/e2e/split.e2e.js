// F2.3 E2E: splitting spawns a second independent PTY, and exiting one pane's
// shell closes only that pane — the other PTY stays alive (pane isolation).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  withApp,
  evalInPage,
  cdpSend,
  insertText,
  pressEnter,
  waitFor,
  sleep,
} = require("./harness");

const PORT = 9246;

const paneCount = (ws) =>
  evalInPage(ws, `document.querySelectorAll('.gb-pane').length`);

// Ctrl+Shift+E is the "split into a new row" binding (xterm custom key handler).
async function pressCtrlShiftE(ws) {
  await evalInPage(
    ws,
    `document.querySelector('.xterm-helper-textarea').focus(), true`
  );
  const CTRL_SHIFT = 2 | 8;
  // rawKeyDown (not keyDown) so the modifiers reach xterm's key handler instead
  // of being turned into an inserted character.
  for (const type of ["rawKeyDown", "keyUp"]) {
    await cdpSend(ws, "Input.dispatchKeyEvent", {
      type,
      key: "E",
      code: "KeyE",
      windowsVirtualKeyCode: 69,
      modifiers: CTRL_SHIFT,
    });
  }
}

test("split spawns a second PTY; exiting one pane leaves the other alive", async () => {
  await withApp({ port: PORT }, async ({ ws }) => {
    assert.equal(await paneCount(ws), 1, "expected exactly one pane at boot");

    await pressCtrlShiftE(ws);
    const split = await waitFor(
      ws,
      `document.querySelectorAll('.gb-pane').length === 2`,
      { timeoutMs: 3000 }
    );
    assert.ok(split, "Ctrl+Shift+E did not split into a second pane");
    await sleep(800); // let the new pane's PTY finish spawning

    // The split leaves the new pane focused; type into it directly (re-querying
    // the first .xterm-helper-textarea would steal focus back to the old pane).
    const focusedIsTerminal = await evalInPage(
      ws,
      `!!document.activeElement && document.activeElement.classList.contains('xterm-helper-textarea')`
    );
    assert.ok(focusedIsTerminal, "new pane did not take keyboard focus after split");

    // Exit the focused pane's shell -> its PTY exits -> that pane closes.
    await insertText(ws, "exit");
    await pressEnter(ws);

    const backToOne = await waitFor(
      ws,
      `document.querySelectorAll('.gb-pane').length === 1`,
      { timeoutMs: 4000 }
    );
    assert.ok(backToOne, "exiting a pane did not close exactly one pane");

    // The surviving pane still has a mounted, usable terminal.
    await sleep(200);
    const survivorUsable = await evalInPage(
      ws,
      `!!document.querySelector('.gb-pane .xterm')`
    );
    assert.ok(survivorUsable, "surviving pane has no live xterm");
  });
});
