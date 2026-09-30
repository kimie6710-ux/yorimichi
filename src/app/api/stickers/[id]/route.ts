import { stickerPatchSchema } from "@/lib/schemas";
import { asUser, parseJsonBody } from "@/lib/server/http";
import { updateSticker } from "@/lib/server/services";

/** PATCH /api/stickers/:id — my memo, or where it sits in my notebook. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/stickers/[id]">) {
  const { id } = await ctx.params;
  const parsed = await parseJsonBody(req, stickerPatchSchema);
  if (!parsed.ok) return parsed.response;
  return asUser(req, async (userId) => Response.json({ sticker: await updateSticker(userId, id, parsed.data) }));
}
