"""Give stickers that were cut before the new border the new one too.

Only the finished PNG was kept, so the object is recovered from it: measure how
wide the old white border is, shave that much off the outline, then die-cut
again (scripts/deco/diecut.py, same look as render.ts).

    python3 scripts/deco/reborder.py --measure     # just report widths
    python3 scripts/deco/reborder.py               # rewrite .data/files/<image_path>
Back up .data/files first (done once: .data/files-before-reborder).
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

from diecut import die_cut

ROOT = Path(__file__).resolve().parents[2]
FILES = ROOT / ".data/files"
SRC = ROOT / ".data/files-before-reborder"   # always rebuild from the originals
STICKER_MAX = 520


def old_border(px: np.ndarray) -> int:
    """Width of the old white border + ink, measured from the outside in."""
    alpha = px[..., 3] > 128
    dist = ndimage.distance_transform_edt(alpha)
    rgb = px[..., :3].astype(int)
    whiteish = (rgb.min(-1) > 225) & (rgb.max(-1) - rgb.min(-1) < 20)
    width = 0
    for d in range(1, 60):
        ring = (dist > d - 1) & (dist <= d)
        if ring.sum() < 20:
            break
        frac = whiteish[ring].mean()
        if d > 5 and frac < 0.75:
            break
        width = d
    return width


def rebuild(path_in: Path, path_out: Path, seed: str) -> tuple[int, tuple[int, int]]:
    im = Image.open(path_in).convert("RGBA")
    px = np.array(im)
    bw = old_border(px)
    alpha = px[..., 3] > 128
    # Shave the old border off (leave 1px: a sliver of white just merges into the new one).
    obj_mask = ndimage.distance_transform_edt(alpha) > max(0, bw - 1)
    obj_mask = ndimage.binary_opening(obj_mask, iterations=1)
    if obj_mask.sum() < 50:
        return bw, im.size
    ys, xs = np.where(obj_mask)
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    soft = ndimage.gaussian_filter(obj_mask.astype(float), 0.7)
    opx = px.copy()
    opx[..., 3] = (np.clip(soft * 1.6 - 0.3, 0, 1) * 255).astype(np.uint8)
    obj = Image.fromarray(opx).crop(box)
    sil = obj_mask[box[1]:box[3], box[0]:box[2]]
    # Same scale as a fresh sticker: border sizes are in the PNG's own pixels.
    out = die_cut(obj, sil, 30, 14, 2.6, seed, grain=True)
    if max(out.size) > STICKER_MAX + 60:
        k = STICKER_MAX / max(out.size)
        out = out.resize((round(out.width * k), round(out.height * k)), Image.LANCZOS)
    out.save(path_out, optimize=True)
    return bw, out.size


if __name__ == "__main__":
    db = json.loads((ROOT / ".data/db.json").read_text())
    paths = sorted({s["image_path"] for s in db["stickers"] if s.get("image_path")})
    measure = "--measure" in sys.argv
    for p in paths:
        src = SRC / p
        if not src.exists():
            print("missing", p)
            continue
        if measure:
            print(old_border(np.array(Image.open(src).convert("RGBA"))), Image.open(src).size, p[-40:])
        else:
            bw, size = rebuild(src, FILES / p, p)
            print(bw, size, p[-40:])
