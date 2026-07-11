#!/bin/bash
# Tear down the docs photo studio started by studio.sh.
WORK="${STUDIO_DIR:-/tmp/agentboy-docs-studio}"
for p in electron xvfb; do
  if [ -f "$WORK/$p.pid" ]; then
    kill "$(cat "$WORK/$p.pid")" 2>/dev/null
    rm -f "$WORK/$p.pid"
  fi
done
