"use client";

// Shared setup for the on-device models (cutting out + naming).

import { diag } from "@/lib/diag";

type Tf = typeof import("@huggingface/transformers");
let tfPromise: Promise<Tf> | null = null;

export function loadTf(): Promise<Tf> {
  tfPromise ??= import("@huggingface/transformers")
    .then((tf) => {
      tf.env.allowLocalModels = false;
      return tf;
    })
    .catch((err) => {
      tfPromise = null;
      throw err;
    });
  return tfPromise;
}

export type Device = { device: "webgpu" | "wasm"; dtype: "fp32" | "fp16" | "q8" };

/** iPhone / iPad Safari: little memory per page; heavy GPU work makes it drop the page. */
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

/**
 * Where to run: the phone's GPU (WebGPU) when it has one, else the CPU.
 * `gpu`/`cpu` pick the number format that works (and is small) on each.
 */
export function devices(gpu: Device["dtype"], cpu: Device["dtype"]): Device[] {
  const hasGpu = typeof navigator !== "undefined" && "gpu" in navigator;
  return hasGpu ? [{ device: "webgpu", dtype: gpu }, { device: "wasm", dtype: cpu }] : [{ device: "wasm", dtype: cpu }];
}

// ── first-time download progress (the models are ~40–60MB once) ──
const files = new Map<string, { loaded: number; total: number }>();
const listeners = new Set<(p: number | null) => void>();

/** 0–1 while model files are downloading, null when nothing is. */
export function modelProgress(): number | null {
  let loaded = 0;
  let total = 0;
  for (const f of files.values()) {
    loaded += f.loaded;
    total += f.total;
  }
  return total > 0 && loaded < total ? loaded / total : null;
}

export function onModelProgress(fn: (p: number | null) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

type ProgressInfo = { status?: string; file?: string; name?: string; loaded?: number; total?: number };
export function trackProgress(info: ProgressInfo) {
  const key = `${info.name ?? ""}/${info.file ?? ""}`;
  if (info.status === "progress" && info.total) files.set(key, { loaded: info.loaded ?? 0, total: info.total });
  else if (info.status === "done" && files.has(key)) files.set(key, { loaded: files.get(key)!.total, total: files.get(key)!.total });
  const p = modelProgress();
  listeners.forEach((fn) => fn(p));
}

/** Try each device in turn until a model loads. */
export async function loadOn<T>(tries: Device[], load: (d: Device) => Promise<T>, what: string): Promise<T> {
  let last: unknown;
  for (const d of tries) {
    const t0 = performance.now();
    try {
      const got = await load({ ...d, progress_callback: trackProgress } as Device);
      diag(`${what} ready on ${d.device}/${d.dtype} in ${Math.round(performance.now() - t0)}ms`);
      return got;
    } catch (err) {
      last = err;
      console.warn(`[${what}] ${d.device}/${d.dtype} unavailable`, err);
      diag(`${what} failed on ${d.device}/${d.dtype} after ${Math.round(performance.now() - t0)}ms: ${String(err).slice(0, 120)}`);
    }
  }
  throw last;
}

/** Give up on slow downloads (phones on weak signal) instead of hanging forever. */
export function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${what} timed out`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** Wait on a promise, but not longer than `ms` (resolves null instead). */
export function within<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return withTimeout(p, ms, "step").catch(() => null);
}
