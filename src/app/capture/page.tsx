"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Michibi } from "@/components/Michibi";
import { SketchButton } from "@/components/sketch";
import { useSearch } from "@/lib/store/search-context";

/**
 * 撮る: shoot whatever you find, wherever you are. The sticker ties to the
 * nearest place (you can pick another nearby one before saving).
 */
export default function CapturePage() {
  const router = useRouter();
  const { around, spotsStatus, locationStatus, locate } = useSearch();
  const nearest = around[0];

  useEffect(() => {
    if (nearest) router.replace(`/visit/${encodeURIComponent(nearest.placeId)}?step=explore&free=1`);
  }, [nearest, router]);

  const stuck =
    !nearest && (spotsStatus === "ready" || spotsStatus === "error" || locationStatus === "denied" || locationStatus === "unavailable" || locationStatus === "unsupported");

  return (
    <main className="paper flex h-[calc(100dvh-76px-env(safe-area-inset-bottom))] flex-col items-center justify-center gap-4 px-4">
      {stuck ? (
        <>
          <Michibi mood="sleepy" size={80} says="いまどこにいるか、わからなかった。" className="flex-col-reverse !items-center" animate="none" />
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
