import "server-only";

import { hasSupabaseServer } from "@/lib/server/env";
import { LocalStore } from "./local";
import { SupabaseStore } from "./supabase";
import type { Store } from "./types";

let store: Store | null = null;

/** Supabase when fully configured (URL + anon + service role), otherwise ./.data on this machine. */
export function getStore(): Store {
  store ??= hasSupabaseServer() ? new SupabaseStore() : new LocalStore();
  return store;
}

export type * from "./types";
