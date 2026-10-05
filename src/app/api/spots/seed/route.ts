import { identify } from "@/lib/server/identity";
import { seedRequestSchema } from "@/lib/schemas";
import { isMockModeServer } from "@/lib/server/env";
import { jsonError, parseJsonBody } from "@/lib/server/http";
import { seedCopies, toMapSpots } from "@/lib/server/services";
import type { Place } from "@/lib/types";

export const maxDuration = 60;

/** POST /api/spots/seed — give places their first line (AI) and return them as map spots. */
export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, seedRequestSchema);
  if (!parsed.ok) return parsed.response;
  const places = parsed.data.places as Place[];
  if (!isMockModeServer() && places.some((p) => p.isMock || p.placeId.startsWith("mock_"))) {
    return jsonError("invalid_input", "mock places are not allowed", 400);
  }
  try {
    const copies = await seedCopies(places);
    const userId = await identify(req);
    const spots = await toMapSpots(places.filter((p) => copies.has(p.placeId)), userId);
    return Response.json({ spots });
  } catch (err) {
    console.error("[spots:seed]", err);
    return jsonError("ai_failed", "ことばを置けなかった。", 502);
  }
}
