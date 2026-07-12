// Entry for the terminal window. Builds the Game Boy chassis and a Terminator-
// style tree of split panes, each running its own real PTY in xterm.
//
// Per-pane features: scrollback, clipboard (CLIPBOARD + X11 PRIMARY), middle-
// click paste, clickable URLs, search, font zoom. Right-click a pane to split
// it horizontally / vertically or close it.

import { Terminal, type ITheme } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import "@xterm/xterm/css/xterm.css";
import { api, Rect, ScreenInfo } from "./terminal-api";
import { THEME_PRESETS } from "./themes";
import { deriveSepia, enforceReadability, withUserEcho } from "./color";
import { makeSgrDimFilter } from "./sgr-filter";
import { sanitizePasteText } from "./paste";
import { looksLikeChoicePrompt } from "./led-heuristics";
import { formatApprovalOrigin } from "./approval-origin";
import {
  wornSvg, crackSvg, glassCracksSvg, mechaPanelsSvg, orangePcbSvg, grapePcbSvg, woodgrainSvg,
  MECHA_METAL_DARK, MECHA_METAL_LIGHT,
} from "./chassis-art";
import { HELP_SECTIONS, HELP_TAGLINE, HELP_FOOTER } from "./help-content";
import { ActivityEvent, pushActivity, formatActivity } from "./activity-log";
import { containsPoint, distanceToRect, nearestColumn, rowFor, gridRectFor } from "./grid";
import {
  playAMelody,
  playBMelody,
  playSelectSound,
  playStartSound,
  playDpadBlip,
  playSuccessTone,
  playErrorTone,
  setMuted,
  isMuted,
  toggleMusic,
  playTypeTick,
} from "./audio";

const BASE_FONT = 14; // ~10% larger than the original 13
const SEARCH_OPTS = {
  decorations: {
    matchOverviewRuler: "#98b86c",
    activeMatchColorOverviewRuler: "#9dbad0",
  },
};

interface Pane {
  el: HTMLElement;
  term: Terminal;
  fit: FitAddon;
  search: SearchAddon;
  ptyId: number;
  disposed: boolean;
  unsubs: Array<() => void>;
  pointerInside?: boolean;
  blurRefocusTimer?: number;
}

