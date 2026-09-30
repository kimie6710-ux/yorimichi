# Short washi-tape pieces (both ends torn) from the long tapes in public/deco.
# One continuous stretch of the pattern — nothing is cut up and re-joined.
#   python3 scripts/deco/short-tapes.py
import glob, os, random
from PIL import Image

LENGTH = 190  # px of the original tape (height 72) → about 2.6 : 1

for path in sorted(glob.glob("public/deco/tape-*.png")):
    if path.endswith("-short.png"):
        continue
    name = os.path.basename(path)[:-4]
    random.seed(name)
    src = Image.open(path).convert("RGBA")
    w, h = src.size
    # Keep the original torn left end; tear the right end ourselves.
    piece = src.crop((0, 0, min(LENGTH, w), h))
    px = piece.load()
    pw, ph = piece.size
    depth = 0
    for y in range(ph):
        depth = max(1, min(9, depth + random.choice((-2, -1, 0, 1, 2))))
        for x in range(pw - depth, pw):
            r, g, b, a = px[x, y]
            px[x, y] = (r, g, b, 0)
        # a slightly thinner fibre edge
        x = pw - depth - 1
        r, g, b, a = px[x, y]
        px[x, y] = (r, g, b, a // 2)
    out = f"public/deco/{name}-short.png"
    piece.save(out, optimize=True)
    print(out, piece.size)
