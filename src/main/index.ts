import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, screen, shell, Tray, nativeImage } from "electron";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { createTerminalWindow, defaultTerminalBounds, terminalColumnBounds } from "./window";
import { ptyCwd, ptyKill, ptyKillAll, ptyKillForWindow, ptyResize, ptySpawn, ptyWrite } from "./pty";
import { loadConfig, saveConfig, TerminalConfig } from "./config";
import { isHelpRequested } from "./help-args";
import { listCheckpoints, resetToCheckpoint, saveCheckpoint } from "./git-checkpoint";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const termWindows = new Set<BrowserWindow>();
let tray: Tray | null = null;
let configHandlerRegistered = false;

app.setName("Terminal");

// Chromium sandbox viability on Linux: the sandbox needs either a SUID-root
// chrome-sandbox helper (rare with npm installs) or unprivileged user
// namespaces (blocked on Debian by default and on Ubuntu 24.04+ via
// AppArmor). Detect instead of assuming, so the DEFAULT is sandbox ON and
// only genuinely incapable systems fall back — with a loud warning.
function linuxSandboxViable(): boolean {
  const read = (p: string) => {
    try {
      return readFileSync(p, "utf8").trim();
    } catch {
      return null;
    }
  };
  try {
    const helper = join(dirname(process.execPath), "chrome-sandbox");
    const st = statSync(helper);
    if ((st.mode & 0o4000) !== 0 && st.uid === 0) return true; // SUID helper
  } catch {
    /* no helper — fall through to userns checks */
  }
  if (read("/proc/sys/kernel/apparmor_restrict_unprivileged_userns") === "1") return false;
  if (read("/proc/sys/kernel/unprivileged_userns_clone") === "0") return false;
  const maxNs = read("/proc/sys/user/max_user_namespaces");
  if (maxNs !== null && parseInt(maxNs, 10) === 0) return false;
  return true;
}

if (process.platform === "linux") {
  // Sandbox is ON by default (2026-07-11, was opt-in). Overrides:
  // AGENTBOY_NO_SANDBOX=1 forces it off, AGENTBOY_SANDBOX=1 forces it on
  // even where detection says it can't work.
  const forceOff = process.env.AGENTBOY_NO_SANDBOX === "1";
  const forceOn = process.env.AGENTBOY_SANDBOX === "1";
  if (forceOff || (!forceOn && !linuxSandboxViable())) {
    if (!forceOff) {
      console.warn(
        "agentboy: Chromium sandbox unavailable on this system (no SUID helper, " +
          "unprivileged user namespaces restricted) — running with --no-sandbox. " +
          "Set AGENTBOY_SANDBOX=1 to force it on."
      );
    }
    app.commandLine.appendSwitch("no-sandbox");
    app.commandLine.appendSwitch("disable-setuid-sandbox");
  }
  const linuxApp = app as typeof app & { setDesktopName?: (desktopName: string) => void };
  linuxApp.setDesktopName?.("terminal-app.desktop");
}

function appIconPath(): string {
  return join(__dirname, "..", "renderer", "assets", "app-icon.png");
}

function unionRects(rects: Rect[]): Rect {
  const left = Math.min(...rects.map((r) => r.x));
  const top = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.w));
  const bottom = Math.max(...rects.map((r) => r.y + r.h));
  return { x: left, y: top, w: right - left, h: bottom - top };
}

function toRect(r: { x: number; y: number; width: number; height: number }): Rect {
  return { x: r.x, y: r.y, w: r.width, h: r.height };
}

function intersectRects(a: Rect, b: Rect): Rect | null {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, w: right - left, h: bottom - top };
}

function parseXPropNumbers(output: string): number[] {
  const [, raw = ""] = output.split("=");
  return raw
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((n) => Number.isFinite(n));
}

