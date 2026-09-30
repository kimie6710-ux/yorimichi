"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { distanceMeters, walkMinutes } from "@/lib/geo";
import { useSearch } from "@/lib/store/search-context";
import { MICHIBI_LINES } from "@/lib/character";
import type { LatLng, MapSpot } from "@/lib/types";
import { MapView } from "./map/MapView";
import { Michibi } from "./Michibi";
import { SketchButton, SketchCard, SketchIconButton } from "./sketch";

const ARRIVE_METERS = 40;
const REROUTE_METERS = 150;

/**
 * In-app walking guide. Shows only the copy — the real place stays a surprise
 * until arrival. Follows the device position live.
 */
export function GuideView({ spot, onArrive, onQuit }: { spot: MapSpot; onArrive: () => void; onQuit: () => void }) {
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

  const copy = spot.copy?.copy ?? "ここ、なんか気になる。";
  const markers = useMemo(
    () => [{ id: spot.place.placeId, position: dest, label: copy, tone: "spot" as const, placed: spot.placedCount }],
    [spot, dest, copy],
  );

  return (
    <div className="relative h-[calc(100dvh-76px-env(safe-area-inset-bottom))] overflow-hidden">
      <MapView
        origin={currentLocation}
        markers={markers}
        selectedId={spot.place.placeId}
        onSelect={() => undefined}
        route={route}
        bubbles={false}
        bottomInset={210}
        className="h-full w-full"
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 p-3 pt-[max(12px,env(safe-area-inset-top))]">
        <SketchCard tone="white" pad="sm" seed={`guide-${spot.place.placeId}`} className="pointer-events-auto flex items-center gap-3">
          <SketchIconButton label="もどる" onClick={onQuit}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M15 5.2c-2.4 2.3-4.6 4.4-7 6.9 2.3 2.2 4.6 4.5 6.9 6.8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </SketchIconButton>
          <p className="min-w-0 flex-1 font-hand text-[17px] leading-snug">{copy}</p>
        </SketchCard>
      </div>

      <div className="absolute inset-x-0 bottom-0 p-3">
        <div className="mb-1 px-1">
          <Michibi
            mood={near ? "flap" : "walk"}
            size={52}
            animate={near ? "bob" : "wander"}
            says={near ? MICHIBI_LINES.arrived : (spot.copy?.birdLine || undefined)}
          />
        </div>
        <SketchCard tone="paper" pad="md" seed={`guide-panel-${spot.place.placeId}`}>
          <p className="text-center text-2xl font-bold" aria-live="polite">
            {remaining === null
              ? "現在地を確認中…"
              : near
                ? "もうすぐそこ"
                : `あと ${remaining >= 1000 ? `${(remaining / 1000).toFixed(1)}km` : `${Math.round(remaining / 10) * 10}m`}・約${walkMinutes(remaining)}分`}
          </p>
          <SketchButton onClick={onArrive} size="lg" block className="mt-3">
            着いた
          </SketchButton>
        </SketchCard>
      </div>
    </div>
  );
}
