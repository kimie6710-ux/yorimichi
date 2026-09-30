import type { LatLng } from "@/lib/types";

export type MarkerTone = "spot" | "sticker";

export interface MapMarker {
  id: string;
  position: LatLng;
  /** The spot's copy (or a sticker's label). */
  label: string;
  tone: MarkerTone;
  index?: number;
  /** Sticker markers: the transparent PNG. */
  thumbUrl?: string | null;
  rotation?: number;
  /** Someone left stickers here. */
  placed?: number;
  visited?: boolean;
}

export interface MapViewProps {
  origin: LatLng | null;
  markers: MapMarker[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Extra bottom padding (px) so fitted markers aren't hidden behind cards. */
  bottomInset?: number;
  className?: string;
  /** false = a static preview (no pan/zoom). Default true. */
  interactive?: boolean;
  /** Walking route to draw (guide mode). */
  route?: LatLng[] | null;
  /** Put the little bird next to this point. */
  mascotAt?: LatLng | null;
  /** Show the selected spot's copy as a bubble on the map (default true). */
  bubbles?: boolean;
}
