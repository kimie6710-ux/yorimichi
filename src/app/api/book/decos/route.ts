import { decoCreateSchema } from "@/lib/schemas";
import { asUser, parseJsonBody } from "@/lib/server/http";
import { addDeco, listDecos } from "@/lib/server/services";

/** GET /api/book/decos — character stickers in my notebook. */
export async function GET(req: Request) {
  return asUser(req, async (userId) => Response.json({ decos: await listDecos(userId) }));
}

/** POST /api/book/decos — stick one on a page. */
export async function POST(req: Request) {
  const parsed = await parseJsonBody(req, decoCreateSchema);
  if (!parsed.ok) return parsed.response;
  return asUser(req, async (userId) => Response.json({ deco: await addDeco(userId, parsed.data.kind, parsed.data.pos) }));
}
