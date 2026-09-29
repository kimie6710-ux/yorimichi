import "server-only";

// Server-only configuration. Never import this from a client component.

export type AIProviderName = "anthropic" | "mock";

export const serverEnv = {
  /** Server-side key for Places API (New). Falls back to the browser key if you only use one. */
  placesApiKey:
    process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
  aiProvider: (process.env.AI_PROVIDER ?? "anthropic") as AIProviderName,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  /** Final interpretation model. */
  anthropicModel: process.env.ANTHROPIC_MODEL || "claude-opus-5",
  /** Stage-1 shortlist model (latency-sensitive, runs on basic info only). */
  anthropicShortlistModel: process.env.ANTHROPIC_SHORTLIST_MODEL || "claude-haiku-4-5",
  anthropicEffort: (process.env.ANTHROPIC_EFFORT ?? "low") as "low" | "medium" | "high",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  storageBucket: process.env.SUPABASE_STORAGE_BUCKET || "stickers",
  removeBgApiKey: process.env.REMOVE_BG_API_KEY ?? "",
};

/**
 * development-only mock switch.
 * Mock spots must NEVER reach production users, so on Vercel production the
 * flag is ignored even if someone sets it by mistake.
 */
export function isMockModeServer(): boolean {
  const requested = process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true";
  if (!requested) return false;
  if (process.env.VERCEL_ENV === "production") {
    console.warn("[mock] NEXT_PUBLIC_USE_MOCK_DATA is ignored in production.");
    return false;
  }
  return true;
}

export const hasSupabaseServer = () =>
  serverEnv.supabaseUrl.length > 0 && serverEnv.supabaseAnonKey.length > 0;
