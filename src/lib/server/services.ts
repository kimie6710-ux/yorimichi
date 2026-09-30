import "server-only";

import { getAIProvider } from "@/lib/ai";
import { findCopyProblems, leaksName, usesCrutch } from "@/lib/ai/title-lint";
import { distanceMeters, walkMinutes } from "@/lib/geo";
import type {
  InboxItem,
  LatLng,
  MapSpot,
  MyHistory,
  Place,
  PlacedSticker,
  SpotCopy,
  SpotDetail,
  Sticker,
} from "@/lib/types";
import { getStore, type SpotRow, type StickerRow, type TransferRow } from "./repo";

// ─────────────────────────────────────────────
// Rules (kept here so every store behaves the same)
// ─────────────────────────────────────────────
export const ON_SITE_METERS = 150;
const ON_SITE_AFTER_VISIT_MS = 24 * 60 * 60 * 1000;
const MAX_PLACED_PER_SPOT = 3;
const MAX_SENDS_PER_DAY = 3;
const ACTIVE_WITHIN_MS = 14 * 24 * 60 * 60 * 1000;
const RECEIVE_GAP_MS = 6 * 60 * 60 * 1000;

const now = () => new Date().toISOString();
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const uuid = () => crypto.randomUUID();

/** ~5km cells, used to prefer "another area" when sending. */
export function areaKey(p: LatLng): string {
  return `${Math.floor(p.latitude * 20)}:${Math.floor(p.longitude * 20)}`;
}

export class RuleError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

// ─────────────────────────────────────────────
// Users
// ─────────────────────────────────────────────
export async function touchUser(userId: string, at?: LatLng): Promise<void> {
  const store = getStore();
  const existing = await store.get("users", userId);
  await store.upsert("users", [
    {
      id: userId,
      area_key: at ? areaKey(at) : (existing?.area_key ?? null),
      last_active_at: now(),
      created_at: existing?.created_at ?? now(),
    },
  ]);
}

// ─────────────────────────────────────────────
// Spots
// ─────────────────────────────────────────────
function copyOf(row: SpotRow | undefined): SpotCopy | null {
  if (!row?.ai_copy) return null;
  return { copy: row.ai_copy, form: row.ai_copy_form ?? "", birdLine: row.ai_bird_line ?? "" };
}

function baseRow(p: Place, prev?: SpotRow): SpotRow {
  return {
    id: p.placeId,
    name: p.name,
    lat: p.location.latitude,
    lng: p.location.longitude,
    category: p.primaryTypeLabel,
    types: p.types.slice(0, 10),
    photo_name: p.photos[0]?.name ?? prev?.photo_name ?? null,
    address: p.address,
    ai_copy: prev?.ai_copy ?? null,
    ai_copy_form: prev?.ai_copy_form ?? null,
    ai_bird_line: prev?.ai_bird_line ?? null,
    ai_model: prev?.ai_model ?? null,
    ai_generated_at: prev?.ai_generated_at ?? null,
    area_key: areaKey(p.location),
    created_at: prev?.created_at ?? now(),
  };
}

