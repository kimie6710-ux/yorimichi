import { z } from "zod";

import { asUser, parseJsonBody } from "@/lib/server/http";
import { toggleSave } from "@/lib/server/services";

/** POST /api/spots/:id/save — 気になる. */
export async function POST(req: Request, ctx: RouteContext<"/api/spots/[id]/save">) {
  const { id } = await ctx.params;
  const parsed = await parseJsonBody(req, z.object({ save: z.boolean() }));
  if (!parsed.ok) return parsed.response;
  return asUser(req, async (userId) => {
    await toggleSave(userId, id, parsed.data.save);
    return Response.json({ ok: true });
  });
}
