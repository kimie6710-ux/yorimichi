import { z } from "zod";

import { asUser, jsonError } from "@/lib/server/http";
import { addVisionMemory, listVisionMemory } from "@/lib/server/services";

/** GET /api/vision/memory — what your stickers looked like, with your names for them. */
export async function GET(req: Request) {
  return asUser(req, async (userId) => Response.json({ items: await listVisionMemory(userId) }));
}

const bodySchema = z.object({
  stickerId: z.string().uuid().nullable(),
  label: z.string().min(1).max(40),
  emb: z.string().min(16).max(4000),
  scale: z.number().positive().finite(),
});

/** POST /api/vision/memory — remember one named cutout. */
export async function POST(req: Request) {
  return asUser(req, async (userId) => {
    const body = bodySchema.safeParse(await req.json().catch(() => null));
    if (!body.success) return jsonError("invalid_input", "内容が不正です", 400);
    await addVisionMemory(userId, body.data);
    return Response.json({ ok: true });
  });
}
