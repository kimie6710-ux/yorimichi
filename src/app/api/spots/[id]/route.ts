import { getPlaceDetails } from "@/lib/places/google";
import { placeIdSchema } from "@/lib/schemas";
import { identify } from "@/lib/server/identity";
import { serverEnv } from "@/lib/server/env";
import { jsonError, latLngFromSearch } from "@/lib/server/http";
import { getSpotRow, placeFromRow, spotDetail } from "@/lib/server/services";

/** GET /api/spots/:id?lat=&lng= — the spot page (basic info + よりみち layer). */
export async function GET(req: Request, ctx: RouteContext<"/api/spots/[id]">) {
  const { id } = await ctx.params;
  if (!placeIdSchema.safeParse(id).success) return jsonError("invalid_input", "invalid id", 400);
  const row = await getSpotRow(id);
  if (!row) return jsonError("invalid_input", "スポットが見つかりません", 404);
  const at = latLngFromSearch(req);
  let place = placeFromRow(row, at);
  if (serverEnv.placesApiKey && !place.isMock) {
    try {
      const [fresh] = await getPlaceDetails([id], at ?? place.location);
      if (fresh) place = { ...place, ...fresh, distanceMeters: place.distanceMeters, walkMinutes: place.walkMinutes };
    } catch (err) {
      console.warn("[spots:detail] details failed:", err);
    }
  }
  const userId = await identify(req);
  return Response.json(await spotDetail(id, place, userId, at));
}
