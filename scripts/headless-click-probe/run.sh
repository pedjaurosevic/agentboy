#!/bin/bash
# Launch agentboy on a private Xvfb display with the mock choice TUI as the
# shell, so synthetic xdotool clicks can probe xterm's click->cell mapping
# without touching the user's live desktop. Leaves the app running; stop with
# scripts/headless-click-probe/stop.sh.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
WORK="${CLICKPROBE_DIR:-/tmp/agentboy-click-probe}"
DISPLAY_NUM="${CLICKPROBE_DISPLAY:-:97}"

mkdir -p "$WORK/home"
rm -f "$WORK/clicks.log"

export CLICKLOG="$WORK/clicks.log"

Xvfb "$DISPLAY_NUM" -screen 0 1280x960x24 &
echo $! > "$WORK/xvfb.pid"
sleep 1

cd "$REPO"
DISPLAY="$DISPLAY_NUM" HOME="$WORK/home" SHELL="$HERE/mock-choice-tui.py" \
  npx electron --no-sandbox --disable-dev-shm-usage . \
  > "$WORK/electron.log" 2>&1 &
echo $! > "$WORK/electron.pid"

echo "display=$DISPLAY_NUM work=$WORK"
