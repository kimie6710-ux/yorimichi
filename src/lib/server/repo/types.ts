import "server-only";

// Row shapes = SQL columns (snake_case) so both stores map 1:1.

export interface UserRow {
  id: string;
  area_key: string | null;
  last_active_at: string;
  created_at: string;
}

export interface SpotRow {
  id: string; // Google place id
  name: string;
  lat: number;
  lng: number;
  category: string | null;
  types: string[];
  photo_name: string | null;
  address: string | null;
  ai_copy: string | null;
  ai_copy_form: string | null;
  /** All usable candidates the AI wrote (the chosen one is ai_copy). */
  ai_copy_alts: string[];
  ai_bird_line: string | null;
  ai_model: string | null;
  ai_generated_at: string | null;
  area_key: string;
  created_at: string;
}

export interface VisitRow {
  id: string;
  user_id: string;
  spot_id: string;
  method: "gps" | "manual";
  created_at: string;
}

export interface SpotSaveRow {
  id: string;
  user_id: string;
  spot_id: string;
  created_at: string;
}

export interface ObservationRow {
  id: string;
  user_id: string;
  spot_id: string;
  photo_path: string | null;
  label: string;
  memo: string;
  created_at: string;
}

export interface StickerRow {
  id: string;
  observation_id: string | null;
  spot_id: string;
  owner_id: string;
  creator_id: string;
  image_path: string;
  rotation: number;
  label: string;
  memo: string;
  origin: "found" | "received";
  status: "kept" | "placed" | "sent";
  placed_at: string | null;
  source_sticker_id: string | null;
  /** Where it sits in the owner's notebook (null = not arranged yet). */
  book_page?: number | null;
  book_x?: number | null;
  book_y?: number | null;
  book_rot?: number | null;
  created_at: string;
}

export interface BookDecoRow {
  id: string;
  user_id: string;
  kind: string; // e.g. "bird-flap"
  page: number;
  x: number;
  y: number;
  rot: number;
  created_at: string;
}

export interface BookPageRow {
  id: string; // `${user_id}:${idx}`
  user_id: string;
  idx: number;
  bg: string;
}

export interface TransferRow {
  id: string;
  sticker_id: string; // the sender's sticker
  copy_id: string | null; // the receiver's copy (set on delivery)
  sender_id: string;
  receiver_id: string | null;
  kind: "send" | "return";
  status: "pending" | "delivered" | "opened";
  created_at: string;
  delivered_at: string | null;
  opened_at: string | null;
}

export interface StickerViewRow {
  id: string;
  sticker_id: string;
  viewer_id: string;
  created_at: string;
}

export interface Tables {
  users: UserRow;
  spots: SpotRow;
  visits: VisitRow;
  spot_saves: SpotSaveRow;
  observations: ObservationRow;
  stickers: StickerRow;
  sticker_transfers: TransferRow;
  sticker_views: StickerViewRow;
  book_pages: BookPageRow;
  book_decos: BookDecoRow;
}
export type TableName = keyof Tables;

export interface Query<T> {
  /** Equality filters. */
  where?: Partial<T>;
  /** field IN values */
  in?: { [K in keyof T]?: T[K][] };
  /** field >= value (ISO strings / numbers) */
  gte?: Partial<T>;
  order?: { key: keyof T; asc?: boolean };
  limit?: number;
}

/** The minimum a storage backend has to provide. Business rules live in services.ts. */
export interface Store {
  readonly kind: "local" | "supabase";
  find<N extends TableName>(table: N, q?: Query<Tables[N]>): Promise<Tables[N][]>;
  get<N extends TableName>(table: N, id: string): Promise<Tables[N] | null>;
  insert<N extends TableName>(table: N, rows: Tables[N][]): Promise<void>;
  upsert<N extends TableName>(table: N, rows: Tables[N][]): Promise<void>;
  update<N extends TableName>(table: N, id: string, patch: Partial<Tables[N]>): Promise<void>;
  remove<N extends TableName>(table: N, id: string): Promise<void>;
  count<N extends TableName>(table: N, q?: Query<Tables[N]>): Promise<number>;
  putFile(path: string, data: Blob, contentType: string): Promise<void>;
  /** A URL the browser can load (signed for private storage). */
  fileUrl(path: string): Promise<string>;
  fileUrls(paths: string[]): Promise<Map<string, string>>;
}
