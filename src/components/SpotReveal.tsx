"use client";

import { googlePlaceUrl } from "@/lib/geo";
import type { Place } from "@/lib/types";
import { PlaceImage } from "./PlaceImage";

/** The real place (Google Places), shown once you've been there. Minimal on purpose. */
export function SpotReveal({ place, compact = false }: { place: Place; compact?: boolean }) {
  const mapsUrl = place.googleMapsUri ?? googlePlaceUrl(place.location, place.placeId);
  return (
    <div>
      {!compact && (
        <div className="relative isolate overflow-hidden rounded-[18px_22px_16px_24px] outline-2 outline-ink outline-solid">
          <PlaceImage place={place} width={800} className="aspect-[4/3] w-full" showAttribution />
        </div>
      )}
      <h2 className={`${compact ? "" : "mt-4"} text-xl font-bold`}>{place.name}</h2>
      <p className="mt-0.5 text-sm text-ink-soft">
        {[place.primaryTypeLabel, place.openNow === true ? "営業中" : place.openNow === false ? "営業時間外" : null].filter(Boolean).join("・")}
      </p>
      {place.weekdayHours.length > 0 && (
        <details className="mt-2 text-sm text-ink-soft">
          <summary className="cursor-pointer font-bold">営業時間</summary>
          <ul className="mt-1 space-y-0.5">
            {place.weekdayHours.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </details>
      )}
      {place.address && <p className="mt-1 text-sm text-ink-mute">{place.address}</p>}
      <a href={mapsUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-bold text-sky-deep underline underline-offset-4">
        Google マップで見る
      </a>
    </div>
  );
}
