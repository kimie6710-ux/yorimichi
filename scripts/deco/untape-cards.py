# Remove the tape drawn on card frames (tape only goes on corners, added in code).
# Each column under the tape is replaced by a column of the frame's own top
# edge from beside it, shifted up/down so the line runs on smoothly.
#   python3 scripts/deco/untape-cards.py
import colorsys
from PIL import Image


def line_top(px, x, h):
    """First dark (ink) pixel from the top in column x."""
    for y in range(h // 2):
        r, g, b, a = px[x, y]
        if a > 128 and r + g + b < 240:
            return y
    return None


for name in ["card-fold", "card-tape"]:
    im = Image.open(f"public/ui/{name}.png").convert("RGBA")
    out = im.copy()
    w, h = im.size
    px = im.load()
    opx = out.load()
    xs, ys = [], []
    for y in range(0, h // 3):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a < 128:
                continue
            _, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            if s > 0.09 and v > 0.5 and not (abs(r - g) < 12 and abs(g - b) < 12):
                xs.append(x)
                ys.append(y)
    x0, x1, y1 = min(xs) - 10, max(xs) + 10, max(ys) + 14
    span = x1 - x0
    left, right = line_top(px, x0 - 1, h), line_top(px, x1 + 1, h)
    for x in range(x0, x1 + 1):
        sx = x - span - 12  # a clean column of the same edge, to the left
        want = round(left + (right - left) * (x - x0) / span)
        d = want - line_top(px, sx, h)
        for y in range(0, y1):
            sy = y - d
            opx[x, y] = px[sx, sy] if 0 <= sy < h else (0, 0, 0, 0)
    out.save(f"public/ui/{name}-plain.png", optimize=True)
    print(name, "tape", (x0, x1, y1), "edge", left, right)
