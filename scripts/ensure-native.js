// Shared native-dependency helper for agentboy.
//
// node-pty is a native addon that must be compiled against Electron's ABI
// (there is no Linux prebuild in the npm package — only darwin/win32). The old
// strategy ran `electron-rebuild` in a hard `postinstall`, so on any machine
// without a C/C++ toolchain the ENTIRE `npm i -g agentboy` failed with a
// cryptic node-gyp error and left no working binary.
//
// New strategy: the install never fails (postinstall is best-effort), and the
// launcher (bin/agentboy.js) self-heals on first run — it rebuilds if the
// addon is missing, and prints actionable guidance if the toolchain is absent.
//
// This file is shipped in package.json "files" precisely because postinstall
// and bin both require it at install/runtime inside the published package.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const APP_ROOT = path.join(__dirname, "..");
const PTY_BINARY = path.join(
  APP_ROOT,
  "node_modules",
  "node-pty",
  "build",
  "Release",
  "pty.node"
);

// True once node-pty has a compiled addon for this Electron ABI.
function nativeBuilt() {
  return fs.existsSync(PTY_BINARY);
}

// Resolve the @electron/rebuild CLI entry point from the installed package,
// so this works regardless of hoisting / global vs local layout. node_modules
// /.bin is only on PATH during npm lifecycle scripts, not at runtime, so we
// resolve the real file instead of relying on the shim.
//
// Note: @electron/rebuild's package.json has an "exports" map that forbids the
// "./package.json" subpath, so require.resolve("@electron/rebuild/package.json")
// throws. We resolve the main entry (allowed) and read package.json off disk to
// find the bin, then fall back to the .bin shim (a symlink to lib/cli.js).
function resolveRebuildCli() {
  try {
    const main = require.resolve("@electron/rebuild", { paths: [APP_ROOT] });
    let dir = path.dirname(main);
    for (let i = 0; i < 6; i++) {
      const pj = path.join(dir, "package.json");
      if (fs.existsSync(pj)) {
        const pkg = JSON.parse(fs.readFileSync(pj, "utf8"));
        if (pkg.name === "@electron/rebuild") {
          let bin = pkg.bin;
          if (bin && typeof bin === "object") {
            bin = bin["electron-rebuild"] || Object.values(bin)[0];
          }
          if (bin) return path.join(dir, bin);
          break;
        }
      }
      dir = path.dirname(dir);
    }
  } catch {
    /* fall through to the shim */
  }
  const shim = path.join(APP_ROOT, "node_modules", ".bin", "electron-rebuild");
  if (fs.existsSync(shim)) return shim;
  return null;
}

// Attempt to (re)build node-pty against Electron. Returns true only if the
// compiled addon exists afterward. Never throws.
function tryRebuild({ quiet = false } = {}) {
  const cli = resolveRebuildCli();
  if (!cli) return false;
  try {
    const res = spawnSync(process.execPath, [cli, "-f", "-w", "node-pty"], {
      cwd: APP_ROOT,
      stdio: quiet ? "ignore" : "inherit",
    });
    return res.status === 0 && nativeBuilt();
  } catch {
    return false;
  }
}

// Debian/Ubuntu is the common case; the others cover the next-most-likely.
const TOOLCHAIN_HINT =
  "  Debian/Ubuntu: sudo apt install -y build-essential python3\n" +
  "  Fedora:        sudo dnf install -y make automake gcc gcc-c++ python3\n" +
  "  Arch:          sudo pacman -S --needed base-devel python";

module.exports = { nativeBuilt, tryRebuild, PTY_BINARY, TOOLCHAIN_HINT };
