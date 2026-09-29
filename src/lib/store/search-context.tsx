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

import { ApiClientError, fetchNearby, interpret } from "@/lib/api-client";
import { MICHIBI_LINES } from "@/lib/character";
import { mockLocation } from "@/lib/config";
import { distanceMeters, isInServiceArea } from "@/lib/geo";
import { querySchema } from "@/lib/schemas";
import type { LatLng, Place, RecommendedSpot, SearchResponse } from "@/lib/types";

// ─────────────────────────────────────────────────────────────
// The single source of truth for "where the user is".
// Location is read once from the device (Geolocation API) and flows to:
//   map center → current-location marker → Nearby Search → AI → distances.
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
export type SearchStatus = "idle" | "places" | "ai" | "done" | "error";

export interface SearchError {
  kind: "places" | "empty" | "network" | "config" | "input" | "unknown";
  message: string;
}

interface SearchState {
  currentLocation: CurrentLocation | null;
  locationStatus: LocationStatus;
  /** Places around currentLocation, prefetched as soon as the location is known. */
  nearby: Place[] | null;
  status: SearchStatus;
  query: string;
  result: SearchResponse | null;
  error: SearchError | null;
  history: string[];
}

interface SearchContextValue extends SearchState {
  /** Ask the device for its position (also used by 「現在地を許可する」). */
  locate: () => void;
  /** Keep using the real location even if it's outside the service area. */
  acceptOutsideArea: () => void;
  runSearch: (query: string) => Promise<boolean>;
  retry: () => void;
  findSpot: (placeId: string) => RecommendedSpot | null;
  /** Follow the device position live (used while guiding to a spot). */
  startTracking: () => void;
  stopTracking: () => void;
}

const GEO_OPTIONS: PositionOptions = { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 };
/** Re-use prefetched places only while the user is still roughly in the same spot. */
const PREFETCH_REUSE_METERS = 120;

/**
 * The loading screen is part of the experience (みちびが街を読み込む時間), so it
 * stays up for a minimum time even when the APIs answer instantly.
 * Slower real responses are never delayed further.
 */
const MIN_PLACES_STAGE_MS = 1400;
const MIN_TOTAL_LOADING_MS = 4200;
const waitUntil = (start: number, ms: number) =>
  new Promise<void>((r) => setTimeout(r, Math.max(0, start + ms - performance.now())));

const RESULT_KEY = "yorumichi:lastSearch";
const HISTORY_KEY = "yorumichi:history";

