export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DisplayInfo {
  work: Rect;
  full: Rect;
}

export interface ScreenInfo {
  work: Rect;
  full: Rect;
  displays: DisplayInfo[];
}

export interface PtySpawnOpts {
  cols: number;
  rows: number;
  cwd?: string;
}

export type ChassisStyle =
  | "dark" | "retro" | "white" | "red" | "red-pale" | "phosphor" | "cyberpunk" | "ocean" | "mecha" | "orange" | "orange-pale" | "grape" | "wood"
  // ≤2.2.0 stored cassettes as frame styles; kept so old configs still parse
  // (migrated to the cassette layout MODEs at boot).
  | "cassette1" | "cassette2";

export interface TerminalConfigData {
  shell?: string;
  theme?: number;
  light?: boolean;
  tone?: "dark" | "light" | "sepia";
  border?: "dark" | "retro";
  fontSize?: number;
  worn?: boolean;
  wear?: "new" | "worn" | "cracked" | "glass";
  layout?: "compact" | "full" | "roboterminal" | "robogrip" | "fable"
    | "cassette1-light" | "cassette1-dark" | "cassette2-light" | "cassette2-dark";
  crtMode?: "mask" | "grille" | "slot" | "glass" | "full" | "scanlines" | "vector" | "off";
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
  osc98?: "on" | "led-only" | "off";
}

export interface PtyOrigin {
  cwd: string | null;
  gitRoot: string | null;
}

export interface GitCheckpoint {
  sha: string;
  when: string; // relative, e.g. "3 minutes ago"
  subject: string;
}

export interface GitSaveResult {
  ok: boolean;
  untrackedFiles: number;
}

export interface GitRestoreResult {
  ok: boolean;
  stashed: boolean;
  // True when the user dismissed the native confirmation dialog (step 5) —
  // distinct from ok:false which means the reset was attempted and failed.
  cancelled?: boolean;
}

export interface TerminalApi {
  getScreen: () => Promise<ScreenInfo>;
  setBounds: (b: Rect) => void;
  setFullscreen: (enabled: boolean) => void;
  setAlwaysOnTop: (enabled: boolean) => void;
  setResizable: (enabled: boolean) => void;
  focusWindow(): void;
  minimizeTerminal(): void;
  closeTerminal(): void;
  quit(): void;
  clipWrite(text: string, which?: "selection"): void;
  clipRead(which?: "selection"): Promise<string>;
  openExternal(url: string): void;
  ptyOrigin(ptyId?: number): Promise<PtyOrigin>;
  ptyCwdOf(ptyId?: number): Promise<string | null>;
  gitDiff(ptyId?: number): Promise<string>;
  gitSave(ptyId?: number): Promise<GitSaveResult>;
  gitCheckpoints(ptyId?: number): Promise<GitCheckpoint[]>;
  gitRestoreTo(ptyId: number | undefined, sha: string): Promise<GitRestoreResult>;
  configGet(): Promise<TerminalConfigData>;
  configSet(patch: TerminalConfigData): Promise<boolean>;
  onFullscreenChanged(cb: (fullscreen: boolean) => void): () => void;
  onSetSize(cb: (size: "small" | "tall" | "full") => void): () => void;
  onShowHelp(cb: () => void): () => void;
  onScreenInvalidated(cb: () => void): () => void;
  pty: {
    spawn(o: PtySpawnOpts): Promise<{ id: number; shellFallback: string | null }>;
    write(id: number, data: string): void;
    resize(id: number, cols: number, rows: number): void;
    kill(id: number): void;
    onData(cb: (m: { id: number; data: string }) => void): () => void;
    onExit(cb: (m: { id: number; code: number }) => void): () => void;
  };
}

export const api = (window as unknown as { terminal: TerminalApi }).terminal;
