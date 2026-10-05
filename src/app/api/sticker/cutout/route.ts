import { serverEnv } from "@/lib/server/env";
import { jsonError } from "@/lib/server/http";

const MAX_BYTES = 8 * 1024 * 1024;

/**
 * POST /api/sticker/cutout (multipart: image)
 * Optional background removal. Uses remove.bg when REMOVE_BG_API_KEY is set;
 * otherwise returns 501 and the client falls back to the plain-frame sticker.
 * Swap this implementation for any other cutout API without touching the UI.
 */
export async function POST(req: Request) {
  if (!serverEnv.removeBgApiKey) {
    return jsonError("not_configured", "Background removal is not configured", 501);
  }

  const form = await req.formData().catch(() => null);
  const image = form?.get("image");
  if (!(image instanceof File) || image.size === 0) {
    return jsonError("invalid_input", "image is required", 400);
  }
  if (image.size > MAX_BYTES) return jsonError("invalid_input", "image too large", 413);

  const upstream = new FormData();
  upstream.append("image_file", image);
  upstream.append("size", "auto");
  upstream.append("format", "png");

  try {
    const res = await fetch("https://api.remove.bg/v1.0/removebg", {
      method: "POST",
      headers: { "X-Api-Key": serverEnv.removeBgApiKey },
      body: upstream,
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      console.error("[cutout]", res.status, await res.text().catch(() => ""));
      return jsonError("upload_failed", "うまく切り抜けなかった。", 502);
    }
    return new Response(await res.arrayBuffer(), {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[cutout]", err);
    return jsonError("upload_failed", "うまく切り抜けなかった。", 502);
  }
}
