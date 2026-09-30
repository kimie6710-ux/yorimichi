import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { serverEnv } from "@/lib/server/env";
import type { Query, Store, TableName, Tables } from "./types";

const SIGNED_URL_TTL = 60 * 60;

/**
 * Supabase-backed store. Runs on the server with the service-role key because
 * placing / sending stickers crosses users (the API routes check ownership and
 * distance before every write). The key never reaches the browser.
 */
export class SupabaseStore implements Store {
  readonly kind = "supabase" as const;
  private readonly db: SupabaseClient;

  constructor() {
    this.db = createClient(serverEnv.supabaseUrl, serverEnv.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  private build<N extends TableName>(table: N, q: Query<Tables[N]> = {}, head = false) {
    let s = this.db.from(table).select("*", head ? { count: "exact", head: true } : undefined);
    for (const [k, v] of Object.entries(q.where ?? {})) s = v === null ? s.is(k, null) : s.eq(k, v as never);
    for (const [k, vs] of Object.entries(q.in ?? {})) s = s.in(k, vs as never[]);
    for (const [k, v] of Object.entries(q.gte ?? {})) s = s.gte(k, v as never);
    if (q.order) s = s.order(String(q.order.key), { ascending: q.order.asc ?? false });
    if (q.limit) s = s.limit(q.limit);
    return s;
  }

  async find<N extends TableName>(table: N, q?: Query<Tables[N]>): Promise<Tables[N][]> {
    const { data, error } = await this.build(table, q);
    if (error) throw new Error(`[supabase:${table}] ${error.message}`);
    return (data ?? []) as Tables[N][];
  }

  async get<N extends TableName>(table: N, id: string): Promise<Tables[N] | null> {
    const { data, error } = await this.db.from(table).select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(`[supabase:${table}] ${error.message}`);
    return (data as Tables[N]) ?? null;
  }

  async insert<N extends TableName>(table: N, rows: Tables[N][]): Promise<void> {
    if (rows.length === 0) return;
    const { error } = await this.db.from(table).insert(rows as never[]);
    if (error) throw new Error(`[supabase:${table}] ${error.message}`);
  }

  async upsert<N extends TableName>(table: N, rows: Tables[N][]): Promise<void> {
    if (rows.length === 0) return;
    const { error } = await this.db.from(table).upsert(rows as never[]);
    if (error) throw new Error(`[supabase:${table}] ${error.message}`);
  }

  async update<N extends TableName>(table: N, id: string, patch: Partial<Tables[N]>): Promise<void> {
    const { error } = await this.db.from(table).update(patch as never).eq("id", id);
    if (error) throw new Error(`[supabase:${table}] ${error.message}`);
  }

  async remove<N extends TableName>(table: N, id: string): Promise<void> {
    const { error } = await this.db.from(table).delete().eq("id", id);
    if (error) throw new Error(`[supabase:${table}] ${error.message}`);
  }

  async count<N extends TableName>(table: N, q?: Query<Tables[N]>): Promise<number> {
    const { count, error } = await this.build(table, q, true);
    if (error) throw new Error(`[supabase:${table}] ${error.message}`);
    return count ?? 0;
  }

  async putFile(path: string, data: Blob, contentType: string): Promise<void> {
    const { error } = await this.db.storage.from(serverEnv.storageBucket).upload(path, data, { contentType });
    if (error) throw new Error(`[supabase:storage] ${error.message}`);
  }

  async fileUrl(path: string): Promise<string> {
    return (await this.fileUrls([path])).get(path) ?? "";
  }

  async fileUrls(paths: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const unique = [...new Set(paths)];
    if (unique.length === 0) return out;
    const { data } = await this.db.storage.from(serverEnv.storageBucket).createSignedUrls(unique, SIGNED_URL_TTL);
    for (const s of data ?? []) if (s.path && s.signedUrl) out.set(s.path, s.signedUrl);
    return out;
  }
}
