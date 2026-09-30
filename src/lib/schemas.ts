import { z } from "zod";

// ── Request validation (API routes) ─────────────────────────

export const latLngSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const placeIdSchema = z
  .string()
  .min(1)
  .max(300)
  .regex(/^[A-Za-z0-9_-]+$/, "invalid place id");

const placeReviewSchema = z.object({
  text: z.string().max(4000),
  rating: z.number().nullable(),
  relativeTime: z.string().nullable(),
  authorName: z.string().nullable(),
});

const placePhotoSchema = z.object({
  name: z.string().max(1000),
  widthPx: z.number().nullable(),
  heightPx: z.number().nullable(),
  authorAttributions: z.array(z.object({ displayName: z.string(), uri: z.string().nullable() })),
});

export const placeSchema = z.object({
  placeId: placeIdSchema,
  name: z.string().max(300),
  primaryType: z.string().nullable(),
  primaryTypeLabel: z.string().nullable(),
  types: z.array(z.string()).max(40),
  location: latLngSchema,
  address: z.string().nullable(),
  rating: z.number().nullable(),
  userRatingCount: z.number().nullable(),
  priceLevel: z.string().nullable(),
  openNow: z.boolean().nullable(),
  businessStatus: z.string().max(40).nullable(),
  editorialSummary: z.string().nullable(),
  attributes: z.array(z.string().max(60)).max(20),
  photos: z.array(placePhotoSchema).max(10),
  googleMapsUri: z.string().nullable(),
  reviews: z.array(placeReviewSchema).max(10),
  weekdayHours: z.array(z.string()).max(10),
  websiteUri: z.string().nullable(),
  distanceMeters: z.number(),
  walkMinutes: z.number(),
  isMock: z.boolean().optional(),
});

export const spotsNearbyRequestSchema = latLngSchema;

export const seedRequestSchema = z.object({
  origin: latLngSchema,
  places: z.array(placeSchema).min(1).max(10),
});

export const locatedSchema = z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) });

export const stickerMetaSchema = z.object({
  spotId: placeIdSchema,
  memo: z.string().max(80).default(""),
  items: z
    .array(z.object({ label: z.string().min(1).max(20), rotation: z.number().min(-15).max(15) }))
    .min(1)
    .max(6),
});

export const memoSchema = z.object({ memo: z.string().max(80) });

export const stickerPatchSchema = z.object({
  memo: z.string().max(80).optional(),
  book: z
    .object({
      page: z.number().int().min(0).max(199),
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
      rot: z.number().min(-30).max(30),
    })
    .optional(),
});

export const bookPagesSchema = z.object({
  pages: z.array(z.object({ idx: z.number().int().min(0).max(199), bg: z.enum(["cream", "grid", "dots"]) })).max(200),
});

// ── AI output schemas (structured output) ───────────────────

export const COPY_FORMS = ["名詞止め", "短い断定", "擬人化", "用途のずらし", "情景", "違和感", "詩的", "対比"] as const;

export const seedOutputSchema = z.object({
  spots: z.array(
    z.object({
      placeId: z.string().describe("入力の placeId をそのままコピー。変更禁止"),
      reading: z.string().describe("内部用：本来なにをする場所か（短く）"),
      candidates: z
        .array(
          z.object({
            form: z.enum(COPY_FORMS),
            copy: z.string().describe("8〜20文字。必要なら改行1回で2行まで。店名を書かない"),
          }),
        )
        .describe("文型の違う5案"),
      birdLine: z.string().describe("小鳥のひとこと。15文字以内"),
    }),
  ),
});
export type SeedOutput = z.infer<typeof seedOutputSchema>;

export const nameOutputSchema = z.object({
  items: z.array(
    z.object({
      index: z.number().describe("入力画像の番号（0始まり）"),
      label: z.string().describe("2〜10文字の日本語。見たままの特徴が分かる名前"),
      keep: z.boolean().describe("はっきりしたモノなら true。地面・空・壁・背景のかけら・判別できないものは false"),
    }),
  ),
});
export type NameOutput = z.infer<typeof nameOutputSchema>;
