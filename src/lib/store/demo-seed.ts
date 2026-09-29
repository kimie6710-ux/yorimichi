"use client";

// development-only: when NEXT_PUBLIC_USE_MOCK_DATA=true, the sticker book starts
// with a few entries so the demo looks like an app that's already been used.
// Never runs in production (isMockModeServer() / the NEXT_PUBLIC flag gate it).

import { publicConfig } from "@/lib/config";
import { canvasToBlob, emojiSticker } from "@/lib/sticker/render";
import type { LatLng } from "@/lib/types";
import { localDb, type LocalStickerRecord } from "./local-db";

const SEEDED_KEY = "yorumichi:demoSeeded:v3";
const DAY = 24 * 60 * 60 * 1000;

type Seed = Omit<LocalStickerRecord, "id" | "createdAt" | "photo" | "sticker" | "latitude" | "longitude"> & {
  /** Offset (north, east) in meters from the user's real location — same as the mock places. */
  offset: [number, number];
};

const SEEDS: Seed[] = [
  {
    placeId: "mock_chuka",
    recommendationId: null,
    realName: "福来軒",
    aiTitle: "漫画を待つための町中華",
    query: "本屋行きたい",
    reaction: "kind_of",
    rotation: -4.5,
    offset: [320, -180],
    address: null,
  },
  {
    placeId: "mock_shrine",
    recommendationId: null,
    realName: "路地裏稲荷神社",
    aiTitle: "昼でも誰もいない木陰の奥",
    query: "落ち着きたい",
    reaction: "totally_get_it",
    rotation: 3.2,
    offset: [480, 390],
    address: null,
  },
  {
    placeId: "mock_laundry",
    recommendationId: null,
    realName: "コインランドリー朝顔",
    aiTitle: "夜だけ瞑想室になる洗濯場",
    query: "一人になりたい",
    reaction: "totally_off",
    rotation: -2.4,
    offset: [-280, -90],
    address: null,
  },
];

async function seedSticker(placeId: string): Promise<Blob | null> {
  const canvas = emojiSticker(SEED_EMOJI[placeId] ?? "📍");
  return canvas ? canvasToBlob(canvas).catch(() => null) : null;
}

/** Stand-ins for "the object you cut out of your photo" (ramen bowl, torii, bubbles). */
const SEED_EMOJI: Record<string, string> = {
  mock_chuka: "🍜",
  mock_shrine: "⛩️",
  mock_laundry: "🫧",
};

let seeding: Promise<void> | null = null;

/** Safe to call concurrently: every caller awaits the same seeding run. */
export function seedDemoCollectionOnce(origin: LatLng | null): Promise<void> {
  // Seeds are placed around the user's real location, so wait until we have it.
  if (!origin || !publicConfig.useMockData) return Promise.resolve();
  seeding ??= seed(origin);
  return seeding;
}

const M_PER_DEG_LAT = 111_320;
function offsetFrom(origin: LatLng, [north, east]: [number, number]): LatLng {
  const mPerDegLng = M_PER_DEG_LAT * Math.cos((origin.latitude * Math.PI) / 180);
  return { latitude: origin.latitude + north / M_PER_DEG_LAT, longitude: origin.longitude + east / mPerDegLng };
}

async function seed(origin: LatLng): Promise<void> {
  try {
    if (window.localStorage.getItem(SEEDED_KEY)) return;
    window.localStorage.setItem(SEEDED_KEY, "1");
  } catch {
    return;
  }
  // Replace any earlier demo seeds (older card-style stickers).
  const seedIds = new Set(SEEDS.map((s) => s.placeId));
  const existing = await localDb.listCollections().catch(() => []);
  for (const rec of existing) {
    if (rec.recommendationId === null && seedIds.has(rec.placeId)) await localDb.deleteCollection(rec.id);
  }
  const now = Date.now();
  for (const [i, seed] of SEEDS.entries()) {
    const { offset, ...rest } = seed;
    await localDb.putCollection({
      ...rest,
      ...offsetFrom(origin, offset),
      id: crypto.randomUUID(),
      createdAt: new Date(now - (i + 1) * 3 * DAY).toISOString(),
      photo: null,
      sticker: await seedSticker(seed.placeId),
    });
  }
}
