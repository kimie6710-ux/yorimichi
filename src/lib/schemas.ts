import { z } from "zod";
import { MAX_QUERY_LENGTH } from "./config";

// ── Request validation (API routes) ─────────────────────────

export const latLngSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const nearbyRequestSchema = latLngSchema.extend({
  radius: z.number().int().min(100).max(3000).optional(),
});

export const placeIdSchema = z
  .string()
  .min(1)
  .max(300)
  .regex(/^[A-Za-z0-9_-]+$/, "invalid place id");

export const detailsRequestSchema = z.object({
  placeIds: z.array(placeIdSchema).min(1).max(10),
  origin: latLngSchema,
});

export const querySchema = z
  .string()
  .trim()
  .min(1, "ひとこと入れてね")
  .max(MAX_QUERY_LENGTH, `${MAX_QUERY_LENGTH}文字以内で`);

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

export const interpretRequestSchema = z.object({
  query: querySchema,
  origin: latLngSchema,
  places: z.array(placeSchema).min(1).max(40),
});

export const reactionRequestSchema = z.object({
  placeId: placeIdSchema,
  recommendationId: z.string().max(100).nullable(),
  reaction: z.enum(["totally_off", "kind_of", "totally_get_it"]),
});

export const stickersMetaSchema = z.object({
  placeId: placeIdSchema,
  recommendationId: z.string().max(100).nullable(),
  realName: z.string().min(1).max(300),
  aiTitle: z.string().min(1).max(120),
  query: z.string().max(MAX_QUERY_LENGTH),
  reaction: z.enum(["totally_off", "kind_of", "totally_get_it"]).nullable(),
  rotations: z.array(z.number().min(-15).max(15)).min(1).max(8),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  address: z.string().max(300).nullable(),
});

// ── AI output schemas (structured output) ───────────────────

/** Stage 1: quick shortlist from basic info only. */
export const shortlistOutputSchema = z.object({
  literal: z.string().describe("ユーザーの言葉をそのまま受け取った意図（短く）"),
  expanded: z
    .array(z.string())
    .describe("意図を感覚・行動・雰囲気へ広げたキーワード（6〜12個）"),
  candidatePlaceIds: z
    .array(z.string())
    .describe("詳細を確認したいplaceId。提供されたものからのみ、6〜8件"),
});
export type ShortlistOutput = z.infer<typeof shortlistOutputSchema>;

/** Stage 2: final interpretation. Mirrors the product spec JSON. */
export const interpretationOutputSchema = z.object({
  interpretedIntent: z.object({
    literal: z.string(),
    expanded: z.array(z.string()),
  }),
  michibiComment: z
    .string()
    .describe("マスコット「みちび」が結果全体について言うひとこと。40文字以内、くだけた口調"),
  places: z.array(
    z.object({
      placeId: z.string().describe("提供されたplaceIdをそのままコピー。変更禁止"),
      realPurpose: z.string().describe("この場所の本来の用途（例：ラーメンを食べる）"),
      hiddenUserNeed: z.string().describe("ユーザーの一言の奥にある目的（例：一人で少し休みたい）"),
      reinterpretedPurpose: z
        .string()
        .describe("本来の用途から離れた、この場所の別の使い方（例：短時間だけ誰とも話さず頭を休ませる）"),
      shiftType: z
        .enum(["行動", "時間", "感情", "用途", "詩的"])
        .describe("ずらし方。同じ結果内で重複させない"),
      copyForm: z
        .enum(["名詞句", "のない", "じゃなく", "未満以上", "短い断定", "新しい用途名", "疑問形"])
        .describe("コピーの文の形。同じ結果内で重複させない"),
      title: z
        .string()
        .describe("その場所に新しい役割名を与える短いコピー（広告コピー・雑誌の見出し・あだ名）。8〜18文字。copyForm の形で書く。行動指示や特徴の説明にしない"),
      why: z
        .string()
        .describe("内部用の根拠メモ（ユーザーには表示しない）。提供データのどこを根拠にしたか。1〜2文"),
      michibiLine: z.string().describe("みちびの独り言。25文字以内。くだけた口調。店名・カテゴリを明かさない"),
      kind: z.enum(["literal", "shifted"]).describe("literal=言葉どおりに近い / shifted=ずらした使い方"),
      surpriseScore: z.number().describe("1(ふつう)〜5(かなり意外)の整数"),
      confidence: z.number().describe("0〜1。「言われるとちょっと分かる」と感じそうな度合い"),
    }),
  ),
});
export type InterpretationOutput = z.infer<typeof interpretationOutputSchema>;

/** Repair pass: rename titles only, when the set repeats itself. */
export const retitleOutputSchema = z.object({
  titles: z.array(
    z.object({
      placeId: z.string().describe("入力のplaceIdをそのままコピー"),
      title: z.string().describe("言い換えた一言あだ名。12〜18文字目安"),
      interpretationAxis: z.string().describe("発想軸。ほかのスポットと重複させない"),
    }),
  ),
});
export type RetitleOutput = z.infer<typeof retitleOutputSchema>;
