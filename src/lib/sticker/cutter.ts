"use client";

// Cutters turn "the thing the user tapped in the photo" into an alpha mask.
// Default: MediaPipe Interactive Segmenter, running on-device (no API key).
// If it can't load, we try the server cutout API (remove.bg), and finally a
// soft blob around the tap so the flow never dead-ends.
// To plug in another model/service, implement StickerCutter and add it to CHAIN.

export interface CutPoint {
  /** 0–1, relative to the image. */
  x: number;
  y: number;
}

export interface CutMask {
  width: number;
  height: number;
  /** 0–255 per pixel. */
  alpha: Uint8ClampedArray;
}

export interface StickerCutter {
  readonly name: string;
  /** Called once per photo. Throw if this cutter can't run here. */
  prepare(image: HTMLCanvasElement): Promise<void>;
  maskAt(point: CutPoint): Promise<CutMask | null>;
}

const MEDIAPIPE_VERSION = "1.0.1";
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/interactive_segmenter_v2/magic_touch/int8/1/interactive_segmentation.task";

// ── helpers ───────────────────────────────────────────────

/**
 * Normalise any mask to 0–255, make sure the tapped object is the "on" side,
 * keep only the connected region under the tap, and reject junk.
 */
function cleanMask(raw: ArrayLike<number>, width: number, height: number, point: CutPoint): CutMask | null {
  let max = 0;
  for (let i = 0; i < raw.length; i++) if (raw[i] > max) max = raw[i];
  if (max <= 0) return null;
  const threshold = max / 2;

  const px = Math.min(width - 1, Math.max(0, Math.round(point.x * (width - 1))));
  const py = Math.min(height - 1, Math.max(0, Math.round(point.y * (height - 1))));
  const invert = raw[py * width + px] < threshold; // the tapped pixel must be "object"
  const on = (i: number) => (invert ? raw[i] < threshold : raw[i] >= threshold);

  // Flood fill from the tap (4-neighbour) → keeps a single object.
  const keep = new Uint8Array(width * height);
  const stack = [py * width + px];
  if (!on(stack[0])) return null;
  keep[stack[0]] = 1;
  let area = 0;
  while (stack.length) {
    const i = stack.pop()!;
    area++;
    const x = i % width;
    const y = (i - x) / width;
    const nb = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y > 0 ? i - width : -1, y < height - 1 ? i + width : -1];
    for (const n of nb) {
      if (n >= 0 && !keep[n] && on(n)) {
        keep[n] = 1;
        stack.push(n);
      }
    }
  }

  const ratio = area / (width * height);
  if (ratio < 0.004 || ratio > 0.9) return null; // a speck, or "the whole photo"

  const alpha = new Uint8ClampedArray(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = keep[i] ? 255 : 0;
  return { width, height, alpha };
}

/** Intersection-over-union of two masks (0 when their sizes differ). */
export function maskIoU(a: CutMask, b: CutMask): number {
  if (a.width !== b.width || a.height !== b.height) return 0;
  let inter = 0;
  let union = 0;
  for (let i = 0; i < a.alpha.length; i++) {
    const x = a.alpha[i] > 127;
    const y = b.alpha[i] > 127;
    if (x && y) inter++;
    if (x || y) union++;
  }
  return union === 0 ? 0 : inter / union;
}

/**
 * For automatic candidates: reject masks that look like "the background"
 * (too big, or touching three or more edges of the photo).
 */
export function looksLikeObject(mask: CutMask): boolean {
  const { width: w, height: h, alpha } = mask;
  let area = 0;
  let top = false, bottom = false, left = false, right = false;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (alpha[y * w + x] < 128) continue;
      area++;
      if (y === 0) top = true;
      if (y === h - 1) bottom = true;
      if (x === 0) left = true;
      if (x === w - 1) right = true;
    }
  }
  const edges = [top, bottom, left, right].filter(Boolean).length;
  return area / (w * h) <= 0.6 && edges < 3;
}

/** Where to look for objects automatically: the middle first, then around it. */
export const AUTO_POINTS: CutPoint[] = [
  { x: 0.5, y: 0.5 },
  { x: 0.28, y: 0.32 },
  { x: 0.72, y: 0.32 },
  { x: 0.28, y: 0.72 },
  { x: 0.72, y: 0.72 },
];

// ── MediaPipe (default, on-device) ────────────────────────

type Segmenter = import("@mediapipe/tasks-vision").InteractiveSegmenter;
type BrushMode = import("@mediapipe/tasks-vision").BrushMode;
let segmenterPromise: Promise<Segmenter> | null = null;

