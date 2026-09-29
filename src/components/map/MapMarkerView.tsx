/* eslint-disable @next/next/no-img-element -- tiny local sprite */
import { michibiSrc } from "@/lib/character";
import { StickerMapMarker } from "./StickerMapMarker";
import type { MapMarker } from "./types";
import { YorumichiMarker } from "./YorumichiMarker";

/** Exploring → AI marker. Visited → your sticker. */
export function MapMarkerView(props: { marker: MapMarker; selected: boolean; onClick: () => void }) {
  return props.marker.tone === "collected" ? <StickerMapMarker {...props} /> : <YorumichiMarker {...props} />;
}

/** A tiny みちび peeking near the spot she's most curious about. */
export function MichibiMapMarker() {
  return (
    <img
      src={michibiSrc("found", "sm")}
      alt=""
      width={52}
      height={52}
      className="pointer-events-none h-[52px] w-[52px] animate-bob select-none"
      style={{ filter: "drop-shadow(0 4px 6px rgb(71 85 105 / 0.25))" }}
      draggable={false}
    />
  );
}
