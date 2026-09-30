/* eslint-disable @next/next/no-img-element -- tiny local sprite */
import { michibiSrc } from "@/lib/character";
import { StickerMapMarker } from "./StickerMapMarker";
import type { MapMarker } from "./types";
import { YorumichiMarker } from "./YorumichiMarker";

export function MapMarkerView(props: { marker: MapMarker; selected: boolean; onClick: () => void; bubble?: boolean }) {
  return props.marker.tone === "sticker" ? <StickerMapMarker {...props} /> : <YorumichiMarker {...props} />;
}

/** The little bird, walking next to a spot. */
export function MichibiMapMarker() {
  return (
    <img
      src={michibiSrc("walk", "sm")}
      alt=""
      width={48}
      height={48}
      className="pointer-events-none h-12 w-12 animate-bob select-none"
      draggable={false}
    />
  );
}
