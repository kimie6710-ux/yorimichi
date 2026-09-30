import { asUser } from "@/lib/server/http";
import { openInboxItem } from "@/lib/server/services";

export async function POST(req: Request, ctx: RouteContext<"/api/inbox/[id]/open">) {
  const { id } = await ctx.params;
  return asUser(req, async (userId) => {
    await openInboxItem(userId, id);
    return Response.json({ ok: true });
  });
}
