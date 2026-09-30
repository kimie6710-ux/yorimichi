import { asUser } from "@/lib/server/http";
import { sendSticker } from "@/lib/server/services";

/** POST /api/stickers/:id/send — send it out to someone you don't know. */
export async function POST(req: Request, ctx: RouteContext<"/api/stickers/[id]/send">) {
  const { id } = await ctx.params;
  return asUser(req, async (userId) => Response.json(await sendSticker(userId, id)));
}
