import { stickerMetaSchema } from "@/lib/schemas";
import { asUser, jsonError } from "@/lib/server/http";
import { createStickers, listMyStickers } from "@/lib/server/services";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
/** Everything in one upload (photo + stickers). */
const MAX_TOTAL_BYTES = 16 * 1024 * 1024;

/** What the file really is, from its first bytes (not what the browser claims). */
async function sniff(f: File): Promise<"png" | "jpeg" | "webp" | null> {
  const b = new Uint8Array(await f.slice(0, 12).arrayBuffer());
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
  return null;
}

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
      return jsonError("invalid_input", "シールの画像がうまく読めなかった。", 400);
    }
    if ((await Promise.all(files.map((f) => sniff(f as File)))).some((k) => k !== "png")) {
      return jsonError("invalid_input", "シールの画像がうまく読めなかった。", 400);
    }
    const photo = form.get("photo");
    const photoOk = photo instanceof File && photo.size > 0 && photo.size <= MAX_IMAGE_BYTES && (await sniff(photo)) !== null;
    const total = files.reduce((n, f) => n + (f as File).size, 0) + (photoOk ? (photo as File).size : 0);
    if (total > MAX_TOTAL_BYTES) return jsonError("invalid_input", "画像が大きすぎた。", 413);

    const items = await createStickers({
      userId,
      spotId: meta.data.spotId,
      memo: meta.data.memo,
      photo: photoOk ? photo : null,
      at: meta.data.at,
      items: meta.data.items.map((it, i) => ({ ...it, blob: files[i] as File })),
    });
    return Response.json({ items });
  });
}
