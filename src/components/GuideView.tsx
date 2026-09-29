"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { distanceMeters, walkMinutes } from "@/lib/geo";
import { useSearch } from "@/lib/store/search-context";
import type { LatLng, RecommendedSpot } from "@/lib/types";
import { MapView } from "./map/MapView";
import { Michibi } from "./Michibi";

const ARRIVE_METERS = 40;
const REROUTE_METERS = 150;

/**
 * In-app walking guide. Shows only the number and the copy — the real place
 * stays a surprise until arrival. Follows the device position live.
 */
export function GuideView({
  spot,
  index,
  onArrive,
  onQuit,
}: {
  spot: RecommendedSpot;
  index: number | null;
  onArrive: () => void;
  onQuit: () => void;
}) {
  const { currentLocation, startTracking, stopTracking } = useSearch();
  const dest = spot.place.location;
  const [route, setRoute] = useState<LatLng[] | null>(null);
  const routedFrom = useRef<LatLng | null>(null);

  useEffect(() => {
    startTracking();
    return () => stopTracking();
  }, [startTracking, stopTracking]);

  // Fetch a walking route; refetch if the user wanders far from where it started.
  useEffect(() => {
    if (!currentLocation) return;
    const from = routedFrom.current;
    if (from && distanceMeters(from, currentLocation) < REROUTE_METERS) return;
    routedFrom.current = { latitude: currentLocation.latitude, longitude: currentLocation.longitude };
    let alive = true;
    fetch("/api/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origin: routedFrom.current, destination: dest }),
    })
      .then((r) => r.json())
      .then((d: { points?: LatLng[] }) => alive && d.points && setRoute(d.points))
      .catch(() => alive && setRoute([routedFrom.current!, dest]));
    return () => {
      alive = false;
    };
  }, [currentLocation, dest]);

  const remaining = currentLocation ? distanceMeters(currentLocation, dest) : null;
  const near = remaining !== null && remaining <= ARRIVE_METERS;

  const markers = useMemo(
    () => [
      {
        id: spot.place.placeId,
        position: dest,
        label: spot.recommendation.title,
        tone: "shifted" as const,
        index: index ?? undefined,
      },
    ],
    [spot, dest, index],
  );

  return (
    <div className="relative h-[calc(100dvh-76px-env(safe-area-inset-bottom))] overflow-hidden">
      <MapView
        origin={currentLocation}
        markers={markers}
        selectedId={spot.place.placeId}
        onSelect={() => undefined}
        route={route}
        bottomInset={210}
        className="h-full w-full"
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 p-3 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="pointer-events-auto flex items-center gap-3 rounded-3xl bg-white/95 p-3 shadow-soft">
          <button
            type="button"
            onClick={onQuit}
            aria-label="もどる"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-paper-deep"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {index !== null && (
            <span className="rainbow flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold">
              {index}
            </span>
          )}
          <p className="min-w-0 flex-1 text-base leading-snug font-bold">{spot.recommendation.title}</p>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 p-3">
        <div className="mb-2 px-1">
          <Michibi
            mood={near ? "found" : "wander"}
            size={52}
            animate={near ? "bob" : "wander"}
            says={near ? "このへんだよ。" : spot.recommendation.michibiLine}
          />
        </div>
        <div className="rounded-3xl bg-white p-4 shadow-lift">
          <p className="text-center text-2xl font-bold" aria-live="polite">
            {remaining === null
              ? "現在地を確認中…"
              : near
                ? "もうすぐそこ"
                : `あと ${remaining >= 1000 ? `${(remaining / 1000).toFixed(1)}km` : `${Math.round(remaining / 10) * 10}m`}・約${walkMinutes(remaining)}分`}
          </p>
          <button type="button" onClick={onArrive} className="btn-primary mt-3 h-14 w-full text-lg">
            着いた
          </button>
        </div>
      </div>
    </div>
  );
}
