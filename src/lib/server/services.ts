import "server-only";

import { getAIProvider } from "@/lib/ai";
import { copyIsUsable, pickVaried } from "@/lib/ai/title-lint";
import { distanceMeters, walkMinutes } from "@/lib/geo";
import { spotKind } from "@/lib/places/place-types";
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
import { demoNeighbours, isOwnerMode } from "./identity";
import { getStore, type SpotRow, type StickerRow, type TransferRow } from "./repo";

// ─────────────────────────────────────────────
// Rules (kept here so every store behaves the same)
// ─────────────────────────────────────────────
export const ON_SITE_METERS = 150;
const ON_SITE_AFTER_VISIT_MS = 24 * 60 * 60 * 1000;
const MAX_PLACED_PER_SPOT = 3;
const MAX_SENDS_PER_DAY = 3;
const ACTIVE_WITHIN_MS = 14 * 24 * 60 * 60 * 1000;
const TOUCH_EVERY_MS = 10 * 60 * 1000;
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
  // Saving rewrites the store; once every few minutes is plenty for "active".
  const area = at ? areaKey(at) : (existing?.area_key ?? null);
  if (existing && existing.area_key === area && Date.now() - Date.parse(existing.last_active_at) < TOUCH_EVERY_MS) return;
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

/** The line every screen shows for these spots: the stored copy, else a placed sticker's name. */
async function spotLines(spots: SpotRow[]): Promise<Map<string, string | null>> {
  const bare = spots.filter((s) => !s.ai_copy).map((s) => s.id);
  const found = bare.length ? await getStore().find("stickers", { in: { spot_id: bare }, where: { status: "placed" } }) : [];
  return new Map(spots.map((s) => [s.id, s.ai_copy ?? nicknameFromStickers(found.filter((f) => f.spot_id === s.id))?.copy ?? null]));
}

/** A spot without a line, named after the newest thing someone found there. */
function nicknameFromStickers(found: StickerRow[]): SpotCopy | null {
  // Only from stickers someone left there for others to see.
  const named = found
    .filter((s) => s.status === "placed" && s.label && s.label !== "見つけたもの")
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return named[0] ? { copy: named[0].label, form: "あだ名", birdLine: "" } : null;
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
    ai_copy_alts: prev?.ai_copy_alts ?? [],
    ai_bird_line: prev?.ai_bird_line ?? null,
    ai_model: prev?.ai_model ?? null,
    ai_generated_at: prev?.ai_generated_at ?? null,
    area_key: areaKey(p.location),
    created_at: prev?.created_at ?? now(),
  };
}

/** Before you've been there, the place stays a surprise — not just on screen, in what we send too. */
function veil(place: Place): Place {
  return {
    ...place,
    name: "",
    address: null,
    photos: [],
    reviews: [],
    editorialSummary: null,
    attributes: [],
    googleMapsUri: null,
    websiteUri: null,
    weekdayHours: [],
    rating: null,
    userRatingCount: null,
  };
}

