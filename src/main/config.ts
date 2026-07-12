import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, existsSync, writeFileSync, renameSync } from "node:fs";

export type ChassisStyle =
  | "dark" | "retro" | "white" | "red" | "red-pale" | "phosphor" | "cyberpunk" | "ocean" | "mecha" | "orange" | "orange-pale" | "grape" | "wood"
  // ≤2.2.0 stored cassettes as frame styles; kept so old configs still parse
  // (the renderer migrates them to the cassette layout MODEs at boot).
  | "cassette1" | "cassette2";
export type CrtMode = "mask" | "grille" | "slot" | "glass" | "full" | "scanlines" | "vector" | "off";
// Tonal mode. Replaces the old boolean `light`; a third value (sepia) is a
// warm paper tint derived from each theme's light variant. The old `light`
// field is kept for back-compat and folded into `tone` by the renderer at
// boot (see initTone in terminal-main.ts).
export type ThemeTone = "dark" | "light" | "sepia";
// Wear axis: how battered the physical console reads. The old `worn` boolean
// is folded into `wear` by the renderer at boot (see wearLevel init).
export type WearLevel = "new" | "worn" | "cracked" | "glass";

export interface TerminalConfig {
  shell?: string;
  theme?: number;
  /** @deprecated superseded by `tone`; still read for migration. */
  light?: boolean;
  tone?: ThemeTone;
  /** @deprecated superseded by `wear`; still read for migration. */
  worn?: boolean;
  wear?: WearLevel;
  // Bottom-bar layout: "compact" (LOOK menu) or "full" (all 12 F-keys).
  layout?: "compact" | "full" | "roboterminal" | "robogrip" | "fable"
    | "cassette1-light" | "cassette1-dark" | "cassette2-light" | "cassette2-dark";
  border?: "dark" | "retro";
  fontSize?: number;
  crtMode?: CrtMode;
  crtIntensity?: number;
  crtSweep?: boolean;
  crtNoise?: boolean;
  crtChroma?: boolean;
  crtFlicker?: boolean;
  crtVignette?: boolean;
  crtBulge?: boolean;
  outerStyle?: ChassisStyle | null;
  innerStyle?: ChassisStyle | null;
  sfxMuted?: boolean;
  // OSC 98 approval dialogs: "on" (default) | "led-only" (red LED + toast,
  // no dialog, no auto-answer) | "off" (sequence ignored entirely)
  osc98?: "on" | "led-only" | "off";
}

const configPath = join(homedir(), ".agentboy.json");
// Config from before the rename to agentboy
const legacyConfigPath = join(homedir(), ".retro-terminal.json");
const defaultConfig: TerminalConfig = {
  shell: process.env.SHELL || (process.platform === "win32" ? "cmd.exe" : "/bin/bash"),
  theme: 1, // 1 = Dark DMG
  light: false,
  border: "dark",
  fontSize: 14
};

export function loadConfig(): TerminalConfig {
  if (!existsSync(configPath) && existsSync(legacyConfigPath)) {
    try {
      const raw = readFileSync(legacyConfigPath, "utf8");
      const parsed = JSON.parse(raw);
      // Only merge a real object — a legacy file holding a bare 42/"x"/null
      // (or an array) must not spread into a garbage config.
      const legacy = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
      writeFileSync(configPath, JSON.stringify({ ...defaultConfig, ...legacy }, null, 2), "utf8");
    } catch (e) {
      // Fall through to default handling below
    }
  }
  if (!existsSync(configPath)) {
    try {
      writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), "utf8");
    } catch (e) {
      // Ignore if cannot write
    }
    return defaultConfig;
  }
  try {
    const raw = readFileSync(configPath, "utf8");
    const parsed = JSON.parse(raw);
    return { ...defaultConfig, ...parsed };
  } catch (e) {
    return defaultConfig;
  }
}

// Only these keys may reach the file — a patch cannot introduce arbitrary
// fields into the user's config.
const PERSISTED_KEYS = [
  "shell", "theme", "light", "tone", "border", "fontSize",
  "worn", "wear", "layout", "crtMode", "crtIntensity", "crtSweep", "crtNoise", "crtChroma", "crtFlicker", "crtVignette", "crtBulge", "outerStyle", "innerStyle", "sfxMuted",
  "osc98",
] as const;

export function saveConfig(patch: Partial<TerminalConfig>): boolean {
  if (!patch || typeof patch !== "object") return false;
  try {
    const next: Record<string, unknown> = { ...loadConfig() };
    for (const key of PERSISTED_KEYS) {
      if (Object.prototype.hasOwnProperty.call(patch, key)) {
        next[key] = (patch as Record<string, unknown>)[key];
      }
    }
    // Write-then-rename so a crash mid-write cannot leave a truncated config.
    const tmpPath = configPath + ".tmp";
    writeFileSync(tmpPath, JSON.stringify(next, null, 2), "utf8");
    renameSync(tmpPath, configPath);
    return true;
  } catch (e) {
    return false;
  }
}
