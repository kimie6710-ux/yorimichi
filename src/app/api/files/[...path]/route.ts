import { jsonError } from "@/lib/server/http";
import { LocalStore } from "@/lib/server/repo/local";
import { getStore } from "@/lib/server/repo";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp" };

/** GET /api/files/* — images from the local store (development / single machine only). */
export async function GET(_req: Request, ctx: RouteContext<"/api/files/[...path]">) {
  if (getStore().kind !== "local") return jsonError("invalid_input", "not found", 404);
  const { path } = await ctx.params;
  if (path.some((p) => p === ".." || p.includes("/"))) return jsonError("invalid_input", "not found", 404);
  const data = await LocalStore.readFile(path.join("/"));
  if (!data) return jsonError("invalid_input", "not found", 404);
  const ext = path.at(-1)?.split(".").pop()?.toLowerCase() ?? "";
  return new Response(new Uint8Array(data), {
    headers: { "Content-Type": TYPES[ext] ?? "application/octet-stream", "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
