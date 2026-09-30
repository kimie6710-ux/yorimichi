import { memoSchema } from "@/lib/schemas";
import { asUser, parseJsonBody } from "@/lib/server/http";
import { updateMemo } from "@/lib/server/services";

/** PATCH /api/stickers/:id — edit my memo. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/stickers/[id]">) {
  const { id } = await ctx.params;
  const parsed = await parseJsonBody(req, memoSchema);
  if (!parsed.ok) return parsed.response;
  return asUser(req, async (userId) => Response.json({ sticker: await updateMemo(userId, id, parsed.data.memo) }));
}
