import { asUser } from "@/lib/server/http";
import { history } from "@/lib/server/services";

/** GET /api/me — my walk history. */
export async function GET(req: Request) {
  return asUser(req, async (userId) => Response.json(await history(userId)));
}
