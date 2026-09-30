"use client";

// Sticker = a cut-out object with a transparent background, a white die-cut
// border, a thin hand-drawn ink edge and a faint paper grain.
// No frame, no text on the sticker — meta info is rendered outside it.

import type { CutMask } from "./cutter";

/** Longest side of the saved sticker PNG. */
const STICKER_MAX = 520;
/** White border thickness in the saved PNG (≈ 7–10px at typical display sizes). */
const BORDER = 22;
const INK = "#22201c";
const PAD = BORDER + 8;

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

  // Silhouette of the object, used to grow the border.
  const sil = document.createElement("canvas");
  sil.width = w;
  sil.height = h;
  const sctx = sil.getContext("2d")!;
  sctx.drawImage(trimmed, 0, 0, w, h);
  sctx.globalCompositeOperation = "source-in";

  // Radius wobbles a little around the outline so the edge looks drawn by hand.
  const phase = Math.random() * Math.PI * 2;
  const ring = (radius: number, color: string, wobble = 0) => {
    sctx.fillStyle = color;
    sctx.fillRect(0, 0, w, h);
    for (let a = 0; a < 360; a += 6) {
      const r = (a * Math.PI) / 180;
      const rr = radius + wobble * Math.sin(r * 3 + phase) + wobble * 0.5 * Math.sin(r * 7 + phase * 2);
      ctx.drawImage(sil, PAD + Math.cos(r) * rr, PAD + Math.sin(r) * rr);
    }
    ctx.drawImage(sil, PAD, PAD);
  };

  ring(BORDER + 2.6, INK, 1.1); // hand-drawn ink edge
  ring(BORDER, "#fffefb", 1.1); // white border (paper white)

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

/**
 * Cut the object described by `mask` out of `source` and die-cut it.
 * Returns null when the mask is empty or unusable.
 */
export function stickerFromMask(source: HTMLCanvasElement, mask: CutMask): HTMLCanvasElement | null {
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
  cctx.filter = "blur(1px)"; // soften stair-stepped mask edges
  cctx.drawImage(m, 0, 0, source.width, source.height);
  cctx.filter = "none";
  cctx.globalCompositeOperation = "source-in";
  cctx.drawImage(source, 0, 0);
  return dieCut(cut);
}

/** A die-cut sticker made from an emoji (used when no photo was taken). */
export function emojiSticker(emoji: string): HTMLCanvasElement | null {
  const c = document.createElement("canvas");
  c.width = 420;
  c.height = 420;
  const ctx = c.getContext("2d")!;
  ctx.font = '320px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, 210, 225);
  return dieCut(c);
}

export function randomRotation(): number {
  const r = (Math.random() * 7 + 2) * (Math.random() < 0.5 ? -1 : 1);
  return Math.round(r * 10) / 10;
}

/** Small JPEG of a sticker on white, for the AI to name it. */
export async function thumbForNaming(sticker: Blob, size = 256): Promise<Blob> {
  const bmp = await createImageBitmap(sticker);
  const c = document.createElement("canvas");
  const scale = Math.min(1, size / Math.max(bmp.width, bmp.height));
  c.width = Math.max(1, Math.round(bmp.width * scale));
  c.height = Math.max(1, Math.round(bmp.height * scale));
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  return canvasToBlob(c, "image/jpeg", 0.85);
}
