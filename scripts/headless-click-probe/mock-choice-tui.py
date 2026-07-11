#!/usr/bin/env python3
# Mock agent-CLI choice prompt for headless mouse-mapping tests.
#
# Draws a row ruler plus a Claude-Code-style numbered option block, enables
# SGR mouse reporting, then for every button press draws an inverse "X" marker
# at the exact cell xterm reported. A screenshot after clicking shows whether
# the reported cell matches where the pointer actually was. All events are
# also appended to $CLICKLOG for quantitative analysis.

import os
import re
import shutil
import sys
import termios
import tty

LOG = os.environ.get("CLICKLOG", "/tmp/clicks.log")


def log(line: str) -> None:
    with open(LOG, "a") as f:
        f.write(line + "\n")


def main() -> None:
    out = sys.stdout
    cols, rows = shutil.get_terminal_size()

    out.write("\x1b[2J\x1b[H\x1b[?25l")
    for r in range(1, rows + 1):
        out.write(f"\x1b[{r};1H\x1b[2m{r:3d}\x1b[0m")

    # option block near the bottom, like a real agent CLI approval prompt
    base = max(5, rows - 7)
    options = [
        "1. Yes",
        "2. Yes, allow all edits during this session",
        "3. No, and tell Claude what to do differently",
    ]
    out.write(f"\x1b[{base - 2};7H\x1b[1mDo you want to make this edit?\x1b[0m")
    for i, opt in enumerate(options):
        prefix = "❯ " if i == 0 else "  "
        out.write(f"\x1b[{base + i};7H{prefix}{opt}")
    out.write(f"\x1b[{rows};1H")
    out.flush()
    log(f"LAYOUT rows={rows} cols={cols} option_rows={base},{base + 1},{base + 2}")

    out.write("\x1b[?1002h\x1b[?1006h")
    out.flush()

    fd = sys.stdin.fileno()
    old = termios.tcgetattr(fd)
    tty.setraw(fd)
    buf = b""
    seq = re.compile(rb"\x1b\[<(\d+);(\d+);(\d+)([Mm])")
    try:
        while True:
            chunk = os.read(fd, 1024)
            if not chunk:
                break
            buf += chunk
            while True:
                m = seq.search(buf)
                if not m:
                    break
                btn, x, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
                kind = "press" if m.group(4) == b"M" else "release"
                log(f"MOUSE btn={btn} col={x} row={y} {kind}")
                if kind == "press" and btn == 0:
                    out.write(f"\x1b[{y};{x}H\x1b[7mX\x1b[0m")
                    out.flush()
                buf = buf[m.end():]
            if b"q" in chunk:
                return
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old)
        out.write("\x1b[?1002l\x1b[?1006l\x1b[?25h")
        out.flush()


if __name__ == "__main__":
    main()
