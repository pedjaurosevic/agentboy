#!/bin/bash
# Tear down the headless click-probe session started by run.sh.
WORK="${CLICKPROBE_DIR:-/tmp/agentboy-click-probe}"
for p in electron xvfb; do
  if [ -f "$WORK/$p.pid" ]; then
    kill "$(cat "$WORK/$p.pid")" 2>/dev/null
    rm -f "$WORK/$p.pid"
  fi
done
