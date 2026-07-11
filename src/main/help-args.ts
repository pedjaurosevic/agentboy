// Recognise a "show help" launch. `agentboy /help` (and `help`, `--help`,
// `-h`) reach here as extra argv passed through by bin/agentboy.js. Kept pure
// and separate so it can be unit-tested without Electron.
export function isHelpRequested(argv: readonly string[]): boolean {
  return argv.some((a) => a === "/help" || a === "help" || a === "--help" || a === "-h");
}
