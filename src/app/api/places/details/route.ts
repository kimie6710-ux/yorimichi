import { getPlaceDetails, PlacesApiError } from "@/lib/places/google";
import { buildMockPlaces } from "@/lib/places/mock";
import { detailsRequestSchema } from "@/lib/schemas";
import { isMockModeServer, serverEnv } from "@/lib/server/env";
import { jsonError, parseJsonBody } from "@/lib/server/http";

/**
 * POST /api/places/details — reviews, hours and atmosphere for a few places.
 * (The interpret pipeline calls this step internally for its shortlist; this
 * route exists for screens that need fresh details for a known place_id.)
 */
export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, detailsRequestSchema);
  if (!parsed.ok) return parsed.response;
  const { placeIds, origin } = parsed.data;

  if (isMockModeServer()) {
    // development-only
    const wanted = new Set(placeIds);
    return Response.json({ places: buildMockPlaces(origin).filter((p) => wanted.has(p.placeId)) });
  }
  if (!serverEnv.placesApiKey) {
    return jsonError("not_configured", "Google Places APIキーが設定されていません（GOOGLE_PLACES_API_KEY）", 503);
  }
  try {
    return Response.json({ places: await getPlaceDetails(placeIds, origin) });
  } catch (err) {
    console.error("[details]", err);
    const status = err instanceof PlacesApiError && err.status === 429 ? 429 : 502;
    return jsonError("places_failed", "スポットの詳細を取得できませんでした", status);
  }
}
