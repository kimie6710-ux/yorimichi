"use client";

import { api } from "@/lib/api-client";
import { devices, isIOS, loadOn, loadTf } from "./runtime";

// On-device naming of cut-out things — no AI API, nothing leaves the phone.
//
// 1. A small image model (MobileCLIP-S0) turns the cutout into a vector.
// 2. That vector is compared with a word list we made ourselves
//    (scripts/vision/vocab.mjs → public/vision/vocab.json).
// 3. It is also compared with your own named stickers, so the names you
//    give things win the next time something similar shows up.

type Vision = {
  processor: (image: unknown) => Promise<Record<string, unknown>>;
  model: (inputs: Record<string, unknown>) => Promise<{ image_embeds: { normalize: (p: number, d: number) => { data: Float32Array } } }>;
  RawImage: { fromCanvas: (c: HTMLCanvasElement | OffscreenCanvas) => unknown };
};

interface Vocab {
  model: string;
  dim: number;
  labels: string[];
  vectors: Float32Array[];
}

interface Memory {
  label: string;
  vec: Float32Array;
}

export interface Guess {
  label: string;
  /** 0–1: how sure. */
  score: number;
  /** Learned from your own stickers. */
  mine: boolean;
}

export interface Recognition {
  /** The name to use ("見つけたもの" when unsure). */
  label: string;
  /** Up to 3 names to offer. */
  guesses: Guess[];
  emb: Float32Array;
}

export const UNNAMED = "見つけたもの";
/** Softmax temperature used by CLIP. */
const LOGIT_SCALE = 100;
/** Above this, a word-list guess is used as the name. */
const SURE_WORD = 0.32;
/** Image-to-image similarity above which your own name is reused. */
const SURE_MINE = 0.84;
/** Your own names are offered as options above this. */
const MAYBE_MINE = 0.76;

// ── loading ───────────────────────────────────────────────

let visionPromise: Promise<Vision> | null = null;
let vocabPromise: Promise<Vocab> | null = null;
let memoryPromise: Promise<Memory[]> | null = null;

function decode(b64: string, scale: number, dim: number, row = 0): Float32Array {
  const bin = atob(b64);
  const out = new Float32Array(dim);
  for (let i = 0; i < dim; i++) {
    const b = bin.charCodeAt(row * dim + i);
    out[i] = (b > 127 ? b - 256 : b) * scale;
  }
  return out;
}

function loadVocab(): Promise<Vocab> {
  vocabPromise ??= fetch("/vision/vocab.json")
    .then((r) => r.json() as Promise<{ model: string; dim: number; labels: string[]; scales: number[]; data: string }>)
    .then((v) => ({ model: v.model, dim: v.dim, labels: v.labels, vectors: v.labels.map((_, r) => decode(v.data, v.scales[r], v.dim, r)) }))
    .catch((err) => {
      vocabPromise = null;
      throw err;
    });
  return vocabPromise;
}

async function loadVision(): Promise<Vision> {
  visionPromise ??= (async () => {
    const [vocab, tf] = await Promise.all([loadVocab(), loadTf()]);
    const [processor, model] = await Promise.all([
      tf.AutoProcessor.from_pretrained(vocab.model),
      // The 8-bit version of this model gives nonsense, so fp16 (GPU) / fp32 (CPU).
      loadOn(devices("fp16", "fp32"), (d) => tf.CLIPVisionModelWithProjection.from_pretrained(vocab.model, d), "vision"),
    ]);
    return { processor, model, RawImage: tf.RawImage } as unknown as Vision;
  })().catch((err) => {
    visionPromise = null;
    throw err;
  });
  return visionPromise;
}

function loadMemory(): Promise<Memory[]> {
  memoryPromise ??= api
    .visionMemory()
    .then((d) =>
      d.items.map((m) => ({ label: m.label, vec: decode(m.emb, m.scale, atob(m.emb).length) })),
    )
    .catch(() => {
      memoryPromise = null;
      return [];
    });
  return memoryPromise;
}

