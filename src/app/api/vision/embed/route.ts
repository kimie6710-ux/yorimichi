import { jsonError } from "@/lib/server/http";
import { clipEmbed, clipWarmUp } from "@/lib/server/clip";

/** GET /api/vision/embed — get the naming model ready before the first cutout. */
export async function GET() {
  clipWarmUp();
  return new Response(null, { status: 204 });
}

/** POST /api/vision/embed (multipart: image, a 256px cutout on white) → float32 vector. */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const image = form?.get("image");
  if (!(image instanceof File) || image.size === 0 || image.size > 1024 * 1024) return jsonError("invalid_input", "invalid image", 400);
  try {
    const vec = await clipEmbed(image);
    return new Response(vec.slice().buffer as ArrayBuffer, { headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[vision:embed]", err);
    return jsonError("internal", "名前を考えられなかった。", 500);
  }
}
