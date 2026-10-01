import "server-only";

import { hasSupabaseServer } from "@/lib/server/env";
import { supabaseForRequest } from "@/lib/supabase/server";

const DEVICE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One person's own server (all devices = the owner). Other people are only demo neighbours. */
export function isOwnerMode(): boolean {
  return DEVICE_RE.test(process.env.YORUMICHI_OWNER_ID ?? "");
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
  // Personal server: every device (PC, phone) is the same person, so the
  // notebook and inbox stay in sync. Set YORUMICHI_OWNER_ID in .env.local.
  const owner = process.env.YORUMICHI_OWNER_ID ?? "";
  if (DEVICE_RE.test(owner)) return owner.toLowerCase();
  const id = req.headers.get("x-yorumichi-device") ?? "";
  return DEVICE_RE.test(id) ? id.toLowerCase() : null;
}
