"use client";

// On-device storage (IndexedDB). Used when Supabase is not configured, and as
// a safety net when an upload fails. Blobs are stored as-is.

import type { StickerItem, UserReaction } from "@/lib/types";

const DB_NAME = "yorumichi";
const DB_VERSION = 1;
const COLLECTIONS = "collections";
const VISITS = "visits";

export interface LocalStickerRecord extends Omit<StickerItem, "photoUrl" | "stickerUrl"> {
  photo: Blob | null;
  sticker: Blob | null;
}

export interface LocalVisitRecord {
  id: string;
  placeId: string;
  recommendationId: string | null;
  reaction: UserReaction;
  createdAt: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB unavailable"));
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(COLLECTIONS)) db.createObjectStore(COLLECTIONS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(VISITS)) db.createObjectStore(VISITS, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error("IndexedDB open failed"));
    };
  });
  return dbPromise;
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
      }),
  );
}

export const localDb = {
  putCollection: (rec: LocalStickerRecord) => tx(COLLECTIONS, "readwrite", (s) => s.put(rec)),
  listCollections: () =>
    tx<LocalStickerRecord[]>(COLLECTIONS, "readonly", (s) => s.getAll() as IDBRequest<LocalStickerRecord[]>),
  deleteCollection: (id: string) => tx(COLLECTIONS, "readwrite", (s) => s.delete(id)),
  putVisit: (rec: LocalVisitRecord) => tx(VISITS, "readwrite", (s) => s.put(rec)),
};
