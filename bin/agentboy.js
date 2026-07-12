#!/usr/bin/env node
const path = require('path');
const { spawn } = require('child_process');
const { nativeBuilt, tryRebuild, TOOLCHAIN_HINT } = require('../scripts/ensure-native');

// Self-heal: node-pty ships no Linux prebuild, so if postinstall couldn't build
// it (e.g. toolchain missing at install time), rebuild now on first run. If the
// build still fails, print actionable guidance instead of crashing later with a
// cryptic "Cannot find module .../pty.node" from deep inside the main process.
if (!nativeBuilt()) {
  process.stderr.write('[agentboy] First run: building the native terminal backend (node-pty)…\n');
  if (!tryRebuild()) {
    process.stderr.write(
      '\n[agentboy] Could not build node-pty. A C/C++ build toolchain is required:\n' +
      TOOLCHAIN_HINT +
      '\nThen run `agentboy` again.\n\n'
    );
    process.exit(1);
  }
}

// Under plain Node (not inside Electron), require('electron') returns the
// filesystem path to the Electron binary.
const electron = require('electron');
const appRoot = path.join(__dirname, '..');

// Sandbox is ON by default; src/main/index.ts detects at startup whether the
// Chromium sandbox can actually work on this system (SUID helper or
// unprivileged userns) and falls back with a warning when it can't.
// AGENTBOY_NO_SANDBOX=1 forces it off from here as well.
const sandboxArgs = process.env.AGENTBOY_NO_SANDBOX === '1' ? ['--no-sandbox'] : [];
const child = spawn(electron, [...sandboxArgs, appRoot, ...process.argv.slice(2)], {
  stdio: 'inherit',
});
child.on('close', (code) => process.exit(code === null ? 1 : code));
