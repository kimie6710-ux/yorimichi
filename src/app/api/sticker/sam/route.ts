import { jsonError } from "@/lib/server/http";
import { samPrepare, samWarmUp } from "@/lib/server/sam";

const MAX_BYTES = 4 * 1024 * 1024;

/** GET /api/sticker/sam — get the cutter ready before the first photo arrives. */
export async function GET() {
  samWarmUp();
  return new Response(null, { status: 204 });
}

/** POST /api/sticker/sam (multipart: image ≤1024px) — study a photo; returns { id, rw, rh }. */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const image = form?.get("image");
  if (!(image instanceof File) || image.size === 0) return jsonError("invalid_input", "写真がうまく届かなかった。", 400);
  if (image.size > MAX_BYTES) return jsonError("invalid_input", "写真が大きすぎた。", 413);
  try {
    return Response.json(await samPrepare(image));
  } catch (err) {
    console.error("[sam:prepare]", err);
    return jsonError("internal", "うまく切り抜けなかった。", 500);
  }
}
