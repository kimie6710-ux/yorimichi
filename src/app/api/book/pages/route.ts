import { bookPagesSchema } from "@/lib/schemas";
import { asUser, parseJsonBody } from "@/lib/server/http";
import { bookPages, saveBookPages } from "@/lib/server/services";

/** GET /api/book/pages — my notebook pages (backgrounds). */
export async function GET(req: Request) {
  return asUser(req, async (userId) => Response.json({ pages: await bookPages(userId) }));
}

/** PUT /api/book/pages — add pages / change backgrounds. */
export async function PUT(req: Request) {
  const parsed = await parseJsonBody(req, bookPagesSchema);
  if (!parsed.ok) return parsed.response;
  return asUser(req, async (userId) => {
    await saveBookPages(userId, parsed.data.pages);
    return Response.json({ ok: true });
  });
}
