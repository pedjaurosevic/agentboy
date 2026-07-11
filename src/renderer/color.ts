// Colour math + the palette readability rules (WCAG clamp, user-echo
// derivation). Pure functions — no DOM, no xterm.

// --- Readability rule --------------------------------------------------------
// One rule for every preset, current and future: on a dark screen all letter
// colors sit at 70-100% HSL lightness, on a light screen at 0-35%. After the
// lightness clamp each color is nudged further until it clears WCAG 4.5:1
// against the theme background, so no palette entry can wash out (the old
// Charcoal light palette shipped brightWhite identical to its background).
// "black" is exempt: TUI apps use it as a backdrop tone, not as letters.

export const hexToRgb = (hex: string): [number, number, number] => {
  const v = hex.replace("#", "");
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ];
};

export const rgbToHex = (r: number, g: number, b: number): string =>
  "#" + [r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("");

export const rgbToHsl = (r: number, g: number, b: number): [number, number, number] => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s * 100, l * 100];
};

export const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
  h /= 360; s /= 100; l /= 100;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
};

export const relLuminance = (hex: string): number => {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contrastRatio = (a: string, b: string): number => {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
};

export const READABLE_KEYS = [
  "foreground",
  "red", "green", "yellow", "blue", "magenta", "cyan", "white",
  "brightBlack", "brightRed", "brightGreen", "brightYellow",
  "brightBlue", "brightMagenta", "brightCyan", "brightWhite",
] as const;

export const enforceReadability = <T extends { background: string }>(theme: T): T => {
  const bg = theme.background;
  const bgLum = relLuminance(bg);
  // Letters head toward whichever pole (white or black) can reach more
  // contrast on this background — mid-tone backgrounds like Dystopian light's
  // putty #9c8e82 can never reach 4.5:1 against white, only against black.
  const darkBg = 1.05 / (bgLum + 0.05) >= (bgLum + 0.05) / 0.05;
  const out: Record<string, string> = { ...theme };
  for (const key of READABLE_KEYS) {
    const c = out[key];
    if (!c) continue;
    let [h, s, l] = rgbToHsl(...hexToRgb(c));
    // Dark bg: text 70-100% lightness. Light bg: text 0-10% (maximum darkness for readability)
    l = darkBg ? Math.max(l, 70) : Math.min(l, 10);
    let hex = rgbToHex(...hslToRgb(h, s, l));
    while (contrastRatio(hex, bg) < 4.5 && l > 0 && l < 100) {
      l = darkBg ? Math.min(100, l + 2) : Math.max(0, l - 2);
      hex = rgbToHex(...hslToRgb(h, s, l));
    }
    out[key] = hex;
  }
  return out as T;
};

// Claude Code (and other agent CLIs) echo the user's typed prompt in ANSI
// brightWhite (SGR 97) — stark white on dark themes, washed out on paper
// ones. Derive that slot from the theme's own foreground instead: a touch
// lighter and grayer than the LLM body text, never pure white. Applied
// AFTER enforceReadability, which would otherwise clamp the gray back to
// the text pole (≤35 L on paper themes).
export const deriveUserEcho = (fg: string, bg: string): string => {
  const bgLum = relLuminance(bg);
  const darkBg = 1.05 / (bgLum + 0.05) >= (bgLum + 0.05) / 0.05;
  let [h, s, l] = rgbToHsl(...hexToRgb(fg));
  if (darkBg) {
    l = Math.min(88, l + 14);
    s = Math.min(s, 20);
  } else {
    l = Math.min(52, l + 22);
    s = Math.min(s, 12);
  }
  let hex = rgbToHex(...hslToRgb(h, s, l));
  // Readable, but the fixup may never run it all the way to pure white/black.
  // The bound is 98/2 (not the 88 starting cap): on saturated backgrounds like
  // G-Shock light's red, even L=88 gray sits under 4.5:1 and the echo must be
  // allowed to keep climbing — the old `l < 88` bound skipped the loop
  // entirely there and shipped an unreadable echo.
  while (contrastRatio(hex, bg) < 4.5 && l > 2 && l < 98) {
    l += darkBg ? 1 : -1;
    hex = rgbToHex(...hslToRgb(h, s, l));
  }
  return hex;
};

export const withUserEcho = <T extends { foreground?: string; background: string }>(t: T): T =>
  t.foreground ? { ...t, brightWhite: deriveUserEcho(t.foreground, t.background) } : t;

// --- Sepia tint --------------------------------------------------------------
// A third tint alongside each theme's existing dark/light variant (F3/F4),
// styled after e-reader sepia/paper modes: warm the background and plain
// text toward an amber/parchment cast. Derived algorithmically from the
// theme's LIGHT variant, not hand-authored per theme — one transform, 8
// consistent results. The 16 ANSI accent colors (red/green/yellow/…) are
// left untouched: they carry real meaning in CLI output (diffs, test
// results), and a uniform warm wash would make them harder to tell apart.
// Result still passes through enforceReadability/withUserEcho at apply time
// like every other variant, so contrast is never sepia's problem to solve.
const SEPIA_HUE = 46; // warm amber pushed toward yellow (was 38 = redder amber)

const warmTone = (hex: string, lightness: number, satBlend: number): string => {
  const [, s] = rgbToHsl(...hexToRgb(hex));
  const blendedSat = Math.min(s * (1 - satBlend) + 42 * satBlend, 52);
  return rgbToHex(...hslToRgb(SEPIA_HUE, blendedSat, lightness));
};

export interface ThemeVariant {
  xterm: Record<string, string>;
  cssVars: Record<string, string>;
}

export const deriveSepia = <T extends ThemeVariant>(lightVariant: T): T => {
  const src = lightVariant.xterm;
  const bg = warmTone(src.background, 88, 0.7);
  const fg = warmTone(src.foreground, 22, 0.5);
  const xterm = {
    ...src,
    background: bg,
    foreground: fg,
    cursor: warmTone(src.cursor, 20, 0.5),
    cursorAccent: bg,
    selectionBackground: fg,
    selectionForeground: bg,
    black: warmTone(src.black, 25, 0.4),
    white: fg,
    brightBlack: warmTone(src.brightBlack, 45, 0.4),
    brightWhite: warmTone(src.brightWhite, 15, 0.3),
  };
  const cssVars = {
    ...lightVariant.cssVars,
    "--term-bg": bg,
    "--term-pane-bg": bg,
    "--term-fg": fg,
  };
  return { ...lightVariant, xterm, cssVars };
};
