// Check recognition on the seed photos: node scripts/vision/eval.mjs
import { readFileSync } from "node:fs";
import { AutoProcessor, CLIPVisionModelWithProjection, RawImage } from "@huggingface/transformers";

const vocab = JSON.parse(readFileSync("public/vision/vocab.json", "utf8"));
const bytes = new Int8Array(Buffer.from(vocab.data, "base64").buffer.slice(0));
const W = vocab.labels.map((_, r) => Float32Array.from(bytes.subarray(r * vocab.dim, (r + 1) * vocab.dim), (v) => v * vocab.scales[r]));

const processor = await AutoProcessor.from_pretrained(vocab.model);
const model = await CLIPVisionModelWithProjection.from_pretrained(vocab.model, { dtype: process.env.DTYPE || "q8" });
const manifest = JSON.parse(readFileSync(".data/files/seed/manifest.json", "utf8"));
for (const m of manifest) {
  const img = await RawImage.read(`.data/files/seed/${m.key}.jpg`).catch(() => null);
  if (!img) continue;
  const { image_embeds } = await model(await processor(img));
  const e = image_embeds.normalize(2, -1).data;
  const sims = W.map((w) => w.reduce((s, v, i) => s + v * e[i], 0));
  const logits = sims.map((s) => s * 100);
  const mx = Math.max(...logits);
  const ex = logits.map((l) => Math.exp(l - mx));
  const z = ex.reduce((a, b) => a + b);
  const top = ex.map((v, i) => [vocab.labels[i], v / z]).sort((a, b) => b[1] - a[1]).slice(0, 3);
  console.log(m.label.padEnd(14, "　"), top.map(([l, p]) => `${l} ${(p * 100).toFixed(0)}%`).join("  "));
}
