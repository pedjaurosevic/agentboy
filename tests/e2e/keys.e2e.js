// F2.3 E2E: the F7 and F10 keyboard bindings match their on-screen buttons and
// /help — regression guard for the mismatch where F7 toggled fullscreen and F10
// only scrolled to the bottom.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { withApp, evalInPage, cdpSend, waitFor, sleep } = require("./harness");

const PORT = 9248;

// Press a function key so xterm's custom key handler sees it (rawKeyDown carries
// the key without inserting a character).
async function pressFnKey(ws, key, vk) {
  await evalInPage(
    ws,
    `document.querySelector('.xterm-helper-textarea').focus(), true`
  );
  for (const type of ["rawKeyDown", "keyUp"]) {
    await cdpSend(ws, "Input.dispatchKeyEvent", {
      type,
      key,
      code: key,
      windowsVirtualKeyCode: vk,
    });
  }
}

test("F7 adjusts CRT intensity (not fullscreen)", async () => {
  await withApp({ port: PORT }, async ({ ws }) => {
    await pressFnKey(ws, "F7", 118);
    await sleep(300);

    const toast = await evalInPage(
      ws,
      `document.querySelector('.gb-toast')?.textContent || ''`
    );
    assert.match(toast, /CRT Intensity/, `F7 did not show a CRT intensity toast (got: ${JSON.stringify(toast)})`);

    const wentFullscreen = await evalInPage(
      ws,
      `document.querySelector('.gb').classList.contains('full')`
    );
    assert.equal(wentFullscreen, false, "F7 toggled fullscreen instead of CRT intensity");
  });
});

test("F10 launches the screensaver overlay", async () => {
  await withApp({ port: PORT + 1 }, async ({ ws }) => {
    const before = await evalInPage(ws, `!!document.querySelector('.gb-saver-overlay')`);
    assert.equal(before, false, "saver overlay present before F10 (bad precondition)");

    await pressFnKey(ws, "F10", 121);
    const appeared = await waitFor(
      ws,
      `!!document.querySelector('.gb-saver-overlay')`,
      { timeoutMs: 3000 }
    );
    assert.ok(appeared, "F10 did not launch the screensaver overlay");
  });
});
