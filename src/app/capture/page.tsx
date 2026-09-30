"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Michibi } from "@/components/Michibi";
import { SketchCard, SketchLinkButton } from "@/components/sketch";
import { distanceMeters } from "@/lib/geo";
import { useSearch } from "@/lib/store/search-context";

const ON_SITE_METERS = 150;

/** ＋ : explore the spot you're standing at, or pick a nearby one to walk to. */
export default function CapturePage() {
  const router = useRouter();
  const { currentLocation, spots } = useSearch();

  const here = currentLocation
    ? spots
        .map((s) => ({ s, d: distanceMeters(currentLocation, s.place.location) }))
        .filter((x) => x.d <= ON_SITE_METERS)
        .sort((a, b) => a.d - b.d)[0]?.s
    : undefined;

  useEffect(() => {
    if (here) router.replace(`/visit/${encodeURIComponent(here.place.placeId)}?step=explore`);
  }, [here, router]);

  if (here) return <main className="paper h-[calc(100dvh-76px)]" />;

  return (
    <main className="paper flex h-[calc(100dvh-76px-env(safe-area-inset-bottom))] flex-col overflow-hidden px-4 pt-[max(16px,env(safe-area-inset-top))] pb-3">
      <div className="shrink-0">
        <Michibi mood="side" size={56} says="このへん、まだスポットじゃないみたい。" animate="none" />
        <p className="mt-3 text-[17px]">近くのスポットで撮れます。</p>
      </div>
      <ul className="mt-3 flex min-h-0 flex-1 flex-col justify-start gap-3">
        {spots.slice(0, 3).map((s) => (
          <li key={s.place.placeId}>
            <SketchCard tone="white" pad="md" seed={`cap-${s.place.placeId}`} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-[17px] leading-snug">{s.copy?.copy}</p>
                <p className="mt-1 text-sm text-ink-mute">徒歩{s.place.walkMinutes}分</p>
              </div>
              <SketchLinkButton href={`/visit/${encodeURIComponent(s.place.placeId)}`} size="sm" className="shrink-0">
                行ってみる
              </SketchLinkButton>
            </SketchCard>
          </li>
        ))}
      </ul>
    </main>
  );
}
