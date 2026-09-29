"use client";

import { getAccessToken } from "@/lib/supabase/client";
import type {
  ApiErrorBody,
  ApiErrorCode,
  StickerItem,
  LatLng,
  NewStickersInput,
  Place,
  SearchResponse,
  UserReaction,
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
  return (
    typeof v === "object" &&
    v !== null &&
    "error" in v &&
    typeof (v as ApiErrorBody).error?.code === "string"
  );
}

async function request<T>(
  url: string,
  init: RequestInit & { auth?: boolean; timeoutMs?: number } = {},
): Promise<T> {
  const { auth, timeoutMs = 45_000, headers, ...rest } = init;
  const finalHeaders = new Headers(headers);
  if (auth) {
    const token = await getAccessToken();
    if (token) finalHeaders.set("Authorization", `Bearer ${token}`);
  }

  let res: Response;
  try {
    res = await fetch(url, { ...rest, headers: finalHeaders, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === "TimeoutError";
    throw new ApiClientError(
      timedOut ? "時間がかかりすぎました" : "ネットワークにつながりません",
      "network",
      0,
    );
  }

  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    if (isApiErrorBody(body)) throw new ApiClientError(body.error.message, body.error.code, res.status);
    throw new ApiClientError(`HTTP ${res.status}`, "internal", res.status);
  }
  return body as T;
}

const jsonInit = (payload: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

export function fetchNearby(location: LatLng) {
  return request<{ places: Place[]; source: "google" | "mock" }>("/api/places/nearby", {
    ...jsonInit(location),
    timeoutMs: 15_000,
  });
}

export function interpret(query: string, origin: LatLng, places: Place[]) {
  return request<SearchResponse>("/api/interpret", {
    ...jsonInit({ query, origin, places }),
    auth: true,
    timeoutMs: 70_000,
  });
}

export function postReaction(input: {
  placeId: string;
  recommendationId: string | null;
  reaction: UserReaction;
}) {
  return request<{ id: string; createdAt: string }>("/api/reaction", {
    ...jsonInit(input),
    auth: true,
  });
}

export function postStickers(input: NewStickersInput) {
  const { photo, stickers, ...meta } = input;
  const form = new FormData();
  form.append("meta", JSON.stringify({ ...meta, rotations: stickers.map((s) => s.rotation) }));
  if (photo) form.append("photo", photo, "photo.jpg");
  stickers.forEach((s, i) => form.append(`sticker_${i}`, s.blob, `sticker_${i}.png`));
  return request<{ items: StickerItem[] }>("/api/stickers", {
    method: "POST",
    body: form,
    auth: true,
    timeoutMs: 60_000,
  });
}

export function getStickers() {
  return request<{ items: StickerItem[] }>("/api/stickers", { method: "GET", auth: true });
}

export function photoUrl(photoName: string, width = 600): string {
  return `/api/places/photo?name=${encodeURIComponent(photoName)}&w=${width}`;
}
