import { StickerView } from "@/components/StickerView";
import type { MapMarker } from "./types";

/**
 * After a visit: the user's own cut-out sticker is stuck on the map where it
 * was collected (ramen bowl, torii, lamp…). Label only when selected.
 */
export function StickerMapMarker({
  marker,
  selected,
  onClick,
}: {
  marker: MapMarker;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={marker.label}
      aria-pressed={selected}
      className={`relative flex flex-col items-center transition-transform duration-200 ${selected ? "z-20 scale-110" : "z-10"}`}
    >
      <StickerView src={marker.thumbUrl ?? null} alt="" rotation={marker.rotation ?? 0} lift={selected} className="w-16" />
      {selected && (
        <span className="animate-peek mt-1 max-w-[160px] truncate rounded-full bg-white px-3 py-1 text-sm font-bold shadow-sticker">
          {marker.label}
        </span>
      )}
    </button>
  );
}
