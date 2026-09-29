/* eslint-disable @next/next/no-img-element -- Places photo redirect URL */
import type { MapMarker } from "./types";

/**
 * AI-picked spot while exploring. Quiet by default (a round photo badge with
 * its number), and only the selected one opens into a pill with its nickname —
 * so the map never fills up with text. Every pick wears the mascot's gradient.
 */
export function YorumichiMarker({
  marker,
  selected,
  onClick,
}: {
  marker: MapMarker;
  selected: boolean;
  onClick: () => void;
}) {
  const ring = "rainbow";

  const badge = (
    <span className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full p-[3px] ${ring}`}>
      {marker.thumbUrl ? (
        <img src={marker.thumbUrl} alt="" className="h-full w-full rounded-full border-2 border-white object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center rounded-full border-2 border-white bg-ink text-sm font-bold text-white">
          {marker.index ?? "・"}
        </span>
      )}
      {marker.thumbUrl && marker.index != null && (
        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-sm leading-none font-bold text-white">
          {marker.index}
        </span>
      )}
    </span>
  );

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={marker.label}
      aria-pressed={selected}
      className={`relative flex flex-col items-center transition-transform duration-200 ${selected ? "z-20" : "z-10 hover:scale-105"}`}
    >
      {selected ? (
        <span className="animate-peek flex max-w-[210px] items-center gap-2 rounded-full bg-white py-1 pr-4 pl-1 shadow-lift">
          {badge}
          <span className="line-clamp-2 text-left text-sm leading-snug font-bold">{marker.label}</span>
        </span>
      ) : (
        <span className="rounded-full shadow-sticker">{badge}</span>
      )}
      <span className="-mt-1.5 h-3 w-3 rotate-45 rounded-sm bg-white shadow-sticker" aria-hidden />
    </button>
  );
}
