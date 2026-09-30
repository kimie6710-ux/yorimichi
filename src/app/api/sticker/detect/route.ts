import { getAIProvider } from "@/lib/ai";
import { placeIdSchema } from "@/lib/schemas";
import { aiEnabled } from "@/lib/server/env";
import { jsonError } from "@/lib/server/http";
import { foundLabelsAt } from "@/lib/server/services";

export const maxDuration = 60;
const MAX_ITEMS = 8;
const TYPES = new Set(["image/jpeg", "image/png"]);

/**
 * POST /api/sticker/detect (multipart: cutout_0.., spotId)
 * Names the things cut out of a photo, and says which ones are real "things".
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return jsonError("invalid_input", "画像を読み取れませんでした", 400);
  const files: File[] = [];
  for (let i = 0; i < MAX_ITEMS; i++) {
    const f = form.get(`cutout_${i}`);
    if (!(f instanceof File)) break;
    if (!TYPES.has(f.type) || f.size > 1024 * 1024) return jsonError("invalid_input", "画像が大きすぎます", 400);
    files.push(f);
  }
  if (files.length === 0) return jsonError("invalid_input", "画像がありません", 400);
  // AI off: keep every cutout, the person names it themselves.
  if (!aiEnabled()) return Response.json({ names: files.map((_, index) => ({ index, label: "見つけたもの", keep: true })) });
  const spotId = String(form.get("spotId") ?? "");
  const foundHere = placeIdSchema.safeParse(spotId).success ? await foundLabelsAt(spotId).catch(() => []) : [];

  try {
    const images = await Promise.all(
      files.map(async (f) => ({ data: Buffer.from(await f.arrayBuffer()).toString("base64"), mediaType: f.type as "image/jpeg" })),
    );
    const out = await getAIProvider().nameCutouts({ images, foundHere });
    const names = files.map((_, index) => {
      const hit = out.items.find((x) => x.index === index);
      return { index, label: hit?.label.trim().slice(0, 12) || "見つけたもの", keep: hit?.keep ?? true };
    });
    return Response.json({ names });
  } catch (err) {
    console.error("[sticker:detect]", err);
    return jsonError("ai_failed", "名前をつけられませんでした", 502);
  }
}
