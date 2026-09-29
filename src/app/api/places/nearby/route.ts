import { SEARCH_RADIUS_METERS } from "@/lib/config";
import { PlacesApiError, searchNearbyPlaces } from "@/lib/places/google";
import { buildMockPlaces } from "@/lib/places/mock";
import { nearbyRequestSchema } from "@/lib/schemas";
import { isMockModeServer, serverEnv } from "@/lib/server/env";
import { jsonError, parseJsonBody } from "@/lib/server/http";

/** POST /api/places/nearby — broad multi-category nearby search around the user. */
export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, nearbyRequestSchema);
  if (!parsed.ok) return parsed.response;
  const { latitude, longitude, radius = SEARCH_RADIUS_METERS } = parsed.data;
  const origin = { latitude, longitude };

  if (isMockModeServer()) {
    // development-only
    return Response.json({ places: buildMockPlaces(origin), source: "mock" });
  }

  if (!serverEnv.placesApiKey) {
    return jsonError(
      "not_configured",
      "Google Places APIキーが設定されていません（GOOGLE_PLACES_API_KEY）",
      503,
    );
  }

  try {
    const places = await searchNearbyPlaces(origin, radius);
    return Response.json({ places, source: "google" });
  } catch (err) {
    console.error("[nearby]", err);
    const status = err instanceof PlacesApiError && err.status === 429 ? 429 : 502;
    return jsonError("places_failed", "周辺スポットを取得できませんでした", status);
  }
}
