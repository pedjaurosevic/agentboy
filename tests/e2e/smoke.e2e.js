// F2.3 E2E smoke: the app boots, spawns a PTY, and the shell echoes input.
// This is the single most valuable integration check — it exercises the whole
// spine (Electron main -> IPC -> node-pty -> xterm DOM render) that unit tests
// cannot touch.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  withApp,
  evalInPage,
  insertText,
  pressEnter,
  sleep,
} = require("./harness");

const PORT = 9241;

test("app boots, spawns a PTY pane, and the shell echoes typed input", async () => {
  await withApp({ port: PORT }, async ({ ws }) => {
    // A terminal pane exists and its xterm instance mounted.
    const paneCount = await evalInPage(
      ws,
      `document.querySelectorAll('.gb-pane').length`
    );
    assert.ok(paneCount >= 1, `expected >=1 pane, got ${paneCount}`);
    const hasXterm = await evalInPage(ws, `!!document.querySelector('.xterm')`);
    assert.ok(hasXterm, "xterm did not mount");

    // Drive the real shell through the focused helper textarea.
    const marker = "hello-agentboy-e2e";
    await evalInPage(
      ws,
      `document.querySelector('.xterm-helper-textarea').focus(), true`
    );
    await insertText(ws, `echo ${marker}`);
    await pressEnter(ws);
    await sleep(1200); // shell round-trip + xterm DOM paint

    const screen = await evalInPage(
      ws,
      `document.querySelector('.xterm-rows').textContent`
    );
    // Appears twice: the typed command echo and the shell's output line.
    const hits = screen.split(marker).length - 1;
    assert.ok(hits >= 2, `expected echoed output for '${marker}', screen was: ${JSON.stringify(screen.slice(-200))}`);
  });
});
