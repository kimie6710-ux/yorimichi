"""Die-cut border shared by the offline scripts — same look as
src/lib/sticker/render.ts: a thick white border rounded off like a real
sticker, a thin wobbly ink line, faint paper grain."""
import math
import random

import numpy as np
from PIL import Image
from scipy import ndimage

INK = (0x22, 0x20, 0x1C)
PAPER = (0xFF, 0xFE, 0xFB)


def die_cut(obj: Image.Image, silhouette: np.ndarray, border: float, round_: float, ink_edge: float, seed: str, grain: bool = False) -> Image.Image:
    """`obj` RGBA (the thing itself), `silhouette` bool mask of the same size."""
    pad = math.ceil(border + round_ + ink_edge + 2)
    W, H = obj.width + pad * 2, obj.height + pad * 2
    sil = np.zeros((H, W), bool)
    sil[pad:pad + obj.height, pad:pad + obj.width] = silhouette
    grown = ndimage.distance_transform_edt(~sil) <= border
    blurred = ndimage.gaussian_filter(grown.astype(float) * 255, round_ * 0.6)
    shape = np.clip((blurred - 96) / (132 - 96), 0, 1)

    rng = random.Random(seed)
    phase = rng.random() * math.tau
    k = border / 30
    ink = np.zeros_like(shape)
    for a in range(0, 360, 6):
        r = math.radians(a)
        rr = ink_edge + 0.9 * k * math.sin(r * 3 + phase) + 0.45 * k * math.sin(r * 7 + phase * 2)
        ink = np.maximum(ink, ndimage.shift(shape, (math.sin(r) * rr, math.cos(r) * rr), order=1))

    out = np.zeros((H, W, 4), float)
    out[..., :3] = INK
    a = shape[..., None]
    out[..., :3] = out[..., :3] * (1 - a) + np.array(PAPER) * a
    out[..., 3] = np.maximum(ink, shape)
    if grain:
        nr = np.random.default_rng(abs(hash(seed)) % 2**32)
        g = nr.random((H, W)) < (1 / 90)
        tone = np.where(nr.random((H, W)) < 0.5, 0, 255)
        amt = (0.035 + nr.random((H, W)) * 0.03)[..., None]
        sel = (g & (shape > 0.5))[..., None]
        out[..., :3] = np.where(sel, out[..., :3] * (1 - amt) + tone[..., None] * amt, out[..., :3])
    img = Image.fromarray((out * [1, 1, 1, 255]).round().astype(np.uint8))
    img.alpha_composite(obj, (pad, pad))
    return img
