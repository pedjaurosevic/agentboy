// Chassis SVG painters — pure functions that build the data-URI backgrounds for
// the shell's wear/finish/frame looks. Extracted verbatim from terminal-main.ts
// (they take everything via arguments and close over nothing), so the monolith's
// main() shrinks and these stay independently readable. Consumers: the frame /
// wear appliers in terminal-main.ts.

// ---- worn filter assets ----------------------------------------------------
// Battle damage as a single stretched SVG layer — irregular scratches (dark
// gouge + offset light catch), a sticker ghost with glue shadow on the
// bottom strip, and polished scuff swipes. Geometry hugs the visible shell:
// top bar, bottom strip, side rails — the middle is hidden behind the
// screen. Two ink sets: "dk" marks are gouges, "lt" marks catch the light.
export const wornSvg = (dk: string, lt: string) =>
  "url(\"data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 900 660' preserveAspectRatio='xMidYMid slice'>` +
      `<g fill='none' stroke-linecap='round'>` +
      `<g stroke='${dk}' stroke-width='1.1'>` +
      `<path d='M42 651 L178 639'/><path d='M700 616 l 92 15'/>` +
      `<path d='M250 646 l 20 -7'/><path d='M545 608 l 28 5'/>` +
      `<path d='M64 18 l 74 11'/><path d='M818 38 l -58 26'/>` +
      `<path d='M6 320 l 3 74'/><path d='M893 210 l -3 88'/>` +
      `</g>` +
      `<g stroke='${lt}' stroke-width='0.7'>` +
      `<path d='M43 652.2 L179 640.2'/><path d='M700.6 617.4 l 92 15'/>` +
      `<path d='M545.6 609.3 l 28 5'/><path d='M64.6 19.2 l 74 11'/>` +
      `</g>` +
      `</g>` +
      `<g transform='rotate(-2.5 548 629)'>` +
      `<rect x='505' y='614' width='86' height='30' fill='${lt}' opacity='0.45'/>` +
      `<rect x='505' y='614' width='86' height='30' fill='none' stroke='${dk}' stroke-width='1' opacity='0.6'/>` +
      `<path d='M505 614 l 14 0 l -14 12 z' fill='${dk}' opacity='0.35'/>` +
      `</g>` +
      `<ellipse cx='140' cy='648' rx='62' ry='7' fill='${lt}' opacity='0.28'/>` +
      `<ellipse cx='760' cy='634' rx='40' ry='6' fill='${dk}' opacity='0.30'/>` +
      `<ellipse cx='450' cy='14' rx='90' ry='6' fill='${dk}' opacity='0.22'/>` +
      `</svg>`
  ) +
  "\")";

// Cracked: a branching fracture radiating from the upper-left, drawn as a
// dark fissure with a light stress-highlight offset a hair below it. Layers
// ON TOP of the worn grime (cracked = worn + fractures).
export const crackSvg = (dk: string, lt: string) =>
  "url(\"data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 900 660' preserveAspectRatio='xMidYMid slice'>` +
      `<g fill='none' stroke-linecap='round' stroke-linejoin='round'>` +
      `<g stroke='${dk}' stroke-width='2.4'>` +
      `<path d='M150 0 L176 44 L150 92 L196 150 L168 214 L214 300'/>` +
      `<path d='M176 44 L232 60'/><path d='M196 150 L150 178'/>` +
      `<path d='M168 214 L108 232'/><path d='M214 300 L262 322 L250 372'/>` +
      `<path d='M820 640 L788 590 L826 548 L792 500'/><path d='M788 590 L734 604'/>` +
      `</g>` +
      `<g stroke='${lt}' stroke-width='1.1'>` +
      `<path d='M152 1 L178 45 L152 93 L198 151 L170 215 L216 301'/>` +
      `<path d='M822 641 L790 591 L828 549'/>` +
      `</g>` +
      `</g>` +
      `</svg>`
  ) +
  "\")";

// Glass wear: hairline fractures in the SCREEN glass (not the plastic). Each
// crack is its own fixed-size background layer anchored to a corner/edge so
// none stretch with the window; together they read as a few splinters
// scattered across the tube. dk = the gouge stroke, lt = the light-catch
// stroke (offset a hair) that reads as refraction. Returns a full CSS
// `background` shorthand (comma-joined layers) for the .gb-crack overlay.
const glassLayer = (paths: string, vb: string, dk: string, lt: string) =>
  "url(\"data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='${vb}'>` +
      `<g fill='none' stroke-linecap='round'>` +
      `<g stroke='${dk}' stroke-width='1.1'>${paths}</g>` +
      `<g stroke='${lt}' stroke-width='0.7' transform='translate(0.8 0.8)'>${paths}</g>` +
      `</g></svg>`
  ) +
  "\")";
