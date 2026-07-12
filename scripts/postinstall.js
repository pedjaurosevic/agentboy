// Best-effort native build for agentboy. This runs as the npm `postinstall`
// step. It MUST NOT fail the install: if the toolchain is missing we want the
// package to install cleanly and let the launcher self-heal (or print guidance)
// on first run — not to abort `npm i -g agentboy` with a node-gyp stack trace.

const { nativeBuilt, tryRebuild, TOOLCHAIN_HINT } = require("./ensure-native");

if (!nativeBuilt()) {
  try {
    const ok = tryRebuild();
    if (!ok) {
      console.warn(
        "\n[agentboy] Native terminal backend (node-pty) is not built yet — " +
          "it will be built on first launch.\n" +
          "           If launch reports a build failure, install a C/C++ toolchain:\n" +
          TOOLCHAIN_HINT +
          "\n"
      );
    }
  } catch {
    /* never let the install fail */
  }
}

process.exit(0);