async function main() {
  let currentPresetId = 8;
  // Tone axis (dark / light / sepia). Encoded as two flags so the existing
  // `currentIsLight` chrome logic keeps working untouched: sepia is a light-ish
  // tone (light chassis) whose screen palette comes from deriveSepia(). The
  // single source of truth for the tone value is toneOf() below.
  let currentIsLight = false;
  let sepiaOn = false;
  let fontSize = BASE_FONT;
  let config: Awaited<ReturnType<typeof api.configGet>> = {};
  try {
    config = await api.configGet();
  } catch (err) {
    console.warn("Falling back to default terminal config because config:get failed.", err);
  }
  if (config.theme) currentPresetId = config.theme;
  // Migrate legacy boolean `light` → tone; `tone` wins when present.
  const initTone: "dark" | "light" | "sepia" =
    config.tone === "light" || config.tone === "sepia" || config.tone === "dark"
      ? config.tone
      : config.light
        ? "light"
        : "dark";
  currentIsLight = initTone !== "dark";
  sepiaOn = initTone === "sepia";
  if (config.fontSize) fontSize = config.fontSize;
  const osc98Mode: "on" | "led-only" | "off" =
    config.osc98 === "off" || config.osc98 === "led-only" ? config.osc98 : "on";
  const screen: ScreenInfo = await api.getScreen();
  const root = document.getElementById("term-root")!;
  root.innerHTML = `
    <div class="gb eink-color">
      <div class="gb-wear" aria-hidden="true"></div>
      <div class="gb-top">
        <span class="gb-title"><span class="gb-wordmark">AGENTB&Oslash;Y</span><span class="gb-subtitle" role="button" title="Show controls &amp; help">&#9656; agentboy /help</span></span>
        <span class="gb-dotmatrix">
          <span class="gb-stripes"><i></i><i></i></span>
          <span class="gb-dotmatrix-text">CMATRIX USED FOR SCREENSAVER</span>
        </span>
        <div class="gb-window-controls">
          <button class="gb-min" title="Minimize">&#8722;</button>
          <button class="gb-full" title="Fullscreen">&#9633;</button>
          <button class="gb-close" title="Close terminal">&#10005;</button>
        </div>
      </div>
      <div class="gb-middle">
        <div class="gb-screen">
          <div id="panes"></div>
          <span class="gb-screen-path" aria-hidden="true"></span>
          <div class="gb-search" hidden>
            <input class="gb-search-input" type="text" placeholder="search&#8230;" spellcheck="false" />
            <button class="gb-search-prev" title="Previous (Shift+Enter)">&#9650;</button>
            <button class="gb-search-next" title="Next (Enter)">&#9660;</button>
            <button class="gb-search-x" title="Close (Esc)">&#10005;</button>
          </div>
          <div class="gb-diff" hidden>
            <div class="gb-diff-header">
              <span>Diff Inspector</span>
              <button class="gb-diff-close" title="Close">&#10005;</button>
            </div>
            <pre class="gb-diff-content"></pre>
            <div class="gb-diff-actions">
              <button class="gb-diff-refresh">Run git diff</button>
            </div>
          </div>
          <div class="gb-help" hidden>
            <div class="gb-help-header">
              <span class="gb-help-title">AGENTB&Oslash;Y</span>
              <span class="gb-help-cmd">agentboy /help</span>
              <button class="gb-help-close" title="Close (Esc)">&#10005;</button>
            </div>
            <div class="gb-help-body"></div>
            <div class="gb-help-footer"></div>
          </div>
          <div class="gb-help gb-activity" hidden>
            <div class="gb-help-header">
              <span class="gb-help-title">AGENTB&Oslash;Y</span>
              <span class="gb-help-cmd">activity &amp; checkpoints</span>
              <button class="gb-activity-close" title="Close (Esc)">&#10005;</button>
            </div>
            <div class="gb-help-body gb-activity-body"></div>
            <div class="gb-help-footer">Ctrl+Shift+L toggles this &middot; select a checkpoint below to restore</div>
          </div>
        </div>
      </div>
      <button class="gb-cass-a-zone" title="A — snap back to grid size (sixth)" aria-label="A"></button>
      <button class="gb-cass-zone gb-cass-b-zone" title="B — full-height column (third)" aria-label="B"></button>
      <button class="gb-cass-zone gb-cass-mode-zone" title="MODE — switch layout mode" aria-label="MODE"></button>
      <button class="gb-cass-zone gb-cass-min-zone" title="Minimize" aria-label="Minimize"></button>
      <button class="gb-cass-zone gb-cass-full-zone" title="Full screen — click again to cover the toolbar" aria-label="Full screen"></button>
      <button class="gb-cass-zone gb-cass-close-zone" title="Close" aria-label="Close"></button>
      ${Array.from({ length: 12 }, (_, i) =>
        `<button class="gb-cass-zone gb-cass-f-zone" data-cf="${i + 1}" aria-label="F${i + 1}"></button>`).join("")}
      <button class="gb-cass-zone gb-cass-globe-zone" data-side="left" title="Open browser" aria-label="Open browser"></button>
      <button class="gb-cass-zone gb-cass-globe-zone" data-side="right" title="Open browser" aria-label="Open browser"></button>
      <span class="gb-cass-led gb-cass-led-green"></span>
      <span class="gb-cass-led gb-cass-led-yellow"></span>
      <span class="gb-cass-led gb-cass-led-red"></span>
      <div class="gb-bottom">
        <div class="gb-ss-groups">
          <button class="gb-ss-btn gb-look-btn" data-fn="look" title="Open the LOOK menu: theme, tone, CRT, wear (Alt+L)" aria-label="F1" data-label="LOOK"></button>
          <div class="gb-ss-wrap gb-ss-keys">
            <button class="gb-ss-btn appear-key" data-fn="tone" title="Tone: dark / light / sepia (right-click reverses)" aria-label="F1" data-label="TONE"></button>
            <button class="gb-ss-btn appear-key" data-fn="frame" title="Frame: cycle chassis style (right-click reverses)" aria-label="F2" data-label="FRAME"></button>
            <button class="gb-ss-btn appear-key" data-fn="thm" title="Theme: cycle themes (right-click reverses)" aria-label="F3" data-label="THM"></button>
            <button class="gb-ss-btn appear-key" data-fn="crt" title="CRT effect (right-click reverses)" aria-label="F4" data-label="CRT"></button>
            <button class="gb-ss-btn appear-key group-start" data-fn="crt-" title="CRT intensity -" aria-label="F5" data-label="CRT-"></button>
            <button class="gb-ss-btn appear-key" data-fn="crt+" title="CRT intensity +" aria-label="F6" data-label="CRT+"></button>
            <button class="gb-ss-btn appear-key" data-fn="wear" title="Wear: new / worn / cracked / glass (right-click reverses). Mecha lives on the Frame axis." aria-label="F7" data-label="WEAR"></button>
            <button class="gb-ss-btn win-key" data-fn="noframe" data-fc="F2" data-ff="F8" title="Bare: hide the chassis - bare terminal" aria-label="F2" data-label="BARE"></button>
            <button class="gb-ss-btn win-key group-start" data-fn="saver" data-fc="F3" data-ff="F9" title="cmatrix screensaver (toggles; any key exits too)" aria-label="F3" data-label="SAVER"></button>
            <button class="gb-ss-btn win-key" data-fn="float" data-fc="F4" data-ff="F10" title="Float mode" aria-label="F4" data-label="FLOAT"></button>
            <button class="gb-ss-btn win-key" data-fn="bottom" data-fc="F5" data-ff="F11" title="Scroll the active pane to the bottom (like Ctrl+End)" aria-label="F5" data-label="BOTTOM" data-label-c="BOTT."></button>
            <button class="gb-ss-btn win-key" data-fn="ext" data-fc="F6" data-ff="F12" title="Expand tall column over the toolbar" aria-label="F6" data-label="EXPAND" data-label-c="EXP."></button>
          </div>
        </div>
        <div class="gb-controls-cluster">
          <button class="gb-mode-switch" data-label="MODE" title="Cycle the layout: Compact &rarr; Full &rarr; Robo-Terminal &rarr; Robo-Grip &rarr; Fable Deck" aria-label="Toggle button layout"></button>
          <span class="gb-semafor" data-label="ACTION" title="Status: green agent output, yellow user typing, red waiting for approval">
            <i class="gb-signal-green"></i>
            <i class="gb-signal-yellow"></i>
            <i class="gb-signal-red"></i>
          </span>
          <div class="gb-ab-wrap">
            <button class="gb-ab-btn b" data-fn="max" title="Expand to full-height column" data-label="MAX">B</button>
            <button class="gb-ab-btn a" data-fn="min" title="Snap back to grid size" data-label="MIN">A</button>
          </div>
          <div class="gb-speakers">
            <div class="gb-speaker gb-speaker-music" role="button" aria-label="Toggle sound"></div>
          </div>
        </div>
      </div>
      <div class="gb-dialog" hidden>
        <div class="gb-dialog-box">
          <div class="gb-dialog-badge">&#9888; AGENTB&Oslash;Y &middot; APPROVAL</div>
          <div class="gb-dialog-text">Run command?</div>
          <div class="gb-dialog-origin"></div>
          <div class="gb-dialog-options">
            <button class="gb-dialog-btn yes">YES</button>
            <button class="gb-dialog-btn no">NO</button>
            <button class="gb-dialog-btn diff">DIFF</button>
          </div>
        </div>
      </div>
      <div class="gb-confirm" hidden>
        <div class="gb-dialog-box">
          <div class="gb-dialog-badge">&#9888; AGENTB&Oslash;Y &middot; CLOSE</div>
          <div class="gb-dialog-text">Close AgentBoy?</div>
          <div class="gb-dialog-origin"></div>
          <div class="gb-dialog-options">
            <button class="gb-dialog-btn yes">YES</button>
            <button class="gb-dialog-btn no">NO</button>
          </div>
        </div>
      </div>
    </div>`;
  const gb = root.querySelector(".gb") as HTMLElement;
  const panesRoot = gb.querySelector("#panes") as HTMLElement;
  const gbScreen = gb.querySelector(".gb-screen") as HTMLElement;
  const screenCrt = document.createElement("div");
  screenCrt.className = "crt screen-crt";
  gbScreen.appendChild(screenCrt);
  const crack = document.createElement("div");
  crack.className = "gb-crack";
  gbScreen.appendChild(crack);

  // Off-screen SVG filter for the CHROMA CRT-FX pill: splits the picture into
  // a red-shifted and a cyan-shifted copy (misconverged-tube RGB fringe).
  // Referenced by `.gb-term { filter: url(#crt-chroma-filter) }` when the pill
  // is on. Defined once, globally.
  const chromaDefs = document.createElement("div");
  chromaDefs.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
  chromaDefs.setAttribute("aria-hidden", "true");
  chromaDefs.innerHTML =
    `<svg xmlns="http://www.w3.org/2000/svg"><defs>` +
    `<filter id="crt-chroma-filter" x="-2%" y="-2%" width="104%" height="104%" color-interpolation-filters="sRGB">` +
    `<feColorMatrix in="SourceGraphic" type="matrix" ` +
    `values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="r"/>` +
    `<feOffset in="r" dx="1.4" dy="0" result="ro"/>` +
    `<feColorMatrix in="SourceGraphic" type="matrix" ` +
    `values="0 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0" result="c"/>` +
    `<feOffset in="c" dx="-1.4" dy="0" result="co"/>` +
    `<feBlend in="ro" in2="co" mode="screen"/>` +
    `</filter></defs></svg>`;
  document.body.appendChild(chromaDefs);

  const panes = new Map<HTMLElement, Pane>();

  // active terminal palette; new panes inherit it and Select/Start switch it live
  const getInitialTheme = () => {
    const preset = THEME_PRESETS[currentPresetId - 1] || THEME_PRESETS[0];
    const variant = sepiaOn ? deriveSepia(preset.light) : currentIsLight ? preset.light : preset.dark;
    const ex = withUserEcho(enforceReadability(variant.xterm));
    return { ...ex, ...selectionTheme(ex) };
  };
  // Selection = dark glyphs (selectionForeground = the theme background) under a
  // strong light CSS veil (.xterm-selection, styles.css) that sits ABOVE the
  // CRT/vignette overlays. xterm's own selection fill is neutralised to the
  // background colour so it can't add a second, overlay-darkened band beneath;
  // the veil alone carries the highlight, giving a crisp black-on-light
  // selection on every theme. (The earlier weak 0.24 veil over xterm's own
  // light band was darkened by the overlays to a muddy, hard-to-read grey.)
  const selectionTheme = (ex: { background: string }) => ({
    selectionBackground: ex.background,
    selectionForeground: ex.background,
    selectionInactiveBackground: ex.background,
  });
  let currentTheme: ITheme = getInitialTheme();
  // Appearance state below (worn/frame/divider/CRT) is restored from
  // ~/.agentboy.json here and persisted back via persistState() on change.
  const CHASSIS_VALUES = [
    'dark', 'retro', 'white', 'red', 'red-pale', 'phosphor', 'cyberpunk',
    'ocean', 'mecha', 'orange', 'orange-pale', 'grape', 'wood',
  ] as const;
  type ChassisStyle = (typeof CHASSIS_VALUES)[number];
  const cfgChassis = (v: unknown): ChassisStyle | null =>
    CHASSIS_VALUES.includes(v as ChassisStyle) ? (v as ChassisStyle) : null;
  let outerStyleOverride: ChassisStyle | null = cfgChassis(config.outerStyle);
  if ((config.wear as unknown) === "mecha" && !outerStyleOverride) {
    outerStyleOverride = "mecha";
  }
  // Wear axis (new → worn → cracked). wornOn (the grime-overlay flag)
  // is DERIVED: worn and cracked both carry the scratch/grime layer; cracked
  // adds fractures; new is pristine.
  const WEAR_LEVELS = ["new", "worn", "cracked", "glass"] as const;
  type WearLevel = (typeof WEAR_LEVELS)[number];
  let wearLevel: WearLevel = "new";
  if (config.wear && (config.wear as unknown) !== "mecha" && WEAR_LEVELS.includes(config.wear as WearLevel)) {
    wearLevel = config.wear as WearLevel;
  } else if (config.worn === true) {
    wearLevel = "worn";
  }
  let wornOn = wearLevel === "worn" || wearLevel === "cracked";
  // The cassette shells (v1/v2 image-backed MODEs) are temporarily OUT of the
  // MODE cycle while the artwork is reworked; the plumbing below stays so they
  // can come back. Configs that still carry a cassette layout — or a ≤2.2.0
  // cassette outerStyle — fall back to compact here.
  const LAYOUTS = ["compact", "full", "roboterminal", "robogrip", "fable"] as const;
  type LayoutMode = (typeof LAYOUTS)[number];
  let layout: LayoutMode = LAYOUTS.includes(config.layout as LayoutMode)
    ? (config.layout as LayoutMode)
    : "compact";
  const isCassetteLayout = () => layout.startsWith("cassette");
  // Robo shells own their chassis paint in CSS (like the cassette photos):
  // the theme/outerStyle inline painting must stand down while one is active.
  const isRoboLayout = () => layout.startsWith("robo");
  // Fable Deck (Claude's own layout) is CSS-owned like the robo shells.
  const isFableLayout = () => layout === "fable";
  let innerStyleOverride: ChassisStyle | null = cfgChassis(config.innerStyle);
  const CRT_STEPS = 20;
  // "mask" = shadow mask: scanlines + RGB triads + bloom + flicker + drift,
  // "grille" = aperture grille: vertical RGB stripes + damper wires,
  // "slot" = slot mask: RGB stripes broken into slots, light flicker,
  // "glass" = curved glass only: sheen + bulge highlights + glow + bloom,
  // "full" = the whole tube: shadow-mask pattern UNDER the curved glass,
  // "off" = no overlay (bare screen-glass hint).
  type CrtMode = "mask" | "grille" | "slot" | "glass" | "full" | "scanlines" | "vector" | "off";
  const CRT_MODES: CrtMode[] = ["mask", "grille", "slot", "glass", "full", "scanlines", "vector", "off"];
  // Combinable CRT FX pills (stack on any base mode, unlike the exclusive modes).
  type CrtFx = "sweep" | "noise" | "chroma" | "flicker" | "vignette" | "bulge";
  let crtMode: CrtMode = CRT_MODES.includes(config.crtMode as CrtMode)
    ? (config.crtMode as CrtMode)
    : "mask";
  let crtDensityIndex =
    typeof config.crtIntensity === "number"
      ? Math.max(0, Math.min(CRT_STEPS - 1, Math.round(config.crtIntensity)))
      : 5;
  // Combinable CRT FX (Peđa 2026-07-11): independent toggles that stack on
  // ANY base CRT mode — sweep = rolling retrace band, noise = broadcast grain,
  // chroma = RGB fringe, flicker = brightness flutter, vignette = corner
  // falloff, curve = glass-dome edge shading. Live in the LOOK menu FX row;
  // F4 keeps cycling the base modes.
  let crtSweep = config.crtSweep === true;
  let crtNoiseFx = config.crtNoise === true;
  let crtChroma = config.crtChroma === true;
  let crtFlickerFx = config.crtFlicker === true;
  let crtVignetteFx = config.crtVignette === true;
  let crtBulgeFx = config.crtBulge === true;

  // Debounced (F3/F4 get clicked in bursts). saveConfig in main merges the
  // patch into the file, so fields not managed here (shell, border) survive.
  let persistTimer: number | undefined;
  const persistState = () => {
    if (persistTimer) window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(() => {
      persistTimer = undefined;
      void api.configSet({
        theme: currentPresetId,
        tone: sepiaOn ? "sepia" : currentIsLight ? "light" : "dark",
        wear: wearLevel,
        layout,
        crtMode,
        crtIntensity: crtDensityIndex,
        crtSweep,
        crtNoise: crtNoiseFx,
        crtChroma,
        crtFlicker: crtFlickerFx,
        crtVignette: crtVignetteFx,
        crtBulge: crtBulgeFx,
        outerStyle: outerStyleOverride,
        innerStyle: innerStyleOverride,
        fontSize,
        sfxMuted: isMuted(),
      });
    }, 400);
  };

  const showToast = (message: string, durationMs = 3500) => {
    let toast = gb.querySelector(".gb-toast") as HTMLElement;
    if (!toast) {
      toast = document.createElement("div");
      toast.className = "gb-toast";
      gbScreen.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.remove("show");
    // force reflow
    toast.offsetHeight;
    toast.classList.add("show");

    // a leftover timeout from a previous toast would hide this one early
    if ((toast as any).timeoutId) clearTimeout((toast as any).timeoutId);
    const timeoutId = setTimeout(() => {
      toast.classList.remove("show");
    }, durationMs);
    (toast as any).timeoutId = timeoutId;
  };

  const applyCrtState = () => {
    // Intensity only — line spacing is fixed at a 3px rhythm in CSS so the
    // scanlines can never spread into ruled-notebook stripes. 20 linear steps
    // with NO mid-range caps: the old min(1, …) clamp saturated the scanline
    // alpha around step 14, which made steps 14-20 visually identical.
    // Light themes still damp the planes (a faint RGB triad reads as a pink
    // wash on paper backgrounds), but softer than before so the effect stays
    // visible where the user actually reads.
    const t = crtDensityIndex / (CRT_STEPS - 1);
    const light = gb.classList.contains("light");
    const lineDamp = light ? 0.55 : 1;
    const maskDamp = light ? 0.35 : 1;
    gb.classList.toggle("crt-off", crtMode === "off");
    gb.classList.toggle("crt-grille", crtMode === "grille");
    gb.classList.toggle("crt-slot", crtMode === "slot");
    gb.classList.toggle("crt-glass", crtMode === "glass");
    gb.classList.toggle("crt-full", crtMode === "full");
    gb.classList.toggle("crt-scanlines", crtMode === "scanlines");
    gb.classList.toggle("crt-vector", crtMode === "vector");
    gb.classList.toggle("crt-fx-sweep", crtSweep);
    gb.classList.toggle("crt-fx-noise", crtNoiseFx);
    gb.classList.toggle("crt-fx-chroma", crtChroma);
    gb.classList.toggle("crt-fx-flicker", crtFlickerFx);
    gb.classList.toggle("crt-fx-vignette", crtVignetteFx);
    gb.classList.toggle("crt-fx-bulge", crtBulgeFx);
    // Phosphor bloom: dark themes only (dark ink blooming on paper = smudge);
    // glass gets half — no visible mask means less apparent dot glow.
    // vector mode gets more glow for Vectrex phosphor style.
    const bloom =
      crtMode === "off" || light
        ? 0
        : (0.6 + t * 2.6) * (crtMode === "glass" ? 0.5 : crtMode === "vector" ? 2.2 : 1);
    gb.classList.toggle("crt-bloom", bloom > 0);
    gb.style.setProperty("--crt-intensity", (0.3 + t * 2).toFixed(2));
    gb.style.setProperty("--crt-line-alpha", ((0.05 + t * 0.5) * lineDamp).toFixed(3));
    gb.style.setProperty("--crt-mask-alpha", ((0.01 + t * 0.1) * maskDamp).toFixed(3));
    gb.style.setProperty("--crt-sheen", ((0.04 + t * 0.3) * (light ? 0.5 : 1)).toFixed(3));
    gb.style.setProperty("--crt-glow-strength", (0.7 + t * 1.8).toFixed(2));
    gb.style.setProperty(
      "--crt-flicker-strength",
      crtMode === "mask" || crtMode === "slot" || crtMode === "full" || crtMode === "vector"
        ? (0.015 + t * 0.05).toFixed(3)
        : "0"
    );
    gb.style.setProperty(
      "--crt-warp",
      crtMode === "mask" || crtMode === "full" || crtMode === "vector" ? `${(t * 2.2).toFixed(2)}px` : "0px"
    );
    gb.style.setProperty("--crt-bloom", `${bloom.toFixed(2)}px`);
    // Glass bulge: the imaginary glass layer inflates with intensity — the
    // specular highlights swell and the tube-curvature shading deepens.
    gb.style.setProperty(
      "--crt-bulge",
      crtMode === "glass" || crtMode === "full" || crtMode === "vector" ? (0.15 + t * 0.85).toFixed(3) : "0"
    );
    gb.style.setProperty("--crt-corner", `${(4 + t * 9).toFixed(1)}px`);
    gb.style.setProperty("--crt-noise", (0.05 + t * 0.09).toFixed(3));
  };

  const CRT_MODE_LABELS: Record<CrtMode, string> = {
    mask: "CRT Shadow Mask",
    grille: "CRT Aperture Grille",
    slot: "CRT Slot Mask",
    glass: "CRT Glass Only",
    full: "CRT Full Retro",
    scanlines: "Clean Scanlines",
    vector: "Vector Glow (Vectrex)",
    off: "CRT Off",
  };

  // Old-tube turn-on: one-shot bright-line flash when the CRT comes back
  // from Off. Overlay on the screen (not on .crt — transforms there would
  // isolate the blend planes); removes itself on animationend.
  const playCrtPowerOn = () => {
    const el = document.createElement("div");
    el.className = "gb-crt-poweron";
    gbScreen.appendChild(el);
    el.addEventListener("animationend", () => el.remove());
    window.setTimeout(() => el.remove(), 1200); // belt & braces if the event is lost
  };

  const setCrtMode = (mode: CrtMode) => {
    const wasOff = crtMode === "off";
    crtMode = mode;
    applyCrtState();
    if (wasOff && mode !== "off") playCrtPowerOn();
    showToast(CRT_MODE_LABELS[mode]);
    persistState();
  };

  const CRT_FX_LABELS: Record<CrtFx, string> = {
    sweep: "Sweep", noise: "Noise", chroma: "Chroma",
    flicker: "Flicker", vignette: "Vignette", bulge: "Curve",
  };
  const crtFxOn = (fx: CrtFx): boolean =>
    fx === "sweep" ? crtSweep
      : fx === "noise" ? crtNoiseFx
      : fx === "chroma" ? crtChroma
      : fx === "flicker" ? crtFlickerFx
      : fx === "vignette" ? crtVignetteFx
      : crtBulgeFx;
  const setCrtFx = (fx: CrtFx, on: boolean) => {
    if (fx === "sweep") crtSweep = on;
    else if (fx === "noise") crtNoiseFx = on;
    else if (fx === "chroma") crtChroma = on;
    else if (fx === "flicker") crtFlickerFx = on;
    else if (fx === "vignette") crtVignetteFx = on;
    else crtBulgeFx = on;
    applyCrtState();
    showToast(`CRT ${CRT_FX_LABELS[fx]} ${on ? "On" : "Off"}${on && crtMode === "off" ? " (CRT is Off)" : ""}`);
    persistState();
  };

  const cycleCrtMode = () => {
    setCrtMode(CRT_MODES[(CRT_MODES.indexOf(crtMode) + 1) % CRT_MODES.length]);
  };

  const adjustCrtDensity = (delta: number) => {
    const next = Math.max(0, Math.min(CRT_STEPS - 1, crtDensityIndex + delta));
    if (next === crtDensityIndex) {
      showToast(`CRT Intensity ${crtDensityIndex + 1}/${CRT_STEPS}`);
      return;
    }
    crtDensityIndex = next;
    applyCrtState();
    showToast(`CRT Intensity ${crtDensityIndex + 1}/${CRT_STEPS}`);
    persistState();
  };

  const applyThemePreset = (id: number, light: boolean) => {
    const preset = THEME_PRESETS[id - 1];
    if (!preset) return;

    // sepiaOn (module state) picks the warm derived palette; `light` still
    // drives all the chassis/divider chrome below (sepia = light-ish chrome).
    const variant = sepiaOn ? deriveSepia(preset.light) : light ? preset.light : preset.dark;
    const ex = withUserEcho(enforceReadability(variant.xterm));
    currentTheme = { ...ex, ...selectionTheme(ex) };

    // Apply CSS variables to root element (.gb)
    Object.entries(variant.cssVars).forEach(([key, val]) => {
      gb.style.setProperty(key, val);
    });
    gb.style.setProperty("--term-cursor", variant.xterm.cursor);
    gb.style.setProperty("--term-cursor-accent", variant.xterm.cursorAccent);

    // Apply inner style override if set
    if (innerStyleOverride === 'dark') {
      const divider = light ? "#dddddd" : "#2c2e30";
      const activeColor = light ? "#1c1d22" : "#ebdca5";
      const hover = light ? "#aaaaaa" : "#484a4c";
      gb.style.setProperty("--term-divider", divider);
      gb.style.setProperty("--term-active", activeColor);
      gb.style.setProperty("--term-divider-hover", hover);
    } else if (innerStyleOverride === 'retro') {
      const divider = light ? "#aebd82" : "#091209";
      const activeColor = light ? "#59683f" : "#5a8a2a";
      const hover = light ? "#82935d" : "#3c5a1e";
      gb.style.setProperty("--term-divider", divider);
      gb.style.setProperty("--term-active", activeColor);
      gb.style.setProperty("--term-divider-hover", hover);
    } else if (innerStyleOverride === 'red') {
      // G-Shock red family, matching the red terminal text (#ff2a33 / #c8101e)
      const divider = light ? "#d98a8a" : "#4a070d";
      const activeColor = light ? "#7c0a12" : "#ff2a33";
      const hover = light ? "#b95555" : "#7c0a12";
      gb.style.setProperty("--term-divider", divider);
      gb.style.setProperty("--term-active", activeColor);
      gb.style.setProperty("--term-divider-hover", hover);
    } else if (innerStyleOverride === 'red-pale') {
      // Faded sibling of the G-Shock red inner: washed rose accents.
      const divider = light ? "#d9a8a4" : "#3c2220";
      const activeColor = light ? "#8a4a44" : "#dfa09a";
      const hover = light ? "#b97f7a" : "#6b423e";
      gb.style.setProperty("--term-divider", divider);
      gb.style.setProperty("--term-active", activeColor);
      gb.style.setProperty("--term-divider-hover", hover);
    } else if (innerStyleOverride === 'orange-pale') {
      // Faded sibling of the atomic orange inner: washed apricot accents.
      const divider = light ? "#d9b48c" : "#3c2c1a";
      const activeColor = light ? "#8a5c28" : "#e4b088";
      const hover = light ? "#b98f5e" : "#6b4e2e";
      gb.style.setProperty("--term-divider", divider);
      gb.style.setProperty("--term-active", activeColor);
      gb.style.setProperty("--term-divider-hover", hover);
    }

    // Apply chassis styling. Cassette modes are photo shells and the robo
    // shells are CSS-owned liveries: any inline chassis background/border
    // would paint OVER them, so clear the overrides and let the
    // .cassetteN-chassis / .layout-robo* CSS rules own the frame (the
    // *-chassis classes still recolor the robo shells via --robo-* vars).
    if (isCassetteLayout() || isRoboLayout() || isFableLayout()) {
      gb.style.background = "";
      gb.style.border = "";
      gb.style.boxShadow = "";
      const topEl = gb.querySelector(".gb-top") as HTMLElement;
      const bottomEl = gb.querySelector(".gb-bottom") as HTMLElement;
      if (topEl) {
        topEl.style.color = "";
        topEl.style.textShadow = "";
      }
      if (bottomEl) {
        bottomEl.style.color = "";
        bottomEl.style.textShadow = "";
      }
    } else if (outerStyleOverride === 'dark') {
      gb.style.background =
        "radial-gradient(130% 80% at 50% 0%, rgba(255, 255, 255, 0.05), transparent 55%), linear-gradient(180deg, #1a1b1f 0%, #141518 55%, #0d0e11 100%)";
      gb.style.border = "2px solid #35363b";
      gb.style.boxShadow = "inset 0 2px 0 rgba(255, 255, 255, 0.07), inset 0 -4px 12px rgba(0, 0, 0, 0.65), inset 0 0 0 1px rgba(0, 0, 0, 0.55)";
      const topEl = gb.querySelector(".gb-top") as HTMLElement;
      const bottomEl = gb.querySelector(".gb-bottom") as HTMLElement;
      if (topEl) {
        topEl.style.color = "#d9d6cc";
        topEl.style.textShadow = "0 1px 0 rgba(0, 0, 0, 0.4)";
      }
      if (bottomEl) {
        bottomEl.style.color = "#d7d2c3";
        bottomEl.style.textShadow = "0 1px 0 rgba(0, 0, 0, 0.3)";
      }
    } else if (outerStyleOverride === 'retro') {
      gb.style.background = "linear-gradient(160deg, #c3beaf 0%, #adab99 58%, #8e8d7a 100%)";
      gb.style.border = "2px solid #82806f";
      gb.style.boxShadow = "inset 0 2px 0 rgba(255, 255, 255, 0.28), inset 0 -3px 10px rgba(0, 0, 0, 0.4), inset 0 0 0 1px rgba(0, 0, 0, 0.25)";
      const topEl = gb.querySelector(".gb-top") as HTMLElement;
      const bottomEl = gb.querySelector(".gb-bottom") as HTMLElement;
      if (topEl) {
        topEl.style.color = "#3e3d35";
        topEl.style.textShadow = "0 1px 0 rgba(255, 255, 255, 0.35)";
      }
      if (bottomEl) {
        bottomEl.style.color = "#3e3d35";
        bottomEl.style.textShadow = "0 1px 0 rgba(255, 255, 255, 0.35)";
      }
    } else if (outerStyleOverride === 'red') {
      // G-Shock red shell: same hue family as the red terminal ink so the
      // frame reads as one piece with the G-Shock theme.
      gb.style.background =
        "radial-gradient(130% 80% at 50% 0%, rgba(255, 255, 255, 0.12), transparent 55%), linear-gradient(180deg, #c8101e 0%, #a30d18 55%, #7c0a12 100%)";
      gb.style.border = "2px solid #5e070e";
      gb.style.boxShadow = "inset 0 2px 0 rgba(255, 255, 255, 0.18), inset 0 -4px 12px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(0, 0, 0, 0.4)";
      const topEl = gb.querySelector(".gb-top") as HTMLElement;
      const bottomEl = gb.querySelector(".gb-bottom") as HTMLElement;
      if (topEl) {
        topEl.style.color = "#ffd9d6";
        topEl.style.textShadow = "0 1px 0 rgba(0, 0, 0, 0.45)";
      }
      if (bottomEl) {
        bottomEl.style.color = "#ffd9d6";
        bottomEl.style.textShadow = "0 1px 0 rgba(0, 0, 0, 0.4)";
      }
    } else if (outerStyleOverride === 'red-pale') {
      // Faded Red: the G-Shock shell after a decade on a sunny shelf —
      // washed strawberry plastic, dark maroon prints.
      gb.style.background =
        "radial-gradient(130% 80% at 50% 0%, rgba(255, 255, 255, 0.3), transparent 55%), linear-gradient(180deg, #dfa09a 0%, #cd847d 55%, #b26862 100%)";
      gb.style.border = "2px solid #96544e";
      gb.style.boxShadow = "inset 0 2px 0 rgba(255, 255, 255, 0.4), inset 0 -3px 10px rgba(74, 32, 28, 0.35), inset 0 0 0 1px rgba(74, 32, 28, 0.3)";
      const topEl = gb.querySelector(".gb-top") as HTMLElement;
      const bottomEl = gb.querySelector(".gb-bottom") as HTMLElement;
      if (topEl) {
        topEl.style.color = "#4a201c";
        topEl.style.textShadow = "0 1px 0 rgba(255, 255, 255, 0.35)";
      }
      if (bottomEl) {
        bottomEl.style.color = "#4a201c";
        bottomEl.style.textShadow = "0 1px 0 rgba(255, 255, 255, 0.35)";
      }
    } else if (outerStyleOverride === 'orange-pale') {
      // Faded Orange: sun-bleached apricot terracotta, dark umber prints.
      gb.style.background =
        "radial-gradient(130% 80% at 50% 0%, rgba(255, 255, 255, 0.32), transparent 55%), linear-gradient(180deg, #e4b088 0%, #d29768 55%, #b87c4e 100%)";
      gb.style.border = "2px solid #9a6740";
      gb.style.boxShadow = "inset 0 2px 0 rgba(255, 255, 255, 0.42), inset 0 -3px 10px rgba(76, 46, 20, 0.35), inset 0 0 0 1px rgba(76, 46, 20, 0.3)";
      const topEl = gb.querySelector(".gb-top") as HTMLElement;
      const bottomEl = gb.querySelector(".gb-bottom") as HTMLElement;
      if (topEl) {
        topEl.style.color = "#4c2e14";
        topEl.style.textShadow = "0 1px 0 rgba(255, 255, 255, 0.35)";
      }
      if (bottomEl) {
        bottomEl.style.color = "#4c2e14";
        bottomEl.style.textShadow = "0 1px 0 rgba(255, 255, 255, 0.35)";
      }
    } else if (outerStyleOverride === 'white') {
      gb.style.background = "linear-gradient(160deg, #f0f0f0 0%, #dfdfdf 58%, #c5c5c5 100%)";
      gb.style.border = "2px solid #b5b5b5";
      gb.style.boxShadow = "inset 0 2px 0 rgba(255, 255, 255, 0.8), inset 0 -3px 10px rgba(0, 0, 0, 0.15), inset 0 0 0 1px rgba(0, 0, 0, 0.1)";
      const topEl = gb.querySelector(".gb-top") as HTMLElement;
      const bottomEl = gb.querySelector(".gb-bottom") as HTMLElement;
      if (topEl) {
        topEl.style.color = "#3e3d35";
        topEl.style.textShadow = "0 1px 0 rgba(255, 255, 255, 0.7)";
      }
      if (bottomEl) {
        bottomEl.style.color = "#3e3d35";
        bottomEl.style.textShadow = "0 1px 0 rgba(255, 255, 255, 0.7)";
      }
} else if (outerStyleOverride === 'phosphor') {
      gb.style.background = "radial-gradient(130% 80% at 50% 0%, rgba(255, 255, 255, 0.1), transparent 55%), linear-gradient(180deg, #102410 0%, #0a170a 55%, #050a05 100%)";
      gb.style.border = "2px solid #1c3d1c";
      gb.style.boxShadow = "inset 0 2px 0 rgba(134, 229, 104, 0.1), inset 0 -4px 12px rgba(0, 0, 0, 0.7), inset 0 0 0 1px rgba(0, 0, 0, 0.6)";
      const topEl = gb.querySelector(".gb-top") as HTMLElement;
      const bottomEl = gb.querySelector(".gb-bottom") as HTMLElement;
      if (topEl) { topEl.style.color = "#86e568"; topEl.style.textShadow = "0 1px 0 rgba(0, 0, 0, 0.5)"; }
      if (bottomEl) { bottomEl.style.color = "#86e568"; bottomEl.style.textShadow = "0 1px 0 rgba(0, 0, 0, 0.5)"; }
    } else if (outerStyleOverride === 'cyberpunk') {
      gb.style.background = "radial-gradient(130% 80% at 50% 0%, rgba(160, 80, 255, 0.08), transparent 55%), linear-gradient(180deg, #1d1228 0%, #140a1c 55%, #0b0512 100%)";
      gb.style.border = "2px solid #3a2452";
      gb.style.boxShadow = "inset 0 2px 0 rgba(190, 120, 255, 0.12), inset 0 -4px 12px rgba(0, 0, 0, 0.8), inset 0 0 0 1px rgba(0, 0, 0, 0.7)";
      const topEl = gb.querySelector(".gb-top") as HTMLElement;
      const bottomEl = gb.querySelector(".gb-bottom") as HTMLElement;
      if (topEl) { topEl.style.color = "#e4d6f8"; topEl.style.textShadow = "0 1px 2px rgba(190, 120, 255, 0.35)"; }
      if (bottomEl) { bottomEl.style.color = "#e4d6f8"; bottomEl.style.textShadow = "0 1px 2px rgba(190, 120, 255, 0.35)"; }
    } else if (outerStyleOverride === 'ocean') {
      gb.style.background = "radial-gradient(130% 80% at 50% 0%, rgba(120, 200, 255, 0.08), transparent 55%), linear-gradient(180deg, #0e2233 0%, #081724 55%, #030b12 100%)";
      gb.style.border = "2px solid #1d4258";
      gb.style.boxShadow = "inset 0 2px 0 rgba(120, 200, 255, 0.1), inset 0 -4px 12px rgba(0, 0, 0, 0.7), inset 0 0 0 1px rgba(0, 0, 0, 0.6)";
      const topEl = gb.querySelector(".gb-top") as HTMLElement;
      const bottomEl = gb.querySelector(".gb-bottom") as HTMLElement;
      if (topEl) { topEl.style.color = "#c2e3f5"; topEl.style.textShadow = "0 1px 0 rgba(0, 0, 0, 0.5)"; }
      if (bottomEl) { bottomEl.style.color = "#c2e3f5"; bottomEl.style.textShadow = "0 1px 0 rgba(0, 0, 0, 0.5)"; }
    } else if (outerStyleOverride === 'mecha') {
      const panels = light
        ? mechaPanelsSvg("rgba(0,0,0,0.28)", "rgba(0,0,0,0.35)", "rgba(255,255,255,0.5)")
        : mechaPanelsSvg("rgba(0,0,0,0.5)", "rgba(0,0,0,0.55)", "rgba(255,255,255,0.22)");
      gb.style.background = panels + ", " + (light ? MECHA_METAL_LIGHT : MECHA_METAL_DARK);
      gb.style.border = "2px solid #3c3c3c";
      gb.style.boxShadow = "inset 0 2px 0 rgba(255, 255, 255, 0.15), inset 0 -4px 12px rgba(0, 0, 0, 0.5), inset 0 0 0 1px rgba(0, 0, 0, 0.4)";
      const topEl = gb.querySelector(".gb-top") as HTMLElement;
      const bottomEl = gb.querySelector(".gb-bottom") as HTMLElement;
      if (topEl) {
        topEl.style.color = light ? "#222" : "#ccc";
        topEl.style.textShadow = light ? "0 1px 0 rgba(255, 255, 255, 0.4)" : "0 1px 0 rgba(0, 0, 0, 0.5)";
      }
      if (bottomEl) {
        bottomEl.style.color = light ? "#222" : "#ccc";
        bottomEl.style.textShadow = light ? "0 1px 0 rgba(255, 255, 255, 0.4)" : "0 1px 0 rgba(0, 0, 0, 0.5)";
      }
    } else if (outerStyleOverride === 'orange') {
      const traces = orangePcbSvg();
      gb.style.background = traces + ", radial-gradient(130% 80% at 50% 0%, rgba(255, 170, 80, 0.35), transparent 60%), linear-gradient(180deg, rgba(255, 110, 0, 0.94) 0%, rgba(210, 80, 0, 0.96) 55%, rgba(160, 50, 0, 0.98) 100%)";
      gb.style.border = "2px solid #993300";
      gb.style.boxShadow = "inset 0 3px 6px rgba(255, 200, 150, 0.5), inset 0 -5px 15px rgba(0, 0, 0, 0.6), inset 0 0 0 1px rgba(255, 120, 0, 0.25)";
      const topEl = gb.querySelector(".gb-top") as HTMLElement;
      const bottomEl = gb.querySelector(".gb-bottom") as HTMLElement;
      if (topEl) {
        topEl.style.color = "#ffebcc";
        topEl.style.textShadow = "0 1px 0 rgba(0, 0, 0, 0.6), 0 0 4px rgba(255, 110, 0, 0.5)";
      }
      if (bottomEl) {
        bottomEl.style.color = "#ffebcc";
        bottomEl.style.textShadow = "0 1px 0 rgba(0, 0, 0, 0.5), 0 0 4px rgba(255, 110, 0, 0.5)";
      }
    } else if (outerStyleOverride === 'grape') {
      const traces = grapePcbSvg();
      gb.style.background = traces + ", radial-gradient(130% 80% at 50% 0%, rgba(200, 100, 255, 0.25), transparent 60%), linear-gradient(180deg, rgba(120, 30, 160, 0.92) 0%, rgba(90, 10, 130, 0.95) 55%, rgba(60, 5, 95, 0.98) 100%)";
      gb.style.border = "2px solid #4a0066";
      gb.style.boxShadow = "inset 0 3px 6px rgba(200, 120, 255, 0.45), inset 0 -5px 15px rgba(0, 0, 0, 0.6), inset 0 0 0 1px rgba(120, 30, 160, 0.25)";
      const topEl = gb.querySelector(".gb-top") as HTMLElement;
      const bottomEl = gb.querySelector(".gb-bottom") as HTMLElement;
      if (topEl) {
        topEl.style.color = "#f2d9f8";
        topEl.style.textShadow = "0 1px 0 rgba(0, 0, 0, 0.6), 0 0 4px rgba(180, 50, 255, 0.4)";
      }
      if (bottomEl) {
        bottomEl.style.color = "#f2d9f8";
        bottomEl.style.textShadow = "0 1px 0 rgba(0, 0, 0, 0.5), 0 0 4px rgba(180, 50, 255, 0.4)";
      }
    } else if (outerStyleOverride === 'wood') {
      const grain = woodgrainSvg();
      gb.style.background = grain + ", linear-gradient(160deg, #8a5229 0%, #6e401f 58%, #522f16 100%)";
      gb.style.border = "2px solid #3c200d";
      gb.style.boxShadow = "inset 0 2px 0 rgba(255, 255, 255, 0.15), inset 0 -4px 10px rgba(0, 0, 0, 0.4), inset 0 0 0 1px rgba(0, 0, 0, 0.2)";
      const topEl = gb.querySelector(".gb-top") as HTMLElement;
      const bottomEl = gb.querySelector(".gb-bottom") as HTMLElement;
      if (topEl) {
        topEl.style.color = "#ffe6cc";
        topEl.style.textShadow = "0 1px 1px rgba(0, 0, 0, 0.8)";
      }
      if (bottomEl) {
        bottomEl.style.color = "#ffe6cc";
        bottomEl.style.textShadow = "0 1px 1px rgba(0, 0, 0, 0.8)";
      }
    } else {
      // Game Boy shell: the chassis is constant per dark/light (styles.css
      // .gb / .gb.light); presets only restyle the screen contents. Clear any
      // inline overrides left by the dark/retro chassis modes.
      gb.style.background = "";
      gb.style.border = "";
      gb.style.boxShadow = "";

      const topEl = gb.querySelector(".gb-top") as HTMLElement;
      const bottomEl = gb.querySelector(".gb-bottom") as HTMLElement;
      if (topEl) {
        topEl.style.color = "";
        topEl.style.textShadow = "";
      }
      if (bottomEl) {
        bottomEl.style.color = "";
        bottomEl.style.textShadow = "";
      }
    }

    // Worn FILTER: scratches + grime on the dedicated .gb-wear overlay that
    // sits above the chassis background and below every control, so wear
    // composes with any shell — molded plastic, robo/fable CSS art, cassette
    // photos — instead of overwriting the shell's own background. Ink picked
    // by the shell's brightness (retro/white shells are bright regardless of
    // the theme's dark/light mode).
    const wearEl = gb.querySelector(".gb-wear") as HTMLElement | null;
    if (wearEl) {
      if (wornOn) {
        // Ink follows the ACTUAL body brightness of the active shell:
        // - cassette shells are photos — light iff the light artwork variant;
        // - robo/fable bodies follow TONE (light = beige/ivory), except the
        //   tone-proof vivid Red/Orange which stay dark-bodied in every tone;
        // - the classic shell is repainted by the FRAME override (retro/
        //   white/pale = light bodies), else by TONE.
        const shellIsLight = isCassetteLayout()
          ? layout.endsWith("-light")
          : isRoboLayout() || isFableLayout()
            ? light && outerStyleOverride !== 'red' && outerStyleOverride !== 'orange'
            : outerStyleOverride
              ? outerStyleOverride === 'retro' || outerStyleOverride === 'white' ||
                outerStyleOverride === 'red-pale' || outerStyleOverride === 'orange-pale'
              : light;
        const grime = shellIsLight
          ? wornSvg("rgba(58,46,26,0.5)", "rgba(255,253,242,0.6)") + ", " +
            "linear-gradient(0deg, rgba(62,50,28,0.22) 0%, transparent 7%), " +
            "linear-gradient(180deg, rgba(62,50,28,0.14) 0%, transparent 4%), " +
            "radial-gradient(26% 9% at 24% 100%, rgba(96,74,36,0.3), transparent 72%), " +
            "radial-gradient(30% 7% at 82% 0%, rgba(122,96,44,0.24), transparent 70%)"
          : wornSvg("rgba(0,0,0,0.55)", "rgba(214,192,148,0.3)") + ", " +
            "linear-gradient(0deg, rgba(0,0,0,0.4) 0%, transparent 7%), " +
            "linear-gradient(180deg, rgba(0,0,0,0.3) 0%, transparent 4%), " +
            "radial-gradient(26% 9% at 24% 100%, rgba(0,0,0,0.5), transparent 72%), " +
            "radial-gradient(30% 7% at 82% 0%, rgba(255,255,255,0.06), transparent 70%)";
        // Cracked = worn grime + fractures on top.
        const fractures =
          wearLevel === "cracked"
            ? (shellIsLight ? crackSvg("rgba(0,0,0,0.55)", "rgba(255,255,255,0.6)") : crackSvg("rgba(0,0,0,0.82)", "rgba(255,255,255,0.35)")) + ", "
            : "";
        wearEl.style.background = fractures + grime;
      } else {
        wearEl.style.background = "";
      }
    }

    // Glass wear: clean chassis, but the SCREEN glass is fractured in a few
    // scattered spots. Ink follows the tube brightness so the cracks read on
    // dark phosphor and light paper alike. Independent of the grime axis above.
    crack.style.background =
      wearLevel === "glass"
        ? glassCracksSvg(
            light ? "rgba(0,0,0,0.42)" : "rgba(0,0,0,0.62)",
            light ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.34)",
          )
        : "";

    // Toggle class list
    gb.classList.toggle("light", light);
    gb.classList.toggle("sepia", sepiaOn);
    gb.classList.toggle("worn-chassis", wornOn);
    gb.classList.toggle("cracked-chassis", wearLevel === "cracked");
    gb.classList.toggle("wear-glass", wearLevel === "glass");
    gb.classList.toggle("mecha-chassis", outerStyleOverride === 'mecha');
    gb.classList.toggle("orange-chassis", outerStyleOverride === 'orange');
    gb.classList.toggle("grape-chassis", outerStyleOverride === 'grape');
    gb.classList.toggle("wood-chassis", outerStyleOverride === 'wood');
    // CRT damping depends on the light class — recompute the overlay vars
    applyCrtState();
    gb.classList.toggle("retro-chassis", outerStyleOverride === 'retro');
    gb.classList.toggle("white-chassis", outerStyleOverride === 'white');
    gb.classList.toggle("dark-chassis", outerStyleOverride === 'dark');
    gb.classList.toggle("red-chassis", outerStyleOverride === 'red');
    gb.classList.toggle("red-pale-chassis", outerStyleOverride === 'red-pale');
    gb.classList.toggle("orange-pale-chassis", outerStyleOverride === 'orange-pale');
    gb.classList.toggle("phosphor-chassis", outerStyleOverride === 'phosphor');
    gb.classList.toggle("cyberpunk-chassis", outerStyleOverride === 'cyberpunk');
    gb.classList.toggle("ocean-chassis", outerStyleOverride === 'ocean');
    // Dystopian theme wears its history: a hairline crack in the screen glass
    gb.classList.toggle("theme-dystopian", preset.id === 5);

    // Apply the xterm theme to all terminal instances
    for (const p of panes.values()) {
      p.term.options.theme = currentTheme;
    }

    applyCrtState();
    showToast(`${preset.name} (${sepiaOn ? "Sepia" : light ? "Light" : "Dark"}${wearLevel !== "new" ? " · " + wearLevel.charAt(0).toUpperCase() + wearLevel.slice(1) : ""})`);
    persistState();
  };

  const applyTheme = (light: boolean) => {
    currentIsLight = light;
    applyThemePreset(currentPresetId, currentIsLight);
  };

  // ── Tone axis (dark / light / sepia) — clean setters mirroring the CRT
  // pattern (setCrtMode/cycleCrtMode). Both the LOOK overlay and the full-12
  // F1 key drive these; there is no other source of tone truth.
  type ThemeTone = "dark" | "light" | "sepia";
  const TONE_ORDER: ThemeTone[] = ["dark", "light", "sepia"];
  const toneOf = (): ThemeTone => (sepiaOn ? "sepia" : currentIsLight ? "light" : "dark");
  const setTone = (t: ThemeTone) => {
    currentIsLight = t !== "dark";
    sepiaOn = t === "sepia";
    applyThemePreset(currentPresetId, currentIsLight);
    showToast(`Tone: ${t.charAt(0).toUpperCase() + t.slice(1)}`);
    persistState();
  };
  const cycleTone = (dir = 1) => {
    setTone(TONE_ORDER[(TONE_ORDER.indexOf(toneOf()) + dir + TONE_ORDER.length) % TONE_ORDER.length]);
  };

  // ── Wear axis (new / worn / cracked / glass) ── same setter shape as tone.
  const WEAR_LABELS: Record<WearLevel, string> = {
    new: "New", worn: "Worn", cracked: "Cracked", glass: "Glass",
  };
  const setWear = (w: WearLevel) => {
    wearLevel = w;
    wornOn = w === "worn" || w === "cracked";
    applyThemePreset(currentPresetId, currentIsLight);
    showToast(`Wear: ${WEAR_LABELS[w]}`);
    persistState();
  };
  const cycleWear = (dir = 1) => {
    setWear(WEAR_LEVELS[(WEAR_LEVELS.indexOf(wearLevel) + dir + WEAR_LEVELS.length) % WEAR_LEVELS.length]);
  };

  // ── Theme axis (the 8 presets, 1-based) — setter + wrap-around cycler.
  const setThemePreset = (id: number) => {
    const n = THEME_PRESETS.length;
    currentPresetId = ((((id - 1) % n) + n) % n) + 1;
    applyThemePreset(currentPresetId, currentIsLight);
    showToast(THEME_PRESETS[currentPresetId - 1].name);
    persistState();
  };
  const cycleTheme = (dir = 1) => setThemePreset(currentPresetId + dir);

  // ── Chassis frame axis: the outer shell colour + inner divider style. Cycles
  // through Default (null) + 7 named finishes; applyThemePreset repaints the
  // chassis and persists. Surfaced as the Frame/Divider rows in the LOOK menu.
  const FRAME_STYLES = [null, "dark", "retro", "white", "red", "red-pale", "phosphor", "cyberpunk", "ocean", "mecha", "orange", "orange-pale", "grape", "wood"] as const;
  const FRAME_LABELS: Record<string, string> = {
    "dark": "Dark", "retro": "Retro", "white": "White", "red": "Red",
    "red-pale": "Faded Red", "phosphor": "Phosphor", "cyberpunk": "Cyberpunk", "ocean": "Ocean",
    "mecha": "Mecha", "orange": "Atomic Orange", "orange-pale": "Faded Orange", "grape": "Grape GBC", "wood": "Woodgrain"
  };
  const frameName = (s: (typeof FRAME_STYLES)[number]) => (s ? (FRAME_LABELS[s] || s.charAt(0).toUpperCase() + s.slice(1)) : "Default");
  const stepOuter = (dir: number) => {
    outerStyleOverride = FRAME_STYLES[(FRAME_STYLES.indexOf(outerStyleOverride) + dir + FRAME_STYLES.length) % FRAME_STYLES.length];
    applyThemePreset(currentPresetId, currentIsLight);
  };
  const stepInner = (dir: number) => {
    innerStyleOverride = FRAME_STYLES[(FRAME_STYLES.indexOf(innerStyleOverride) + dir + FRAME_STYLES.length) % FRAME_STYLES.length];
    applyThemePreset(currentPresetId, currentIsLight);
  };
  let active: Pane | null = null;

  // ---- RPG Dialog Popup for permissions ----
  const dialog = gb.querySelector(".gb-dialog") as HTMLElement;
  const dialogText = gb.querySelector(".gb-dialog-text") as HTMLElement;
  const dialogOrigin = gb.querySelector(".gb-dialog-origin") as HTMLElement;
  const dialogYes = gb.querySelector(".gb-dialog-btn.yes") as HTMLButtonElement;
  const dialogNo = gb.querySelector(".gb-dialog-btn.no") as HTMLButtonElement;
  const dialogDiff = gb.querySelector(".gb-dialog-btn.diff") as HTMLButtonElement;

  let activeDialogResolve: ((approved: boolean) => void) | null = null;
  // PTY of the pane that opened the dialog; the YES auto-checkpoint commits in
  // that shell's working directory.
  let activeDialogPtyId: number | null = null;
  // Question + resolved origin of the open dialog, kept for the session log.
  let activeDialogQuestion = "";
  let activeDialogWhere: string | null = null;

  // Session activity log (approvals / checkpoints / restores). Recorded here,
  // rendered by the Activity overlay further down.
  const activityLog: ActivityEvent[] = [];
  let renderActivity: (() => void) | null = null;
  const logActivity = (ev: Omit<ActivityEvent, "at">) => {
    pushActivity(activityLog, ev);
    renderActivity?.();
  };

  const showPermissionDialog = (
    question: string,
    onResolve: (approved: boolean) => void,
    ptyId?: number
  ) => {
    dialogText.textContent = question;
    activeDialogPtyId = ptyId ?? active?.ptyId ?? null;
    activeDialogQuestion = question;
    activeDialogWhere = null;
    // Fill the origin line asynchronously; the dialog can already show while
    // the cwd/git lookup runs. Anti-spoofing: this reports where the request
    // actually came from, and the dialog renders on the chassis (outside the
    // screen) where an escape sequence cannot draw.
    dialogOrigin.textContent = "resolving origin…";
    void api.ptyOrigin(activeDialogPtyId ?? undefined).then((o) => {
      activeDialogWhere = o.gitRoot ?? o.cwd;
      if (activeDialogResolve) dialogOrigin.textContent = formatApprovalOrigin(o);
    });
    dialog.hidden = false;
    dialogYes.focus();
    setLedState("needs-user");

    activeDialogResolve = (approved: boolean) => {
      dialog.hidden = true;
      activeDialogResolve = null;
      activeDialogPtyId = null;
      setLedState("agent");
      active?.term.focus();
      logActivity({ kind: "approval", text: activeDialogQuestion, approved, where: activeDialogWhere });
      onResolve(approved);
    };
  };

  const answerApprovalYes = async () => {
    // Snapshot the resolver + pty before the await: a second OSC 98 prompt (or
    // Esc) can overwrite the module-level activeDialogResolve/activeDialogPtyId
    // while gitSave runs, which would otherwise make this YES answer the wrong
    // dialog / write to the wrong PTY, or double-answer after Esc.
    const resolve = activeDialogResolve;
    const ptyId = activeDialogPtyId;
    if (!resolve) return;
    // Auto-checkpoint before YES. The dialog's origin line already shows the
    // shell cwd + git repo root (F1.2), so no extra prompt here — and a failed
    // checkpoint must never block or flip the user's approval.
    const { ok: saved, untrackedFiles } = await api.gitSave(ptyId ?? undefined);
    if (saved) {
      const text = untrackedFiles > 0
        ? `auto-checkpoint before YES (+${untrackedFiles} new file${untrackedFiles === 1 ? "" : "s"})`
        : "auto-checkpoint before YES";
      logActivity({ kind: "checkpoint", text, where: activeDialogWhere });
    } else {
      // No checkpoint was made. Surface it actively (not just via the origin
      // line, which is easy to miss): a real failure in a git repo, OR the
      // shell dir being unresolvable so no repo could be found. "Not a git
      // repo" stays quiet — nothing to checkpoint and the origin line says so.
      const origin = await api.ptyOrigin(ptyId ?? undefined).catch(() => null);
      if (origin?.gitRoot) showToast("Checkpoint save failed");
      else if (!origin?.cwd) showToast("No checkpoint — shell directory unknown");
    }
    // Only answer if this dialog is still the active one (not superseded/closed).
    if (activeDialogResolve === resolve) resolve(true);
  };
  const answerApprovalNo = () => {
    if (activeDialogResolve) activeDialogResolve(false);
  };

  dialogYes.addEventListener("click", answerApprovalYes);
  dialogNo.addEventListener("click", answerApprovalNo);

  dialogDiff.addEventListener("click", () => {
    showDiffPanel();
  });

  dialog.addEventListener("keydown", (e) => {
    // Y / N answer the prompt directly (terminal muscle-memory) alongside the
    // focused YES button (Enter) and Esc (= NO).
    if (e.key === "Escape" || e.key === "n" || e.key === "N") {
      e.preventDefault();
      answerApprovalNo();
    } else if (e.key === "y" || e.key === "Y") {
      e.preventDefault();
      void answerApprovalYes();
    }
  });

  // ---- Close confirmation (X button / painted cassette close) -------------
  // Same RPG-dialog look as approvals; renders on the chassis. NO is the
  // focused default so a stray Enter can't kill the terminal. Shell exits
  // (typing `exit` in the last pane) still close directly — those sessions
  // already ended, there is nothing to protect.
  const confirmBox = gb.querySelector(".gb-confirm") as HTMLElement;
  const confirmDetail = confirmBox.querySelector(".gb-dialog-origin") as HTMLElement;
  const confirmYes = confirmBox.querySelector(".gb-dialog-btn.yes") as HTMLButtonElement;
  const confirmNo = confirmBox.querySelector(".gb-dialog-btn.no") as HTMLButtonElement;
  const dismissConfirmClose = () => {
    confirmBox.hidden = true;
    active?.term.focus();
  };
  const confirmClose = () => {
    if (!confirmBox.hidden) return; // already asking
    const n = panes.size;
    confirmDetail.textContent =
      n > 1 ? `${n} terminal sessions will end.` : "Your terminal session will end.";
    confirmBox.hidden = false;
    confirmNo.focus();
  };
  confirmYes.addEventListener("click", () => api.closeTerminal());
  confirmNo.addEventListener("click", () => dismissConfirmClose());
  confirmBox.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      dismissConfirmClose();
    }
  });

  // ---- Diff Inspector Logic ----
  const diffPanel = gb.querySelector(".gb-diff") as HTMLElement;
  const diffContent = gb.querySelector(".gb-diff-content") as HTMLElement;
  const diffClose = gb.querySelector(".gb-diff-close") as HTMLButtonElement;
  const diffRefresh = gb.querySelector(".gb-diff-refresh") as HTMLButtonElement;

  const showDiffPanel = async () => {
    diffContent.textContent = "Loading diff...";
    diffPanel.hidden = false;
    try {
      const diffText = await api.gitDiff(active?.ptyId);
      if (!diffText) {
        diffContent.textContent = "No uncommitted changes found.";
        return;
      }
      
      const html = diffText.split('\n').map(line => {
        const safeLine = line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        if (safeLine.startsWith('+')) return `<span style="color: #99b898;">${safeLine}</span>`;
        if (safeLine.startsWith('-')) return `<span style="color: #e84a5f;">${safeLine}</span>`;
        if (safeLine.startsWith('@@')) return `<span style="color: #88d8b0;">${safeLine}</span>`;
        return safeLine;
      }).join('\n');
      
      diffContent.innerHTML = html;
    } catch (e: any) {
      diffContent.textContent = "Error running git diff: " + e;
    }
  };

  diffClose.addEventListener("click", () => {
    diffPanel.hidden = true;
  });

  diffRefresh.addEventListener("click", () => {
    showDiffPanel();
  });

  // Export showDiffPanel to window for debugging or manual trigger
  (window as any).showDiffPanel = showDiffPanel;

  // ---- Help / landing overlay (opened by `agentboy /help` or the subtitle) ----
  const helpPanel = gb.querySelector(".gb-help") as HTMLElement;
  const helpBody = gb.querySelector(".gb-help-body") as HTMLElement;
  const helpFooter = gb.querySelector(".gb-help-footer") as HTMLElement;
  const helpClose = gb.querySelector(".gb-help-close") as HTMLButtonElement;

  // Built once from help-content.ts; textContent everywhere (no HTML injection).
  const buildHelp = () => {
    const tagline = document.createElement("p");
    tagline.className = "gb-help-tagline";
    tagline.textContent = HELP_TAGLINE;
    helpBody.appendChild(tagline);
    for (const section of HELP_SECTIONS) {
      const h = document.createElement("div");
      h.className = "gb-help-section-title";
      h.textContent = section.title;
      helpBody.appendChild(h);
      for (const item of section.items) {
        const row = document.createElement("div");
        row.className = "gb-help-row";
        const key = document.createElement("span");
        key.className = "gb-help-key";
        key.textContent = item.key;
        const text = document.createElement("span");
        text.className = "gb-help-text";
        const label = document.createElement("b");
        label.textContent = item.label;
        text.appendChild(label);
        text.appendChild(document.createTextNode(" — " + item.desc));
        row.append(key, text);
        helpBody.appendChild(row);
      }
    }
    const link = document.createElement("a");
    link.href = "https://" + HELP_FOOTER;
    link.textContent = HELP_FOOTER;
    link.addEventListener("click", (e) => {
      e.preventDefault();
      api.openExternal("https://" + HELP_FOOTER);
    });
    helpFooter.appendChild(link);
  };
  buildHelp();

  let helpOpen = false;
  const openHelp = () => {
    helpPanel.hidden = false;
    helpBody.scrollTop = 0;
    helpOpen = true;
    helpClose.focus();
  };
  const closeHelp = () => {
    helpPanel.hidden = true;
    helpOpen = false;
    refocusActivePane();
  };
  helpClose.addEventListener("click", closeHelp);
  helpPanel.addEventListener("click", (e) => {
    // click on the dim backdrop (the panel itself, not its content) closes it
    if (e.target === helpPanel) closeHelp();
  });
  // Capture phase so Esc closes help before xterm's own key handler sees it.
  window.addEventListener(
    "keydown",
    (e) => {
      if (helpOpen && e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeHelp();
      }
    },
    { capture: true }
  );
  api.onShowHelp?.(() => (helpOpen ? closeHelp() : openHelp()));
  api.onScreenInvalidated?.(() => {
    // Display configuration changed; user should manually adjust window if needed
    showToast("Display configuration changed");
  });
  const subtitle = gb.querySelector(".gb-subtitle") as HTMLElement | null;
  subtitle?.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openHelp();
  });

  // ---- Activity overlay: session log + git checkpoint history (Ctrl+Shift+L) ----
  const activityPanel = gb.querySelector(".gb-activity") as HTMLElement;
  const activityBody = gb.querySelector(".gb-activity-body") as HTMLElement;
  const activityClose = gb.querySelector(".gb-activity-close") as HTMLButtonElement;
  let activityOpen = false;
  // sha currently armed for a two-click restore confirmation
  let armedRestoreSha: string | null = null;

  const sectionTitle = (text: string): HTMLElement => {
    const h = document.createElement("div");
    h.className = "gb-help-section-title";
    h.textContent = text;
    return h;
  };

  const renderActivityInto = async () => {
    activityBody.textContent = "";

    activityBody.appendChild(sectionTitle("This session"));
    if (activityLog.length === 0) {
      const empty = document.createElement("div");
      empty.className = "gb-help-row";
      empty.textContent = "No approvals or checkpoints yet this session.";
      activityBody.appendChild(empty);
    } else {
      for (const ev of [...activityLog].reverse()) {
        const row = document.createElement("div");
        row.className = "gb-activity-line gb-activity-" + ev.kind;
        row.textContent = formatActivity(ev);
        activityBody.appendChild(row);
      }
    }

    activityBody.appendChild(sectionTitle("Checkpoints in the active pane's repo"));
    const loading = document.createElement("div");
    loading.className = "gb-help-row";
    loading.textContent = "Loading…";
    activityBody.appendChild(loading);

    const checkpoints = await api.gitCheckpoints(active?.ptyId);
    if (!activityOpen) return;
    loading.remove();
    if (checkpoints.length === 0) {
      const none = document.createElement("div");
      none.className = "gb-help-row";
      none.textContent = "No checkpoints (not a git repo, or none made yet).";
      activityBody.appendChild(none);
    } else {
      for (const cp of checkpoints) {
        const row = document.createElement("div");
        row.className = "gb-activity-cp";
        const label = document.createElement("span");
        label.className = "gb-activity-cp-label";
        label.textContent = `${cp.sha.slice(0, 8)}  ·  ${cp.when}`;
        const btn = document.createElement("button");
        btn.className = "gb-activity-restore";
        const armed = armedRestoreSha === cp.sha;
        btn.textContent = armed ? "Confirm reset?" : "Restore";
        btn.classList.toggle("armed", armed);
        btn.addEventListener("click", async () => {
          if (armedRestoreSha !== cp.sha) {
            // first click arms this one (and disarms any other)
            armedRestoreSha = cp.sha;
            void renderActivityInto();
            return;
          }
          armedRestoreSha = null;
          const { ok, stashed, cancelled } = await api.gitRestoreTo(active?.ptyId, cp.sha);
          if (cancelled) {
            showToast("Restore cancelled");
            void renderActivityInto();
          } else {
            showToast(!ok ? "Restore failed" : stashed ? "Restored (uncommitted work stashed)" : "Restored to checkpoint");
            if (ok) logActivity({ kind: "restore", text: `to ${cp.sha.slice(0, 8)}`, where: null });
            else void renderActivityInto();
          }
        });
        row.append(label, btn);
        activityBody.appendChild(row);
      }
      const note = document.createElement("div");
      note.className = "gb-help-row gb-activity-note";
      note.textContent =
        "Restore hard-resets tracked files to the checkpoint; uncommitted work is stashed first, and any new (untracked) files are kept.";
      activityBody.appendChild(note);
    }
  };
  renderActivity = () => {
    if (activityOpen) void renderActivityInto();
  };

  const openActivity = () => {
    if (helpOpen) closeHelp();
    activityPanel.hidden = false;
    activityOpen = true;
    armedRestoreSha = null;
    activityBody.scrollTop = 0;
    activityClose.focus();
    void renderActivityInto();
  };
  const closeActivity = () => {
    activityPanel.hidden = true;
    activityOpen = false;
    armedRestoreSha = null;
    refocusActivePane();
  };
  activityClose.addEventListener("click", closeActivity);
  activityPanel.addEventListener("click", (e) => {
    if (e.target === activityPanel) closeActivity();
  });
  window.addEventListener(
    "keydown",
    (e) => {
      if (activityOpen && e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeActivity();
      } else if (e.ctrlKey && e.shiftKey && (e.key === "L" || e.key === "l")) {
        e.preventDefault();
        e.stopPropagation();
        activityOpen ? closeActivity() : openActivity();
      }
    },
    { capture: true }
  );

  // ---- Status semafor: dim yellow = idle, bright yellow = user typing, green = agent output, red = approval ----
  const semafor = gb.querySelector(".gb-semafor") as HTMLElement;
  const ledStates = ["idle", "user", "agent", "needs-user", "off"];
  let currentLedIdx = 0;
  let semaforIdleTimer: number | undefined;

  // Prompt heuristics live in led-heuristics.ts; here we only collect the
  // last rows of the active pane's buffer (most recent first, trailing
  // blanks skipped) and hand them over.
  const activePaneLooksLikeChoicePrompt = (): boolean => {
    const term = active?.term;
    if (!term) return false;
    const buf = term.buffer.active;
    const lines: string[] = [];
    for (let i = buf.length - 1; i >= 0 && lines.length < 8; i--) {
      const line = buf.getLine(i);
      if (!line) break;
      const text = line.translateToString(true).trimEnd();
      if (!text && lines.length === 0) continue; // skip trailing blank rows
      lines.push(text);
    }
    return looksLikeChoicePrompt(lines);
  };

  // True only between the user submitting a line (Enter) and the first agent
  // output after it, so the success chime marks "the agent started responding"
  // instead of firing on every echoed keystroke.
  let pendingSubmit = false;

  const scheduleSemaforIdle = () => {
    if (semaforIdleTimer) window.clearTimeout(semaforIdleTimer);
    semaforIdleTimer = window.setTimeout(() => {
      semaforIdleTimer = undefined;
      setLedState(activePaneLooksLikeChoicePrompt() ? "needs-user" : "idle");
    }, 1200);
  };

  const setLedState = (state: string) => {
    const prevState = ledStates[currentLedIdx] || "idle";
    if (state !== "agent") {
      if (semaforIdleTimer) window.clearTimeout(semaforIdleTimer);
      semaforIdleTimer = undefined;
    }
    // Mirror the status class on the root .gb (prefixed sem-*) so the
    // painted cassette LEDs can light up via CSS even though the HTML
    // semafor itself is hidden by the photo chassis.
    const SEM = ["status-off", "status-idle", "status-agent", "status-user", "status-needs-user"];
    semafor.classList.remove(...SEM);
    if (state === "off") {
      semafor.classList.add("status-off");
      semafor.title = "Status: off";
      currentLedIdx = ledStates.indexOf("off");
    } else if (state === "yellow" || state === "user" || state === "typing") {
      semafor.classList.add("status-user");
      semafor.title = "Status: user typing";
      currentLedIdx = ledStates.indexOf("user");
    } else if (state === "red" || state === "needs-user" || state === "approval" || state === "error" || state === "fail") {
      semafor.classList.add("status-needs-user");
      semafor.title = "Status: waiting for approval";
      if (prevState !== "needs-user" && prevState !== "red" && prevState !== "approval") {
        playErrorTone();
      }
      currentLedIdx = ledStates.indexOf("needs-user");
    } else if (state === "green" || state === "agent" || state === "output") {
      semafor.classList.add("status-agent");
      semafor.title = "Status: agent output";
      if (pendingSubmit && (prevState === "user" || prevState === "yellow" || prevState === "typing")) {
        playSuccessTone();
        pendingSubmit = false;
      }
      currentLedIdx = ledStates.indexOf("agent");
      scheduleSemaforIdle();
    } else {
      semafor.classList.add("status-idle");
      semafor.title = "Status: idle";
      currentLedIdx = ledStates.indexOf("idle");
    }
    for (const c of SEM) gb.classList.toggle(`sem-${c}`, semafor.classList.contains(c));
  };

  setLedState("idle");

  semafor.addEventListener("click", () => {
    currentLedIdx = (currentLedIdx + 1) % ledStates.length;
    setLedState(ledStates[currentLedIdx]);
    playDpadBlip();
  });

  // ---- search overlay (operates on the active pane) ---------------------
  const searchBox = gb.querySelector(".gb-search") as HTMLElement;
  const searchInput = gb.querySelector(".gb-search-input") as HTMLInputElement;
  let searchOpen = false;
  const clearAllDecorations = () => {
    for (const p of panes.values()) p.search.clearDecorations();
  };
  const openSearch = () => {
    searchOpen = true;
    searchBox.hidden = false;
    searchInput.focus();
    searchInput.select();
  };
  const closeSearch = () => {
    searchOpen = false;
    searchBox.hidden = true;
    clearAllDecorations();
    active?.term.focus();
  };

  const refocusActivePane = () => {
    if (activeDialogResolve || searchOpen) return;
    active?.term.focus();
  };

  const scheduleRefocusActivePane = (pane?: Pane) => {
    if (!pane || pane !== active || activeDialogResolve || searchOpen || !pane.pointerInside) return;
    if (pane.blurRefocusTimer) window.clearTimeout(pane.blurRefocusTimer);
    pane.blurRefocusTimer = window.setTimeout(() => {
      if (pane === active && pane.pointerInside && !activeDialogResolve && !searchOpen) {
        pane.term.focus();
      }
      pane.blurRefocusTimer = undefined;
    }, 0);
  };

  // ---- cwd marking in the screen's top-right corner -----------------------
  // Shows the ACTIVE pane's working directory (resolved from the shell's
  // /proc cwd via pty:cwd), refreshed on pane switch + a slow poll so it
  // follows `cd` without any shell integration.
  const sidePath = gb.querySelector(".gb-screen-path") as HTMLElement | null;
  let sidePathShown: string | null = null;
  const updateSidePath = () => {
    if (!sidePath) return;
    const ptyId = active?.ptyId;
    if (typeof ptyId !== "number" || ptyId < 0) return;
    void api.ptyCwdOf(ptyId).then((cwd) => {
      const path = cwd ?? "";
      if (path !== sidePathShown) {
        sidePathShown = path;
        sidePath.textContent = path;
      }
    }).catch(() => { /* keep the last known path */ });
  };
  window.setInterval(updateSidePath, 3000);

  // ---- a single pane ----------------------------------------------------
  const setActive = (p: Pane) => {
    active = p;
    for (const q of panes.values()) q.el.classList.toggle("active", q === p);
    p.term.focus();
    updateSidePath();
  };

  const copySelection = (p: Pane) => {
    const sel = p.term.getSelection();
    if (sel) api.clipWrite(sel);
  };
  const paste = async (p: Pane, which?: "selection") => {
    const text = await api.clipRead(which);
    if (text) p.term.paste(sanitizePasteText(text));
  };
  const setFont = (px: number) => {
    fontSize = Math.max(7, Math.min(28, px));
    for (const p of panes.values()) {
      p.term.options.fontSize = fontSize;
      p.fit.fit();
      api.pty.resize(p.ptyId, p.term.cols, p.term.rows);
    }
    persistState();
  };

  gb.addEventListener(
    "wheel",
    (e) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      e.stopPropagation();
      setFont(fontSize + (e.deltaY < 0 ? 1 : -1));
      active?.term.focus();
    },
    { passive: false, capture: true }
  );

  const createPane = (): Pane => {
    const el = document.createElement("div");
    el.className = "gb-pane";
    const host = document.createElement("div");
    host.className = "gb-term";
    const crt = document.createElement("div");
    crt.className = "crt";
    // Broadcast-noise plane; CSS shows it on the Dystopian theme or the
    // NOISE fx toggle. The sweep plane is the FX retrace band.
    const crtNoise = document.createElement("div");
    crtNoise.className = "crt-noise";
    const crtSweepEl = document.createElement("div");
    crtSweepEl.className = "crt-sweep";
    // Vignette (corner falloff) and Curve (glass-dome edge shade + sheen) are
    // overlay planes — they must sit ABOVE the terminal text, exactly like the
    // noise/sweep planes. Painting them on .gb-term (box-shadow/background)
    // hides them behind xterm's opaque row spans.
    const crtVigEl = document.createElement("div");
    crtVigEl.className = "crt-vignette";
    const crtBulgeEl = document.createElement("div");
    crtBulgeEl.className = "crt-bulge";
    crt.append(crtNoise, crtSweepEl, crtVigEl, crtBulgeEl);
    const scrollTrack = document.createElement("div");
    scrollTrack.className = "gb-scroll-track";
    el.append(host, crt, scrollTrack);

    const term = new Terminal({
      fontFamily: '"DejaVu Sans Mono", Menlo, Consolas, monospace',
      fontSize,
      lineHeight: 1.25,
      cursorBlink: true, // classic blinking cursor while idle/waiting
      cursorStyle: "underline", // old-school DOS cursor
      cursorInactiveStyle: "none", // "none" is the typical unfocused-terminal look
      allowProposedApi: true,
      scrollback: 10000,
      theme: currentTheme,
      macOptionClickForcesSelection: true,
      // Apps that emit 256-color / truecolor text (e.g. agent CLIs) assume a dark
      // background and become unreadable on the light DMG theme — the xterm theme
      // only remaps the 16 ANSI colors, not truecolor. minimumContrastRatio makes
      // xterm auto-darken/lighten ANY foreground that's too close to the
      // background, so those apps stay legible on both themes.
      minimumContrastRatio: 7,
    });
    const fit = new FitAddon();
    const search = new SearchAddon();
    term.loadAddon(fit);
    term.loadAddon(search);
    term.loadAddon(new WebLinksAddon((_e, uri) => api.openExternal(uri)));
    const uni = new Unicode11Addon();
    term.loadAddon(uni);
    term.unicode.activeVersion = "11";

    // OSC 99 handler to control the Game Boy LED from within PTY/CLI tools
    term.parser.registerOscHandler(99, (data) => {
      if (data.startsWith("led=")) {
        const state = data.slice(4).trim();
        setLedState(state);
        const idx = ledStates.indexOf(state);
        if (idx >= 0) currentLedIdx = idx;
        return true;
      }
      return false;
    });

    // OSC 98 handler to trigger RPG permission dialogs from within PTY/CLI tools
    term.parser.registerOscHandler(98, (data) => {
      if (data.startsWith("prompt=")) {
        // Any program writing to the terminal can emit this, so the mode is
        // user-controlled: "off" ignores it, "led-only" just flags the LED
        // without a dialog or auto-answer (so a spoofed prompt can never make
        // us type "y"), "on" shows the origin-stamped dialog.
        if (osc98Mode === "off") return true;
        if (osc98Mode === "led-only") {
          setLedState("needs-user");
          showToast("Agent requested approval (dialog disabled)");
          return true;
        }
        const question = data.slice(7).trim();
        showPermissionDialog(question, (approved) => {
          if (pane && pane.ptyId >= 0) {
            api.pty.write(pane.ptyId, approved ? "y\r" : "n\r");
          }
        }, pane?.ptyId);
        return true;
      }
      return false;
    });

    term.open(host);

    const pane: Pane = { el, term, fit, search, ptyId: -1, disposed: false, unsubs: [] };
    panes.set(el, pane);

    // Drag-to-scroll logic for the invisible scroll track
    let isDragging = false;
    const doScroll = (clientY: number) => {
      const rect = scrollTrack.getBoundingClientRect();
      let y = clientY - rect.top;
      if (y < 0) y = 0;
      if (y > rect.height) y = rect.height;
      const pct = y / rect.height;
      const baseY = term.buffer.active.baseY;
      const targetLine = Math.round(pct * baseY);
      term.scrollToLine(targetLine);
    };

    scrollTrack.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      isDragging = true;
      doScroll(e.clientY);
      e.preventDefault();
      e.stopPropagation();
    });

    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      doScroll(e.clientY);
      e.preventDefault();
      e.stopPropagation();
    };

    const onMouseUp = () => {
      isDragging = false;
    };

    window.addEventListener("mousemove", onMouseMove, { capture: true });
    window.addEventListener("mouseup", onMouseUp, { capture: true });

    pane.unsubs.push(() => {
      window.removeEventListener("mousemove", onMouseMove, { capture: true });
      window.removeEventListener("mouseup", onMouseUp, { capture: true });
    });

    // selecting copies to PRIMARY (middle-click paste like a native terminal)
    // and, once the selection settles, to the real CLIPBOARD (Ctrl+V anywhere)
    let selectionCopyTimer: number | undefined;
    term.onSelectionChange(() => {
      const sel = term.getSelection();
      // The CRT overlay sits on top of the xterm canvas with a multiply
      // blend, which otherwise darkens the selection highlight to near
      // invisibility — dim the overlay while a selection is active.
      el.classList.toggle("has-selection", !!sel);
      if (!sel) return;
      api.clipWrite(sel, "selection");
      // the event fires on every drag step — debounce the CLIPBOARD write
      // and toast so only the final selection lands there
      if (selectionCopyTimer) window.clearTimeout(selectionCopyTimer);
      selectionCopyTimer = window.setTimeout(() => {
        selectionCopyTimer = undefined;
        const finalSel = term.getSelection();
        if (!finalSel) return;
        api.clipWrite(finalSel);
        showToast("Copied", 1200);
      }, 400);
    });
    pane.unsubs.push(() => {
      if (selectionCopyTimer) window.clearTimeout(selectionCopyTimer);
    });
    el.addEventListener("mousedown", (e) => {
      setActive(pane);
      if (e.button === 1) {
        e.preventDefault();
        void paste(pane, "selection");
      }
    });
    el.addEventListener("mouseenter", () => {
      pane.pointerInside = true;
      if (active !== pane) setActive(pane);
      else refocusActivePane();
    });
    el.addEventListener("mouseleave", () => {
      pane.pointerInside = false;
      if (pane.blurRefocusTimer) {
        window.clearTimeout(pane.blurRefocusTimer);
        pane.blurRefocusTimer = undefined;
      }
    });
    const textarea = term.textarea;
    if (textarea) {
      const onTermBlur = () => {
        scheduleRefocusActivePane(pane);
      };
      const onTermFocus = () => {
        if (pane.blurRefocusTimer) {
          window.clearTimeout(pane.blurRefocusTimer);
          pane.blurRefocusTimer = undefined;
        }
      };
      textarea.addEventListener("blur", onTermBlur);
      textarea.addEventListener("focus", onTermFocus);
      pane.unsubs.push(() => {
        textarea.removeEventListener("blur", onTermBlur);
        textarea.removeEventListener("focus", onTermFocus);
      });
    }

    // keyboard shortcuts (the focused pane's term receives the keys)
    term.attachCustomKeyEventHandler((e) => {
      if (activeDialogResolve) {
        if (e.type === "keydown" && e.key === "Escape") {
          activeDialogResolve(false);
        }
        return false; // block inputs to PTY while dialog is open
      }
      if (e.type !== "keydown") return true;
      setLedState("user");
      const k = e.key.toLowerCase();

      // Escape key logic
      if (e.key === "Escape") {
        if (searchOpen) {
          closeSearch();
          return false;
        }
        return true; // Pass to PTY (no longer closes the pane)
      }

      // Ctrl+End to scroll to bottom
      if (e.ctrlKey && e.key === "End") {
        term.scrollToBottom();
        return false;
      }

      if (e.ctrlKey && e.shiftKey) {
        if (k === "c") {
          e.preventDefault();
          return copySelection(pane), false;
        }
        if (k === "v") {
          e.preventDefault();
          return void paste(pane), false;
        }
        if (k === "a") return term.selectAll(), false;
        if (k === "f") return openSearch(), false;
        if (k === "x") return term.clear(), false;
        if (k === "e") return splitPane(pane, "row"), false; // split vertical
        if (k === "o") return splitPane(pane, "column"), false; // split horizontal
      }
      if (e.ctrlKey && e.key === "Insert") return copySelection(pane), false;
      if (e.shiftKey && e.key === "Insert") return void paste(pane, "selection"), false;
      if (e.ctrlKey && (e.key === "+" || e.key === "=")) return setFont(fontSize + 1), false;
      if (e.ctrlKey && e.key === "-") return setFont(fontSize - 1), false;
      if (e.ctrlKey && e.key === "0") return setFont(BASE_FONT), false;
      // Bare F-keys (F7 CRT+, F10 SAVER, F11 FLOAT, F12 BOTTOM) drive chassis
      // actions ONLY at a normal shell prompt. A full-screen TUI (htop, mc,
      // nano, vim, lazygit…) runs on the ALTERNATE buffer and binds these keys
      // itself (F10 = quit in htop/mc); while it is active we must let them
      // reach the PTY instead of stealing them. The same actions stay
      // available on the on-screen chassis buttons regardless.
      if (term.buffer.active.type !== "alternate") {
        if (e.key === "F7") return adjustCrtDensity(1), false; // matches the F7 CRT+ button/help
        if (e.key === "F10") return toggleScreensaver(), false; // matches the SAVER button/help (toggle)
        // F12 lands at the bottom (matches the on-screen BOTTOM button label).
        if (e.key === "F12") {
          term.scrollToBottom();
          // xterm can ignore scrollToBottom while a TUI is mid-repaint; force
          // the viewport as well (same as the BOTTOM button).
          const vp = el.querySelector(".xterm-viewport") as HTMLElement | null;
          if (vp) vp.scrollTop = vp.scrollHeight;
          return false;
        }
        // Matches the on-screen F11 FLOAT button/help (used to call
        // toggleNoFrame — F8's job, not F11's; same mismatch class as the
        // F7/F10 fixes in 2.0.3).
        if (e.key === "F11") return toggleFloat(), false;
      }
      if (e.type === "keydown" && e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        playTypeTick();
      }
      return true;
    });

    // keep the pane fitted to its slot (splits, divider drags, window resize)
    const resizeObs = new ResizeObserver(() => fitPane(pane));
    resizeObs.observe(el);
    pane.unsubs.push(() => resizeObs.disconnect());
    return pane;
  };

  const fitPane = (p: Pane) => {
    if (p.disposed) return;
    try {
      p.fit.fit();
      if (p.ptyId >= 0) api.pty.resize(p.ptyId, p.term.cols, p.term.rows);
    } catch {
      /* not laid out yet */
    }
  };

  // One warning per session is enough — every split would otherwise re-toast.
  let shellFallbackWarned = false;
  const spawnPane = async (p: Pane) => {
    try {
      p.fit.fit();
    } catch {
      /* not laid out yet — spawn with xterm's default size, resync below */
    }
    let spawned: { id: number; shellFallback: string | null };
    try {
      spawned = await api.pty.spawn({ cols: p.term.cols, rows: p.term.rows });
    } catch {
      // Spawn itself failed (even the fallback shell) — never leave a dead,
      // silent pane the user can type into with no effect.
      showToast('Shell failed to start — check "shell" in ~/.agentboy.json');
      const soleTerminal = !p.el.parentElement || p.el.parentElement === panesRoot;
      if (soleTerminal) {
        // Don't vanish the whole window on the very first pane — leave a
        // readable notice on the (already-opened) terminal so the cause is seen.
        try {
          p.term.write(
            '\r\n\x1b[31m[shell failed to start]\x1b[0m\r\n' +
              'Check the "shell" value in ~/.agentboy.json, then reopen.\r\n'
          );
        } catch {
          /* term already gone */
        }
      } else {
        closePane(p); // a split pane can just be removed; the sibling stays
      }
      return;
    }
    const { id, shellFallback } = spawned;
    if (shellFallback && !shellFallbackWarned) {
      shellFallbackWarned = true;
      showToast(`Shell "${shellFallback}" not found — using default (check ~/.agentboy.json)`);
    }
    p.ptyId = id;
    // If the pane was resized during the await, the ResizeObserver's fitPane
    // skipped the pty resize (ptyId was still -1). Now that the session is live,
    // resync once so the shell's cols/rows match the real pane size.
    fitPane(p);
    const filterDim = makeSgrDimFilter();
    p.unsubs.push(
      api.pty.onData((m) => {
        if (m.id === id && !p.disposed) {
          // Set the LED first: xterm.write() parses small chunks synchronously,
          // so an OSC 99 (led=…) inside this data runs during write() and must be
          // allowed to win. Doing it after write() would clobber the OSC state.
          setLedState("agent");
          p.term.write(filterDim(m.data, currentIsLight));
        }
      })
    );
    p.unsubs.push(
      api.pty.onExit((m) => {
        if (m.id === id) closePane(p, m.code);
      })
    );

    p.term.onData((d) => {
      if (d.includes("\r")) pendingSubmit = true; // Enter / submitted line
      setLedState("user");
      api.pty.write(id, d);
    });
  };

  const disposePane = (p: Pane) => {
    p.disposed = true;
    if (p.blurRefocusTimer) window.clearTimeout(p.blurRefocusTimer);
    for (const u of p.unsubs) u();
    if (p.ptyId >= 0) api.pty.kill(p.ptyId);
    try {
      p.term.dispose();
    } catch {
      /* already gone */
    }
    panes.delete(p.el);
  };

  // ---- split / close ----------------------------------------------------
  // orientation "row" = side-by-side (split vertical); "column" = stacked
  // (split horizontal).
  const splitPane = (p: Pane, orientation: "row" | "column") => {
    // Refuse to split a pane that is already too small — otherwise repeated
    // splits shrink terminals down to unusable 2×2-cell slivers with no way
    // back short of "Merge splits into one".
    if (orientation === "row" && p.term.cols < 24) return void showToast("Pane too narrow to split");
    if (orientation === "column" && p.term.rows < 12) return void showToast("Pane too short to split");
    const parent = p.el.parentElement;
    if (!parent) return;
    const split = document.createElement("div");
    split.className = "gb-split";
    split.style.flexDirection = orientation;
    const divider = document.createElement("div");
    divider.className = "gb-divider " + (orientation === "row" ? "vert" : "horiz");
    const np = createPane();
    parent.replaceChild(split, p.el);
    split.append(p.el, divider, np.el);
    p.el.style.flex = "1 1 0";
    np.el.style.flex = "1 1 0";
    wireDivider(divider, split, p.el);
    void spawnPane(np);
    setActive(np);
  };

  const closePane = (p: Pane, exitCode?: number) => {
    const wasActive = active === p;
    const parent = p.el.parentElement;
    const isLast = !parent || parent === panesRoot;
    // A crash = the shell exited with a non-zero code (not a clean `exit`, and
    // not a user-initiated close, which passes no code).
    const crashed = typeof exitCode === "number" && exitCode !== 0;
    if (crashed && isLast) {
      // The sole pane's shell died unexpectedly. Don't tear the window down
      // silently — leave the dead terminal visible with a notice so the user
      // sees WHAT happened and closes on their own terms.
      try {
        p.term.write(`\r\n\x1b[31m[shell exited with code ${exitCode}]\x1b[0m — close the window when ready.\r\n`);
      } catch {
        /* term already gone */
      }
      showToast(`Shell exited (code ${exitCode})`);
      return;
    }
    disposePane(p);
    if (isLast) {
      api.closeTerminal(); // closed the last pane -> close the window
      return;
    }
    if (crashed) showToast(`Pane shell exited (code ${exitCode})`);
    // parent is a .gb-split [sibling, divider, p] (in some order); promote the
    // sibling into the split's place.
    const sibling = Array.from(parent!.children).find(
      (c) => c !== p.el && !c.classList.contains("gb-divider")
    ) as HTMLElement | undefined;
    const grandparent = parent!.parentElement;
    if (sibling && grandparent) {
      sibling.style.flex = "1 1 0";
      grandparent.replaceChild(sibling, parent!);
      const next = sibling.classList.contains("gb-pane")
        ? panes.get(sibling)
        : panes.get(sibling.querySelector(".gb-pane") as HTMLElement);
      // Only move focus when the pane that closed was the focused one — a
      // BACKGROUND pane dying (e.g. a one-off `exit` in another split) must not
      // yank the cursor out from under the user's active shell.
      if (next && wasActive) setActive(next);
    }
  };

  // collapse every split back to a single pane (the A button). Keeps the active
  // pane (or the first one) alive and disposes the rest.
  const collapseToSingle = () => {
    if (panes.size <= 1) return;
    const keep = active && panes.has(active.el) ? active : (panes.values().next().value as Pane);
    for (const p of Array.from(panes.values())) {
      if (p !== keep) disposePane(p);
    }
    panesRoot.innerHTML = "";
    keep.el.style.flex = "";
    panesRoot.appendChild(keep.el);
    setActive(keep);
    fitPane(keep);
  };

  // drag a divider to change the split ratio
  const wireDivider = (divider: HTMLElement, split: HTMLElement, firstChild: HTMLElement) => {
    let dragging = false;
    divider.addEventListener("pointerdown", (e) => {
      dragging = true;
      divider.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    divider.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const r = split.getBoundingClientRect();
      const horizontal = split.style.flexDirection === "row";
      const frac = horizontal ? (e.clientX - r.left) / r.width : (e.clientY - r.top) / r.height;
      const pct = Math.max(8, Math.min(92, frac * 100));
      firstChild.style.flex = `0 0 ${pct}%`;
    });
    const end = (e: PointerEvent) => {
      dragging = false;
      try {
        divider.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    divider.addEventListener("pointerup", end);
    divider.addEventListener("pointercancel", end);
    // Double-click resets the split to an even 50/50 — the standard escape from
    // a lopsided drag.
    divider.addEventListener("dblclick", () => {
      firstChild.style.flex = "1 1 0";
    });
  };

  // ---- first pane -------------------------------------------------------
  const first = createPane();
  panesRoot.appendChild(first.el);
  await spawnPane(first);
  api.focusWindow();
  setActive(first);
  // One-time hint the very first launch: the controls (copy/paste, split,
  // LOOK/MODE) live behind the /help overlay and a right-click menu, neither of
  // which is obvious. Gated on a localStorage flag so it shows exactly once.
  try {
    if (!localStorage.getItem("agentboy.seenHint")) {
      localStorage.setItem("agentboy.seenHint", "1");
      setTimeout(() => showToast("Right-click for the menu · click “▸ agentboy /help” for all controls"), 900);
    }
  } catch {
    /* localStorage unavailable — skip the hint */
  }
  applyThemePreset(currentPresetId, currentIsLight);
  if (config.border === "retro") {
    gb.classList.add("eink-color");
    gb.classList.remove("dark");
  } else {
    gb.classList.add("dark");
    gb.classList.remove("eink-color");
  }
  applyCrtState();
  // Keep the cursor blinking by re-focusing the active pane whenever the window
  // regains focus.
  window.addEventListener("focus", () => refocusActivePane());

  // ---- chassis button wiring (Game Boy sounds) -------------------------
  // D-pad → write the real arrow-key escape sequence straight to the PTY. This
  // is reliable regardless of focus (synthetic KeyboardEvents on the hidden
  // textarea were ignored, so left/right never moved the cursor). The cursor
  // moves one cell per press; application-cursor-keys mode (TUIs) is honoured.
  const ARROW_CODE: Record<string, string> = { up: "A", down: "B", right: "C", left: "D" };
  const sendArrow = (dir: string) => {
    if (!active || active.ptyId < 0 || !ARROW_CODE[dir]) return;
    const prefix = active.term.modes.applicationCursorKeysMode ? "\x1bO" : "\x1b[";
    api.pty.write(active.ptyId, prefix + ARROW_CODE[dir]);
  };

  gb.querySelectorAll(".gb-dpad-btn").forEach((btn) => {
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      playDpadBlip();
      sendArrow((btn as HTMLElement).dataset.dir ?? "");
      refocusActivePane();
    });
  });

  // LOOK — one appearance menu (Theme / Tone / CRT / Wear) with live-apply.
  // Each control calls the existing setter and re-renders. Lives inside
  // gb-screen (chassis) like the approval dialog, so escape sequences printed
  // to the terminal can never fabricate it.
  const lookBtn = gb.querySelector('[data-fn="look"]') as HTMLElement | null;
  const look = document.createElement("div");
  look.className = "gb-look";
  look.hidden = true;
  look.innerHTML = `
    <div class="gb-look-head"><span>&#9656; LOOK</span><span class="gb-look-badge">&#9888; AGENTB&Oslash;Y</span></div>
    <div class="gb-look-row" data-row="theme">
      <span class="gb-look-key">Theme</span>
      <span class="gb-look-val">
        <button class="gb-look-arrow" data-act="theme:-1" aria-label="Previous theme">&#9664;</button>
        <span class="gb-look-name" data-slot="theme"></span>
        <button class="gb-look-arrow" data-act="theme:1" aria-label="Next theme">&#9654;</button>
        <span class="gb-look-count" data-slot="theme-count"></span>
      </span>
    </div>
    <div class="gb-look-row" data-row="tone">
      <span class="gb-look-key">Tone</span>
      <span class="gb-look-seg" data-seg="tone">
        <button data-act="tone:dark">Dark</button><button data-act="tone:light">Light</button><button data-act="tone:sepia">Sepia</button>
      </span>
    </div>
    <div class="gb-look-row" data-row="crt">
      <span class="gb-look-key">CRT</span>
      <span class="gb-look-val">
        <button class="gb-look-arrow" data-act="crt:-1" aria-label="Previous CRT">&#9664;</button>
        <span class="gb-look-name" data-slot="crt"></span>
        <button class="gb-look-arrow" data-act="crt:1" aria-label="Next CRT">&#9654;</button>
        <span class="gb-look-meter"><button data-act="crtint:-1" aria-label="Less">&#8722;</button><span class="gb-look-bars" data-slot="crtbars"></span><button data-act="crtint:1" aria-label="More">+</button><span class="gb-look-count" data-slot="crtnum"></span></span>
      </span>
    </div>
    <div class="gb-look-row" data-row="fx">
      <span class="gb-look-key">FX</span>
      <span class="gb-look-seg" data-seg="fx">
        <button data-act="fx:sweep" title="Rolling retrace band — stacks on any CRT mode">Sweep</button><button data-act="fx:noise" title="Broadcast grain — stacks on any CRT mode">Noise</button><button data-act="fx:chroma" title="RGB fringe — misconverged-tube colour split">Chroma</button><button data-act="fx:flicker" title="Brightness flutter — the picture never quite holds still">Flicker</button><button data-act="fx:vignette" title="Corner falloff — the tube edges sink into shadow">Vignette</button><button data-act="fx:bulge" title="Glass dome — curved tube face (no text warp)">Curve</button>
      </span>
    </div>
    <div class="gb-look-row" data-row="wear">
      <span class="gb-look-key">Wear</span>
      <span class="gb-look-seg" data-seg="wear">
        <button data-act="wear:new">New</button><button data-act="wear:worn">Worn</button><button data-act="wear:cracked">Cracked</button><button data-act="wear:glass" title="Fractured screen glass — scattered hairline cracks on any theme">Glass</button>
      </span>
    </div>
    <div class="gb-look-row" data-row="frame">
      <span class="gb-look-key">Frame</span>
      <span class="gb-look-val">
        <button class="gb-look-arrow" data-act="frame:-1" aria-label="Previous frame">&#9664;</button>
        <span class="gb-look-name" data-slot="frame"></span>
        <button class="gb-look-arrow" data-act="frame:1" aria-label="Next frame">&#9654;</button>
      </span>
    </div>
    <div class="gb-look-row" data-row="divider">
      <span class="gb-look-key">Divider</span>
      <span class="gb-look-val">
        <button class="gb-look-arrow" data-act="divider:-1" aria-label="Previous divider">&#9664;</button>
        <span class="gb-look-name" data-slot="divider"></span>
        <button class="gb-look-arrow" data-act="divider:1" aria-label="Next divider">&#9654;</button>
      </span>
    </div>
    <div class="gb-look-foot"><span>&#8597; red &middot; &#8596; vrednost &middot; klik</span><span>Esc zatvara</span></div>
  `;
  gbScreen.appendChild(look);

  const LOOK_ROWS = ["theme", "tone", "crt", "fx", "wear", "frame", "divider"];
  let lookActiveRow = "theme";

  const renderLook = () => {
    (look.querySelector('[data-slot="theme"]') as HTMLElement).textContent = THEME_PRESETS[currentPresetId - 1].name;
    (look.querySelector('[data-slot="theme-count"]') as HTMLElement).textContent = `${currentPresetId}/${THEME_PRESETS.length}`;
    look.querySelectorAll('[data-seg="tone"] button').forEach((b) =>
      b.setAttribute("aria-pressed", String((b as HTMLElement).dataset.act!.split(":")[1] === toneOf())));
    (look.querySelector('[data-slot="crt"]') as HTMLElement).textContent = CRT_MODE_LABELS[crtMode].replace(/^CRT /, "");
    // 20 bars, one per CRT_STEPS level (1:1 with the intensity the F5/F6 keys set).
    const filled = crtDensityIndex + 1;
    (look.querySelector('[data-slot="crtbars"]') as HTMLElement).innerHTML =
      Array.from({ length: CRT_STEPS }, (_, i) => `<i class="${i < filled ? "on" : ""}"></i>`).join("");
    (look.querySelector('[data-slot="crtnum"]') as HTMLElement).textContent = `${filled}/${CRT_STEPS}`;
    look.querySelectorAll('[data-seg="fx"] button').forEach((b) => {
      const which = (b as HTMLElement).dataset.act!.split(":")[1] as CrtFx;
      b.setAttribute("aria-pressed", String(crtFxOn(which)));
    });
    look.querySelectorAll('[data-seg="wear"] button').forEach((b) =>
      b.setAttribute("aria-pressed", String((b as HTMLElement).dataset.act!.split(":")[1] === wearLevel)));
    (look.querySelector('[data-slot="frame"]') as HTMLElement).textContent = frameName(outerStyleOverride);
    (look.querySelector('[data-slot="divider"]') as HTMLElement).textContent = frameName(innerStyleOverride);
    look.querySelectorAll(".gb-look-row").forEach((r) =>
      r.classList.toggle("active", (r as HTMLElement).dataset.row === lookActiveRow));
  };

  const openLook = () => { look.hidden = false; renderLook(); };
  const closeLook = () => { look.hidden = true; refocusActivePane(); };
  const toggleLook = () => { if (look.hidden) openLook(); else closeLook(); };

  const stepCrt = (dir: number) =>
    setCrtMode(CRT_MODES[(CRT_MODES.indexOf(crtMode) + dir + CRT_MODES.length) % CRT_MODES.length]);

  const lookAct = (act: string) => {
    const [k, v] = act.split(":");
    if (k === "theme") { cycleTheme(parseInt(v, 10)); lookActiveRow = "theme"; }
    else if (k === "tone") { setTone(v as "dark" | "light" | "sepia"); lookActiveRow = "tone"; }
    else if (k === "crt") { stepCrt(parseInt(v, 10)); lookActiveRow = "crt"; }
    else if (k === "crtint") { adjustCrtDensity(parseInt(v, 10)); lookActiveRow = "crt"; }
    else if (k === "fx") { setCrtFx(v as CrtFx, !crtFxOn(v as CrtFx)); lookActiveRow = "fx"; }
    else if (k === "wear") { setWear(v as WearLevel); lookActiveRow = "wear"; }
    else if (k === "frame") { stepOuter(parseInt(v, 10)); lookActiveRow = "frame"; }
    else if (k === "divider") { stepInner(parseInt(v, 10)); lookActiveRow = "divider"; }
    renderLook();
  };
  look.querySelectorAll("button[data-act]").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      lookAct((b as HTMLElement).dataset.act!);
      playSelectSound();
    }));

  lookBtn?.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleLook();
    playSelectSound();
  });
  lookBtn?.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  // Keyboard: Alt+L toggles LOOK; while open, arrows navigate and Esc closes
  // (captured before xterm so keystrokes don't leak to the shell behind it).
  // Alt+L (not Ctrl+L) so the shell keeps Ctrl+L for clear-screen — the near-
  // universal terminal convention.
  window.addEventListener("keydown", (e) => {
    // While a full-screen TUI (alternate buffer) owns the active pane, let
    // Alt+letter combos reach it (many editors/TUIs bind Alt mnemonics) rather
    // than stealing them for LOOK/MODE. At a normal shell prompt they stay the
    // primary keyboard entry to the appearance/layout menus.
    const altScreenActive = active?.term.buffer.active.type === "alternate";
    if (!altScreenActive && e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.key === "l" || e.key === "L")) {
      e.preventDefault();
      e.stopPropagation();
      toggleLook();
      return;
    }
    // Alt+M cycles the layout MODE — keyboard fallback for the cassette
    // shells, where the HTML MODE switch is hidden under the artwork.
    if (!altScreenActive && e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && (e.key === "m" || e.key === "M")) {
      e.preventDefault();
      e.stopPropagation();
      cycleLayout(1);
      return;
    }
    if (look.hidden) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeLook(); }
    else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault(); e.stopPropagation();
      const i = LOOK_ROWS.indexOf(lookActiveRow);
      lookActiveRow = LOOK_ROWS[(i + (e.key === "ArrowDown" ? 1 : -1) + LOOK_ROWS.length) % LOOK_ROWS.length];
      renderLook();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault(); e.stopPropagation();
      const dir = e.key === "ArrowRight" ? 1 : -1;
      if (lookActiveRow === "theme") cycleTheme(dir);
      else if (lookActiveRow === "tone") cycleTone(dir);
      else if (lookActiveRow === "crt") stepCrt(dir);
      else if (lookActiveRow === "fx") {
        // Move focus across the FX pills; Enter/Space then toggles the focused
        // one via the button's own click handler (native, so no extra wiring).
        const btns = [...look.querySelectorAll('[data-seg="fx"] button')] as HTMLElement[];
        const cur = btns.indexOf(document.activeElement as HTMLElement);
        const next = ((cur < 0 ? (dir === 1 ? -1 : 0) : cur) + dir + btns.length) % btns.length;
        btns[next]?.focus();
      }
      else if (lookActiveRow === "wear") cycleWear(dir);
      else if (lookActiveRow === "frame") stepOuter(dir);
      else if (lookActiveRow === "divider") stepInner(dir);
      renderLook();
    }
  }, true);

  // ── Full-12 layout + MODE switch. The window keys (FRAME/EXPAND/SAVER/FLOAT/
  // BOTTOM) are shared between layouts; only the appearance area swaps (LOOK ⇄
  // the 7 appearance keys) and EXPAND shows only in full. The MODE switch flips
  // it and relabels the shared window keys (F2–F5 compact → F8–F12 full).
  const bottomBar = gb.querySelector(".gb-bottom") as HTMLElement;
  const winBtns = Array.from(gb.querySelectorAll(".win-key")) as HTMLElement[];
  const LAYOUT_CLASSES = LAYOUTS.map((l) => `layout-${l}`);
  // Painted F1-F12 keys on the cassette shells → real actions. v1's painted
  // labels are pure fiction, so it gets the full-12 toolbar order verbatim.
  // v2's painted F1-F7 spell real functions (LOOK/BARE/SAVER/FLOAT/BOTTOM/
  // EXPAND/FRAME) — those are honoured, and the five fantasy keys (TRIM/CAT/
  // CTX-/CTX+/NEAR) carry the remaining appearance actions.
  const CASS_F_V1 = ["tone", "frame", "thm", "crt", "crt-", "crt+", "wear", "noframe", "saver", "float", "bottom", "ext"];
  const CASS_F_V2 = ["look", "noframe", "saver", "float", "bottom", "ext", "frame", "tone", "thm", "crt-", "crt+", "crt"];
  const CASS_F_TITLES: Record<string, string> = {
    tone: "Tone", frame: "Frame", thm: "Theme", crt: "CRT", "crt-": "CRT -", "crt+": "CRT +",
    wear: "Wear", noframe: "Bare terminal", saver: "cmatrix screensaver", float: "Float mode",
    bottom: "Scroll to bottom", ext: "Expand over the toolbar", look: "LOOK menu",
  };
  const cassFMap = () => (layout.startsWith("cassette2") ? CASS_F_V2 : CASS_F_V1);
  const cassFZones = Array.from(gb.querySelectorAll(".gb-cass-f-zone")) as HTMLElement[];
  const applyLayout = () => {
    gb.classList.remove(...LAYOUT_CLASSES);
    gb.classList.add(`layout-${layout}`);

    bottomBar.classList.remove(...LAYOUT_CLASSES);
    bottomBar.classList.add(`layout-${layout}`);

    // Cassette shells: the photo chassis replaces the HTML top/bottom bars;
    // the light/dark artwork variant is part of the mode itself (not tone).
    gb.classList.toggle("cassette1-chassis", layout.startsWith("cassette1"));
    gb.classList.toggle("cassette2-chassis", layout.startsWith("cassette2"));
    gb.classList.toggle("cass-light", layout.endsWith("-light"));

    const isFullStyle = layout === "full" || isRoboLayout() || isFableLayout();
    bottomBar.classList.toggle("layout-full", isFullStyle);

    winBtns.forEach((b) => {
      const f = isFullStyle ? b.dataset.ff : b.dataset.fc;
      if (f) b.setAttribute("aria-label", f);
    });

    // Painted F-key tooltips follow the active cassette design's mapping.
    const map = cassFMap();
    cassFZones.forEach((z) => {
      const n = parseInt(z.dataset.cf || "0", 10);
      z.title = `F${n} — ${CASS_F_TITLES[map[n - 1]] ?? map[n - 1]}`;
    });
  };
  applyLayout();

  // ── Cassette chassis artwork shape: the image-backed shells come in three
  // pre-rendered forms (šestina / trećina / full) — no free scaling by design.
  // The window's aspect ratio picks the artwork; re-checked on every resize.
  // Thresholds are the midpoints between the three target aspects
  // (640×524 = 1.22, 640×1048 = 0.61, 1920×1048 = 1.83).
  const applyCassShape = () => {
    const r = window.innerWidth / Math.max(1, window.innerHeight);
    const shape = r > 1.53 ? "full" : r < 0.92 ? "third" : "sixth";
    for (const sh of ["sixth", "third", "full"]) gb.classList.toggle(`cass-${sh}`, sh === shape);
  };
  applyCassShape();
  window.addEventListener("resize", applyCassShape);

  // ── Slim shell (Peđa 2026-07-11): floated/resized below a third of the
  // screen the toolbar prints and controls would collide — hide them all and
  // leave just the frame (window controls stay so the window remains
  // manageable). The 12px slack keeps the exact grid-cell width NON-slim.
  const SLIM_MAX_W = Math.floor(screen.work.w / 3) - 12;
  const applySlimShell = () => {
    gb.classList.toggle("slim", window.innerWidth < SLIM_MAX_W);
  };
  applySlimShell();
  window.addEventListener("resize", applySlimShell);

  // Appearance keys (full layout only) route to the same setters the LOOK menu
  // uses; left-click advances, right-click reverses where it makes sense.
  // crt- / crt+ are intentionally NOT here: they have their own button handlers
  // (btnCrtDown/btnCrtUp) that stopPropagation, so this delegated handler never
  // sees them. Only the keys WITHOUT a dedicated handler are routed here.
  const APPEAR_FNS = new Set(["tone", "frame", "thm", "crt", "wear"]);
  const onAppearDown = (e: Event) => {
    const btn = (e.target as HTMLElement).closest("[data-fn]") as HTMLElement | null;
    if (!btn) return;
    const fn = btn.dataset.fn;
    // Window keys (BARE/SAVER/FLOAT/BOTTOM/EXPAND) share this container but keep
    // their own handlers; let their events pass through untouched.
    if (!fn || !APPEAR_FNS.has(fn)) return;
    e.preventDefault();
    e.stopPropagation();
    const rev = (e as PointerEvent).button === 2 ? -1 : 1;
    if (fn === "tone") cycleTone(rev);
    else if (fn === "frame") stepOuter(rev);
    else if (fn === "thm") cycleTheme(rev);
    else if (fn === "crt") stepCrt(rev);
    else if (fn === "wear") cycleWear(rev);
    playSelectSound();
    refocusActivePane();
  };
  const keysWrap = gb.querySelector(".gb-ss-keys");
  keysWrap?.addEventListener("pointerdown", onAppearDown);
  keysWrap?.addEventListener("contextmenu", (e) => { e.preventDefault(); e.stopPropagation(); });

  const modeSwitch = gb.querySelector(".gb-mode-switch") as HTMLElement | null;
  const LAYOUT_LABELS: Record<LayoutMode, string> = {
    compact: "Compact · LOOK",
    full: "Full · 12 keys",
    roboterminal: "Robo-Terminal",
    robogrip: "Robo-Grip",
    fable: "Fable Deck",
  };
  // MODE cycle. Shared by the HTML MODE switch, the painted MODE key on the
  // cassette artwork and the Alt+M shortcut (the only ways OUT of a cassette
  // mode, since the photo shell hides the HTML bottom bar).
  const cycleLayout = (dir = 1) => {
    const ownedShell = isCassetteLayout() || isRoboLayout() || isFableLayout();
    const idx = LAYOUTS.indexOf(layout);
    layout = LAYOUTS[(idx + dir + LAYOUTS.length) % LAYOUTS.length];
    applyLayout();
    // Crossing a cassette/robo boundary swaps who owns the chassis paint
    // (inline theme styles vs the shell's own CSS) — repaint to hand it over.
    if (ownedShell !== (isCassetteLayout() || isRoboLayout() || isFableLayout())) applyThemePreset(currentPresetId, currentIsLight);
    if (layout === "compact" && !look.hidden) closeLook();
    showToast(`Layout: ${LAYOUT_LABELS[layout]}`);
    persistState();
    playSelectSound();
    refocusActivePane();
  };
  modeSwitch?.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if ((e as PointerEvent).button === 2) return; // right-click keeps the app context menu
    cycleLayout(1);
  });

  const btnCrtDown = gb.querySelector('[data-fn="crt-"]') as HTMLElement;
  const btnCrtUp = gb.querySelector('[data-fn="crt+"]') as HTMLElement;
  const btnFloat = gb.querySelector('[data-fn="float"]') as HTMLElement;

  btnCrtDown?.addEventListener("pointerdown", (e) => {
    e.preventDefault(); e.stopPropagation();
    adjustCrtDensity(-1);
    playSelectSound();
    refocusActivePane();
  });
  
  btnCrtUp?.addEventListener("pointerdown", (e) => {
    e.preventDefault(); e.stopPropagation();
    adjustCrtDensity(1);
    playSelectSound();
    refocusActivePane();
  });
  
  let isFloating = false;
  // Named so the physical F11 key (below, in attachCustomKeyEventHandler) can
  // call the exact same toggle as the on-screen F11 FLOAT button — they used
  // to diverge (physical F11 called toggleNoFrame, the on-screen F8 button's
  // job, not F11's).
  const toggleFloat = () => {
    isFloating = !isFloating;
    api.setResizable(isFloating);
    btnFloat?.classList.toggle("active", isFloating);
    if (!isFloating) {
        applyGridRect(false, false);
    } else {
        api.setAlwaysOnTop(false);
        toolbarCovered = false;
        updateTallToggleBtn();
    }
    showToast(isFloating ? "Float Mode: ON" : "Float Mode: OFF");
    playSelectSound();
    refocusActivePane();
  };
  btnFloat?.addEventListener("pointerdown", (e) => {
    e.preventDefault(); e.stopPropagation();
    toggleFloat();
  });

  const btnExt = gb.querySelector('[data-fn="ext"]') as HTMLElement;
  btnExt?.addEventListener("pointerdown", (e) => {
    e.preventDefault(); e.stopPropagation();
    if (isFull) return;
    if (!tall) {
      showToast("Use B first");
      playSelectSound();
      refocusActivePane();
      return;
    }
    applyGridRect(true, !toolbarCovered);
    showToast(toolbarCovered ? "Expand" : "Tall");
    playSelectSound();
    refocusActivePane();
  });

  // F10 — BOTTOM: scroll the active pane to the bottom, same as Ctrl+End.
  const btnBottom = gb.querySelector('[data-fn="bottom"]') as HTMLElement;
  btnBottom?.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const pane = active ?? panes.values().next().value ?? null;
    if (pane) {
      pane.term.scrollToBottom();
      // xterm can ignore scrollToBottom while a TUI is mid-repaint; force the
      // viewport as well so the button always lands at the bottom.
      const vp = pane.el.querySelector(".xterm-viewport") as HTMLElement | null;
      if (vp) vp.scrollTop = vp.scrollHeight;
    }
    playSelectSound();
    refocusActivePane();
  });

  // F11 — NOFRAME: hide the chassis, bare terminal. The chassis button is
  // gone while the frame is hidden, so the F11 keyboard key or the
  // right-click menu toggles it back. The window bounds from before entering
  // noframe are restored on exit, so the terminal returns to the exact spot
  // and size (third / sixth / wherever it was).
  let noFrame = false;
  let preNoFrameBounds: Rect | null = null;
  const toggleNoFrame = () => {
    noFrame = !noFrame;
    if (noFrame) {
      preNoFrameBounds = {
        x: window.screenX,
        y: window.screenY,
        w: window.outerWidth,
        h: window.outerHeight,
      };
    }
    gb.classList.toggle("noframe", noFrame);
    for (const p of panes.values()) fitPane(p);
    if (!noFrame && preNoFrameBounds) {
      api.setBounds(preNoFrameBounds);
      preNoFrameBounds = null;
    }
    showToast(noFrame ? "Frame hidden — F11 or right-click restores" : "Frame restored");
  };
  const btnNoFrame = gb.querySelector('[data-fn="noframe"]') as HTMLElement;
  btnNoFrame?.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleNoFrame();
    playSelectSound();
    refocusActivePane();
  });

  // F12 — SAVER: cmatrix screensaver in its own PTY overlay; any key or
  // click exits and the overlay PTY is killed. If cmatrix is missing the
  // shell exits immediately and the overlay tears itself down.
  let saverCleanup: (() => void) | null = null;
  // Guards the async gap before saverCleanup is assigned: without it two fast
  // triggers (F10 key + SAVER click) both pass the `saverCleanup` guard while
  // pty.spawn is awaited and spawn two cmatrix PTYs/overlays, one leaking.
  let saverStarting = false;
  const stopScreensaver = () => {
    if (!saverCleanup) return;
    const clean = saverCleanup;
    saverCleanup = null;
    clean();
    refocusActivePane();
  };
  const startScreensaver = async () => {
    if (saverCleanup || saverStarting) return;
    saverStarting = true;
    const overlay = document.createElement("div");
    overlay.className = "gb-saver-overlay";
    gbScreen.appendChild(overlay);
    const term = new Terminal({
      fontFamily: '"DejaVu Sans Mono", Menlo, Consolas, monospace',
      fontSize,
      lineHeight: 1.25,
      cursorBlink: false,
      cursorStyle: "underline",
      cursorInactiveStyle: "none",
      allowProposedApi: true,
      scrollback: 0,
      theme: currentTheme,
    });
    try {
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(overlay);
      fit.fit();
      // The saver renders under the SAME CRT planes as a real pane (the
      // :is(.gb-pane, .gb-saver-overlay) selectors in styles.css) — cmatrix
      // through the active tube, not raw glyphs on black.
      const saverCrt = document.createElement("div");
      saverCrt.className = "crt";
      const saverNoise = document.createElement("div");
      saverNoise.className = "crt-noise";
      const saverSweep = document.createElement("div");
      saverSweep.className = "crt-sweep";
      saverCrt.append(saverNoise, saverSweep);
      overlay.appendChild(saverCrt);
      const { id } = await api.pty.spawn({ cols: term.cols, rows: term.rows });
      const offData = api.pty.onData((m) => {
        if (m.id === id) term.write(m.data);
      });
      const offExit = api.pty.onExit((m) => {
        if (m.id === id) stopScreensaver();
      });
      saverCleanup = () => {
        offData();
        offExit();
        try {
          api.pty.kill(id);
        } catch {
          /* already gone */
        }
        term.dispose();
        overlay.remove();
      };
      api.pty.write(id, "clear; exec cmatrix -ab || exit\n");
      term.attachCustomKeyEventHandler((ev) => {
        // Dismiss on a real keypress only. Ignore keyup so that launching the
        // saver with the F10 key does not immediately close it on F10's release.
        if (ev.type !== "keydown") return true;
        stopScreensaver();
        return false;
      });
      overlay.addEventListener("pointerdown", stopScreensaver);
      term.focus();
    } catch {
      // Spawn/open failed before cleanup was wired: tear down what we made so
      // the saver can be launched again instead of wedging on a half state.
      try {
        term.dispose();
      } catch {
        /* already gone */
      }
      overlay.remove();
    } finally {
      saverStarting = false;
    }
  };
  // SAVER is a TOGGLE (Peđa 2026-07-11): the same button/key that starts the
  // saver also stops it — no need to click into the screen to get out.
  const toggleScreensaver = () => {
    if (saverCleanup) stopScreensaver();
    else void startScreensaver();
  };
  const btnSaver = gb.querySelector('[data-fn="saver"]') as HTMLElement;
  btnSaver?.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    playSelectSound();
    toggleScreensaver();
  });

  // One round speaker by the A/B buttons = master SOUND on/off. ON starts the
  // tune (Phosphor Drift) AND enables effects (buttons + typing); OFF silences
  // both. Boot is silent — music can't autoplay without a gesture anyway.
  const soundSpk = gb.querySelector(".gb-speaker-music") as HTMLElement;
  if (soundSpk) {
    soundSpk.title = "Sound: music + effects (on/off)";
    setMuted(true);
    soundSpk.classList.add("muted");
    soundSpk.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const on = toggleMusic(); // flips the tune; effects follow it
      setMuted(!on);
      soundSpk.classList.toggle("playing", on);
      soundSpk.classList.toggle("muted", !on);
      if (on) playSelectSound(); // confirm blip when turning sound on
      persistState();
      refocusActivePane();
    });
  }

  // Geometry lives in grid.ts; these wrappers feed it the window centre.
  const displayInfos = () => (screen.displays?.length ? screen.displays : [{ work: screen.work, full: screen.full }]);
  const windowCentre = () => ({
    cx: window.screenX + window.innerWidth / 2,
    cy: window.screenY + window.innerHeight / 2,
  });
  const currentDisplay = () => {
    const { cx, cy } = windowCentre();
    const displays = displayInfos();
    return (
      displays.find((d) => containsPoint(d.work, cx, cy) || containsPoint(d.full, cx, cy)) ??
      displays.reduce((best, d) => (
        distanceToRect(d.work, cx, cy) < distanceToRect(best.work, cx, cy) ? d : best
      ))
    );
  };
  const currentWorkArea = () => currentDisplay().work;
  const currentColumn = (work: Rect) => nearestColumn(work, windowCentre().cx);
  const currentRow = (work: Rect) => rowFor(work, windowCentre().cy);
  const gridRect = (fullHeight: boolean, coverToolbar: boolean = false): Rect => {
    const display = currentDisplay();
    const work = display.work;
    return gridRectFor(work, currentColumn(work), currentRow(work), fullHeight, coverToolbar, display.full);
  };
  const applyGridRect = (fullHeight: boolean, coverToolbar: boolean = false) => {
    if (isFull) {
      api.setFullscreen(false);
    }
    if (isFloating) {
      isFloating = false;
      api.setResizable(false);
      btnFloat?.classList.remove("active");
    }
    tall = fullHeight;
    toolbarCovered = coverToolbar && fullHeight;
    const rect = gridRect(fullHeight, toolbarCovered);
    windowed = rect;
    api.setAlwaysOnTop(toolbarCovered);
    api.setBounds(rect);
    updateTallToggleBtn();
  };

  // A/B — B (left) toggles full-height column mode. A (right) snaps back to
  // the closest 3 x 2 grid cell.
  const bBtn = gb.querySelector(".gb-ab-btn.b") as HTMLElement;
  const aBtn = gb.querySelector(".gb-ab-btn.a") as HTMLElement;
  // Cassette shells hide the HTML A button but the artwork still paints one —
  // a transparent zone sits over the painted A (per-shape % rect from the
  // artwork), flashes the press (CSS :active) and forwards to the real action.
  // A/B listen for pointerdown (not click), so the zones must forward a real
  // PointerEvent — el.click() never reaches them (2.2.0 shipped the A zone
  // with that bug: press flash worked, the action itself was dead).
  const pressBtn = (btn: HTMLElement) =>
    btn.dispatchEvent(new PointerEvent("pointerdown", { button: 0, bubbles: true }));
  const cassAZone = gb.querySelector(".gb-cass-a-zone") as HTMLElement;
  if (cassAZone) cassAZone.addEventListener("click", () => pressBtn(aBtn));
  // The other painted cassette controls get the same treatment: fixed
  // transparent zones over the artwork, forwarding to the real actions.
  // A = sixth, B = third, − = minimize, X = close, MODE = cycle layout,
  // □ = full over the work area; clicking □ again covers the toolbar too
  // (real fullscreen), and a third click returns below it.
  const cassZone = (sel: string, fn: () => void) => {
    const el = gb.querySelector(sel) as HTMLElement | null;
    el?.addEventListener("click", (e) => {
      e.stopPropagation();
      fn();
    });
  };
  cassZone(".gb-cass-b-zone", () => pressBtn(bBtn));
  cassZone(".gb-cass-mode-zone", () => cycleLayout(1));
  cassZone(".gb-cass-min-zone", () => api.minimizeTerminal());
  cassZone(".gb-cass-close-zone", () => confirmClose());
  // Painted F1-F12: forward to the real toolbar buttons (all of them listen
  // for pointerdown, so the shared pressBtn PointerEvent path applies).
  const cassPressFn = (fn: string) => {
    const btn = gb.querySelector(fn === "look" ? ".gb-look-btn" : `[data-fn="${fn}"]`) as HTMLElement | null;
    if (btn) pressBtn(btn);
  };
  cassFZones.forEach((z) => {
    z.addEventListener("click", (e) => {
      e.stopPropagation();
      const n = parseInt(z.dataset.cf || "0", 10);
      const fn = cassFMap()[n - 1];
      if (fn) cassPressFn(fn);
    });
  });
  // Corner globes: open the user's default browser.
  gb.querySelectorAll(".gb-cass-globe-zone").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      api.openExternal("about:blank");
      playSelectSound();
    });
  });
  // Full over the work area (toolbar stays visible): the whole current
  // display's work rect, not a grid column.
  const applyCassFullWork = () => {
    if (isFull) setFull(false);
    if (isFloating) {
      isFloating = false;
      api.setResizable(false);
      btnFloat?.classList.remove("active");
    }
    tall = true;
    toolbarCovered = false;
    const work = currentWorkArea();
    windowed = work;
    api.setAlwaysOnTop(false);
    api.setBounds(work);
    updateTallToggleBtn();
  };
  // Already work-area-sized? Then the next □ press escalates to cover the
  // toolbar (real fullscreen). Geometry check, not a flag — survives any
  // other size change in between.
  const atWorkAreaSize = () => {
    const work = currentWorkArea();
    return Math.abs(window.innerWidth - work.w) < 8 && Math.abs(window.innerHeight - work.h) < 8;
  };
  cassZone(".gb-cass-full-zone", () => {
    if (isFull) {
      setFull(false); // back below the toolbar (restores pre-full bounds)
    } else if (atWorkAreaSize()) {
      setFull(true); // second press: cover the toolbar
    } else {
      applyCassFullWork();
    }
    playSelectSound();
  });
  let tall = false;
  let toolbarCovered = false;
  bBtn?.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    playBMelody();
    if (!tall) {
      const work = currentWorkArea();
      if (currentRow(work) === 1) {
        const rect = gridRectFor(work, currentColumn(work), 0, false, false);
        windowed = rect;
        toolbarCovered = false;
        api.setAlwaysOnTop(false);
        api.setBounds(rect);
        updateTallToggleBtn();
        return;
      }
    }
    applyGridRect(true, false);
  });
  aBtn?.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    playAMelody();
    applyGridRect(false, false);
  });

  // Listen for terminal size changes from system tray
  api.onSetSize?.((size) => {
    if (size === "full") {
      setFull(true);
    } else if (size === "tall") {
      applyGridRect(true, false);
    } else { // "small"
      applyGridRect(false, false);
    }
  });

  // ---- search overlay wiring -------------------------------------------
  searchInput.addEventListener("input", () => {
    if (!active) return;
    if (searchInput.value)
      active.search.findNext(searchInput.value, { ...SEARCH_OPTS, incremental: true });
    else active.search.clearDecorations();
  });
  searchInput.addEventListener("keydown", (e) => {
    if (!active) return;
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) active.search.findPrevious(searchInput.value, SEARCH_OPTS);
      else active.search.findNext(searchInput.value, SEARCH_OPTS);
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeSearch();
    }
  });
  (gb.querySelector(".gb-search-next") as HTMLElement).addEventListener("click", () =>
    active?.search.findNext(searchInput.value, SEARCH_OPTS)
  );
  (gb.querySelector(".gb-search-prev") as HTMLElement).addEventListener("click", () =>
    active?.search.findPrevious(searchInput.value, SEARCH_OPTS)
  );
  (gb.querySelector(".gb-search-x") as HTMLElement).addEventListener("click", closeSearch);

  // ---- fullscreen toggle ------------------------------------------------
  let isFull = false;
  let windowed = { x: window.screenX, y: window.screenY, w: window.innerWidth, h: window.innerHeight };
  const setFull = (v: boolean) => {
    if (v === isFull) return;
    if (v) {
      api.setAlwaysOnTop(false);
      toolbarCovered = false;
      windowed = { x: window.screenX, y: window.screenY, w: window.innerWidth, h: window.innerHeight };
    } else {
      api.setAlwaysOnTop(false);
      toolbarCovered = false;
    }
    api.setFullscreen(v);
  };
  api.onFullscreenChanged?.((fullscreen) => {
    isFull = fullscreen;
    gb.classList.toggle("full", fullscreen);
    if (!fullscreen) {
      api.setBounds(windowed);
    }
    updateTallToggleBtn();
  });
  // Fullscreen is reachable via the .gb-full titlebar button and the tray
  // "full" size; the F7 key is CRT+ intensity (see the terminal key handler),
  // matching the on-screen F7 button and /help.
  (gb.querySelector(".gb-full") as HTMLElement).addEventListener("click", (e) => {
    e.stopPropagation();
    setFull(!isFull);
  });
  (gb.querySelector(".gb-min") as HTMLElement).addEventListener("click", (e) => {
    e.stopPropagation();
    api.minimizeTerminal();
  });
  (gb.querySelector(".gb-close") as HTMLElement).addEventListener("click", (e) => {
    e.stopPropagation();
    confirmClose();
  });

  // ---- F7 tall-toggle pill ----------------------------------------------
  const tallToggleBtn = gb.querySelector(".gb-ss-btn.tall-toggle") as HTMLElement;
  const updateTallToggleBtn = () => {
    const canExpand = tall && !toolbarCovered && !isFull;
    tallToggleBtn?.classList.toggle("active", canExpand);
    btnExt?.classList.toggle("active", canExpand);
    // While the terminal covers the toolbar the same key shrinks it back —
    // the printed label shows what the NEXT press does (same as F1's
    // LIGHT/DARK convention).
    if (btnExt) btnExt.dataset.label = toolbarCovered ? "MINIMIZE" : "EXPAND";
  };
  updateTallToggleBtn();
  tallToggleBtn?.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isFull || !tall) return;
    playSelectSound();
    applyGridRect(true, !toolbarCovered);
  });

  // ---- drag the window: by its title bar, and in cassette modes by the
  // painted frame itself (the photo chassis hides the HTML title bar, so the
  // plastic border doubles as the drag handle; release snaps to the grid the
  // same way the title bar does) -----------------------------------------
  const top = gb.querySelector(".gb-top") as HTMLElement;
  let dragging = false;
  let offX = 0;
  let offY = 0;
  // A press only becomes a real drag once the pointer travels past this many
  // pixels. Until then the window neither follows nor snaps — so a plain CLICK
  // on the chassis (common in cassette shells, where the whole photo frame is
  // the drag handle) can no longer yank the window into a grid zone. That
  // spurious snap-on-click was the post-2.1.5 regression; the title bar dragged
  // exactly like this before the frame itself became draggable.
  const DRAG_THRESHOLD = 6;
  let downX = 0;
  let downY = 0;
  let moved = false;
  const dragStart = (el: HTMLElement) => (e: PointerEvent) => {
    // buttons and the clickable /help subtitle handle their own clicks
    if ((e.target as HTMLElement).closest("button, .gb-subtitle")) return;
    // The bare chassis itself is a drag handle in EVERY layout (grab the top
    // bar OR any exposed plastic edge — left, right, bottom); its children (the
    // screen, the painted controls) keep their own behaviour. e.target === gb
    // is true only on that bare border/padding, never on a child.
    if (el === gb && e.target !== gb) return;
    dragging = true;
    moved = false;
    downX = e.screenX;
    downY = e.screenY;
    offX = e.screenX - window.screenX;
    offY = e.screenY - window.screenY;
    el.setPointerCapture(e.pointerId);
  };
  // Coalesce pointermoves into ONE setBounds per animation frame. Calling
  // setBounds on every raw pointermove floods the main process on X11; the
  // native move lags behind the cursor and the window visibly "chases"/flees
  // the pointer. One move per frame with the freshest position tracks cleanly.
  let pendingMove: Rect | null = null;
  let moveRaf = 0;
  const flushMove = () => {
    moveRaf = 0;
    if (!pendingMove || !dragging || isFull) return;
    api.setBounds(pendingMove);
    if (isFloating) windowed = pendingMove;
    pendingMove = null;
  };
  const dragMove = (e: PointerEvent) => {
    if (!dragging || isFull) return;
    if (!moved &&
        Math.abs(e.screenX - downX) < DRAG_THRESHOLD &&
        Math.abs(e.screenY - downY) < DRAG_THRESHOLD) return;
    moved = true;
    pendingMove = { x: e.screenX - offX, y: e.screenY - offY, w: window.innerWidth, h: window.innerHeight };
    if (!moveRaf) moveRaf = requestAnimationFrame(flushMove);
  };
  // Full-height grab rails down the left and right edges: same move cursor and
  // same drag/snap behaviour as the top bar, so the window can be moved from
  // either side too. Thin enough to sit over the plastic border and not steal
  // the panes' content.
  const edgeL = document.createElement("div");
  edgeL.className = "gb-edge-drag left";
  const edgeR = document.createElement("div");
  edgeR.className = "gb-edge-drag right";
  gb.append(edgeL, edgeR);
  const dragHandles = [top, edgeL, edgeR];
  for (const h of dragHandles) {
    h.addEventListener("pointerdown", dragStart(h));
    h.addEventListener("pointermove", dragMove);
  }
  gb.addEventListener("pointerdown", dragStart(gb));
  gb.addEventListener("pointermove", dragMove);
  // Slide the window to a target grid slot. Ease-out so it "klizne".
  const animateBounds = (to: Rect, ms = 160) => {
    const from = { x: window.screenX, y: window.screenY, w: window.innerWidth, h: window.innerHeight };
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3); // ease-out cubic
      api.setBounds({
        x: Math.round(from.x + (to.x - from.x) * e),
        y: Math.round(from.y + (to.y - from.y) * e),
        w: Math.round(from.w + (to.w - from.w) * e),
        h: Math.round(from.h + (to.h - from.h) * e),
      });
      if (k < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };

  // Snap into preset zones on drag release: 6 zones (3 cols x 2 rows) when the
  // window is "small", 3 vertical zones when it is tall/elongated.
  const snapToZone = () => {
    if (isFull || isFloating) return;
    const display = currentDisplay();
    tall = window.innerHeight > display.work.h * 0.7;
    toolbarCovered =
      tall &&
      window.screenY <= display.full.y + 2 &&
      window.innerHeight >= display.full.h - 2;
    const target = gridRect(tall, toolbarCovered);
    windowed = target;
    animateBounds(target);
    updateTallToggleBtn();
  };

  const endDrag = (e: PointerEvent) => {
    if (!dragging) return;
    // Land the last queued move so the release position is the real one (while
    // still "dragging" so flushMove's guard passes), then drop any pending
    // frame and end the drag.
    if (moveRaf) { cancelAnimationFrame(moveRaf); moveRaf = 0; }
    flushMove();
    dragging = false;
    for (const el of [top, gb, edgeL, edgeR]) {
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    // Only a genuine drag snaps — a click that never crossed the threshold
    // leaves the window exactly where it was (the 2.1.5 feel).
    if (moved) snapToZone();
  };
  for (const h of [top, gb, edgeL, edgeR]) {
    h.addEventListener("pointerup", endDrag);
    h.addEventListener("pointercancel", endDrag);
  }

  // ---- right-click menu (acts on the pane you clicked) ------------------
  let menu: HTMLElement | null = null;
  const hideMenu = () => {
    menu?.remove();
    menu = null;
  };
  gb.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    hideMenu();
    const paneEl = (e.target as HTMLElement).closest(".gb-pane") as HTMLElement | null;
    const pane = (paneEl && panes.get(paneEl)) || active!;
    setActive(pane);
    const m = document.createElement("div");
    m.className = "gb-menu";
    const hasSel = !!pane.term.getSelection();
    const canClose = panes.size > 1;
    type Item = "sep" | [string, () => void, boolean?];
    // Label matches the on-screen F8 NOFRAME button, not a physical key —
    // F8 has no physical keyboard binding (see F11 note above).
    const noFrameItems: Item[] = noFrame ? [["Show frame (F8)", toggleNoFrame, true], "sep"] : [];
    const items: Item[] = [
      ...noFrameItems,
      ["Split vertical", () => splitPane(pane, "row"), true],
      ["Split horizontal", () => splitPane(pane, "column"), true],
      ["Merge splits into one", collapseToSingle, canClose],
      [canClose ? "Close pane" : "Close terminal", () => closePane(pane), true],
      "sep",
      ["Copy", () => copySelection(pane), hasSel],
      ["Paste", () => void paste(pane), true],
      ["Select all", () => pane.term.selectAll(), true],
      ["Clear", () => pane.term.clear(), true],
      ["Find…", openSearch, true],
      "sep",
      ["Activity & checkpoints", openActivity, true],
      ["Help (agentboy /help)", openHelp, true],
      "sep",
      [isFull ? "Windowed" : "Fullscreen", () => setFull(!isFull), true],
      ["Quit", () => api.quit(), true],
    ];
    for (const item of items) {
      if (item === "sep") {
        const s = document.createElement("div");
        s.className = "gb-menu-sep";
        m.appendChild(s);
        continue;
      }
      const [label, fn, enabled = true] = item;
      const it = document.createElement("div");
      it.className = "gb-menu-item" + (enabled ? "" : " disabled");
      it.textContent = label;
      if (enabled)
        it.addEventListener("click", () => {
          hideMenu();
          fn();
        });
      m.appendChild(it);
    }
    m.style.left = (e as MouseEvent).clientX + "px";
    m.style.top = (e as MouseEvent).clientY + "px";
    gb.appendChild(m);
    menu = m;
    setTimeout(
      () =>
        window.addEventListener(
          "mousedown",
          (ev) => {
            if (menu && !menu.contains(ev.target as Node)) hideMenu();
          },
          { once: true }
        ),
      0
    );
  });
}

main().catch((err) => {
  const el = document.getElementById("err");
  if (el) el.textContent = String(err);
  console.error(err);
});
