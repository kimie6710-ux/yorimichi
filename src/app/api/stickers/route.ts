import { stickersMetaSchema } from "@/lib/schemas";
import { hasSupabaseServer, serverEnv } from "@/lib/server/env";
import { jsonError } from "@/lib/server/http";
import { supabaseForRequest } from "@/lib/supabase/server";
import type { StickerItem, UserReaction } from "@/lib/types";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const SIGNED_URL_TTL = 60 * 60;
const COLUMNS =
  "id, place_id, recommendation_id, real_name, ai_title, query, reaction, rotation, photo_url, sticker_url, latitude, longitude, address, created_at";

interface StickerRow {
  id: string;
  place_id: string;
  recommendation_id: string | null;
  real_name: string;
  ai_title: string;
  query: string;
  reaction: UserReaction | null;
  rotation: number;
  photo_url: string | null;
  sticker_url: string | null;
  latitude: number;
  longitude: number;
  address: string | null;
  created_at: string;
}

type Client = NonNullable<Awaited<ReturnType<typeof supabaseForRequest>>>["client"];

async function signRows(client: Client, rows: StickerRow[]): Promise<StickerItem[]> {
  const paths = [...new Set(rows.flatMap((r) => [r.photo_url, r.sticker_url]).filter((p): p is string => !!p))];
  const signed = new Map<string, string>();
  if (paths.length > 0) {
    const { data } = await client.storage.from(serverEnv.storageBucket).createSignedUrls(paths, SIGNED_URL_TTL);
    for (const s of data ?? []) if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl);
  }
  return rows.map((r) => ({
    id: r.id,
    placeId: r.place_id,
    recommendationId: r.recommendation_id,
    realName: r.real_name,
    aiTitle: r.ai_title,
    query: r.query,
    reaction: r.reaction,
    rotation: r.rotation,
    photoUrl: r.photo_url ? (signed.get(r.photo_url) ?? null) : null,
    stickerUrl: r.sticker_url ? (signed.get(r.sticker_url) ?? null) : null,
    latitude: r.latitude,
    longitude: r.longitude,
    address: r.address,
    createdAt: r.created_at,
  }));
}

function checkImage(file: File, allowed: Set<string>, label: string): Response | null {
  if (!allowed.has(file.type)) return jsonError("invalid_input", `${label}: 対応していない画像形式です`, 400);
  if (file.size > MAX_IMAGE_BYTES) return jsonError("invalid_input", `${label}: 画像が大きすぎます（8MBまで）`, 413);
  return null;
}

/** GET /api/stickers — the signed-in user's collected stickers (街のかけら). */
export async function GET(req: Request) {
  if (!hasSupabaseServer()) return jsonError("not_configured", "Supabase is not configured", 501);
  const sb = await supabaseForRequest(req);
  if (!sb) return jsonError("unauthorized", "ログイン情報が見つかりません", 401);

  const { data, error } = await sb.client
    .from("stickers")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) {
    console.error("[stickers:get]", error.message);
    return jsonError("db_failed", "シール帳を読み込めませんでした", 500);
  }
  return Response.json({ items: await signRows(sb.client, data as StickerRow[]) });
}

/**
 * POST /api/stickers (multipart/form-data)
 *   meta:        JSON (stickersMetaSchema; rotations[i] belongs to sticker_i)
 *   photo?:      original photo (stored once, shared by every sticker)
 *   sticker_0..: transparent PNG stickers cut out of that photo
 */
export async function POST(req: Request) {
  if (!hasSupabaseServer()) return jsonError("not_configured", "Supabase is not configured", 501);
  const sb = await supabaseForRequest(req);
  if (!sb) return jsonError("unauthorized", "ログイン情報が見つかりません", 401);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("invalid_input", "フォームを読み取れませんでした", 400);
  }

  let metaRaw: unknown;
  try {
    metaRaw = JSON.parse(String(form.get("meta") ?? ""));
  } catch {
    return jsonError("invalid_input", "meta が不正です", 400);
  }
  const parsed = stickersMetaSchema.safeParse(metaRaw);
  if (!parsed.success) {
    return jsonError("invalid_input", parsed.error.issues[0]?.message ?? "meta が不正です", 400);
  }
  const meta = parsed.data;

  const stickerFiles = meta.rotations.map((_, i) => form.get(`sticker_${i}`));
  if (stickerFiles.some((f) => !(f instanceof File) || f.size === 0)) {
    return jsonError("invalid_input", "sticker が足りません", 400);
  }
  for (const f of stickerFiles as File[]) {
    const bad = checkImage(f, new Set(["image/png"]), "sticker");
    if (bad) return bad;
  }
  const photo = form.get("photo");
  if (photo instanceof File && photo.size > 0) {
    const bad = checkImage(photo, PHOTO_TYPES, "photo");
    if (bad) return bad;
  }

  const bucket = sb.client.storage.from(serverEnv.storageBucket);
  const groupId = crypto.randomUUID();
  const uploaded: string[] = [];

  // Path prefix = user id → enforced by the storage RLS policy.
  let photoPath: string | null = null;
  if (photo instanceof File && photo.size > 0) {
    photoPath = `${sb.userId}/${groupId}/photo.jpg`;
    const { error } = await bucket.upload(photoPath, photo, { contentType: photo.type });
    if (error) {
      console.error("[stickers:photo]", error.message);
      return jsonError("upload_failed", "写真のアップロードに失敗しました", 502);
    }
    uploaded.push(photoPath);
  }

  const rows = [];
  for (const [i, file] of (stickerFiles as File[]).entries()) {
    const id = crypto.randomUUID();
    const path = `${sb.userId}/${groupId}/${id}.png`;
    const { error } = await bucket.upload(path, file, { contentType: "image/png" });
    if (error) {
      console.error("[stickers:upload]", error.message);
      if (uploaded.length) await bucket.remove(uploaded);
      return jsonError("upload_failed", "シールのアップロードに失敗しました", 502);
    }
    uploaded.push(path);
    rows.push({
      id,
      user_id: sb.userId,
      place_id: meta.placeId,
      recommendation_id: meta.recommendationId,
      real_name: meta.realName,
      ai_title: meta.aiTitle,
      query: meta.query,
      reaction: meta.reaction,
      rotation: meta.rotations[i],
      photo_url: photoPath,
      sticker_url: path,
      latitude: meta.latitude,
      longitude: meta.longitude,
      address: meta.address,
    });
  }

  const { data, error } = await sb.client.from("stickers").insert(rows).select(COLUMNS);
  if (error) {
    console.error("[stickers:insert]", error.message);
    await bucket.remove(uploaded);
    return jsonError("db_failed", "シール帳に保存できませんでした", 500);
  }
  return Response.json({ items: await signRows(sb.client, data as StickerRow[]) });
}
