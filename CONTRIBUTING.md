# Contributing to agentboy

Thanks for wanting to help! agentboy is a Linux-first Electron terminal —
patches are welcome, and the bar for merging is: verified, in-voice, honest.

## Getting started

```bash
git clone https://github.com/pedjaurosevic/agentboy.git
cd agentboy
npm install        # rebuilds node-pty for Electron (needs python3/make/g++)
npm start
```

## Before you open a PR

```bash
npm run build      # typecheck + main/renderer build + static assets
npm test           # unit tests (node:test, no extra deps)
npm run test:e2e   # drives the real app under Xvfb (needs xvfb installed)
```

All three must be green. CI runs the build and unit tests on Ubuntu, Debian 12
and Arch, plus the E2E suite on Ubuntu.

## What we look for

- **Visual changes are never blind.** If you touch the chassis, themes, CRT or
  layouts, include a screenshot (the repo pattern is headless Xvfb captures)
  and check the light/sepia tones and at least a couple of FRAME liveries —
  the combination space is where regressions hide.
- **Docs move with code.** README, in-app help (`src/renderer/help-content.ts`)
  and CHANGELOG must stay true to the behavior in the same PR.
- **Keep the device metaphor.** New UI belongs on the chassis and follows the
  existing voice; the approval dialog and quit confirm intentionally overhang
  the plastic (anti-spoofing) — do not move chrome into PTY-paintable space.
- Pure logic goes into small modules under `src/renderer/` with unit tests;
  avoid growing `terminal-main.ts` when a module will do.

## Reporting bugs

Use the issue template. Distro, X11 or Wayland, Node version and whether you
installed from npm or source make the difference between a fix and a shrug.
