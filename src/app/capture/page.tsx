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
    <main className="paper min-h-[calc(100dvh-76px)] px-4 pt-[max(20px,env(safe-area-inset-top))] pb-10">
      <Michibi mood="side" size={64} says="このへん、まだスポットじゃないみたい。" animate="none" />
      <p className="mt-4 text-base font-bold">近くのスポットで撮れます。</p>
      <ul className="mt-4 flex flex-col gap-3">
        {spots.slice(0, 4).map((s) => (
          <li key={s.place.placeId}>
            <SketchCard tone="white" pad="md" seed={`cap-${s.place.placeId}`}>
              <p className="font-bold">{s.copy?.copy}</p>
              <p className="mt-1 text-sm text-ink-soft">徒歩{s.place.walkMinutes}分</p>
              <SketchLinkButton href={`/visit/${encodeURIComponent(s.place.placeId)}`} size="sm" block className="mt-3">
                行ってみる
              </SketchLinkButton>
            </SketchCard>
          </li>
        ))}
      </ul>
    </main>
  );
}
