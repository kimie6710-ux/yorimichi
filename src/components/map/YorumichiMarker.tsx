import { SketchBubble, SketchOutline } from "@/components/sketch";
import type { MapMarker } from "./types";

/**
 * A real spot on the map: a small hand-drawn paper tag with its number.
 * The selected one opens its copy in a speech bubble above the tag.
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
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={marker.label}
      aria-pressed={selected}
      className={`relative flex flex-col items-center ${selected ? "z-20" : "z-10"}`}
    >
      {selected && bubble && (
        <SketchBubble seed={marker.id} className="animate-peek mb-2 w-max max-w-[220px] text-left text-sm !leading-snug">
          {marker.label}
        </SketchBubble>
      )}
      <span className={`relative isolate flex h-9 min-w-9 items-center justify-center px-1 text-sm font-bold text-ink transition-transform ${selected ? "scale-110" : ""}`}>
        <SketchOutline tone={marker.visited ? "sky" : selected ? "sticker" : "butter"} seed={`pin-${marker.id}`} radius={14} wobble={1.2} double={selected} />
        {marker.index ?? "?"}
      </span>
      {(marker.placed ?? 0) > 0 && (
        <span
          aria-label={`誰かが${marker.placed}枚置いています`}
          className="absolute -right-2 bottom-2 flex h-5 min-w-5 rotate-6 items-center justify-center rounded-[6px_8px_5px_9px] bg-card px-1 text-[12px] leading-none font-bold outline-[1.5px] outline-ink outline-solid"
        >
          ✦{marker.placed}
        </span>
      )}
    </button>
  );
}
