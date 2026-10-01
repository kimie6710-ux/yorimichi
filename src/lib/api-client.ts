"use client";

import { getAccessToken } from "@/lib/supabase/client";
import type {
  ApiErrorBody,
  ApiErrorCode,
  InboxItem,
  LatLng,
  MapSpot,
  MyHistory,
  NearPlace,
  Place,
  SpotDetail,
  Sticker,
  BookDeco,
  BookPage,
  BookDecoKind,
  BookPos,
} from "@/lib/types";

export class ApiClientError extends Error {
  constructor(
    message: string,
    readonly code: ApiErrorCode | "network",
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

function isApiErrorBody(v: unknown): v is ApiErrorBody {
  return typeof v === "object" && v !== null && "error" in v && typeof (v as ApiErrorBody).error?.code === "string";
}

const DEVICE_KEY = "yorumichi:device";
/** Random id for this browser (used when there is no Supabase account). */
export function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

async function request<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = 45_000, headers, ...rest } = init;
  const finalHeaders = new Headers(headers);
  const token = await getAccessToken();
  if (token) finalHeaders.set("Authorization", `Bearer ${token}`);
  const dev = deviceId();
  if (dev) finalHeaders.set("x-yorumichi-device", dev);

  let res: Response;
  try {
    res = await fetch(url, { ...rest, headers: finalHeaders, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === "TimeoutError";
    throw new ApiClientError(timedOut ? "時間がかかりすぎました" : "ネットワークにつながりません", "network", 0);
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    if (isApiErrorBody(body)) throw new ApiClientError(body.error.message, body.error.code, res.status);
    throw new ApiClientError(`HTTP ${res.status}`, "internal", res.status);
  }
  return body as T;
}

const post = (payload: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});
const qs = (at: LatLng | null) => (at ? `?lat=${at.latitude}&lng=${at.longitude}` : "");

export const api = {
  nearbySpots: (at: LatLng) =>
    request<{ spots: MapSpot[]; pending: Place[]; around: NearPlace[]; total: number }>("/api/spots/nearby", { ...post(at), timeoutMs: 20_000 }),
  seedSpots: (origin: LatLng, places: Place[]) =>
    request<{ spots: MapSpot[] }>("/api/spots/seed", { ...post({ origin, places }), timeoutMs: 70_000 }),
  spot: (id: string, at: LatLng | null) => request<SpotDetail>(`/api/spots/${encodeURIComponent(id)}${qs(at)}`),
  visit: (id: string, at: LatLng | null) => request<{ ok: true }>(`/api/spots/${encodeURIComponent(id)}/visit`, post(at)),
  save: (id: string, save: boolean) => request<{ ok: true }>(`/api/spots/${encodeURIComponent(id)}/save`, post({ save })),

  createStickers: (input: { spotId: string; memo: string; photo: Blob | null; items: { blob: Blob; label: string; rotation: number }[] }) => {
    const form = new FormData();
    form.append("meta", JSON.stringify({ spotId: input.spotId, memo: input.memo, items: input.items.map(({ label, rotation }) => ({ label, rotation })) }));
    if (input.photo) form.append("photo", input.photo, "photo.jpg");
    input.items.forEach((it, i) => form.append(`sticker_${i}`, it.blob, `sticker_${i}.png`));
    return request<{ items: Sticker[] }>("/api/stickers", { method: "POST", body: form, timeoutMs: 60_000 });
  },
  myStickers: () => request<{ items: Sticker[] }>("/api/stickers"),
  memo: (id: string, memo: string) =>
    request<{ sticker: Sticker }>(`/api/stickers/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ memo }) }),
  rename: (id: string, label: string) =>
    request<{ sticker: Sticker }>(`/api/stickers/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label }) }),
  decos: () => request<{ decos: BookDeco[] }>("/api/book/decos"),
  addDeco: (kind: BookDecoKind, pos: BookPos) => request<{ deco: BookDeco }>("/api/book/decos", post({ kind, pos })),
  moveDeco: (id: string, pos: BookPos) =>
    request<{ ok: true }>(`/api/book/decos/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pos }) }),
  removeDeco: (id: string) => request<{ ok: true }>(`/api/book/decos/${id}`, { method: "DELETE" }),
  bookPages: () => request<{ pages: BookPage[] }>("/api/book/pages"),
  saveBookPages: (pages: BookPage[]) =>
    request<{ ok: true }>("/api/book/pages", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pages }) }),
  place: (id: string, at: LatLng | null) => request<{ sticker: Sticker }>(`/api/stickers/${id}/place`, post(at)),
  send: (id: string) => request<{ delivered: boolean; sticker: Sticker }>(`/api/stickers/${id}/send`, { method: "POST" }),

  inbox: () => request<{ items: InboxItem[] }>("/api/inbox"),
  unread: () => request<{ unread: number }>("/api/inbox/count", { timeoutMs: 10_000 }),
  open: (id: string) => request<{ ok: true }>(`/api/inbox/${id}/open`, { method: "POST" }),
  history: () => request<MyHistory>("/api/me"),

  visionMemory: () => request<{ items: { label: string; emb: string; scale: number }[] }>("/api/vision/memory", { timeoutMs: 15_000 }),
  rememberVision: (input: { stickerId: string | null; label: string; emb: string; scale: number }) =>
    request<{ ok: true }>("/api/vision/memory", post(input)),
};

export function photoUrl(photoName: string, width = 600): string {
  return `/api/places/photo?name=${encodeURIComponent(photoName)}&w=${width}`;
}
