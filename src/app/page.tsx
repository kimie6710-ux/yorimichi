"use client";

/* eslint-disable @next/next/no-img-element -- hand-drawn UI sprites */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { BirdSays, useMapBird } from "@/components/map/MapBird";
import { MapView, type MapMarker } from "@/components/map/MapView";
import { Michibi } from "@/components/Michibi";
import { SketchButton, SketchCard } from "@/components/sketch";
import { StartScreen } from "@/components/StartScreen";
import { TopBar } from "@/components/TopBar";
import { api } from "@/lib/api-client";
import { MICHIBI_LINES } from "@/lib/character";
import { useSearch } from "@/lib/store/search-context";
import { distanceMeters } from "@/lib/geo";
import { ON_SITE_METERS, SEARCH_RADIUS_METERS } from "@/lib/config";
import type { LatLng, MapSpot } from "@/lib/types";
import { Wrap } from "@/components/Wrap";
import { warmUpCutter } from "@/lib/sticker/cutter";
import { warmUpVision } from "@/lib/vision/recognize";

/** Shown once each time the app is opened (per browser session). */
const STARTED_KEY = "yorumichi:started";

/**
 * Spots in the same building or a few doors apart would stack into an unreadable
 * pile: keep the nearest one of each cluster (~45m), at most 10 on the map.
 */
/** Dragged this far from what's loaded: offer to look around there. */
const LOOK_AGAIN_METERS = 300;
/** What counts as "this area" when looking around elsewhere on the map. */
const BROWSE_METERS = SEARCH_RADIUS_METERS;

function spread(spots: MapSpot[], minMeters = 70, max = 10): MapSpot[] {
  const kept: MapSpot[] = [];
  for (const s of [...spots].sort((a, b) => a.place.distanceMeters - b.place.distanceMeters)) {
    if (kept.length >= max) break;
    if (kept.every((k) => distanceMeters(k.place.location, s.place.location) >= minMeters)) kept.push(s);
  }
  return kept;
}

