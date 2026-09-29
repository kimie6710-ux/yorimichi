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

export interface InterpretedIntent {
  literal: string;
  expanded: string[];
}

export type RecommendationKind = "literal" | "shifted";

export interface AIRecommendation {
  /** Recommendation id (Supabase row id if persisted, otherwise a local uuid). */
  id: string;
  placeId: string;
  title: string;
  interpretation: string;
  why: string;
  /** 1 = ほぼ文字通り, 5 = かなりズレている */
  surpriseScore: number;
  confidence: number;
  kind: RecommendationKind;
  /** How the place was shifted: 行動 / 時間 / 感情 / 用途 / 詩的. */
  interpretationAxis: string;
  /** Internal reasoning chain (never shown before the visit). */
  realPurpose: string;
  hiddenUserNeed: string;
  reinterpretedPurpose: string;
  /** Short line spoken by the mascot on the card / marker. */
  michibiLine: string;
}

/** Recommendation joined with the real place data it points to. */
export interface RecommendedSpot {
  recommendation: AIRecommendation;
  place: Place;
}

export interface SearchRequest {
  query: string;
  location: LatLng;
}

export type SearchMode = "ai" | "fallback" | "mock";

export interface SearchResponse {
  searchId: string;
  query: string;
  origin: LatLng;
  interpretedIntent: InterpretedIntent | null;
  spots: RecommendedSpot[];
  /** All nearby places that were considered (drawn as quiet dots on the map). */
  nearby: Place[];
  mode: SearchMode;
  /** Mascot comment for the whole result set. */
  michibiComment: string;
  /** Human-readable notice when we degraded (AI failure etc.). */
  notice: string | null;
  createdAt: string;
}

export type UserReaction = "totally_off" | "kind_of" | "totally_get_it";

export const REACTIONS: {
  value: UserReaction;
  emoji: string;
  label: string;
}[] = [
  { value: "totally_off", emoji: "😐", label: "全然違った" },
  { value: "kind_of", emoji: "🙂", label: "ちょっと分かる" },
  { value: "totally_get_it", emoji: "🤩", label: "めっちゃ分かる" },
];

/**
 * A sticker = an object cut out of the user's photo (transparent PNG with a
 * white die-cut border), tied to the Google place where it was collected.
 * One photo can produce several stickers (one row each, same photoUrl).
 */
export interface StickerItem {
  id: string;
  placeId: string;
  recommendationId: string | null;
  realName: string;
  aiTitle: string;
  query: string;
  reaction: UserReaction | null;
  /** Rotation in degrees used when the sticker is "stuck" somewhere. */
  rotation: number;
  /** The original photo (never shown as the sticker itself). */
  photoUrl: string | null;
  /** Transparent PNG of the cut-out object. */
  stickerUrl: string | null;
  latitude: number;
  longitude: number;
  address: string | null;
  createdAt: string;
}

export interface NewStickersInput {
  placeId: string;
  recommendationId: string | null;
  realName: string;
  aiTitle: string;
  query: string;
  reaction: UserReaction | null;
  latitude: number;
  longitude: number;
  address: string | null;
  photo: Blob | null;
  /** At least one; each becomes its own sticker row. */
  stickers: { blob: Blob; rotation: number }[];
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
