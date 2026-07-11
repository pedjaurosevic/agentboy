// node-pty session management. Each renderer terminal gets one PTY running the
// user's shell; data is bridged over IPC.

import { spawn, IPty } from "node-pty";
import { homedir } from "node:os";
import { readlinkSync, accessSync, constants } from "node:fs";
import type { WebContents } from "electron";
import { loadConfig } from "./config";

class PtyBatcher {
  private buffer = "";
  private timer: NodeJS.Timeout | null = null;

  constructor(private send: (data: string) => void) {}

  push(chunk: string) {
    this.buffer += chunk;
    if (this.buffer.length >= 100000) {
      this.flush();
    } else if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), 16);
    }
  }

  private flush() {
    if (this.buffer.length === 0) return;
    this.send(this.buffer);
    this.buffer = "";
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  destroy() {
    this.flush();
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

interface Session {
  pty: IPty;
  batcher: PtyBatcher;
  wc: WebContents; // the renderer that owns this session
}

const sessions = new Map<number, Session>();
let nextId = 1;

// Return the session only if `wc` is the renderer that spawned it. Prevents one
// renderer from writing to / resizing / killing another window's PTY by id.
function ownedSession(wc: WebContents, id: number): Session | undefined {
  const s = sessions.get(id);
  return s && s.wc === wc ? s : undefined;
}

export function ptySpawn(
  wc: WebContents,
  opts: { cols: number; rows: number; cwd?: string }
): { id: number; shellFallback: string | null } {
  const id = nextId++;
  const config = loadConfig();
  // Validate the configured shell BEFORE node-pty forks: a bad "shell" value
  // otherwise yields a dead empty pane with no message. On failure fall back
  // to the environment shell and tell the renderer so it can toast.
  let shell = config.shell || process.env.SHELL || "/bin/bash";
  let shellFallback: string | null = null;
  if (config.shell) {
    try {
      accessSync(config.shell, constants.X_OK);
    } catch {
      shellFallback = config.shell;
      shell = process.env.SHELL || "/bin/bash";
    }
  }
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    TERM: "xterm-256color",
    COLORTERM: "terminal",
  };
  // Keep the terminal readable even if the parent desktop/session forces loud CLI
  // color. Tools can still emit normal ANSI, but they are not pushed into it.
  delete env.FORCE_COLOR;
  delete env.CLICOLOR_FORCE;
  const pty = spawn(shell, [], {
    name: "xterm-256color",
    cols: Math.max(2, opts.cols | 0),
    rows: Math.max(2, opts.rows | 0),
    cwd: opts.cwd || homedir(),
    env,
  });

  const batcher = new PtyBatcher((batchedData) => {
    if (!wc.isDestroyed()) wc.send("pty:data", { id, data: batchedData });
  });

  pty.onData((data) => {
    batcher.push(data);
  });
  pty.onExit(({ exitCode }) => {
    batcher.destroy();
    sessions.delete(id);
    if (!wc.isDestroyed()) wc.send("pty:exit", { id, code: exitCode });
  });

  sessions.set(id, { pty, batcher, wc });
  return { id, shellFallback };
}

export function ptyWrite(wc: WebContents, id: number, data: string) {
  ownedSession(wc, id)?.pty.write(data);
}

// Current working directory of the shell running in this PTY (Linux /proc).
// Returns null when the session is not owned by `wc` or the cwd cannot be
// resolved — callers must treat null as "unknown", never fall back to $HOME.
export function ptyCwd(wc: WebContents, id: number): string | null {
  const s = ownedSession(wc, id);
  if (!s) return null;
  try {
    return readlinkSync(`/proc/${s.pty.pid}/cwd`);
  } catch {
    return null;
  }
}

export function ptyResize(wc: WebContents, id: number, cols: number, rows: number) {
  const s = ownedSession(wc, id);
  if (s) {
    try {
      s.pty.resize(Math.max(2, cols | 0), Math.max(2, rows | 0));
    } catch {
      /* ignore transient resize errors */
    }
  }
}

function killSession(id: number) {
  const s = sessions.get(id);
  if (s) {
    try {
      s.pty.kill();
    } catch {
      /* already gone */
    }
    s.batcher.destroy();
    sessions.delete(id);
  }
}

export function ptyKill(wc: WebContents, id: number) {
  if (ownedSession(wc, id)) killSession(id);
}

export function ptyKillAll() {
  for (const id of [...sessions.keys()]) killSession(id);
}

// Kill every session owned by a window's renderer — called when the window
// closes so its shell processes don't outlive it as orphans. `wc` is captured
// before the window is destroyed; comparison is by reference (the WebContents
// object survives destruction), so a destroyed `wc` still matches its sessions.
export function ptyKillForWindow(wc: WebContents) {
  for (const [id, s] of [...sessions.entries()]) {
    if (s.wc === wc) killSession(id);
  }
}
