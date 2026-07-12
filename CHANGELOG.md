# Changelog

All notable changes to AgentBoy are documented here.
This project adheres to [Semantic Versioning](https://semver.org/).

## [2.4.0] - 2026-07-12

A functionality/UX pass driven by a full audit. Fixes real bugs on the edges
of the terminal and the "last mile" of the agent flow; the core was already
sound.

### Fixed
- **Bare F-keys no longer stolen from full-screen TUIs.** F7/F10/F11/F12 drove
  chassis actions unconditionally, so htop/mc/nano/vim/lazygit inside agentboy
  could never receive them (F10 = quit in htop/mc). They now fire only at a
  normal shell prompt; while a TUI owns the alternate screen buffer the keys
  pass through to it. The same actions stay on the on-screen chassis buttons.
- **A background pane's shell dying no longer steals focus.** `closePane` only
  moves focus to a sibling when the pane that closed was the active one.
- **A crashed shell is no longer silent.** A non-zero exit surfaces the code
  (toast); the sole pane's crash leaves the terminal visible with a notice
  instead of instantly closing the window.
- **A failed spawn no longer leaves a dead, typeable pane** — a split pane is
  removed; the first pane shows a readable "shell failed to start" notice.
- **Alt+L / Alt+M** no longer swallowed while a full-screen TUI is active
  (they stay the LOOK/MODE shortcut at the shell prompt).
- **LED heuristic** now recognises aider-style `(Y)es/(N)o` / lettered prompts,
  and no longer lights on a `(y/n)` token that merely appears mid-sentence.
- Legacy `.retro-terminal.json` migration ignores a non-object file instead of
  spreading garbage into the new config.
- The approval **DIFF** button and the diff inspector show `git diff HEAD`
  (staged + unstaged vs the last commit) — the full picture, not just unstaged.

### Added
- **`y` / `n` keys answer the approval dialog** directly (alongside Enter = the
  focused YES, and Esc = NO).
- **"Merge splits into one"** context-menu action (wires up the previously
  dead `collapseToSingle`) — a one-click way back from an over-split layout.
- **Split guard**: refuses to split a pane that is already too small to stay
  usable, with a toast.
- **Double-click a split divider** resets it to an even 50/50; the divider grab
  target is wider (9px).
- **First-run hint** (once): points at the right-click menu and the `/help`
  overlay for controls.
- Help overlay documents the **Activity panel (Ctrl+Shift+L)** and the full
  copy/paste model (auto-copy on select, Ctrl/Shift+Insert, sanitised paste).
- The Activity panel notes that **restore keeps untracked files** (partial by
  design).
- A toast when a YES **auto-checkpoint could not be made** because the shell
  directory was unresolvable (previously silent).

### Docs
- README/site: correct the wear axis (adds **Glass**) and list all six CRT FX
  (Sweep / Noise / Chroma / Flicker / Vignette / Curve).

## [2.3.0] - 2026-07-12

### Fixed
- **Window drag/snap regression (post-2.1.5)**: a plain click on the chassis
  snapped the window into a grid third/sixth. A movement threshold now means
  only a genuine drag snaps — a click leaves the window put.
- **Drag no longer "chases" the cursor on X11**: the drag is rAF-throttled to
  one `setBounds` per frame instead of one per pointer-move.

### Added
- **Bare-chassis drag in every layout**, plus full-height left/right grab
  rails with a move cursor; window controls raised above the rails.
- **"Glass" wear stop**: scattered hairline cracks in the screen glass on any
  theme (`glassCracksSvg`). Dystopian's fixed corner crack is folded into it.
- **Four combinable CRT FX pills** alongside Sweep/Noise — **Chroma** (RGB
  fringe via an SVG channel-split filter), **Flicker**, **Vignette**, and
  **Curve** — stacking on any base tube mode and persisted. Vignette/Curve
  render on the `.crt` overlay plane so they sit above the opaque terminal text.

### Changed
- Chassis SVG painters extracted into `src/renderer/chassis-art.ts`.

## [2.2.6] - 2026-07-12

### Fixed
- **`npm install -g agentboy` was broken in 2.2.5**: the Electron 43 bump
  accidentally moved `electron` and `@electron/rebuild` from runtime
  dependencies to devDependencies, so the published package could neither
  launch nor rebuild `node-pty` on install. Both are runtime dependencies
  again (as in 2.2.0).

## [2.2.5] - 2026-07-11

The "stable shelf" release: the whole design arc (robo family, beige worn
variants, Fable Deck) lands in one version meant to sit still for a while.

### Added
- **Robo-Terminal and Robo-Grip shells.** Two rugged field-unit MODEs after
  Full: a brushed gunmetal body with machined vent ribs on the side rails and
  keys carved in as dark wells, and the Robo-Grip "Mk.III" brushed gunmetal with rubber
  side grips. Both share one `--robo-*`
  color system: the FRAME pick re-liveries them (teal/mint/magenta cyberpunk,
  titanium, olive…), and a vertical rail on the right edge prints the active
  pane's cwd.
- **Beige "worn plastic" versions of both robo shells.** TONE Light/Sepia
  flips them to aged putty plastic with grime patina: dark bakelite key wells
  on the ribbed body, engraved light metal caps on the Mk.III. All 10 FRAME
  liveries have tinted worn variants (terracotta, sage, pale aqua…), print
  contrast measured ≥3:1.
- **Fable Deck — Claude's own layout** (5th MODE stop): midnight-indigo
  lacquer with a brass inlay line and brass screen ring; TONE flips it to
  ivory enamel with walnut prints. All 12 F-keys in a 2×6 grid of bigger
  38×19 caps on a taller console, with full BOTTOM/EXPAND words. FRAME
  re-liveries the Deck like the robo shells (no livery = the authorial
  indigo+brass voice), and the freed headroom above the MODE cluster carries
  an engraved brass star chart.
- **Rust Bunker and Olive Drab themes** replace Grape GBC and Phosphor
  Invert (same theme slots, configs migrate cleanly).
- **WEAR works on every shell.** The worn/cracked grime moved to its own
  overlay plane above the chassis art, so the wear axis now composes with
  all five layouts (including the CSS-owned robo/Fable shells) and every
  FRAME/TONE combination.
- **Two new FRAME stops: Faded Red and Faded Orange** — sun-bleached pale
  siblings of the vivid pair. The vivid Red and Atomic Orange liveries are
  tone-proof: they stay fully saturated in Light/Sepia instead of washing
  to beige.
- **CRT FX: Sweep and Noise.** A new FX row in the LOOK menu with two
  independent extras that stack on any CRT mode except Off — a rolling
  retrace band and broadcast grain (`crtSweep`/`crtNoise` in the config).
  Coming back from CRT Off plays an old-tube turn-on flash, and the slot
  mask is visibly distinct from the shadow mask now.
- **SAVER is a toggle** — the same button/key that starts the screensaver
  stops it.
- **Slim shell.** A window narrower than a third of the screen sheds the
  toolbar and the top prints automatically — bare frame around the glass;
  window controls stay.
- **Quit confirmation moved next to the X** that summons it (top-right,
  overhanging the chassis top bar); approvals keep their bottom-center
  anti-spoofing spot.
- The cwd label in the screen's top-right corner prints straight on the
  glass (no backing plate) in slightly larger type.

### Changed
- **MODE is a round knurled gunmetal button** in the right cluster (26×26,
  no light on it — the only lamp on the chassis is the ACTION semaphore) and
  cycles Compact → Full → Robo-Terminal → Robo-Grip → Fable Deck.
- Full-mode key row starts flush with the screen's left edge; compact pills
  breathe at 14px with abbreviated captions (BOTT., EXP.).
- **Cassette shells are temporarily OUT of the MODE cycle** while their
  artwork is reworked (the plumbing stays; configs carrying a cassette
  layout fall back to Compact at boot).

### Fixed
- **Stray rib lines on the toolbar at odd window heights.** The ribbed robo
  pattern is now a rounded tile (`background-repeat: round`), so a whole
  number of ribs always fits the window and the rib phase at the bottom edge
  is identical at every size (was: the 1px highlight line could land across
  the F-key captions, e.g. with the window at one sixth of the screen — a 3×2 grid cell).
- **ACTION caption and unlit semaphore dots were invisible on all light
  shells** (the ACTION semaphore's `.gb-semafor` class was missing from the light caption group).

## [2.2.1] - 2026-07-10

> Never published on its own — everything below ships as part of 2.2.5
> (npm/GitHub go straight from 2.2.0 to 2.2.5).

### Added
- **Closing AgentBoy now asks for confirmation.** The toolbar **X** and the
  painted cassette X open an in-app dialog (same RPG style as approvals) that
  says how many terminal sessions will end; **NO is the focused default**,
  Esc cancels. Typing `exit` in the last pane still closes directly — that
  session already ended.

### Changed
- **Cassette shells moved from the FRAME axis to the MODE axis.** The MODE
  switch now cycles: Compact → Full 12 → Robo-Terminal → **Cassette v1 Light →
  Cassette v1 Dark → Cassette v2 Light → Cassette v2 Dark**. Each cassette mode
  carries its own fixed light/dark artwork (no longer tied to TONE). Old configs
  with `outerStyle: cassette1/2` migrate automatically at boot.
- FRAME (F2 / LOOK row) cycles 12 styles again — Cassette v1/v2 removed.
- **The bottom toolbar's right-hand cluster is identical in every shell mode**
  (compact / full / robo-terminal): MODE → ACTION lights → B/A → speaker,
  anchored right so narrow windows shrink the key row instead of clipping the
  cluster. All shell captions one size larger.
- **Thinner Cassette v1 bezels** — the live screen reaches the tape-rail
  panels, and the screen container paints the terminal background with the
  screen's corner radius (no more black corner dots).
- **The painted cassette controls now work** — fixed transparent zones mapped
  over the artwork in all three shapes (sixth / third / full), per design:
  **A** snaps back to the grid cell (sixth), **B** expands to the full-height
  column (third), **□** fills the work area and, pressed again, covers the
  toolbar (true fullscreen), **−** minimizes, **X** closes, **MODE** cycles to
  the next layout.
- **Alt+M** cycles the layout MODE from the keyboard (works everywhere,
  including inside the cassette shells).
- **All twelve painted F-keys are live** in both cassette designs. v1 uses the
  Full-layout order (TONE FRAME THM CRT CRT- CRT+ WEAR BARE SAVER FLOAT BOTTOM
  EXPAND); v2 honours its printed labels where real (LOOK BARE SAVER FLOAT
  BOTTOM EXPAND FRAME on F1–F7) and maps the fantasy keys to the remaining
  actions (F8 TONE, F9 THM, F10 CRT-, F11 CRT+, F12 CRT). Tooltips follow the
  active design.
- **Painted SYSTEM STATUS LEDs are wired to the ACTION semaphore**: green = agent
  output, yellow = typing (dim = idle), red = waiting for approval (pulses).
- **Corner globes open the default browser** (about:blank via the system
  handler).
- **The cassette frame is draggable**: grab the plastic anywhere outside the
  screen/keys to move the window; release snaps into the same 6/3/full grid
  slots as the other modes. FLOAT works from the painted key (v1 F10 / v2 F4)
  or the F11 keyboard key.
- **The live screen is rounded in cassette modes** so its corners no longer
  cut into the painted bezel (radius tracks window width).

### Changed (artwork)
- Top-bar label repainted on all 12 images: "CMATRIX OS v1.7" →
  **"CMATRIX SCREEN SAVER"** ("CASSETTE FUTURISM EDITION" stays).
- **Painted F-key captions repainted on all 12 images** so they spell the
  real functions the keys perform (v1: TONE…EXPAND, v2: LOOK…CRT) — the
  labels no longer lie.
- The smudged cassette remnants below the last reel hole on the side rails of
  the `third` shape were cleaned to plain chassis on both designs (light+dark).

### Fixed
- The 2.2.0 cassette **A zone was dead** (press flash only): it forwarded a
  `click()` to a button that listens for `pointerdown`. All zones now dispatch
  a real PointerEvent.

## [2.2.0] - 2026-07-09

### Added
- **Cassette-futurism shells (image-backed)**: Cassette v1 (Gemini art) and
  Cassette v2 (ChatGPT art), dark + light, on the FRAME axis; three
  pre-rendered shapes (sixth / third / full) picked by window aspect.
- Three new phosphor themes; muted light tone variants.

### Fixed
- Mecha reachable from the LOOK menu Frame row (was a dead Wear entry);
  hover states for F/A-B/MODE keys.

## [2.1.5] - 2026-07-09

### Changed
- Theme/CRT system rework (14 presets × dark/light/sepia, parametrized CRT via
  per-theme CSS variables) + terminal correctness fixes (selection readability,
  PTY leak on window close).

## [2.1.0] - 2026-07-08

### Added
- **LOOK appearance menu (Ctrl+L)** — a centered, bottom-half overlay for live
  styling with the terminal visible above. Rows: THEME · TONE · CRT · WEAR ·
  FRAME · DIVIDER. Arrow-key and stepper navigation; Esc to close.
  - CRT density now shows a 20-level meter with a numeric `N/20` readout.
  - FRAME / DIVIDER rows cycle the outer chassis and inner-divider styles
    (Default · Dark · Retro · White · Red · Phosphor · Cyberpunk · Ocean).
- **Full-12 chassis layout** — MODE toggles between a simplified 6-button layout
  and a full 12-button layout (F1–F4 · F5–F8 · F9–F12, three groups of four),
  at the same compact button size.
  - F2 **FRAME** cycles the chassis frame style; F3 **THM** cycles themes with a
    single button (right-click reverses both). The chassis-hide button is now
    labelled **BARE** to free the FRAME name.
- **Git checkpoint safety** — OSC 98 saves a `git` checkpoint; restore is gated
  behind a native confirmation dialog that reports how many files would change,
  and auto-stashes dirty state before `reset --hard` so nothing is lost.

### Changed
- Selection/hover now stays legible on dark, light, and sepia themes — a
  readability veil is layered above the CRT/vignette overlays so selected text
  no longer disappears.
- Contrast across all 24 theme variants clamped to WCAG AA (≥4.5:1).
- Wear textures (worn scratches, cracks, mecha panels) now scale uniformly
  (`preserveAspectRatio: slice`) instead of stretching, so edges and rivets keep
  their shape when the window is resized in float mode.
- Help overlay rewritten to document the LOOK menu, the 6/12 MODE layouts,
  and the checkpoint behaviour.

### Fixed
- Checkpoint restore no longer discards uncommitted work (auto-stash on dirty).
- `saveCheckpoint` no longer commits pre-staged files (e.g. an accidentally
  `git add`-ed secret) — it re-stages only tracked changes with `git add -u`.
- Removed dead chassis-button code paths and stale style cycles.

## [2.0.3] - 2026-07-07

- E2E test suite (Xvfb + CDP), antagonistic-review fixes (OSC 99 LED, F7/F10
  key handlers, approval race, per-glyph success chime).

---

The 0.x/1.x history predates the public repository.
