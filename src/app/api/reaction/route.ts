import { reactionRequestSchema } from "@/lib/schemas";
import { hasSupabaseServer } from "@/lib/server/env";
import { jsonError, parseJsonBody } from "@/lib/server/http";
import { supabaseForRequest } from "@/lib/supabase/server";

/** POST /api/reaction — "実際どうだった？" を保存する。 */
export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, reactionRequestSchema);
  if (!parsed.ok) return parsed.response;

  if (!hasSupabaseServer()) {
    return jsonError("not_configured", "Supabase is not configured (saved locally instead)", 501);
  }
  const sb = await supabaseForRequest(req);
  if (!sb) return jsonError("unauthorized", "ログイン情報が見つかりません", 401);

  const { placeId, recommendationId, reaction } = parsed.data;
  const { data, error } = await sb.client
    .from("visits")
    .insert({
      user_id: sb.userId,
      place_id: placeId,
      recommendation_id: recommendationId,
      reaction,
    })
    .select("id, created_at")
    .single();

  if (error) {
    console.error("[reaction]", error.message);
    return jsonError("db_failed", "リアクションを保存できませんでした", 500);
  }
  return Response.json({ id: data.id, createdAt: data.created_at });
}
