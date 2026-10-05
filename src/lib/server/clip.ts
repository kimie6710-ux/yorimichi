import "server-only";

import { readFile } from "node:fs/promises";
import path from "node:path";

// The image half of naming (MobileCLIP turns a cutout into a vector) for phones
// that can't hold the model in a page (iPhone). Comparing with the word list and
// with your own names still happens on the phone.

type Tf = typeof import("@huggingface/transformers");
type Loaded = {
  tf: Tf;
  processor: (image: unknown) => Promise<Record<string, unknown>>;
  model: (inputs: Record<string, unknown>) => Promise<{ image_embeds: { normalize: (p: number, d: number) => { data: Float32Array } } }>;
};

let loading: Promise<Loaded> | null = null;
function load(): Promise<Loaded> {
  loading ??= (async () => {
    const tf = await import("@huggingface/transformers");
    tf.env.cacheDir = path.join(process.cwd(), ".data", "models");
    // Same model the word list was made with.
    const vocab = JSON.parse(await readFile(path.join(process.cwd(), "public", "vision", "vocab.json"), "utf8")) as { model: string };
    const [processor, model] = await Promise.all([
      tf.AutoProcessor.from_pretrained(vocab.model),
      tf.CLIPVisionModelWithProjection.from_pretrained(vocab.model, { dtype: "fp32", device: "cpu" }),
    ]);
    return { tf, processor: processor as unknown as Loaded["processor"], model: model as unknown as Loaded["model"] };
  })().catch((err) => {
    loading = null;
    throw err;
  });
  return loading;
}

/** A cutout on white (already 256×256 from the phone) → its normalised vector. */
export async function clipEmbed(image: Blob): Promise<Float32Array> {
  const { tf, processor, model } = await load();
  const raw = await tf.RawImage.fromBlob(image);
  const { image_embeds } = await model(await processor(raw.rgb()));
  return Float32Array.from(image_embeds.normalize(2, -1).data);
}

export function clipWarmUp(): void {
  void load().catch(() => undefined);
}
