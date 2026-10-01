"use client";

/* eslint-disable @next/next/no-img-element -- hand-drawn UI sprites */
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { BackButton } from "@/components/BackButton";
import { MapView } from "@/components/map/MapView";
import { Michibi } from "@/components/Michibi";
import { SketchButton, SketchCard, SketchSection } from "@/components/sketch";
import { MessageView } from "@/components/StateViews";
import { StickerGrid } from "@/components/StickerGrid";
import { SpotReveal } from "@/components/SpotReveal";
import { api, ApiClientError } from "@/lib/api-client";
import { MICHIBI_LINES } from "@/lib/character";
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

  const markers = useMemo(
    () => (detail ? [{ id, position: detail.spot.place.location, label: detail.spot.copy?.copy ?? "", tone: "spot" as const }] : []),
    [detail, id],
  );

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

  const { spot, onSite, placed, foundLabels, mine } = detail;
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

  return (
    <main className="paper min-h-[calc(100dvh-76px)] px-4 pt-[max(12px,env(safe-area-inset-top))] pb-10">
      <header className="flex items-center justify-between">
        <BackButton />
        <SketchButton variant={spot.saved ? "primary" : "plain"} size="sm" onClick={() => void toggleSave()} aria-pressed={spot.saved}>
          <img src="/ui/i-star.png" alt="" className="h-4 w-auto" />
          気になる
        </SketchButton>
      </header>

      {/* よりみちの層 */}
      <SketchCard tone="butter" pad="lg" seed={`copy-${id}`} className="mt-4">
        <p className="font-hand text-[26px] leading-snug whitespace-pre-line">{spot.copy?.copy ?? "なんか気になる。"}</p>
        {currentLocation && <p className="mt-2 text-sm text-ink-soft">徒歩{spot.place.walkMinutes}分</p>}
      </SketchCard>
      {spot.copy?.birdLine && <Michibi mood="side" size={52} says={spot.copy.birdLine} className="mt-2" animate="none" />}

      <div className="mt-4 flex flex-col gap-3">
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

      <SketchSection title="ここで見つかったもの" className="mt-6" seed={`found-${id}`}>
        {onSite ? (
          <>
            {others.length > 0 ? (
              <>
                <p className="mb-3 text-sm text-ink-soft">{MICHIBI_LINES.somebodyWasHere}</p>
                <StickerGrid items={others} caption={(sid) => <Memo text={others.find((p) => p.id === sid)?.memo} />} />
              </>
            ) : (
              <p className="text-sm text-ink-soft">まだ誰も置いていません。</p>
            )}
            {foundLabels.length > 0 && <p className="mt-4 text-sm text-ink-soft">ほかに見つかったもの：{foundLabels.join("・")}</p>}
          </>
        ) : spot.placedCount > 0 ? (
          <div>
            <p className="text-base font-bold">誰かが、ここに何かを置いています（{spot.placedCount}）</p>
            <div className="mt-3 flex gap-3" aria-hidden>
              {Array.from({ length: Math.min(4, spot.placedCount) }, (_, i) => (
                <span key={i} className="h-16 w-16 rounded-[44%_52%_47%_55%] bg-ink/15 blur-[6px]" style={{ transform: `rotate(${i * 17 - 10}deg)` }} />
              ))}
            </div>
            <p className="mt-3 text-sm text-ink-soft">着いたら見られます。</p>
          </div>
        ) : (
          <p className="text-sm text-ink-soft">{spot.foundCount > 0 ? `ここでは、これまでに${spot.foundCount}枚のシールが生まれています。` : "まだ誰も、ここで何も見つけていません。"}</p>
        )}
      </SketchSection>

      {mine.length > 0 && (
        <SketchSection title="自分がここで見つけたもの" className="mt-4" tone="white" seed={`mine-${id}`}>
          <StickerGrid items={mine} />
        </SketchSection>
      )}

      <SketchSection title="この場所" className="mt-4" tone="white" seed={`info-${id}`}>
        <div className="overflow-hidden rounded-[14px_18px_12px_20px] outline-2 outline-ink outline-solid">
          <MapView origin={currentLocation} markers={markers} selectedId={null} onSelect={() => undefined} interactive={false} bubbles={false} className="yorumichi-map h-40 w-full" />
        </div>
        <div className="mt-3">
          {known ? <SpotReveal place={spot.place} compact /> : <p className="text-sm text-ink-soft">名前と写真は、着いてから。</p>}
        </div>
      </SketchSection>
    </main>
  );
}

function Memo({ text }: { text?: string }) {
  if (!text) return null;
  return <span className="mt-0.5 line-clamp-2 font-hand text-sm text-ink-soft">「{text}」</span>;
}
