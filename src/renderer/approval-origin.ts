// The origin lines shown inside the OSC 98 approval dialog. Their job is
// anti-spoofing: any program that can write escape sequences to the terminal
// can open this dialog, so the dialog itself must say where the request came
// from and what a YES will actually do.
import type { PtyOrigin } from "./terminal-api";

export const formatApprovalOrigin = (o: PtyOrigin): string => {
  if (!o.cwd) {
    return "origin: unknown shell — YES only answers “y”, no git checkpoint";
  }
  const lines = [`requested by the shell in ${o.cwd}`];
  if (o.gitRoot) {
    lines.push(`YES checkpoints the git repo at ${o.gitRoot}, then answers “y”`);
  } else {
    lines.push("not a git repo — YES only answers “y”, no checkpoint");
  }
  return lines.join("\n");
};
