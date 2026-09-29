"use client";

import { ApiClientError, getStickers, postReaction, postStickers } from "@/lib/api-client";
import { hasSupabase } from "@/lib/config";
import type { LatLng, NewStickersInput, StickerItem, UserReaction } from "@/lib/types";
import { seedDemoCollectionOnce } from "./demo-seed";
import { localDb, type LocalStickerRecord } from "./local-db";

export type SaveResult = { items: StickerItem[]; where: "cloud" | "device" };

const objectUrls = new Map<string, string>();
function blobUrl(key: string, blob: Blob | null): string | null {
  if (!blob) return null;
  const existing = objectUrls.get(key);
  if (existing) return existing;
  const url = URL.createObjectURL(blob);
  objectUrls.set(key, url);
  return url;
}

function fromLocal(rec: LocalStickerRecord): StickerItem {
  const { photo, sticker, ...rest } = rec;
  return {
    ...rest,
    photoUrl: blobUrl(`${rec.id}:photo`, photo),
    stickerUrl: blobUrl(`${rec.id}:sticker`, sticker),
  };
}

async function saveLocally(input: NewStickersInput): Promise<StickerItem[]> {
  const { photo, stickers, ...meta } = input;
  const createdAt = new Date().toISOString();
  const records: LocalStickerRecord[] = stickers.map((s) => ({
    ...meta,
    id: crypto.randomUUID(),
    rotation: s.rotation,
    createdAt,
    photo,
    sticker: s.blob,
  }));
  for (const r of records) await localDb.putCollection(r);
  return records.map(fromLocal);
}

/** Cloud first (Supabase), device as fallback. Never loses a sticker. */
export async function saveStickers(input: NewStickersInput): Promise<SaveResult> {
  if (hasSupabase()) {
    try {
      const { items } = await postStickers(input);
      return { items, where: "cloud" };
    } catch (err) {
      console.warn("[stickers] cloud save failed, saving on device:", err);
    }
  }
  return { items: await saveLocally(input), where: "device" };
}

export async function listStickers(
  origin: LatLng | null = null,
): Promise<{ items: StickerItem[]; cloudError: string | null }> {
  await seedDemoCollectionOnce(origin).catch(() => undefined);
  const local = await localDb.listCollections().catch(() => [] as LocalStickerRecord[]);
  let cloud: StickerItem[] = [];
  let cloudError: string | null = null;
  if (hasSupabase()) {
    try {
      cloud = (await getStickers()).items;
    } catch (err) {
      cloudError = err instanceof ApiClientError ? err.message : "読み込みに失敗しました";
    }
  }
  const items = [...cloud, ...local.map(fromLocal)].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { items, cloudError };
}

export async function stickersAtPlace(placeId: string): Promise<StickerItem[]> {
  const { items } = await listStickers(null);
  return items.filter((i) => i.placeId === placeId && i.stickerUrl);
}

export async function recordReaction(input: {
  placeId: string;
  recommendationId: string | null;
  reaction: UserReaction;
}): Promise<void> {
  await localDb
    .putVisit({ id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...input })
    .catch(() => undefined);
  if (hasSupabase()) {
    try {
      await postReaction(input);
    } catch (err) {
      console.warn("[reaction] cloud save failed (kept on device):", err);
    }
  }
}
