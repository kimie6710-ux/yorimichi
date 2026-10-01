"use client";

// Sticker = a cut-out object with a transparent background, a white die-cut
// border, a thin hand-drawn ink edge and a faint paper grain.
// No frame, no text on the sticker — meta info is rendered outside it.

import type { CutMask } from "./cutter";

/** Longest side of the saved sticker PNG. */
const STICKER_MAX = 520;
/** White border thickness in the saved PNG (≈ 10–13px at typical display sizes). */
const BORDER = 30;
/** How much the border's outline is rounded off (spikes and narrow gaps melt into soft curves). */
const ROUND = 14;
const INK = "#22201c";
const INK_EDGE = 2.6;
const PAD = BORDER + ROUND;

export async function loadBitmap(blob: Blob): Promise<ImageBitmap> {
  return createImageBitmap(blob, { imageOrientation: "from-image" });
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png", quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("canvas.toBlob failed"))), type, quality),
  );
}

/** Draw a bitmap into a canvas no larger than maxDim (keeps aspect). */
export function toCanvas(bitmap: ImageBitmap, maxDim: number): HTMLCanvasElement {
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bitmap.width * scale);
  c.height = Math.round(bitmap.height * scale);
  c.getContext("2d")!.drawImage(bitmap, 0, 0, c.width, c.height);
  return c;
}

/** Shrink a camera photo before upload/storage (the original is kept as photo_url). */
export async function downscaleToJpeg(bitmap: ImageBitmap, maxDim = 1600, quality = 0.85): Promise<Blob> {
  return canvasToBlob(toCanvas(bitmap, maxDim), "image/jpeg", quality);
}

