// The in-app help / landing overlay content, as data. Kept here (not inline
// HTML) so it stays the single source of truth for the controls reference and
// can be unit-tested for coverage (every chassis button F1–F12 present).
export interface HelpItem {
  key: string;
  label: string;
  desc: string;
}
export interface HelpSection {
  title: string;
  items: HelpItem[];
}

export const HELP_TAGLINE =
  "A retro handheld-console terminal for pair programming with AI agents.";

export const HELP_SECTIONS: HelpSection[] = [
  {
    title: "Appearance — the LOOK menu (Alt+L)",
    items: [
      { key: "LOOK", label: "Alt+L or the LOOK button", desc: "Opens the appearance menu in the lower half of the screen; the terminal stays live above it so you see each change on real text as you make it." },
      { key: "Theme", label: "14 presets", desc: "Agentboy DMG, Monochrome E-Ink, Charcoal, G-Shock Red, Dystopian, Phosphor, Cyberpunk, Sapphire, Atomic Orange, Rust Bunker, Vintage Hi-Fi, Olive Drab, Phosphor Red, Phosphor Amber — pick with ◀ ▶." },
      { key: "Tone", label: "Dark / Light / Sepia", desc: "Each theme in a dark, a paper-light, or a warm sepia tone. Contrast is auto-clamped to stay readable in every tone." },
      { key: "CRT", label: "Mode + 20 levels", desc: "Shadow Mask → Aperture Grille → Slot Mask → Glass → Full → Scanlines → Vector Glow → Off, with a 20-step intensity meter (− / +)." },
      { key: "FX", label: "Sweep / Noise", desc: "Independent CRT extras that STACK on any mode except Off: Sweep rolls a soft retrace band down the tube; Noise adds broadcast grain. Combine freely — mode picks the mask, FX picks the life." },
      { key: "Wear", label: "New / Worn / Cracked", desc: "Chassis finish: pristine, grimy, or cracked plastic." },
    ],
  },
  {
    title: "Chassis buttons — MODE cycles the layouts",
    items: [
      { key: "MODE", label: "Layout cycle", desc: "The big knurled gunmetal button at the head of the right cluster (same spot and same look in every mode; nothing on it lights — the only lamp is the ACTION semaphore) cycles the layout: Compact (LOOK + 5 window keys) → Full (all 12 keys) → Robo-Terminal (brushed gunmetal, vent-ribbed rails) → Robo-Grip (brushed metal + side grips) → Fable Deck (Claude's own: midnight lacquer + brass, 12 bigger keys in two rows). The robo shells AND the Fable Deck recolor with the FRAME chassis pick, and TONE Light/Sepia flips them to worn-beige / ivory bodies (FRAME then tints those — except vivid Red and Atomic Orange, which stay fully saturated in every tone; their washed looks are the separate Faded Red / Faded Orange stops). Alt+M does the same from the keyboard. The F1–F12 labels mark each key's position, like SELECT/START on a real handheld — they are not literal keyboard keys (see Keyboard shortcuts for the wired ones)." },
      { key: "F1", label: "TONE", desc: "Full layout: cycle Dark → Light → Sepia (same as the LOOK Tone row)." },
      { key: "F2", label: "FRAME", desc: "Cycle the chassis frame style (Default → Dark → Retro → White → Red → Faded Red → Phosphor → Cyberpunk → Ocean → Mecha → Atomic Orange → Faded Orange → Grape GBC → Woodgrain). Red/Orange come in two strengths: vivid (terminal-ink hue) and faded. Right-click reverses. Same as the LOOK Frame row." },
      { key: "F3", label: "THM", desc: "Cycle the theme preset (1–14). Right-click reverses." },
      { key: "F4", label: "CRT", desc: "Cycle CRT mode (Shadow Mask → … → Off). Coming back from Off plays the old-tube turn-on flash. The LOOK menu FX row adds Sweep (rolling retrace band) and Noise (broadcast grain) — independent toggles that stack on any CRT mode except Off." },
      { key: "F5", label: "CRT−", desc: "CRT intensity down (20 levels)." },
      { key: "F6", label: "CRT+", desc: "CRT intensity up (20 levels)." },
      { key: "F7", label: "WEAR", desc: "Cycle New → Worn → Cracked. (This is the button at position F7; the physical F7 key is CRT intensity up — see Keyboard shortcuts.)" },
      { key: "F8", label: "BARE", desc: "Hide the chassis — bare terminal. Right-click, or the same key again, brings it back. (Compact: F2.)" },
      { key: "F9", label: "SAVER", desc: "cmatrix screensaver — the same key/button toggles it off; any key or click exits too. (Compact: F3.)" },
      { key: "F10", label: "FLOAT", desc: "Free-floating window: leave the 3×2 snap grid, resize freely. This is a chassis button (position F10); the wired float key is F11 — see Keyboard shortcuts." },
      { key: "F11", label: "BOTTOM", desc: "Scroll the active pane to the bottom, like Ctrl+End. This is a chassis button (position F11); the wired scroll-to-bottom key is F12 — see Keyboard shortcuts." },
      { key: "F12", label: "EXPAND", desc: "With the tall column (B) active, expand over the toolbar and back. This is a chassis button (position F12); it has no wired key — use the button." },
    ],
  },
  {
    title: "MODE · ACTION LED · A / B · SOUND",
    items: [
      { key: "LED", label: "Status light", desc: "Dim yellow idle · bright yellow you typing · green agent output · red waiting on you (approval, or a menu / y-n question)." },
      { key: "B", label: "MAX", desc: "Expand into a full-height column." },
      { key: "A", label: "MIN", desc: "Snap back into the 3×2 grid." },
      { key: "♪", label: "SOUND", desc: "The single speaker by A toggles all sound at once — the built-in tune (Phosphor Drift) and the effects together." },
    ],
  },
  {
    title: "Keyboard shortcuts",
    items: [
      { key: "Alt+L", label: "LOOK menu", desc: "Open / close the appearance menu (Esc also closes)." },
      { key: "Alt+M", label: "MODE cycle", desc: "Cycle the layout mode — works everywhere." },
      { key: "Ctrl+L", label: "Clear screen", desc: "Passes through to the shell to clear the screen, as in any terminal." },
      { key: "F7 / F10 / F11 / F12", label: "Wired keys", desc: "The physical function keys that act: F7 CRT intensity up, F10 screensaver toggle, F11 float, F12 scroll to bottom. The rest of the F-labels are decorative position markers." },
      { key: "Ctrl+Shift+E / O", label: "Split", desc: "Split the pane vertically / horizontally." },
      { key: "Ctrl+Shift+C / V", label: "Copy / paste", desc: "Selecting text already copies it; middle-click pastes the X11 selection." },
      { key: "Ctrl+Shift+F", label: "Search", desc: "Search in the active pane (Esc closes)." },
      { key: "Ctrl+Shift+A / X", label: "Select all / clear", desc: "Act on the active pane." },
      { key: "Ctrl +/−/0", label: "Font zoom", desc: "Zoom in / out / reset (also Ctrl + mouse wheel)." },
      { key: "Ctrl+D / exit", label: "Close pane", desc: "End the shell and close the active pane." },
    ],
  },
  {
    title: "For AI agents",
    items: [
      { key: "OSC 98", label: "Approval", desc: "printf '\\033]98;prompt=<question>\\007' opens the approval dialog; YES git-checkpoints the pane's repo (tracked files only) and answers y. Restore any checkpoint from the Activity panel — it asks for a native confirmation first." },
      { key: "OSC 99", label: "LED", desc: "printf '\\033]99;led=<state>\\007' drives the ACTION light (idle/user/agent/needs-user)." },
    ],
  },
];

export const HELP_FOOTER = "pedjaurosevic.github.io/agentboy";
