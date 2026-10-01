"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { MICHIBI_LINES, michibiSrc } from "@/lib/character";
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

function Arrow({ angle, size = 44, color = "var(--color-ink)" }: { angle: number; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" aria-hidden style={{ transform: `rotate(${angle}deg)` }}>
      <path d="M22.4 38.5c-.3-9.4 0-18.3-.2-27.4" stroke={color} strokeWidth="3.8" strokeLinecap="round" fill="none" />
      <path d="M12.6 19.4c3.4-3.6 6.4-7 9.7-10.6 3.1 3.4 6.4 6.9 9.4 10.3" stroke={color} strokeWidth="3.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

/** Where you are on the walk: みちび, walking along. */
function WalkingBird() {
  return (
    <span className="relative block h-12 w-12">
      <span className="absolute inset-1 animate-ping rounded-full bg-sky-deep/25" aria-hidden />
      <img src={michibiSrc("walk", "sm")} alt="いまここ" className="bird-waddle relative h-12 w-12 drop-shadow-[0_2px_2px_rgb(34_32_28/0.25)]" draggable={false} />
    </span>
  );
}

const clock = (minutes: number) => {
  const d = new Date(Date.now() + minutes * 60_000);
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
};

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
  const after = steps[stepIdx + 2];
  const thenDir = after ? direction(after.maneuver) : null;
  const [panned, setPanned] = useState(false);
  const [recenter, setRecenter] = useState(0);

  const copy = spot.copy?.copy ?? "なんか気になる。";
  const markers = useMemo(
    () => [{ id: spot.place.placeId, position: dest, label: copy, tone: "spot" as const, placed: spot.placedCount }],
    [spot, dest, copy],
  );

  const mins = remaining !== null ? walkMinutes(remaining) : null;
  // Join the walked line to where you are and to the door (the road path stops at the kerb).
  const path = useMemo(() => {
    if (!route) return null;
    const from = currentLocation ? [{ latitude: currentLocation.latitude, longitude: currentLocation.longitude }] : [];
    return [...from, ...route, dest];
  }, [route, currentLocation, dest]);
  const hint = next?.instruction && !/^(右折|左折|直進)する$/.test(next.instruction) ? next.instruction : null;

  return (
    <div className="relative h-[calc(100dvh-76px-env(safe-area-inset-bottom))] overflow-hidden">
      <MapView
        origin={currentLocation}
        markers={markers}
        selectedId={spot.place.placeId}
        onSelect={() => undefined}
        route={path}
        bubbles={false}
        follow={!!currentLocation}
        recenter={recenter}
        onPanAway={() => setPanned(true)}
        originMarker={<WalkingBird />}
        bottomInset={170}
        className="yorumichi-map h-full w-full"
      />

      {/* What to do next, like a map app's walking guide */}
      <div className="pointer-events-none absolute inset-x-0 top-0 p-3 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="pointer-events-auto flex items-center gap-3 rounded-[18px_22px_16px_24px] bg-card p-2.5 pr-4 shadow-[0_6px_18px_-8px_rgb(60_50_30/0.45)]" aria-live="polite">
          <SketchIconButton label="やめる" onClick={onQuit}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M15 5.2c-2.4 2.3-4.6 4.4-7 6.9 2.3 2.2 4.6 4.5 6.9 6.8" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </SketchIconButton>
          <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px_16px_13px_17px] ${near ? "bg-butter" : "bg-sky-deep"}`}>
            {near ? (
              <img src={michibiSrc("flap", "sm")} alt="" className="h-11 w-11" draggable={false} />
            ) : (
              <Arrow angle={dir?.angle ?? 0} size={40} color="#fffefb" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            {near ? (
              <>
                <p className="text-[26px] leading-tight font-bold">このへん</p>
                <p className="truncate text-[15px] text-ink-soft">まわりを見てみて</p>
              </>
            ) : remaining === null ? (
              <p className="text-[18px]">現在地を確認中…</p>
            ) : dir && toCorner !== null ? (
              <>
                <p className="text-[28px] leading-none font-bold tabular-nums">{meters(toCorner)}</p>
                <p className="mt-1 truncate text-[16px] text-ink-soft">
                  {dir.word}
                  {hint && <span className="text-ink-mute">・{hint}</span>}
                </p>
              </>
            ) : (
              <>
                <p className="text-[28px] leading-none font-bold tabular-nums">{meters(remaining)}</p>
                <p className="mt-1 text-[16px] text-ink-soft">まっすぐ</p>
              </>
            )}
          </div>
        </div>
        {!near && thenDir && (
          <div className="mt-1.5 ml-[60px] inline-flex items-center gap-1 rounded-[10px_12px_9px_11px] bg-sky-deep px-2.5 py-1 text-[14px] text-white shadow-[0_3px_8px_-4px_rgb(60_50_30/0.5)]">
            つぎ
            <Arrow angle={thenDir.angle} size={18} color="#fffefb" />
            {thenDir.word}
          </div>
        )}
      </div>

      {panned && (
        <button
          type="button"
          onClick={() => {
            setPanned(false);
            setRecenter((n) => n + 1);
          }}
          aria-label="現在地にもどる"
          className="absolute right-3 bottom-[156px] flex h-12 w-12 items-center justify-center rounded-full bg-card shadow-[0_4px_12px_-4px_rgb(60_50_30/0.5)] active:translate-y-0.5"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="4.2" fill="var(--color-sky-deep)" />
            <circle cx="12" cy="12" r="8" stroke="var(--color-ink)" strokeWidth="2" />
            <path d="M12 1.5v3M12 19.5v3M1.5 12h3M19.5 12h3" stroke="var(--color-ink)" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      )}

      {/* How far, when you'll get there, and the two things you can do */}
      <div className="absolute inset-x-0 bottom-0 p-3">
        <div className="flex items-center gap-3 rounded-[20px_24px_18px_26px] bg-card p-3 pl-4 shadow-[0_-4px_18px_-8px_rgb(60_50_30/0.4)]">
          <div className="min-w-0 flex-1">
            <p className="text-[24px] leading-tight font-bold tabular-nums" aria-live="polite">
              {remaining === null ? "…" : near ? "到着" : `約${mins}分`}
            </p>
            <p className="truncate text-[14px] text-ink-mute tabular-nums">
              {remaining !== null && !near ? `あと${meters(remaining)}・${clock(mins ?? 0)}着` : copy}
            </p>
          </div>
          <SketchButton variant="plain" size="sm" onClick={onQuit} className="shrink-0">
            やめる
          </SketchButton>
          <SketchButton size="md" onClick={onArrive} className="shrink-0">
            着いた
          </SketchButton>
        </div>
      </div>
    </div>
  );
}
