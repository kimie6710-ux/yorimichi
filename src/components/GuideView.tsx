"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { MICHIBI_LINES } from "@/lib/character";
import { distanceMeters, walkMinutes } from "@/lib/geo";
import { useSearch } from "@/lib/store/search-context";
import type { LatLng, MapSpot } from "@/lib/types";
import { MapView } from "./map/MapView";
import { Michibi } from "./Michibi";
import { SketchButton, SketchCard, SketchIconButton } from "./sketch";

const ARRIVE_METERS = 40;
/** Off the path by this much → ask for a new route. */
const OFF_ROUTE_METERS = 45;
/** Close enough to a corner to count it as passed. */
const PASSED_METERS = 14;

interface Step {
  maneuver: string;
  instruction: string;
  distanceMeters: number;
  start: LatLng;
  end: LatLng;
}

/** Google maneuver → a short spoken direction + arrow angle (0 = up, 90 = right). */
function direction(m: string): { word: string; angle: number } {
  if (m.includes("UTURN")) return { word: "Uターン", angle: 180 };
  if (m.includes("SHARP_LEFT")) return { word: "大きく左へ", angle: -135 };
  if (m.includes("SHARP_RIGHT")) return { word: "大きく右へ", angle: 135 };
  if (m.includes("SLIGHT_LEFT")) return { word: "ななめ左へ", angle: -45 };
  if (m.includes("SLIGHT_RIGHT")) return { word: "ななめ右へ", angle: 45 };
  if (m.includes("LEFT")) return { word: "左へ", angle: -90 };
  if (m.includes("RIGHT")) return { word: "右へ", angle: 90 };
  return { word: "まっすぐ", angle: 0 };
}

const meters = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.max(10, Math.round(m / 10) * 10)}m`);

function Arrow({ angle }: { angle: number }) {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden style={{ transform: `rotate(${angle}deg)` }}>
      <path d="M22.4 38.5c-.3-9.4 0-18.3-.2-27.4" stroke="var(--color-ink)" strokeWidth="3.4" strokeLinecap="round" fill="none" />
      <path d="M12.6 19.4c3.4-3.6 6.4-7 9.7-10.6 3.1 3.4 6.4 6.9 9.4 10.3" stroke="var(--color-ink)" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

/**
 * In-app walking guide: the route on the map, the next corner ("40m先 右へ"),
 * and the map following you. The real place stays a surprise until arrival.
 */
export function GuideView({ spot, onArrive, onQuit }: { spot: MapSpot; onArrive: () => void; onQuit: () => void }) {
  const { currentLocation, startTracking, stopTracking } = useSearch();
  const dest = spot.place.location;
  const [route, setRoute] = useState<LatLng[] | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [stepIdx, setStepIdx] = useState(0);
  const routedFrom = useRef<LatLng | null>(null);
  const [needRoute, setNeedRoute] = useState(0);

  useEffect(() => {
    startTracking();
    return () => stopTracking();
  }, [startTracking, stopTracking]);

  // Fetch a walking route from where you are (again if you leave the path).
  // Not cancelled by position updates — only a newer request replaces it.
  const requestId = useRef(0);
  useEffect(() => {
    if (!currentLocation || routedFrom.current) return;
    const from = { latitude: currentLocation.latitude, longitude: currentLocation.longitude };
    routedFrom.current = from;
    const id = ++requestId.current;
    fetch("/api/route", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ origin: from, destination: dest }),
    })
      .then((r) => r.json())
      .then((d: { points?: LatLng[]; steps?: Step[] }) => {
        if (id !== requestId.current) return;
        setRoute(d.points ?? [from, dest]);
        setSteps(d.steps ?? []);
        setStepIdx(0);
      })
      .catch(() => id === requestId.current && setRoute([from, dest]));
  }, [currentLocation, dest, needRoute]);

  // Follow along: pass corners, and re-route when you've left the path.
  useEffect(() => {
    if (!currentLocation || !route) return;
    const off = Math.min(...route.map((p) => distanceMeters(p, currentLocation)));
    if (off > OFF_ROUTE_METERS && routedFrom.current && distanceMeters(routedFrom.current, currentLocation) > OFF_ROUTE_METERS) {
      routedFrom.current = null;
      setNeedRoute((n) => n + 1);
      return;
    }
    let i = stepIdx;
    while (i < steps.length - 1 && distanceMeters(currentLocation, steps[i].end) < PASSED_METERS) i++;
    if (i !== stepIdx) setStepIdx(i);
  }, [currentLocation, route, steps, stepIdx]);

  const remaining = currentLocation ? distanceMeters(currentLocation, dest) : null;
  const near = remaining !== null && remaining <= ARRIVE_METERS;

  // The next thing to do: the corner at the end of the current step.
  const current = steps[stepIdx];
  const next = steps[stepIdx + 1];
  const toCorner = current && currentLocation ? distanceMeters(currentLocation, current.end) : null;
  const dir = next ? direction(next.maneuver) : null;

  const copy = spot.copy?.copy ?? "なんか気になる。";
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
        follow={!!currentLocation}
        bottomInset={210}
        className="yorumichi-map h-full w-full"
      />

      {/* Next corner */}
      <div className="pointer-events-none absolute inset-x-0 top-0 p-3 pt-[max(12px,env(safe-area-inset-top))]">
        <SketchCard tone="white" pad="sm" seed={`guide-${spot.place.placeId}`} className="pointer-events-auto flex items-center gap-3">
          <SketchIconButton label="もどる" onClick={onQuit}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M15 5.2c-2.4 2.3-4.6 4.4-7 6.9 2.3 2.2 4.6 4.5 6.9 6.8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </SketchIconButton>
          {near ? (
            <p className="min-w-0 flex-1 text-[20px] leading-snug">このへん。</p>
          ) : dir && toCorner !== null ? (
            <div className="flex min-w-0 flex-1 items-center gap-2" aria-live="polite">
              <Arrow angle={dir.angle} />
              <div className="min-w-0">
                <p className="text-[22px] leading-tight">
                  {meters(toCorner)}先 {dir.word}
                </p>
                {next.instruction && !/^(右折|左折|直進)する$/.test(next.instruction) && (
                  <p className="truncate text-[13px] text-ink-mute">{next.instruction}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Arrow angle={0} />
              <p className="text-[20px] leading-snug">{remaining !== null ? `${meters(remaining)} まっすぐ` : "現在地を確認中…"}</p>
            </div>
          )}
        </SketchCard>
      </div>

      <div className="absolute inset-x-0 bottom-0 p-3">
        <div className="mb-1 px-1">
          <Michibi mood={near ? "flap" : "walk"} size={48} animate={near ? "bob" : "wander"} says={near ? MICHIBI_LINES.arrived : undefined} />
        </div>
        <SketchCard tone="paper" pad="md" seed={`guide-panel-${spot.place.placeId}`}>
          <p className="line-clamp-1 text-center text-[15px] text-ink-soft">{copy}</p>
          <p className="mt-1 text-center text-2xl" aria-live="polite">
            {remaining === null ? "現在地を確認中…" : near ? "もうすぐそこ" : `あと ${meters(remaining)}・約${walkMinutes(remaining)}分`}
          </p>
          <SketchButton onClick={onArrive} size="lg" block className="mt-3">
            着いた
          </SketchButton>
        </SketchCard>
      </div>
    </div>
  );
}
