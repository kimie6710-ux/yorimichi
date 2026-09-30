// Precompute text embeddings for the vocabulary, so the phone only needs the
// (small) image model. Output: public/vision/vocab.json
//   node scripts/vision/build-vocab.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { AutoTokenizer, CLIPTextModelWithProjection } from "@huggingface/transformers";

import { VOCAB } from "./vocab.mjs";

const MODEL = "Xenova/mobileclip_s0";
const TEMPLATES = ["a photo of {}.", "a close-up photo of {}.", "{} on a table.", "{} seen on a street in Japan."];

const tokenizer = await AutoTokenizer.from_pretrained(MODEL);
const model = await CLIPTextModelWithProjection.from_pretrained(MODEL, { dtype: "fp32" });

async function embed(texts) {
  const inputs = tokenizer(texts, { padding: "max_length", truncation: true });
  const { text_embeds } = await model(inputs);
  return text_embeds.normalize(2, -1).tolist();
}

const labels = [];
const vectors = [];
for (const [ja, ...descs] of VOCAB) {
  const texts = descs.flatMap((d) => TEMPLATES.map((t) => t.replace("{}", d)));
  const embs = await embed(texts);
  const dim = embs[0].length;
  const mean = new Array(dim).fill(0);
  for (const e of embs) for (let i = 0; i < dim; i++) mean[i] += e[i];
  const n = Math.hypot(...mean);
  vectors.push(mean.map((v) => v / n));
  labels.push(ja);
  process.stdout.write(".");
}

// int8 with one scale per vector keeps the file small (~200KB).
const dim = vectors[0].length;
const bytes = new Int8Array(vectors.length * dim);
const scales = vectors.map((v, r) => {
  const max = Math.max(...v.map(Math.abs));
  const s = max / 127;
  for (let i = 0; i < dim; i++) bytes[r * dim + i] = Math.round(v[i] / s);
  return +s.toPrecision(6);
});

mkdirSync("public/vision", { recursive: true });
writeFileSync(
  "public/vision/vocab.json",
  JSON.stringify({ model: MODEL, dim, labels, scales, data: Buffer.from(bytes.buffer).toString("base64") }),
);
console.log(`\n${labels.length} words, dim ${dim} → public/vision/vocab.json`);