export const glassCracksSvg = (dk: string, lt: string) => {
  // top-right splinter (the original dystopian crack, kept), plus a small
  // bottom-left splinter and a short mid-right fissure.
  const topRight =
    `<path d='M219 14 L197 30 L173 39 L152 60 L138 68 L121 88 L114 103'/>` +
    `<path d='M197 30 L189 12'/><path d='M173 39 L154 28 L140 27'/>` +
    `<path d='M152 60 L163 82 L158 101'/><path d='M138 68 L116 72 L101 66'/>` +
    `<path d='M121 88 L104 96'/>`;
  const bottomLeft =
    `<path d='M2 172 L26 158 L44 168 L60 154 L78 160'/>` +
    `<path d='M26 158 L22 136'/><path d='M44 168 L50 190'/>`;
  const midRight =
    `<path d='M138 4 L126 26 L132 52 L120 74'/><path d='M126 26 L104 20'/>`;
  return [
    glassLayer(topRight, "0 0 220 120", dk, lt) + " no-repeat top right / 210px auto",
    glassLayer(bottomLeft, "0 0 80 200", dk, lt) + " no-repeat 5% 82% / 84px auto",
    glassLayer(midRight, "0 0 140 80", dk, lt) + " no-repeat 92% 34% / 140px auto",
  ].join(", ");
};

// Mecha: exposed industrial shell — brushed-metal ground, riveted panel
// seams, corner bolts. Replaces the plastic look entirely (not a filter).
export const mechaPanelsSvg = (line: string, rivet: string, hi: string) =>
  "url(\"data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 900 660' preserveAspectRatio='xMidYMid slice'>` +
      `<g stroke='${line}' stroke-width='2' fill='none'>` +
      `<path d='M0 96 H900'/><path d='M0 566 H900'/><path d='M156 0 V96'/><path d='M744 0 V96'/><path d='M156 566 V660'/><path d='M744 566 V660'/>` +
      `</g>` +
      `<g fill='${rivet}'>` +
      [24, 156, 300, 450, 600, 744, 876].map((x) => `<circle cx='${x}' cy='22' r='6.5'/><circle cx='${x}' cy='638' r='6.5'/>`).join("") +
      `<circle cx='22' cy='300' r='6.5'/><circle cx='878' cy='300' r='6.5'/>` +
      `</g>` +
      `<g fill='${hi}'>` +
      [24, 156, 300, 450, 600, 744, 876].map((x) => `<circle cx='${x - 2}' cy='20' r='2.2'/>`).join("") +
      `</g>` +
      `</svg>`
  ) +
  "\")";

// Atomic Orange: translucent orange plastic with PCB traces and pads.
export const orangePcbSvg = () =>
  "url(\"data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 900 660' preserveAspectRatio='xMidYMid slice'>` +
      `<g stroke='rgba(255, 160, 0, 0.28)' stroke-width='1.5' fill='none'>` +
        `<rect x='380' y='360' width='140' height='140' rx='8' stroke='rgba(255, 160, 0, 0.4)' stroke-width='2'/>` +
        `<path d='M380 430 H250 M520 430 H650'/>` +
        `<path d='M450 360 V280 M450 500 V580'/>` +
        `<path d='M250 430 L210 390 H80'/>` +
        `<path d='M650 430 L690 470 H820'/>` +
        `<path d='M450 280 L400 230 V80'/>` +
        `<path d='M450 580 L490 620 H800'/>` +
        `<path d='M80 390 L50 360 V100'/>` +
        `<path d='M820 470 L850 500 V560'/>` +
        `<path d='M156 120 H300 L340 160 V220'/>` +
        `<path d='M744 120 H600 L560 160 V220'/>` +
        `<rect x='180' y='180' width='80' height='120' rx='4' stroke='rgba(255, 160, 0, 0.35)'/>` +
        `<rect x='640' y='180' width='80' height='120' rx='4' stroke='rgba(255, 160, 0, 0.35)'/>` +
        `<path d='M260 240 H380'/>` +
        `<path d='M640 240 H520'/>` +
      `</g>` +
      `<g fill='rgba(255, 200, 80, 0.45)'>` +
        `<circle cx='380' cy='430' r='3'/><circle cx='520' cy='430' r='3'/>` +
        `<circle cx='450' cy='360' r='3'/><circle cx='450' cy='500' r='3'/>` +
        `<circle cx='250' cy='430' r='3'/><circle cx='650' cy='430' r='3'/>` +
        `<circle cx='450' cy='280' r='3'/><circle cx='450' cy='580' r='3'/>` +
        `<circle cx='80' cy='390' r='3'/><circle cx='820' cy='470' r='3'/>` +
        `<circle cx='180' cy='200' r='2.5'/><circle cx='180' cy='220' r='2.5'/><circle cx='180' cy='240' r='2.5'/><circle cx='180' cy='260' r='2.5'/>` +
        `<circle cx='720' cy='200' r='2.5'/><circle cx='720' cy='220' r='2.5'/><circle cx='720' cy='240' r='2.5'/><circle cx='720' cy='260' r='2.5'/>` +
      `</g>` +
    `</svg>`
  ) +
  "\")";