function trimToAlpha(src: HTMLCanvasElement): HTMLCanvasElement | null {
  const ctx = src.getContext("2d", { willReadFrequently: true })!;
  const { data, width, height } = ctx.getImageData(0, 0, src.width, src.height);
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 12) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const out = document.createElement("canvas");
  out.width = maxX - minX + 1;
  out.height = maxY - minY + 1;
  out.getContext("2d")!.drawImage(src, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

/**
 * Turn any transparent image into a die-cut sticker:
 * trim → scale → faint vinyl edge → thick white border → the object on top.
 */
export function dieCut(transparent: HTMLCanvasElement): HTMLCanvasElement | null {
  const trimmed = trimToAlpha(transparent);
  if (!trimmed) return null;

  const inner = STICKER_MAX - PAD * 2;
  const s = Math.min(1, inner / Math.max(trimmed.width, trimmed.height)) || 1;
  const w = Math.max(1, Math.round(trimmed.width * s));
  const h = Math.max(1, Math.round(trimmed.height * s));

  const out = document.createElement("canvas");
  out.width = w + PAD * 2;
  out.height = h + PAD * 2;
  const ctx = out.getContext("2d")!;

  // Silhouette of the object.
  const sil = document.createElement("canvas");
  sil.width = w;
  sil.height = h;
  const sctx = sil.getContext("2d")!;
  sctx.drawImage(trimmed, 0, 0, w, h);
  sctx.globalCompositeOperation = "source-in";
  sctx.fillRect(0, 0, w, h);

  // Grow it by the border width, then round it off like a die-cut sticker:
  // blur and re-threshold, so corners become curves and thin gaps fill in.
  const grown = blank(out.width, out.height);
  const gctx = grown.getContext("2d")!;
  for (let a = 0; a < 360; a += 5) {
    const r = (a * Math.PI) / 180;
    gctx.drawImage(sil, PAD + Math.cos(r) * BORDER, PAD + Math.sin(r) * BORDER);
  }
  for (let rr = BORDER * 0.5; rr > 0; rr -= BORDER * 0.5) {
    for (let a = 0; a < 360; a += 15) {
      const r = (a * Math.PI) / 180;
      gctx.drawImage(sil, PAD + Math.cos(r) * rr, PAD + Math.sin(r) * rr);
    }
  }
  gctx.drawImage(sil, PAD, PAD);
  const shape = smoothShape(grown, ROUND);

  // Thin hand-drawn ink line just outside the white, wobbling a little.
  const phase = Math.random() * Math.PI * 2;
  const inkShape = tint(shape, INK);
  for (let a = 0; a < 360; a += 6) {
    const r = (a * Math.PI) / 180;
    const rr = INK_EDGE + 0.9 * Math.sin(r * 3 + phase) + 0.45 * Math.sin(r * 7 + phase * 2);
    ctx.drawImage(inkShape, Math.cos(r) * rr, Math.sin(r) * rr);
  }
  ctx.drawImage(tint(shape, "#fffefb"), 0, 0); // white border (paper white)

  // The object, slightly calmed down (a touch less saturated, a touch warm).
  ctx.filter = "saturate(0.9) sepia(0.08) contrast(1.02)";
  ctx.drawImage(trimmed, PAD, PAD, w, h);
  ctx.filter = "none";

  // Faint paper grain over the whole sticker (only where it's opaque).
  ctx.globalCompositeOperation = "source-atop";
  for (let i = 0; i < (out.width * out.height) / 90; i++) {
    const g = Math.random() < 0.5 ? 0 : 255;
    ctx.fillStyle = `rgba(${g},${g},${g},${0.035 + Math.random() * 0.03})`;
    ctx.fillRect(Math.random() * out.width, Math.random() * out.height, 1.4, 1.4);
  }
  ctx.globalCompositeOperation = "source-over";
  return out;
}

function blank(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/** Blur a silhouette and cut it again at the middle: a rounder, smoother outline with a soft anti-aliased edge. */
function smoothShape(src: HTMLCanvasElement, radius: number): HTMLCanvasElement {
  const c = blank(src.width, src.height);
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.filter = `blur(${radius * 0.6}px)`;
  ctx.drawImage(src, 0, 0);
  ctx.filter = "none";
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  // Cut a little below half, so concave dips fill in rather than eat into the border.
  const lo = 96, hi = 132;
  for (let i = 3; i < d.length; i += 4) {
    const a = d[i];
    d[i] = a <= lo ? 0 : a >= hi ? 255 : Math.round(((a - lo) / (hi - lo)) * 255);
    d[i - 3] = d[i - 2] = d[i - 1] = 0;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** The same shape, filled with one colour. */
function tint(shape: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const c = blank(shape.width, shape.height);
  const ctx = c.getContext("2d")!;
  ctx.drawImage(shape, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

/** The object alone (transparent around it), at the source's size. */
function maskedCanvas(source: HTMLCanvasElement, mask: CutMask): HTMLCanvasElement {
  // Alpha canvas at mask resolution → scaled (smoothly) to the source size.
  const m = document.createElement("canvas");
  m.width = mask.width;
  m.height = mask.height;
  const mctx = m.getContext("2d")!;
  const img = mctx.createImageData(mask.width, mask.height);
  for (let i = 0; i < mask.alpha.length; i++) {
    img.data[i * 4 + 3] = mask.alpha[i];
  }
  mctx.putImageData(img, 0, 0);

  const cut = document.createElement("canvas");
  cut.width = source.width;
  cut.height = source.height;
  const cctx = cut.getContext("2d")!;
  // Masks from the cutter are at photo size already; only low-res ones (fallbacks) need softening.
  cctx.filter = mask.width >= source.width * 0.9 ? "blur(0.4px)" : "blur(1px)";
  cctx.drawImage(m, 0, 0, source.width, source.height);
  cctx.filter = "none";
  cctx.globalCompositeOperation = "source-in";
  cctx.drawImage(source, 0, 0);
  return cut;
}

/**
 * Cut the object described by `mask` out of `source` and die-cut it.
 * Returns null when the mask is empty or unusable.
 */
export function stickerFromMask(source: HTMLCanvasElement, mask: CutMask): HTMLCanvasElement | null {
  return dieCut(maskedCanvas(source, mask));
}

/**
 * The object as it really looks — no sticker border — cropped and set on
 * white. This is what the recogniser looks at.
 */
export function plainFromMask(source: HTMLCanvasElement, mask: CutMask): HTMLCanvasElement | null {
  let x0 = mask.width, y0 = mask.height, x1 = -1, y1 = -1;
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      if (mask.alpha[y * mask.width + x] < 128) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  const kx = source.width / mask.width;
  const ky = source.height / mask.height;
  const pad = 0.06;
  const bw = (x1 - x0 + 1) * kx;
  const bh = (y1 - y0 + 1) * ky;
  const sx = Math.max(0, x0 * kx - bw * pad);
  const sy = Math.max(0, y0 * ky - bh * pad);
  const sw = Math.min(source.width - sx, bw * (1 + 2 * pad));
  const sh = Math.min(source.height - sy, bh * (1 + 2 * pad));
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(sw));
  out.height = Math.max(1, Math.round(sh));
  const ctx = out.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(maskedCanvas(source, mask), sx, sy, sw, sh, 0, 0, out.width, out.height);
  return out;
}

export function randomRotation(): number {
  const r = (Math.random() * 7 + 2) * (Math.random() < 0.5 ? -1 : 1);
  return Math.round(r * 10) / 10;
}

