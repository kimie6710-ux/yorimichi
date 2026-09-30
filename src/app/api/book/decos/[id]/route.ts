import { decoMoveSchema } from "@/lib/schemas";
import { asUser, parseJsonBody } from "@/lib/server/http";
import { moveDeco, removeDeco } from "@/lib/server/services";

/** PATCH /api/book/decos/:id — move it. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/book/decos/[id]">) {
  const { id } = await ctx.params;
  const parsed = await parseJsonBody(req, decoMoveSchema);
  if (!parsed.ok) return parsed.response;
  return asUser(req, async (userId) => {
    await moveDeco(userId, id, parsed.data.pos);
    return Response.json({ ok: true });
  });
}

/** DELETE /api/book/decos/:id — peel it off. */
export async function DELETE(req: Request, ctx: RouteContext<"/api/book/decos/[id]">) {
  const { id } = await ctx.params;
  return asUser(req, async (userId) => {
    await removeDeco(userId, id);
    return Response.json({ ok: true });
  });
}
