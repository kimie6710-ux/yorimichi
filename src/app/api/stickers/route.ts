import { stickerMetaSchema } from "@/lib/schemas";
import { asUser, jsonError } from "@/lib/server/http";
import { createStickers, listMyStickers } from "@/lib/server/services";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/** GET /api/stickers — my sticker book. */
export async function GET(req: Request) {
  return asUser(req, async (userId) => Response.json({ items: await listMyStickers(userId) }));
}

/**
 * POST /api/stickers (multipart)
 *   meta:        { spotId, memo, items: [{ label, rotation }] }
 *   photo?:      the original photo (kept private)
 *   sticker_0..: transparent PNGs
 */
export async function POST(req: Request) {
  return asUser(req, async (userId) => {
    const form = await req.formData().catch(() => null);
    if (!form) return jsonError("invalid_input", "フォームを読み取れませんでした", 400);
    let raw: unknown;
    try {
      raw = JSON.parse(String(form.get("meta") ?? ""));
    } catch {
      return jsonError("invalid_input", "meta が不正です", 400);
    }
    const meta = stickerMetaSchema.safeParse(raw);
    if (!meta.success) return jsonError("invalid_input", meta.error.issues[0]?.message ?? "meta が不正です", 400);

    const files = meta.data.items.map((_, i) => form.get(`sticker_${i}`));
    if (files.some((f) => !(f instanceof File) || f.type !== "image/png" || f.size === 0 || f.size > MAX_IMAGE_BYTES)) {
      return jsonError("invalid_input", "シール画像が不正です", 400);
    }
    const photo = form.get("photo");
    const photoOk = photo instanceof File && photo.size > 0 && photo.size <= MAX_IMAGE_BYTES && /^image\/(jpeg|png|webp)$/.test(photo.type);

    const items = await createStickers({
      userId,
      spotId: meta.data.spotId,
      memo: meta.data.memo,
      photo: photoOk ? photo : null,
      items: meta.data.items.map((it, i) => ({ ...it, blob: files[i] as File })),
    });
    return Response.json({ items });
  });
}
