import "server-only";

import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import type { Query, Store, TableName, Tables } from "./types";

/**
 * File-backed store for development / single-machine use (no Supabase).
 * Everything lives in ./.data — shared by every device that talks to this
 * server, so a PC and a phone can place / send stickers to each other.
 */
const ROOT = path.join(process.cwd(), ".data");
const DB_FILE = path.join(ROOT, "db.json");
const FILES = path.join(ROOT, "files");

type Db = { [N in TableName]: Tables[N][] };
const EMPTY: Db = {
  users: [],
  spots: [],
  visits: [],
  spot_saves: [],
  observations: [],
  stickers: [],
  sticker_transfers: [],
  sticker_views: [],
  book_pages: [],
  book_decos: [],
  vision_memory: [],
};

const g = globalThis as unknown as { __yorumichiDb?: Promise<Db>; __yorumichiWrite?: Promise<void>; __yorumichiSave?: Promise<void> };
const SAVE_DELAY_MS = 300;

function load(): Promise<Db> {
  g.__yorumichiDb ??= readFile(DB_FILE, "utf8")
    .then((raw) => ({ ...EMPTY, ...(JSON.parse(raw) as Partial<Db>) }))
    .catch(() => structuredClone(EMPTY));
  // Tables added after the file was first loaded (dev hot reload).
  return g.__yorumichiDb.then((db) => {
    for (const k of Object.keys(EMPTY) as TableName[]) (db as Record<string, unknown[]>)[k] ??= [];
    return db;
  });
}

/**
 * Save to disk. Writes that come in quick succession (dragging in the notebook,
 * several rows in one request) are folded into one; the in-memory copy is the
 * source of truth meanwhile. Write-then-rename so a crash never leaves half a file.
 */
function persist(db: Db): Promise<void> {
  g.__yorumichiSave ??= new Promise<void>((resolve, reject) => {
    setTimeout(() => {
      g.__yorumichiSave = undefined;
      g.__yorumichiWrite = (g.__yorumichiWrite ?? Promise.resolve())
        .then(async () => {
          await mkdir(ROOT, { recursive: true });
          const tmp = `${DB_FILE}.tmp`;
          await writeFile(tmp, JSON.stringify(db));
          await rename(tmp, DB_FILE);
        })
        .then(resolve, reject);
    }, SAVE_DELAY_MS);
  });
  return g.__yorumichiSave;
}

function matches<T>(row: T, q: Query<T> = {}): boolean {
  for (const [k, v] of Object.entries(q.where ?? {})) if ((row as Record<string, unknown>)[k] !== v) return false;
  for (const [k, vs] of Object.entries(q.in ?? {})) if (!(vs as unknown[]).includes((row as Record<string, unknown>)[k])) return false;
  for (const [k, v] of Object.entries(q.gte ?? {})) {
    const cur = (row as Record<string, unknown>)[k] as string | number | null;
    if (cur === null || cur === undefined || cur < (v as string | number)) return false;
  }
  return true;
}

function safePath(p: string): string {
  const full = path.join(FILES, p);
  if (!full.startsWith(FILES + path.sep)) throw new Error("bad path");
  return full;
}

export class LocalStore implements Store {
  readonly kind = "local" as const;

  async find<N extends TableName>(table: N, q: Query<Tables[N]> = {}): Promise<Tables[N][]> {
    const db = await load();
    let rows = (db[table] as Tables[N][]).filter((r) => matches(r, q));
    if (q.order) {
      const { key, asc = false } = q.order;
      rows = [...rows].sort((a, b) => {
        const x = a[key] as unknown as string, y = b[key] as unknown as string;
        return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1);
      });
    }
    return structuredClone(q.limit ? rows.slice(0, q.limit) : rows);
  }

  async get<N extends TableName>(table: N, id: string): Promise<Tables[N] | null> {
    const db = await load();
    const row = (db[table] as (Tables[N] & { id: string })[]).find((r) => r.id === id);
    return row ? structuredClone(row) : null;
  }

  async insert<N extends TableName>(table: N, rows: Tables[N][]): Promise<void> {
    const db = await load();
    (db[table] as Tables[N][]).push(...structuredClone(rows));
    await persist(db);
  }

  async upsert<N extends TableName>(table: N, rows: Tables[N][]): Promise<void> {
    const db = await load();
    const list = db[table] as (Tables[N] & { id: string })[];
    for (const r of rows as (Tables[N] & { id: string })[]) {
      const i = list.findIndex((x) => x.id === r.id);
      if (i >= 0) list[i] = structuredClone(r);
      else list.push(structuredClone(r));
    }
    await persist(db);
  }

  async update<N extends TableName>(table: N, id: string, patch: Partial<Tables[N]>): Promise<void> {
    const db = await load();
    const row = (db[table] as (Tables[N] & { id: string })[]).find((r) => r.id === id);
    if (!row) return;
    Object.assign(row, patch);
    await persist(db);
  }

  async remove<N extends TableName>(table: N, id: string): Promise<void> {
    const db = await load();
    (db as Record<string, { id: string }[]>)[table] = (db[table] as { id: string }[]).filter((r) => r.id !== id);
    await persist(db);
  }

  async count<N extends TableName>(table: N, q?: Query<Tables[N]>): Promise<number> {
    return (await this.find(table, q)).length;
  }

  async putFile(p: string, data: Blob): Promise<void> {
    const full = safePath(p);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, Buffer.from(await data.arrayBuffer()));
  }

  async fileUrl(p: string): Promise<string> {
    return versionedUrl(p);
  }

  async fileUrls(paths: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(paths)];
    return new Map(await Promise.all(unique.map(async (p) => [p, await versionedUrl(p)] as const)));
  }

  static async readFile(p: string): Promise<Buffer | null> {
    try {
      return await readFile(safePath(p));
    } catch {
      return null;
    }
  }
}

/** Files are served as immutable; the mtime in the URL makes a rewritten file (e.g. a new border) load fresh. */
async function versionedUrl(p: string): Promise<string> {
  try {
    return `/api/files/${p}?v=${Math.floor((await stat(safePath(p))).mtimeMs).toString(36)}`;
  } catch {
    // Missing file: a fresh version tag anyway, so nothing old sticks in the cache.
    return `/api/files/${p}?v=${Date.now().toString(36)}`;
  }
}
