import "server-only";

import { hasSupabaseServer } from "@/lib/server/env";
import { supabaseForRequest } from "@/lib/supabase/server";

const DEVICE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One person's own server (all devices = the owner). Other people are only demo neighbours. */
export function isOwnerMode(): boolean {
  return DEVICE_RE.test(process.env.YORUMICHI_OWNER_ID ?? "");
}

/** The owner's id on a personal server (null otherwise). */
export function ownerId(): string | null {
  return isOwnerMode() ? (process.env.YORUMICHI_OWNER_ID ?? "").toLowerCase() : null;
}

/** Demo neighbours who can receive what the owner sends (YORUMICHI_DEMO_NEIGHBOURS, comma-separated). */
export function demoNeighbours(): string[] {
  return (process.env.YORUMICHI_DEMO_NEIGHBOURS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => DEVICE_RE.test(s));
}

/**
 * Who is calling. With Supabase: the anonymous auth user. Without: a random
 * device id the browser keeps in localStorage (x-yorumichi-device).
 */
export async function identify(req: Request): Promise<string | null> {
  if (hasSupabaseServer()) {
    const sb = await supabaseForRequest(req);
    return sb?.userId ?? null;
  }
  // Personal server: at home (this machine, the home Wi-Fi) every device is the
  // owner, so the notebook and inbox stay in sync. Set YORUMICHI_OWNER_ID in .env.local.
  // Opened from outside (a shared link): each phone is its own person.
  const owner = process.env.YORUMICHI_OWNER_ID ?? "";
  if (DEVICE_RE.test(owner) && isHomeRequest(req)) return owner.toLowerCase();
  const id = req.headers.get("x-yorumichi-device") ?? "";
  return DEVICE_RE.test(id) ? id.toLowerCase() : null;
}

/** Reached on this machine or the home network (not through a public link). Only the Host header counts: forwarded-host headers can be made up by anyone. */
function isHomeRequest(req: Request): boolean {
  const host = (req.headers.get("host") ?? "").split(":")[0].toLowerCase();
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "[::1]" ||
    host.endsWith(".local") ||
    /^192\.168\./.test(host) ||
    /^10\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}
