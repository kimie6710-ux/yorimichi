"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { useMapBird } from "@/components/map/MapBird";
import { MapView, type MapMarker } from "@/components/map/MapView";
import { Michibi } from "@/components/Michibi";
import { SketchButton, SketchCard } from "@/components/sketch";
import { StartScreen } from "@/components/StartScreen";
import { TopBar } from "@/components/TopBar";
import { MICHIBI_LINES } from "@/lib/character";
import { useSearch } from "@/lib/store/search-context";
import type { MapSpot } from "@/lib/types";

/** Shown once each time the app is opened (per browser session). */
const STARTED_KEY = "yorumichi:started";

/** Spots in the same building would sit on top of each other: fan them out a little. */
function declutter(spots: MapSpot[]) {
  const GAP = 0.00016;
  const placed: { spot: MapSpot; position: { latitude: number; longitude: number } }[] = [];
  for (const spot of spots) {
    const p = spot.place.location;
    const near = placed.filter((o) => Math.hypot(o.position.latitude - p.latitude, o.position.longitude - p.longitude) < GAP).length;
    const a = near * 2.2;
    placed.push({ spot, position: near ? { latitude: p.latitude + Math.sin(a) * GAP * 0.9, longitude: p.longitude + Math.cos(a) * GAP * 1.1 } : p });
  }
  return placed;
}

export default function MapHome() {
  const router = useRouter();
  const town = useSearch();
  const { currentLocation, locationStatus, spots, spotsStatus, spotsError } = town;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [onboarded, setOnboarded] = useState(true);
  const rail = useRef<HTMLUListElement>(null);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from browser storage
      setOnboarded(sessionStorage.getItem(STARTED_KEY) === "1");
    } catch {
      /* storage blocked: skip onboarding */
    }
  }, []);

  const selected = spots.find((s) => s.place.placeId === selectedId) ?? spots[0] ?? null;
  const bird = useMapBird(spots, spots.length ? selected : null, currentLocation);

  const markers = useMemo<MapMarker[]>(
    () =>
      declutter(spots).map(({ spot: s, position }, i) => ({
        id: s.place.placeId,
        position,
        label: s.copy?.copy ?? "",
        tone: "spot",
        index: i + 1,
        placed: s.placedCount,
        visited: s.visited,
      })),
    [spots],
  );

  function select(id: string, scroll = true) {
    setSelectedId(id);
    if (!scroll) return;
    const el = rail.current?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`);
    el?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }

  // When the user swipes the cards, follow with the map.
  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting && e.intersectionRatio > 0.7)[0];
        const id = (hit?.target as HTMLElement | undefined)?.dataset.id;
        if (id) setSelectedId(id);
      },
      { root: el, threshold: [0.7] },
    );
    el.querySelectorAll("[data-id]").forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, [spots]);

  if (!onboarded) {
    return (
      <StartScreen
        onStart={() => {
          try {
            sessionStorage.setItem(STARTED_KEY, "1");
          } catch {
            /* ignore */
          }
          setOnboarded(true);
          if (locationStatus !== "ready") town.locate();
        }}
      />
    );
  }

  const noLocation = locationStatus === "denied" || locationStatus === "unavailable" || locationStatus === "unsupported";

  return (
    <main className="relative h-[calc(100dvh-76px-env(safe-area-inset-bottom))] overflow-hidden">
      {currentLocation ? (
        <MapView
          origin={currentLocation}
          markers={markers}
          selectedId={selected?.place.placeId ?? null}
          onSelect={(id) => select(id)}
          bottomInset={170}
          mascotAt={bird.pos}
          mascot={bird.node}
          className="yorumichi-map h-full w-full"
        />
      ) : (
        <div className="paper-grid h-full w-full" />
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 p-3 pt-[max(12px,env(safe-area-inset-top))]">
        <TopBar className="pointer-events-auto" />
      </div>

      {/* States without spots */}
      {(noLocation || locationStatus === "locating" || locationStatus === "outside" || (spots.length === 0 && spotsStatus !== "idle")) && (
        <div className="absolute inset-x-0 bottom-0 p-3">
          <SketchCard tone="paper" pad="lg" seed="home-state" className="flex flex-col items-center text-center">
            {noLocation ? (
              <>
                <Michibi mood="surprise" size={72} animate="none" />
                <p className="mt-2 text-base font-bold">現在地を使うと、今いる街のよるみちが見えます。</p>
                <SketchButton className="mt-4" onClick={town.locate}>
                  現在地を使う
                </SketchButton>
              </>
            ) : locationStatus === "outside" ? (
              <>
                <Michibi mood="side" size={72} animate="none" says={MICHIBI_LINES.outsideArea} />
                <SketchButton className="mt-4" onClick={town.acceptOutsideArea}>
                  このまま見る
                </SketchButton>
              </>
            ) : spotsStatus === "error" ? (
              <>
                <Michibi mood="sleepy" size={72} animate="none" says={spotsError ?? undefined} />
                <SketchButton variant="sub" className="mt-4" onClick={town.refreshSpots}>
                  もう一回
                </SketchButton>
              </>
            ) : spotsStatus === "ready" ? (
              <Michibi mood="perch" size={72} animate="none" says={spotsError ?? MICHIBI_LINES.empty} />
            ) : (
              <Michibi mood="walk" size={72} animate="wander" says={MICHIBI_LINES.loading[0]} />
            )}
          </SketchCard>
        </div>
      )}

      {/* Copies on the map, as paper cards */}
      {spots.length > 0 && (
        <div className="absolute inset-x-0 bottom-0 pb-3">
          {spotsStatus === "seeding" && (
            <div className="mb-1 px-4">
              <Michibi mood="walk" size={44} animate="wander" says={MICHIBI_LINES.loading[1]} />
            </div>
          )}
          <ul ref={rail} className="hide-scrollbar flex snap-x snap-mandatory gap-4 overflow-x-auto px-[9%] pt-4 pb-1" aria-label="近くのスポット">
            {spots.map((s, i) => (
              <li key={s.place.placeId} data-id={s.place.placeId} className="w-[84%] shrink-0 snap-center">
                <SpotCard spot={s} index={i + 1} active={selected?.place.placeId === s.place.placeId} onFocus={() => select(s.place.placeId, false)} onGo={() => router.push(`/visit/${encodeURIComponent(s.place.placeId)}`)} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}

function SpotCard({ spot, index, active, onFocus, onGo }: { spot: MapSpot; index: number; active: boolean; onFocus: () => void; onGo: () => void }) {
  return (
    <SketchCard tone={active ? "white" : "paper"} pad="md" seed={`card-${spot.place.placeId}`} tape={active ? "auto" : undefined} onClick={onFocus}>
      <span className="text-[12px] tracking-widest text-ink-mute tabular-nums">{String(index).padStart(2, "0")}</span>
      <Link href={`/spot/${encodeURIComponent(spot.place.placeId)}`} className="mt-0.5 line-clamp-2 block text-[20px] leading-snug whitespace-pre-line">
        {spot.copy?.copy}
      </Link>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-sm text-ink-mute">
          徒歩{spot.place.walkMinutes}分{spot.placedCount > 0 ? "・誰かの発見あり" : ""}
        </p>
        <SketchButton size="sm" onClick={onGo} className="shrink-0">
          行ってみる →
        </SketchButton>
      </div>
    </SketchCard>
  );
}
