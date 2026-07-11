// Shared E2E harness: launches the built Electron app under Xvfb and drives it
// over the Chrome DevTools Protocol (raw WebSocket, no extra dependencies).
//
// Every helper here is intentionally dependency-free — it uses the Node 22+
// global `fetch` and `WebSocket` so the E2E suite adds nothing to package.json,
// exactly like the unit runner. Consumed by tests/e2e/*.e2e.js (node --test).
//
// Provenance: distilled from the seed scripts in notes/tests-seed/ that were
// validated by hand during F1.1/F1.2/F5; this is their formalized, DRY form.
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const APP = path.resolve(__dirname, "..", "..");
const ELECTRON = path.join(APP, "node_modules", ".bin", "electron");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A fresh scratch HOME per app so tests never touch the real ~/.agentboy.json
// and each launch dodges the single-instance lock (keyed on userData path).
function makeScratchHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "agentboy-e2e-"));
}

function launch({ scratch, port, extraArgs = [] }) {
  return spawn(
    "xvfb-run",
    [
      "-a",
      "-s",
      "-screen 0 1280x800x24",
      ELECTRON,
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      `--remote-debugging-port=${port}`,
      ".",
      ...extraArgs,
    ],
    {
      cwd: APP,
      env: {
        ...process.env,
        HOME: scratch,
        XDG_CONFIG_HOME: path.join(scratch, ".config"),
      },
      stdio: "ignore",
      detached: true,
    }
  );
}

async function cdpTarget(port, { timeoutMs = 20000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await res.json();
      const page = targets.find(
        (t) => t.type === "page" && t.url.includes("terminal.html")
      );
      if (page) return page.webSocketDebuggerUrl;
    } catch {
      /* app not up yet */
    }
    await sleep(300);
  }
  throw new Error(`CDP target (terminal.html) not found on port ${port}`);
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.addEventListener("open", () => resolve(ws));
    ws.addEventListener("error", (e) => reject(e instanceof Error ? e : new Error("ws error")));
  });
}

// Fire a single CDP command and resolve with its result frame.
function cdpSend(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId();
    const onMsg = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id !== id) return;
      ws.removeEventListener("message", onMsg);
      if (m.error) reject(new Error(`${method}: ${JSON.stringify(m.error)}`));
      else resolve(m.result);
    };
    ws.addEventListener("message", onMsg);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

let _id = 1;
function nextId() {
  // Deterministic, monotonically increasing — no Math.random (banned in some
  // sandboxes and unnecessary here since ids only need to be unique per socket).
  return _id++;
}

async function evalInPage(ws, expression) {
  const result = await cdpSend(ws, "Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      `page eval threw: ${result.exceptionDetails.exception?.description || JSON.stringify(result.exceptionDetails)}`
    );
  }
  return result.result?.value;
}

// Type text into the focused element (used to drive the shell's real PTY).
function insertText(ws, text) {
  return cdpSend(ws, "Input.insertText", { text });
}

function pressEnter(ws) {
  return cdpSend(ws, "Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Enter",
    code: "Enter",
    text: "\r",
  });
}

// Dispatch a real pointerdown on a selector (the chassis buttons listen for it).
function clickSelector(ws, selector) {
  return evalInPage(
    ws,
    `(() => {
       const el = document.querySelector(${JSON.stringify(selector)});
       if (!el) throw new Error("no element for selector: " + ${JSON.stringify(selector)});
       el.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
       return true;
     })()`
  );
}

// Native click() — for real <button> elements that listen for 'click'
// (the chassis F-buttons listen for 'pointerdown'; use clickSelector for those).
function nativeClick(ws, selector) {
  return evalInPage(
    ws,
    `(() => {
       const el = document.querySelector(${JSON.stringify(selector)});
       if (!el) throw new Error("no element for selector: " + ${JSON.stringify(selector)});
       el.click();
       return true;
     })()`
  );
}

// Poll a boolean page expression until it is true or the deadline passes.
// Returns whether it ever became true — useful for transient UI states.
async function waitFor(ws, expression, { timeoutMs = 2000, stepMs = 50 } = {}) {
  const deadline = Date.now() + timeoutMs;
  do {
    if (await evalInPage(ws, expression)) return true;
    await sleep(stepMs);
  } while (Date.now() < deadline);
  return false;
}

async function killTree(child) {
  if (!child || child.pid == null) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    /* already gone */
  }
  await sleep(1200);
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    /* already gone */
  }
}

// Convenience: boot an app, hand the caller a live CDP socket, always tear down.
// `settleMs` waits for main() + boot-persist to finish before the callback.
async function withApp({ port, scratch, extraArgs, settleMs = 1800 }, fn) {
  const home = scratch || makeScratchHome();
  const child = launch({ scratch: home, port, extraArgs });
  let ws;
  try {
    ws = await connect(await cdpTarget(port));
    await sleep(settleMs);
    return await fn({ ws, scratch: home, child });
  } finally {
    try {
      ws?.close();
    } catch {
      /* ignore */
    }
    await killTree(child);
  }
}

module.exports = {
  APP,
  sleep,
  makeScratchHome,
  launch,
  cdpTarget,
  connect,
  cdpSend,
  evalInPage,
  insertText,
  pressEnter,
  clickSelector,
  nativeClick,
  waitFor,
  killTree,
  withApp,
};
