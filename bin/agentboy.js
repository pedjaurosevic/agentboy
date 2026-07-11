#!/usr/bin/env node
const path = require('path');
const { spawn } = require('child_process');

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
