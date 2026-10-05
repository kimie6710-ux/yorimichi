"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Michibi } from "@/components/Michibi";
import { SketchButton } from "@/components/sketch";
import { MICHIBI_LINES } from "@/lib/character";
import { useSearch } from "@/lib/store/search-context";

/**
 * 撮る: shoot whatever you find, wherever you are. The sticker ties to the
 * nearest place (you can pick another nearby one before saving).
 */
export default function CapturePage() {
  const router = useRouter();
  const { around, spotsStatus, locationStatus, locate, acceptOutsideArea } = useSearch();
  const nearest = around[0];

  useEffect(() => {
    if (nearest) router.replace(`/visit/${encodeURIComponent(nearest.placeId)}?step=explore&free=1`);
  }, [nearest, router]);

  const outside = !nearest && locationStatus === "outside";
  const stuck =
    !nearest && (spotsStatus === "ready" || spotsStatus === "error" || locationStatus === "denied" || locationStatus === "unavailable" || locationStatus === "unsupported");

  return (
    <main className="paper flex h-[calc(100dvh-76px-env(safe-area-inset-bottom))] flex-col items-center justify-center gap-4 px-4">
      {outside ? (
        <>
          <Michibi mood="side" size={80} says={MICHIBI_LINES.outsideArea} above animate="none" />
          <SketchButton size="md" onClick={acceptOutsideArea}>
            このまま撮る
          </SketchButton>
        </>
      ) : stuck ? (
        <>
          <Michibi mood="sleepy" size={80} says="いまどこにいるか、わからなかった。" above animate="none" />
          <SketchButton size="md" onClick={locate}>
            もう一回さがす
          </SketchButton>
        </>
      ) : (
        <Michibi mood="walk" size={72} animate="wander" />
      )}
    </main>
  );
}
