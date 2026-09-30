import { SEARCH_RADIUS_METERS } from "@/lib/config";
import { identify } from "@/lib/server/identity";
import { PlacesApiError, searchNearbyPlaces } from "@/lib/places/google";
import { buildMockPlaces } from "@/lib/places/mock";
import { spotsNearbyRequestSchema } from "@/lib/schemas";
import { isMockModeServer, serverEnv } from "@/lib/server/env";
import { jsonError, parseJsonBody } from "@/lib/server/http";
import { toMapSpots, touchUser } from "@/lib/server/services";
import type { Place } from "@/lib/types";

const MAX_ON_MAP = 12;
const SEED_BATCH = 8;

/** Spread picks across categories, nearest first. */
function diverse(places: Place[], n: number): Place[] {
  const buckets = new Map<string, Place[]>();
  for (const p of [...places].sort((a, b) => a.distanceMeters - b.distanceMeters)) {
    const k = p.primaryType ?? "other";
    buckets.set(k, [...(buckets.get(k) ?? []), p]);
  }
  const lists = [...buckets.values()];
  const out: Place[] = [];
  for (let i = 0; out.length < n && lists.some((l) => l.length > i); i++) for (const l of lists) if (l[i] && out.length < n) out.push(l[i]);
  return out;
}

/**
 * POST /api/spots/nearby — real places around the user with their よるみち layer.
 * Returns what already has a copy right away, plus which places still need one.
 */
export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, spotsNearbyRequestSchema);
  if (!parsed.ok) return parsed.response;
  const origin = parsed.data;

  let places: Place[];
  if (isMockModeServer()) {
    places = buildMockPlaces(origin); // development-only
  } else if (!serverEnv.placesApiKey) {
    return jsonError("not_configured", "Google Places APIキーが設定されていません", 503);
  } else {
    try {
      places = await searchNearbyPlaces(origin, SEARCH_RADIUS_METERS);
    } catch (err) {
      console.error("[spots:nearby]", err);
      const status = err instanceof PlacesApiError && err.status === 429 ? 429 : 502;
      return jsonError("places_failed", "周辺スポットを取得できませんでした", status);
    }
  }

  const userId = await identify(req);
  if (userId) await touchUser(userId, origin).catch(() => undefined);

  const all = await toMapSpots(places, userId);
  const withCopy = all.filter((s) => s.copy).sort((a, b) => a.place.distanceMeters - b.place.distanceMeters).slice(0, MAX_ON_MAP);
  const room = Math.max(0, Math.min(SEED_BATCH, MAX_ON_MAP - withCopy.length));
  const pending = diverse(all.filter((s) => !s.copy).map((s) => s.place), room);

  return Response.json({ spots: withCopy, pending, total: places.length });
}
