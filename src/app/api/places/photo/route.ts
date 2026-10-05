import { resolvePhotoUri } from "@/lib/places/google";
import { serverEnv } from "@/lib/server/env";
import { jsonError } from "@/lib/server/http";

const PHOTO_NAME = /^places\/[A-Za-z0-9_-]+\/photos\/[A-Za-z0-9_-]+$/;

/**
 * GET /api/places/photo?name=places/{id}/photos/{ref}&w=600
 * Resolves the photo server-side so the Places key never reaches the browser,
 * then redirects to the (key-less) googleusercontent URL.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name") ?? "";
  const width = Math.min(1600, Math.max(100, Number(searchParams.get("w")) || 600));

  if (!PHOTO_NAME.test(name)) return jsonError("invalid_input", "invalid photo name", 400);
  if (!serverEnv.placesApiKey) return jsonError("not_configured", "Places key missing", 503);

  try {
    const uri = await resolvePhotoUri(name, width);
    return new Response(null, {
      status: 302,
      headers: {
        Location: uri,
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (err) {
    console.error("[photo]", err);
    return jsonError("places_failed", "写真を読み込めなかった。", 502);
  }
}
