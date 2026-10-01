import { SERVICE_AREAS, publicConfig, type ServiceArea } from "./config";
import type { LatLng } from "./types";

const EARTH_RADIUS_M = 6_371_000;
/** Average walking speed (m/min). 80m/分 is the Japanese real-estate standard. */
const WALK_METERS_PER_MIN = 80;
/** Streets are not straight lines. */
const DETOUR_FACTOR = 1.25;

export function distanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export function walkMinutes(meters: number): number {
  return Math.max(1, Math.round((meters * DETOUR_FACTOR) / WALK_METERS_PER_MIN));
}

export function findServiceArea(loc: LatLng): ServiceArea | null {
  return (
    SERVICE_AREAS.find(
      ({ bounds }) =>
        loc.latitude >= bounds.south &&
        loc.latitude <= bounds.north &&
        loc.longitude >= bounds.west &&
        loc.longitude <= bounds.east,
    ) ?? null
  );
}

export function isInServiceArea(loc: LatLng): boolean {
  if (publicConfig.serviceArea === "all") return true;
  return findServiceArea(loc) !== null;
}

/** The place's own page on Google Maps (app or web). */
export function googlePlaceUrl(loc: LatLng, placeId?: string): string {
  const params = new URLSearchParams({ api: "1", query: `${loc.latitude},${loc.longitude}` });
  if (placeId && !placeId.startsWith("mock_")) params.set("query_place_id", placeId);
  return `https://www.google.com/maps/search/?${params.toString()}`;
}

export function googleMapsWalkingUrl(dest: LatLng, placeId?: string): string {
  const params = new URLSearchParams({
    api: "1",
    destination: `${dest.latitude},${dest.longitude}`,
    travelmode: "walking",
  });
  if (placeId && !placeId.startsWith("mock_")) params.set("destination_place_id", placeId);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Compass bearing from a to b, in degrees (0 = north, 90 = east). */
export function bearingDegrees(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(a.latitude);
  const φ2 = toRad(b.latitude);
  const Δλ = toRad(b.longitude - a.longitude);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const COMPASS = ["北", "北東", "東", "南東", "南", "南西", "西", "北西"];
/** 「北西」 etc. for a bearing. */
export function compassWord(deg: number): string {
  return COMPASS[Math.round(deg / 45) % 8];
}
