"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { MapView, type MapMarker } from "@/components/map/MapView";
import { Michibi } from "@/components/Michibi";
import { SketchButton, SketchCard } from "@/components/sketch";
import { TopBar } from "@/components/TopBar";
import { APP_TAGLINE } from "@/lib/config";
import { MICHIBI_LINES } from "@/lib/character";
import { useSearch } from "@/lib/store/search-context";
import type { MapSpot } from "@/lib/types";

const ONBOARDED_KEY = "yorumichi:onboarded";

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
      setOnboarded(localStorage.getItem(ONBOARDED_KEY) === "1");
    } catch {
      /* storage blocked: skip onboarding */
    }
  }, []);

  const selected = spots.find((s) => s.place.placeId === selectedId) ?? spots[0] ?? null;

  const markers = useMemo<MapMarker[]>(
    () =>
      spots.map((s, i) => ({
        id: s.place.placeId,
        position: s.place.location,
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
      <main className="paper flex min-h-[calc(100dvh-76px)] flex-col items-center justify-center px-8 text-center">
        <Michibi mood="front" size={150} animate="bob" />
        <h1 className="mt-4 font-hand text-4xl font-bold tracking-[0.1em]">よるみち</h1>
        <p className="mt-3 text-lg font-bold">{APP_TAGLINE}</p>
        <SketchButton
          size="lg"
          className="mt-10 w-full max-w-[280px]"
          onClick={() => {
            try {
              localStorage.setItem(ONBOARDED_KEY, "1");
            } catch {
              /* ignore */
            }
            setOnboarded(true);
            if (locationStatus !== "ready") town.locate();
          }}
        >
          はじめる
        </SketchButton>
      </main>
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
          bottomInset={200}
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
          <ul ref={rail} className="hide-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto px-[9%] pt-2 pb-1" aria-label="近くのスポット">
            {spots.map((s, i) => (
              <li key={s.place.placeId} data-id={s.place.placeId} className="w-[82%] shrink-0 snap-center">
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
    <SketchCard tone={active ? "white" : "paper"} pad="md" seed={`card-${spot.place.placeId}`} className="flex h-full flex-col" onClick={onFocus}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 font-hand text-lg leading-none font-bold text-ink-mute">{index}</span>
        <Link href={`/spot/${encodeURIComponent(spot.place.placeId)}`} className="min-w-0 flex-1 text-lg leading-snug font-bold">
          {spot.copy?.copy}
        </Link>
      </div>
      <p className="mt-2 flex flex-wrap gap-x-3 text-sm text-ink-soft">
        <span>徒歩{spot.place.walkMinutes}分</span>
        {spot.placedCount > 0 && <span>✦ 誰かが置いたもの {spot.placedCount}</span>}
        {spot.visited && <span>行ったことある</span>}
      </p>
      <SketchButton size="sm" block className="mt-3" onClick={onGo}>
        行ってみる
      </SketchButton>
    </SketchCard>
  );
}
