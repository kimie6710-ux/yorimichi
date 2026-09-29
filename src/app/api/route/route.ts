import { z } from "zod";

import { latLngSchema } from "@/lib/schemas";
import { isMockModeServer, serverEnv } from "@/lib/server/env";
import { parseJsonBody } from "@/lib/server/http";

const bodySchema = z.object({ origin: latLngSchema, destination: latLngSchema });

/** Decode a Google encoded polyline into points. */
function decodePolyline(encoded: string) {
  const points: { latitude: number; longitude: number }[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    for (const axis of [0, 1]) {
      let result = 0, shift = 0, b: number;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (axis === 0) lat += delta;
      else lng += delta;
    }
    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

/**
 * POST /api/route — walking route for the in-app guide (Routes API).
 * Falls back to a straight line so the guide always has something to show.
 */
export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  const { origin, destination } = parsed.data;
  const straight = { points: [origin, destination], source: "straight" as const };

  if (isMockModeServer() || !serverEnv.placesApiKey) return Response.json(straight);

  try {
    const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": serverEnv.placesApiKey,
        "X-Goog-FieldMask": "routes.polyline.encodedPolyline,routes.distanceMeters,routes.duration",
      },
      body: JSON.stringify({
        origin: { location: { latLng: origin } },
        destination: { location: { latLng: destination } },
        travelMode: "WALK",
        languageCode: "ja",
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.warn("[route] Routes API", res.status, (await res.text()).slice(0, 200));
      return Response.json(straight);
    }
    const data = (await res.json()) as {
      routes?: { polyline?: { encodedPolyline?: string }; distanceMeters?: number; duration?: string }[];
    };
    const r = data.routes?.[0];
    if (!r?.polyline?.encodedPolyline) return Response.json(straight);
    return Response.json({
      points: decodePolyline(r.polyline.encodedPolyline),
      distanceMeters: r.distanceMeters ?? null,
      source: "google",
    });
  } catch (err) {
    console.warn("[route]", err);
    return Response.json(straight);
  }
}
