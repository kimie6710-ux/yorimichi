import "server-only";

import { distanceMeters, walkMinutes } from "@/lib/geo";
import { serverEnv } from "@/lib/server/env";
import type { LatLng, Place, PlacePhoto, PlaceReview } from "@/lib/types";
import { EXTENDED_TOWN_TYPES, FOOD_TYPES, SPOT_TYPES, TOWN_TYPES, labelForType } from "./place-types";

const PLACES_BASE = "https://places.googleapis.com/v1";
const LANGUAGE = "ja";
const REGION = "JP";
const TIMEOUT_MS = 8000;

// Keep masks tight: every extra field can bump the billing SKU.
const NEARBY_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.primaryType",
  "places.primaryTypeDisplayName",
  "places.types",
  "places.location",
  "places.shortFormattedAddress",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.photos",
  "places.googleMapsUri",
  "places.currentOpeningHours.openNow",
  "places.businessStatus",
  "places.editorialSummary",
].join(",");

const DETAILS_FIELD_MASK = [
  "id",
  "reviews",
  "regularOpeningHours.weekdayDescriptions",
  "currentOpeningHours.openNow",
  "websiteUri",
  "editorialSummary",
  "outdoorSeating",
  "servesCoffee",
  "servesDessert",
  "servesBreakfast",
  "goodForGroups",
  "goodForChildren",
  "liveMusic",
  "allowsDogs",
  "takeout",
  "dineIn",
].join(",");

// ── Raw Google response shapes (only the fields we request) ────────────

interface GLocalizedText {
  text?: string;
  languageCode?: string;
}
interface GPhoto {
  name?: string;
  widthPx?: number;
  heightPx?: number;
  authorAttributions?: { displayName?: string; uri?: string }[];
}
interface GReview {
  text?: GLocalizedText;
  originalText?: GLocalizedText;
  rating?: number;
  relativePublishTimeDescription?: string;
  authorAttribution?: { displayName?: string };
}
interface GPlace {
  id?: string;
  displayName?: GLocalizedText;
  primaryType?: string;
  primaryTypeDisplayName?: GLocalizedText;
  types?: string[];
  location?: { latitude?: number; longitude?: number };
  shortFormattedAddress?: string;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  photos?: GPhoto[];
  googleMapsUri?: string;
  currentOpeningHours?: { openNow?: boolean };
  businessStatus?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  editorialSummary?: GLocalizedText;
  reviews?: GReview[];
  websiteUri?: string;
  outdoorSeating?: boolean;
  servesCoffee?: boolean;
  servesDessert?: boolean;
  servesBreakfast?: boolean;
  goodForGroups?: boolean;
  goodForChildren?: boolean;
  liveMusic?: boolean;
  allowsDogs?: boolean;
  takeout?: boolean;
  dineIn?: boolean;
}

export class PlacesApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PlacesApiError";
  }
}

function requireKey(): string {
  if (!serverEnv.placesApiKey) {
    throw new PlacesApiError("GOOGLE_PLACES_API_KEY is not set", 500);
  }
  return serverEnv.placesApiKey;
}

async function placesFetch<T>(url: string, init: RequestInit & { fieldMask: string }): Promise<T> {
  const { fieldMask, headers, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": requireKey(),
      "X-Goog-FieldMask": fieldMask,
      ...headers,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new PlacesApiError(`Places API ${res.status}: ${body.slice(0, 300)}`, res.status);
  }
  return (await res.json()) as T;
}

function mapPhotos(photos: GPhoto[] | undefined): PlacePhoto[] {
  return (photos ?? [])
    .filter((p): p is GPhoto & { name: string } => typeof p.name === "string")
    .slice(0, 4)
    .map((p) => ({
      name: p.name,
      widthPx: p.widthPx ?? null,
      heightPx: p.heightPx ?? null,
      authorAttributions: (p.authorAttributions ?? []).map((a) => ({
        displayName: a.displayName ?? "Google user",
        uri: a.uri ?? null,
      })),
    }));
}

