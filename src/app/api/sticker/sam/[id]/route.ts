import { jsonError } from "@/lib/server/http";
import { samDecode } from "@/lib/server/sam";

/** POST /api/sticker/sam/:id { x, y } (0–1) — the shape under that point, as 256×256 float32 logits. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { x?: unknown; y?: unknown } | null;
  const x = Number(body?.x);
  const y = Number(body?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return jsonError("invalid_input", "invalid point", 400);
  try {
    const out = await samDecode(id, x, y);
    if (!out) return jsonError("invalid_input", "もう一回、撮ってみて。", 404);
    return new Response(out.logits.slice().buffer as ArrayBuffer, {
      headers: { "Content-Type": "application/octet-stream", "X-Score": String(out.score), "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[sam:decode]", err);
    return jsonError("internal", "うまく切り抜けなかった。", 500);
  }
}
