"use client";

// Shared setup for the on-device models (cutting out + naming).

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

/**
 * Where to run: the phone's GPU (WebGPU) when it has one, else the CPU.
 * `gpu`/`cpu` pick the number format that works (and is small) on each.
 */
export function devices(gpu: Device["dtype"], cpu: Device["dtype"]): Device[] {
  const hasGpu = typeof navigator !== "undefined" && "gpu" in navigator;
  return hasGpu ? [{ device: "webgpu", dtype: gpu }, { device: "wasm", dtype: cpu }] : [{ device: "wasm", dtype: cpu }];
}

/** Try each device in turn until a model loads. */
export async function loadOn<T>(tries: Device[], load: (d: Device) => Promise<T>, what: string): Promise<T> {
  let last: unknown;
  for (const d of tries) {
    try {
      return await load(d);
    } catch (err) {
      last = err;
      console.warn(`[${what}] ${d.device}/${d.dtype} unavailable`, err);
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
