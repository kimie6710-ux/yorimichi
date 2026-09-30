import { asUser } from "@/lib/server/http";
import { inbox, touchUser } from "@/lib/server/services";

/** GET /api/inbox — stickers that reached me. */
export async function GET(req: Request) {
  return asUser(req, async (userId) => {
    await touchUser(userId);
    return Response.json({ items: await inbox(userId) });
  });
}
