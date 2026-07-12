// When agent output goes quiet, the last rows of the active pane are checked:
// a numbered option menu ("1. …" / "❯ 2. …", possibly inside a box-drawing
// frame) or a y/n question means the agent is waiting on the user → red LED.
// The last non-empty row must itself belong to the prompt block, so the LED
// drops back to idle once the agent prints anything after the menu.
export const CHOICE_LINE_RE = /^[\s│┃|]*(?:[❯>]\s*)?\d+[.)]\s+\S/;
// y/n prompts, anchored to the TAIL of the line so prose that merely mentions
// "(y/n)" mid-sentence doesn't light the LED. Covers:
//   (y/n)  [Y/n]  (yes/no)      — the classic bracketed forms
//   (Y)es/(N)o  (Y)es/(N)o/(A)ll [Yes]:  — aider / lettered menus
// followed optionally by a [default], a "?" or a ":" at end of line.
export const YES_NO_RE =
  /(?:[([](?:y\/n|yes\/no)[)\]]|\(y\)[a-z]*\/\(n\)[a-z]*(?:\/\([a-z]\)[a-z]*)*)\s*(?:\[[^\]]*\])?\s*[:?]?\s*$/i;
export const FRAME_LINE_RE = /^\s*[╰└╭┌│┃├┤]/;
export const HINT_LINE_RE = /\besc\b|enter to|to select|to cancel|to confirm|to navigate/i;

// `lines` are the last non-empty-trimmed rows of the terminal buffer,
// most recent FIRST (as collected by walking the buffer bottom-up).
export const looksLikeChoicePrompt = (lines: string[]): boolean => {
  const lastText = lines.find((t) => t.trim().length > 0) ?? "";
  if (YES_NO_RE.test(lastText)) return true;
  let numbered = 0;
  for (const t of lines) if (CHOICE_LINE_RE.test(t)) numbered++;
  if (numbered < 2) return false;
  return (
    CHOICE_LINE_RE.test(lastText) ||
    FRAME_LINE_RE.test(lastText) ||
    HINT_LINE_RE.test(lastText)
  );
};
