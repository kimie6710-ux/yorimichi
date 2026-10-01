// ─────────────────────────────────────────────
// Shared domain types (client + server)
// ─────────────────────────────────────────────

/** A rough kind of place, for sorting stickers in the box. */
export type SpotKind = "eat" | "shop" | "walk" | "other";

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
// よりみち: spots, stickers, sharing
// ─────────────────────────────────────────────

/** The AI's first seed on a real place: a "なにそれ？" line. */
export interface SpotCopy {
  copy: string;
  form: string;
  birdLine: string;
}

/** A place near you that a free capture can be tied to (with or without a copy). */
export interface NearPlace {
  placeId: string;
  name: string;
  category: string | null;
  distanceMeters: number;
}

/** A real place on the map with its よりみち layer. */
export interface MapSpot {
  place: Place;
  copy: SpotCopy | null;
  /** Your own newest sticker from here (shown on the map once you've been). */
  mineUrl?: string | null;
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
  /** Rough kind of the place it was found (for the box). */
  spotKind: SpotKind;
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

export interface BookPos {
  page: number;
  /** Centre of the sticker, 0..1 of the page. */
  x: number;
  y: number;
  rot: number;
}

export const PAGE_BACKGROUNDS = ["cream", "grid", "kraft", "pink", "dots", "lined"] as const;
export type PageBackground = (typeof PAGE_BACKGROUNDS)[number];

/** Character stickers you can decorate the notebook with. */
export const DECO_KINDS = [
  "bird-front",
  "bird-side",
  "bird-back",
  "bird-walk",
  "bird-flap",
  "bird-perch",
  "bird-hop",
  "bird-happy",
  "bird-surprise",
  "bird-sleepy",
  "tape-yellow",
  "tape-dots",
  "tape-pink",
  "tape-greencheck",
  "tape-yellowdots",
  "tape-bluegrid",
  "tape-green",
  "tape-stripe",
  "tape-purple",
  "tape-kraft",
] as const;
export const TAPES = DECO_KINDS.filter((k) => k.startsWith("tape-")).map((k) => k.slice(5));
export type DecoKind = (typeof DECO_KINDS)[number];

/** One of your own stickers stuck on a page (the same sticker can be stuck many times). */
export type StickerDecoKind = `sticker:${string}`;
export type BookDecoKind = DecoKind | StickerDecoKind;

/** The sticker a page item shows, if it is one of your stickers. */
export function stickerOfDeco(kind: string): string | null {
  return kind.startsWith("sticker:") ? kind.slice(8) : null;
}

export interface BookDeco {
  id: string;
  kind: BookDecoKind;
  pos: BookPos;
}

export interface BookPage {
  idx: number;
  bg: PageBackground;
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
  /** Spots you marked 気になる. `name` only once you've been (the place stays a surprise until then). */
  saved: { spotId: string; name: string | null; copy: string | null; at: string }[];
  visited: { spotId: string; name: string; copy: string | null; at: string }[];
  placed: Sticker[];
  sent: Sticker[];
  received: Sticker[];
}

