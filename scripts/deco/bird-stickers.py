"""Rebuild the みちび stickers (public/deco/bird-*.png) from the borderless birds
(public/bird/*.webp) with the same die-cut look as photo stickers
(src/lib/sticker/render.ts): a thick white border rounded off like a real
sticker, a thin ink line around it.

    python3 scripts/deco/bird-stickers.py
"""
import math
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

from diecut import die_cut

ROOT = Path(__file__).resolve().parents[2]
POSES = ["back", "flap", "front", "happy", "hop", "perch", "side", "sleepy", "surprise", "walk"]
SIZE = 320          # longest side of the output
# Same proportions as render.ts (BORDER 30 / ROUND 14 / ink 2.6 on a 520px sticker).
K = SIZE / 520
BORDER = 30 * K
ROUND = 14 * K
INK_EDGE = 2.4
PAD = math.ceil(BORDER + ROUND + INK_EDGE + 2)


def build(pose: str) -> Image.Image:
    src = Image.open(ROOT / "public/bird" / f"{pose}.webp").convert("RGBA")
    # Keep only the drawing: the ink lines, whatever they enclose (the white body),
    # and coloured accents. The pale blue ground shadow isn't part of the sticker.
    px = np.array(src).astype(int)
    r, g, b, al = px[..., 0], px[..., 1], px[..., 2], px[..., 3]
    ink = (al > 100) & (r + g + b < 300)
    accent = (al > 100) & (np.max(px[..., :3], -1) - np.min(px[..., :3], -1) > 60) & ~(b > r)
    keep = ndimage.binary_fill_holes(ndimage.binary_closing(ink | accent, iterations=2))
    keep = ndimage.binary_dilation(keep, iterations=1)
    px[..., 3] = np.where(keep, al, 0)
    src = Image.fromarray(px.astype(np.uint8))
    src = src.crop(src.getchannel("A").point(lambda v: 255 if v > 12 else 0).getbbox())
    inner = SIZE - PAD * 2
    s = inner / max(src.size)
    src = src.resize((max(1, round(src.width * s)), max(1, round(src.height * s))), Image.LANCZOS)
    return die_cut(src, np.array(src.getchannel("A")) > 12, BORDER, ROUND, INK_EDGE, pose)

if __name__ == "__main__":
    for p in POSES:
        build(p).save(ROOT / "public/deco" / f"bird-{p}.png", optimize=True)
        print("bird-" + p)
