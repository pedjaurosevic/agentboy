// xterm.js renders SGR "dim" (ESC[2m) by blending the foreground toward the
// background AFTER minimumContrastRatio is applied, so dimmed output from
// agent CLIs (e.g. the echoed user message in Claude Code) washes out to
// near-invisible on light themes. While a light variant is active we strip
// the dim attribute from the PTY stream instead. Stateful per pane: a chunk
// may end mid-escape-sequence, so an incomplete trailing CSI is held back
// and prepended to the next chunk.
export const makeSgrDimFilter = () => {
  let tail = "";
  return (data: string, active: boolean): string => {
    let s = tail + data;
    tail = "";
    if (!active) return s;
    const cut = s.match(/\x1b(\[[0-9;:]*)?$/);
    if (cut) {
      tail = cut[0];
      s = s.slice(0, s.length - cut[0].length);
    }
    return s.replace(/\x1b\[([0-9;:]*)m/g, (full, params: string) => {
      if (!/(^|;)2(;|$)/.test(params)) return full;
      const parts = params.split(";");
      const out: string[] = [];
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        // keep "2" when it is the color-space subparam of 38/48/58 (truecolor)
        if ((p === "38" || p === "48" || p === "58") && parts[i + 1] === "2") {
          out.push(p, ...parts.slice(i + 1, i + 5));
          i += 4;
          continue;
        }
        if ((p === "38" || p === "48" || p === "58") && parts[i + 1] === "5") {
          out.push(p, parts[i + 1], parts[i + 2]);
          i += 2;
          continue;
        }
        if (p === "2") continue;
        out.push(p);
      }
      return out.length ? `\x1b[${out.join(";")}m` : "";
    });
  };
};
