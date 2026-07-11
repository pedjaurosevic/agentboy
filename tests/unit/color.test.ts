import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hexToRgb,
  rgbToHex,
  rgbToHsl,
  hslToRgb,
  contrastRatio,
  enforceReadability,
  deriveUserEcho,
  withUserEcho,
  deriveSepia,
  READABLE_KEYS,
} from "../../src/renderer/color";
import { THEME_PRESETS } from "../../src/renderer/themes";

test("hex/rgb round trip", () => {
  assert.deepEqual(hexToRgb("#ff8000"), [255, 128, 0]);
  assert.equal(rgbToHex(255, 128, 0), "#ff8000");
});

test("rgb/hsl round trip stays close", () => {
  for (const hex of ["#0f1a0f", "#c8101e", "#e4d6f8", "#808080"]) {
    const [r, g, b] = hexToRgb(hex);
    const [r2, g2, b2] = hslToRgb(...rgbToHsl(r, g, b));
    assert.ok(Math.abs(r - r2) <= 1 && Math.abs(g - g2) <= 1 && Math.abs(b - b2) <= 1, hex);
  }
});

test("contrastRatio: black vs white is 21:1", () => {
  assert.ok(Math.abs(contrastRatio("#000000", "#ffffff") - 21) < 0.01);
  assert.ok(Math.abs(contrastRatio("#ffffff", "#000000") - 21) < 0.01); // symmetric
  assert.ok(Math.abs(contrastRatio("#808080", "#808080") - 1) < 0.01);
});

test("enforceReadability: every preset variant clears WCAG 4.5:1", () => {
  for (const preset of THEME_PRESETS) {
    for (const variant of [preset.dark.xterm, preset.light.xterm]) {
      const out = enforceReadability(variant) as Record<string, string>;
      for (const key of READABLE_KEYS) {
        const c = out[key];
        if (!c) continue;
        const cr = contrastRatio(c, variant.background);
        assert.ok(cr >= 4.5, `${preset.name} ${key} ${c} vs ${variant.background}: ${cr.toFixed(2)}`);
      }
    }
  }
});

test('enforceReadability: "black" is exempt (backdrop tone, not letters)', () => {
  const theme = { background: "#000000", black: "#000000", foreground: "#888888" };
  const out = enforceReadability(theme) as Record<string, string>;
  assert.equal(out.black, "#000000");
  assert.ok(contrastRatio(out.foreground, "#000000") >= 4.5);
});

test("deriveUserEcho: readable on both poles, never pure white on dark", () => {
  for (const preset of THEME_PRESETS) {
    for (const variant of [preset.dark.xterm, preset.light.xterm]) {
      const echo = deriveUserEcho(variant.foreground, variant.background);
      assert.match(echo, /^#[0-9a-f]{6}$/);
      assert.ok(
        contrastRatio(echo, variant.background) >= 4.5,
        `${preset.name}: ${echo} vs ${variant.background}`
      );
      assert.notEqual(echo, "#ffffff", `${preset.name}: echo must not be stark white`);
    }
  }
});

test("withUserEcho: overrides brightWhite, keeps the rest", () => {
  const theme = { foreground: "#dceccd", background: "#0f1a0f", brightWhite: "#ffffff", red: "#e8aaa2" };
  const out = withUserEcho(theme);
  assert.notEqual(out.brightWhite, "#ffffff");
  assert.equal(out.red, "#e8aaa2");
  assert.equal(out.foreground, "#dceccd");
});

test("deriveSepia: produces a warm background+foreground pair that still clears WCAG after enforceReadability, for every preset", () => {
  for (const preset of THEME_PRESETS) {
    const sepia = deriveSepia(preset.light);
    const readable = enforceReadability(sepia.xterm) as Record<string, string>;
    for (const key of READABLE_KEYS) {
      const c = readable[key];
      if (!c) continue;
      const cr = contrastRatio(c, readable.background);
      assert.ok(cr >= 4.5, `${preset.name} sepia ${key} ${c} vs ${readable.background}: ${cr.toFixed(2)}`);
    }
  }
});

test("deriveSepia: leaves the 16 ANSI accent colors untouched (only paper/text tone shifts)", () => {
  const ACCENT_KEYS = [
    "red", "green", "yellow", "blue", "magenta", "cyan",
    "brightRed", "brightGreen", "brightYellow", "brightBlue", "brightMagenta", "brightCyan",
  ] as const;
  for (const preset of THEME_PRESETS) {
    const sepia = deriveSepia(preset.light);
    for (const key of ACCENT_KEYS) {
      assert.equal(sepia.xterm[key], preset.light.xterm[key], `${preset.name} ${key} should be unchanged`);
    }
  }
});

test("deriveSepia: background reads as a warm/amber hue, not a copy of the light background", () => {
  for (const preset of THEME_PRESETS) {
    const sepia = deriveSepia(preset.light);
    assert.notEqual(sepia.xterm.background, preset.light.xterm.background, preset.name);
    const [h, s] = rgbToHsl(...hexToRgb(sepia.xterm.background));
    assert.ok(h >= 25 && h <= 50, `${preset.name} sepia bg hue ${h} should be amber-ish`);
    assert.ok(s > 5, `${preset.name} sepia bg should not be fully desaturated`);
  }
});
