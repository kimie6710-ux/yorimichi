/* eslint-disable @next/next/no-img-element -- hand-drawn sticker sprites */
import type { MapMarker } from "./types";

/**
 * A real spot on the map: a small scalloped sticker with its number.
 * Yellow = not yet visited, blue = been there, cream = selected.
 * The selected one shows its copy on a small paper tag (one or two lines).
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
  const badge = selected ? "cream" : marker.visited ? "blue" : "yellow";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={marker.label}
      aria-pressed={selected}
      className={`relative flex flex-col items-center ${selected ? "z-20" : "z-10"}`}
    >
      {selected && bubble && marker.label && (
        <span className="animate-peek mb-1.5 line-clamp-2 w-max max-w-[190px] rounded-[8px_12px_9px_11px] bg-card px-2.5 py-1.5 text-left text-[13px] leading-snug font-bold whitespace-pre-line shadow-[0_1px_0_rgb(60_50_30/0.08),0_6px_12px_-6px_rgb(60_50_30/0.3)]">
          {marker.label}
        </span>
      )}
      <span className={`relative flex items-center justify-center transition-transform ${selected ? "h-11 w-11 scale-105" : "h-9 w-9"}`}>
        <img src={`/ui/badge-${badge}.png`} alt="" className="absolute inset-0 h-full w-full" draggable={false} />
        <span className="relative text-[13px] font-bold tabular-nums">{marker.index ?? "?"}</span>
        {(marker.placed ?? 0) > 0 && (
          <img src="/ui/tape-blue.png" alt={`誰かの発見が${marker.placed}枚`} className="absolute -right-2.5 -bottom-0.5 h-3 w-auto rotate-12" />
        )}
      </span>
    </button>
  );
}
