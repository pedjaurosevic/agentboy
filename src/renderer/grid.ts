// Pure geometry for the 3×2 snap grid and display picking. No window/DOM
// access — callers pass the window centre point explicitly.
import type { Rect } from "./terminal-api";

export const containsPoint = (r: Rect, x: number, y: number): boolean =>
  x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

export const distanceToRect = (r: Rect, x: number, y: number): number => {
  const dx = x < r.x ? r.x - x : x > r.x + r.w ? x - (r.x + r.w) : 0;
  const dy = y < r.y ? r.y - y : y > r.y + r.h ? y - (r.y + r.h) : 0;
  return dx * dx + dy * dy;
};

// Which of the three columns is closest to the given centre x.
export const nearestColumn = (work: Rect, cx: number): number => {
  const colCentres = [0, 1, 2].map((i) => work.x + (work.w * (i + 0.5)) / 3);
  let col = 0;
  for (let i = 1; i < 3; i++)
    if (Math.abs(colCentres[i] - cx) < Math.abs(colCentres[col] - cx)) col = i;
  return col;
};

export const rowFor = (work: Rect, cy: number): 0 | 1 =>
  cy < work.y + work.h / 2 ? 0 : 1;

export const gridRectFor = (
  work: Rect,
  col: number,
  row: number,
  fullHeight: boolean,
  coverToolbar: boolean = false,
  fullBounds: Rect = work
): Rect => {
  const third = Math.floor(work.w / 3);
  const x = col === 2 ? work.x + third * 2 : work.x + third * col;
  const right = col === 2 ? work.x + work.w : x + third;
  if (fullHeight) {
    return coverToolbar
      ? { x, y: fullBounds.y, w: right - x, h: fullBounds.h }
      : { x, y: work.y, w: right - x, h: work.h };
  }

  const half = Math.floor(work.h / 2);
  const y = row === 1 ? work.y + half : work.y;
  const bottom = row === 1 ? work.y + work.h : y + half;
  return { x, y, w: right - x, h: bottom - y };
};
