// Text copied from web pages / other agents often carries CRLF line
// endings, non-breaking spaces (common in HTML <pre> blocks), zero-width
// characters, and raw control bytes — pasted raw, these make the shell's line
// editor misbehave, look visibly broken, or (for control bytes like ESC and a
// stray bracketed-paste terminator ESC[201~) act as a paste-injection vector
// that slips out of xterm's bracketed-paste wrapping.
//
// clean() normalises them in a single charCode pass. It is written as a
// charCode filter rather than regexes over invisible characters so this source
// file stays plain ASCII text (no raw control/zero-width bytes embedded in it):
//   - TAB (U+0009) and newline (U+000A) are kept,
//   - all other C0 controls, DEL (U+007F) and C1 controls are dropped,
//   - non-breaking space (U+00A0) becomes a regular space,
//   - zero-width chars (U+200B..U+200D, U+FEFF) are dropped.
const clean = (text: string): string => {
  let out = "";
  for (const ch of text) {
    const c = ch.charCodeAt(0);
    if (c === 0x09 || c === 0x0a) { out += ch; continue; }
    if (c < 0x20 || (c >= 0x7f && c <= 0x9f)) continue;
    if (c === 0xa0) { out += " "; continue; }
    if (c === 0x200b || c === 0x200c || c === 0x200d || c === 0xfeff) continue;
    out += ch;
  }
  return out;
};

export const sanitizePasteText = (text: string): string =>
  clean(text.replace(/\r\n?/g, "\n"));