async function loadSegmenter(): Promise<Segmenter> {
  segmenterPromise ??= (async () => {
    const { FilesetResolver, InteractiveSegmenter } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
    return InteractiveSegmenter.createFromModelPath(fileset, MODEL_URL);
  })().catch((err) => {
    segmenterPromise = null;
    throw err;
  });
  return segmenterPromise;
}

/** Start downloading the model early (e.g. while the user is walking). */
export function warmUpCutter(): void {
  void loadSegmenter().catch(() => undefined);
}

class MediaPipeCutter implements StickerCutter {
  readonly name = "mediapipe";
  private segmenter: Segmenter | null = null;

  async prepare(image: HTMLCanvasElement) {
    this.segmenter = await loadSegmenter();
    this.segmenter.setImage(image);
  }

  async maskAt(point: CutPoint) {
    if (!this.segmenter) return null;
    // BrushMode is a type-only enum in the bundle; POSITIVE === 1.
    const mask = this.segmenter.segment([
      { brushMode: 1 as BrushMode, point: [{ x: point.x, y: point.y }], isCompleted: true },
    ]);
    const data = mask.hasFloat32Array() ? mask.getAsFloat32Array() : mask.getAsUint8Array();
    const result = cleanMask(data, mask.width, mask.height, point);
    mask.close();
    return result;
  }
}

// ── Server cutout API (remove.bg) ─────────────────────────

class ApiCutter implements StickerCutter {
  readonly name = "api";
  private static unavailable = false;
  private image: HTMLCanvasElement | null = null;
  private cached: CutMask | null | undefined;

  async prepare(image: HTMLCanvasElement) {
    if (ApiCutter.unavailable) throw new Error("cutout API not configured");
    this.image = image;
    this.cached = undefined;
  }

  async maskAt(point: CutPoint) {
    if (!this.image) return null;
    if (this.cached === undefined) this.cached = await this.fetchMask(this.image).catch(() => null);
    if (!this.cached) {
      // API turned out to be unavailable → never dead-end.
      const blob = new BlobCutter();
      await blob.prepare(this.image);
      return blob.maskAt(point);
    }
    return cleanMask(this.cached.alpha, this.cached.width, this.cached.height, point);
  }

  private async fetchMask(image: HTMLCanvasElement): Promise<CutMask | null> {
    const blob = await new Promise<Blob | null>((r) => image.toBlob(r, "image/jpeg", 0.9));
    if (!blob) return null;
    const form = new FormData();
    form.append("image", blob, "photo.jpg");
    const res = await fetch("/api/sticker/cutout", { method: "POST", body: form, signal: AbortSignal.timeout(25_000) });
    if (res.status === 501) {
      ApiCutter.unavailable = true;
      return null;
    }
    if (!res.ok) return null;
    const bmp = await createImageBitmap(await res.blob());
    const c = document.createElement("canvas");
    c.width = image.width;
    c.height = image.height;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(bmp, 0, 0, c.width, c.height);
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    const alpha = new Uint8ClampedArray(c.width * c.height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
    return { width: c.width, height: c.height, alpha };
  }
}

// ── Last resort: organic blob around the tap ──────────────

class BlobCutter implements StickerCutter {
  readonly name = "blob";
  private w = 0;
  private h = 0;

  async prepare(image: HTMLCanvasElement) {
    this.w = image.width;
    this.h = image.height;
  }

  async maskAt(point: CutPoint) {
    const w = 256;
    const h = Math.max(1, Math.round((256 * this.h) / Math.max(1, this.w)));
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    const r = Math.min(w, h) * 0.3;
    const cx = point.x * w;
    const cy = point.y * h;
    ctx.beginPath();
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += Math.PI / 12) {
      const wobble = r * (0.9 + 0.12 * Math.sin(a * 3 + point.x * 7));
      const x = cx + Math.cos(a) * wobble;
      const y = cy + Math.sin(a) * wobble * 0.95;
      if (a === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    const { data } = ctx.getImageData(0, 0, w, h);
    const alpha = new Uint8ClampedArray(w * h);
    for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
    return { width: w, height: h, alpha };
  }
}

// ── chain ────────────────────────────────────────────────

const CHAIN: (() => StickerCutter)[] = [
  () => new MediaPipeCutter(),
  () => new ApiCutter(),
  () => new BlobCutter(),
];

/** Returns the first cutter that can prepare this image. */
export async function prepareCutter(image: HTMLCanvasElement): Promise<StickerCutter> {
  for (const make of CHAIN) {
    const cutter = make();
    try {
      await cutter.prepare(image);
      return cutter;
    } catch (err) {
      console.warn(`[cutter] ${cutter.name} unavailable:`, err);
    }
  }
  const fallback = new BlobCutter();
  await fallback.prepare(image);
  return fallback;
}