/** Real places → map spots with their よるみち layer (copy + counts). */
export async function toMapSpots(places: Place[], userId: string | null): Promise<MapSpot[]> {
  const store = getStore();
  const ids = places.map((p) => p.placeId);
  if (ids.length === 0) return [];
  const [rows, stickers, visits, saves] = await Promise.all([
    store.find("spots", { in: { id: ids } }),
    store.find("stickers", { in: { spot_id: ids }, where: { origin: "found" } }),
    userId ? store.find("visits", { in: { spot_id: ids }, where: { user_id: userId } }) : Promise.resolve([]),
    userId ? store.find("spot_saves", { in: { spot_id: ids }, where: { user_id: userId } }) : Promise.resolve([]),
  ]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  // Keep basic info fresh without touching the AI layer.
  const stale = places.filter((p) => !byId.has(p.placeId));
  if (stale.length > 0) await store.upsert("spots", stale.map((p) => baseRow(p)));

  return places.map((place) => {
    const here = stickers.filter((s) => s.spot_id === place.placeId);
    return {
      place,
      copy: copyOf(byId.get(place.placeId)),
      placedCount: here.filter((s) => s.status === "placed" && s.owner_id !== userId).length,
      foundCount: here.length,
      visited: visits.some((v) => v.spot_id === place.placeId),
      saved: saves.some((v) => v.spot_id === place.placeId),
    };
  });
}

/** Give places without a copy their first line (AI), save it, and return the new copies. */
export async function seedCopies(places: Place[]): Promise<Map<string, SpotCopy>> {
  const store = getStore();
  const out = new Map<string, SpotCopy>();
  if (places.length === 0) return out;
  const existing = new Map((await store.find("spots", { in: { id: places.map((p) => p.placeId) } })).map((r) => [r.id, r]));
  const todo = places.filter((p) => !existing.get(p.placeId)?.ai_copy);
  for (const p of places) {
    const c = copyOf(existing.get(p.placeId));
    if (c) out.set(p.placeId, c);
  }
  if (todo.length === 0) return out;

  // Nearby copies already on the map, so the new ones don't echo them.
  const avoid = [...existing.values()].map((r) => r.ai_copy).filter((c): c is string => !!c).slice(0, 10);
  const ai = getAIProvider();
  const result = await ai.seedCopies({ places: todo, avoid });
  const byPlace = new Map(todo.map((p) => [p.placeId, p]));
  const problems = findCopyProblems(result.spots.map((s) => s.copy));
  if (problems.length) console.info("[seed] copy set is repetitive:", problems.join(" / "));

  const rows: SpotRow[] = [];
  for (const s of result.spots) {
    const place = byPlace.get(s.placeId);
    if (!place || out.has(place.placeId)) continue;
    const copy = s.copy.replace(/\s+/g, " ").trim().slice(0, 32);
    if (!copy || leaksName(copy, place.name) || usesCrutch(copy)) continue;
    const bird = s.birdLine.trim().slice(0, 18);
    out.set(place.placeId, { copy, form: s.form, birdLine: bird });
    rows.push({
      ...baseRow(place, existing.get(place.placeId)),
      ai_copy: copy,
      ai_copy_form: s.form,
      ai_bird_line: bird,
      ai_model: ai.model,
      ai_generated_at: now(),
    });
  }
  await store.upsert("spots", rows);
  return out;
}

async function isOnSite(userId: string | null, spot: SpotRow, at: LatLng | null): Promise<boolean> {
  if (at && distanceMeters(at, { latitude: spot.lat, longitude: spot.lng }) <= ON_SITE_METERS) return true;
  if (!userId) return false;
  const recent = await getStore().count("visits", { where: { user_id: userId, spot_id: spot.id }, gte: { created_at: ago(ON_SITE_AFTER_VISIT_MS) } });
  return recent > 0;
}

export async function spotDetail(spotId: string, place: Place, userId: string | null, at: LatLng | null): Promise<SpotDetail> {
  const store = getStore();
  const [spot] = await toMapSpots([place], userId);
  const row = (await store.get("spots", spotId)) ?? baseRow(place);
  const onSite = await isOnSite(userId, row, at);
  const found = await store.find("stickers", { where: { spot_id: spotId, origin: "found" }, order: { key: "created_at" } });
  const placedRows = found.filter((s) => s.status === "placed");
  const urls = onSite ? await store.fileUrls(placedRows.map((s) => s.image_path)) : new Map<string, string>();

  if (onSite && userId) {
    // Count one view per person, for the "your sticker was seen" note.
    const others = placedRows.filter((s) => s.owner_id !== userId);
    if (others.length) {
      const seen = await store.find("sticker_views", { where: { viewer_id: userId }, in: { sticker_id: others.map((s) => s.id) } });
      const seenIds = new Set(seen.map((v) => v.sticker_id));
      const fresh = others.filter((s) => !seenIds.has(s.id));
      if (fresh.length) await store.insert("sticker_views", fresh.map((s) => ({ id: uuid(), sticker_id: s.id, viewer_id: userId, created_at: now() })));
    }
  }

  const placed: PlacedSticker[] = placedRows.map((s) => ({
    id: s.id,
    label: onSite ? s.label : "",
    memo: onSite ? s.memo : "",
    imageUrl: onSite ? (urls.get(s.image_path) ?? null) : null,
    rotation: s.rotation,
    mine: s.owner_id === userId,
    createdAt: s.created_at,
  }));
  const mine = userId ? await toStickers(found.filter((s) => s.owner_id === userId), userId) : [];
  return {
    spot,
    onSite,
    placed,
    foundLabels: onSite ? [...new Set(found.filter((s) => s.owner_id !== userId).map((s) => s.label))].slice(0, 12) : [],
    mine,
  };
}

export async function foundLabelsAt(spotId: string): Promise<string[]> {
  const found = await getStore().find("stickers", { where: { spot_id: spotId, origin: "found" }, limit: 60 });
  return [...new Set(found.map((s) => s.label))];
}

export async function toggleSave(userId: string, spotId: string, save: boolean): Promise<void> {
  const store = getStore();
  const rows = await store.find("spot_saves", { where: { user_id: userId, spot_id: spotId } });
  if (save && rows.length === 0) await store.insert("spot_saves", [{ id: uuid(), user_id: userId, spot_id: spotId, created_at: now() }]);
  if (!save) for (const r of rows) await store.remove("spot_saves", r.id);
}

export async function recordVisit(userId: string, spotId: string, at: LatLng | null): Promise<void> {
  const store = getStore();
  const spot = await store.get("spots", spotId);
  if (!spot) throw new RuleError("スポットが見つかりません", 404);
  const near = at ? distanceMeters(at, { latitude: spot.lat, longitude: spot.lng }) <= ON_SITE_METERS : false;
  await store.insert("visits", [{ id: uuid(), user_id: userId, spot_id: spotId, method: near ? "gps" : "manual", created_at: now() }]);
}

/** Rebuild a Place from what we stored (used for spots reached from a sticker). */
export function placeFromRow(row: SpotRow, origin: LatLng | null): Place {
  const location = { latitude: row.lat, longitude: row.lng };
  const d = origin ? distanceMeters(origin, location) : 0;
  return {
    placeId: row.id,
    name: row.name,
    primaryType: row.types[0] ?? null,
    primaryTypeLabel: row.category,
    types: row.types,
    location,
    address: row.address,
    rating: null,
    userRatingCount: null,
    priceLevel: null,
    openNow: null,
    businessStatus: null,
    editorialSummary: null,
    attributes: [],
    photos: row.photo_name ? [{ name: row.photo_name, widthPx: null, heightPx: null, authorAttributions: [] }] : [],
    googleMapsUri: null,
    reviews: [],
    weekdayHours: [],
    websiteUri: null,
    distanceMeters: Math.round(d),
    walkMinutes: walkMinutes(d),
    isMock: row.id.startsWith("mock_"),
  };
}

export async function getSpotRow(id: string): Promise<SpotRow | null> {
  return getStore().get("spots", id);
}

// ─────────────────────────────────────────────
// Stickers
// ─────────────────────────────────────────────
async function toStickers(rows: StickerRow[], viewerId: string): Promise<Sticker[]> {
  const store = getStore();
  if (rows.length === 0) return [];
  const spotIds = [...new Set(rows.map((r) => r.spot_id))];
  const obsIds = [...new Set(rows.map((r) => r.observation_id).filter((x): x is string => !!x))];
  const [spots, observations, views, visits] = await Promise.all([
    store.find("spots", { in: { id: spotIds } }),
    obsIds.length ? store.find("observations", { in: { id: obsIds } }) : Promise.resolve([]),
    store.find("sticker_views", { in: { sticker_id: rows.map((r) => r.id) } }),
    store.find("visits", { where: { user_id: viewerId }, in: { spot_id: spotIds } }),
  ]);
  // The real name stays hidden until you've been there yourself.
  const been = new Set(visits.map((v) => v.spot_id));
  const spotBy = new Map(spots.map((s) => [s.id, s]));
  const obsBy = new Map(observations.map((o) => [o.id, o]));
  const photoPaths = rows
    .map((r) => (r.observation_id && r.creator_id === viewerId ? obsBy.get(r.observation_id)?.photo_path : null))
    .filter((p): p is string => !!p);
  const urls = await store.fileUrls([...rows.map((r) => r.image_path), ...photoPaths]);
  return rows.map((r) => {
    const spot = spotBy.get(r.spot_id);
    const photo = r.observation_id && r.creator_id === viewerId ? obsBy.get(r.observation_id)?.photo_path : null;
    return {
      id: r.id,
      spotId: r.spot_id,
      spotName: r.creator_id === viewerId || been.has(r.spot_id) ? (spot?.name ?? "") : "",
      spotCopy: spot?.ai_copy ?? null,
      spotLocation: { latitude: spot?.lat ?? 0, longitude: spot?.lng ?? 0 },
      label: r.label,
      memo: r.memo,
      imageUrl: urls.get(r.image_path) ?? "",
      photoUrl: photo ? (urls.get(photo) ?? null) : null,
      rotation: r.rotation,
      origin: r.origin,
      status: r.status,
      placedAt: r.placed_at,
      seenCount: views.filter((v) => v.sticker_id === r.id).length,
      createdAt: r.created_at,
    };
  });
}

export async function createStickers(input: {
  userId: string;
  spotId: string;
  memo: string;
  photo: Blob | null;
  items: { blob: Blob; label: string; rotation: number }[];
}): Promise<Sticker[]> {
  const store = getStore();
  const spot = await store.get("spots", input.spotId);
  if (!spot) throw new RuleError("スポットが見つかりません", 404);
  const obsId = uuid();
  const dir = `${input.userId}/${obsId}`;
  let photoPath: string | null = null;
  if (input.photo) {
    photoPath = `${dir}/photo.jpg`;
    await store.putFile(photoPath, input.photo, input.photo.type || "image/jpeg");
  }
  await store.insert("observations", [
    { id: obsId, user_id: input.userId, spot_id: spot.id, photo_path: photoPath, label: input.items[0].label, memo: input.memo, created_at: now() },
  ]);
  const rows: StickerRow[] = [];
  for (const it of input.items) {
    const id = uuid();
    const path = `${dir}/${id}.png`;
    await store.putFile(path, it.blob, "image/png");
    rows.push({
      id,
      observation_id: obsId,
      spot_id: spot.id,
      owner_id: input.userId,
      creator_id: input.userId,
      image_path: path,
      rotation: it.rotation,
      label: it.label,
      memo: input.memo,
      origin: "found",
      status: "kept",
      placed_at: null,
      source_sticker_id: null,
      created_at: now(),
    });
  }
  await store.insert("stickers", rows);
  return toStickers(rows, input.userId);
}

export async function listMyStickers(userId: string): Promise<Sticker[]> {
  const rows = await getStore().find("stickers", { where: { owner_id: userId }, order: { key: "created_at" }, limit: 500 });
  return toStickers(rows, userId);
}

async function ownSticker(userId: string, id: string): Promise<StickerRow> {
  const row = await getStore().get("stickers", id);
  if (!row || row.owner_id !== userId) throw new RuleError("シールが見つかりません", 404);
  return row;
}

export async function updateMemo(userId: string, id: string, memo: string): Promise<Sticker> {
  const row = await ownSticker(userId, id);
  if (row.creator_id !== userId) throw new RuleError("届いたシールのメモは変えられません", 403);
  await getStore().update("stickers", id, { memo });
  return (await toStickers([{ ...row, memo }], userId))[0];
}

/** Leave your own sticker at the spot where you made it. */
export async function placeSticker(userId: string, id: string, at: LatLng | null): Promise<Sticker> {
  const store = getStore();
  const row = await ownSticker(userId, id);
  if (row.origin !== "found") throw new RuleError("置けるのは、自分が見つけたシールだけです");
  if (row.status !== "kept") throw new RuleError("このシールはもう手もとにありません");
  const spot = await store.get("spots", row.spot_id);
  if (!spot) throw new RuleError("スポットが見つかりません", 404);
  if (!(await isOnSite(userId, spot, at))) throw new RuleError("この場所の近くにいるときだけ置けます", 403);
  const already = await store.count("stickers", { where: { owner_id: userId, spot_id: spot.id, status: "placed" } });
  if (already >= MAX_PLACED_PER_SPOT) throw new RuleError(`ひとつの場所に置けるのは${MAX_PLACED_PER_SPOT}枚までです`);
  const placedAt = now();
  await store.update("stickers", id, { status: "placed", placed_at: placedAt });
  return (await toStickers([{ ...row, status: "placed", placed_at: placedAt }], userId))[0];
}

// ─────────────────────────────────────────────
// Sending (simple random delivery with a few guards)
// ─────────────────────────────────────────────

/** Pick someone who hasn't been to the spot, is active, and hasn't just received something. */
async function pickReceiver(sticker: StickerRow, senderId: string): Promise<string | null> {
  const store = getStore();
  const [users, visits, recent, holders] = await Promise.all([
    store.find("users", { gte: { last_active_at: ago(ACTIVE_WITHIN_MS) } }),
    store.find("visits", { where: { spot_id: sticker.spot_id } }),
    store.find("sticker_transfers", { gte: { delivered_at: ago(RECEIVE_GAP_MS) } }),
    store.find("stickers", { where: { source_sticker_id: sticker.id } }),
  ]);
  const excluded = new Set<string>([
    senderId,
    sticker.creator_id,
    ...visits.map((v) => v.user_id),
    ...recent.map((t) => t.receiver_id).filter((x): x is string => !!x),
    ...holders.map((h) => h.owner_id),
  ]);
  const candidates = users.filter((u) => !excluded.has(u.id));
  if (candidates.length === 0) return null;
  const spot = await store.get("spots", sticker.spot_id);
  const elsewhere = candidates.filter((u) => u.area_key && u.area_key !== spot?.area_key);
  const pool = elsewhere.length > 0 ? elsewhere : candidates;
  return pool[Math.floor(Math.random() * pool.length)].id;
}

async function deliver(transfer: TransferRow, receiverId: string): Promise<void> {
  const store = getStore();
  const original = await store.get("stickers", transfer.sticker_id);
  if (!original) return;
  const copyId = uuid();
  await store.insert("stickers", [
    {
      ...original,
      id: copyId,
      observation_id: null,
      owner_id: receiverId,
      origin: "received",
      status: "kept",
      placed_at: null,
      source_sticker_id: original.source_sticker_id ?? original.id,
      created_at: now(),
    },
  ]);
  await store.update("sticker_transfers", transfer.id, { receiver_id: receiverId, copy_id: copyId, status: "delivered", delivered_at: now() });
}

/** Something comes back to the sender: a random sticker someone else found. */
async function pickReturnFor(userId: string): Promise<StickerRow | null> {
  const store = getStore();
  const [pool, mine] = await Promise.all([
    store.find("stickers", { where: { origin: "found" }, order: { key: "created_at" }, limit: 300 }),
    store.find("stickers", { where: { owner_id: userId } }),
  ]);
  const have = new Set(mine.map((s) => s.source_sticker_id ?? s.id));
  const options = pool.filter((s) => s.creator_id !== userId && !have.has(s.id));
  return options.length ? options[Math.floor(Math.random() * options.length)] : null;
}

export async function sendSticker(userId: string, id: string): Promise<{ delivered: boolean; sticker: Sticker }> {
  const store = getStore();
  const row = await ownSticker(userId, id);
  if (row.origin !== "found") throw new RuleError("送れるのは、自分が見つけたシールだけです");
  if (row.status !== "kept") throw new RuleError("このシールはもう手もとにありません");
  const today = await store.count("sticker_transfers", { where: { sender_id: userId, kind: "send" }, gte: { created_at: ago(24 * 60 * 60 * 1000) } });
  if (today >= MAX_SENDS_PER_DAY) throw new RuleError(`送り出せるのは1日${MAX_SENDS_PER_DAY}枚までです`, 429);

  const transfer: TransferRow = {
    id: uuid(),
    sticker_id: row.id,
    copy_id: null,
    sender_id: userId,
    receiver_id: null,
    kind: "send",
    status: "pending",
    created_at: now(),
    delivered_at: null,
    opened_at: null,
  };
  await store.insert("sticker_transfers", [transfer]);
  await store.update("stickers", row.id, { status: "sent" });

  const receiver = await pickReceiver(row, userId);
  if (receiver) await deliver(transfer, receiver);

  // Something comes back.
  const back = await pickReturnFor(userId);
  if (back) {
    const ret: TransferRow = { ...transfer, id: uuid(), sticker_id: back.id, sender_id: back.creator_id, kind: "return" };
    await store.insert("sticker_transfers", [ret]);
    await deliver(ret, userId);
  }
  return { delivered: !!receiver, sticker: (await toStickers([{ ...row, status: "sent" }], userId))[0] };
}

/** Hand pending stickers (nobody was eligible when sent) to this user if they fit. */
async function deliverPendingTo(userId: string): Promise<void> {
  const store = getStore();
  const pending = await store.find("sticker_transfers", { where: { status: "pending", kind: "send" }, order: { key: "created_at", asc: true }, limit: 20 });
  const recent = await store.count("sticker_transfers", { where: { receiver_id: userId }, gte: { delivered_at: ago(RECEIVE_GAP_MS) } });
  if (recent > 0) return;
  for (const t of pending) {
    if (t.sender_id === userId) continue;
    const sticker = await store.get("stickers", t.sticker_id);
    if (!sticker || sticker.creator_id === userId) continue;
    const been = await store.count("visits", { where: { user_id: userId, spot_id: sticker.spot_id } });
    if (been > 0) continue;
    await deliver(t, userId);
    return; // one at a time
  }
}

export async function inbox(userId: string): Promise<InboxItem[]> {
  const store = getStore();
  await deliverPendingTo(userId);
  const transfers = await store.find("sticker_transfers", { where: { receiver_id: userId }, order: { key: "delivered_at" }, limit: 100 });
  const copies = await store.find("stickers", { in: { id: transfers.map((t) => t.copy_id).filter((x): x is string => !!x) } });
  const stickers = new Map((await toStickers(copies, userId)).map((s) => [s.id, s]));
  return transfers
    .filter((t) => t.copy_id && stickers.has(t.copy_id))
    .map((t) => ({ id: t.id, sticker: stickers.get(t.copy_id!)!, kind: t.kind, openedAt: t.opened_at, deliveredAt: t.delivered_at ?? t.created_at }));
}

export async function openInboxItem(userId: string, id: string): Promise<void> {
  const store = getStore();
  const t = await store.get("sticker_transfers", id);
  if (!t || t.receiver_id !== userId) throw new RuleError("見つかりません", 404);
  if (!t.opened_at) await store.update("sticker_transfers", id, { status: "opened", opened_at: now() });
}

export async function unreadCount(userId: string): Promise<number> {
  await deliverPendingTo(userId);
  return getStore().count("sticker_transfers", { where: { receiver_id: userId, status: "delivered" } });
}

export async function history(userId: string): Promise<MyHistory> {
  const store = getStore();
  const [visits, mine] = await Promise.all([
    store.find("visits", { where: { user_id: userId }, order: { key: "created_at" }, limit: 200 }),
    listMyStickers(userId),
  ]);
  const spots = new Map((await store.find("spots", { in: { id: [...new Set(visits.map((v) => v.spot_id))] } })).map((s) => [s.id, s]));
  const seen = new Set<string>();
  const visited = visits
    .filter((v) => (seen.has(v.spot_id) ? false : (seen.add(v.spot_id), true)))
    .map((v) => ({ spotId: v.spot_id, name: spots.get(v.spot_id)?.name ?? "", copy: spots.get(v.spot_id)?.ai_copy ?? null, at: v.created_at }));
  return {
    visited,
    placed: mine.filter((s) => s.status === "placed"),
    sent: mine.filter((s) => s.status === "sent"),
    received: mine.filter((s) => s.origin === "received"),
  };
}
