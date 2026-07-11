// F2.3 E2E: user chassis settings survive an app restart (F1.1 persistence).
// Phase 1: boot with a scratch HOME, click F4 (THM+) -> theme 2 and F1 (LIGHT),
//          assert ~/.agentboy.json picks the change up.
// Phase 2: relaunch the SAME scratch HOME, assert the chassis boots into
//          Monochrome E-Ink LIGHT (--term-bg #ffffff, .light class).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  makeScratchHome,
  withApp,
  evalInPage,
  clickSelector,
  sleep,
} = require("./harness");

const PORT = 9244;

test("theme + light preset persist across an app restart", async () => {
  const scratch = makeScratchHome();
  const cfgPath = path.join(scratch, ".agentboy.json");

  // ---- Phase 1: change settings, expect them written to disk ----
  await withApp({ port: PORT, scratch }, async ({ ws }) => {
    await clickSelector(ws, ".gb-mode-switch"); // Switch layout to full to reveal keys
    await sleep(150);
    await clickSelector(ws, '.gb-ss-btn[data-fn="thm"]'); // F3 THM -> theme 2
    await sleep(150);
    await clickSelector(ws, '.gb-ss-btn[data-fn="tone"]'); // F1 TONE -> light
    await sleep(900); // > 400ms debounce + IPC + atomic write

    const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    assert.equal(cfg.theme, 2, "theme not persisted");
    assert.equal(cfg.tone, "light", "tone not persisted");
  });

  await sleep(1000); // let the first instance fully release the lock

  // ---- Phase 2: relaunch the same HOME, expect the state restored ----
  await withApp({ port: PORT + 1, scratch }, async ({ ws }) => {
    const bg = await evalInPage(
      ws,
      `getComputedStyle(document.querySelector('.gb')).getPropertyValue('--term-bg').trim()`
    );
    const isLight = await evalInPage(
      ws,
      `document.querySelector('.gb').classList.contains('light')`
    );
    assert.equal(bg, "#919191", `expected E-Ink light bg, got ${bg}`);
    assert.equal(isLight, true, "light class not restored on boot");
  });
});