/** Anything still close gets fanned out a little. */
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
  const { currentLocation, locationStatus, spotsStatus, spotsError } = town;
  // Looking around somewhere else: only what's really around there, so the map stays where you looked
  // (in a quiet area the nearest dozen can be far off, toward the station).
  const browsing = !!(town.spotsOrigin && currentLocation && distanceMeters(town.spotsOrigin, currentLocation) > LOOK_AGAIN_METERS);
  const spots = useMemo(
    () => spread(browsing && town.spotsOrigin ? town.spots.filter((s) => distanceMeters(s.place.location, town.spotsOrigin!) <= BROWSE_METERS) : town.spots),
    [town.spots, town.spotsOrigin, browsing],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Unknown until browser storage is read: draw nothing yet (no flash of the map before the cover).
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const rail = useRef<HTMLUListElement>(null);
  // Looking around another part of the map (you stay where you are).
  const [moved, setMoved] = useState<LatLng | null>(null);
  const [home, setHome] = useState(0);
  const looking = browsing;
  const canLook = !!(moved && town.spotsOrigin && distanceMeters(moved, town.spotsOrigin) > LOOK_AGAIN_METERS);
  const goHome = () => {
    setMoved(null);
    setHome((n) => n + 1);
    town.refreshSpots();
  };

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from browser storage
      setOnboarded(sessionStorage.getItem(STARTED_KEY) === "1");
    } catch {
      setOnboarded(true); // storage blocked: skip the cover
    }
  }, []);

  const selected = spots.find((s) => s.place.placeId === selectedId) ?? spots[0] ?? null;
  const bird = useMapBird(spots, spots.length ? selected : null, currentLocation);

  const markers = useMemo<MapMarker[]>(
    () =>
      declutter(spots).map(({ spot: s, position }) => ({
        id: s.place.placeId,
        position,
        label: s.copy?.copy ?? "",
        tone: "spot",
        placed: s.placedCount,
        visited: s.visited,
        thumb: s.mineUrl ?? null,
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

  if (onboarded === null) return <main className="h-[calc(100dvh-76px)] bg-paper" />;
  if (!onboarded) {
    return (
      <StartScreen
        onStart={() => {
          // Start fetching the on-device models now, so the first sticker is cut properly.
          warmUpCutter();
          warmUpVision();
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
          bubbles={false}
          onMoved={setMoved}
          fitMarkersOnly={looking}
          home={home}
          mascotAt={bird.pos}
          mascot={bird.node}
          className="yorumichi-map h-full w-full"
        />
      ) : (
        <div className="paper-grid h-full w-full" />
      )}


      <div className="pointer-events-none absolute inset-x-0 top-0 p-3 pt-[max(12px,env(safe-area-inset-top))]">
        <div className="flex items-start justify-between gap-2">
          <BirdSays says={bird.says} />
          <TopBar className="pointer-events-auto ml-auto" />
        </div>
        {/* Looking around elsewhere on the map */}
        <div className="mt-2 flex flex-col items-center gap-2">
          {canLook && (
            <button
              type="button"
              onClick={() => {
                if (moved) town.browseAt(moved);
                setMoved(null);
              }}
              className="pointer-events-auto rounded-full bg-butter px-5 py-2 text-[16px] font-bold shadow-[0_4px_12px_-4px_rgb(60_50_30/0.5)] active:translate-y-0.5"
            >
              このあたりを見る
            </button>
          )}
          {looking && (
            <button
              type="button"
              onClick={goHome}
              className="pointer-events-auto rounded-full bg-card px-4 py-1.5 text-[14px] shadow-[0_3px_10px_-5px_rgb(60_50_30/0.5)] active:translate-y-0.5"
            >
              いまいる所にもどる
            </button>
          )}
        </div>
      </div>

      {/* States without spots */}
      {(noLocation || locationStatus === "locating" || locationStatus === "outside" || (spots.length === 0 && spotsStatus !== "idle")) && (
        <div className="absolute inset-x-0 bottom-0 p-3">
          <SketchCard tone="paper" pad="lg" seed="home-state" className="flex flex-col items-center text-center">
            {noLocation ? (
              <>
                <Michibi mood="surprise" size={72} animate="none" />
                <p className="mt-2 text-base font-bold">現在地を使うと、街のよりみちが見える。</p>
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
              <Michibi mood="perch" size={72} animate="none" says={looking ? MICHIBI_LINES.sparse : (spotsError ?? MICHIBI_LINES.empty)} />
            ) : (
              <Michibi mood="walk" size={72} animate="wander" says={MICHIBI_LINES.loading[0]} />
            )}
          </SketchCard>
        </div>
      )}

      {/* Copies on the map, as paper cards */}
      {spots.length > 0 && (
        <div className="absolute inset-x-0 bottom-0 pb-3">
          {/* What the colours mean: right on top of the cards, however tall they get */}
          <div className="pointer-events-none ml-3 inline-flex items-center gap-2.5 rounded-full bg-card/90 px-3 py-1 text-[14px] text-ink-soft shadow-[0_2px_6px_-3px_rgb(60_50_30/0.4)]">
            {/* Same shapes as on the map, all the same size */}
            <span className="flex items-center gap-1">
              <span className="relative flex h-5 w-5 items-center justify-center" aria-hidden>
                <img src="/ui/badge-yellow.png" alt="" className="absolute inset-0 h-full w-full" />
                <span className="relative font-hand text-[14px] leading-none font-bold">?</span>
              </span>
              まだ
            </span>
            <span className="flex items-center gap-1">
              <span className="relative flex h-5 w-5 items-center justify-center" aria-hidden>
                <img src="/ui/badge-blue.png" alt="" className="absolute inset-0 h-full w-full" />
                <svg className="relative h-2.5 w-2.5" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12.5l4.2 4.3L19 7" stroke="var(--color-ink)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              行った
            </span>
            <span className="flex items-center gap-1">
              <span className="flex h-5 w-5 items-center justify-center" aria-hidden>
                <span className="h-3 w-3 rotate-12 rounded-[3px] bg-sky-deep shadow-[0_0_0_1.5px_#fffefb,0_1px_2px_1px_rgb(34_32_28/0.35)]" />
              </span>
              誰かの発見
            </span>
          </div>
          {spotsStatus === "seeding" && (
            <div className="mb-1 px-4">
              <Michibi mood="walk" size={44} animate="wander" says={MICHIBI_LINES.loading[1]} />
            </div>
          )}
          {/* Every card as tall as the tallest one (one- or two-line copies), buttons on one line. */}
          <ul ref={rail} className="hide-scrollbar flex snap-x snap-mandatory items-stretch gap-4 overflow-x-auto px-[9%] pt-4 pb-1" aria-label="近くのスポット">
            {spots.map((s) => (
              <li key={s.place.placeId} data-id={s.place.placeId} className="w-[84%] shrink-0 snap-center">
                <SpotCard spot={s} active={selected?.place.placeId === s.place.placeId} onFocus={() => select(s.place.placeId, false)} onGo={() => {
                    // Already there: straight to the spot (and its camera). Otherwise, walk there.
                    const here = currentLocation && distanceMeters(currentLocation, s.place.location) <= ON_SITE_METERS;
                    router.push(here ? `/spot/${encodeURIComponent(s.place.placeId)}` : `/visit/${encodeURIComponent(s.place.placeId)}`);
                  }}
                  onSave={() => {
                    const next = !s.saved;
                    town.patchSpot(s.place.placeId, { saved: next });
                    void api.save(s.place.placeId, next).catch(() => town.patchSpot(s.place.placeId, { saved: !next }));
                  }}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}

function SpotCard({
  spot,
  active,
  onFocus,
  onGo,
  onSave,
}: {
  spot: MapSpot;
  active: boolean;
  onFocus: () => void;
  onGo: () => void;
  onSave: () => void;
}) {
  return (
    <SketchCard tone={active ? "white" : "paper"} pad="md" seed={`card-${spot.place.placeId}`} onClick={onFocus} className="flex h-full flex-col">
      <div className="flex items-start justify-between">
        <span className="text-[14px] text-ink-mute">{spot.visited ? "行った" : "まだ"}</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSave();
          }}
          aria-pressed={spot.saved}
          aria-label={spot.saved ? "気になるから外す" : "気になる"}
          className={`-mt-1 -mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform active:translate-y-0.5 ${spot.saved ? "bg-butter" : "bg-card"}`}
        >
          <img src="/ui/i-star.png" alt="" className={`h-5 w-auto ${spot.saved ? "" : "opacity-50"}`} draggable={false} />
        </button>
      </div>
      <Link href={`/spot/${encodeURIComponent(spot.place.placeId)}`} className="mt-0.5 block text-[22px] leading-snug whitespace-pre-line">
        <Wrap>{spot.copy?.copy}</Wrap>
      </Link>
      <div className="mt-auto flex items-center justify-between gap-2 pt-2">
        <p className="flex items-center gap-1.5 text-sm whitespace-nowrap text-ink-mute">
          徒歩{spot.place.walkMinutes}分
          {/* Same mark as on the map: someone left something here */}
          {spot.placedCount > 0 && (
            <span className="h-3 w-3 rotate-12 rounded-[3px] bg-sky-deep shadow-[0_0_0_1.5px_#fffefb,0_1px_2px_1px_rgb(34_32_28/0.35)]" role="img" aria-label="誰かの発見あり" />
          )}
        </p>
        <SketchButton size="sm" onClick={onGo} className="shrink-0">
          行ってみる
          <img src="/ui/i-back.png" alt="" className="h-3.5 w-auto -scale-x-100" />
        </SketchButton>
      </div>
    </SketchCard>
  );
}
