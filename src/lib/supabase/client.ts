"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { hasSupabase, publicConfig } from "@/lib/config";

let client: SupabaseClient | null = null;
let signingIn: Promise<string | null> | null = null;

export function getBrowserSupabase(): SupabaseClient | null {
  if (!hasSupabase()) return null;
  if (!client) {
    client = createClient(publicConfig.supabaseUrl, publicConfig.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return client;
}

/**
 * Returns an access token for the current anonymous user, signing in lazily
 * the first time. Returns null when Supabase isn't configured or sign-in fails
 * (the app then keeps everything on-device).
 */
export async function getAccessToken(): Promise<string | null> {
  const sb = getBrowserSupabase();
  if (!sb) return null;

  const { data } = await sb.auth.getSession();
  if (data.session) return data.session.access_token;

  signingIn ??= sb.auth
    .signInAnonymously()
    .then(({ data: d, error }) => {
      if (error) {
        console.warn("[supabase] anonymous sign-in failed:", error.message);
        return null;
      }
      return d.session?.access_token ?? null;
    })
    .finally(() => {
      signingIn = null;
    });
  return signingIn;
}
