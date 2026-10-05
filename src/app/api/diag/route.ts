/** POST /api/diag — a short line from a phone, printed in the server log (for finding phone-only problems). */
export async function POST(req: Request) {
  const text = (await req.text().catch(() => "")).slice(0, 300);
  const ua = (req.headers.get("user-agent") ?? "").slice(0, 80);
  console.log(`[diag] ${text} | ${ua}`);
  return new Response(null, { status: 204 });
}
