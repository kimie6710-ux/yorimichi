// ─────────────────────────────────────────────
// Shared domain types (client + server)
// ─────────────────────────────────────────────

export interface LatLng {
  latitude: number;
  longitude: number;
}

/** A single user-visible review snippet coming from Google (never AI-written). */
export interface PlaceReview {
  text: string;
  rating: number | null;
  relativeTime: string | null;
  authorName: string | null;
}

export interface PlacePhoto {
  /** Places API (New) photo resource name: places/{id}/photos/{ref} */
  name: string;
  widthPx: number | null;
  heightPx: number | null;
  authorAttributions: { displayName: string; uri: string | null }[];
}

/**
 * A real place. Every field here comes from Google Places (or, in mock mode,
 * from the development-only mock objects). AI must never write into this type.
 */
export interface Place {
  placeId: string;
  name: string;
  primaryType: string | null;
  /** Localized category label from Google (e.g. 「中華料理店」) */
  primaryTypeLabel: string | null;
  types: string[];
  location: LatLng;
  address: string | null;
  rating: number | null;
  userRatingCount: number | null;
  priceLevel: string | null;
  openNow: boolean | null;
  /** OPERATIONAL / CLOSED_TEMPORARILY / CLOSED_PERMANENTLY */
  businessStatus: string | null;
  editorialSummary: string | null;
  /** Human-readable facts from Google boolean fields (e.g. 「テラス席あり」). */
  attributes: string[];
  photos: PlacePhoto[];
  googleMapsUri: string | null;
  /** Filled only after the details step (stage 2). */
  reviews: PlaceReview[];
  weekdayHours: string[];
  websiteUri: string | null;
  /** Distance from the search origin in meters (computed server-side). */
  distanceMeters: number;
  walkMinutes: number;
  /** True only for development-only mock objects. */
  isMock?: boolean;
}

/** Uniform error body returned by every API route. */
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
  };
}

export type ApiErrorCode =
  | "invalid_input"
  | "places_failed"
  | "places_empty"
  | "ai_failed"
  | "ai_empty"
  | "not_configured"
  | "unauthorized"
  | "upload_failed"
  | "db_failed"
  | "internal";

// ─────────────────────────────────────────────
// よるみち: spots, stickers, sharing
// ─────────────────────────────────────────────

/** The AI's first seed on a real place: a "なにそれ？" line. */
export interface SpotCopy {
  copy: string;
  form: string;
  birdLine: string;
}

/** A real place on the map with its よるみち layer. */
export interface MapSpot {
  place: Place;
  copy: SpotCopy | null;
  /** Stickers other people left here. */
  placedCount: number;
  /** Stickers ever made here (by anyone). */
  foundCount: number;
  visited: boolean;
  saved: boolean;
}

export type StickerStatus = "kept" | "placed" | "sent";
export type StickerOrigin = "found" | "received";

export interface Sticker {
  id: string;
  spotId: string;
  spotName: string;
  spotCopy: string | null;
  spotLocation: LatLng;
  label: string;
  memo: string;
  imageUrl: string;
  /** The original photo — only for the person who took it. */
  photoUrl: string | null;
  rotation: number;
  origin: StickerOrigin;
  status: StickerStatus;
  placedAt: string | null;
  /** How many people saw it where it was placed. */
  seenCount: number;
  createdAt: string;
}

/** A sticker somebody left at a spot. The image only comes with you on site. */
export interface PlacedSticker {
  id: string;
  label: string;
  memo: string;
  imageUrl: string | null;
  rotation: number;
  mine: boolean;
  createdAt: string;
}

export interface SpotDetail {
  spot: MapSpot;
  /** True when the caller is on site (or arrived recently): placed stickers are visible. */
  onSite: boolean;
  placed: PlacedSticker[];
  /** Labels of what people found here (no images, no names). */
  foundLabels: string[];
  mine: Sticker[];
}

export interface InboxItem {
  id: string;
  sticker: Sticker;
  kind: "send" | "return";
  openedAt: string | null;
  deliveredAt: string;
}

export interface MyHistory {
  visited: { spotId: string; name: string; copy: string | null; at: string }[];
  placed: Sticker[];
  sent: Sticker[];
  received: Sticker[];
}

/** The AI's name for one thing cut out of a photo. */
export interface CutoutName {
  index: number;
  label: string;
  /** false = background / not really a thing. */
  keep: boolean;
}