function mapReviews(reviews: GReview[] | undefined): PlaceReview[] {
  return (reviews ?? [])
    .map((r) => ({
      text: (r.text?.text ?? r.originalText?.text ?? "").trim(),
      rating: r.rating ?? null,
      relativeTime: r.relativePublishTimeDescription ?? null,
      authorName: r.authorAttribution?.displayName ?? null,
    }))
    .filter((r) => r.text.length > 0)
    .slice(0, 5);
}

function mapAttributes(g: GPlace): string[] {
  const out: string[] = [];
  if (g.outdoorSeating) out.push("屋外席あり");
  if (g.servesCoffee) out.push("コーヒーあり");
  if (g.servesDessert) out.push("デザートあり");
  if (g.servesBreakfast) out.push("朝食あり");
  if (g.goodForGroups) out.push("グループ向き");
  if (g.goodForGroups === false) out.push("グループ向きではない");
  if (g.goodForChildren) out.push("子ども連れ向き");
  if (g.liveMusic) out.push("ライブ音楽あり");
  if (g.allowsDogs) out.push("犬OK");
  if (g.takeout) out.push("テイクアウト可");
  if (g.dineIn === false) out.push("イートインなし");
  return out;
}

function toPlace(g: GPlace, origin: LatLng): Place | null {
  if (!g.id || !g.displayName?.text || g.location?.latitude == null || g.location.longitude == null) {
    return null;
  }
  const location = { latitude: g.location.latitude, longitude: g.location.longitude };
  const dist = distanceMeters(origin, location);
  const primaryType = g.primaryType ?? g.types?.[0] ?? null;
  return {
    placeId: g.id,
    name: g.displayName.text,
    primaryType,
    primaryTypeLabel: g.primaryTypeDisplayName?.text ?? labelForType(primaryType),
    types: (g.types ?? []).slice(0, 12),
    location,
    address: g.shortFormattedAddress ?? null,
    rating: g.rating ?? null,
    userRatingCount: g.userRatingCount ?? null,
    priceLevel: g.priceLevel ?? null,
    openNow: g.currentOpeningHours?.openNow ?? null,
    businessStatus: g.businessStatus ?? null,
    editorialSummary: g.editorialSummary?.text ?? null,
    attributes: mapAttributes(g),
    photos: mapPhotos(g.photos),
    googleMapsUri: g.googleMapsUri ?? null,
    reviews: mapReviews(g.reviews),
    weekdayHours: g.regularOpeningHours?.weekdayDescriptions ?? [],
    websiteUri: g.websiteUri ?? null,
    distanceMeters: Math.round(dist),
    walkMinutes: walkMinutes(dist),
  };
}

interface NearbyCall {
  includedTypes?: string[];
  rankPreference: "POPULARITY" | "DISTANCE";
}

async function searchNearbyOnce(origin: LatLng, radius: number, call: NearbyCall): Promise<GPlace[]> {
  const body = {
    ...(call.includedTypes ? { includedTypes: call.includedTypes } : {}),
    maxResultCount: 20,
    rankPreference: call.rankPreference,
    languageCode: LANGUAGE,
    regionCode: REGION,
    locationRestriction: {
      circle: { center: origin, radius },
    },
  };
  const data = await placesFetch<{ places?: GPlace[] }>(`${PLACES_BASE}/places:searchNearby`, {
    method: "POST",
    body: JSON.stringify(body),
    fieldMask: NEARBY_FIELD_MASK,
  });
  return data.places ?? [];
}

/** Town-type search that tolerates Google rejecting the newer types. */
async function searchTownTypes(origin: LatLng, radius: number): Promise<GPlace[]> {
  try {
    return await searchNearbyOnce(origin, radius, {
      includedTypes: [...TOWN_TYPES, ...EXTENDED_TOWN_TYPES],
      rankPreference: "POPULARITY",
    });
  } catch (err) {
    if (err instanceof PlacesApiError && err.status === 400) {
      return searchNearbyOnce(origin, radius, { includedTypes: TOWN_TYPES, rankPreference: "POPULARITY" });
    }
    throw err;
  }
}

