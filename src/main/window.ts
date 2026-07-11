import { BrowserWindow, screen } from "electron";
import { join } from "node:path";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function defaultTerminalBounds(): Rect {
  const { workArea } = screen.getPrimaryDisplay();
  const w = Math.floor(workArea.width / 3);
  const h = Math.floor(workArea.height / 2);
  return {
    x: workArea.x,
    y: workArea.y,
    w,
    h,
  };
}

export function terminalColumnBounds(index: number): Rect {
  const { workArea } = screen.getPrimaryDisplay();
  const col = Math.max(0, Math.min(2, index | 0));
  const third = Math.floor(workArea.width / 3);
  const x = col === 2 ? workArea.x + third * 2 : workArea.x + third * col;
  const right = col === 2 ? workArea.x + workArea.width : x + third;
  return {
    x,
    y: workArea.y,
    w: right - x,
    h: workArea.height,
  };
}

export function createTerminalWindow(b: Rect): BrowserWindow {
  const iconPath = join(__dirname, "..", "renderer", "assets", "app-icon.png");
  const win = new BrowserWindow({
    transparent: true,
    frame: false,
    resizable: false,
    movable: true,
    hasShadow: false,
    backgroundColor: "#00000000",
    skipTaskbar: false,
    x: Math.round(b.x),
    y: Math.round(b.y),
    width: Math.round(b.w),
    height: Math.round(b.h),
    title: "terminal",
    icon: iconPath,
    show: false,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.loadFile(join(__dirname, "..", "renderer", "terminal.html"));
  win.once("ready-to-show", () => {
    win.show();
    win.focus();
  });
  return win;
}
