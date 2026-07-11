# Security Policy

agentboy is a terminal emulator: it renders output from untrusted programs,
parses escape sequences (including its own OSC 98/99 approval and LED
protocol), and on an approved OSC 98 request performs git operations in the
active pane's working directory. That surface is exactly where we want
security reports.

## Reporting a vulnerability

Please email **pedjaurosevic@gmail.com** with the details, or use GitHub's
private vulnerability reporting on this repository. Do not open a public
issue for exploitable problems.

You can expect an acknowledgement within a few days. Fixes ship as a patch
release; credit is given unless you ask otherwise.

## Scope of interest

- Escape-sequence parsing that can spoof or trigger the approval dialog,
  LED, checkpoint or restore flows without the user's real click
- Sandbox escapes or IPC reachable from renderer/PTY content
- Git checkpoint/restore doing anything outside the pane's repo, or
  swallowing staged/untracked files it should not touch
- Path traversal or file writes reachable through the config

## Non-goals

- Attacks requiring a compromised local account (the shell already runs as
  you)
- Denial of service by printing a lot of output