/** Spots that aren't shops, nearest first (popularity buries them under malls near stations). */
async function searchSpotTypes(origin: LatLng, radius: number): Promise<GPlace[]> {
  try {
    return await searchNearbyOnce(origin, radius, { includedTypes: SPOT_TYPES, rankPreference: "DISTANCE" });
  } catch (err) {
    if (err instanceof PlacesApiError && err.status === 400) {
      return searchNearbyOnce(origin, radius, { includedTypes: ["park", "tourist_attraction", "historical_landmark", "museum", "art_gallery", "library"], rankPreference: "DISTANCE" });
    }
    throw err;
  }
}

/**
 * Fetch a broad, multi-category slice of the neighbourhood.
 * Four parallel calls (spots / food / town / anything-closest) are merged round-robin
 * so no single category dominates the candidate list.
 */
export async function searchNearbyPlaces(
  origin: LatLng,
  radius: number,
  limit = 40,
): Promise<Place[]> {
  const settled = await Promise.allSettled([
    searchSpotTypes(origin, radius),
    searchNearbyOnce(origin, radius, { includedTypes: FOOD_TYPES, rankPreference: "POPULARITY" }),
    searchTownTypes(origin, radius),
    searchNearbyOnce(origin, radius, { rankPreference: "DISTANCE" }),
  ]);

  const lists = settled
    .filter((r): r is PromiseFulfilledResult<GPlace[]> => r.status === "fulfilled")
    .map((r) => r.value);

  if (lists.length === 0) {
    const first = settled[0];
    throw first.status === "rejected" ? first.reason : new PlacesApiError("Nearby search failed", 502);
  }

  const seen = new Set<string>();
  const merged: Place[] = [];
  const maxLen = Math.max(...lists.map((l) => l.length));
  for (let i = 0; i < maxLen && merged.length < limit; i++) {
    for (const list of lists) {
      const g = list[i];
      if (!g?.id || seen.has(g.id)) continue;
      const place = toPlace(g, origin);
      if (!place) continue;
      // Don't send people to places that are closed for good (or for now).
      if (place.businessStatus && place.businessStatus !== "OPERATIONAL") continue;
      seen.add(g.id);
      merged.push(place);
      if (merged.length >= limit) break;
    }
  }
  return merged;
}

/** Full details (basic + reviews/atmosphere) for a few place ids. */
export async function getPlaceDetails(placeIds: string[], origin: LatLng): Promise<Place[]> {
  const basic = NEARBY_FIELD_MASK.split(",").map((f) => f.replace(/^places\./, ""));
  const mask = [...new Set([...basic, ...DETAILS_FIELD_MASK.split(",")])].join(",");
  const results = await Promise.allSettled(
    placeIds.map((id) =>
      placesFetch<GPlace>(
        `${PLACES_BASE}/places/${encodeURIComponent(id)}?languageCode=${LANGUAGE}&regionCode=${REGION}`,
        { method: "GET", fieldMask: mask },
      ),
    ),
  );
  return results
    .filter((r): r is PromiseFulfilledResult<GPlace> => r.status === "fulfilled")
    .map((r) => toPlace(r.value, origin))
    .filter((p): p is Place => p !== null);
}

/** Resolve a Places photo resource name to a short-lived googleusercontent URL. */
export async function resolvePhotoUri(photoName: string, maxWidthPx: number): Promise<string> {
  const key = requireKey();
  const url = `${PLACES_BASE}/${photoName}/media?maxWidthPx=${maxWidthPx}&skipHttpRedirect=true&key=${encodeURIComponent(key)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new PlacesApiError(`Photo ${res.status}`, res.status);
  const data = (await res.json()) as { photoUri?: string };
  if (!data.photoUri) throw new PlacesApiError("Photo URI missing", 502);
  return data.photoUri;
}