function x11CurrentDesktop(): number {
  try {
    const out = execFileSync("xprop", ["-root", "_NET_CURRENT_DESKTOP"], {
      encoding: "utf8",
      timeout: 1000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return parseXPropNumbers(out)[0] ?? 0;
  } catch {
    return 0;
  }
}

function x11WorkArea(): Rect | null {
  try {
    const out = execFileSync("xprop", ["-root", "_NET_WORKAREA"], {
      encoding: "utf8",
      timeout: 1000,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const nums = parseXPropNumbers(out);
    const i = x11CurrentDesktop() * 4;
    if (nums.length < i + 4) return null;
    const [x, y, w, h] = nums.slice(i, i + 4);
    if (w <= 0 || h <= 0) return null;
    return { x, y, w, h };
  } catch {
    return null;
  }
}

function virtualBounds(): Rect {
  return unionRects(screen.getAllDisplays().map((d) => toRect(d.bounds)));
}

function virtualWorkArea(): Rect {
  return unionRects(displayWorkAreas());
}

function displayWorkAreas(): Rect[] {
  const rootWork = x11WorkArea();
  return screen.getAllDisplays().map((d) => {
    const work = toRect(d.workArea);
    if (!rootWork) return work;
    return intersectRects(work, rootWork) ?? work;
  });
}

function sanitizeRect(b: Rect | null | undefined): Rect | null {
  if (!b || ![b.x, b.y, b.w, b.h].every((n) => typeof n === "number" && isFinite(n)))
    return null;
  const full = virtualBounds();
  const min = 80;
  const w = Math.round(Math.min(Math.max(b.w, min), full.w * 2));
  const h = Math.round(Math.min(Math.max(b.h, min), full.h * 2));
  const x = Math.round(Math.min(Math.max(b.x, full.x - w + 30), full.x + full.w - 30));
  const y = Math.round(Math.min(Math.max(b.y, full.y - 30), full.y + full.h - 30));
  return { x, y, w, h };
}

function liveTerminals(): BrowserWindow[] {
  return [...termWindows].filter((w) => !w.isDestroyed());
}

function focusTerminalByOffset(current: BrowserWindow, offset: 1 | -1): void {
  const wins = liveTerminals();
  if (wins.length < 2) return;
  const currentIndex = wins.indexOf(current);
  if (currentIndex === -1) return;
  const nextIndex = (currentIndex + offset + wins.length) % wins.length;
  const next = wins[nextIndex];
  next.show();
  next.focus();
  next.webContents.focus();
}

function wireTerminalShortcuts(win: BrowserWindow): void {
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    if (input.control && input.key === "Tab") {
      event.preventDefault();
      focusTerminalByOffset(win, input.shift ? -1 : 1);
    }
  });
}

function registerTerminal(win: BrowserWindow): BrowserWindow {
  termWindows.add(win);
  wireTerminalShortcuts(win);
  const sendFullscreen = () => {
    if (!win.isDestroyed()) {
      win.webContents.send("win:fullscreenChanged", win.isFullScreen());
    }
  };
  win.on("enter-full-screen", sendFullscreen);
  win.on("leave-full-screen", sendFullscreen);
  // Capture the WebContents now: inside "closed" win.webContents is already
  // destroyed, but the object reference still matches this window's PTY sessions.
  const wc = win.webContents;
  win.on("closed", () => {
    termWindows.delete(win);
    ptyKillForWindow(wc);
  });
  // Invalidate screen cache on display metrics change (hotplug monitor)
  const onDisplayMetricsChanged = () => {
    if (!win.isDestroyed()) {
      win.webContents.send("screen:invalidate");
    }
  };
  screen.on("display-metrics-changed", onDisplayMetricsChanged);
  win.once("closed", () => {
    screen.removeListener("display-metrics-changed", onDisplayMetricsChanged);
  });
  return win;
}

function setWindowRect(win: BrowserWindow, b: Rect): void {
  const r = sanitizeRect(b);
  if (!r) return;
  win.setBounds({ x: r.x, y: r.y, width: r.w, height: r.h });
  try {
    win.webContents.invalidate();
  } catch {}
}

function openTerminal(b: Rect = defaultTerminalBounds()): BrowserWindow {
  const win = registerTerminal(createTerminalWindow(b));
  return win;
}

function openTerminalGrid(count: number): void {
  const target = Math.max(1, Math.min(3, count | 0));
  const wins = liveTerminals();
  while (wins.length < target) wins.push(openTerminal(terminalColumnBounds(wins.length)));
  for (let i = 0; i < target; i++) {
    setWindowRect(wins[i], terminalColumnBounds(i));
    wins[i].show();
    wins[i].focus();
  }
}

function sendTerminalSize(size: "small" | "tall" | "full") {
  const win = liveTerminals()[0] ?? openTerminal();
  setTimeout(() => {
    if (!win.isDestroyed()) {
      win.webContents.send("term:setSize", size);
    }
  }, 250);
}

function createTray() {
  const icon = nativeImage.createFromPath(appIconPath()).resize({ width: 22, height: 22 });
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip("terminal");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "terminal", enabled: false },
    { type: "separator" },
    { label: "Open Terminal", click: () => openTerminal() },
    { label: "Open 3 Columns", click: () => openTerminalGrid(3) },
    {
      label: "Terminal Size",
      submenu: [
        { label: "Small", click: () => sendTerminalSize("small") },
        { label: "Extended Vertical", click: () => sendTerminalSize("tall") },
        { label: "Fullscreen", click: () => sendTerminalSize("full") },
      ],
    },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]));
}

function wireConfigIpc() {
  if (configHandlerRegistered) return;
  ipcMain.handle("config:get", () => loadConfig());
  ipcMain.handle("config:set", (_e, patch: Partial<TerminalConfig>) => saveConfig(patch));
  configHandlerRegistered = true;
}

