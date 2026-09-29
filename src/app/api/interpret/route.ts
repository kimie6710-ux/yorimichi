import { runInterpretation } from "@/lib/ai/pipeline";
import { interpretRequestSchema } from "@/lib/schemas";
import { isMockModeServer } from "@/lib/server/env";
import { jsonError, parseJsonBody } from "@/lib/server/http";
import { supabaseForRequest } from "@/lib/supabase/server";
import type { Place, SearchResponse } from "@/lib/types";

export const maxDuration = 60;

/** POST /api/interpret — apply the "slightly off" AI filter to real nearby places. */
export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, interpretRequestSchema);
  if (!parsed.ok) return parsed.response;
  const { query, origin } = parsed.data;
  const places = parsed.data.places as Place[];

  // Mock spots must never be processed outside mock mode.
  if (!isMockModeServer() && places.some((p) => p.isMock || p.placeId.startsWith("mock_"))) {
    return jsonError("invalid_input", "mock places are not allowed", 400);
  }

  const result = await runInterpretation(query, origin, places);

  const response: SearchResponse = {
    searchId: crypto.randomUUID(),
    query,
    origin,
    interpretedIntent: result.interpretedIntent,
    spots: result.spots,
    nearby: result.places,
    mode: result.mode,
    michibiComment: result.michibiComment,
    notice: result.notice,
    createdAt: new Date().toISOString(),
  };

  // Persist (best effort — never block the result on the database).
  const sb = await supabaseForRequest(req);
  if (sb) {
    const { error: searchErr } = await sb.client.from("searches").insert({
      id: response.searchId,
      user_id: sb.userId,
      query,
      latitude: origin.latitude,
      longitude: origin.longitude,
      mode: response.mode,
    });
    if (searchErr) {
      console.warn("[interpret] save search failed:", searchErr.message);
    } else if (response.spots.length > 0) {
      const { error: recErr } = await sb.client.from("recommendations").insert(
        response.spots.map(({ recommendation: r, place }) => ({
          id: r.id,
          search_id: response.searchId,
          place_id: r.placeId,
          real_name: place.name,
          ai_title: r.title,
          interpretation: r.interpretation,
          why: r.why,
          kind: r.kind,
          interpretation_axis: r.interpretationAxis,
          surprise_score: r.surpriseScore,
          confidence: r.confidence,
          latitude: place.location.latitude,
          longitude: place.location.longitude,
        })),
      );
      if (recErr) console.warn("[interpret] save recommendations failed:", recErr.message);
    }
  }

  return Response.json(response);
}
