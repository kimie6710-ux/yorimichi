"use client";

import type { RecommendedSpot } from "@/lib/types";

interface SpotCardProps {
  spot: RecommendedSpot;
  index: number;
  selected: boolean;
  onFocus: () => void;
  onGo: () => void;
}

/**
 * Before the visit, only the number, the copy and the walking time are shown.
 * Name, photo and category stay hidden until the user arrives.
 */
export function SpotCard({ spot, index, selected, onFocus, onGo }: SpotCardProps) {
  const { place, recommendation: rec } = spot;

  return (
    <article
      onClick={onFocus}
      className={`flex h-full flex-col rounded-3xl bg-white p-4 transition-shadow ${
        selected ? "shadow-lift" : "shadow-soft"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="rainbow flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-bold text-ink">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-lg leading-snug font-bold">{rec.title}</p>
          <p className="mt-1 text-sm text-ink-soft">徒歩{place.walkMinutes}分</p>
        </div>
      </div>

      <button type="button" onClick={onGo} className="btn-primary mt-4 h-12 w-full text-base">
        ここに行く
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M5 12h13m-5-6 6 6-6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </article>
  );
}
