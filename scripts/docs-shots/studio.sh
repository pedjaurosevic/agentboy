#!/bin/bash
# Headless "photo studio" for docs screenshots: agentboy on a private Xvfb
# display with the demo scene as shell. Theme switching is driven externally
# with xdotool clicks on the on-screen F1/F4 buttons (physical F1-F4 are not
# bound in the app). Stop with stop.sh.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
WORK="${STUDIO_DIR:-/tmp/agentboy-docs-studio}"
DISPLAY_NUM="${STUDIO_DISPLAY:-:96}"

mkdir -p "$WORK/home" "$WORK/shots"

Xvfb "$DISPLAY_NUM" -screen 0 2700x1300x24 &
echo $! > "$WORK/xvfb.pid"
sleep 1

cd "$REPO"
DISPLAY="$DISPLAY_NUM" HOME="$WORK/home" SHELL="$HERE/demo-scene.sh" \
  npx electron --no-sandbox --disable-dev-shm-usage . \
  > "$WORK/electron.log" 2>&1 &
echo $! > "$WORK/electron.pid"

echo "display=$DISPLAY_NUM work=$WORK"
