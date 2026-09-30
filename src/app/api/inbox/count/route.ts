import { asUser } from "@/lib/server/http";
import { touchUser, unreadCount } from "@/lib/server/services";

/** GET /api/inbox/count — unopened deliveries. */
export async function GET(req: Request) {
  return asUser(req, async (userId) => {
    await touchUser(userId);
    return Response.json({ unread: await unreadCount(userId) });
  });
}
