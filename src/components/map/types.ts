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
  /** What to draw there (defaults to a small walking bird). */
  mascot?: import("react").ReactNode;
  /** Keep the map centred on the person (navigation). */
  follow?: boolean;
  /** Bump to re-centre on the person after they panned away (navigation). */
  recenter?: number;
  /** Told when the person drags the map away while following. */
  onPanAway?: () => void;
  /** Drawn at the person's position instead of the dot (e.g. みちび walking). */
  originMarker?: import("react").ReactNode;
  /** Show the selected spot's copy as a bubble on the map (default true). */
  bubbles?: boolean;
}
