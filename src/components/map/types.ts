import type { LatLng } from "@/lib/types";

export type MarkerTone = "shifted" | "literal" | "collected";

export interface MapMarker {
  id: string;
  position: LatLng;
  /** AI title shown on the sticker marker. */
  label: string;
  tone: MarkerTone;
  /** Optional tiny image (e.g. sticker thumbnail in the collection map). */
  thumbUrl?: string | null;
  index?: number;
  /** Collected stickers are stuck on the map with their own tilt. */
  rotation?: number;
}

export interface MapViewProps {
  origin: LatLng | null;
  markers: MapMarker[];
  /** Quiet dots for "normal" nearby places the AI didn't pick. */
  dots?: { id: string; position: LatLng; name: string }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Extra bottom padding (px) so fitted markers aren't hidden behind cards. */
  bottomInset?: number;
  className?: string;
  /** false = a static preview (no pan/zoom). Default true. */
  interactive?: boolean;
  /** Walking route to draw (guide mode). */
  route?: LatLng[] | null;
  /** Put a tiny みちび next to this point (the spot she's most curious about). */
  mascotAt?: LatLng | null;
}
