"use client";

import { useEffect, useState } from "react";

import { googlePlaceUrl } from "@/lib/geo";
import { stickersAtPlace } from "@/lib/store/sticker-repo";
import type { RecommendedSpot, StickerItem } from "@/lib/types";
import { Michibi } from "./Michibi";
import { PlaceImage } from "./PlaceImage";
import { StickerView } from "./StickerView";

/** Stickers the user already collected here, stuck on the photo's corner. */
function CollectedHere({ placeId }: { placeId: string }) {
  const [items, setItems] = useState<StickerItem[]>([]);
  useEffect(() => {
    let alive = true;
    stickersAtPlace(placeId)
      .then((list) => alive && setItems(list.slice(0, 3)))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [placeId]);
  if (items.length === 0) return null;
  return (
    <div className="pointer-events-none absolute right-3 -bottom-6 flex items-end" aria-label={`ここで採集したシール ${items.length}枚`}>
      {items.map((s, i) => (
        <div key={s.id} className="-ml-4 w-20" style={{ zIndex: 3 - i }}>
          <StickerView src={s.stickerUrl} alt="" rotation={s.rotation} />
        </div>
      ))}
    </div>
  );
}

/** 答え合わせ: the real place, revealed after arrival. */
export function PlaceSheetContent({ spot, onContinue }: { spot: RecommendedSpot; onContinue: () => void }) {
  const { place, recommendation: rec } = spot;
  // The spot's own Google Maps page (photos, hours, reviews live there, not here).
  const mapsUrl = place.googleMapsUri ?? googlePlaceUrl(place.location, place.placeId);

  return (
    <div className="pb-6">
      <div className="relative mx-4">
        <PlaceImage place={place} width={900} showAttribution className="aspect-[16/10] w-full rounded-3xl" />
        <CollectedHere placeId={place.placeId} />
      </div>

      <div className="px-5">
        {/* ── Real place info (Google) ─────────── */}
        <section aria-labelledby="real-info" className="mt-5">
          <h2 id="real-info" className="text-xl font-bold">{place.name}</h2>
          <p className="mt-0.5 text-sm text-ink-soft">
            {place.primaryTypeLabel ?? "スポット"}・徒歩{place.walkMinutes}分
            {place.openNow === true && <span className="ml-1 font-bold text-mint-deep">・営業中</span>}
            {place.openNow === false && <span className="ml-1">・営業時間外</span>}
            {place.rating != null && (
              <span className="ml-1">
                ・★{place.rating.toFixed(1)}
                {place.userRatingCount != null && `（${place.userRatingCount.toLocaleString()}）`}
              </span>
            )}
          </p>
          {place.address && <p className="mt-0.5 text-sm text-ink-mute">{place.address}</p>}
        </section>

        {/* ── みちびのひとこと (AI-written, kept visually apart) ── */}
        <section aria-label="みちびのひとこと" className="note mt-5 px-5 pt-4 pb-5">
          <h3 className="text-2xl leading-snug font-bold">「{rec.title}」</h3>
        </section>
        <div className="mt-2 flex justify-end">
          <Michibi mood="wonder" size={52} side="left" says={rec.michibiLine} animate="none" />
        </div>

        <div className="mt-6 flex flex-col items-center gap-3">
          <button type="button" onClick={onContinue} className="btn-primary h-14 w-full text-lg">
            どうだった？
          </button>
          {!place.isMock && (
            <a href={mapsUrl} target="_blank" rel="noreferrer" className="text-sm font-bold text-lavender-deep underline underline-offset-4">
              Google マップで見る
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
