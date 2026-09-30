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

/** Give up on slow downloads (phones on weak signal) instead of hanging forever. */
function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${what} timed out`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

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

// ── MediaPipe (default, on-device) ────────────────────────

type Segmenter = import("@mediapipe/tasks-vision").InteractiveSegmenter;
type BrushMode = import("@mediapipe/tasks-vision").BrushMode;
let segmenterPromise: Promise<Segmenter> | null = null;

type Fileset = Awaited<ReturnType<typeof import("@mediapipe/tasks-vision").FilesetResolver.forVisionTasks>>;
let filesetPromise: Promise<Fileset> | null = null;

function loadFileset(): Promise<Fileset> {
  filesetPromise ??= import("@mediapipe/tasks-vision")
    .then(({ FilesetResolver }) => FilesetResolver.forVisionTasks(WASM_BASE))
    .catch((err) => {
      filesetPromise = null;
      throw err;
    });
  return filesetPromise;
}

async function loadSegmenter(): Promise<Segmenter> {
  segmenterPromise ??= (async () => {
    const { InteractiveSegmenter } = await import("@mediapipe/tasks-vision");
    return InteractiveSegmenter.createFromOptions(await loadFileset(), {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "CPU" },
    });
  })().catch((err) => {
    segmenterPromise = null;
    throw err;
  });
  return segmenterPromise;
}

/** Start downloading the model early (e.g. while the user is walking). */
export function warmUpCutter(): void {
  void loadSegmenter().catch(() => undefined);
  void loadDetector().catch(() => undefined);
}

const SEGMENT_SIZE = 448;

function shrink(image: HTMLCanvasElement, max: number): HTMLCanvasElement {
  const k = max / Math.max(image.width, image.height);
  if (k >= 1) return image;
  const c = document.createElement("canvas");
  c.width = Math.round(image.width * k);
  c.height = Math.round(image.height * k);
  c.getContext("2d")!.drawImage(image, 0, 0, c.width, c.height);
  return c;
}

class MediaPipeCutter implements StickerCutter {
  readonly name = "mediapipe";
  private segmenter: Segmenter | null = null;

  async prepare(image: HTMLCanvasElement) {
    this.segmenter = await withTimeout(loadSegmenter(), 20_000, "segmenter");
    // Masks are scaled back up for the sticker, so a small copy is plenty — and much faster on phones.
    this.segmenter.setImage(shrink(image, SEGMENT_SIZE));
  }

  async maskAt(point: CutPoint) {
    if (!this.segmenter) return null;
    // BrushMode is a type-only enum in the bundle; POSITIVE === 1.
    const mask = this.segmenter.segment([
      { brushMode: 1 as BrushMode, point: [{ x: point.x, y: point.y }], isCompleted: true },
    ]);
    const data = mask.hasFloat32Array() ? mask.getAsFloat32Array() : mask.getAsUint8Array();
    const cut = cleanMask(data, mask.width, mask.height, point);
    mask.close();
    return cut;
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

// ── Object detector (on-device, names things) ─────────────

const DETECTOR_URL =
  "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite";

/** COCO categories → what the bird would call them. */
const COCO_JA: Record<string, string> = {
  person: "ひと", bicycle: "自転車", car: "車", motorcycle: "バイク", airplane: "飛行機", bus: "バス", train: "電車",
  truck: "トラック", boat: "ボート", "traffic light": "信号", "fire hydrant": "消火栓", "stop sign": "止まれ",
  "parking meter": "パーキングメーター", bench: "ベンチ", bird: "鳥", cat: "ねこ", dog: "いぬ", horse: "うま",
  sheep: "ひつじ", cow: "うし", elephant: "ぞう", bear: "くま", zebra: "しまうま", giraffe: "きりん",
  backpack: "リュック", umbrella: "傘", handbag: "かばん", tie: "ネクタイ", suitcase: "スーツケース",
  frisbee: "フリスビー", skis: "スキー板", snowboard: "スノーボード", "sports ball": "ボール", kite: "たこ",
  "baseball bat": "バット", "baseball glove": "グローブ", skateboard: "スケボー", surfboard: "サーフボード",
  "tennis racket": "ラケット", bottle: "ボトル", "wine glass": "グラス", cup: "カップ", fork: "フォーク",
  knife: "ナイフ", spoon: "スプーン", bowl: "うつわ", banana: "バナナ", apple: "りんご", sandwich: "サンド",
  orange: "みかん", broccoli: "ブロッコリー", carrot: "にんじん", "hot dog": "ホットドッグ", pizza: "ピザ",
  donut: "ドーナツ", cake: "ケーキ", chair: "いす", couch: "ソファ", "potted plant": "鉢植え", bed: "ベッド",
  "dining table": "テーブル", toilet: "トイレ", tv: "テレビ", laptop: "パソコン", mouse: "マウス",
  remote: "リモコン", keyboard: "キーボード", "cell phone": "スマホ", microwave: "レンジ", oven: "オーブン",
  toaster: "トースター", sink: "流し", refrigerator: "冷蔵庫", book: "本", clock: "時計", vase: "花びん",
  scissors: "はさみ", "teddy bear": "ぬいぐるみ", "hair drier": "ドライヤー", toothbrush: "歯ブラシ",
};

type Detector = import("@mediapipe/tasks-vision").ObjectDetector;
let detectorPromise: Promise<Detector> | null = null;

function loadDetector(): Promise<Detector> {
  detectorPromise ??= (async () => {
    const { ObjectDetector } = await import("@mediapipe/tasks-vision");
    return ObjectDetector.createFromOptions(await loadFileset(), {
      baseOptions: { modelAssetPath: DETECTOR_URL },
      runningMode: "IMAGE",
      scoreThreshold: 0.3,
      maxResults: 6,
    });
  })().catch((err) => {
    detectorPromise = null;
    throw err;
  });
  return detectorPromise;
}

/** Box in 0–1 image coordinates. */
export interface CutBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Seen {
  point: CutPoint;
  box: CutBox;
  label: string;
}

/** What's in the photo, biggest first, with a Japanese name. Empty if the model can't run. */
export async function detectThings(image: HTMLCanvasElement): Promise<Seen[]> {
  try {
    const detector = await withTimeout(loadDetector(), 15_000, "detector");
    const { detections } = detector.detect(image);
    return detections
      .filter((d) => d.boundingBox && d.categories[0])
      .map((d) => {
        const b = d.boundingBox!;
        const name = d.categories[0].categoryName;
        const box = { x: b.originX / image.width, y: b.originY / image.height, w: b.width / image.width, h: b.height / image.height };
        return { point: { x: box.x + box.w / 2, y: box.y + box.h / 2 }, box, label: COCO_JA[name] ?? "見つけたもの" };
      })
      .sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h);
  } catch (err) {
    console.warn("[detect]", err);
    return [];
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

/**
 * A quick, soft rounded cut around a box — instant, used for the first
 * candidates while the exact cut is made only for the one you choose.
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

/** A middle box, for when nothing was recognised. */
export const MIDDLE_BOX: CutBox = { x: 0.22, y: 0.2, w: 0.56, h: 0.6 };

/** Wait on a promise, but not longer than `ms` (resolves null instead). */
export function within<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return withTimeout(p, ms, "step").catch(() => null);
}
