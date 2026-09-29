"use client";

/* eslint-disable @next/next/no-img-element -- Places photos are redirects to googleusercontent; next/image optimisation would re-fetch them */
import { useState } from "react";
import { photoUrl } from "@/lib/api-client";
import { emojiForType } from "@/lib/place-emoji";
import type { Place } from "@/lib/types";

interface PlaceImageProps {
  place: Place;
  width?: number;
  className?: string;
  /** Show Google photo attribution (required when the photo is shown large). */
  showAttribution?: boolean;
}


export function PlaceImage({ place, width = 600, className = "", showAttribution = false }: PlaceImageProps) {
  const photo = place.photos[0];
  const [failed, setFailed] = useState(false);

  if (!photo || failed) {
    return (
      <div
        className={`flex items-center justify-center bg-paper-deep ${className}`}
        role="img"
        aria-label={place.name}
      >
        <span className="flex aspect-square h-[56%] max-h-24 items-center justify-center rounded-full bg-white text-[min(40px,9vw)] leading-none" aria-hidden>
          {emojiForType(place.primaryType)}
        </span>
      </div>
    );
  }

  const author = photo.authorAttributions[0];
  return (
    <div className={`relative overflow-hidden bg-paper-deep ${className}`}>
      <img
        src={photoUrl(photo.name, width)}
        alt={place.name}
        loading="lazy"
        className="h-full w-full object-cover"
        onError={() => setFailed(true)}
      />
      {showAttribution && author && (
        <p className="absolute right-2 bottom-2 max-w-[80%] truncate rounded-full bg-black/55 px-2.5 py-0.5 text-sm text-white">
          写真:{" "}
          {author.uri ? (
            <a href={author.uri} target="_blank" rel="noreferrer" className="underline">
              {author.displayName}
            </a>
          ) : (
            author.displayName
          )}
        </p>
      )}
    </div>
  );
}
