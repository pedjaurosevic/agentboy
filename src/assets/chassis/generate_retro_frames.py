#!/usr/bin/env python3
"""Generate retro-futuristic terminal frame PNGs.

The app stretches each image to the current window. The three source ratios
match the terminal snap modes closely enough to keep bevels and corner details
intentional: 1/6 screen, 1/3 screen, and fullscreen.
"""

import os
from PIL import Image, ImageDraw, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, "build")

FRAMES = {
    "frame-sixth": (640, 480, 28),
    "frame-third": (640, 960, 28),
    "frame-full": (1920, 1080, 34),
}

BODY = (28, 35, 36, 245)
BODY_2 = (66, 78, 76, 230)
EDGE = (157, 211, 188, 210)
EDGE_DIM = (52, 91, 86, 180)
GLOW = (80, 255, 210, 95)
PINK = (207, 82, 169, 210)
AMBER = (242, 184, 83, 210)
SHADOW = (4, 8, 9, 220)


def rect(draw, box, fill, outline=None, width=1):
    x0, y0, x1, y1 = box
    box = (min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1))
    draw.rounded_rectangle(box, radius=0, fill=fill, outline=outline, width=width)


def line_pixels(draw, xy, fill, width=1):
    draw.line(xy, fill=fill, width=width)


def panel_gradient(w, h):
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    px = img.load()
    for y in range(h):
        for x in range(w):
            t = (x / max(1, w - 1)) * 0.55 + (y / max(1, h - 1)) * 0.45
            r = round(BODY[0] * (1 - t) + BODY_2[0] * t)
            g = round(BODY[1] * (1 - t) + BODY_2[1] * t)
            b = round(BODY[2] * (1 - t) + BODY_2[2] * t)
            px[x, y] = (r, g, b, 244)
    return img


def draw_corner(draw, x, y, sx, sy, b):
    s = max(18, b - 4)
    line_pixels(draw, [(x, y + s), (x, y), (x + s, y)], EDGE, 3)
    line_pixels(draw, [(x + sx * 7, y + sy * 20), (x + sx * 20, y + sy * 7)], PINK, 2)
    for i, c in enumerate((GLOW, EDGE_DIM, AMBER)):
      ox = sx * (10 + i * 8)
      oy = sy * (s - 4 - i * 7)
      rect(draw, (x + ox, y + oy, x + ox + sx * 4, y + oy + sy * 4), c)


def draw_ticks(draw, w, h, b):
    step = 48
    for x in range(b + 24, w - b - 24, step):
        line_pixels(draw, [(x, 8), (x + 10, 8)], EDGE_DIM, 1)
        line_pixels(draw, [(x, h - 9), (x + 10, h - 9)], EDGE_DIM, 1)
    for y in range(b + 28, h - b - 28, step):
        line_pixels(draw, [(8, y), (8, y + 10)], EDGE_DIM, 1)
        line_pixels(draw, [(w - 9, y), (w - 9, y + 10)], EDGE_DIM, 1)


def generate(name, w, h, b):
    img = panel_gradient(w, h)
    draw = ImageDraw.Draw(img)

    outer = (0, 0, w - 1, h - 1)
    inner = (b, b, w - b - 1, h - b - 1)
    rect(draw, outer, None, SHADOW, 4)
    rect(draw, (4, 4, w - 5, h - 5), None, EDGE_DIM, 2)
    rect(draw, (10, 10, w - 11, h - 11), None, EDGE, 1)

    # Transparent viewport: the live terminal renders here.
    cut = Image.new("L", (w, h), 0)
    cut_draw = ImageDraw.Draw(cut)
    cut_draw.rectangle(inner, fill=255)
    alpha = img.getchannel("A")
    alpha.paste(0, mask=cut)
    img.putalpha(alpha)

    draw = ImageDraw.Draw(img)
    rect(draw, (b - 5, b - 5, w - b + 4, h - b + 4), None, SHADOW, 3)
    rect(draw, (b - 2, b - 2, w - b + 1, h - b + 1), None, EDGE, 1)
    rect(draw, (b + 2, b + 2, w - b - 3, h - b - 3), None, EDGE_DIM, 1)

    draw_corner(draw, 13, 13, 1, 1, b)
    draw_corner(draw, w - 14, 13, -1, 1, b)
    draw_corner(draw, 13, h - 14, 1, -1, b)
    draw_corner(draw, w - 14, h - 14, -1, -1, b)
    draw_ticks(draw, w, h, b)

    # Small status rails differ per mode so each frame has its own identity.
    rail = max(90, min(260, w // 5))
    rect(draw, (w // 2 - rail, 13, w // 2 + rail, 17), EDGE_DIM)
    for i in range(0, rail * 2, 18):
        color = GLOW if i % 36 == 0 else PINK
        rect(draw, (w // 2 - rail + i, 12, w // 2 - rail + i + 8, 18), color)
    if name == "frame-full":
        for x in (w // 4, w // 2, (w * 3) // 4):
            line_pixels(draw, [(x - 40, h - 16), (x + 40, h - 16)], AMBER, 2)

    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    rect(gdraw, (b - 1, b - 1, w - b, h - b), None, GLOW, 3)
    glow = glow.filter(ImageFilter.GaussianBlur(5))
    img = Image.alpha_composite(glow, img)
    return img


def main():
    os.makedirs(BUILD, exist_ok=True)
    for name, (w, h, b) in FRAMES.items():
        out = os.path.join(BUILD, f"{name}.png")
        generate(name, w, h, b).save(out)
        print(f"{name}: {w}x{h} -> {out}")


if __name__ == "__main__":
    main()