function readStorage<T>(storage: "session" | "local", key: string): T | null {
  try {
    const s = storage === "session" ? window.sessionStorage : window.localStorage;
    const raw = s.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeStorage(storage: "session" | "local", key: string, value: unknown) {
  try {
    const s = storage === "session" ? window.sessionStorage : window.localStorage;
    s.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked — non-critical */
  }
}

const SearchContext = createContext<SearchContextValue | null>(null);

export function SearchProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SearchState>({
    currentLocation: null,
    locationStatus: "locating",
    nearby: null,
    status: "idle",
    query: "",
    result: null,
    error: null,
    history: [],
  });
  const lastQuery = useRef("");
  const runId = useRef(0);
  const prefetch = useRef<{ origin: LatLng; promise: Promise<Place[]> } | null>(null);
  const watchId = useRef<number | null>(null);

  // Live tracking updates the same currentLocation — still one source of truth.
  const startTracking = useCallback(() => {
    if (mockLocation() || typeof navigator === "undefined" || !navigator.geolocation) return;
    if (watchId.current !== null) return;
    watchId.current = navigator.geolocation.watchPosition(
      (pos) =>
        setState((s) => ({
          ...s,
          currentLocation: {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : null,
            source: "device",
          },
        })),
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
  }, []);
  const stopTracking = useCallback(() => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
  }, []);

  const startPrefetch = useCallback((origin: LatLng) => {
    const promise = fetchNearby(origin).then((r) => r.places);
    prefetch.current = { origin, promise };
    promise
      .then((places) => setState((s) => (s.currentLocation === null ? s : { ...s, nearby: places })))
      .catch(() => {
        if (prefetch.current?.promise === promise) prefetch.current = null;
      });
  }, []);

  const applyLocation = useCallback(
    (loc: CurrentLocation) => {
      const inside = isInServiceArea(loc);
      setState((s) => ({ ...s, currentLocation: loc, locationStatus: inside ? "ready" : "outside" }));
      if (inside) startPrefetch(loc);
    },
    [startPrefetch],
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
      (err) =>
        setState((s) => ({
          ...s,
          locationStatus: err.code === err.PERMISSION_DENIED ? "denied" : "unavailable",
        })),
      GEO_OPTIONS,
    );
  }, [applyLocation]);

  const acceptOutsideArea = useCallback(() => {
    setState((s) => {
      if (!s.currentLocation) return s;
      startPrefetch(s.currentLocation);
      return { ...s, locationStatus: "ready" };
    });
  }, [startPrefetch]);

  // One location request for the whole app, on first mount. Also restore the
  // last result and query history (never a stored location).
  useEffect(() => {
    const result = readStorage<SearchResponse>("session", RESULT_KEY);
    const history = readStorage<string[]>("local", HISTORY_KEY) ?? [];
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from browser storage
    setState((s) => ({
      ...s,
      history,
      ...(result ? { result, status: "done" as const, query: result.query } : {}),
    }));
    locate();
  }, [locate]);

  const runSearch = useCallback(
    async (rawQuery: string): Promise<boolean> => {
      const parsed = querySchema.safeParse(rawQuery);
      if (!parsed.success) {
        setState((s) => ({
          ...s,
          error: { kind: "input", message: parsed.error.issues[0]?.message ?? "入力を確認してね" },
        }));
        return false;
      }
      const origin = state.currentLocation;
      if (!origin || state.locationStatus !== "ready") return false;

      const query = parsed.data;
      lastQuery.current = query;
      const id = ++runId.current;
      const history = [query, ...state.history.filter((h) => h !== query)].slice(0, 3);
      writeStorage("local", HISTORY_KEY, history);
      setState((s) => ({ ...s, query, history, status: "places", error: null }));

      const startedAt = performance.now();
      try {
        // Nearby Search is centred on the same currentLocation (prefetched if possible).
        const cached = prefetch.current;
        const places =
          cached && distanceMeters(cached.origin, origin) < PREFETCH_REUSE_METERS
            ? await cached.promise.catch(() => fetchNearby(origin).then((r) => r.places))
            : await fetchNearby(origin).then((r) => r.places);
        await waitUntil(startedAt, MIN_PLACES_STAGE_MS);
        if (id !== runId.current) return false;
        if (places.length === 0) {
          setState((s) => ({ ...s, status: "error", error: { kind: "empty", message: MICHIBI_LINES.empty } }));
          return false;
        }
        setState((s) => ({ ...s, status: "ai" }));
        const result = await interpret(query, origin, places);
        await waitUntil(startedAt, MIN_TOTAL_LOADING_MS);
        if (id !== runId.current) return false;
        writeStorage("session", RESULT_KEY, result);
        setState((s) => ({ ...s, status: "done", result }));
        return true;
      } catch (err) {
        if (id !== runId.current) return false;
        prefetch.current = null;
        const e = err instanceof ApiClientError ? err : null;
        const error: SearchError =
          e?.code === "network"
            ? { kind: "network", message: MICHIBI_LINES.networkError }
            : e?.code === "not_configured"
              ? { kind: "config", message: e.message }
              : e?.code === "places_failed"
                ? { kind: "places", message: "周辺スポットを取ってこれなかった。少しおいて、もう一回。" }
                : { kind: "unknown", message: e?.message ?? "うまくいかなかった。" };
        setState((s) => ({ ...s, status: "error", error }));
        return false;
      }
    },
    [state.currentLocation, state.locationStatus, state.history],
  );

  const retry = useCallback(() => {
    if (lastQuery.current) void runSearch(lastQuery.current);
  }, [runSearch]);

  const findSpot = useCallback(
    (placeId: string) => state.result?.spots.find((s) => s.place.placeId === placeId) ?? null,
    [state.result],
  );

  const value = useMemo<SearchContextValue>(
    () => ({ ...state, locate, acceptOutsideArea, runSearch, retry, findSpot, startTracking, stopTracking }),
    [state, locate, acceptOutsideArea, runSearch, retry, findSpot, startTracking, stopTracking],
  );

  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

export function useSearch(): SearchContextValue {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error("useSearch must be used inside <SearchProvider>");
  return ctx;
}