/** Real places → map spots with their よりみち layer (copy + counts). */
export async function toMapSpots(places: Place[], userId: string | null, reveal: (placeId: string) => boolean = () => false): Promise<MapSpot[]> {
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
    const visited = visits.some((v) => v.spot_id === place.placeId);
    return {
      place: visited || reveal(place.placeId) ? place : veil(place),
      // No line yet but someone found something here: their sticker's name becomes the spot's nickname.
      copy: copyOf(byId.get(place.placeId)) ?? nicknameFromStickers(here),
      placedCount: here.filter((s) => s.status === "placed" && s.owner_id !== userId).length,
      foundCount: here.length,
      visited,
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
  const valid = result.spots.filter((s) => byPlace.has(s.placeId) && !out.has(s.placeId));
  const usable = valid.map((s) =>
    s.candidates
      .map((c) => ({ form: c.form, copy: c.copy.replace(/\\n/g, "\n").replace(/[ \t]+/g, " ").trim() }))
      .filter((c) => copyIsUsable(c.copy, byPlace.get(s.placeId)!.name)),
  );
  const picks = pickVaried(usable, avoid);

  const rows: SpotRow[] = [];
  valid.forEach((s, k) => {
    const place = byPlace.get(s.placeId)!;
    const pick = picks[k];
    if (!pick) return;
    const bird = s.birdLine.trim().slice(0, 18);
    out.set(place.placeId, { copy: pick.copy, form: pick.form, birdLine: bird });
    rows.push({
      ...baseRow(place, existing.get(place.placeId)),
      ai_copy: pick.copy,
      ai_copy_form: pick.form,
      ai_copy_alts: usable[k].map((c) => c.copy),
      ai_bird_line: bird,
      ai_model: ai.model,
      ai_generated_at: now(),
    });
  });
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
  const row = (await store.get("spots", spotId)) ?? baseRow(place);
  const onSite = await isOnSite(userId, row, at);
  const [spot] = await toMapSpots([place], userId, () => onSite);
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
  const lines = await spotLines(spots);
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
      spotCopy: lines.get(r.spot_id) ?? null,
      spotLocation: { latitude: spot?.lat ?? 0, longitude: spot?.lng ?? 0 },
      spotKind: spotKind(spot?.types ?? []),
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

export async function updateSticker(
  userId: string,
  id: string,
  patch: { memo?: string; label?: string },
): Promise<Sticker> {
  const row = await ownSticker(userId, id);
  const next: Partial<StickerRow> = {};
  if (patch.memo !== undefined) {
    if (row.creator_id !== userId) throw new RuleError("届いたシールのメモは変えられません", 403);
    next.memo = patch.memo;
  }
  if (patch.label !== undefined) {
    // Renaming also teaches the recogniser (its memory follows the sticker's current name).
    if (row.creator_id !== userId) throw new RuleError("届いたシールの名前は変えられません", 403);
    next.label = patch.label;
  }
  await getStore().update("stickers", id, next);
  return (await toStickers([{ ...row, ...next }], userId))[0];
}

// ─────────────────────────────────────────────
// Notebook pages
// ─────────────────────────────────────────────
export async function bookPages(userId: string): Promise<{ idx: number; bg: string }[]> {
  const rows = await getStore().find("book_pages", { where: { user_id: userId } });
  return rows.map((r) => ({ idx: r.idx, bg: r.bg })).sort((a, b) => a.idx - b.idx);
}

export async function saveBookPages(userId: string, pages: { idx: number; bg: string }[]): Promise<void> {
  await getStore().upsert(
    "book_pages",
    pages.map((p) => ({ id: `${userId}:${p.idx}`, user_id: userId, idx: p.idx, bg: p.bg })),
  );
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
  const demo = isOwnerMode();
  const [users, visits, recent, holders] = await Promise.all([
    // On the owner's own server the only other people are demo neighbours: always reachable.
    demo ? store.find("users", { in: { id: demoNeighbours() } }) : store.find("users", { gte: { last_active_at: ago(ACTIVE_WITHIN_MS) } }),
    store.find("visits", { where: { spot_id: sticker.spot_id } }),
    store.find("sticker_transfers", { gte: { delivered_at: ago(RECEIVE_GAP_MS) } }),
    store.find("stickers", { where: { source_sticker_id: sticker.id } }),
  ]);
  const excluded = new Set<string>([
    senderId,
    sticker.creator_id,
    ...visits.map((v) => v.user_id),
    ...(demo ? [] : recent.map((t) => t.receiver_id).filter((x): x is string => !!x)),
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
      // It arrives in the box, not at the sender's spot in their notebook.
      book_page: null,
      book_x: null,
      book_y: null,
      book_rot: null,
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
  // Only things people chose to share (left at a spot or sent off), never what they kept.
  const options = pool.filter((s) => s.creator_id !== userId && !have.has(s.id) && (s.status === "placed" || s.status === "sent"));
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

/** One delivery check per person at a time (inbox and its badge can ask together). */
const delivering = new Map<string, Promise<void>>();

function deliverPendingTo(userId: string): Promise<void> {
  const running = delivering.get(userId);
  if (running) return running;
  const job = deliverPendingNow(userId).finally(() => delivering.delete(userId));
  delivering.set(userId, job);
  return job;
}

/** Hand pending stickers (nobody was eligible when sent) to this user if they fit. */
async function deliverPendingNow(userId: string): Promise<void> {
  const store = getStore();
  const pending = await store.find("sticker_transfers", { where: { status: "pending", kind: "send" }, order: { key: "created_at", asc: true }, limit: 20 });
  const recent = await store.count("sticker_transfers", { where: { receiver_id: userId }, gte: { delivered_at: ago(RECEIVE_GAP_MS) } });
  if (recent > 0) return;
  for (const t of pending) {
    if (t.sender_id === userId) continue;
    // Re-read: another request may have just delivered it.
    if ((await store.get("sticker_transfers", t.id))?.status !== "pending") continue;
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
  const [visits, saves, mine] = await Promise.all([
    store.find("visits", { where: { user_id: userId }, order: { key: "created_at" }, limit: 200 }),
    store.find("spot_saves", { where: { user_id: userId }, order: { key: "created_at" }, limit: 200 }),
    listMyStickers(userId),
  ]);
  const ids = [...new Set([...visits.map((v) => v.spot_id), ...saves.map((s) => s.spot_id)])];
  const spotRows = await store.find("spots", { in: { id: ids } });
  const spots = new Map(spotRows.map((s) => [s.id, s]));
  const lines = await spotLines(spotRows);
  const been = new Set(visits.map((v) => v.spot_id));
  const seen = new Set<string>();
  const visited = visits
    .filter((v) => (seen.has(v.spot_id) ? false : (seen.add(v.spot_id), true)))
    .map((v) => ({ spotId: v.spot_id, name: spots.get(v.spot_id)?.name ?? "", copy: lines.get(v.spot_id) ?? null, at: v.created_at }));
  const saved = saves.map((s) => ({
    spotId: s.spot_id,
    name: been.has(s.spot_id) ? (spots.get(s.spot_id)?.name ?? null) : null,
    copy: lines.get(s.spot_id) ?? null,
    at: s.created_at,
  }));
  return {
    saved,
    visited,
    placed: mine.filter((s) => s.status === "placed"),
    sent: mine.filter((s) => s.status === "sent"),
    received: mine.filter((s) => s.origin === "received"),
  };
}

// ─────────────────────────────────────────────
// Notebook decorations (character stickers)
// ─────────────────────────────────────────────
type Pos = { page: number; x: number; y: number; rot: number };
const MAX_DECOS = 800;

export async function listDecos(userId: string) {
  const rows = await getStore().find("book_decos", { where: { user_id: userId }, order: { key: "created_at", asc: true } });
  return rows.map((r) => ({ id: r.id, kind: r.kind, pos: { page: r.page, x: r.x, y: r.y, rot: r.rot } }));
}

export async function addDeco(userId: string, kind: string, pos: Pos) {
  const store = getStore();
  if ((await store.count("book_decos", { where: { user_id: userId } })) >= MAX_DECOS) throw new RuleError("これ以上は貼れません");
  // Only your own stickers can be stuck in your notebook.
  if (kind.startsWith("sticker:")) await ownSticker(userId, kind.slice(8));
  const row = { id: uuid(), user_id: userId, kind, page: pos.page, x: pos.x, y: pos.y, rot: pos.rot, created_at: now() };
  await store.insert("book_decos", [row]);
  return { id: row.id, kind, pos };
}

async function ownDeco(userId: string, id: string) {
  const row = await getStore().get("book_decos", id);
  if (!row || row.user_id !== userId) throw new RuleError("見つかりません", 404);
  return row;
}

export async function moveDeco(userId: string, id: string, pos: Pos) {
  await ownDeco(userId, id);
  await getStore().update("book_decos", id, { page: pos.page, x: pos.x, y: pos.y, rot: pos.rot });
}

export async function removeDeco(userId: string, id: string) {
  await ownDeco(userId, id);
  await getStore().remove("book_decos", id);
}

// ─────────────────────────────────────────────
// Recognition memory: your own names for things you've cut out
// ─────────────────────────────────────────────
const MAX_MEMORY = 600;
const GENERIC_LABEL = "見つけたもの";

export async function listVisionMemory(userId: string) {
  const store = getStore();
  const rows = await store.find("vision_memory", { where: { user_id: userId }, order: { key: "created_at", asc: false }, limit: MAX_MEMORY });
  // A renamed sticker teaches the new name.
  const ids = rows.map((r) => r.sticker_id).filter((x): x is string => !!x);
  const stickers = ids.length ? await store.find("stickers", { in: { id: ids } }) : [];
  const current = new Map(stickers.map((s) => [s.id, s.label]));
  return rows
    .map((r) => ({ label: (r.sticker_id && current.get(r.sticker_id)) || r.label, emb: r.emb, scale: r.scale }))
    .filter((r) => r.label && r.label !== GENERIC_LABEL);
}

export async function addVisionMemory(userId: string, input: { stickerId: string | null; label: string; emb: string; scale: number }) {
  const label = input.label.trim().slice(0, 12);
  if (!label || label === GENERIC_LABEL) return;
  if (input.stickerId) {
    const s = await getStore().get("stickers", input.stickerId);
    if (!s || s.owner_id !== userId) throw new RuleError("見つかりません", 404);
  }
  const store = getStore();
  await store.insert("vision_memory", [
    { id: uuid(), user_id: userId, sticker_id: input.stickerId, label, emb: input.emb, scale: input.scale, created_at: now() },
  ]);
  const all = await store.find("vision_memory", { where: { user_id: userId }, order: { key: "created_at", asc: false } });
  for (const old of all.slice(MAX_MEMORY)) await store.remove("vision_memory", old.id);
}
