"use client";

/* eslint-disable @next/next/no-img-element -- hand-drawn UI sprites */
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { BackButton } from "@/components/BackButton";
import { Michibi } from "@/components/Michibi";
import { SketchButton, SketchCard } from "@/components/sketch";
import { MessageView } from "@/components/StateViews";
import { FindsRow } from "@/components/FindsRow";
import { SpotReveal } from "@/components/SpotReveal";
import { api, ApiClientError } from "@/lib/api-client";
import { MICHIBI_LINES } from "@/lib/character";
import { bearingDegrees, compassWord, distanceMeters } from "@/lib/geo";
import { useSearch } from "@/lib/store/search-context";
import type { SpotDetail } from "@/lib/types";
import { Wrap } from "@/components/Wrap";
import { handPhoto } from "@/lib/pending-photo";
import { cameraBack, cameraOpening, checkCameraReload, diag } from "@/lib/diag";

export default function SpotPage() {
  const { id: raw } = useParams<{ id: string }>();
  const id = decodeURIComponent(raw);
  const router = useRouter();
  const { currentLocation, patchSpot } = useSearch();
  const [detail, setDetail] = useState<SpotDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Location changes every few meters: load once, and again when it first becomes known
  // (opened directly / reloaded, the position arrives a moment after the page).
  const hasLocation = !!currentLocation;
  const loadId = useRef(0);
  const load = useCallback(() => {
    // Only the newest answer counts (the one without a position may come back last).
    const n = ++loadId.current;
    api
      .spot(id, currentLocation)
      .then((d) => n === loadId.current && setDetail(d))
      .catch((e) => n === loadId.current && setError(e instanceof ApiClientError ? e.message : "読み込めなかった。"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, hasLocation]);
  useEffect(load, [load]);
  useEffect(() => checkCameraReload("spot"), []);

  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const onSiteNow = !!detail?.onSite;
  const visitedNow = !!detail?.spot.visited;

  // Being here counts as a visit. (The on-device models load only once a photo is taken:
  // loading them earlier freezes the phone's screen and can make Safari drop the page when the camera opens.)
  useEffect(() => {
    if (!onSiteNow || visitedNow) return;
    patchSpot(id, { visited: true });
    // Not recorded after all (e.g. only "here" from an earlier visit): put the map back.
    api.visit(id, currentLocation).catch(() => patchSpot(id, { visited: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once on arrival, not per GPS tick
  }, [onSiteNow, visitedNow, id]);

  function onPhoto(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = ""; // picking the same photo again still counts
    cameraBack();
    diag(`spot photo back: ${file ? `${file.type} ${Math.round(file.size / 1024)}KB` : "none"}`);
    if (!file) return;
    handPhoto(file);
    router.push(`/visit/${encodeURIComponent(id)}?step=explore`);
  }


  if (error) {
    return (
      <main className="h-[calc(100dvh-76px)]">
        <MessageView mood="sleepy" says={error} action={{ label: "地図へ", href: "/" }} />
      </main>
    );
  }
  if (!detail) {
    return (
      <main className="paper flex h-[calc(100dvh-76px)] items-center justify-center">
        <Michibi mood="walk" size={72} animate="wander" />
      </main>
    );
  }

  const { spot, onSite, placed, mine } = detail;
  const known = spot.visited || onSite;
  const others = placed.filter((p) => !p.mine);

  async function toggleSave() {
    const next = !detail!.spot.saved;
    setDetail((d) => (d ? { ...d, spot: { ...d.spot, saved: next } } : d));
    patchSpot(id, { saved: next });
    await api.save(id, next).catch(() => {
      // Didn't stick: put the star back the way it was.
      setDetail((d) => (d ? { ...d, spot: { ...d.spot, saved: !next } } : d));
      patchSpot(id, { saved: !next });
    });
  }

  const here = currentLocation ? { latitude: currentLocation.latitude, longitude: currentLocation.longitude } : null;
  const away = here ? distanceMeters(here, spot.place.location) : null;
  const bearing = here ? bearingDegrees(here, spot.place.location) : 0;
  // What you can see here: others' finds (once you're here) and your own.
  // Sent ones left your hands: they're not "found here" any more.
  const finds = [...(onSite ? others : []), ...mine.filter((m) => m.status !== "sent").map((m) => ({ id: m.id, imageUrl: m.imageUrl, label: m.label, rotation: m.rotation, memo: m.memo, mine: true }))];

  // One screen: the line on top, what's been found in the middle, the way to go at the bottom.
  return (
    <main className="paper flex h-[calc(100dvh-76px-env(safe-area-inset-bottom))] flex-col overflow-hidden px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3">
      <header className="flex shrink-0 items-center justify-between">
        <BackButton />
        <SketchButton variant={spot.saved ? "primary" : "plain"} size="sm" onClick={() => void toggleSave()} aria-pressed={spot.saved}>
          <img src="/ui/i-star.png" alt="" className="h-4 w-auto" />
          気になる
        </SketchButton>
      </header>

      <SketchCard tone="butter" pad="lg" seed={`copy-${id}`} className="mt-3 shrink-0">
        <p className="font-hand text-[28px] leading-snug whitespace-pre-line"><Wrap>{spot.copy?.copy ?? "なんか気になる。"}</Wrap></p>
        {away !== null && !known && (
          <p className="mt-2 flex items-center gap-1.5 text-[16px] text-ink-soft">
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden style={{ transform: `rotate(${bearing}deg)` }}>
              <path d="M12 3l6 16-6-4-6 4z" fill="var(--color-sky-deep)" />
            </svg>
            徒歩{spot.place.walkMinutes}分・{compassWord(bearing)}へ{away >= 1000 ? `${(away / 1000).toFixed(1)}km` : `${Math.round(away / 10) * 10}m`}
          </p>
        )}
      </SketchCard>
      {spot.copy?.birdLine && <Michibi mood="side" size={48} says={spot.copy.birdLine} className="mt-2 shrink-0" animate="none" />}

      <section className="mt-3 flex min-h-0 flex-1 flex-col">
        {known && (
          <div className="mb-3 shrink-0">
            <SpotReveal place={spot.place} compact />
          </div>
        )}
        {finds.length > 0 ? (
          <>
            <p className="shrink-0 text-[16px]">{others.length > 0 && onSite ? MICHIBI_LINES.somebodyWasHere : "あなたは、ここでこれを見つけた。"}</p>
            <div className="flex min-h-0 flex-1 items-center">
              <FindsRow items={finds} className="w-full" />
            </div>
          </>
        ) : !onSite && spot.placedCount > 0 ? (
          <div className="mt-2 flex min-h-0 flex-1 flex-col justify-center">
            <div className="flex gap-3" aria-hidden>
              {Array.from({ length: Math.min(4, spot.placedCount) }, (_, i) => (
                <span key={i} className="h-16 w-16 rounded-[44%_52%_47%_55%] bg-ink/15 blur-[6px]" style={{ transform: `rotate(${i * 17 - 10}deg)` }} />
              ))}
            </div>
            <p className="mt-3 text-[16px] text-ink-soft">誰かが、何か置いていった。着いたら見られる。</p>
          </div>
        ) : (
          <p className="mt-2 text-[16px] text-ink-soft">{spot.foundCount > 0 ? `これまでに${spot.foundCount}枚のシールが生まれてる。` : "まだ誰も、なにも見つけてない。"}</p>
        )}
      </section>

      <div className="shrink-0 pt-2">
        {onSite ? (
          <>
            <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onPhoto(e.currentTarget)} />
            <input ref={libraryRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic" className="sr-only" onChange={(e) => onPhoto(e.currentTarget)} />
            <p className="mb-2 text-center text-[18px]">{others.length > 0 ? "あなたは、何を見つける？" : "気になったもの、ある？"}</p>
            <SketchButton size="lg" block onClick={() => (cameraOpening("spot camera"), cameraRef.current?.click())}>
              ここで撮る
            </SketchButton>
            <div className="mt-1 flex justify-center">
              <SketchButton variant="plain" size="sm" onClick={() => (cameraOpening("spot album"), libraryRef.current?.click())}>
                アルバムから選ぶ
              </SketchButton>
            </div>
          </>
        ) : (
          <SketchButton size="lg" block onClick={() => router.push(`/visit/${encodeURIComponent(id)}`)}>
            行ってみる
          </SketchButton>
        )}
      </div>
    </main>
  );
}
