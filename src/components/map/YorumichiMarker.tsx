/* eslint-disable @next/next/no-img-element -- hand-drawn sticker sprites */
import type { MapMarker } from "./types";

/**
 * A real spot on the map: a small scalloped sticker.
 * Not been yet: yellow with a "?" (what it is stays a surprise).
 * Been there: blue — showing your own sticker from there, if you made one.
 * Selected: a little bigger. A tiny sticker peeks out where someone left something.
 */
export function YorumichiMarker({
  marker,
  selected,
  onClick,
  bubble = true,
}: {
  marker: MapMarker;
  selected: boolean;
  onClick: () => void;
  bubble?: boolean;
}) {
  const badge = marker.visited ? "blue" : selected ? "cream" : "yellow";
  const thumb = marker.visited ? marker.thumb : null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={marker.label}
      aria-pressed={selected}
      className={`relative flex flex-col items-center ${selected ? "z-20" : "z-10"}`}
    >
      {selected && bubble && marker.label && (
        <span className="animate-peek mb-1.5 line-clamp-2 w-max max-w-[190px] rounded-[8px_12px_9px_11px] bg-card px-2.5 py-1.5 text-left font-hand text-[14px] leading-snug whitespace-pre-line shadow-[0_1px_0_rgb(60_50_30/0.08),0_6px_12px_-6px_rgb(60_50_30/0.3)]">
          {marker.label}
        </span>
      )}
      <span className={`relative flex items-center justify-center transition-transform ${selected ? "h-12 w-12" : "h-9 w-9"}`}>
        <img src={`/ui/badge-${badge}.png`} alt="" className={`absolute inset-0 h-full w-full ${selected ? "drop-shadow-[0_3px_3px_rgb(34_32_28/0.3)]" : ""}`} draggable={false} />
        {thumb ? (
          <img src={thumb} alt="" className="relative h-[72%] w-[72%] object-contain" draggable={false} />
        ) : marker.visited ? (
          <svg className="relative h-[46%] w-[46%]" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M5 12.5l4.2 4.3L19 7" stroke="var(--color-ink)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <span className={`relative font-hand font-bold ${selected ? "text-[22px]" : "text-[16px]"}`}>?</span>
        )}
        {(marker.placed ?? 0) > 0 && (
          // Someone left something here: a tiny sticker peeking out from behind the badge.
          <span
            role="img"
            aria-label={`誰かの発見が${marker.placed}枚`}
            className="absolute -top-1 -right-1.5 h-3.5 w-3.5 rotate-12 rounded-[3px] bg-sky-deep shadow-[0_0_0_2px_#fffefb,0_1px_2px_1.5px_rgb(34_32_28/0.35)]"
          />
        )}
      </span>
    </button>
  );
}
