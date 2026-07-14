#!/bin/bash
# Static demo scene for docs screenshots: a colorful fake AI pair-programming
# exchange, then keep the PTY alive so the cursor blinks after the prompt.
# When invoked with arguments (e.g. as "$SHELL -c cmatrix" by the screensaver
# overlay), behave like a real shell instead of drawing the scene.
if [ $# -gt 0 ]; then exec /bin/bash "$@"; fi
clear
B=$'\e[1m'; D=$'\e[2m'; R=$'\e[0m'
CY=$'\e[36m'; GR=$'\e[32m'; RD=$'\e[31m'; YL=$'\e[33m'
# Claude Code echoes the user's typed prompt in brightWhite (SGR 97)
W=$'\e[97m'
printf '%s\n' \
"${B}\$ git log --oneline -3${R}" \
"${YL}9d7c4af${R} Add retry budget metrics" \
"${YL}42bc1e8${R} Harden request cancellation" \
"${YL}f83b3e0${R} Cover timeout edge cases" \
"" \
"${B}\$ claude${R}" \
"${W}❯ fix the flaky retry backoff test${R}" \
"" \
"${CY}●${R} ${B}Read${R}${D}(tests/test_retry.py)${R}" \
"  ${D}└─ 58 lines${R}" \
"${CY}●${R} ${B}Edit${R}${D}(src/retry.py)${R}" \
"  ${RD}-  delay = base * 2 ** attempt${R}" \
"  ${GR}+  delay = min(max_delay, base * 2 ** attempt)${R}" \
"  ${GR}+  return add_jitter(delay, rng)${R}" \
"${CY}●${R} ${B}Bash${R}${D}(pytest -q tests/test_retry.py)${R}" \
"  ${GR}✔ 6 passed${R} ${D}in 0.24s${R}" \
"" \
"${GR}●${R} Done — retries are capped and deterministic in tests${R}"
printf "\n${B}\$ ${R}"
# When the marker file exists, fire an OSC 98 approval request so the RPG
# permission dialog can be photographed.
if [ -f "${STUDIO_DIR:-/tmp/agentboy-docs-studio}/osc98" ]; then
  sleep 1
  printf '\e]98;prompt=Agent wants to run: git push origin main\a'
fi
# Hand off to a promptless bash so commands typed into the PTY still work —
# the screensaver overlay relies on this (it types "exec cmatrix" into $SHELL).
PS1='' exec /bin/bash --noprofile --norc
