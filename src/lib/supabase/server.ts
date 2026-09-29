import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { hasSupabaseServer, serverEnv } from "@/lib/server/env";

export interface AuthedSupabase {
  client: SupabaseClient;
  userId: string;
}

/**
 * Build a Supabase client that acts as the calling (anonymous) user, so every
 * query goes through Row Level Security. We never use the service-role key.
 * Returns null when Supabase is not configured or the token is missing/invalid.
 */
export async function supabaseForRequest(req: Request): Promise<AuthedSupabase | null> {
  if (!hasSupabaseServer()) return null;
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;

  const client = createClient(serverEnv.supabaseUrl, serverEnv.supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return { client, userId: data.user.id };
}
