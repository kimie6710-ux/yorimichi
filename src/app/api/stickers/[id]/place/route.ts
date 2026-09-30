import { locatedSchema } from "@/lib/schemas";
import { asUser, parseJsonBody } from "@/lib/server/http";
import { placeSticker } from "@/lib/server/services";

/** POST /api/stickers/:id/place — leave it at the spot where it was found. */
export async function POST(req: Request, ctx: RouteContext<"/api/stickers/[id]/place">) {
  const { id } = await ctx.params;
  const parsed = await parseJsonBody(req, locatedSchema.nullable());
  if (!parsed.ok) return parsed.response;
  return asUser(req, async (userId) => Response.json({ sticker: await placeSticker(userId, id, parsed.data) }));
}
