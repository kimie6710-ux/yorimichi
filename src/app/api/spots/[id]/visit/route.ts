import { locatedSchema } from "@/lib/schemas";
import { asUser, parseJsonBody } from "@/lib/server/http";
import { recordVisit } from "@/lib/server/services";

/** POST /api/spots/:id/visit — "着いた". */
export async function POST(req: Request, ctx: RouteContext<"/api/spots/[id]/visit">) {
  const { id } = await ctx.params;
  const parsed = await parseJsonBody(req, locatedSchema.nullable());
  if (!parsed.ok) return parsed.response;
  return asUser(req, async (userId) => {
    await recordVisit(userId, id, parsed.data);
    return Response.json({ ok: true });
  });
}