/** Start downloading early (e.g. while walking to the spot). */
export function warmUpVision(): void {
  // iPhones name things on the server (the model doesn't fit next to everything else in a Safari page).
  if (isIOS()) void fetch("/api/vision/embed").catch(() => undefined);
  else void loadVision().catch(() => undefined);
  void loadVocab().catch(() => undefined);
  void loadMemory();
}

// ── recognising ───────────────────────────────────────────

const dot = (a: Float32Array, b: Float32Array) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

/** The thing on a plain white card, the way the model sees products best. */
function onWhite(source: HTMLCanvasElement): HTMLCanvasElement {
  const size = 256;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, size, size);
  const k = (size * 0.92) / Math.max(source.width, source.height);
  const w = source.width * k;
  const h = source.height * k;
  ctx.drawImage(source, (size - w) / 2, (size - h) / 2, w, h);
  return c;
}

export async function embed(cutout: HTMLCanvasElement): Promise<Float32Array> {
  if (isIOS()) return embedOnServer(onWhite(cutout));
  const v = await loadVision();
  const inputs = await v.processor(v.RawImage.fromCanvas(onWhite(cutout)));
  const { image_embeds } = await v.model(inputs);
  return Float32Array.from(image_embeds.normalize(2, -1).data);
}

async function embedOnServer(card: HTMLCanvasElement): Promise<Float32Array> {
  const blob = await new Promise<Blob | null>((r) => card.toBlob(r, "image/jpeg", 0.92));
  if (!blob) throw new Error("no jpeg");
  const form = new FormData();
  form.append("image", blob, "cutout.jpg");
  const res = await fetch("/api/vision/embed", { method: "POST", body: form, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`embed ${res.status}`);
  return new Float32Array(await res.arrayBuffer());
}

/** Name a cut-out thing. */
export async function recognize(cutout: HTMLCanvasElement): Promise<Recognition> {
  const [vocab, memory, emb] = await Promise.all([loadVocab(), loadMemory(), embed(cutout)]);

  // Word list: CLIP-style probabilities.
  const logits = vocab.vectors.map((w) => dot(w, emb) * LOGIT_SCALE);
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  const words: Guess[] = exps
    .map((e, i) => ({ label: vocab.labels[i], score: e / sum, mine: false }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  // Your own names: nearest stickers you've made.
  const best = new Map<string, number>();
  for (const m of memory) {
    if (m.vec.length !== emb.length) continue;
    const s = dot(m.vec, emb);
    if (s > (best.get(m.label) ?? 0)) best.set(m.label, s);
  }
  const mine: Guess[] = [...best.entries()]
    .filter(([, s]) => s >= MAYBE_MINE)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([label, s]) => ({ label, score: s, mine: true }));

  const guesses: Guess[] = [];
  for (const g of [...mine, ...words]) {
    if (guesses.length >= 3) break;
    if (!guesses.some((x) => x.label === g.label)) guesses.push(g);
  }
  const label = mine[0] && mine[0].score >= SURE_MINE ? mine[0].label : words[0] && words[0].score >= SURE_WORD ? words[0].label : UNNAMED;
  return { label, guesses, emb };
}

// ── learning ─────────────────────────────────────────────

function encode(vec: Float32Array): { emb: string; scale: number } {
  let max = 0;
  for (const v of vec) max = Math.max(max, Math.abs(v));
  const scale = max / 127 || 1;
  let bin = "";
  for (const v of vec) {
    const q = Math.round(v / scale);
    bin += String.fromCharCode(q < 0 ? q + 256 : q);
  }
  return { emb: btoa(bin), scale };
}

/** Remember the name you gave this thing, so next time it's recognised. */
export async function remember(stickerId: string | null, label: string, vec: Float32Array): Promise<void> {
  const name = label.trim();
  if (!name || name === UNNAMED) return;
  const memory = await loadMemory();
  memory.unshift({ label: name, vec });
  await api.rememberVision({ stickerId, label: name, ...encode(vec) }).catch(() => undefined);
}