function wireIpc() {
  ipcMain.handle("screen:get", () => {
    return {
      work: virtualWorkArea(),
      full: virtualBounds(),
      displays: screen.getAllDisplays().map((d, i) => ({
        work: displayWorkAreas()[i] ?? toRect(d.workArea),
        full: toRect(d.bounds),
      })),
    };
  });

  ipcMain.on("win:setBounds", (e, b: Rect) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (!w || w.isDestroyed()) return;
    if (w.isFullScreen()) w.setFullScreen(false);
    const r = sanitizeRect(b);
    if (!r) return;
    setWindowRect(w, r);
  });

  ipcMain.on("win:setFullscreen", (e, enabled: boolean) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (!w || w.isDestroyed()) return;
    w.setAlwaysOnTop(false, "normal");
    w.setFullScreen(Boolean(enabled));
  });

  ipcMain.on("win:setResizable", (e, enabled: boolean) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (!w || w.isDestroyed()) return;
    w.setResizable(Boolean(enabled));
  });

  ipcMain.on("win:setAlwaysOnTop", (e, enabled: boolean) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (!w || w.isDestroyed()) return;
    if (enabled && w.isFullScreen()) w.setFullScreen(false);
    w.setAlwaysOnTop(Boolean(enabled), enabled ? "screen-saver" : "normal");
    if (enabled) {
      w.moveTop();
      w.show();
      w.focus();
    }
  });

  ipcMain.on("window:focus", (e) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (!w || w.isDestroyed()) return;
    w.show();
    w.focus();
    w.webContents.focus();
  });

  ipcMain.on("term:close", (e) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (w && termWindows.has(w)) w.close();
  });
  ipcMain.on("term:minimize", (e) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (w && termWindows.has(w)) w.minimize();
  });
  ipcMain.on("app:quit", () => app.quit());

  ipcMain.on("clip:write", (_e, { text, which }: { text: string; which?: "selection" }) => {
    clipboard.writeText(text, which ?? "clipboard");
  });
  ipcMain.handle("clip:read", (_e, which?: "selection") =>
    clipboard.readText(which ?? "clipboard")
  );
  ipcMain.on("open:external", (_e, url: string) => {
    // about:blank = the cassette globe buttons ("just open the browser")
    if (/^https?:\/\//i.test(url) || url === "about:blank") shell.openExternal(url);
  });

  // Git checkpoint operations run in the working directory of the pane's own
  // shell (resolved from its PTY). If the cwd cannot be resolved they refuse to
  // run — a $HOME fallback would let a checkpoint commit or hard-reset the
  // user's entire home directory.
  const gitCwd = (e: Electron.IpcMainInvokeEvent, ptyId?: number): string | null =>
    typeof ptyId === "number" ? ptyCwd(e.sender, ptyId) : null;

  ipcMain.handle("git:diff", (e, ptyId?: number) => {
    const cwd = gitCwd(e, ptyId);
    if (!cwd) return "Cannot resolve the active pane's working directory.";
    // `git diff HEAD` = staged AND unstaged changes vs the last commit — the
    // full "what have I changed" picture, and what a checkpoint captures. Plain
    // `git diff` hides anything already `git add`-ed. On an unborn HEAD (no
    // commits yet) HEAD is not a valid revision, so fall back to plain diff.
    try {
      return execFileSync("git", ["diff", "HEAD"], { cwd, encoding: "utf8", timeout: 5000 });
    } catch {
      try {
        return execFileSync("git", ["diff"], { cwd, encoding: "utf8", timeout: 5000 });
      } catch (err: any) {
        return err.stdout || err.message;
      }
    }
  });

  ipcMain.handle("git:save", (e, ptyId?: number) => {
    const cwd = gitCwd(e, ptyId);
    if (!cwd) return { ok: false, untrackedFiles: 0 };
    return saveCheckpoint(cwd);
  });

  // List this repo's AgentBoy checkpoints (newest first) so the user can roll
  // back to a specific one. Each entry must pass isCheckpointCommit (subject
  // AND trailer) — git:restoreTo re-checks before resetting regardless.
  ipcMain.handle("git:checkpoints", (e, ptyId?: number) => {
    const cwd = gitCwd(e, ptyId);
    return cwd ? listCheckpoints(cwd) : [];
  });

  // Hard-reset the pane's repo to a specific checkpoint. This is the only
  // restore entry point (see resetToCheckpoint in git-checkpoint.ts).
  ipcMain.handle("git:restoreTo", async (e, ptyId: number | undefined, sha: unknown) => {
    const cwd = gitCwd(e, ptyId);
    if (!cwd || typeof sha !== "string" || !/^[0-9a-f]{7,40}$/.test(sha)) {
      return { ok: false, stashed: false };
    }
    // A hard reset is destructive, so it must not be triggerable by the
    // renderer alone — a spoofed escape sequence could otherwise reach here.
    // Require a native OS confirmation the renderer cannot fabricate; the human
    // has to click Restore. Uncommitted work is stashed (not lost) regardless.
    let dirtyCount = 0;
    try {
      const status = execFileSync("git", ["status", "--porcelain"], {
        cwd,
        encoding: "utf8",
        timeout: 3000,
        stdio: ["ignore", "pipe", "ignore"],
      });
      dirtyCount = status.split("\n").filter((l) => l.trim()).length;
    } catch {
      /* leave dirtyCount at 0 */
    }
    const win = BrowserWindow.fromWebContents(e.sender);
    const detail =
      dirtyCount > 0
        ? `The repository will be hard-reset to checkpoint ${sha.slice(0, 8)}.\n` +
          `${dirtyCount} uncommitted change${dirtyCount === 1 ? "" : "s"} will be saved to a git stash first (recover with \`git stash pop\`).`
        : `The repository will be hard-reset to checkpoint ${sha.slice(0, 8)}.`;
    const opts: Electron.MessageBoxOptions = {
      type: "warning",
      buttons: ["Cancel", "Restore"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      title: "AgentBoy — Restore checkpoint",
      message: "Restore to this checkpoint?",
      detail,
    };
    const { response } = win
      ? await dialog.showMessageBox(win, opts)
      : await dialog.showMessageBox(opts);
    if (response !== 1) return { ok: false, stashed: false, cancelled: true };
    return resetToCheckpoint(cwd, sha);
  });

  // Origin of an OSC 98 approval request: the pane shell's cwd and, if it is
  // inside a git repo, the repo root — shown in the dialog so the user can
  // tell a real agent request from a spoofed escape sequence, and knows
  // exactly which repo a YES checkpoint will commit.
  ipcMain.handle("pty:origin", (e, ptyId?: number) => {
    const cwd = typeof ptyId === "number" ? ptyCwd(e.sender, ptyId) : null;
    if (!cwd) return { cwd: null, gitRoot: null };
    let gitRoot: string | null = null;
    try {
      gitRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
        cwd,
        encoding: "utf8",
        timeout: 1000,
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() || null;
    } catch {
      gitRoot = null;
    }
    const home = homedir();
    const tildify = (p: string) => (p === home || p.startsWith(home + "/") ? "~" + p.slice(home.length) : p);
    return { cwd: tildify(cwd), gitRoot: gitRoot && tildify(gitRoot) };
  });

  // Bare cwd of a PTY's shell (full path, no tildify, no git lookup) — cheap
  // enough for the renderer to poll for the chassis-edge path marking.
  ipcMain.handle("pty:cwd", (e, ptyId?: number) =>
    typeof ptyId === "number" ? ptyCwd(e.sender, ptyId) : null);

  ipcMain.handle("pty:spawn", (e, opts) => ptySpawn(e.sender, opts));
  ipcMain.on("pty:write", (e, { id, data }) => ptyWrite(e.sender, id, data));
  ipcMain.on("pty:resize", (e, { id, cols, rows }) => ptyResize(e.sender, id, cols, rows));
  ipcMain.on("pty:kill", (e, { id }) => ptyKill(e.sender, id));

}

const gotLock = app.requestSingleInstanceLock();
wireConfigIpc();
if (!gotLock) {
  app.quit();
} else {
  const requestedCount = (argv: string[]) => {
    const n = Number(argv.find((arg) => /^[1-3]$/.test(arg)));
    return Number.isFinite(n) ? n : 1;
  };
  // Open the in-app help overlay in the focused terminal (or the first one,
  // opening one if none exist). `agentboy /help` from inside a pane lands here
  // via the second-instance event, so it never spawns a second window.
  const showHelp = () => {
    const focused = BrowserWindow.getFocusedWindow();
    const win =
      (focused && termWindows.has(focused) ? focused : null) ??
      liveTerminals()[0] ??
      openTerminal();
    const send = () => {
      if (!win.isDestroyed()) {
        win.show();
        win.focus();
        win.webContents.send("show:help");
      }
    };
    if (win.webContents.isLoading()) win.webContents.once("did-finish-load", send);
    else send();
  };
  app.on("second-instance", (_event, commandLine) => {
    if (isHelpRequested(commandLine)) {
      showHelp();
      return;
    }
    const count = requestedCount(commandLine);
    if (count === 3) openTerminalGrid(3);
    else openTerminal();
  });
  app.whenReady().then(() => {
    wireIpc();
    createTray();
    const count = requestedCount(process.argv);
    if (count === 3) openTerminalGrid(3);
    else openTerminal();
    if (isHelpRequested(process.argv)) showHelp();
  });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", () => ptyKillAll());
}
