"use client";

// Cutters turn "the thing in the photo" into an alpha mask that follows its shape.
// Default: SlimSAM (a small Segment Anything), on-device — the photo is
// studied once (~2–4s), then each cut takes a few hundredths of a second.
// If it can't load, we try the server cutout API (remove.bg), and finally a
// soft blob so the flow never dead-ends.
// To plug in another model/service, implement StickerCutter and add it to CHAIN.

import { devices, loadOn, loadTf, withTimeout } from "@/lib/vision/runtime";

export { within } from "@/lib/vision/runtime";

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
  const stack = new Int32Array(width * height);
  let top = 0;
  const start = py * width + px;
  if (!on(start)) return null;
  keep[start] = 1;
  stack[top++] = start;
  let area = 0;
  const visit = (n: number) => {
    if (!keep[n] && on(n)) {
      keep[n] = 1;
      stack[top++] = n;
    }
  };
  while (top > 0) {
    const i = stack[--top];
    area++;
    const x = i % width;
    if (x > 0) visit(i - 1);
    if (x < width - 1) visit(i + 1);
    if (i >= width) visit(i - width);
    if (i < width * (height - 1)) visit(i + width);
  }

  // Fill holes: anything the outside can't reach is inside the object.
  const outside = new Uint8Array(width * height);
  top = 0;
  const seed = (n: number) => {
    if (!keep[n] && !outside[n]) {
      outside[n] = 1;
      stack[top++] = n;
    }
  };
  for (let x = 0; x < width; x++) {
    seed(x);
    seed((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    seed(y * width);
    seed(y * width + width - 1);
  }
  while (top > 0) {
    const i = stack[--top];
    const x = i % width;
    if (x > 0) seed(i - 1);
    if (x < width - 1) seed(i + 1);
    if (i >= width) seed(i - width);
    if (i < width * (height - 1)) seed(i + width);
  }
  for (let i = 0; i < keep.length; i++) {
    if (!keep[i] && !outside[i]) {
      keep[i] = 1;
      area++;
    }
  }

  const ratio = area / (width * height);
  if (ratio < 0.004 || ratio > 0.9) return null; // a speck, or "the whole photo"

  const alpha = new Uint8ClampedArray(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = keep[i] ? 255 : 0;
  return { width, height, alpha };
}

/** Intersection-over-union of two masks (0 when their sizes differ). */
function maskIoU(a: CutMask, b: CutMask): number {
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

/** Reject masks that look like "the background" (too big, or touching 3+ edges). */
function looksLikeObject(mask: CutMask): boolean {
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

// ── SlimSAM (default, on-device) ──────────────────────────

const SAM_MODEL = "Xenova/slimsam-77-uniform";
/** Studying the photo can take a while on older phones. */
const PREPARE_MS = 20_000;

type Tf = Awaited<ReturnType<typeof loadTf>>;
type Tensor = { data: ArrayLike<number> };
type SamModel = {
  get_image_embeddings(inputs: Record<string, unknown>): Promise<Record<string, unknown>>;
  (inputs: Record<string, unknown>): Promise<{ iou_scores: Tensor; pred_masks: Tensor }>;
};
type Sam = {
  tf: Tf;
  processor: Awaited<ReturnType<Tf["AutoProcessor"]["from_pretrained"]>>;
  model: SamModel;
};
let samPromise: Promise<Sam> | null = null;

function loadSam(): Promise<Sam> {
  samPromise ??= (async () => {
    const tf = await loadTf();
    const [processor, model] = await Promise.all([
      tf.AutoProcessor.from_pretrained(SAM_MODEL),
      loadOn(devices("fp16", "q8"), (d) => tf.SamModel.from_pretrained(SAM_MODEL, d), "sam"),
    ]);
    return { tf, processor, model: model as unknown as SamModel };
  })().catch((err) => {
    samPromise = null;
    throw err;
  });
  return samPromise;
}

/** Start downloading the model early (e.g. while the user is walking). */
export function warmUpCutter(): void {
  void loadSam().catch(() => undefined);
}

/** SAM's low-res masks are 256×256 over the photo scaled so its long side is 1024 (padded). */
const LOW = 256;

class SamCutter implements StickerCutter {
  readonly name = "sam";
  private sam: Sam | null = null;
  private embeddings: Record<string, unknown> | null = null;
  /** Photo size as the model sees it (long side 1024). */
  private rw = 0;
  private rh = 0;
  /** The photo's own size: masks are drawn at this size so edges stay crisp. */
  private iw = 0;
  private ih = 0;

  async prepare(image: HTMLCanvasElement) {
    this.sam = await withTimeout(loadSam(), PREPARE_MS, "sam");
    const { tf, processor, model } = this.sam;
    const inputs = await processor(tf.RawImage.fromCanvas(image));
    [this.rh, this.rw] = inputs.reshaped_input_sizes[0] as [number, number];
    this.iw = image.width;
    this.ih = image.height;
    this.embeddings = await withTimeout(model.get_image_embeddings(inputs), PREPARE_MS, "sam encode");
  }

  async maskAt(point: CutPoint) {
    if (!this.sam || !this.embeddings) return null;
    const { tf, model } = this.sam;
    const out = await model({
      ...this.embeddings,
      input_points: new tf.Tensor("float32", Float32Array.from([point.x * this.rw, point.y * this.rh]), [1, 1, 1, 2]),
      input_labels: new tf.Tensor("int64", BigInt64Array.from([BigInt(1)]), [1, 1, 1]),
    });
    const scores = out.iou_scores.data as Float32Array;
    const logits = out.pred_masks.data as Float32Array; // [3, 256, 256]
    const w = Math.max(1, Math.round((this.rw / 1024) * LOW));
    const h = Math.max(1, Math.round((this.rh / 1024) * LOW));

    // SAM offers 3 readings (a part → the whole thing). Take the biggest
    // confident one that still looks like a thing, not the background.
    let pick = -1;
    let pickArea = 0;
    let best = 0;
    for (let k = 0; k < scores.length; k++) {
      if (scores[k] > scores[best]) best = k;
      let area = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (logits[k * LOW * LOW + y * LOW + x] > 0) area++;
      const ratio = area / (w * h);
      if (scores[k] >= 0.7 && ratio <= 0.6 && area > pickArea) {
        pick = k;
        pickArea = area;
      }
    }
    const k = pick >= 0 ? pick : best;

    // Crisp edges: stretch the low-res logits smoothly (bilinear) to the photo's
    // own size and cut at 0 there, instead of enlarging a finished jagged mask.
    const W = this.iw;
    const H = this.ih;
    const alpha = new Uint8ClampedArray(W * H);
    const sx = this.rw / W / 4; // photo px → low-res px
    const sy = this.rh / H / 4;
    const base = k * LOW * LOW;
    for (let Y = 0; Y < H; Y++) {
      const fy = Math.min(h - 1, Math.max(0, (Y + 0.5) * sy - 0.5));
      const y0 = Math.floor(fy);
      const y1 = Math.min(h - 1, y0 + 1);
      const ty = fy - y0;
      const r0 = base + y0 * LOW;
      const r1 = base + y1 * LOW;
      for (let X = 0; X < W; X++) {
        const fx = Math.min(w - 1, Math.max(0, (X + 0.5) * sx - 0.5));
        const x0 = Math.floor(fx);
        const x1 = Math.min(w - 1, x0 + 1);
        const tx = fx - x0;
        const v = (logits[r0 + x0] * (1 - tx) + logits[r0 + x1] * tx) * (1 - ty) + (logits[r1 + x0] * (1 - tx) + logits[r1 + x1] * tx) * ty;
        alpha[Y * W + X] = v > 0 ? 255 : 0;
      }
    }
    return cleanMask(alpha, W, H, point);
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

/** Box in 0–1 image coordinates. */
export interface CutBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ── chain ────────────────────────────────────────────────

const CHAIN: (() => StickerCutter)[] = [
  () => new SamCutter(),
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

/**
 * A soft rounded cut around a box — used only when the cutter couldn't load.
 */
export function boxMask(box: CutBox, aspect: number): CutMask {
  const w = 256;
  const h = Math.max(1, Math.round(w / aspect));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  const cx = (box.x + box.w / 2) * w;
  const cy = (box.y + box.h / 2) * h;
  const rx = Math.max(8, (box.w * w) / 2) * 0.98;
  const ry = Math.max(8, (box.h * h) / 2) * 0.98;
  ctx.beginPath();
  for (let a = 0; a <= Math.PI * 2 + 0.01; a += Math.PI / 16) {
    const wob = 0.94 + 0.06 * Math.sin(a * 3 + box.x * 9);
    const x = cx + Math.cos(a) * rx * wob;
    const y = cy + Math.sin(a) * ry * wob;
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

/** Where to look: middle first, then a 3×3 walk around the photo. */
const LOOK_AROUND: CutPoint[] = [
  { x: 0.5, y: 0.5 },
  ...[0.25, 0.5, 0.75].flatMap((y) => [0.25, 0.5, 0.75].map((x) => ({ x, y }))).filter((p) => !(p.x === 0.5 && p.y === 0.5)),
];

/**
 * Shape-following cuts of the distinct things in the photo.
 * Stops at `max` things or when `budgetMs` runs out.
 */
export async function findThings(cutter: StickerCutter, max: number, budgetMs: number): Promise<{ mask: CutMask; point: CutPoint }[]> {
  const t0 = performance.now();
  const found: { mask: CutMask; point: CutPoint }[] = [];
  for (const t of LOOK_AROUND.map((point, i) => ({ point, strict: i > 0 }))) {
    if (found.length >= max || (found.length > 0 && performance.now() - t0 > budgetMs)) break;
    try {
      const m = await cutter.maskAt(t.point);
      if (!m) continue;
      if (t.strict && found.length > 0 && !looksLikeObject(m)) continue;
      if (found.some((f) => maskIoU(f.mask, m) > 0.55)) continue;
      found.push({ mask: m, point: t.point });
    } catch (err) {
      console.warn("[find] point failed", err);
    }
    // Let the waiting screen breathe between cuts.
    await new Promise((r) => setTimeout(r, 0));
  }
  return found;
}

/** A middle box, for when nothing was recognised. */
export const MIDDLE_BOX: CutBox = { x: 0.22, y: 0.2, w: 0.56, h: 0.6 };
