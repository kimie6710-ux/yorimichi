import "server-only";

import path from "node:path";

// The heavy half of cutting things out (SlimSAM's image encoder) runs here on the
// server: on iPhones it needs more memory than Safari gives a page, and the page
// gets thrown away. The phone sends a ≤1024px photo once, then asks for the shape
// under a point; the light finishing (edges, holes) still happens on the phone.

const SAM_MODEL = "Xenova/slimsam-77-uniform";
/** SAM's low-res masks: 256×256 over the photo scaled so its long side is 1024 (padded). */
const LOW = 256;
/** A photo's studied form is kept this long (taps on it come within a minute or two). */
const KEEP_MS = 10 * 60 * 1000;
const MAX_SESSIONS = 30;

type Tf = typeof import("@huggingface/transformers");
type Loaded = {
  tf: Tf;
  processor: Awaited<ReturnType<Tf["AutoProcessor"]["from_pretrained"]>>;
  model: {
    get_image_embeddings(inputs: Record<string, unknown>): Promise<Record<string, unknown>>;
    (inputs: Record<string, unknown>): Promise<{ iou_scores: { data: Float32Array }; pred_masks: { data: Float32Array } }>;
  };
};

let loading: Promise<Loaded> | null = null;
function load(): Promise<Loaded> {
  loading ??= (async () => {
    const tf = await import("@huggingface/transformers");
    tf.env.cacheDir = path.join(process.cwd(), ".data", "models");
    const [processor, model] = await Promise.all([
      tf.AutoProcessor.from_pretrained(SAM_MODEL),
      tf.SamModel.from_pretrained(SAM_MODEL, { dtype: "fp32", device: "cpu" }),
    ]);
    return { tf, processor, model: model as unknown as Loaded["model"] };
  })().catch((err) => {
    loading = null;
    throw err;
  });
  return loading;
}

type Session = { at: number; embeddings: Record<string, unknown>; rw: number; rh: number };
const sessions = new Map<string, Session>();

function tidy() {
  const now = Date.now();
  for (const [id, s] of sessions) if (now - s.at > KEEP_MS) sessions.delete(id);
  while (sessions.size > MAX_SESSIONS) sessions.delete(sessions.keys().next().value!);
}

/** Study a photo once. Returns an id to ask about points in it, and its size as the model sees it. */
export async function samPrepare(image: Blob): Promise<{ id: string; rw: number; rh: number }> {
  const { tf, processor, model } = await load();
  const raw = await tf.RawImage.fromBlob(image);
  const inputs = await processor(raw.rgb());
  const [rh, rw] = inputs.reshaped_input_sizes[0] as [number, number];
  const embeddings = await model.get_image_embeddings(inputs);
  const id = crypto.randomUUID();
  tidy();
  sessions.set(id, { at: Date.now(), embeddings, rw, rh });
  return { id, rw, rh };
}

/**
 * The shape under a point (0–1 coordinates): SAM's reading of "the whole thing"
 * (the biggest confident one that isn't the whole photo), as LOW×LOW logits.
 */
export async function samDecode(id: string, x: number, y: number): Promise<{ score: number; logits: Float32Array } | null> {
  const s = sessions.get(id);
  if (!s) return null;
  s.at = Date.now();
  const { tf, model } = await load();
  const out = await model({
    ...s.embeddings,
    input_points: new tf.Tensor("float32", Float32Array.from([x * s.rw, y * s.rh]), [1, 1, 1, 2]),
    input_labels: new tf.Tensor("int64", BigInt64Array.from([BigInt(1)]), [1, 1, 1]),
  });
  const scores = out.iou_scores.data;
  const logits = out.pred_masks.data;
  const w = Math.max(1, Math.round((s.rw / 1024) * LOW));
  const h = Math.max(1, Math.round((s.rh / 1024) * LOW));
  let k = -1;
  let bestArea = -1;
  for (let i = 0; i < scores.length; i++) {
    let area = 0;
    for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) if (logits[i * LOW * LOW + yy * LOW + xx] > 0) area++;
    const ratio = area / (w * h);
    if (scores[i] >= 0.6 && ratio <= 0.92 && area > bestArea) {
      k = i;
      bestArea = area;
    }
  }
  if (k < 0) k = Array.from(scores).indexOf(Math.max(...scores));
  return { score: scores[k], logits: logits.slice(k * LOW * LOW, (k + 1) * LOW * LOW) };
}

/** Load the model ahead of the first photo (called once, quietly). */
export function samWarmUp(): void {
  void load().catch(() => undefined);
}
