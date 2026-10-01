"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { api, ApiClientError } from "@/lib/api-client";
import { MICHIBI_LINES } from "@/lib/character";
import { mockLocation } from "@/lib/config";
import { distanceMeters, isInServiceArea } from "@/lib/geo";
import type { LatLng, MapSpot, NearPlace } from "@/lib/types";

// ─────────────────────────────────────────────────────────────
// The single source of truth for "where the user is".
// Location is read once from the device (Geolocation API) and flows to:
//   map center → current-location marker → nearby spots → distances.
// No component asks for the location on its own, and there is no hard-coded
// fallback coordinate. The only exception is the explicit dev mock
// (NEXT_PUBLIC_USE_MOCK_LOCATION=true + NEXT_PUBLIC_MOCK_LAT/LNG).
// ─────────────────────────────────────────────────────────────

export interface CurrentLocation extends LatLng {
  /** Accuracy radius in meters (null for mock). */
  accuracy: number | null;
  source: "device" | "mock";
}

export type LocationStatus = "locating" | "ready" | "denied" | "unavailable" | "unsupported" | "outside";
/** loading = fetching places; seeding = the AI is writing copies for new ones. */
export type SpotsStatus = "idle" | "loading" | "seeding" | "ready" | "error";

interface TownState {
  currentLocation: CurrentLocation | null;
  locationStatus: LocationStatus;
  spots: MapSpot[];
  /** Nearest places of any kind (for stickers shot anywhere). */
  around: NearPlace[];
  spotsStatus: SpotsStatus;
  spotsError: string | null;
  /** Where the spots were loaded from. */
  spotsOrigin: LatLng | null;
  unread: number;
}

interface TownContextValue extends TownState {
  /** Ask the device for its position (also used by 「現在地を使う」). */
  locate: () => void;
  acceptOutsideArea: () => void;
  refreshSpots: () => void;
  findSpot: (placeId: string) => MapSpot | null;
  patchSpot: (placeId: string, patch: Partial<MapSpot>) => void;
  refreshUnread: () => void;
  /** Follow the device position live (used while walking to a spot). */
  startTracking: () => void;
  stopTracking: () => void;
}

const GEO_OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 };
/** Reload the neighbourhood only after moving this far. */
const RELOAD_METERS = 250;

const TownContext = createContext<TownContextValue | null>(null);

export function SearchProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TownState>({
    currentLocation: null,
    locationStatus: "locating",
    spots: [],
    around: [],
    spotsStatus: "idle",
    spotsError: null,
    spotsOrigin: null,
    unread: 0,
  });
  const watchId = useRef<number | null>(null);
  const loadId = useRef(0);
  const originRef = useRef<LatLng | null>(null);
  const locRef = useRef<CurrentLocation | null>(null);

  const loadSpots = useCallback(async (origin: LatLng) => {
    const id = ++loadId.current;
    originRef.current = origin;
    setState((s) => ({ ...s, spotsStatus: "loading", spotsError: null, spotsOrigin: origin }));
    try {
      const res = await api.nearbySpots(origin);
      if (id !== loadId.current) return;
      setState((s) => ({ ...s, spots: res.spots, around: res.around ?? [], spotsStatus: res.pending.length ? "seeding" : "ready" }));
      if (res.pending.length === 0) {
        if (res.spots.length === 0) setState((s) => ({ ...s, spotsError: MICHIBI_LINES.empty }));
        return;
      }
      const seeded = await api.seedSpots(origin, res.pending).catch(() => ({ spots: [] as MapSpot[] }));
      if (id !== loadId.current) return;
      setState((s) => {
        const known = new Set(s.spots.map((x) => x.place.placeId));
        const spots = [...s.spots, ...seeded.spots.filter((x) => !known.has(x.place.placeId))].sort(
          (a, b) => a.place.distanceMeters - b.place.distanceMeters,
        );
        return { ...s, spots, spotsStatus: "ready", spotsError: spots.length ? null : MICHIBI_LINES.empty };
      });
    } catch (err) {
      if (id !== loadId.current) return;
      const e = err instanceof ApiClientError ? err : null;
      setState((s) => ({
        ...s,
        spotsStatus: "error",
        spotsError: e?.code === "network" ? MICHIBI_LINES.networkError : (e?.message ?? "うまくいかなかった。"),
      }));
    }
  }, []);

  const refreshUnread = useCallback(() => {
    api
      .unread()
      .then(({ unread }) => setState((s) => (s.unread === unread ? s : { ...s, unread })))
      .catch(() => undefined);
  }, []);

  // Live tracking updates the same currentLocation — still one source of truth.
  const startTracking = useCallback(() => {
    if (mockLocation() || typeof navigator === "undefined" || !navigator.geolocation) return;
    if (watchId.current !== null) return;
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const loc: CurrentLocation = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : null,
          source: "device",
        };
        locRef.current = loc;
        setState((s) => ({ ...s, currentLocation: loc }));
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
  }, []);
  const stopTracking = useCallback(() => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
  }, []);

  const applyLocation = useCallback(
    (loc: CurrentLocation) => {
      const inside = isInServiceArea(loc);
      locRef.current = loc;
      setState((s) => ({ ...s, currentLocation: loc, locationStatus: inside ? "ready" : "outside" }));
      const origin = originRef.current;
      if (inside && (!origin || distanceMeters(origin, loc) > RELOAD_METERS)) void loadSpots(loc);
    },
    [loadSpots],
  );

  const locate = useCallback(() => {
    const mock = mockLocation();
    if (mock) {
      applyLocation({ ...mock, accuracy: null, source: "mock" });
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState((s) => ({ ...s, locationStatus: "unsupported" }));
      return;
    }
    setState((s) => ({ ...s, locationStatus: "locating" }));
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        applyLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : null,
          source: "device",
        }),
      (err) => setState((s) => ({ ...s, locationStatus: err.code === err.PERMISSION_DENIED ? "denied" : "unavailable" })),
      GEO_OPTIONS,
    );
  }, [applyLocation]);

  const acceptOutsideArea = useCallback(() => {
    if (locRef.current) void loadSpots(locRef.current);
    setState((s) => ({ ...s, locationStatus: "ready" }));
  }, [loadSpots]);

  const refreshSpots = useCallback(() => {
    if (locRef.current) void loadSpots(locRef.current);
  }, [loadSpots]);

  // One location request for the whole app, on first mount.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time: ask the device where we are
    locate();
    refreshUnread();
    const t = setInterval(refreshUnread, 60_000);
    return () => clearInterval(t);
  }, [locate, refreshUnread]);

  const findSpot = useCallback((placeId: string) => state.spots.find((s) => s.place.placeId === placeId) ?? null, [state.spots]);
  const patchSpot = useCallback((placeId: string, patch: Partial<MapSpot>) => {
    setState((s) => ({ ...s, spots: s.spots.map((x) => (x.place.placeId === placeId ? { ...x, ...patch } : x)) }));
  }, []);

  const value = useMemo<TownContextValue>(
    () => ({ ...state, locate, acceptOutsideArea, refreshSpots, findSpot, patchSpot, refreshUnread, startTracking, stopTracking }),
    [state, locate, acceptOutsideArea, refreshSpots, findSpot, patchSpot, refreshUnread, startTracking, stopTracking],
  );
  return <TownContext.Provider value={value}>{children}</TownContext.Provider>;
}

export function useSearch(): TownContextValue {
  const ctx = useContext(TownContext);
  if (!ctx) throw new Error("useSearch must be used inside <SearchProvider>");
  return ctx;
}
