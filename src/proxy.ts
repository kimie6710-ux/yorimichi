import { NextResponse, type NextRequest } from "next/server";

// A shared passphrase for the owner's own server. Off unless YORIMICHI_ACCESS_KEY
// is set (turn it on before the server can be reached from outside the home network).
// Open the app once as  https://<host>/?key=<passphrase>  on each device; it's
// remembered in a cookie for a year.

const COOKIE = "yorimichi_key";
const YEAR = 60 * 60 * 24 * 365;

function same(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const LOCKED_PAGE = `<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>よりみち</title><body style="margin:0;min-height:100dvh;display:grid;place-items:center;background:#faf6ec;color:#22201c;font-family:system-ui,sans-serif">
<form method="get" style="display:grid;gap:12px;width:min(320px,86vw);text-align:center">
<p style="font-size:18px;margin:0">合言葉を入れてね</p>
<input name="key" type="password" autocomplete="current-password" required style="font-size:16px;padding:12px;border-radius:12px;border:0;background:#fff">
<button style="font-size:16px;padding:12px;border-radius:12px;border:0;background:#ffd95c">入る</button>
</form></body></html>`;

/** This machine or the home network: no passphrase needed. */
function isHome(request: NextRequest): boolean {
  const host = (request.headers.get("host") ?? "").split(":")[0].toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host.endsWith(".local") || /^(192\.168|10)\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
}

export function proxy(request: NextRequest) {
  const home = isHome(request);
  // ころたんPro is served through the shared link too (non-commercial use, per the owner).
  const key = process.env.YORIMICHI_ACCESS_KEY ?? "";
  if (!key || home) return NextResponse.next();

  const given = request.nextUrl.searchParams.get("key");
  if (given !== null) {
    if (!same(given, key)) return new NextResponse(LOCKED_PAGE, { status: 401, headers: { "content-type": "text/html; charset=utf-8" } });
    const clean = request.nextUrl.clone();
    clean.searchParams.delete("key");
    const res = NextResponse.redirect(clean);
    res.cookies.set(COOKIE, key, { httpOnly: true, secure: true, sameSite: "lax", maxAge: YEAR, path: "/" });
    return res;
  }

  if (same(request.cookies.get(COOKIE)?.value ?? "", key)) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: { code: "unauthorized", message: "合言葉が必要です" } }, { status: 401 });
  }
  return new NextResponse(LOCKED_PAGE, { status: 401, headers: { "content-type": "text/html; charset=utf-8" } });
}

export const config = {
  // Everything except Next's own build files.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
