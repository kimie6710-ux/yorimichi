import "server-only";

import { hasSupabaseServer } from "@/lib/server/env";
import { supabaseForRequest } from "@/lib/supabase/server";

const DEVICE_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Who is calling. With Supabase: the anonymous auth user. Without: a random
 * device id the browser keeps in localStorage (x-yorumichi-device).
 */
export async function identify(req: Request): Promise<string | null> {
  if (hasSupabaseServer()) {
    const sb = await supabaseForRequest(req);
    return sb?.userId ?? null;
  }
  const id = req.headers.get("x-yorumichi-device") ?? "";
  return DEVICE_RE.test(id) ? id.toLowerCase() : null;
}