// Grape GBC: translucent purple plastic with silver PCB traces and pads.
export const grapePcbSvg = () =>
  "url(\"data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 900 660' preserveAspectRatio='xMidYMid slice'>` +
      `<g stroke='rgba(255, 255, 255, 0.16)' stroke-width='1.5' fill='none'>` +
        `<rect x='380' y='360' width='140' height='140' rx='8' stroke='rgba(255, 255, 255, 0.25)' stroke-width='2'/>` +
        `<path d='M380 430 H250 M520 430 H650'/>` +
        `<path d='M450 360 V280 M450 500 V580'/>` +
        `<path d='M250 430 L210 390 H80'/>` +
        `<path d='M650 430 L690 470 H820'/>` +
        `<path d='M450 280 L400 230 V80'/>` +
        `<path d='M450 580 L490 620 H800'/>` +
        `<path d='M80 390 L50 360 V100'/>` +
        `<path d='M820 470 L850 500 V560'/>` +
        `<path d='M156 120 H300 L340 160 V220'/>` +
        `<path d='M744 120 H600 L560 160 V220'/>` +
        `<rect x='180' y='180' width='80' height='120' rx='4' stroke='rgba(255, 255, 255, 0.2)'/>` +
        `<rect x='640' y='180' width='80' height='120' rx='4' stroke='rgba(255, 255, 255, 0.2)'/>` +
        `<path d='M260 240 H380'/>` +
        `<path d='M640 240 H520'/>` +
      `</g>` +
      `<g fill='rgba(200, 220, 255, 0.35)'>` +
        `<circle cx='380' cy='430' r='3'/><circle cx='520' cy='430' r='3'/>` +
        `<circle cx='450' cy='360' r='3'/><circle cx='450' cy='500' r='3'/>` +
        `<circle cx='250' cy='430' r='3'/><circle cx='650' cy='430' r='3'/>` +
        `<circle cx='450' cy='280' r='3'/><circle cx='450' cy='580' r='3'/>` +
        `<circle cx='80' cy='390' r='3'/><circle cx='820' cy='470' r='3'/>` +
        `<circle cx='180' cy='200' r='2.5'/><circle cx='180' cy='220' r='2.5'/><circle cx='180' cy='240' r='2.5'/><circle cx='180' cy='260' r='2.5'/>` +
        `<circle cx='720' cy='200' r='2.5'/><circle cx='720' cy='220' r='2.5'/><circle cx='720' cy='240' r='2.5'/><circle cx='720' cy='260' r='2.5'/>` +
      `</g>` +
    `</svg>`
  ) +
  "\")";

// Woodgrain: vintage walnut wood finish.
export const woodgrainSvg = () =>
  "url(\"data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 900 660' preserveAspectRatio='xMidYMid slice'>` +
      `<g stroke='rgba(60, 30, 10, 0.14)' stroke-width='2' fill='none'>` +
        `<path d='M0 50 Q 225 80 450 50 T 900 50'/>` +
        `<path d='M0 120 Q 300 160 600 120 T 900 120'/>` +
        `<path d='M0 200 Q 150 250 450 200 T 900 200'/>` +
        `<path d='M0 280 Q 400 320 700 280 T 900 280'/>` +
        `<path d='M0 360 Q 250 420 500 360 T 900 360'/>` +
        `<path d='M0 450 Q 350 500 750 450 T 900 450'/>` +
        `<path d='M0 530 Q 200 600 550 530 T 900 530'/>` +
        `<path d='M0 600 Q 450 640 900 600'/>` +
      `</g>` +
      `</svg>`
  ) +
  "\")";

export const MECHA_METAL_DARK =
  "repeating-linear-gradient(94deg, rgba(255,255,255,0.06) 0 2px, rgba(0,0,0,0.07) 2px 4px), " +
  "linear-gradient(180deg, #6b7079 0%, #565b63 55%, #40434a 100%)";
export const MECHA_METAL_LIGHT =
  "repeating-linear-gradient(94deg, rgba(255,255,255,0.09) 0 2px, rgba(0,0,0,0.05) 2px 4px), " +
  "linear-gradient(180deg, #d7dbe0 0%, #c2c6cc 55%, #aab0b7 100%)";
