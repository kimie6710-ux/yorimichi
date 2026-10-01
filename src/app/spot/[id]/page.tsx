"use client";

/* eslint-disable @next/next/no-img-element -- hand-drawn UI sprites */
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { BackButton } from "@/components/BackButton";
import { Michibi } from "@/components/Michibi";
import { SketchButton, SketchCard } from "@/components/sketch";
import { MessageView } from "@/components/StateViews";
import { StickerView } from "@/components/StickerView";
import { SpotReveal } from "@/components/SpotReveal";
import { api, ApiClientError } from "@/lib/api-client";
import { bearingDegrees, compassWord, distanceMeters } from "@/lib/geo";
import { useSearch } from "@/lib/store/search-context";
import type { SpotDetail } from "@/lib/types";

export default function SpotPage() {
  const { id: raw } = useParams<{ id: string }>();
  const id = decodeURIComponent(raw);
  const router = useRouter();
  const { currentLocation, patchSpot } = useSearch();
  const [detail, setDetail] = useState<SpotDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .spot(id, currentLocation)
      .then(setDetail)
      .catch((e) => setError(e instanceof ApiClientError ? e.message : "読み込めませんでした"));
    // Location changes every few meters; reload only when the spot changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(load, [load]);


  if (error) {
    return (
      <main className="h-[calc(100dvh-76px)]">
        <MessageView mood="sleepy" says={error} action={{ label: "マップへ", href: "/" }} />
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
  const finds = [...(onSite ? others : []), ...mine.map((m) => ({ id: m.id, imageUrl: m.imageUrl, label: m.label, rotation: m.rotation, memo: m.memo, mine: true }))];

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
        <p className="font-hand text-[26px] leading-snug whitespace-pre-line">{spot.copy?.copy ?? "なんか気になる。"}</p>
        {away !== null && !known && (
          <p className="mt-2 flex items-center gap-1.5 text-[15px] text-ink-soft">
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
        <p className="shrink-0 text-[15px] font-bold">ここで見つかったもの</p>
        {finds.length > 0 ? (
          <ul className="hide-scrollbar -mx-4 mt-2 flex min-h-0 flex-1 items-center gap-4 overflow-x-auto px-4">
            {finds.map((f) => (
              <li key={f.id} className="w-[34%] shrink-0 text-center">
                <StickerView src={f.imageUrl} alt={f.label} rotation={f.rotation} className="mx-auto max-h-[18dvh] w-auto" />
                <p className="mt-1 truncate text-[14px]">{f.label}</p>
                <p className="truncate text-[14px] text-ink-mute">{f.mine ? "自分" : f.memo ? `「${f.memo}」` : "誰かの発見"}</p>
              </li>
            ))}
          </ul>
        ) : !onSite && spot.placedCount > 0 ? (
          <div className="mt-2 flex min-h-0 flex-1 flex-col justify-center">
            <div className="flex gap-3" aria-hidden>
              {Array.from({ length: Math.min(4, spot.placedCount) }, (_, i) => (
                <span key={i} className="h-16 w-16 rounded-[44%_52%_47%_55%] bg-ink/15 blur-[6px]" style={{ transform: `rotate(${i * 17 - 10}deg)` }} />
              ))}
            </div>
            <p className="mt-3 text-[15px] text-ink-soft">誰かが、ここに何かを置いています。着いたら見られます。</p>
          </div>
        ) : (
          <p className="mt-2 text-[15px] text-ink-soft">{spot.foundCount > 0 ? `これまでに${spot.foundCount}枚のシールが生まれています。` : "まだ誰も、ここで何も見つけていません。"}</p>
        )}
      </section>

      <div className="shrink-0 pt-3">
        {onSite ? (
          <SketchButton size="lg" block onClick={() => router.push(`/visit/${encodeURIComponent(id)}?step=explore`)}>
            ここで探す
          </SketchButton>
        ) : (
          <SketchButton size="lg" block onClick={() => router.push(`/visit/${encodeURIComponent(id)}`)}>
            行ってみる
          </SketchButton>
        )}
      </div>
    </main>
  );
}
