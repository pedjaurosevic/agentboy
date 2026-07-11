import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

contextBridge.exposeInMainWorld("terminal", {
  getScreen: () => ipcRenderer.invoke("screen:get"),
  setBounds: (b: Rect) => ipcRenderer.send("win:setBounds", b),
  setFullscreen: (enabled: boolean) => ipcRenderer.send("win:setFullscreen", enabled),
  setAlwaysOnTop: (enabled: boolean) => ipcRenderer.send("win:setAlwaysOnTop", enabled),
  setResizable: (enabled: boolean) => ipcRenderer.send("win:setResizable", enabled),
  focusWindow: () => ipcRenderer.send("window:focus"),
  minimizeTerminal: () => ipcRenderer.send("term:minimize"),
  closeTerminal: () => ipcRenderer.send("term:close"),
  quit: () => ipcRenderer.send("app:quit"),
  clipWrite: (text: string, which?: "selection") =>
    ipcRenderer.send("clip:write", { text, which }),
  clipRead: (which?: "selection"): Promise<string> =>
    ipcRenderer.invoke("clip:read", which),
  openExternal: (url: string) => ipcRenderer.send("open:external", url),
  ptyOrigin: (ptyId?: number) => ipcRenderer.invoke("pty:origin", ptyId),
  ptyCwdOf: (ptyId?: number) => ipcRenderer.invoke("pty:cwd", ptyId),
  gitDiff: (ptyId?: number) => ipcRenderer.invoke("git:diff", ptyId),
  gitSave: (ptyId?: number) => ipcRenderer.invoke("git:save", ptyId),
  gitCheckpoints: (ptyId?: number) => ipcRenderer.invoke("git:checkpoints", ptyId),
  gitRestoreTo: (ptyId: number | undefined, sha: string) =>
    ipcRenderer.invoke("git:restoreTo", ptyId, sha),
  configGet: () => ipcRenderer.invoke("config:get"),
  configSet: (patch: Record<string, unknown>) => ipcRenderer.invoke("config:set", patch),
  onFullscreenChanged: (cb: (fullscreen: boolean) => void) => {
    const l = (_e: IpcRendererEvent, fullscreen: boolean) => cb(fullscreen);
    ipcRenderer.on("win:fullscreenChanged", l);
    return () => ipcRenderer.removeListener("win:fullscreenChanged", l);
  },
  onSetSize: (cb: (size: "small" | "tall" | "full") => void) => {
    const l = (_e: IpcRendererEvent, size: "small" | "tall" | "full") => cb(size);
    ipcRenderer.on("term:setSize", l);
    return () => ipcRenderer.removeListener("term:setSize", l);
  },
  onShowHelp: (cb: () => void) => {
    const l = () => cb();
    ipcRenderer.on("show:help", l);
    return () => ipcRenderer.removeListener("show:help", l);
  },
  onScreenInvalidated: (cb: () => void) => {
    const l = () => cb();
    ipcRenderer.on("screen:invalidate", l);
    return () => ipcRenderer.removeListener("screen:invalidate", l);
  },
  pty: {
    spawn: (opts: { cols: number; rows: number; cwd?: string }) =>
      ipcRenderer.invoke("pty:spawn", opts),
    write: (id: number, data: string) =>
      ipcRenderer.send("pty:write", { id, data }),
    resize: (id: number, cols: number, rows: number) =>
      ipcRenderer.send("pty:resize", { id, cols, rows }),
    kill: (id: number) => ipcRenderer.send("pty:kill", { id }),
    onData: (cb: (m: { id: number; data: string }) => void) => {
      const l = (_e: IpcRendererEvent, m: { id: number; data: string }) => cb(m);
      ipcRenderer.on("pty:data", l);
      return () => ipcRenderer.removeListener("pty:data", l);
    },
    onExit: (cb: (m: { id: number; code: number }) => void) => {
      const l = (_e: IpcRendererEvent, m: { id: number; code: number }) => cb(m);
      ipcRenderer.on("pty:exit", l);
      return () => ipcRenderer.removeListener("pty:exit", l);
    },
  },
});
