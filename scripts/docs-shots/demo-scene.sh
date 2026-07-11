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
"${YL}80f5f2a${R} Copy-on-select to real clipboard" \
"${YL}427c88f${R} Keyboard F12 for BOTTOM" \
"${YL}f83b3e0${R} Backdrop-invert selection" \
"" \
"${B}\$ claude${R}" \
"${W}❯ fix the failing slugify test${R}" \
"" \
"${CY}●${R} ${B}Read${R}${D}(tests/test_utils.py)${R}" \
"  ${D}└─ 42 lines${R}" \
"${CY}●${R} ${B}Edit${R}${D}(src/utils.py)${R}" \
"  ${RD}-  return text.lower().replace(\" \", \"-\")${R}" \
"  ${GR}+  text = normalize(\"NFKD\", text)${R}" \
"  ${GR}+  return ascii_fold(text).lower().replace(\" \", \"-\")${R}" \
"${CY}●${R} ${B}Bash${R}${D}(pytest -q tests/test_utils.py)${R}" \
"  ${GR}✔ 5 passed${R} ${D}in 0.31s${R}" \
"" \
"${GR}●${R} Done — slugify now handles ${B}\"Čačak\" → \"cacak\"${R}"
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
