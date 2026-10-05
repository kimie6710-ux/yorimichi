// Client-safe configuration. Only NEXT_PUBLIC_* values may live here.

import type { LatLng } from "./types";

export const APP_NAME = "よりみち";
export const APP_TAGLINE = "いつもの道を、知らない道に。";

export const publicConfig = {
  /** Browser key for the Maps JavaScript API (restrict it by HTTP referrer). */
  mapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
  /** Map ID for Advanced Markers + cloud styling. "DEMO_MAP_ID" works for development. */
  mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "DEMO_MAP_ID",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  /** development-only switch. Ignored on Vercel production (see isMockModeServer). */
  useMockData: process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true",
  /** "all" (default) works wherever the user is. "tokyo" limits exploration to Tokyo. */
  serviceArea: (process.env.NEXT_PUBLIC_SERVICE_AREA === "tokyo" ? "tokyo" : "all") as "tokyo" | "all",
} as const;

/**
 * development-only fixed location. Used ONLY when NEXT_PUBLIC_USE_MOCK_LOCATION=true
 * AND both NEXT_PUBLIC_MOCK_LAT / NEXT_PUBLIC_MOCK_LNG are valid numbers.
 * Otherwise the app always uses the device's real position (Geolocation API).
 * There is no hard-coded fallback coordinate anywhere in the app.
 */
export function mockLocation(): LatLng | null {
  if (process.env.NEXT_PUBLIC_USE_MOCK_LOCATION !== "true") return null;
  const latitude = Number(process.env.NEXT_PUBLIC_MOCK_LAT);
  const longitude = Number(process.env.NEXT_PUBLIC_MOCK_LNG);
  if (!process.env.NEXT_PUBLIC_MOCK_LAT || !process.env.NEXT_PUBLIC_MOCK_LNG) return null;
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

export const hasMapsKey = () => publicConfig.mapsApiKey.length > 0;
export const hasSupabase = () =>
  publicConfig.supabaseUrl.length > 0 && publicConfig.supabaseAnonKey.length > 0;

export interface ServiceArea {
  id: string;
  label: string;
  /** Rough bounding box. Replace with a polygon when going nationwide. */
  bounds: { south: number; west: number; north: number; east: number };
}

/** Add areas here to expand coverage — nothing else is Tokyo-specific. */
export const SERVICE_AREAS: ServiceArea[] = [
  {
    id: "tokyo",
    label: "東京",
    // 23区＋多摩地域（島しょ部は除く）
    bounds: { south: 35.49, west: 138.94, north: 35.9, east: 139.93 },
  },
];

export const SEARCH_RADIUS_METERS = 800;

/**
 * For now the map stays inside 町田市: you can't drag or zoom out past it.
 * (A little margin around the city so its edges aren't stuck to the screen.)
 */
export const MAP_LIMIT = { north: 35.64, south: 35.495, west: 139.32, east: 139.515 };
/** Zoomed out further than this, the whole city is already in view. */
export const MAP_MIN_ZOOM = 12;
